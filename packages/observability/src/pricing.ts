import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export type MoneyMicros = number;

export interface TokenPricing {
  readonly inputTokensMicros?: MoneyMicros;
  readonly cachedInputTokensMicros?: MoneyMicros;
  readonly outputTokensMicros?: MoneyMicros;
  readonly audioInputMicros?: MoneyMicros;
  readonly audioOutputMicros?: MoneyMicros;
}

export interface ImagePricing {
  readonly generateBySizeQualityMicros?: Readonly<Record<string, MoneyMicros>>;
  readonly editBySizeQualityMicros?: Readonly<Record<string, MoneyMicros>>;
  readonly requestMicros?: MoneyMicros;
}

export interface DurationPricing {
  readonly microsPerSecond?: MoneyMicros;
  readonly requestMicros?: MoneyMicros;
}

export interface ModelPricing {
  readonly token?: TokenPricing;
  readonly image?: ImagePricing;
  readonly transcription?: DurationPricing;
  readonly speech?: DurationPricing;
  readonly fixedRequestMicros?: MoneyMicros;
}

export interface ProviderPricing {
  readonly models: Readonly<Record<string, ModelPricing>>;
}

export interface PricingCatalog {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly providers: Readonly<Record<string, ProviderPricing>>;
}

export interface CostComputation {
  readonly pricingVersion: string;
  readonly costMicros: MoneyMicros | null;
  readonly warning: string | undefined;
}

const catalogSchema = z.object({
  version: z.string().min(1),
  effectiveFrom: z.string().min(1),
  providers: z.record(
    z.string(),
    z.object({
      models: z.record(
        z.string(),
        z.object({
          token: z
            .object({
              inputTokensMicros: z.number().int().nonnegative().optional(),
              cachedInputTokensMicros: z.number().int().nonnegative().optional(),
              outputTokensMicros: z.number().int().nonnegative().optional(),
              audioInputMicros: z.number().int().nonnegative().optional(),
              audioOutputMicros: z.number().int().nonnegative().optional(),
            })
            .optional(),
          image: z
            .object({
              generateBySizeQualityMicros: z.record(
                z.string(),
                z.number().int().nonnegative()
              ).optional(),
              editBySizeQualityMicros: z.record(
                z.string(),
                z.number().int().nonnegative()
              ).optional(),
              requestMicros: z.number().int().nonnegative().optional(),
            })
            .optional(),
          transcription: z
            .object({
              microsPerSecond: z.number().int().nonnegative().optional(),
              requestMicros: z.number().int().nonnegative().optional(),
            })
            .optional(),
          speech: z
            .object({
              microsPerSecond: z.number().int().nonnegative().optional(),
              requestMicros: z.number().int().nonnegative().optional(),
            })
            .optional(),
          fixedRequestMicros: z.number().int().nonnegative().optional(),
        })
      ),
    })
  ),
});

const emptyCatalog: PricingCatalog = {
  version: "unconfigured",
  effectiveFrom: new Date().toISOString(),
  providers: {},
};

export const defaultPricingCatalog: PricingCatalog = emptyCatalog;

export function loadPricingCatalogFromObject(value: unknown): PricingCatalog {
  return catalogSchema.parse(value) as PricingCatalog;
}

export async function loadPricingCatalog(
  filePath?: string
): Promise<PricingCatalog> {
  if (!filePath) {
    return defaultPricingCatalog;
  }
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return loadPricingCatalogFromObject(JSON.parse(raw) as unknown);
}

function asFiniteMicros(value: number | undefined): MoneyMicros | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

export function estimateTokenCostMicros(
  pricing: TokenPricing | undefined,
  usage: {
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens?: number;
    readonly audioInputTokens?: number;
    readonly audioOutputTokens?: number;
  }
): CostComputation {
  if (!pricing) {
    return {
      pricingVersion: "unconfigured",
      costMicros: null,
      warning: "Missing token pricing.",
    };
  }
  let total = 0;
  let available = false;
  const add = (unitPrice: number | undefined, quantity: number | undefined) => {
    if (unitPrice === undefined || quantity === undefined) {
      return;
    }
    available = true;
    total += Math.trunc(unitPrice * quantity);
  };
  add(pricing.inputTokensMicros, usage.inputTokens);
  add(pricing.cachedInputTokensMicros, usage.cachedInputTokens);
  add(pricing.outputTokensMicros, usage.outputTokens);
  add(pricing.audioInputMicros, usage.audioInputTokens);
  add(pricing.audioOutputMicros, usage.audioOutputTokens);
  return {
    pricingVersion: "configured",
    costMicros: available ? asFiniteMicros(total) : null,
    warning: available ? undefined : "No matching token pricing entry.",
  };
}

export function estimateDurationCostMicros(
  pricing: DurationPricing | undefined,
  durationSeconds: number | undefined
): CostComputation {
  if (!pricing || durationSeconds === undefined) {
    return {
      pricingVersion: "unconfigured",
      costMicros: null,
      warning: "Missing duration pricing or duration data.",
    };
  }
  const requestMicros = pricing.requestMicros ?? 0;
  const rate = pricing.microsPerSecond;
  if (rate === undefined) {
    return {
      pricingVersion: "configured",
      costMicros: null,
      warning: "Missing per-second pricing entry.",
    };
  }
  return {
    pricingVersion: "configured",
    costMicros: asFiniteMicros(requestMicros + rate * durationSeconds),
    warning: undefined,
  };
}

export function estimateFixedRequestCostMicros(
  pricing: MoneyMicros | undefined
): CostComputation {
  if (pricing === undefined) {
    return {
      pricingVersion: "unconfigured",
      costMicros: null,
      warning: "Missing fixed request pricing.",
    };
  }
  return {
    pricingVersion: "configured",
    costMicros: asFiniteMicros(pricing),
    warning: undefined,
  };
}

export function estimateImageCostMicros(
  pricing: ImagePricing | undefined,
  request: {
    readonly operation: "generate" | "edit";
    readonly size: string;
    readonly quality: string;
  }
): CostComputation {
  if (!pricing) {
    return {
      pricingVersion: "unconfigured",
      costMicros: null,
      warning: "Missing image pricing.",
    };
  }
  const byKey =
    request.operation === "edit"
      ? pricing.editBySizeQualityMicros
      : pricing.generateBySizeQualityMicros;
  const lookupKey = `${request.size}|${request.quality}`;
  const costMicros = byKey?.[lookupKey];
  if (costMicros === undefined) {
    return {
      pricingVersion: "configured",
      costMicros: null,
      warning: `No image pricing entry for ${lookupKey}.`,
    };
  }
  const fixed = pricing.requestMicros ?? 0;
  return {
    pricingVersion: "configured",
    costMicros: asFiniteMicros(fixed + costMicros),
    warning: undefined,
  };
}
