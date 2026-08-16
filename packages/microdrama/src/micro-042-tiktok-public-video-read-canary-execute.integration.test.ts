import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prepareMicro050BoundedOAuthCanaryAuthorization } from "./micro-050-bounded-oauth-canary-authorization-preparation.js";
import {
  authorizeMicro050BoundedOAuthCanaryExplicitExecute,
  createMicro050TikTokOAuthCanaryPorts,
  executeMicro050TikTokOAuthCanary,
} from "./micro-050-tiktok-oauth-canary-execute.js";
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
import { prepareMicro037BoundedPublicationCanaryAuthorization } from "./micro-037-bounded-publication-canary-authorization-preparation.js";
import {
  authorizeMicro037BoundedPublicationCanaryExplicitExecute,
  createMicro037TikTokPublicationPorts,
  executeMicro037TikTokPrivatePublicationCanary,
} from "./micro-037-tiktok-private-publication-canary-execute.js";
import { prepareMicro038BoundedPublicationCanaryAuthorization } from "./micro-038-bounded-publication-canary-authorization-preparation.js";
import {
  authorizeMicro038BoundedPublicationCanaryExplicitExecute,
  createMicro038TikTokPublicationPorts,
  executeMicro038TikTokPublicPublicationCanary,
} from "./micro-038-tiktok-public-publication-canary-execute.js";
import { prepareMicro042BoundedPublicVideoReadCanaryAuthorization } from "./micro-042-bounded-public-video-read-canary-authorization-preparation.js";
import {
  authorizeMicro042BoundedPublicVideoReadCanaryExplicitExecute,
  createMicro042TikTokPublicVideoReadPorts,
  executeMicro042TikTokPublicVideoReadCanary,
  MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-042-tiktok-public-video-read-canary-execute.js";
import { DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH } from "./micro-042-canary-micro-038-evidence.js";
import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const PREPARED_AT = "2026-08-12T09:00:00.000Z";
const AUTHORIZED_AT = "2026-08-12T09:30:00.000Z";
const EXECUTED_AT = "2026-08-12T10:00:00.000Z";

function createMinimalWavBuffer(): Buffer {
  const buffer = Buffer.alloc(46);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(38, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8_000, 24);
  buffer.writeUInt32LE(8_000, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(2, 40);
  buffer.writeUInt8(128, 44);
  buffer.writeUInt8(128, 45);
  return buffer;
}

describe("MICRO-042 TikTok public video read canary execute", () => {
  it("authorizes and executes read-only analytics canary after MICRO-038", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-042-exec-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const ttsOutputRoot = path.join(dir, "micro-033-output");
      const visualOutputRoot = path.join(dir, "micro-034-output");

      await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });
      await authorizeMicro033BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: PREPARED_AT,
      });
      await executeMicro033BoundedTtsCanary({
        dbPath,
        admittedAt: ADMITTED_AT,
        executedAt: EXECUTED_AT,
        outputRoot: ttsOutputRoot,
        segmentSynthesisPort: createMicro033MockSegmentSynthesisPort({
          writeAudioBytes: (audioPath) => {
            writeFileSync(audioPath, createMinimalWavBuffer());
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
        preparedAt: PREPARED_AT,
      });
      await authorizeMicro034BoundedCanaryExplicitExecute({
        dbPath,
        admittedAt: ADMITTED_AT,
        authorizedAt: PREPARED_AT,
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
            writeFileSync(outputPath, Buffer.from("mock-render-video"), "utf8");
          }
        },
      });

      const oauthPorts = createMicro050TikTokOAuthCanaryPorts();
      await prepareMicro050BoundedOAuthCanaryAuthorization({
        dbPath,
        preparedAt: PREPARED_AT,
      });
      await authorizeMicro050BoundedOAuthCanaryExplicitExecute({
        dbPath,
        authorizedAt: AUTHORIZED_AT,
        ports: oauthPorts,
      });
      expect(
        (await executeMicro050TikTokOAuthCanary({
          dbPath,
          executedAt: EXECUTED_AT,
          ports: oauthPorts,
        })).status
      ).toBe("DONE");

      const privatePorts = createMicro037TikTokPublicationPorts();
      expect(
        (
          await prepareMicro037BoundedPublicationCanaryAuthorization({
            dbPath,
            preparedAt: EXECUTED_AT,
          })
        ).status
      ).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(
        (
          await authorizeMicro037BoundedPublicationCanaryExplicitExecute({
            dbPath,
            authorizedAt: EXECUTED_AT,
            ports: privatePorts,
          })
        ).status
      ).toBe("AUTHORIZED");
      expect(
        (
          await executeMicro037TikTokPrivatePublicationCanary({
            dbPath,
            executedAt: EXECUTED_AT,
            ports: privatePorts,
          })
        ).status
      ).toBe("DONE");

      const publicPorts = createMicro038TikTokPublicationPorts();
      expect(
        (
          await prepareMicro038BoundedPublicationCanaryAuthorization({
            dbPath,
            preparedAt: EXECUTED_AT,
          })
        ).status
      ).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(
        (
          await authorizeMicro038BoundedPublicationCanaryExplicitExecute({
            dbPath,
            authorizedAt: EXECUTED_AT,
            ports: publicPorts,
          })
        ).status
      ).toBe("AUTHORIZED");
      const publicExecution = await executeMicro038TikTokPublicPublicationCanary({
        dbPath,
        executedAt: EXECUTED_AT,
        ports: publicPorts,
      });
      expect(publicExecution.status).toBe("DONE");
      expect(publicExecution.receiptPublicVideoId).toBe("video.micro-038.public");

      const readPorts = createMicro042TikTokPublicVideoReadPorts();
      const preparation =
        await prepareMicro042BoundedPublicVideoReadCanaryAuthorization({
          dbPath,
          preparedAt: EXECUTED_AT,
        });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization =
        await authorizeMicro042BoundedPublicVideoReadCanaryExplicitExecute({
          dbPath,
          authorizedAt: EXECUTED_AT,
          ports: readPorts,
        });
      expect(authorization.blockers.join(",")).toBe("");
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro042TikTokPublicVideoReadCanary({
        dbPath,
        executedAt: EXECUTED_AT,
        ports: readPorts,
      });

      expect(execution.status).toBe("DONE");
      expect(execution.publicationCalls).toBe(0);
      expect(execution.externalCalls).toBe(1);
      expect(execution.providerVideoId).toBe("video.micro-038.public");
      expect(execution.observationId).toMatch(/^perf-obs-/);

      const stored = readPorts.performanceRepository.getObservationByIdempotencyKey(
        "idempotency.micro-042.public-video-read-canary"
      );
      expect(stored?.normalized.metrics.views).toEqual({
        status: "available",
        value: 42,
      });
      expect(stored?.normalized.metrics.retention_rate).toEqual({
        status: "unavailable",
      });

      const { createPersistence, MicrodramaSQLiteRepository } = await import(
        "@mediaforge/persistence"
      );
      const sqlite = createPersistence(dbPath);
      const repo = new MicrodramaSQLiteRepository(sqlite);
      const evidence = repo.getProjection(
        MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
      );
      expect(evidence?.projection.publicationCalls).toBe(0);
      expect(evidence?.projection.externalCalls).toBe(1);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 180_000);

  it.runIf(process.env.MICRO_042_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_042_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro042BoundedPublicVideoReadCanaryAuthorization({
        dbPath,
        preparedAt,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-042-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-042-authorization-evidence.v1",
            taskId: "MICRO-042",
            dbPath,
            preparedAt,
            operatorId: "operator.microdrama",
            publicationCalls: 0,
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

  it.runIf(process.env.MICRO_042_OPERATOR_EXECUTE === "1")(
    "executes workspace operator public video read canary",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_042_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const executedAt = process.env.MICRO_042_EXECUTED_AT ?? new Date().toISOString();
      const readPorts = createMicro042TikTokPublicVideoReadPorts();

      const preparation =
        await prepareMicro042BoundedPublicVideoReadCanaryAuthorization({
          dbPath,
          preparedAt: executedAt,
          micro038EvidenceJsonPath: DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH,
        });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization =
        await authorizeMicro042BoundedPublicVideoReadCanaryExplicitExecute({
          dbPath,
          authorizedAt: executedAt,
          ports: readPorts,
          micro038EvidenceJsonPath: DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH,
        });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro042TikTokPublicVideoReadCanary({
        dbPath,
        executedAt,
        ports: readPorts,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-042-canary-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-042-canary-execution-evidence.v1",
            dbPath,
            executedAt,
            publicationCalls: execution.publicationCalls,
            ...execution,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(execution.status).toBe("DONE");
      expect(execution.publicationCalls).toBe(0);
      expect(execution.externalCalls).toBe(1);
    },
    60_000
  );
});
