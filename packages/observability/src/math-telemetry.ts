import { createHash } from "node:crypto";
import { currentExecutionTelemetry } from "./telemetry.js";

export type MathTelemetryStage =
  | "curriculum-import"
  | "source-validation"
  | "prerequisite-graph"
  | "lesson-spec"
  | "math-verification"
  | "canonical-narration"
  | "scene-timing"
  | "localization"
  | "visual-assets"
  | "tts"
  | "timing-reflow"
  | "render"
  | "metadata-playlists"
  | "quality-gate"
  | "publish"
  | "cli"
  | "batch";

export interface MathTelemetryContext {
  readonly correlationId: string;
  readonly batchId?: string;
  readonly releaseId?: string;
  readonly releaseHash?: string;
  readonly skillId?: string;
  readonly lessonId?: string;
  readonly variant?: string;
  readonly language?: string;
  readonly stage: MathTelemetryStage;
  readonly provider?: string;
  readonly model?: string;
  readonly version?: string;
  readonly attempt: number;
  readonly durationMs?: number;
  readonly cache?: "hit" | "miss" | "write" | "skip" | "unknown";
  readonly costMicros: number | null;
}

export interface MathTelemetryEvent {
  readonly status: "success" | "failure" | "retry";
  readonly context: MathTelemetryContext;
  readonly category: string;
  readonly at: string;
  readonly warning?: string;
  readonly details?: Record<string, unknown>;
}

const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 40;
const OVERSIZE = "[TRUNCATED]";
const REDACTED = "[REDACTED]";
const BINARY = "[BINARY]";
const BASE64 = "[BASE64_REDACTED]";

const secretKeyPattern =
  /(?:api[-_]?key|authorization|cookie|cookies|token|secret|password|credential|signedurl)/iu;
const base64Pattern = /^(?:[A-Za-z0-9+/]{80,}={0,2}|data:[^,]+;base64,[A-Za-z0-9+/=]+)$/u;

export function createMathCorrelationId(input: {
  readonly releaseId?: string;
  readonly skillId?: string;
  readonly lessonId?: string;
  readonly variant?: string;
  readonly language?: string;
  readonly stage: string;
  readonly batchId?: string;
}): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24);
  return `math-${hash}`;
}

export function redactMathTelemetryValue(
  value: unknown,
  key = "",
  depth = 0
): unknown {
  if (secretKeyPattern.test(key)) return REDACTED;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return BINARY;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return BINARY;
  if (typeof value === "string") {
    if (base64Pattern.test(value)) return BASE64;
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}${OVERSIZE}`
      : value;
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  )
    return value;
  if (depth >= 4) return OVERSIZE;
  if (Array.isArray(value))
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => redactMathTelemetryValue(item, key, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(
      0,
      MAX_OBJECT_KEYS
    )) {
      output[entryKey] = redactMathTelemetryValue(
        entryValue,
        entryKey,
        depth + 1
      );
    }
    if (Object.keys(value).length > MAX_OBJECT_KEYS) output["truncated"] = true;
    return output;
  }
  return String(value);
}

export function normalizeMathTelemetryContext(
  context: Omit<MathTelemetryContext, "attempt" | "costMicros"> &
    Partial<Pick<MathTelemetryContext, "attempt" | "costMicros">>
): MathTelemetryContext {
  const normalized = {
    ...context,
    attempt: context.attempt ?? 1,
    costMicros: context.costMicros ?? null,
  };
  return normalized;
}

export function recordMathTelemetryEvent(event: MathTelemetryEvent): void {
  const telemetry = currentExecutionTelemetry();
  const redactedDetails = event.details
    ? (redactMathTelemetryValue(event.details) as Record<string, unknown>)
    : undefined;
  telemetry?.recordEvent({
    name: `math.${event.context.stage}.${event.status}`,
    at: event.at,
    details: {
      context: event.context,
      category: event.category,
      ...(event.warning ? { warning: event.warning } : {}),
      ...(redactedDetails ? { details: redactedDetails } : {}),
    },
  });
  if (event.context.costMicros === null) {
    telemetry?.recordWarning(
      `Unknown math cost for ${event.context.stage}; recorded as null.`
    );
  }
}

export function recordMathStageEvent(options: {
  readonly status: MathTelemetryEvent["status"];
  readonly context: Omit<MathTelemetryContext, "attempt" | "costMicros"> &
    Partial<Pick<MathTelemetryContext, "attempt" | "costMicros">>;
  readonly category?: string;
  readonly details?: Record<string, unknown>;
  readonly warning?: string;
  readonly at?: string;
}): MathTelemetryEvent {
  const event: MathTelemetryEvent = {
    status: options.status,
    context: normalizeMathTelemetryContext(options.context),
    category: options.category ?? "ok",
    at: options.at ?? new Date().toISOString(),
    ...(options.warning ? { warning: options.warning } : {}),
    ...(options.details ? { details: options.details } : {}),
  };
  recordMathTelemetryEvent(event);
  return event;
}
