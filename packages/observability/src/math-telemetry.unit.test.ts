import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import type { BufferEncoding } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createLogger } from "./index.js";
import {
  createExecutionTelemetry,
  withExecutionTelemetry,
} from "./telemetry.js";
import {
  createMathCorrelationId,
  recordMathStageEvent,
  redactMathTelemetryValue,
} from "./math-telemetry.js";

class NullStream extends Writable {
  public _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

describe("math telemetry", () => {
  it("records complete bounded context and null-cost warnings", async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "math-obs-"));
    const telemetry = createExecutionTelemetry({
      context: {
        executionId: "math-exec",
        command: "math",
        argv: [],
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
      },
      logger: createLogger("silent", new NullStream()),
      reportDir,
    });
    const correlationId = createMathCorrelationId({
      batchId: "batch-1",
      releaseId: "de-gems-5-10-v1",
      skillId: "M5-ZO-001",
      lessonId: "M5-ZO-001-standard",
      variant: "standard",
      language: "de",
      stage: "math-verification",
    });
    await withExecutionTelemetry(telemetry, async () => {
      recordMathStageEvent({
        status: "retry",
        category: "provider-timeout",
        context: {
          correlationId,
          batchId: "batch-1",
          releaseId: "de-gems-5-10-v1",
          releaseHash: "a".repeat(64),
          skillId: "M5-ZO-001",
          lessonId: "M5-ZO-001-standard",
          variant: "standard",
          language: "de",
          stage: "math-verification",
          provider: "local",
          model: "sympy",
          version: "3.0.0",
          attempt: 2,
          durationMs: 42,
          cache: "miss",
          costMicros: null,
        },
        details: { requestHash: "b".repeat(64) },
      });
    });
    const report = await telemetry.finalize({ success: true });
    expect(report.warnings).toContain(
      "Unknown math cost for math-verification; recorded as null."
    );
    expect(report.events[0]).toMatchObject({
      name: "math.math-verification.retry",
      details: {
        category: "provider-timeout",
        context: {
          correlationId,
          skillId: "M5-ZO-001",
          language: "de",
          attempt: 2,
          costMicros: null,
        },
      },
    });
  });

  it("redacts secrets, headers, Base64, binary, and oversize payloads", () => {
    const redacted = redactMathTelemetryValue({
      apiKey: "sk-test",
      authorization: "Bearer token",
      cookie: "session=abc",
      accessToken: "token",
      image: Buffer.from("binary"),
      inlineSvg:
        "data:image/png;base64," + "a".repeat(120),
      payload: "not base64 ".repeat(80),
      nested: { response: "ok" },
    }) as Record<string, unknown>;
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.cookie).toBe("[REDACTED]");
    expect(redacted.accessToken).toBe("[REDACTED]");
    expect(redacted.image).toBe("[BINARY]");
    expect(redacted.inlineSvg).toBe("[BASE64_REDACTED]");
    expect(String(redacted.payload)).toContain("[TRUNCATED]");
    expect(redacted.nested).toEqual({ response: "ok" });
  });

  it("returns minimal events when no debug sink is active", () => {
    const event = recordMathStageEvent({
      status: "failure",
      category: "validation",
      context: {
        correlationId: "math-minimal",
        stage: "batch",
        costMicros: null,
      },
      details: { authorization: "Bearer token" },
    });
    expect(event.context.correlationId).toBe("math-minimal");
    expect(event.category).toBe("validation");
  });
});
