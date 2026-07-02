import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import {
  createExecutionTelemetry,
  createLogger,
  withExecutionTelemetry,
} from "@mediaforge/observability";
import { describe, expect, it, vi } from "vitest";
import {
  buildNarrationTelemetryCounters,
  narrationTelemetryEventSchema,
  recordNarrationTelemetry,
  redactNarrationTelemetryDetails,
  type NarrationTelemetryEvent,
} from "./narration-telemetry.js";

class NullStream extends Writable {
  public _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }
}

function event(overrides: Partial<NarrationTelemetryEvent> = {}): NarrationTelemetryEvent {
  return {
    episodeId: "001-test",
    language: "en",
    variant: "full",
    chunkId: "narr-chunk-001",
    stage: "generate",
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    attempt: 1,
    latencyMs: 42,
    inputCharacters: 120,
    outputBytes: 24_000,
    generatedSeconds: 1.5,
    cacheDecision: "miss",
    validationResult: "passed",
    regeneration: false,
    fallbackUsed: false,
    ...overrides,
  };
}

describe("narration telemetry", () => {
  it("redacts secret-like and excessive detail fields", () => {
    const redacted = redactNarrationTelemetryDetails({
      apiKey: "sk-secret",
      authorization: "Bearer token",
      chunkText: "Do not log this narration text.",
      nested: {
        password: "hidden",
        harmless: "x".repeat(300),
      },
    });

    expect(redacted).toMatchObject({
      apiKey: "[redacted]",
      authorization: "[redacted]",
      chunkText: "[redacted]",
      nested: {
        password: "[redacted]",
      },
    });
    expect(String((redacted?.nested as Record<string, unknown>).harmless).length).toBeLessThanOrEqual(243);
  });

  it("rejects invalid event fields", () => {
    expect(() => narrationTelemetryEventSchema.parse(event({ attempt: 0 }))).toThrow();
    expect(() =>
      narrationTelemetryEventSchema.parse({
        ...event(),
        stage: "upload",
      })
    ).toThrow();
  });

  it("does not throw when the telemetry sink fails", async () => {
    const telemetry = createExecutionTelemetry({
      context: {
        executionId: "exec-test",
        command: "test",
        argv: [],
        cwd: process.cwd(),
        startedAt: "2026-07-02T10:00:00.000Z",
      },
      logger: createLogger("silent", new NullStream()),
      reportDir: path.join(os.tmpdir(), "narration-telemetry-test"),
    });
    vi.spyOn(telemetry, "recordEvent").mockImplementation(() => {
      throw new Error("sink failed");
    });

    await expect(
      withExecutionTelemetry(telemetry, async () => recordNarrationTelemetry(event()))
    ).resolves.toBe(false);
  });

  it("builds bounded counters from validated events", () => {
    const counters = buildNarrationTelemetryCounters([
      event({ cacheDecision: "hit", generatedSeconds: 1 }),
      event({ attempt: 2, retryClass: "rate_limit", cacheDecision: "miss", fallbackUsed: true, generatedSeconds: 2 }),
      event({ cacheDecision: "provider_failure", validationResult: "failed", failureClass: "ProviderResponseError", regeneration: true }),
    ]);

    expect(counters).toMatchObject({
      events: 3,
      attempts: 4,
      failures: 1,
      retries: 1,
      cacheHits: 1,
      cacheMisses: 1,
      validationFailures: 1,
      regenerations: 1,
      fallbackUses: 1,
      inputCharacters: 360,
      outputBytes: 72_000,
      generatedSeconds: 4.5,
    });
  });
});
