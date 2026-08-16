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
import { prepareMicro050BoundedOAuthCanaryAuthorization } from "./micro-050-bounded-oauth-canary-authorization-preparation.js";
import {
  authorizeMicro050BoundedOAuthCanaryExplicitExecute,
  createMicro050TikTokOAuthCanaryPorts,
  executeMicro050TikTokOAuthCanary,
} from "./micro-050-tiktok-oauth-canary-execute.js";
import { prepareMicro037BoundedPublicationCanaryAuthorization } from "./micro-037-bounded-publication-canary-authorization-preparation.js";
import {
  authorizeMicro037BoundedPublicationCanaryExplicitExecute,
  createMicro037TikTokPublicationPorts,
  executeMicro037TikTokPrivatePublicationCanary,
  MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-037-tiktok-private-publication-canary-execute.js";

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

describe("MICRO-037 TikTok private publication canary execute", () => {
  it("authorizes and executes private publication canary after upstream evidence", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-037-exec-"));
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
      const oauthExecution = await executeMicro050TikTokOAuthCanary({
        dbPath,
        executedAt: EXECUTED_AT,
        ports: oauthPorts,
      });
      expect(oauthExecution.status).toBe("DONE");

      const publicationPorts = createMicro037TikTokPublicationPorts();
      const preparation = await prepareMicro037BoundedPublicationCanaryAuthorization({
        dbPath,
        preparedAt: EXECUTED_AT,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );
      expect(preparation.renderBinding?.episodeId).toBe("E001");

      const authorization = await authorizeMicro037BoundedPublicationCanaryExplicitExecute({
        dbPath,
        authorizedAt: EXECUTED_AT,
        ports: publicationPorts,
      });
      expect(authorization.blockers.join(",")).toBe("");
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro037TikTokPrivatePublicationCanary({
        dbPath,
        executedAt: EXECUTED_AT,
        ports: publicationPorts,
      });

      expect(execution.status).toBe("DONE");
      expect(execution.publicationCalls).toBe(1);
      expect(execution.publishId).toMatch(/^tiktok\.publish\.micro-037\./);
      expect(execution.receiptPublicVideoId).toBe("video.micro-037.private");

      const { createPersistence, MicrodramaSQLiteRepository } = await import(
        "@mediaforge/persistence"
      );
      const sqlite = createPersistence(dbPath);
      const repo = new MicrodramaSQLiteRepository(sqlite);
      const stored = repo.getProjection(MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY);
      expect(stored?.projection.publicationCalls).toBe(1);
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

  it.runIf(process.env.MICRO_037_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_037_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro037BoundedPublicationCanaryAuthorization({
        dbPath,
        preparedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-037-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-037-authorization-evidence.v1",
            taskId: "MICRO-037",
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

  it.runIf(process.env.MICRO_037_OPERATOR_EXECUTE === "1")(
    "executes workspace operator private publication canary",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_037_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const executedAt = process.env.MICRO_037_EXECUTED_AT ?? EXECUTED_AT;
      const publicationPorts = createMicro037TikTokPublicationPorts();

      const preparation = await prepareMicro037BoundedPublicationCanaryAuthorization({
        dbPath,
        preparedAt: executedAt,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro037BoundedPublicationCanaryExplicitExecute({
        dbPath,
        authorizedAt: executedAt,
        ports: publicationPorts,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro037TikTokPrivatePublicationCanary({
        dbPath,
        executedAt,
        ports: publicationPorts,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-037-canary-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-037-canary-execution-evidence.v1",
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
      expect(execution.publicationCalls).toBe(1);
    },
    60_000
  );
});
