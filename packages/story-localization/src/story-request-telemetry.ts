import { hashText } from "@mediaforge/shared";
import { stableSerialize } from "./stable-json.js";
import { type LanguageCode, type ModelPricing } from "./story-localization.types.js";

export type StoryTelemetryStage =
  | "canonical-full"
  | "localized-full"
  | "canonical-short"
  | "localized-short"
  | "full-repair"
  | "short-repair"
  | "semantic-validation"
  | "metadata"
  | "audio-instructions"
  | "tts"
  | "image-generation"
  | "render"
  | "publication";

export type StoryTelemetryStatus =
  | "success"
  | "failed"
  | "incomplete"
  | "blocked"
  | "skipped"
  | "reused";

export interface StoryRequestFingerprintParent {
  readonly kind: "canonical-english-full" | "localized-full" | "canonical-short";
  readonly language: LanguageCode;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly fingerprint?: string | undefined;
  readonly sourceHash?: string | undefined;
  readonly storyIrHash?: string | undefined;
  readonly contractHash?: string | undefined;
  readonly shortContractHash?: string | undefined;
}

interface StoryRequestFingerprintCommon {
  readonly episodeSlug: string;
  readonly language: LanguageCode;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly owner: "narration" | "metadata" | "audio" | "scene-plan" | "image-plan" | "render" | "publication";
  readonly provider: string;
  readonly model: string;
  readonly stage: StoryTelemetryStage;
  readonly purpose:
    | "initial-generation"
    | "localization"
    | "repair"
    | "validation"
    | "metadata"
    | "audio-instructions"
    | "tts"
    | "image-generation"
    | "render"
    | "publication";
  readonly promptCompilerVersion?: string | undefined;
  readonly promptFingerprint?: string | undefined;
  readonly promptModuleFingerprints?: readonly string[] | undefined;
  readonly responseSchemaName?: string | undefined;
  readonly responseSchemaVersion?: string | undefined;
  readonly responseSchemaFingerprint?: string | undefined;
  readonly reasoningEffort?: string | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly configurationFingerprint?: string | undefined;
  readonly storyIrHash?: string | undefined;
  readonly fullContractHash?: string | undefined;
  readonly fullContractVersion?: string | undefined;
  readonly shortContractHash?: string | undefined;
  readonly shortContractVersion?: string | undefined;
  readonly repairRoute?: string | undefined;
  readonly repairScope?: string | undefined;
  readonly attemptSemantics?: string | undefined;
  readonly targetWordRange?: {
    readonly min: number;
    readonly max: number;
  };
  readonly targetDurationSeconds?: {
    readonly min: number;
    readonly max: number;
  };
}

export type StoryRequestFingerprintInput =
  | (StoryRequestFingerprintCommon & {
      readonly stage: "canonical-full";
      readonly purpose: "initial-generation";
      readonly variant: "full";
      readonly owner: "narration";
      readonly fullContractHash: string;
      readonly fullContractVersion: string;
      readonly storyIrHash: string;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "localized-full";
      readonly purpose: "localization";
      readonly variant: "full";
      readonly owner: "narration";
      readonly fullContractHash: string;
      readonly fullContractVersion: string;
      readonly storyIrHash: string;
      readonly parent: StoryRequestFingerprintParent & {
        readonly kind: "canonical-english-full";
        readonly fingerprint: string;
      };
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "canonical-short" | "localized-short";
      readonly purpose: "initial-generation" | "localization";
      readonly variant: "short";
      readonly owner: "narration";
      readonly shortContractHash: string;
      readonly shortContractVersion: string;
      readonly storyIrHash: string;
      readonly parent: StoryRequestFingerprintParent & {
        readonly variant: "full";
      };
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "full-repair" | "short-repair";
      readonly purpose: "repair";
      readonly owner: "narration";
      readonly repairRoute: string;
      readonly repairScope: string;
      readonly attemptSemantics: string;
      readonly parent?: StoryRequestFingerprintParent | undefined;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "semantic-validation";
      readonly purpose: "validation";
      readonly owner: "narration";
      readonly parent?: StoryRequestFingerprintParent | undefined;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "metadata";
      readonly purpose: "metadata";
      readonly owner: "metadata";
      readonly parent: StoryRequestFingerprintParent & {
        readonly fingerprint: string;
      };
      readonly configurationFingerprint: string;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "audio-instructions" | "tts";
      readonly purpose: "audio-instructions" | "tts";
      readonly owner: "audio";
      readonly parent: StoryRequestFingerprintParent & {
        readonly fingerprint: string;
      };
      readonly configurationFingerprint: string;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "image-generation";
      readonly purpose: "image-generation";
      readonly owner: "scene-plan" | "image-plan";
      readonly parent: StoryRequestFingerprintParent & {
        readonly fingerprint: string;
      };
      readonly configurationFingerprint: string;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "render";
      readonly purpose: "render";
      readonly owner: "render";
      readonly parent: StoryRequestFingerprintParent & {
        readonly fingerprint: string;
      };
      readonly configurationFingerprint: string;
    })
  | (StoryRequestFingerprintCommon & {
      readonly stage: "publication";
      readonly purpose: "publication";
      readonly owner: "publication";
      readonly configurationFingerprint: string;
      readonly parent: StoryRequestFingerprintParent & {
        readonly fingerprint: string;
      };
    });

function normalizeFingerprintInput(
  input: StoryRequestFingerprintInput
): Record<string, unknown> {
  return {
    episodeSlug: input.episodeSlug,
    language: input.language,
    locale: input.locale,
    variant: input.variant,
    owner: input.owner,
    provider: input.provider,
    model: input.model,
    stage: input.stage,
    purpose: input.purpose,
    ...(input.promptCompilerVersion
      ? { promptCompilerVersion: input.promptCompilerVersion }
      : {}),
    ...(input.promptFingerprint ? { promptFingerprint: input.promptFingerprint } : {}),
    ...(input.promptModuleFingerprints
      ? { promptModuleFingerprints: [...input.promptModuleFingerprints].sort() }
      : {}),
    ...(input.responseSchemaName ? { responseSchemaName: input.responseSchemaName } : {}),
    ...(input.responseSchemaVersion
      ? { responseSchemaVersion: input.responseSchemaVersion }
      : {}),
    ...(input.responseSchemaFingerprint
      ? { responseSchemaFingerprint: input.responseSchemaFingerprint }
      : {}),
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.maxOutputTokens !== undefined
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(input.configurationFingerprint
      ? { configurationFingerprint: input.configurationFingerprint }
      : {}),
    ...(input.storyIrHash ? { storyIrHash: input.storyIrHash } : {}),
    ...(input.fullContractHash ? { fullContractHash: input.fullContractHash } : {}),
    ...(input.fullContractVersion
      ? { fullContractVersion: input.fullContractVersion }
      : {}),
    ...(input.shortContractHash
      ? { shortContractHash: input.shortContractHash }
      : {}),
    ...(input.shortContractVersion
      ? { shortContractVersion: input.shortContractVersion }
      : {}),
    ...(input.repairRoute ? { repairRoute: input.repairRoute } : {}),
    ...(input.repairScope ? { repairScope: input.repairScope } : {}),
    ...(input.attemptSemantics ? { attemptSemantics: input.attemptSemantics } : {}),
    ...(input.targetWordRange ? { targetWordRange: input.targetWordRange } : {}),
    ...(input.targetDurationSeconds
      ? { targetDurationSeconds: input.targetDurationSeconds }
      : {}),
  };
}

export function buildStoryRequestFingerprint(
  input: StoryRequestFingerprintInput
): string {
  const parent =
    "parent" in input && input.parent
      ? {
          kind: input.parent.kind,
          language: input.parent.language,
          locale: input.parent.locale,
          variant: input.parent.variant,
          ...(input.parent.fingerprint ? { fingerprint: input.parent.fingerprint } : {}),
          ...(input.parent.sourceHash ? { sourceHash: input.parent.sourceHash } : {}),
          ...(input.parent.storyIrHash
            ? { storyIrHash: input.parent.storyIrHash }
            : {}),
          ...(input.parent.contractHash
            ? { contractHash: input.parent.contractHash }
            : {}),
          ...(input.parent.shortContractHash
            ? { shortContractHash: input.parent.shortContractHash }
            : {}),
        }
      : undefined;
  return hashText(
    stableSerialize({
      fingerprintVersion: "story-request-fingerprint-v1",
      request: {
        ...normalizeFingerprintInput(input),
        ...(parent ? { parent } : {}),
      },
    })
  );
}

export interface NormalizedUsageRecord {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
}

export interface NormalizedCostRecord extends NormalizedUsageRecord {
  readonly provider: string;
  readonly model: string;
  readonly pricingSource: string;
  readonly estimatedInputCostUsd: number | null;
  readonly estimatedCachedInputCostUsd: number | null;
  readonly estimatedOutputCostUsd: number | null;
  readonly totalEstimatedCostUsd: number | null;
  readonly amountKind: "estimated" | "provider-reported" | "unavailable";
}

export function normalizeStoryCostRecord(args: {
  readonly provider: string;
  readonly model: string;
  readonly pricing?: ModelPricing | undefined;
  readonly usage?: NormalizedUsageRecord;
  readonly providerReportedCostUsd?: number | null | undefined;
}): NormalizedCostRecord {
  const usage = args.usage ?? {};
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = usage.cachedInputTokens;
  const outputTokens = usage.outputTokens;
  const reasoningTokens = usage.reasoningTokens;
  const totalTokens =
    usage.totalTokens ??
    [inputTokens, outputTokens, reasoningTokens]
      .filter((value): value is number => value !== undefined)
      .reduce((sum, value) => sum + value, 0);
  if (args.providerReportedCostUsd !== undefined && args.providerReportedCostUsd !== null) {
    return {
      provider: args.provider,
      model: args.model,
      pricingSource: `${args.provider}:${args.model}:provider-reported`,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
      ...(usage.totalTokens !== undefined || totalTokens > 0 ? { totalTokens } : {}),
      estimatedInputCostUsd: null,
      estimatedCachedInputCostUsd: null,
      estimatedOutputCostUsd: null,
      totalEstimatedCostUsd: args.providerReportedCostUsd,
      amountKind: "provider-reported",
    };
  }
  if (!args.pricing || (inputTokens === undefined && cachedInputTokens === undefined && outputTokens === undefined)) {
    return {
      provider: args.provider,
      model: args.model,
      pricingSource: `${args.provider}:${args.model}:${args.pricing ? "partial-pricing" : "missing-pricing"}`,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
      ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
      estimatedInputCostUsd: null,
      estimatedCachedInputCostUsd: null,
      estimatedOutputCostUsd: null,
      totalEstimatedCostUsd: null,
      amountKind: "unavailable",
    };
  }
  const regularInputTokens = Math.max(
    0,
    (inputTokens ?? 0) - (cachedInputTokens ?? 0)
  );
  const estimatedInputCostUsd =
    (regularInputTokens / 1_000_000) * args.pricing.inputUsdPerMillionTokens;
  const estimatedCachedInputCostUsd =
    args.pricing.cachedInputUsdPerMillionTokens === undefined ||
    cachedInputTokens === undefined
      ? null
      : (cachedInputTokens / 1_000_000) *
        args.pricing.cachedInputUsdPerMillionTokens;
  const estimatedOutputCostUsd =
    outputTokens === undefined
      ? null
      : (outputTokens / 1_000_000) * args.pricing.outputUsdPerMillionTokens;
  const totalEstimatedCostUsd =
    estimatedOutputCostUsd === null
      ? null
      : estimatedInputCostUsd + (estimatedCachedInputCostUsd ?? 0) + estimatedOutputCostUsd;
  return {
    provider: args.provider,
    model: args.model,
    pricingSource: `${args.provider}:${args.model}:story-localization-pricing`,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(usage.totalTokens !== undefined || totalTokens > 0 ? { totalTokens } : {}),
    estimatedInputCostUsd,
    estimatedCachedInputCostUsd,
    estimatedOutputCostUsd,
    totalEstimatedCostUsd,
    amountKind: totalEstimatedCostUsd === null ? "unavailable" : "estimated",
  };
}

export interface StoryTelemetryAttempt {
  readonly episodeSlug: string;
  readonly language: LanguageCode;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly owner: StoryRequestFingerprintInput["owner"];
  readonly stage: StoryTelemetryStage;
  readonly status: StoryTelemetryStatus;
  readonly provider: string;
  readonly model: string;
  readonly requestFingerprint?: string;
  readonly repair: boolean;
  readonly retryCount: number;
  readonly duplicateSuppressionCount?: number;
  readonly failureReason?: string;
  readonly cost: NormalizedCostRecord;
}

export interface StoryTelemetryAggregate {
  readonly key: string;
  readonly episodeSlug: string;
  readonly language: LanguageCode;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly owner: StoryRequestFingerprintInput["owner"];
  readonly stage: StoryTelemetryStage;
  readonly provider: string;
  readonly model: string;
  readonly status: StoryTelemetryStatus;
  readonly repair: boolean;
  readonly failureReason?: string;
  readonly totalCalls: number;
  readonly successfulCalls: number;
  readonly failedCalls: number;
  readonly incompleteCalls: number;
  readonly blockedPreflightAttempts: number;
  readonly skippedOrReusedCalls: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly unknownCostCount: number;
  readonly retryCount: number;
  readonly duplicateSuppressionCount: number;
}

export function aggregateStoryTelemetryAttempts(
  attempts: readonly StoryTelemetryAttempt[]
): readonly StoryTelemetryAggregate[] {
  type MutableAggregate = {
    -readonly [K in keyof StoryTelemetryAggregate]: StoryTelemetryAggregate[K];
  };
  const aggregates = new Map<string, MutableAggregate>();
  for (const attempt of attempts) {
    const key = stableSerialize({
      episodeSlug: attempt.episodeSlug,
      language: attempt.language,
      locale: attempt.locale,
      variant: attempt.variant,
      owner: attempt.owner,
      stage: attempt.stage,
      provider: attempt.provider,
      model: attempt.model,
      status: attempt.status,
      repair: attempt.repair,
      failureReason: attempt.failureReason ?? null,
    });
    const current =
      aggregates.get(key) ??
      ({
        key,
        episodeSlug: attempt.episodeSlug,
        language: attempt.language,
        locale: attempt.locale,
        variant: attempt.variant,
        owner: attempt.owner,
        stage: attempt.stage,
        provider: attempt.provider,
        model: attempt.model,
        status: attempt.status,
        repair: attempt.repair,
        ...(attempt.failureReason ? { failureReason: attempt.failureReason } : {}),
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        incompleteCalls: 0,
        blockedPreflightAttempts: 0,
        skippedOrReusedCalls: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        unknownCostCount: 0,
        retryCount: 0,
        duplicateSuppressionCount: 0,
      } satisfies MutableAggregate);
    current.totalCalls += 1;
    current.successfulCalls += attempt.status === "success" ? 1 : 0;
    current.failedCalls += attempt.status === "failed" ? 1 : 0;
    current.incompleteCalls += attempt.status === "incomplete" ? 1 : 0;
    current.blockedPreflightAttempts += attempt.status === "blocked" ? 1 : 0;
    current.skippedOrReusedCalls +=
      attempt.status === "skipped" || attempt.status === "reused" ? 1 : 0;
    current.inputTokens += attempt.cost.inputTokens ?? 0;
    current.cachedInputTokens += attempt.cost.cachedInputTokens ?? 0;
    current.outputTokens += attempt.cost.outputTokens ?? 0;
    current.estimatedCostUsd += attempt.cost.totalEstimatedCostUsd ?? 0;
    current.unknownCostCount += attempt.cost.totalEstimatedCostUsd === null ? 1 : 0;
    current.retryCount += attempt.retryCount;
    current.duplicateSuppressionCount += attempt.duplicateSuppressionCount ?? 0;
    aggregates.set(key, current);
  }
  return [...aggregates.values()].sort((left, right) => left.key.localeCompare(right.key));
}
