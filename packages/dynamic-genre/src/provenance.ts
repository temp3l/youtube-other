import {
  dynamicGenreProvenanceSchema,
  type DynamicGenreOverride,
  type DynamicGenreProvenance,
  type GenreAnalysisResult,
  type ProductionBudgetTier,
  type ResolvedProductionConfig,
} from "./contracts.js";
import {
  buildDynamicGenreCacheKey,
  sha256,
  stableGenreJson,
  type GenreAnalysisCacheIdentity,
} from "./canonical-input.js";

export interface BuildDynamicGenreProvenanceInput {
  readonly inputContentHash: string;
  readonly canonicalContentRevision: string;
  readonly analyzerSchemaVersion: string;
  readonly promptVersion: string;
  readonly analyzerImplementationVersion: string;
  readonly policyVersion: string;
  readonly result: GenreAnalysisResult;
  readonly requestedOverrides: DynamicGenreOverride;
  readonly effectiveOverrides: DynamicGenreOverride;
  readonly productionConfig: ResolvedProductionConfig;
  readonly budgetTier: ProductionBudgetTier;
  readonly locale: string;
  readonly selectedBaseProfile: DynamicGenreProvenance["selectedBaseProfile"];
  readonly appliedPolicyConstraints: readonly string[];
  readonly analysisTimestamp?: string;
}
export function hashResolvedProductionConfig(
  config: ResolvedProductionConfig
): string {
  return sha256(stableGenreJson(config));
}
export function buildDynamicGenreProvenance(
  input: BuildDynamicGenreProvenanceInput
): DynamicGenreProvenance {
  const cacheIdentity: GenreAnalysisCacheIdentity = {
    canonicalContentHash: input.inputContentHash,
    analyzerSchemaVersion: input.analyzerSchemaVersion,
    promptVersion: input.promptVersion,
    policyVersion: input.policyVersion,
    budgetTier: input.budgetTier,
  };
  return dynamicGenreProvenanceSchema.parse({
    schemaVersion: "1.0",
    inputContentHash: input.inputContentHash,
    canonicalContentRevision: input.canonicalContentRevision,
    analyzerSchemaVersion: input.analyzerSchemaVersion,
    promptVersion: input.promptVersion,
    analyzerImplementationVersion: input.analyzerImplementationVersion,
    policyVersion: input.policyVersion,
    providerMetadata: input.result.providerMetadata,
    analysisTimestamp: input.analysisTimestamp ?? new Date().toISOString(),
    ...(input.result.rawStructuredResponse === undefined
      ? {}
      : { rawStructuredResponse: input.result.rawStructuredResponse }),
    parsedProfile: input.result.profile,
    validationAttempts: input.result.validationAttempts,
    confidence: input.result.profile.classification.confidence,
    warnings: input.result.warnings,
    selectedBaseProfile: input.selectedBaseProfile,
    appliedPolicyConstraints: input.appliedPolicyConstraints,
    requestedOverrides: input.requestedOverrides,
    effectiveOverrides: input.effectiveOverrides,
    resolvedProductionConfigHash: hashResolvedProductionConfig(
      input.productionConfig
    ),
    budgetTier: input.budgetTier,
    locale: input.locale,
    cacheKey: buildDynamicGenreCacheKey(cacheIdentity),
    fallbackApplied: input.result.fallbackApplied,
  });
}
