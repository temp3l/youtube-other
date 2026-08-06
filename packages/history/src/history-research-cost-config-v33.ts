/**
 * History V3.3 live-research cost configuration.
 *
 * Defaults target the lowest practical API cost while preserving factuality,
 * deterministic provenance, resumability, and fail-closed approval behavior.
 * Scoped to History V3.3 only — unrelated genres keep their own defaults.
 */

export interface HistoryResearchCostConfigV33 {
  readonly claimExtractionModel: string;
  readonly evidenceAssessmentModel: string;
  readonly researchQueryModel: string;
  readonly visualSemanticModel: string;
  readonly escalationModel: string;

  readonly useBatchApi: boolean;
  readonly enableEscalation: boolean;

  readonly maxWebSearchCallsPerEpisode: number;
  readonly hardMaxWebSearchCallsPerEpisode: number;
  readonly maxSearchesPerResearchCluster: number;
  readonly maxAlternateSourceAttempts: number;

  readonly maxEvidenceFragmentsPerClaim: number;
  readonly maxClaimsPerAssessmentBatch: number;
  readonly maxInputTokensPerExtractionBatch: number;
  readonly maxInputTokensPerAssessmentBatch: number;
  readonly maxOutputTokensPerExtractionBatch: number;
  readonly maxOutputTokensPerAssessmentBatch: number;

  readonly claimExtractionBatchSize: number;
  readonly escalationConfidenceThreshold: number;

  readonly reuseRetrievedSources: boolean;
  readonly resumeCompletedBatches: boolean;
  readonly enablePromptCaching: boolean;

  readonly softCostBudgetUsdPerEpisode: number;
  readonly hardCostBudgetUsdPerEpisode: number;

  readonly openaiTimeoutMs: number;
  readonly pricingCatalogPath: string | null;
}

export const HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33 = {
  claimExtractionModel: "gpt-5.6-luna",
  evidenceAssessmentModel: "gpt-5.6-luna",
  researchQueryModel: "gpt-5.6-luna",
  visualSemanticModel: "gpt-5.6-luna",
  escalationModel: "gpt-5.6-terra",

  useBatchApi: true,
  enableEscalation: true,

  maxWebSearchCallsPerEpisode: 20,
  hardMaxWebSearchCallsPerEpisode: 25,
  maxSearchesPerResearchCluster: 2,
  maxAlternateSourceAttempts: 2,

  maxEvidenceFragmentsPerClaim: 3,
  maxClaimsPerAssessmentBatch: 20,
  maxInputTokensPerExtractionBatch: 12_000,
  maxInputTokensPerAssessmentBatch: 16_000,
  maxOutputTokensPerExtractionBatch: 2_500,
  maxOutputTokensPerAssessmentBatch: 1_500,

  claimExtractionBatchSize: 12,
  escalationConfidenceThreshold: 0.45,

  reuseRetrievedSources: true,
  resumeCompletedBatches: true,
  enablePromptCaching: true,

  softCostBudgetUsdPerEpisode: 1.25,
  hardCostBudgetUsdPerEpisode: 2.5,

  openaiTimeoutMs: 600_000,
  pricingCatalogPath: null,
} as const satisfies HistoryResearchCostConfigV33;

export type HistoryResearchCostConfigEnvV33 = Partial<
  Record<keyof HistoryResearchCostConfigV33, string | undefined>
>;

const POSITIVE_INT_KEYS = [
  "maxWebSearchCallsPerEpisode",
  "hardMaxWebSearchCallsPerEpisode",
  "maxSearchesPerResearchCluster",
  "maxAlternateSourceAttempts",
  "maxEvidenceFragmentsPerClaim",
  "maxClaimsPerAssessmentBatch",
  "maxInputTokensPerExtractionBatch",
  "maxInputTokensPerAssessmentBatch",
  "maxOutputTokensPerExtractionBatch",
  "maxOutputTokensPerAssessmentBatch",
  "claimExtractionBatchSize",
  "openaiTimeoutMs",
] as const;

const NONNEGATIVE_USD_KEYS = [
  "softCostBudgetUsdPerEpisode",
  "hardCostBudgetUsdPerEpisode",
] as const;

const BOOLEAN_KEYS = [
  "useBatchApi",
  "enableEscalation",
  "reuseRetrievedSources",
  "resumeCompletedBatches",
  "enablePromptCaching",
] as const;

const MODEL_KEYS = [
  "claimExtractionModel",
  "evidenceAssessmentModel",
  "researchQueryModel",
  "visualSemanticModel",
  "escalationModel",
] as const;

export class HistoryResearchCostConfigErrorV33 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryResearchCostConfigErrorV33";
  }
}

const parseBoolean = (raw: string, key: string): boolean => {
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new HistoryResearchCostConfigErrorV33(
    `Invalid boolean for ${key}: ${raw}`
  );
};

const parsePositiveInt = (raw: string, key: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new HistoryResearchCostConfigErrorV33(
      `Invalid positive integer for ${key}: ${raw}`
    );
  return value;
};

const parseNonNegativeUsd = (raw: string, key: string): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0)
    throw new HistoryResearchCostConfigErrorV33(
      `Invalid non-negative USD amount for ${key}: ${raw}`
    );
  return value;
};

const parseUnitInterval = (raw: string, key: string): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new HistoryResearchCostConfigErrorV33(
      `Invalid unit-interval for ${key}: ${raw}`
    );
  return value;
};

/** Read History V3.3 cost env vars without logging secrets. */
export function readHistoryResearchCostConfigEnvV33(
  env: NodeJS.ProcessEnv = process.env
): HistoryResearchCostConfigEnvV33 {
  return {
    claimExtractionModel: env["HISTORY_CLAIM_EXTRACTION_MODEL"],
    evidenceAssessmentModel: env["HISTORY_EVIDENCE_ASSESSMENT_MODEL"],
    researchQueryModel: env["HISTORY_RESEARCH_QUERY_MODEL"],
    visualSemanticModel: env["HISTORY_VISUAL_SEMANTIC_MODEL"],
    escalationModel: env["HISTORY_ESCALATION_MODEL"],
    useBatchApi: env["HISTORY_USE_BATCH_API"],
    enableEscalation: env["HISTORY_ENABLE_ESCALATION"],
    maxWebSearchCallsPerEpisode: env["HISTORY_MAX_WEB_SEARCH_CALLS_PER_EPISODE"],
    hardMaxWebSearchCallsPerEpisode:
      env["HISTORY_HARD_MAX_WEB_SEARCH_CALLS_PER_EPISODE"],
    maxSearchesPerResearchCluster:
      env["HISTORY_MAX_SEARCHES_PER_RESEARCH_CLUSTER"],
    maxAlternateSourceAttempts: env["HISTORY_MAX_ALTERNATE_SOURCE_ATTEMPTS"],
    maxEvidenceFragmentsPerClaim: env["HISTORY_MAX_EVIDENCE_FRAGMENTS_PER_CLAIM"],
    maxClaimsPerAssessmentBatch: env["HISTORY_MAX_CLAIMS_PER_ASSESSMENT_BATCH"],
    maxInputTokensPerExtractionBatch:
      env["HISTORY_MAX_INPUT_TOKENS_PER_EXTRACTION_BATCH"],
    maxInputTokensPerAssessmentBatch:
      env["HISTORY_MAX_INPUT_TOKENS_PER_ASSESSMENT_BATCH"],
    maxOutputTokensPerExtractionBatch:
      env["HISTORY_MAX_OUTPUT_TOKENS_PER_EXTRACTION_BATCH"],
    maxOutputTokensPerAssessmentBatch:
      env["HISTORY_MAX_OUTPUT_TOKENS_PER_ASSESSMENT_BATCH"],
    claimExtractionBatchSize: env["HISTORY_CLAIM_EXTRACTION_BATCH_SIZE"],
    escalationConfidenceThreshold:
      env["HISTORY_ESCALATION_CONFIDENCE_THRESHOLD"],
    reuseRetrievedSources: env["HISTORY_REUSE_RETRIEVED_SOURCES"],
    resumeCompletedBatches: env["HISTORY_RESUME_COMPLETED_BATCHES"],
    enablePromptCaching: env["HISTORY_ENABLE_PROMPT_CACHING"],
    softCostBudgetUsdPerEpisode: env["HISTORY_SOFT_COST_BUDGET_USD_PER_EPISODE"],
    hardCostBudgetUsdPerEpisode: env["HISTORY_HARD_COST_BUDGET_USD_PER_EPISODE"],
    openaiTimeoutMs:
      env["HISTORY_OPENAI_TIMEOUT_MS"] ?? env["OPENAI_HISTORY_TIMEOUT_MS"],
    pricingCatalogPath: env["HISTORY_PRICING_CATALOG_PATH"],
  };
}

export function loadHistoryResearchCostConfigV33(
  overrides: Partial<HistoryResearchCostConfigV33> = {},
  env: NodeJS.ProcessEnv = process.env
): HistoryResearchCostConfigV33 {
  const fromEnv = readHistoryResearchCostConfigEnvV33(env);
  const merged: Record<string, unknown> = {
    ...HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
  };

  for (const key of MODEL_KEYS) {
    const raw = fromEnv[key];
    if (typeof raw === "string" && raw.trim()) merged[key] = raw.trim();
  }
  for (const key of BOOLEAN_KEYS) {
    const raw = fromEnv[key];
    if (typeof raw === "string" && raw.trim())
      merged[key] = parseBoolean(raw, key);
  }
  for (const key of POSITIVE_INT_KEYS) {
    const raw = fromEnv[key];
    if (typeof raw === "string" && raw.trim())
      merged[key] = parsePositiveInt(raw, key);
  }
  for (const key of NONNEGATIVE_USD_KEYS) {
    const raw = fromEnv[key];
    if (typeof raw === "string" && raw.trim())
      merged[key] = parseNonNegativeUsd(raw, key);
  }
  if (
    typeof fromEnv["escalationConfidenceThreshold"] === "string" &&
    fromEnv["escalationConfidenceThreshold"].trim()
  )
    merged["escalationConfidenceThreshold"] = parseUnitInterval(
      fromEnv["escalationConfidenceThreshold"],
      "escalationConfidenceThreshold"
    );
  if (
    typeof fromEnv["pricingCatalogPath"] === "string" &&
    fromEnv["pricingCatalogPath"].trim()
  )
    merged["pricingCatalogPath"] = fromEnv["pricingCatalogPath"].trim();

  // Legacy single-model override still maps to all Luna-role models when
  // HISTORY_* model vars are unset, preserving prior operator expectations.
  const legacyModel = env["OPENAI_HISTORY_MODEL"]?.trim();
  if (legacyModel) {
    for (const key of [
      "claimExtractionModel",
      "evidenceAssessmentModel",
      "researchQueryModel",
      "visualSemanticModel",
    ] as const) {
      const envOverride = fromEnv[key];
      if (!(typeof envOverride === "string" && envOverride.trim()))
        merged[key] = legacyModel;
    }
  }

  Object.assign(merged, overrides);
  return validateHistoryResearchCostConfigV33(
    merged as unknown as HistoryResearchCostConfigV33
  );
}

export function validateHistoryResearchCostConfigV33(
  config: HistoryResearchCostConfigV33
): HistoryResearchCostConfigV33 {
  for (const key of MODEL_KEYS) {
    if (typeof config[key] !== "string" || !config[key].trim())
      throw new HistoryResearchCostConfigErrorV33(
        `Model name ${key} must be a non-empty string.`
      );
  }
  for (const key of POSITIVE_INT_KEYS) {
    const value = config[key];
    if (!Number.isInteger(value) || value <= 0)
      throw new HistoryResearchCostConfigErrorV33(
        `${key} must be a positive integer; received ${String(value)}.`
      );
  }
  for (const key of NONNEGATIVE_USD_KEYS) {
    const value = config[key];
    if (!Number.isFinite(value) || value < 0)
      throw new HistoryResearchCostConfigErrorV33(
        `${key} must be a non-negative number; received ${String(value)}.`
      );
  }
  if (
    !Number.isFinite(config.escalationConfidenceThreshold) ||
    config.escalationConfidenceThreshold < 0 ||
    config.escalationConfidenceThreshold > 1
  )
    throw new HistoryResearchCostConfigErrorV33(
      "escalationConfidenceThreshold must be between 0 and 1 inclusive."
    );
  if (config.claimExtractionBatchSize < 12 || config.claimExtractionBatchSize > 20)
    throw new HistoryResearchCostConfigErrorV33(
      "claimExtractionBatchSize must be between 12 and 20 inclusive."
    );
  if (config.maxEvidenceFragmentsPerClaim > 3)
    throw new HistoryResearchCostConfigErrorV33(
      "maxEvidenceFragmentsPerClaim cannot exceed 3."
    );
  if (config.maxWebSearchCallsPerEpisode > config.hardMaxWebSearchCallsPerEpisode)
    throw new HistoryResearchCostConfigErrorV33(
      "maxWebSearchCallsPerEpisode (soft) must not exceed hardMaxWebSearchCallsPerEpisode."
    );
  if (config.softCostBudgetUsdPerEpisode > config.hardCostBudgetUsdPerEpisode)
    throw new HistoryResearchCostConfigErrorV33(
      "softCostBudgetUsdPerEpisode must not exceed hardCostBudgetUsdPerEpisode."
    );
  if (
    config.pricingCatalogPath !== null &&
    (typeof config.pricingCatalogPath !== "string" ||
      !config.pricingCatalogPath.trim())
  )
    throw new HistoryResearchCostConfigErrorV33(
      "pricingCatalogPath must be null or a non-empty path."
    );
  return {
    ...config,
    claimExtractionModel: config.claimExtractionModel.trim(),
    evidenceAssessmentModel: config.evidenceAssessmentModel.trim(),
    researchQueryModel: config.researchQueryModel.trim(),
    visualSemanticModel: config.visualSemanticModel.trim(),
    escalationModel: config.escalationModel.trim(),
    pricingCatalogPath: config.pricingCatalogPath?.trim() || null,
  };
}

/** Redacted effective config for CLI — never includes API keys. */
export function redactHistoryResearchCostConfigV33(
  config: HistoryResearchCostConfigV33
): HistoryResearchCostConfigV33 & {
  readonly secretsPresent: {
    readonly openAiApiKey: boolean;
    readonly openAiApiToken: boolean;
  };
} {
  return {
    ...config,
    secretsPresent: {
      openAiApiKey: Boolean(process.env["OPENAI_API_KEY"]),
      openAiApiToken: Boolean(process.env["OPENAI_API_TOKEN"]),
    },
  };
}

export function uniqueHistorySemanticModelsV33(
  config: HistoryResearchCostConfigV33
): readonly string[] {
  return [
    ...new Set([
      config.claimExtractionModel,
      config.evidenceAssessmentModel,
      config.researchQueryModel,
      config.visualSemanticModel,
      config.escalationModel,
    ]),
  ].sort((left, right) => left.localeCompare(right));
}
