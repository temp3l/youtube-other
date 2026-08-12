import fs from "node:fs/promises";
import path from "node:path";
import { loadRuntimeConfig } from "@mediaforge/config";
import { createOpenAiStoryClientWithOptions } from "@mediaforge/story-localization";
import {
  requireOpenAiResponsesPolicy,
  serializeOpenAIError,
  writeOpenAIDebugLog,
} from "@mediaforge/shared";
import {
  FileSourceGroundedVisualQaCache,
  FixtureEpisodeSequenceJudge,
  FixtureSemanticRemediationAdvisor,
  SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
  SourceGroundedQaTransportError,
  episodeSequenceJudgementSchema,
  globalSourceGroundedQaScheduler,
  semanticRemediationDirectiveSchema,
  sourceGroundedQaExecutionPolicy,
  sourceGroundedSceneJudgementSchema,
  sourceGroundedVisualBeatJudgementSchema,
  type EpisodeSequenceJudgePort,
  type SemanticRemediationAdvisorPort,
  type SourceGroundedModelTier,
  type SourceGroundedProviderResult,
  type SourceGroundedBatchProviderResult,
  type SourceGroundedSceneJudgePort,
  type SourceGroundedVisualQaPolicy,
  type SourceGroundedQaExecutionProfile,
  type SourceGroundedQaExecutionPolicy,
} from "@mediaforge/strategic-reinvention";

const OPENAI_QA_MODEL_PRICING: NonNullable<
  SourceGroundedQaExecutionPolicy["modelPricing"]
> = {
  "gpt-5.4-mini": {
    inputUsdPerMillionTokens: 0.75,
    outputUsdPerMillionTokens: 4.5,
  },
  "gpt-5.6-sol": {
    inputUsdPerMillionTokens: 5,
    outputUsdPerMillionTokens: 30,
  },
  "gpt-5.6-terra": {
    inputUsdPerMillionTokens: 2,
    outputUsdPerMillionTokens: 12,
  },
};

export const FINAL_SEQUENCE_ADJUDICATION_MAX_OUTPUT_TOKENS = 3_000;

export interface VeronicaPaidOpenAiQaAuthorization {
  readonly maxProviderCalls: number;
  readonly maxEstimatedCostUsd: number;
  readonly maxFlagshipCallsPerPack: number;
  readonly maxEstimatedInputTokens?: number;
  readonly maxEstimatedOutputTokens?: number;
}

export const VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS = {
  short: {
    // Two scene batches, two beat batches, one bounded escalation batch, and
    // sequence adjudication must all fit one admitted Short run.
    maxProviderCalls: 6,
    maxEstimatedCostUsd: 0.4,
    maxFlagshipCallsPerPack: 1,
    maxEstimatedInputTokens: 60_000,
    maxEstimatedOutputTokens: 20_000,
  },
  full: {
    maxProviderCalls: 10,
    maxEstimatedCostUsd: 0.6,
    maxFlagshipCallsPerPack: 1,
    maxEstimatedInputTokens: 150_000,
    maxEstimatedOutputTokens: 40_000,
  },
} as const satisfies Readonly<
  Record<"short" | "full", VeronicaPaidOpenAiQaAuthorization>
>;

interface OpenAiQaResponse {
  readonly id?: string;
  readonly output_text?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly input_tokens_details?: { readonly cached_tokens?: number };
  };
}

interface OpenAiQaClient {
  readonly responses: {
    create(
      request: Record<string, unknown>,
      options?: { readonly signal?: AbortSignal }
    ): Promise<OpenAiQaResponse>;
  };
}

function parseOutput(response: OpenAiQaResponse): SourceGroundedProviderResult {
  let output: unknown = response.output_text;
  try {
    output = JSON.parse(response.output_text ?? "null") as unknown;
  } catch {
    // The application schema rejects the unparsed output and fails closed.
  }
  return {
    output,
    ...(response.id ? { requestId: response.id } : {}),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
    },
  };
}

function reasoning(model: SourceGroundedModelTier): Record<string, unknown> {
  return { reasoning: { effort: model.reasoningEffort } };
}

function batchSchema(input: {
  readonly itemIds: readonly string[];
  readonly valueSchema: unknown;
}): unknown {
  return {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        minItems: input.itemIds.length,
        maxItems: input.itemIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["itemId", "value"],
          properties: {
            itemId: { type: "string", enum: [...input.itemIds] },
            value: input.valueSchema,
          },
        },
      },
    },
  };
}

export class OpenAiSourceGroundedVisualQaAdapter
  implements
    SourceGroundedSceneJudgePort,
    SemanticRemediationAdvisorPort,
    EpisodeSequenceJudgePort
{
  constructor(
    private readonly client: OpenAiQaClient,
    private readonly timeoutMs = 120_000,
    private readonly episodeRoot?: string
  ) {}

  private async call(input: {
    readonly model: SourceGroundedModelTier;
    readonly instructions: string;
    readonly payload: unknown;
    readonly jsonSchema: unknown;
    readonly schemaName: string;
    readonly operation: string;
    readonly cachePolicy: Parameters<
      SourceGroundedSceneJudgePort["judge"]
    >[0]["cachePolicy"];
    readonly execution: Parameters<
      SourceGroundedSceneJudgePort["judge"]
    >[0]["execution"];
    readonly signal?: AbortSignal;
  }): Promise<SourceGroundedProviderResult> {
    if (input.execution.transport === "BATCH") {
      throw new SourceGroundedQaTransportError(
        "The Veronica QA adapter does not submit interactive remediation loops through Batch; use the synchronous profiles or a dedicated offline batch importer.",
        false
      );
    }
    const request = {
      model: input.model.model,
      ...reasoning(input.model),
      max_output_tokens: input.model.maxOutputTokens ?? 800,
      ...(input.execution.serviceTier
        ? { service_tier: input.execution.serviceTier }
        : {}),
      ...(input.cachePolicy.enabled && input.cachePolicy.key
        ? { prompt_cache_key: input.cachePolicy.key }
        : {}),
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: input.instructions }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify(input.payload) },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      },
    };
    const startedAt = Date.now();
    if (this.episodeRoot) {
      await writeOpenAIDebugLog({
        episodeRoot: this.episodeRoot,
        operation: input.operation,
        mode: "real",
        paidProviderCalled: false,
        model: input.model.model,
        endpoint: "/v1/responses",
        request,
        durationMs: 0,
        status: "pre-dispatch",
        caller: {
          file: "apps/cli/src/veronica-source-grounded-visual-qa-composition.ts",
          function: "OpenAiSourceGroundedVisualQaAdapter.call",
          stage: input.schemaName,
        },
      }).catch(() => undefined);
    }
    try {
      const response = await this.client.responses.create(
        request,
        {
          signal: input.signal
            ? AbortSignal.any([
                input.signal,
                AbortSignal.timeout(this.timeoutMs),
              ])
            : AbortSignal.timeout(this.timeoutMs),
        }
      );
      if (this.episodeRoot) {
        await writeOpenAIDebugLog({
          episodeRoot: this.episodeRoot,
          operation: input.operation,
          mode: "real",
          paidProviderCalled: true,
          model: input.model.model,
          endpoint: "/v1/responses",
          request,
          response,
          usage: parseOutput(response).usage,
          durationMs: Date.now() - startedAt,
          status: "success",
          caller: {
            file: "apps/cli/src/veronica-source-grounded-visual-qa-composition.ts",
            function: "OpenAiSourceGroundedVisualQaAdapter.call",
            stage: input.schemaName,
          },
        }).catch(() => undefined);
      }
      return parseOutput(response);
    } catch (error) {
      if (this.episodeRoot) {
        await writeOpenAIDebugLog({
          episodeRoot: this.episodeRoot,
          operation: input.operation,
          mode: "real",
          paidProviderCalled: true,
          model: input.model.model,
          endpoint: "/v1/responses",
          request,
          error: serializeOpenAIError(error),
          durationMs: Date.now() - startedAt,
          status: "error",
          caller: {
            file: "apps/cli/src/veronica-source-grounded-visual-qa-composition.ts",
            function: "OpenAiSourceGroundedVisualQaAdapter.call",
            stage: input.schemaName,
          },
        }).catch(() => undefined);
      }
      const candidate = error as {
        readonly status?: number;
        readonly headers?: Headers | Readonly<Record<string, string>>;
        readonly message?: string;
      };
      const retryAfterRaw =
        candidate.headers instanceof Headers
          ? candidate.headers.get("retry-after")
          : candidate.headers?.["retry-after"];
      const retryAfterSeconds = retryAfterRaw
        ? Number.parseFloat(retryAfterRaw)
        : Number.NaN;
      const retryable =
        candidate.status === 408 ||
        candidate.status === 409 ||
        candidate.status === 429 ||
        (candidate.status !== undefined && candidate.status >= 500);
      throw new SourceGroundedQaTransportError(
        candidate.message ?? "OpenAI QA request failed.",
        retryable,
        candidate.status === 429 || Number.isFinite(retryAfterSeconds)
          ? {
              ...(Number.isFinite(retryAfterSeconds)
                ? { retryAfterMs: Math.ceil(retryAfterSeconds * 1_000) }
                : {}),
            }
          : undefined
      );
    }
  }

  private async callBatch(input: {
    readonly model: SourceGroundedModelTier;
    readonly instructions: string;
    readonly items: readonly { readonly itemId: string; readonly payload: unknown }[];
    readonly valueSchema: unknown;
    readonly schemaName: string;
    readonly operation: string;
    readonly cachePolicy: Parameters<
      SourceGroundedSceneJudgePort["judge"]
    >[0]["cachePolicy"];
    readonly execution: Parameters<
      SourceGroundedSceneJudgePort["judge"]
    >[0]["execution"];
    readonly signal?: AbortSignal;
  }): Promise<SourceGroundedBatchProviderResult> {
    const result = await this.call({
      model: {
        ...input.model,
        maxOutputTokens:
          (input.model.maxOutputTokens ?? 800) * input.items.length,
      },
      instructions: input.instructions,
      payload: { items: input.items },
      jsonSchema: batchSchema({
        itemIds: input.items.map((item) => item.itemId),
        valueSchema: input.valueSchema,
      }),
      schemaName: input.schemaName,
      operation: input.operation,
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const output = result.output as {
      readonly results?: readonly {
        readonly itemId?: unknown;
        readonly value?: unknown;
      }[];
    };
    if (!Array.isArray(output?.results)) {
      throw new SourceGroundedQaTransportError(
        "OpenAI QA batch returned malformed structured output.",
        false
      );
    }
    return {
      outputs: output.results.map((entry) => ({
        itemId: String(entry.itemId ?? ""),
        output: entry.value,
      })),
      ...(result.requestId ? { requestId: result.requestId } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.rateLimit ? { rateLimit: result.rateLimit } : {}),
    };
  }

  judge(input: Parameters<SourceGroundedSceneJudgePort["judge"]>[0]) {
    const {
      sceneId: _sceneId,
      episodeId: _episodeId,
      ...semanticPayload
    } = input.payload;
    const beatAware = input.instructionVersion === SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION;
    return this.call({
      model: input.model,
      instructions: input.instructions,
      payload: semanticPayload,
      jsonSchema: input.jsonSchema,
      schemaName: beatAware
        ? "veronica_source_grounded_visual_beat_judgement"
        : "veronica_source_grounded_scene_judgement",
      operation: beatAware
        ? "source-grounded-visual-beat-judge"
        : "source-grounded-scene-judge",
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  judgeBatch(
    input: Parameters<NonNullable<SourceGroundedSceneJudgePort["judgeBatch"]>>[0]
  ) {
    const beatAware = input.instructionVersion === SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION;
    return this.callBatch({
      model: input.model,
      instructions: input.instructions,
      items: input.items.map(({ itemId, payload }) => {
        const {
          sceneId: _sceneId,
          episodeId: _episodeId,
          ...semanticPayload
        } = payload;
        return { itemId, payload: semanticPayload };
      }),
      valueSchema: input.jsonSchema,
      schemaName: beatAware
        ? "veronica_source_grounded_visual_beat_judgement_batch"
        : "veronica_source_grounded_scene_judgement_batch",
      operation: beatAware
        ? "source-grounded-visual-beat-judge-batch"
        : "source-grounded-scene-judge-batch",
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  advise(input: Parameters<SemanticRemediationAdvisorPort["advise"]>[0]) {
    return this.call({
      model: input.model,
      instructions: input.instructions,
      payload: input.payload,
      jsonSchema: input.jsonSchema,
      schemaName: "veronica_source_grounded_remediation_directive",
      operation: "source-grounded-remediation-advisor",
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  adviseBatch(
    input: Parameters<
      NonNullable<SemanticRemediationAdvisorPort["adviseBatch"]>
    >[0]
  ) {
    return this.callBatch({
      model: input.model,
      instructions: input.instructions,
      items: input.items,
      valueSchema: input.jsonSchema,
      schemaName: "veronica_source_grounded_remediation_directive_batch",
      operation: "source-grounded-remediation-advisor-batch",
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  judgeSequence(
    input: Parameters<EpisodeSequenceJudgePort["judgeSequence"]>[0]
  ) {
    return this.call({
      model: input.model,
      instructions: input.instructions,
      payload: { scenes: input.scenes },
      jsonSchema: input.jsonSchema,
      schemaName: "veronica_source_grounded_sequence_judgement",
      operation: "source-grounded-sequence-judge",
      cachePolicy: input.cachePolicy,
      execution: input.execution,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }
}

interface FixtureDocument {
  readonly scenes: Readonly<Record<string, unknown>>;
  readonly escalations?: Readonly<Record<string, unknown>>;
  readonly beats?: Readonly<Record<string, unknown>>;
  readonly beatEscalations?: Readonly<Record<string, unknown>>;
  readonly remediation?: Readonly<Record<string, unknown>>;
  readonly sequence: unknown;
}

function fixtureJudge(input: {
  readonly scenes: Readonly<Record<string, unknown>>;
  readonly beats: Readonly<Record<string, unknown>>;
  readonly label: string;
}): SourceGroundedSceneJudgePort {
  const outputFor = (
    payload: Parameters<SourceGroundedSceneJudgePort["judge"]>[0]["payload"],
    instructionVersion: string
  ) => {
    const beatId = "beatId" in payload && typeof payload.beatId === "string"
      ? payload.beatId
      : null;
    const output = instructionVersion === SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION
      ? beatId ? input.beats[beatId] : undefined
      : input.scenes[payload.sceneId];
    if (!output) {
      throw new Error(
        `Missing ${beatId ? "beat" : "scene"} fixture: ${beatId ?? payload.sceneId}`
      );
    }
    return output;
  };
  return {
    async judge(request) {
      return {
        output: outputFor(request.payload, request.instructionVersion),
        requestId: `fixture-${input.label}-single`,
      };
    },
    async judgeBatch(request) {
      return {
        outputs: request.items.map((item) => ({
          itemId: item.itemId,
          output: outputFor(item.payload, request.instructionVersion),
        })),
        requestId: `fixture-${input.label}-batch`,
      };
    },
  };
}

function sourceGroundedProgressReporter() {
  let nextReport = 1;
  let previousCompleted = 0;
  return (progress: {
    readonly completed: number;
    readonly total: number;
    readonly cached: number;
    readonly api: number;
    readonly inFlight: number;
    readonly review: number;
    readonly transportFailures: number;
    readonly providerCallsReserved: number;
    readonly estimatedCostUsd: number;
    readonly budgetStatus: "CACHE_ONLY" | "WITHIN_BUDGET" | "EXHAUSTED";
  }) => {
    if (progress.completed <= previousCompleted) nextReport = 1;
    previousCompleted = progress.completed;
    const interval = Math.max(1, Math.ceil(progress.total / 8));
    if (
      progress.completed < nextReport &&
      progress.completed !== progress.total
    )
      return;
    nextReport = progress.completed + interval;
    process.stderr.write(
      `Source-grounded QA: ${progress.completed}/${progress.total} complete | ${progress.cached} cached | ${progress.api} API | ${progress.inFlight} in flight | ${progress.review} review | ${progress.transportFailures} transport failures | ${progress.providerCallsReserved} calls reserved | $${progress.estimatedCostUsd.toFixed(4)} estimated | ${progress.budgetStatus}\n`
    );
  };
}

async function fixtureComposition(input: {
  readonly episodeDir: string;
  readonly fixturePath: string;
  readonly executionProfile: SourceGroundedQaExecutionProfile;
  readonly maxAutomaticRemediationRounds?: 1 | 2;
}) {
  const document = JSON.parse(
    await fs.readFile(path.resolve(input.fixturePath), "utf8")
  ) as FixtureDocument;
  const scenes = Object.fromEntries(
    Object.entries(document.scenes).map(([key, value]) => [
      key,
      sourceGroundedSceneJudgementSchema.parse(value),
    ])
  );
  const escalations = Object.fromEntries(
    Object.entries(document.escalations ?? document.scenes).map(
      ([key, value]) => [key, sourceGroundedSceneJudgementSchema.parse(value)]
    )
  );
  const beats = Object.fromEntries(
    Object.entries(document.beats ?? {}).map(([key, value]) => [
      key,
      sourceGroundedVisualBeatJudgementSchema.parse(value),
    ])
  );
  const beatEscalations = Object.fromEntries(
    Object.entries(document.beatEscalations ?? document.beats ?? {}).map(
      ([key, value]) => [
        key,
        sourceGroundedVisualBeatJudgementSchema.parse(value),
      ]
    )
  );
  const remediation = Object.fromEntries(
    Object.entries(document.remediation ?? {}).map(([key, value]) => [
      key,
      semanticRemediationDirectiveSchema.parse(value),
    ])
  );
  const policy: SourceGroundedVisualQaPolicy = {
    enabled: true,
    policyIdentity: "veronica-source-grounded-fixture-policy.v1",
    sceneJudge: { model: "fixture-scene-primary", reasoningEffort: "low" },
    escalation: {
      model: "fixture-scene-escalation",
      reasoningEffort: "medium",
    },
    remediationAdvisor: {
      model: "fixture-remediation",
      reasoningEffort: "medium",
    },
    sequenceJudge: { model: "fixture-sequence", reasoningEffort: "low" },
    maxRemediationRounds: input.maxAutomaticRemediationRounds ?? 1,
    remediateReview: true,
    execution: sourceGroundedQaExecutionPolicy(input.executionProfile, {
      providerMode: "FIXTURE",
    }),
  };
  return {
    policy,
    primaryJudge: fixtureJudge({ scenes, beats, label: "primary" }),
    escalationJudge: fixtureJudge({
      scenes: escalations,
      beats: beatEscalations,
      label: "escalation",
    }),
    ...(Object.keys(remediation).length > 0
      ? {
          remediationAdvisor: new FixtureSemanticRemediationAdvisor(
            remediation
          ),
        }
      : {}),
    sequenceJudge: new FixtureEpisodeSequenceJudge(
      episodeSequenceJudgementSchema.parse(document.sequence)
    ),
    cache: new FileSourceGroundedVisualQaCache(
      path.join(input.episodeDir, ".cache", "source-grounded-visual-qa")
    ),
    scheduler: globalSourceGroundedQaScheduler,
    onProgress: sourceGroundedProgressReporter(),
  };
}

export async function createVeronicaSourceGroundedVisualQaComposition(input: {
  readonly workspaceRoot: string;
  readonly episodeDir: string;
  readonly fixturePath?: string;
  readonly executionProfile?: SourceGroundedQaExecutionProfile;
  readonly paidOpenAiQa?: VeronicaPaidOpenAiQaAuthorization;
  readonly maxAutomaticRemediationRounds?: 1 | 2;
}) {
  const executionProfile = input.executionProfile ?? "INTERACTIVE";
  if (input.fixturePath)
    return fixtureComposition({
      episodeDir: input.episodeDir,
      fixturePath: input.fixturePath,
      executionProfile,
      ...(input.maxAutomaticRemediationRounds
        ? {
            maxAutomaticRemediationRounds:
              input.maxAutomaticRemediationRounds,
          }
        : {}),
    });
  const runtime = await loadRuntimeConfig({
    workspaceDir: input.workspaceRoot,
  });
  const scenePolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-visual-qa-scene"]);
  const sequencePolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-visual-qa-sequence"]);
  const escalationPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-visual-qa-escalation"]);
  const remediationPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-visual-qa-remediation"]);
  const finalPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-visual-qa-final-adjudication"]);
  const execution = sourceGroundedQaExecutionPolicy(executionProfile, {
    providerMode: input.paidOpenAiQa ? "LIVE_AUTHORIZED" : "CACHE_ONLY",
    promptPrefixCaching: runtime.openAiPromptCacheMode !== "disabled",
    modelPricing: OPENAI_QA_MODEL_PRICING,
    ...(input.paidOpenAiQa
      ? {
          budget: {
            authorizationId: `veronica-paid-qa:${path.resolve(input.episodeDir)}:${Date.now()}`,
            ...input.paidOpenAiQa,
          },
        }
      : {}),
  });
  const policy: SourceGroundedVisualQaPolicy = {
    enabled: true,
    policyIdentity: `veronica-source-grounded-openai-policy.v3:${scenePolicy.model}:${scenePolicy.reasoning}:${escalationPolicy.model}:${escalationPolicy.reasoning}:${finalPolicy.model}:${finalPolicy.reasoning}`,
    sceneJudge: {
      model: scenePolicy.model,
      reasoningEffort: scenePolicy.reasoning,
      maxOutputTokens: Math.min(
        runtime.openAiValidatorMaxOutputTokens ?? 800,
        800
      ),
    },
    escalation: {
      model: escalationPolicy.model,
      reasoningEffort: escalationPolicy.reasoning,
      // Medium reasoning consumes the Responses output budget. Live
      // verification showed deterministic truncation at 1,000 tokens.
      maxOutputTokens: Math.min(
        runtime.openAiStoryMaxOutputTokens ?? 1_800,
        1_800
      ),
    },
    remediationAdvisor: {
      model: remediationPolicy.model,
      reasoningEffort: remediationPolicy.reasoning,
      maxOutputTokens: Math.min(
        runtime.openAiStoryMaxOutputTokens ?? 1_200,
        1_200
      ),
    },
    sequenceJudge: {
      model: sequencePolicy.model,
      reasoningEffort: sequencePolicy.reasoning,
      maxOutputTokens: Math.min(
        runtime.openAiValidatorMaxOutputTokens ?? 1_000,
        1_000
      ),
    },
    finalAdjudication: {
      model: finalPolicy.model,
      reasoningEffort: finalPolicy.reasoning,
      maxOutputTokens: Math.min(runtime.openAiStoryMaxOutputTokens ?? 1_200, 1_200),
    },
    finalSequenceAdjudication: {
      model: finalPolicy.model,
      reasoningEffort: finalPolicy.reasoning,
      maxOutputTokens: FINAL_SEQUENCE_ADJUDICATION_MAX_OUTPUT_TOKENS,
    },
    maxRemediationRounds: input.maxAutomaticRemediationRounds ?? 1,
    remediateReview: true,
    execution,
  };
  const adapter = new OpenAiSourceGroundedVisualQaAdapter(
    createOpenAiStoryClientWithOptions({
      apiKey: runtime.openAiCompatibleApiKey ?? undefined,
      baseUrl: runtime.openAiCompatibleBaseUrl ?? undefined,
      // The global QA scheduler exclusively owns retries and budgets every attempt.
      maxRetries: 0,
    }) as OpenAiQaClient,
    120_000,
    input.episodeDir
  );
  return {
    policy,
    primaryJudge: adapter,
    escalationJudge: adapter,
    finalJudge: adapter,
    remediationAdvisor: adapter,
    sequenceJudge: adapter,
    cache: new FileSourceGroundedVisualQaCache(
      path.join(input.episodeDir, ".cache", "source-grounded-visual-qa")
    ),
    scheduler: globalSourceGroundedQaScheduler,
    onProgress: sourceGroundedProgressReporter(),
  };
}
