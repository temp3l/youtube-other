import { zodTextFormat } from "openai/helpers/zod.js";
import {
  createLogger,
  estimateTokenCostMicros,
} from "@mediaforge/observability";
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
  STORY_PRODUCTION_ANALYSIS_V2_ADVISORY_GATE_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_MODE,
  STORY_PRODUCTION_ANALYSIS_V2_PROMPT_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_RESPONSE_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_RUBRIC_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION,
  STORY_PRODUCTION_ANALYSIS_V2_WEIGHTS_VERSION,
  buildStoryProductionAnalysisPrompt,
  buildStoryProductionAnalysisV2EvidenceSummary,
  buildStoryProductionAnalysisV2Prompt,
  computeStoryProductionAnalysisFingerprint,
  computeStoryProductionAnalysisSchemaFingerprint,
  computeStoryProductionAnalysisV2Fingerprint,
  computeStoryProductionAnalysisV2QualitativeScore,
  computeStoryProductionAnalysisV2SchemaFingerprint,
  computeStoryProductionAnalysisV2StructuredResponseFingerprint,
  deriveStoryProductionAnalysisV2AdvisoryVerdict,
  deriveStoryProductionVerdict,
  deriveStoryProductionV2Verdict,
  formatStoryProductionAnalysisReport,
  parseStoryProductionAnalysisV2Response,
  storyProductionAnalysisArtifactSchema,
  storyProductionAnalysisResponseSchema,
  storyProductionAnalysisV2ArtifactSchema,
  storyProductionAnalysisV2ResponseSchema,
  type StoryProductionAnalysisArtifact,
  type StoryProductionAnalysisFormat,
  type StoryProductionAnalysisVersion,
} from "./story-production-analysis.js";
import {
  STORY_AFFECT_REPAIR_PROMPT_VERSION,
  STORY_AFFECT_REPAIR_ROUTING_VERSION,
} from "./story-generation-contracts.js";
import {
  persistStoryProductionAnalysisArtifact,
  resolveStoryProductionAnalysisSource,
  resolveStoryProductionAnalysisStatus,
} from "./story-production-analysis.persistence.js";

export interface StoryProductionAnalysisServiceInput {
  readonly episode: string;
  readonly language: string;
  readonly format?: StoryProductionAnalysisFormat;
  readonly outputRoot: string;
  readonly force?: boolean;
  readonly refresh?: boolean;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly maxOutputTokens: number;
  readonly analysisVersion?: StoryProductionAnalysisVersion;
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
      (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0),
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
  readonly responseSchemaVersion: string;
  readonly sourceContentFingerprint: string;
  readonly sourceLineageFingerprint: string;
  readonly format: StoryProductionAnalysisFormat;
}): string {
  const input: StoryRequestFingerprintInput = {
    episodeSlug: args.episodeSlug,
    language: args.language as never,
    locale: args.locale,
    variant: args.format,
    owner: "analysis",
    provider: "openai-compatible",
    model: args.model,
    stage: "production-analysis",
    purpose: "validation",
    promptFingerprint: args.promptFingerprint,
    responseSchemaName: "story_production_analysis",
    responseSchemaVersion: args.responseSchemaVersion,
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
  const format = input.format ?? "full";
  const analysisVersion = input.analysisVersion ?? "v1";
  const isV2 = analysisVersion === "v2";
  const logger = createLogger(input.verbose ? "debug" : "info", process.stderr);
  const source = await resolveStoryProductionAnalysisSource({
    outputRoot: input.outputRoot,
    episodeSlug: input.episode,
    language: input.language,
    format,
  });
  const cachedStatus = await resolveStoryProductionAnalysisStatus({
    outputRoot: input.outputRoot,
    episodeSlug: source.episodeSlug,
    language: source.language,
    format: source.format,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    analysisVersion,
  });
  if (!input.force && cachedStatus.analysisCurrent && cachedStatus.artifact) {
    return {
      artifact: cachedStatus.artifact,
      report: formatStoryProductionAnalysisReport(cachedStatus.artifact),
      exitCode: cachedStatus.artifact.pass ? 0 : 1,
      cacheStatus: "hit",
    };
  }
  const prompt = isV2
    ? buildStoryProductionAnalysisV2Prompt(source.source)
    : buildStoryProductionAnalysisPrompt(source.source);
  const responseSchemaFingerprint = isV2
    ? computeStoryProductionAnalysisV2SchemaFingerprint()
    : computeStoryProductionAnalysisSchemaFingerprint();
  const fingerprintInput = {
    sourceContentFingerprint: source.sourceContentFingerprint,
    sourceLineageFingerprint: source.sourceLineageFingerprint,
    language: source.language,
    locale: source.locale,
    format: source.format,
    sourceArtifactPath: source.sourceArtifactPath,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  } as const;
  const promptFingerprint = isV2
    ? computeStoryProductionAnalysisV2Fingerprint({
        ...fingerprintInput,
        affectPlanHash: source.source.affectReferenceIndex?.planHash ?? null,
      })
    : computeStoryProductionAnalysisFingerprint(fingerprintInput);
  const analysisFingerprint = isV2
    ? computeStoryProductionAnalysisV2Fingerprint({
        ...fingerprintInput,
        responseSchemaFingerprint,
        affectPlanHash: source.source.affectReferenceIndex?.planHash ?? null,
      })
    : computeStoryProductionAnalysisFingerprint({
        ...fingerprintInput,
        responseSchemaFingerprint,
      });
  if (!source.lineagePresent || !source.lineageCurrent) {
    throw new Error(
      `Current source lineage could not be proven for ${source.episodeSlug} ${source.language} ${source.format}.`
    );
  }
  if (isV2 && !source.deterministicContractResult.pass) {
    const failure = source.deterministicContractResult.failedChecks[0];
    throw new Error(
      `Deterministic story contract failed before V2 analysis: ${failure?.id ?? "unknown"}: ${failure?.reason ?? "unknown failure"}.`
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
        isV2
          ? storyProductionAnalysisV2ResponseSchema
          : storyProductionAnalysisResponseSchema,
        isV2 ? "story_production_analysis_v2" : "story_production_analysis"
      ),
    },
    max_output_tokens: input.maxOutputTokens,
    reasoning: { effort: input.reasoningEffort as never },
  });
  if (!response.output_parsed) {
    throw new Error("OpenAI did not return a valid structured analysis.");
  }
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
        responseSchemaVersion: isV2
          ? STORY_PRODUCTION_ANALYSIS_V2_RESPONSE_SCHEMA_VERSION
          : STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
        sourceContentFingerprint: source.sourceContentFingerprint,
        sourceLineageFingerprint: source.sourceLineageFingerprint,
        format: source.format,
      }),
    },
    "story_production_analysis_request"
  );
  const now = new Date().toISOString();
  const artifactBase = {
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
    createdAt: cachedStatus.artifact?.createdAt ?? now,
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
  } as const;
  if (isV2) {
    const validated = parseStoryProductionAnalysisV2Response(
      response.output_parsed,
      source.source
    );
    const verdict = deriveStoryProductionV2Verdict({
      modelResponse: validated,
      source: source.source,
      deterministicContractResult: source.deterministicContractResult,
      missingLineage: false,
      staleLineage: false,
      analysisFingerprintMismatch: false,
      invalidStructuredAnalysis: false,
    });
    const qualitativeOverallScore =
      computeStoryProductionAnalysisV2QualitativeScore(
        validated.qualitativeDimensions
      );
    const artifact = storyProductionAnalysisV2ArtifactSchema.parse({
      ...artifactBase,
      schemaVersion: STORY_PRODUCTION_ANALYSIS_V2_SCHEMA_VERSION,
      analysisPromptVersion: STORY_PRODUCTION_ANALYSIS_V2_PROMPT_VERSION,
      analysisSchemaVersion:
        STORY_PRODUCTION_ANALYSIS_V2_RESPONSE_SCHEMA_VERSION,
      analysisRubricVersion: STORY_PRODUCTION_ANALYSIS_V2_RUBRIC_VERSION,
      analysisWeightsVersion: STORY_PRODUCTION_ANALYSIS_V2_WEIGHTS_VERSION,
      advisoryGateVersion: STORY_PRODUCTION_ANALYSIS_V2_ADVISORY_GATE_VERSION,
      analysisMode: STORY_PRODUCTION_ANALYSIS_V2_MODE,
      structuredResponseFingerprint:
        computeStoryProductionAnalysisV2StructuredResponseFingerprint({
          response: validated,
          deterministicContractResult: source.deterministicContractResult,
          paragraphCount: source.source.paragraphCount,
          affectPlanHash: source.source.affectReferenceIndex?.planHash ?? null,
        }),
      deterministicContractResults: source.deterministicContractResult,
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
      qualitativeDimensions: validated.qualitativeDimensions,
      qualitativeOverallScore,
      qualitativeVerdict: deriveStoryProductionAnalysisV2AdvisoryVerdict(
        qualitativeOverallScore
      ),
      evidenceSummary: buildStoryProductionAnalysisV2EvidenceSummary(validated),
      affectPlanHash: source.source.affectReferenceIndex?.planHash ?? null,
      affectRepairRoutingVersion: STORY_AFFECT_REPAIR_ROUTING_VERSION,
      affectRepairPromptVersion: STORY_AFFECT_REPAIR_PROMPT_VERSION,
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
  const artifact = storyProductionAnalysisArtifactSchema.parse({
    ...artifactBase,
    schemaVersion: STORY_PRODUCTION_ANALYSIS_SCHEMA_VERSION,
    analysisPromptVersion: STORY_PRODUCTION_ANALYSIS_PROMPT_VERSION,
    analysisSchemaVersion: STORY_PRODUCTION_ANALYSIS_RESPONSE_SCHEMA_VERSION,
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
