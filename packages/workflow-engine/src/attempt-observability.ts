import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  attemptTelemetrySchema,
  type AttemptTelemetry,
} from "@mediaforge/domain";

export const ATTEMPT_OBSERVABILITY_VERSION =
  "mediaforge.attempt-observability.v1" as const;

const ALWAYS_REDACTED = new Set([
  "apikey",
  "authorization",
  "cookie",
  "cookies",
  "password",
  "secret",
  "signedurl",
  "accesstoken",
  "refreshtoken",
]);

function normalizedKey(value: string): string {
  return value.replaceAll(/[-_.]/gu, "").toLowerCase();
}

function looksLikeLargeEncodedData(value: string): boolean {
  return (
    value.length > 1_024 &&
    (/^data:[^;]+;base64,/u.test(value) || /^[a-zA-Z0-9+/=]+$/u.test(value))
  );
}

export function redactStructuredMetadata(
  value: unknown,
  redactedFields: readonly string[] = []
): unknown {
  const explicit = new Set(redactedFields.map(normalizedKey));
  const visit = (candidate: unknown): unknown => {
    if (typeof candidate === "string") {
      return looksLikeLargeEncodedData(candidate)
        ? "[REDACTED_BINARY]"
        : candidate;
    }
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (candidate === null || typeof candidate !== "object") return candidate;
    return Object.fromEntries(
      Object.entries(candidate).map(([key, item]) => [
        key,
        ALWAYS_REDACTED.has(normalizedKey(key)) ||
        explicit.has(normalizedKey(key))
          ? "[REDACTED]"
          : visit(item),
      ])
    );
  };
  return visit(value);
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(temporaryPath, filePath);
}

export class AttemptObservabilityStore {
  public constructor(private readonly root: string) {}

  public pathFor(record: Pick<AttemptTelemetry, "runId" | "id">): string {
    return path.join(this.root, record.runId, `${record.id}.telemetry.json`);
  }

  public async write(
    input: AttemptTelemetry,
    redactedFields: readonly string[] = []
  ): Promise<AttemptTelemetry> {
    const redacted = redactStructuredMetadata(input, redactedFields);
    const record = attemptTelemetrySchema.parse(redacted);
    await atomicJson(this.pathFor(record), record);
    return record;
  }

  public async read(
    runId: string,
    attemptId: string
  ): Promise<AttemptTelemetry> {
    return attemptTelemetrySchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(this.root, runId, `${attemptId}.telemetry.json`),
          "utf8"
        )
      ) as unknown
    );
  }
}
