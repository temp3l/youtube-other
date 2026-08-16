import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { assertMicro039E014EpisodeRangeAllowed } from "./micro-039-e014-batch-bindings.js";
import {
  DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
} from "./micro-039-e014-batch-evidence.js";
import { prepareMicro039E014BoundedProgressiveBatchAuthorization } from "./micro-039-e014-bounded-progressive-batch-authorization-preparation.js";
import {
  authorizeMicro039E014BoundedProgressiveBatchExplicitExecute,
  createMicro039E014ProgressiveBatchPorts,
  executeMicro039E014BoundedProgressiveBatch,
  MICRO_039_E014_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-039-e014-bounded-progressive-batch-execute.js";
import {
  createMicro039MockSegmentSynthesisPorts,
  createMicro039OpenAiSegmentSynthesisPorts,
} from "./micro-039-batch-production-ports.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const PREPARED_AT = "2026-08-12T09:00:00.000Z";
const AUTHORIZED_AT = "2026-08-12T09:30:00.000Z";
const EXECUTED_AT = "2026-08-12T10:00:00.000Z";

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

function mockSegmentPorts() {
  return createMicro039MockSegmentSynthesisPorts({
    writeAudioBytes: (audioPath) => {
      writeFileSync(audioPath, createMinimalWavBuffer(120));
    },
  });
}

describe("MICRO-039-E014 progressive E014 batch", () => {
  it("rejects open-ended all-remaining episode ranges", () => {
    expect(
      assertMicro039E014EpisodeRangeAllowed({
        startEpisodeId: "e014",
        endEpisodeId: "e100",
      }).allowed
    ).toBe(false);
    expect(
      assertMicro039E014EpisodeRangeAllowed({
        startEpisodeId: "e014",
        endEpisodeId: "e014",
      }).allowed
    ).toBe(true);
  });

  it("authorizes and executes separately authorized progressive E014 batch from upstream evidence", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-039-e014-"));
    const dbPath = path.join(dir, "microdrama.sqlite");
    const outputRoot = path.join(dir, "output");

    const preparation = await prepareMicro039E014BoundedProgressiveBatchAuthorization({
      dbPath,
      admittedAt: ADMITTED_AT,
      preparedAt: PREPARED_AT,
      micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
      micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
      micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
      micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
    });
    expect(preparation.status, preparation.blockers.join(",")).toBe(
      "READY_FOR_EXPLICIT_EXECUTE"
    );
    expect(preparation.learningAdmissionId).toBeTruthy();

    const ports = createMicro039E014ProgressiveBatchPorts();
    const authorization = await authorizeMicro039E014BoundedProgressiveBatchExplicitExecute({
      dbPath,
      authorizedAt: AUTHORIZED_AT,
      micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
      micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
      micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
      micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
    });
    expect(authorization.blockers.join(",")).toBe("");
    expect(authorization.status).toBe("AUTHORIZED");

    const execution = await executeMicro039E014BoundedProgressiveBatch({
      dbPath,
      executedAt: EXECUTED_AT,
      outputRoot,
      ports,
      segmentSynthesisPorts: mockSegmentPorts(),
      measureDurationMs: () => 120,
      skipNarrationConcat: true,
      micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
      micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
      micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
      micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
    });

    expect(execution.status, execution.blockers.join(",")).toBe("DONE");
    expect(execution.episodes).toHaveLength(4);
    expect(execution.episodes.every((episode) => episode.episodeId === "E014")).toBe(
      true
    );
    expect(execution.publicationCalls).toBe(1);
    expect(execution.paidCalls).toBeGreaterThan(0);
    expect(execution.totalCostMinor).toBeGreaterThan(0);
    expect(execution.publishId).toMatch(/^tiktok\.publish\.micro-039-e014\./);
    expect(execution.observationAudit.status).toBe("PASSED");

    const blockedOutOfScope = await executeMicro039E014BoundedProgressiveBatch({
      dbPath,
      executedAt: EXECUTED_AT,
      outputRoot: path.join(dir, "blocked"),
      ports: createMicro039E014ProgressiveBatchPorts(),
      segmentSynthesisPorts: mockSegmentPorts(),
      measureDurationMs: () => 120,
      skipNarrationConcat: true,
      requestedEpisodeIds: ["E015"],
      micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
      micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
      micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
      micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
    });
    expect(blockedOutOfScope.status).toBe("BLOCKED");
    expect(
      blockedOutOfScope.blockers.some((blocker) => blocker.includes("E015"))
    ).toBe(true);

    const { createPersistence, MicrodramaSQLiteRepository } = await import(
      "@mediaforge/persistence"
    );
    const sqlite = createPersistence(dbPath);
    const repo = new MicrodramaSQLiteRepository(sqlite);
    const stored = repo.getProjection(MICRO_039_E014_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY);
    expect(stored?.projection.publicationCalls).toBe(1);
  }, 180_000);

  it.runIf(process.env.MICRO_039_E014_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_039_E014_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro039E014BoundedProgressiveBatchAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-039-e014-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-039-e014-authorization-evidence.v1",
            taskId: "MICRO-039-E014",
            dbPath,
            preparedAt,
            ...result,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
    }
  );

  it.runIf(process.env.MICRO_039_E014_OPERATOR_EXECUTE === "1")(
    "executes workspace operator progressive E014 batch",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_039_E014_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const executedAt = process.env.MICRO_039_E014_EXECUTED_AT ?? new Date().toISOString();
      const outputRoot = path.join(repoRoot, ".artifacts/microdrama/micro-039-e014-batch");
      const ports = createMicro039E014ProgressiveBatchPorts();

      const preparation = await prepareMicro039E014BoundedProgressiveBatchAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: executedAt,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro039E014BoundedProgressiveBatchExplicitExecute({
        dbPath,
        authorizedAt: executedAt,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro039E014BoundedProgressiveBatch({
        dbPath,
        executedAt,
        outputRoot,
        ports,
        segmentSynthesisPorts: mockSegmentPorts(),
        measureDurationMs: () => 120,
        skipNarrationConcat: true,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-039-e014-batch-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-039-e014-batch-execution-evidence.v1",
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

  it.runIf(process.env.MICRO_039_E014_LIVE_TTS === "1")(
    "executes workspace operator progressive E014 batch with live OpenAI TTS",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath =
        process.env.MICRO_039_E014_DB_PATH ?? path.join(repoRoot, ".mediaforge.sqlite");
      const executedAt =
        process.env.MICRO_039_E014_EXECUTED_AT ?? new Date().toISOString();
      const outputRoot = path.join(
        repoRoot,
        ".artifacts/microdrama/micro-039-e014-live-tts-batch"
      );
      const ports = createMicro039E014ProgressiveBatchPorts();

      const preparation = await prepareMicro039E014BoundedProgressiveBatchAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: executedAt,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });
      expect(preparation.status, preparation.blockers.join(",")).toBe(
        "READY_FOR_EXPLICIT_EXECUTE"
      );

      const authorization = await authorizeMicro039E014BoundedProgressiveBatchExplicitExecute({
        dbPath,
        authorizedAt: executedAt,
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro039E014BoundedProgressiveBatch({
        dbPath,
        executedAt,
        outputRoot,
        ports,
        segmentSynthesisPorts: createMicro039OpenAiSegmentSynthesisPorts(),
        micro036EvidenceJsonPath: DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
        micro038EvidenceJsonPath: DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
        micro039E013EvidenceJsonPath: DEFAULT_MICRO_039_E013_BATCH_EVIDENCE_JSON_PATH,
        micro042EvidenceJsonPath: DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-039-e014-live-tts-batch-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-039-e014-live-tts-batch-execution-evidence.v1",
            dbPath,
            executedAt,
            outputRoot,
            publicationCalls: execution.publicationCalls,
            ...execution,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(execution.status, execution.blockers.join(",")).toBe("DONE");
      expect(execution.paidCalls).toBeGreaterThan(0);
      expect(execution.publicationCalls).toBe(1);
    },
    900_000
  );
});
