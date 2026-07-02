import {
  currentExecutionTelemetry,
  estimateDurationPricing,
  type CostComputation,
} from "@mediaforge/observability";
import { z } from "zod";

export type NarrationTelemetryStage =
  | "prepare"
  | "plan"
  | "generate"
  | "validate"
  | "assemble"
  | "provider";

export interface NarrationCostEstimate {
  readonly inputCharacters: number;
  readonly outputBytes: number;
  readonly generatedSeconds: number | null;
  readonly pricing: CostComputation;
}

export interface NarrationTelemetryEvent {
  readonly episodeId?: string | undefined;
  readonly language?: string | undefined;
  readonly variant?: "full" | "short" | undefined;
  readonly chunkId?: string | undefined;
  readonly stage: NarrationTelemetryStage;
  readonly model?: string | undefined;
  readonly voice?: string | undefined;
  readonly attempt: number;
  readonly latencyMs: number;
  readonly inputCharacters: number;
  readonly outputBytes: number;
  readonly generatedSeconds?: number | undefined;
  readonly cacheDecision?: "hit" | "miss" | "stale_metadata" | "invalid_output" | "validation_failure" | "provider_failure" | undefined;
  readonly validationResult?: "passed" | "warning" | "failed" | "skipped" | undefined;
  readonly retryClass?: string | undefined;
  readonly failureClass?: string | undefined;
  readonly regeneration: boolean;
  readonly fallbackUsed: boolean;
  readonly details?: Record<string, unknown> | undefined;
}

export interface NarrationFallbackRecord {
  readonly used: boolean;
  readonly reason?: string | undefined;
  readonly fallbackModel?: string | undefined;
  readonly fallbackVoice?: string | undefined;
}

export interface NarrationTelemetryCounters {
  readonly events: number;
  readonly attempts: number;
  readonly failures: number;
  readonly retries: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly validationFailures: number;
  readonly regenerations: number;
  readonly fallbackUses: number;
  readonly inputCharacters: number;
  readonly outputBytes: number;
  readonly generatedSeconds: number;
}

const boundedStringSchema = z.string().min(1).max(200);

export const narrationTelemetryEventSchema: z.ZodType<NarrationTelemetryEvent> = z.object({
  episodeId: boundedStringSchema.optional(),
  language: boundedStringSchema.optional(),
  variant: z.enum(["full", "short"]).optional(),
  chunkId: boundedStringSchema.optional(),
  stage: z.enum(["prepare", "plan", "generate", "validate", "assemble", "provider"]),
  model: boundedStringSchema.optional(),
  voice: boundedStringSchema.optional(),
  attempt: z.number().int().positive().max(20),
  latencyMs: z.number().finite().nonnegative().max(3_600_000),
  inputCharacters: z.number().int().nonnegative().max(1_000_000),
  outputBytes: z.number().int().nonnegative().max(500_000_000),
  generatedSeconds: z.number().finite().nonnegative().max(86_400).optional(),
  cacheDecision: z.enum(["hit", "miss", "stale_metadata", "invalid_output", "validation_failure", "provider_failure"]).optional(),
  validationResult: z.enum(["passed", "warning", "failed", "skipped"]).optional(),
  retryClass: boundedStringSchema.optional(),
  failureClass: boundedStringSchema.optional(),
  regeneration: z.boolean(),
  fallbackUsed: z.boolean(),
  details: z.record(z.string().min(1).max(80), z.unknown()).optional(),
}).strict();

const secretKeyPattern = /api[-_]?key|authorization|auth[-_]?header|bearer|secret|token|password|raw[-_]?audio|story|full[-_]?text|chunk[-_]?text/i;
const maxDetailKeys = 20;
const maxStringLength = 240;
const maxArrayItems = 10;
const maxDepth = 3;

function truncate(value: string): string {
  return value.length <= maxStringLength ? value : `${value.slice(0, maxStringLength)}...`;
}

function sanitizeUnknown(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return truncate(value);
  }
  if (Array.isArray(value)) {
    if (depth >= maxDepth) {
      return "[redacted:depth]";
    }
    return value.slice(0, maxArrayItems).map((item) => sanitizeUnknown(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= maxDepth) {
      return "[redacted:depth]";
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value).slice(0, maxDetailKeys)) {
      output[key] = secretKeyPattern.test(key) ? "[redacted]" : sanitizeUnknown(child, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function redactNarrationTelemetryDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  return sanitizeUnknown(details, 0) as Record<string, unknown>;
}

export function buildNarrationCostEstimate(event: NarrationTelemetryEvent): NarrationCostEstimate {
  const telemetry = currentExecutionTelemetry();
  const pricing =
    telemetry && event.model
      ? estimateDurationPricing(telemetry.catalog, {
          provider: "openai",
          model: event.model,
          operation: "speech",
          ...(event.generatedSeconds !== undefined ? { durationSeconds: event.generatedSeconds } : {}),
        })
      : { pricingVersion: "unconfigured", costMicros: null, warning: "Missing telemetry catalog or model." };
  return {
    inputCharacters: event.inputCharacters,
    outputBytes: event.outputBytes,
    generatedSeconds: event.generatedSeconds ?? null,
    pricing,
  };
}

export function recordNarrationTelemetry(eventInput: NarrationTelemetryEvent): boolean {
  try {
    const event = narrationTelemetryEventSchema.parse({
      ...eventInput,
      details: redactNarrationTelemetryDetails(eventInput.details),
    });
    const telemetry = currentExecutionTelemetry();
    if (!telemetry) {
      return false;
    }
    const cost = buildNarrationCostEstimate(event);
    telemetry.recordEvent({
      name: "narration.telemetry",
      at: new Date().toISOString(),
      details: {
        ...event,
        costEstimate: cost,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export function buildNarrationTelemetryCounters(events: readonly NarrationTelemetryEvent[]): NarrationTelemetryCounters {
  const parsed = events.map((event) => narrationTelemetryEventSchema.parse(event));
  return {
    events: parsed.length,
    attempts: parsed.reduce((sum, event) => sum + event.attempt, 0),
    failures: parsed.filter((event) => event.failureClass !== undefined || event.cacheDecision === "provider_failure").length,
    retries: parsed.filter((event) => event.attempt > 1 || event.retryClass !== undefined).length,
    cacheHits: parsed.filter((event) => event.cacheDecision === "hit").length,
    cacheMisses: parsed.filter((event) => event.cacheDecision === "miss").length,
    validationFailures: parsed.filter((event) => event.validationResult === "failed" || event.cacheDecision === "validation_failure").length,
    regenerations: parsed.filter((event) => event.regeneration).length,
    fallbackUses: parsed.filter((event) => event.fallbackUsed).length,
    inputCharacters: parsed.reduce((sum, event) => sum + event.inputCharacters, 0),
    outputBytes: parsed.reduce((sum, event) => sum + event.outputBytes, 0),
    generatedSeconds: parsed.reduce((sum, event) => sum + (event.generatedSeconds ?? 0), 0),
  };
}
