import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
import { prepareMicro034BoundedCanaryAuthorization } from "./micro-034-bounded-canary-authorization-preparation.js";
import {
  authorizeMicro034BoundedCanaryExplicitExecute,
  createMicro034LiveVisualProductionPortFromEnv,
  createMicro034MockVisualProductionPort,
  executeMicro034BoundedVisualCanary,
} from "./micro-034-bounded-visual-canary-execute.js";
import { MICRO_034_CANARY_EPISODE_IDS } from "./micro-034-canary-bindings.js";

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

describe("MICRO-034 bounded visual canary execute", () => {
  it(
    "authorizes and executes bounded visual canary after mock MICRO-033 evidence",
    async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-034-exec-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const ttsOutputRoot = path.join(dir, "micro-033-output");
      const visualOutputRoot = path.join(dir, "micro-034-output");

      const ttsPreparation = await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: AUTHORIZED_AT,
      });
      expect(ttsPreparation.status).toBe("READY_FOR_EXPLICIT_EXECUTE");

      const ttsAuthorization = await authorizeMicro033BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: AUTHORIZED_AT,
      });
      expect(ttsAuthorization.status).toBe("AUTHORIZED");

      const ttsExecution = await executeMicro033BoundedTtsCanary({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot: ttsOutputRoot,
        segmentSynthesisPort: createMicro033MockSegmentSynthesisPort({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer(120));
          },
        }),
        modelConfiguration: {
          ...MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
          outputFormat: "wav",
        },
        measureAudioDurationMs: () => 5_800,
      });
      expect(ttsExecution.status).toBe("DONE");

      const visualPreparation = await prepareMicro034BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: EXECUTED_AT,
      });
      expect(
        visualPreparation.status,
        visualPreparation.blockers.join(",")
      ).toBe("READY_FOR_EXPLICIT_EXECUTE");

      const visualAuthorization = await authorizeMicro034BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: EXECUTED_AT,
      });
      expect(visualAuthorization.status).toBe("AUTHORIZED");

      const visualExecution = await executeMicro034BoundedVisualCanary({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot: visualOutputRoot,
        visualProductionPort: createMicro034MockVisualProductionPort(),
        ffmpegRunner: (args) => {
          const outputPath = args.at(-1);
          if (typeof outputPath === "string") {
            mkdirSync(path.dirname(outputPath), { recursive: true });
            writeFileSync(outputPath, Buffer.from("mock"), "utf8");
          }
        },
      });

      expect(visualExecution.status, visualExecution.blockers.join(",")).toBe("DONE");
      expect(visualExecution.episodes.length).toBe(3);
      expect(visualExecution.providerRequests).toBeGreaterThan(0);
      expect(visualExecution.totalCostMinor).toBeLessThanOrEqual(999);
      expect(visualExecution.sharedVisualCacheHits).toBeGreaterThanOrEqual(0);
      for (const episode of visualExecution.episodes) {
        expect(episode.safeZonePass).toBe(true);
        expect(episode.visualRenderHash).toHaveLength(64);
        expect(episode.renderOutputPath.endsWith(".mp4")).toBe(true);
      }
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  },
    60_000
  );

  it.runIf(process.env.MICRO_034_OPERATOR_EXECUTE === "1")(
    "authorizes workspace operator explicit execute authorization",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_034_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_034_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_034_AUTHORIZED_AT ?? AUTHORIZED_AT;

      const authorization = await authorizeMicro034BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-034-explicit-execute-authorization.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-034-explicit-execute-authorization-evidence.v1",
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

  it.runIf(process.env.MICRO_034_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database without dispatching visuals",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_034_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro034BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-034-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-034-authorization-evidence.v1",
            taskId: "MICRO-034",
            dbPath,
            admittedAt: ADMITTED_AT,
            preparedAt,
            externalCalls: {
              image: 0,
              render: 0,
              paidProvider: 0,
              publication: 0,
            },
            ...result,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
    }
  );

  it.runIf(
    process.env.MICRO_034_OPERATOR_EXECUTE === "1" &&
      process.env.MICRO_034_AUTHORIZE_ONLY !== "1"
  )(
    "executes workspace operator bounded visual canary",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_034_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_034_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_034_AUTHORIZED_AT ?? AUTHORIZED_AT;
      const executedAt = process.env.MICRO_034_EXECUTED_AT ?? EXECUTED_AT;
      const outputRoot =
        process.env.MICRO_034_OUTPUT_ROOT ??
        path.join(repoRoot, ".artifacts", "microdrama", "micro-034-canary");
      const liveImages = process.env.MICRO_034_LIVE_IMAGES === "1";
      const episodeIds = resolveOperatorEpisodeIds(process.env.MICRO_034_EPISODE_IDS);
      const evidenceFileName = liveImages
        ? "2026-08-12-micro-034-live-image-canary-execution-evidence.json"
        : "2026-08-12-micro-034-canary-execution-evidence.json";

      const preparation = await prepareMicro034BoundedCanaryAuthorization({
        dbPath,
        admittedAt,
        preparedAt: authorizedAt,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro034BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro034BoundedVisualCanary({
        dbPath,
        admittedAt,
        executedAt,
        outputRoot,
        episodeIds,
        visualProductionPort: liveImages
          ? createMicro034LiveVisualProductionPortFromEnv()
          : createMicro034MockVisualProductionPort(),
      });

      writeFileSync(
        path.join(repoRoot, "docs/reports/codex-runs", evidenceFileName),
        `${JSON.stringify(
          {
            schemaVersion: liveImages
              ? "mediaforge.microdrama.micro-034-live-image-canary-execution-evidence.v1"
              : "mediaforge.microdrama.micro-034-canary-execution-evidence.v1",
            dbPath,
            admittedAt,
            executedAt,
            outputRoot,
            liveImages,
            episodeIds,
            publicationCalls: 0,
            ...execution,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(execution.status).toBe("DONE");
      expect(execution.episodes.length).toBe(episodeIds.length);
      expect(execution.providerRequests).toBeLessThanOrEqual(90);
      expect(execution.totalCostMinor).toBeLessThanOrEqual(999);
    },
    1_800_000
  );
});

function resolveOperatorEpisodeIds(
  raw: string | undefined
): readonly (typeof MICRO_034_CANARY_EPISODE_IDS)[number][] {
  if (!raw || raw.trim().length === 0) {
    return MICRO_034_CANARY_EPISODE_IDS;
  }
  const requested = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const allowed = new Set<string>(MICRO_034_CANARY_EPISODE_IDS);
  const resolved = requested.filter((value): value is (typeof MICRO_034_CANARY_EPISODE_IDS)[number] =>
    allowed.has(value)
  );
  if (resolved.length === 0) {
    throw new Error(
      `MICRO_034_EPISODE_IDS must include one of ${MICRO_034_CANARY_EPISODE_IDS.join(",")}`
    );
  }
  return resolved;
}
