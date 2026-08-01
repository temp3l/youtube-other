import { buildDynamicGenreCacheKey } from "./canonical-input.js";
import {
  budgetTierSchema,
  creativeBriefSchema,
  dynamicGenreOverrideSchema,
  dynamicGenreProfileSchema,
  type CreativeBrief,
  type DynamicGenreOverride,
  type DynamicGenreProfile,
  type DynamicGenreProvenance,
  type ProductionBudgetTier,
  type ResolvedDynamicGenre,
  type ResolutionWarning,
} from "./contracts.js";
import { DynamicGenreError } from "./errors.js";
import { compileResolvedProductionConfig } from "./compilers.js";
import { buildDynamicGenreProvenance } from "./provenance.js";

export interface ResolveDynamicGenreInput {
  readonly creativeBrief: CreativeBrief;
  readonly dynamicProfile: DynamicGenreProfile;
  readonly contentHash: string;
  readonly revision: string;
  readonly locale: string;
  readonly budgetTier: ProductionBudgetTier;
  readonly promptVersion: string;
  readonly analyzerImplementationVersion: string;
  readonly policyVersion: string;
  readonly providerMetadata: DynamicGenreProvenance["providerMetadata"];
  readonly validationAttempts: DynamicGenreProvenance["validationAttempts"];
  readonly analysisWarnings?: readonly ResolutionWarning[];
  readonly requestedOverrides?: DynamicGenreOverride;
  readonly operatorAuthorizedVoice?: boolean;
  readonly rawStructuredResponse?: unknown;
  readonly analysisTimestamp?: string;
  readonly fallbackApplied?: boolean;
}

export function resolveDynamicGenre(
  input: ResolveDynamicGenreInput
): ResolvedDynamicGenre {
  const brief = creativeBriefSchema.safeParse(input.creativeBrief);
  const profile = dynamicGenreProfileSchema.safeParse(input.dynamicProfile);
  const budgetTier = budgetTierSchema.safeParse(input.budgetTier);
  const overrides = dynamicGenreOverrideSchema.safeParse(
    input.requestedOverrides ?? {}
  );
  if (
    !brief.success ||
    !profile.success ||
    !budgetTier.success ||
    !overrides.success
  ) {
    throw new DynamicGenreError(
      "resolution_failure",
      "Dynamic genre resolver received invalid domain input."
    );
  }
  const compileInput = {
    profile: profile.data,
    brief: brief.data,
    locale: input.locale,
    budgetTier: budgetTier.data,
    overrides: overrides.data,
    ...(input.operatorAuthorizedVoice === undefined
      ? {}
      : { operatorAuthorizedVoice: input.operatorAuthorizedVoice }),
  };
  const result = compileResolvedProductionConfig(compileInput);
  const warnings: ResolutionWarning[] = [
    ...(input.analysisWarnings ?? []),
    ...profile.data.warnings,
    ...result.warnings,
  ];
  const appliedPolicyConstraints = [
    "system-safe-negative-v1",
    "no-model-provider-selection",
    "no-automatic-cloned-voice",
    "budget-tier-limit",
  ] as const;
  const analysisResult = {
    creativeBrief: brief.data,
    profile: profile.data,
    providerMetadata: {
      provider: input.providerMetadata.provider,
      model: input.providerMetadata.model,
      ...(input.providerMetadata.requestId === undefined
        ? {}
        : { requestId: input.providerMetadata.requestId }),
    },
    ...(input.rawStructuredResponse === undefined
      ? {}
      : { rawStructuredResponse: input.rawStructuredResponse }),
    validationAttempts: input.validationAttempts,
    fallbackApplied:
      input.fallbackApplied === true ||
      result.warnings.some(
        (item) =>
          item.code === "low-confidence-fallback" ||
          item.code === "critical-ambiguity"
      ),
    warnings,
  };
  const provenance = buildDynamicGenreProvenance({
    inputContentHash: input.contentHash,
    canonicalContentRevision: input.revision,
    analyzerSchemaVersion: profile.data.schemaVersion,
    promptVersion: input.promptVersion,
    analyzerImplementationVersion: input.analyzerImplementationVersion,
    policyVersion: input.policyVersion,
    result: analysisResult,
    requestedOverrides: overrides.data,
    effectiveOverrides: result.effectiveOverrides,
    productionConfig: result.config,
    budgetTier: budgetTier.data,
    locale: input.locale,
    selectedBaseProfile: result.config.baseProfile,
    appliedPolicyConstraints,
    ...(input.analysisTimestamp === undefined
      ? {}
      : { analysisTimestamp: input.analysisTimestamp }),
  });
  return {
    creativeBrief: brief.data,
    dynamicProfile: profile.data,
    productionConfig: result.config,
    provenance,
    warnings,
  };
}

export function createDynamicGenreCacheKey(input: {
  readonly contentHash: string;
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly policyVersion: string;
  readonly budgetTier: ProductionBudgetTier;
}): string {
  return buildDynamicGenreCacheKey({
    canonicalContentHash: input.contentHash,
    analyzerSchemaVersion: input.schemaVersion,
    promptVersion: input.promptVersion,
    policyVersion: input.policyVersion,
    budgetTier: input.budgetTier,
  });
}
