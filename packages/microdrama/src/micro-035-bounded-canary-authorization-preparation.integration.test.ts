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
import { prepareMicro034BoundedCanaryAuthorization } from "./micro-034-bounded-canary-authorization-preparation.js";
import {
  authorizeMicro034BoundedCanaryExplicitExecute,
  createMicro034MockVisualProductionPort,
  executeMicro034BoundedVisualCanary,
} from "./micro-034-bounded-visual-canary-execute.js";
import { prepareMicro035BoundedCanaryAuthorization } from "./micro-035-bounded-canary-authorization-preparation.js";
import {
  computeMicro035ProviderConfigRevision,
  MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_035_CANARY_LOCALES,
  MICRO_035_VISUAL_PROFILE_REVISION,
} from "./micro-035-canary-bindings.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const PREPARED_AT = "2026-08-12T06:00:00.000Z";
const EXECUTED_AT = "2026-08-12T08:00:00.000Z";

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

describe("MICRO-035 bounded canary authorization preparation", () => {
  it("persists approvals and passes preflight when MICRO-034 evidence exists", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-035-prep-"));
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
            writeFileSync(outputPath, Buffer.from("mock"), "utf8");
          }
        },
      });

      const result = await prepareMicro035BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
      expect(result.visualProfileRevision).toBe(MICRO_035_VISUAL_PROFILE_REVISION);
      expect(result.costLimitMinor).toBe(MICRO_035_CANARY_COST_LIMIT_MINOR);
      expect(result.maximumProviderRequests).toBe(
        MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS
      );
      expect(result.operatorAuthorizationId).toBe("auth.micro-035.bounded-canary");
      expect(result.assetGenerationApprovalId).toBe(
        "approval.micro-035.asset-generation"
      );
      expect(result.costBudgetApprovalId).toBe("cost-budget-approval.micro-035");
      expect(result.scriptRevisionIds.length).toBe(9);
      expect(result.sharedVisualRevisionIds.length).toBe(3);
      expect(computeMicro035ProviderConfigRevision()).toHaveLength(64);
      expect(MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES["de-DE"].E001).toHaveLength(64);
      expect(MICRO_035_CANARY_LOCALES.length).toBe(3);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it("blocks when MICRO-034 execution evidence is missing", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-035-prep-"));
      const dbPath = path.join(dir, "microdrama.sqlite");

      const result = await prepareMicro035BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });

      expect(result.status).toBe("BLOCKED");
      expect(result.blockers).toContain("MICRO_034_EVIDENCE_MISSING");
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it.runIf(process.env.MICRO_035_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_035_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro035BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-035-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-035-authorization-evidence.v1",
            taskId: "MICRO-035",
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
});
