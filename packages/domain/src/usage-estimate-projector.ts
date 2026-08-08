import {
  USAGE_QUOTA_SCHEMA_VERSION,
  type CacheReuseEffect,
  type EstimateBasis,
  type EstimateConfidence,
  type UsageDimension,
  type UsageEstimate,
  usageEstimateSchema,
} from "./usage-quota-contracts.js";

export function projectUsageEstimate(input: {
  readonly dimension: UsageDimension;
  readonly estimatedUnits: number;
  readonly cacheHitExpected: boolean;
  readonly providerFreeFixture?: boolean;
  readonly projectedAt: string;
}): UsageEstimate {
  let basis: EstimateBasis = "model_profile";
  let cacheReuseEffect: CacheReuseEffect = "none";
  let billableUnits = input.estimatedUnits;
  let externalCostMinor = input.estimatedUnits;

  if (input.providerFreeFixture) {
    basis = "provider_free_fixture";
    cacheReuseEffect = "full_reuse";
    billableUnits = 0;
    externalCostMinor = 0;
  } else if (input.cacheHitExpected) {
    basis = "cache_reuse";
    cacheReuseEffect = "full_reuse";
    billableUnits = 0;
    externalCostMinor = 0;
  }

  const confidence: EstimateConfidence = input.providerFreeFixture
    ? "authoritative"
    : "advisory";

  return usageEstimateSchema.parse({
    schemaVersion: USAGE_QUOTA_SCHEMA_VERSION,
    dimension: input.dimension,
    estimatedUnits: input.estimatedUnits,
    billableUnits,
    basis,
    confidence,
    cacheReuseEffect,
    externalCostMinor,
    projectedAt: input.projectedAt,
  });
}

export function projectQuotaDimensionStatus(input: {
  readonly dimension: UsageDimension;
  readonly limitUnits: number;
  readonly reservedUnits: number;
  readonly settledUnits: number;
  readonly enforcement: "hard" | "soft";
}): {
  readonly dimension: UsageDimension;
  readonly limitUnits: number;
  readonly reservedUnits: number;
  readonly settledUnits: number;
  readonly availableUnits: number;
  readonly enforcement: "hard" | "soft";
} {
  const committed = input.reservedUnits + input.settledUnits;
  const availableUnits = Math.max(0, input.limitUnits - committed);
  return {
    dimension: input.dimension,
    limitUnits: input.limitUnits,
    reservedUnits: input.reservedUnits,
    settledUnits: input.settledUnits,
    availableUnits,
    enforcement: input.enforcement,
  };
}
