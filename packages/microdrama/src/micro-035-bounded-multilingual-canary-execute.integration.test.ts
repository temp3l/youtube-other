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
  MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-034-bounded-visual-canary-execute.js";
import { prepareMicro035BoundedCanaryAuthorization } from "./micro-035-bounded-canary-authorization-preparation.js";
import {
  authorizeMicro035BoundedCanaryExplicitExecute,
  createMicro035MockSegmentSynthesisPort,
  createMicro035OpenAiSegmentSynthesisPortForLocale,
  createMicro035SharedVisualReusePort,
  executeMicro035BoundedMultilingualCanary,
} from "./micro-035-bounded-multilingual-canary-execute.js";
import { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";
import {
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_EPISODE_IDS,
  MICRO_035_CANARY_LOCALES,
  MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
} from "./micro-035-canary-bindings.js";
import {
  DEFAULT_MICRO_034_EXECUTION_EVIDENCE_JSON_PATH,
  loadMicro034CanaryExecutionEvidence,
  loadMicro034CanaryExecutionEvidenceFromJson,
} from "./micro-035-canary-micro-034-evidence.js";

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


describe("MICRO-035 bounded multilingual canary execute", () => {
  it(
    "authorizes and executes bounded multilingual canary after mock MICRO-034 evidence",
    async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-035-exec-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const ttsOutputRoot = path.join(dir, "micro-033-output");
      const visualOutputRoot = path.join(dir, "micro-034-output");
      const multilingualOutputRoot = path.join(dir, "micro-035-output");

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

      const preparation = await prepareMicro035BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: AUTHORIZED_AT,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro035BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: AUTHORIZED_AT,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const { createPersistence, MicrodramaSQLiteRepository } = await import(
        "@mediaforge/persistence"
      );
      const sqlite = createPersistence(dbPath);
      const repo = new MicrodramaSQLiteRepository(sqlite);
      const evidenceFromDb = loadMicro034CanaryExecutionEvidence({ repository: repo });

      const execution = await executeMicro035BoundedMultilingualCanary({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot: multilingualOutputRoot,
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
          micro034Evidence: evidenceFromDb!,
          micro034OutputRoot: visualOutputRoot,
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

      expect(execution.status, execution.blockers.join(",")).toBe("DONE");
      expect(execution.episodes.length).toBe(9);
      expect(execution.providerRequests).toBeGreaterThan(0);
      expect(execution.totalCostMinor).toBeLessThanOrEqual(MICRO_035_CANARY_COST_LIMIT_MINOR);
      expect(execution.sharedVisualCacheHits).toBeGreaterThan(0);
      for (const episode of execution.episodes) {
        expect(episode.safeZonePass).toBe(true);
        expect(episode.visualRenderHash).toHaveLength(64);
        expect(episode.renderOutputPath.endsWith(".mp4")).toBe(true);
        expect(episode.sharedVisualCacheHits).toBeGreaterThan(0);
      }
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
    },
    120_000
  );

  it.runIf(process.env.MICRO_035_OPERATOR_EXECUTE === "1")(
    "authorizes workspace operator explicit execute authorization",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_035_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_035_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_035_AUTHORIZED_AT ?? AUTHORIZED_AT;

      const authorization = await authorizeMicro035BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-035-explicit-execute-authorization.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-035-explicit-execute-authorization-evidence.v1",
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

  it.runIf(process.env.MICRO_035_OPERATOR_EXECUTE === "1")(
    "executes workspace operator bounded multilingual canary",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_035_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const admittedAt = process.env.MICRO_035_ADMITTED_AT ?? ADMITTED_AT;
      const authorizedAt = process.env.MICRO_035_AUTHORIZED_AT ?? AUTHORIZED_AT;
      const executedAt = process.env.MICRO_035_EXECUTED_AT ?? EXECUTED_AT;
      const outputRoot =
        process.env.MICRO_035_OUTPUT_ROOT ??
        path.join(repoRoot, ".artifacts", "microdrama", "micro-035-canary");
      const micro034OutputRoot =
        process.env.MICRO_034_OUTPUT_ROOT ??
        path.join(repoRoot, ".artifacts", "microdrama", "micro-034-canary");
      const liveTts = process.env.MICRO_035_LIVE_TTS === "1";
      const locales = resolveOperatorLocales(process.env.MICRO_035_LOCALE_IDS);

      const { createPersistence, MicrodramaSQLiteRepository } = await import(
        "@mediaforge/persistence"
      );
      const { computePayloadHash } = await import("@mediaforge/narrative-core");
      const sqlite = createPersistence(dbPath);
      sqlite.migrate();
      const repo = new MicrodramaSQLiteRepository(sqlite);
      repo.migrate();
      persistMergedThreeEpisodeMicro034Evidence({
        repository: repo,
        repoRoot,
        micro034OutputRoot,
        updatedAt: authorizedAt,
        computePayloadHash,
      });

      const preparation = await prepareMicro035BoundedCanaryAuthorization({
        dbPath,
        admittedAt,
        preparedAt: authorizedAt,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro035BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt,
        authorizedAt,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const micro034Evidence = loadMicro034CanaryExecutionEvidence({ repository: repo });
      expect(micro034Evidence?.status).toBe("DONE");
      expect(micro034Evidence?.episodes).toHaveLength(3);

      const mockPort = createMicro035MockSegmentSynthesisPort({
        writeAudioBytes: (audioPath) => {
          writeFileSync(audioPath, createMinimalWavBuffer(120));
        },
      });
      const segmentSynthesisPorts = Object.fromEntries(
        MICRO_035_CANARY_LOCALES.map((locale) => [
          locale,
          liveTts && locales.includes(locale)
            ? createMicro035OpenAiSegmentSynthesisPortForLocale(locale)
            : mockPort,
        ])
      ) as Record<
        (typeof MICRO_035_CANARY_LOCALES)[number],
        ReturnType<typeof createMicro035MockSegmentSynthesisPort>
      >;

      const execution = await executeMicro035BoundedMultilingualCanary({
        dbPath,
        admittedAt,
        executedAt,
        outputRoot,
        locales,
        segmentSynthesisPorts,
        sharedVisualReusePort: createMicro035SharedVisualReusePort({
          micro034Evidence: micro034Evidence!,
          micro034OutputRoot,
        }),
        ...(liveTts
          ? {}
          : {
              ffmpegRunner: (args: readonly string[]) => {
                const outputPath = args.at(-1);
                if (typeof outputPath === "string") {
                  mkdirSync(path.dirname(outputPath), { recursive: true });
                  writeFileSync(outputPath, Buffer.from("mock"), "utf8");
                }
              },
            }),
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-035-canary-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-035-canary-execution-evidence.v1",
            dbPath,
            admittedAt,
            executedAt,
            outputRoot,
            liveTts,
            locales,
            publicationCalls: 0,
            ...execution,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(execution.status, execution.blockers.join(",")).toBe("DONE");
      expect(execution.episodes.length).toBe(locales.length * MICRO_035_CANARY_EPISODE_IDS.length);
      expect(execution.providerRequests).toBeLessThanOrEqual(
        MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS
      );
      expect(execution.totalCostMinor).toBeLessThanOrEqual(MICRO_035_CANARY_COST_LIMIT_MINOR);
      expect(execution.sharedVisualCacheHits).toBeGreaterThan(0);
    },
    1_800_000
  );
});

function resolveOperatorLocales(
  raw: string | undefined
): readonly (typeof MICRO_035_CANARY_LOCALES)[number][] {
  if (!raw || raw.trim().length === 0) {
    return MICRO_035_CANARY_LOCALES;
  }
  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const allowed = new Set<string>(MICRO_035_CANARY_LOCALES);
  const resolved = requested.filter(
    (value): value is (typeof MICRO_035_CANARY_LOCALES)[number] => allowed.has(value)
  );
  if (resolved.length === 0) {
    throw new Error(
      `MICRO_035_LOCALE_IDS must include one of ${MICRO_035_CANARY_LOCALES.join(",")}`
    );
  }
  return resolved;
}

function persistMergedThreeEpisodeMicro034Evidence(input: {
  readonly repository: import("@mediaforge/persistence").MicrodramaSQLiteRepository;
  readonly repoRoot: string;
  readonly micro034OutputRoot: string;
  readonly updatedAt: string;
  readonly computePayloadHash: (value: unknown) => string;
}): void {
  const current = loadMicro034CanaryExecutionEvidence({
    repository: input.repository,
  });
  const fallback = loadMicro034CanaryExecutionEvidenceFromJson(
    path.join(input.repoRoot, DEFAULT_MICRO_034_EXECUTION_EVIDENCE_JSON_PATH)
  );
  const byId = new Map(
    [...(fallback?.episodes ?? []), ...(current?.episodes ?? [])].map((episode) => [
      episode.episodeId,
      episode,
    ])
  );
  const episodes = MICRO_035_CANARY_EPISODE_IDS.map((episodeId) => {
    const episode = byId.get(episodeId);
    if (!episode) {
      throw new Error(`Missing MICRO-034 evidence for ${episodeId}`);
    }
    return episode;
  });
  const projection = {
    status: "DONE" as const,
    blockers: [],
    providerRequests: current?.episodes.length ? 1 : 0,
    totalCostMinor: 0,
    costLimitMinor: 999,
    sharedVisualCacheHits: 0,
    episodes,
    outputRoot: input.micro034OutputRoot,
    evidenceProjectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
  input.repository.replaceProjection({
    projectionKey: MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection,
    contentHash: input.computePayloadHash(projection),
    updatedAt: input.updatedAt,
  });
}
