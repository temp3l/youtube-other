import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prepareMicro033BoundedCanaryAuthorization } from "./micro-033-bounded-canary-authorization-preparation.js";
import {
  authorizeMicro033BoundedCanaryExplicitExecute,
  executeMicro033BoundedTtsCanary,
} from "./micro-033-bounded-tts-canary-execute.js";
import { MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION } from "./micro-033-canary-bindings.js";
import { createMicro033MockSegmentSynthesisPort } from "./micro-033-segment-synthesis.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const AUTHORIZED_AT = "2026-08-12T07:00:00.000Z";
const EXECUTED_AT = "2026-08-12T08:00:00.000Z";

function createMinimalWavBuffer(durationMs = 100): Buffer {
  const sampleRate = 8_000;
  const numSamples = Math.max(1, Math.floor((durationMs / 1_000) * sampleRate));
  const dataSize = numSamples;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < dataSize; index += 1) {
    buffer.writeUInt8(128, 44 + index);
  }
  return buffer;
}

describe("MICRO-033 bounded TTS canary execute", () => {
  it("authorizes and executes bounded canary with measured timing evidence", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-033-exec-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const outputRoot = path.join(dir, "canary-output");

      const preparation = await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: AUTHORIZED_AT,
      });
      expect(preparation.status).toBe("READY_FOR_EXPLICIT_EXECUTE");

      const authorization = await authorizeMicro033BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: AUTHORIZED_AT,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro033BoundedTtsCanary({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot,
        segmentSynthesisPort: createMicro033MockSegmentSynthesisPort({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer(120));
          },
        }),
        modelConfiguration: {
          ...MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
          outputFormat: "wav",
        },
        measureAudioDurationMs: (audioPath) => {
          writeFileSync(audioPath, createMinimalWavBuffer(5_800));
          return 5_800;
        },
      });

      expect(execution.status, execution.blockers.join(",")).toBe("DONE");
      expect(execution.episodes.length).toBe(3);
      expect(execution.providerRequests).toBeGreaterThan(0);
      expect(execution.totalCostMinor).toBeLessThanOrEqual(199);
      for (const episode of execution.episodes) {
        expect(episode.measuredDurationMs).toBeGreaterThan(0);
        expect(episode.calibratedAudioGateGuidance.calibrationStatus).toBe(
          "CALIBRATED_FROM_CANARY"
        );
        expect(episode.narrationAudioSha256).toHaveLength(64);
      }
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it.runIf(process.env.MICRO_033_OPERATOR_EXECUTE === "1")(
    "authorizes workspace operator explicit execute authorization",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_033_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_033_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_033_AUTHORIZED_AT ?? AUTHORIZED_AT;

      const authorization = await authorizeMicro033BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-033-explicit-execute-authorization.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-033-explicit-execute-authorization-evidence.v1",
            dbPath,
            admittedAt,
            authorizedAt,
            ...authorization,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(authorization.status).toBe("AUTHORIZED");
    }
  );

  it.runIf(
    process.env.MICRO_033_OPERATOR_EXECUTE === "1" &&
      process.env.MICRO_033_AUTHORIZE_ONLY !== "1"
  )("executes workspace operator bounded canary with live bounded OpenAI TTS", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../");
    const dbPath =
      process.env.MICRO_033_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
    const admittedAt = process.env.MICRO_033_ADMITTED_AT ?? ADMITTED_AT;
    const authorizedAt = process.env.MICRO_033_AUTHORIZED_AT ?? AUTHORIZED_AT;
    const executedAt = process.env.MICRO_033_EXECUTED_AT ?? EXECUTED_AT;
    const outputRoot =
      process.env.MICRO_033_OUTPUT_ROOT ??
      path.join(repoRoot, ".artifacts", "microdrama", "micro-033-canary");

    const { createMicro033OpenAiSegmentSynthesisPortFromEnv } = await import(
      "./micro-033-segment-synthesis.js"
    );

    const preparation = await prepareMicro033BoundedCanaryAuthorization({
      dbPath,
      admittedAt,
      preparedAt: authorizedAt,
    });
    expect(preparation.status, preparation.blockers.join(",")).toBe(
      "READY_FOR_EXPLICIT_EXECUTE"
    );

    const authorization = await authorizeMicro033BoundedCanaryExplicitExecute({
      dbPath,
      admittedAt,
      authorizedAt,
    });
    expect(authorization.status).toBe("AUTHORIZED");

    const execution = await executeMicro033BoundedTtsCanary({
      dbPath,
      admittedAt,
      executedAt,
      outputRoot,
      segmentSynthesisPort: createMicro033OpenAiSegmentSynthesisPortFromEnv(),
    });

    writeFileSync(
      path.join(
        repoRoot,
        "docs/reports/codex-runs/2026-08-12-micro-033-canary-execution-evidence.json"
      ),
      `${JSON.stringify(
        {
          schemaVersion: "mediaforge.microdrama.micro-033-canary-execution-evidence.v1",
          dbPath,
          admittedAt,
          executedAt,
          outputRoot,
          publicationCalls: 0,
          ...execution,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(execution.status).toBe("DONE");
    expect(execution.episodes.length).toBe(3);
    expect(execution.providerRequests).toBeLessThanOrEqual(111);
    expect(execution.totalCostMinor).toBeLessThanOrEqual(199);
  });
});
