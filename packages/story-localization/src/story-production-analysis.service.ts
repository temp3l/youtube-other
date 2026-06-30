import { zodTextFormat } from "openai/helpers/zod.js";
import { createLogger, estimateTokenCostMicros } from "@mediaforge/observability";
import type { OpenAiStoryClient } from "./story-localization-openai-batch.js";
import {
  buildStoryRequestFingerprint,
  type StoryRequestFingerprintInput,
} from "./story-request-telemetry.js";
import {
  STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
  STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION,
  STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
  buildStoryProductionAnalysisPrompt,
  computeStoryProductionAnalysisFingerprint,
  computeStoryProductionAnalysisSchemaFingerprint,
  deriveStoryProductionVerdict,
  formatStoryProductionAnalysisReport,
  storyProductionAnalysisArtifactSchema,
  storyProductionAnalysisResponseSchema,
  type StoryProductionAnalysisArtifact,
} from "./story-production-analysis.js";
import {
  persistStoryProductionAnalysisArtifact,
  resolveStoryProductionAnalysisSource,
  resolveStoryProductionAnalysisStatus,
} from "./story-production-analysis.persistence.js";

export interface StoryProductionAnalysisServiceInput {
  readonly episode: string;
  readonly language: string;
  readonly format?: "full";
  readonly outputRoot: string;
  readonly force?: boolean;
  readonly refresh?: boolean;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly maxOutputTokens: number;
  readonly runtimeConfig?: {
    readonly pricingCatalogPath?: string | undefined;
  };
  readonly client: OpenAiStoryClient;
  readonly verbose?: boolean;
}

export interface StoryProductionAnalysisServiceResult {
  readonly artifact: StoryProductionAnalysisArtifact;
  readonly report: string;
  readonly exitCode: 0 | 1;
  readonly cacheStatus: StoryProductionAnalysisArtifact["cacheStatus"];
}

function normalizeUsage(response: {
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly input_tokens_details?: { readonly cached_tokens?: number };
    readonly output_tokens_details?: { readonly reasoning_tokens?: number };
    readonly total_tokens?: number;
  };
}): StoryProductionAnalysisArtifact["usage"] {
  return {
    inputTokens: response.usage?.input_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    reasoningTokens:
      response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens:
      response.usage?.total_tokens ??
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}

function buildAnalysisRequestFingerprint(args: {
  readonly episodeSlug: string;
  readonly language: string;
  readonly locale: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly maxOutputTokens: number;
  readonly promptFingerprint: string;
  readonly responseSchemaFingerprint: string;
  readonly sourceContentFingerprint: string;
  readonly sourceLineageFingerprint: string;
}): string {
  const input: StoryRequestFingerprintInput = {
    episodeSlug: args.episodeSlug,
    language: args.language as never,
    locale: args.locale,
    variant: "full",
    owner: "analysis",
    provider: "openai-compatible",
    model: args.model,
    stage: "production-analysis",
    purpose: "validation",
    promptFingerprint: args.promptFingerprint,
    responseSchemaName: "story_production_analysis",
    responseSchemaVersion: STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
    responseSchemaFingerprint: args.responseSchemaFingerprint,
    reasoningEffort: args.reasoningEffort,
    maxOutputTokens: args.maxOutputTokens,
    configurationFingerprint: args.sourceLineageFingerprint,
    storyIrHash: args.sourceContentFingerprint,
  } as StoryRequestFingerprintInput;
  return buildStoryRequestFingerprint(input);
}

export async function analyzeStoryProduction(
  input: StoryProductionAnalysisServiceInput
): Promise<StoryProductionAnalysisServiceResult> {
  if ((input.format ?? "full") !== "full") {
    throw new Error("Story production analysis supports --format full only in v1.");
  }
  const logger = createLogger(input.verbose ? "debug" : "info", process.stderr);
  const source = await resolveStoryProductionAnalysisSource({
    outputRoot: input.outputRoot,
    episodeSlug: input.episode,
    language: input.language,
    format: "full",
  });
  const cachedStatus = await resolveStoryProductionAnalysisStatus({
    outputRoot: input.outputRoot,
    episodeSlug: source.episodeSlug,
    language: source.language,
    format: source.format,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  });
  if (!input.force && cachedStatus.analysisCurrent && cachedStatus.artifact) {
    return {
      artifact: cachedStatus.artifact,
      report: formatStoryProductionAnalysisReport(cachedStatus.artifact),
      exitCode: cachedStatus.artifact.pass ? 0 : 1,
      cacheStatus: "hit",
    };
  }
  const prompt = buildStoryProductionAnalysisPrompt(source.source);
  const promptFingerprint = computeStoryProductionAnalysisFingerprint({
    sourceContentFingerprint: source.sourceContentFingerprint,
    sourceLineageFingerprint: source.sourceLineageFingerprint,
    language: source.language,
    locale: source.locale,
    format: source.format,
    sourceArtifactPath: source.sourceArtifactPath,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  });
  const responseSchemaFingerprint =
    computeStoryProductionAnalysisSchemaFingerprint();
  const analysisFingerprint = computeStoryProductionAnalysisFingerprint({
    sourceContentFingerprint: source.sourceContentFingerprint,
    sourceLineageFingerprint: source.sourceLineageFingerprint,
    language: source.language,
    locale: source.locale,
    format: source.format,
    sourceArtifactPath: source.sourceArtifactPath,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    responseSchemaFingerprint,
  });
  if (!source.lineagePresent || !source.lineageCurrent) {
    throw new Error(
      `Current source lineage could not be proven for ${source.episodeSlug} ${source.language} full.`
    );
  }
  const start = Date.now();
  const response = await input.client.responses.parse({
    model: input.model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: prompt.system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt.user }],
      },
    ],
    text: {
      format: zodTextFormat(
        storyProductionAnalysisResponseSchema,
        "story_production_analysis"
      ),
    },
    max_output_tokens: input.maxOutputTokens,
    reasoning: { effort: input.reasoningEffort as never },
  });
  if (!response.output_parsed) {
    throw new Error("OpenAI did not return a valid structured analysis.");
  }
  const validated = storyProductionAnalysisResponseSchema.parse(
    response.output_parsed
  );
  const verdict = deriveStoryProductionVerdict({
    modelResponse: validated,
    source: source.source,
    missingLineage: false,
    staleLineage: false,
    analysisFingerprintMismatch: false,
    invalidStructuredAnalysis: false,
  });
  const usage = normalizeUsage(response);
  const cost = estimateTokenCostMicros(
    input.runtimeConfig ? undefined : undefined,
    {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    }
  );
  logger.debug(
    {
      episodeSlug: source.episodeSlug,
      language: source.language,
      analysisFingerprint,
      requestFingerprint: buildAnalysisRequestFingerprint({
        episodeSlug: source.episodeSlug,
        language: source.language,
        locale: source.locale,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        maxOutputTokens: input.maxOutputTokens,
        promptFingerprint,
        responseSchemaFingerprint,
        sourceContentFingerprint: source.sourceContentFingerprint,
        sourceLineageFingerprint: source.sourceLineageFingerprint,
      }),
    },
    "story_production_analysis_request"
  );
  const now = new Date().toISOString();
  const artifact = storyProductionAnalysisArtifactSchema.parse({
    schemaVersion: STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
    episode: source.episode,
    episodeSlug: source.episodeSlug,
    language: source.language,
    locale: source.locale,
    format: source.format,
    sourceArtifactPath: source.sourceArtifactPath,
    sourceContentFingerprint: source.sourceContentFingerprint,
    sourceLineageFingerprint: source.sourceLineageFingerprint,
    analysisFingerprint,
    analysisPromptVersion: STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION,
    analysisSchemaVersion: STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
    analysisSchemaFingerprint: responseSchemaFingerprint,
    productionGateVersion: STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    createdAt:
      cachedStatus.artifact?.createdAt ?? now,
    updatedAt: now,
    openAiResponseId: response.id,
    requestDurationMs: Date.now() - start,
    retryCount: 0,
    cacheStatus: input.force
      ? "forced"
      : cachedStatus.analysisPresent
        ? "stale"
        : "miss",
    usage,
    estimatedCost:
      cost.costMicros === null ? null : cost.costMicros / 1_000_000,
    modelScores: validated.scores,
    scores: validated.scores,
    modelOverallScore: validated.overallScore,
    overallScore: verdict.overallScore,
    gateResults: verdict.gateResults,
    pass: verdict.pass,
    verdict: verdict.verdict,
    verdictReason: verdict.reason,
    modelVerdictRecommendation: validated.verdictRecommendation,
    strengths: validated.strengths,
    weaknesses: validated.weaknesses,
    blockingIssues: validated.blockingIssues,
    retentionRisks: validated.retentionRisks,
    requiredChanges: validated.requiredChanges,
    optionalImprovements: validated.optionalImprovements,
    productionAssessment: validated.productionAssessment,
  });
  await persistStoryProductionAnalysisArtifact({
    analysisPath: source.analysisPaths.analysisPath,
    artifact,
  });
  return {
    artifact,
    report: formatStoryProductionAnalysisReport(artifact),
    exitCode: artifact.pass ? 0 : 1,
    cacheStatus: artifact.cacheStatus,
  };
}
