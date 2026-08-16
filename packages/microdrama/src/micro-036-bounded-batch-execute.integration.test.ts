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
  createMicro034MockVisualProductionPort,
  executeMicro034BoundedVisualCanary,
} from "./micro-034-bounded-visual-canary-execute.js";
import { prepareMicro035BoundedCanaryAuthorization } from "./micro-035-bounded-canary-authorization-preparation.js";
import {
  authorizeMicro035BoundedCanaryExplicitExecute,
  createMicro035MockSegmentSynthesisPort,
  createMicro035SharedVisualReusePort,
  executeMicro035BoundedMultilingualCanary,
} from "./micro-035-bounded-multilingual-canary-execute.js";
import { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";
import { MICRO_035_CANARY_LOCALES } from "./micro-035-canary-bindings.js";
import { loadMicro034CanaryExecutionEvidence } from "./micro-035-canary-micro-034-evidence.js";
import { prepareMicro036BoundedBatchAuthorization } from "./micro-036-bounded-batch-authorization-preparation.js";
import {
  authorizeMicro036BoundedBatchExplicitExecute,
  createMicro036MockEnVisualProductionPort,
  createMicro036MockSegmentSynthesisPorts,
  createMicro036SharedVisualReusePort,
  executeMicro036BoundedBatch,
} from "./micro-036-bounded-batch-execute.js";
import {
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
} from "./micro-036-batch-bindings.js";
import { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const AUTHORIZED_AT = "2026-08-12T07:00:00.000Z";
const EXECUTED_AT = "2026-08-12T09:00:00.000Z";

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

async function seedMicro035Evidence(dbPath: string, outputRoots: {
  tts: string;
  visual: string;
  multilingual: string;
}): Promise<void> {
  await prepareMicro033BoundedCanaryAuthorization({
    dbPath,
    admittedAt: ADMITTED_AT,
    preparedAt: AUTHORIZED_AT,
  });
  await authorizeMicro033BoundedCanaryExplicitExecute({
    dbPath,
    admittedAt: ADMITTED_AT,
    authorizedAt: AUTHORIZED_AT,
  });
  await executeMicro033BoundedTtsCanary({
    dbPath,
    admittedAt: ADMITTED_AT,
    executedAt: EXECUTED_AT,
    outputRoot: outputRoots.tts,
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

  await prepareMicro034BoundedCanaryAuthorization({
    dbPath,
    admittedAt: ADMITTED_AT,
    preparedAt: AUTHORIZED_AT,
  });
  await authorizeMicro034BoundedCanaryExplicitExecute({
    dbPath,
    admittedAt: ADMITTED_AT,
    authorizedAt: AUTHORIZED_AT,
  });
  await executeMicro034BoundedVisualCanary({
    dbPath,
    admittedAt: ADMITTED_AT,
    executedAt: EXECUTED_AT,
    outputRoot: outputRoots.visual,
    visualProductionPort: createMicro034MockVisualProductionPort(),
    ffmpegRunner: (args) => {
      const outputPath = args.at(-1);
      if (typeof outputPath === "string") {
        mkdirSync(path.dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, Buffer.from("mock"), "utf8");
      }
    },
  });

  await prepareMicro035BoundedCanaryAuthorization({
    dbPath,
    admittedAt: ADMITTED_AT,
    preparedAt: AUTHORIZED_AT,
  });
  await authorizeMicro035BoundedCanaryExplicitExecute({
    dbPath,
    admittedAt: ADMITTED_AT,
    authorizedAt: AUTHORIZED_AT,
  });

  const { createPersistence, MicrodramaSQLiteRepository } = await import(
    "@mediaforge/persistence"
  );
  const sqlite = createPersistence(dbPath);
  const repo = new MicrodramaSQLiteRepository(sqlite);
  const micro034Evidence = loadMicro034CanaryExecutionEvidence({ repository: repo });

  await executeMicro035BoundedMultilingualCanary({
    dbPath,
    admittedAt: ADMITTED_AT,
    executedAt: EXECUTED_AT,
    outputRoot: outputRoots.multilingual,
    segmentSynthesisPorts: Object.fromEntries(
      MICRO_035_CANARY_LOCALES.map((locale) => [
        locale,
        createMicro035MockSegmentSynthesisPort({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer(120));
          },
        }),
      ])
    ) as Record<(typeof MICRO_035_CANARY_LOCALES)[number], ReturnType<typeof createMicro035MockSegmentSynthesisPort>>,
    sharedVisualReusePort: createMicro035SharedVisualReusePort({
      micro034Evidence: micro034Evidence!,
      micro034OutputRoot: outputRoots.visual,
    }),
    modelConfigurations: Object.fromEntries(
      MICRO_035_CANARY_LOCALES.map((locale) => [
        locale,
        {
          ...resolveMicro035OpenAiTtsModelConfigurationForLocale(locale),
          outputFormat: "wav" as const,
        },
      ])
    ) as Record<
      (typeof MICRO_035_CANARY_LOCALES)[number],
      ReturnType<typeof resolveMicro035OpenAiTtsModelConfigurationForLocale>
    >,
    measureAudioDurationMs: () => 5_800,
    ffmpegRunner: (args) => {
      const outputPath = args.at(-1);
      if (typeof outputPath === "string") {
        mkdirSync(path.dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, Buffer.from("mock"), "utf8");
      }
    },
  });
}

describe("MICRO-036 bounded batch execute", () => {
  it("authorizes and executes bounded E004-E010 batch after mock MICRO-035 evidence", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-036-exec-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const ttsOutputRoot = path.join(dir, "micro-033-output");
      const visualOutputRoot = path.join(dir, "micro-034-output");
      const multilingualOutputRoot = path.join(dir, "micro-035-output");
      const batchOutputRoot = path.join(dir, "micro-036-output");

      await seedMicro035Evidence(dbPath, {
        tts: ttsOutputRoot,
        visual: visualOutputRoot,
        multilingual: multilingualOutputRoot,
      });

      const preparation = await prepareMicro036BoundedBatchAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: AUTHORIZED_AT,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro036BoundedBatchExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: AUTHORIZED_AT,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const blocked = await authorizeMicro036BoundedBatchExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: AUTHORIZED_AT,
        requestedEpisodeIds: ["E011"],
      });
      expect(blocked.status).toBe("BLOCKED");
      expect(blocked.blockers.some((blocker) => blocker.includes("E011"))).toBe(true);

      const execution = await executeMicro036BoundedBatch({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot: batchOutputRoot,
        segmentSynthesisPorts: createMicro036MockSegmentSynthesisPorts({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer(120));
          },
        }),
        enVisualProductionPort: createMicro036MockEnVisualProductionPort(),
        sharedVisualReusePort: createMicro036SharedVisualReusePort({
          batchOutputRoot,
          episodeIds: MICRO_036_BATCH_EPISODE_IDS,
        }),
        modelConfigurations: Object.fromEntries(
          MICRO_036_BATCH_LOCALES.map((locale) => [
            locale,
            {
              ...resolveMicro036OpenAiTtsModelConfigurationForLocale(locale),
              outputFormat: "wav" as const,
            },
          ])
        ) as Record<
          (typeof MICRO_036_BATCH_LOCALES)[number],
          ReturnType<typeof resolveMicro036OpenAiTtsModelConfigurationForLocale>
        >,
        measureAudioDurationMs: () => 5_800,
        ffmpegRunner: (args) => {
          const outputPath = args.at(-1);
          if (typeof outputPath === "string") {
            mkdirSync(path.dirname(outputPath), { recursive: true });
            writeFileSync(outputPath, Buffer.from("mock"), "utf8");
          }
        },
      });

      expect(execution.status, execution.blockers.join(",")).toBe("DONE");
      expect(execution.episodes.length).toBe(28);
      expect(execution.providerRequests).toBeGreaterThan(0);
      expect(execution.totalCostMinor).toBeLessThanOrEqual(MICRO_036_BATCH_COST_LIMIT_MINOR);
      expect(execution.sharedVisualCacheHits).toBeGreaterThan(0);
      for (const episode of execution.episodes) {
        expect(episode.safeZonePass).toBe(true);
        expect(episode.visualRenderHash).toHaveLength(64);
        expect(episode.renderOutputPath.endsWith(".mp4")).toBe(true);
      }
      expect(MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES["en-US"].E004).toHaveLength(64);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 180_000);

  it.runIf(process.env.MICRO_036_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_036_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro036BoundedBatchAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-036-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-036-authorization-evidence.v1",
            taskId: "MICRO-036",
            dbPath,
            admittedAt: ADMITTED_AT,
            preparedAt,
            operatorId: "operator.microdrama",
            externalCalls: {
              image: 0,
              render: 0,
              openAiApi: 0,
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

  it.runIf(process.env.MICRO_036_OPERATOR_EXECUTE === "1")(
    "executes workspace operator bounded batch",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_036_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_036_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_036_AUTHORIZED_AT ?? AUTHORIZED_AT;
      const executedAt = process.env.MICRO_036_EXECUTED_AT ?? EXECUTED_AT;
      const outputRoot =
        process.env.MICRO_036_OUTPUT_ROOT ??
        path.join(repoRoot, ".artifacts", "microdrama", "micro-036-batch");

      const preparation = await prepareMicro036BoundedBatchAuthorization({
        dbPath,
        admittedAt,
        preparedAt: authorizedAt,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro036BoundedBatchExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro036BoundedBatch({
        dbPath,
        admittedAt,
        executedAt,
        outputRoot,
        segmentSynthesisPorts: createMicro036MockSegmentSynthesisPorts({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer(120));
          },
        }),
        enVisualProductionPort: createMicro036MockEnVisualProductionPort(),
        sharedVisualReusePort: createMicro036SharedVisualReusePort({
          batchOutputRoot: outputRoot,
          episodeIds: MICRO_036_BATCH_EPISODE_IDS,
        }),
        ffmpegRunner: (args) => {
          const outputPath = args.at(-1);
          if (typeof outputPath === "string") {
            mkdirSync(path.dirname(outputPath), { recursive: true });
            writeFileSync(outputPath, Buffer.from("mock"), "utf8");
          }
        },
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-036-batch-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-036-batch-execution-evidence.v1",
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
      expect(execution.episodes.length).toBe(28);
      expect(execution.providerRequests).toBeLessThanOrEqual(
        MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS
      );
      expect(execution.totalCostMinor).toBeLessThanOrEqual(MICRO_036_BATCH_COST_LIMIT_MINOR);
    },
    900_000
  );
});
