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
  computeMicro034ProviderConfigRevision,
  MICRO_034_AUTHORIZATION_PACK_SCRIPT_HASHES,
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_034_VISUAL_PROFILE_REVISION,
} from "./micro-034-canary-bindings.js";

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

describe("MICRO-034 bounded canary authorization preparation", () => {
  it("persists approvals and passes preflight when MICRO-033 evidence exists", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-034-prep-"));
      const dbPath = path.join(dir, "microdrama.sqlite");
      const ttsOutputRoot = path.join(dir, "micro-033-output");

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

      const result = await prepareMicro034BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
      expect(result.visualProfileRevision).toBe(MICRO_034_VISUAL_PROFILE_REVISION);
      expect(result.costLimitMinor).toBe(MICRO_034_CANARY_COST_LIMIT_MINOR);
      expect(result.maximumProviderRequests).toBe(
        MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS
      );
      expect(result.operatorAuthorizationId).toBe("auth.micro-034.bounded-canary");
      expect(result.assetGenerationApprovalId).toBe(
        "approval.micro-034.asset-generation"
      );
      expect(result.costBudgetApprovalId).toBe("cost-budget-approval.micro-034");
      expect(result.audioRevisionIds.length).toBe(3);
      expect(computeMicro034ProviderConfigRevision()).toHaveLength(64);
      expect(MICRO_034_AUTHORIZATION_PACK_SCRIPT_HASHES.E001).toHaveLength(64);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it("blocks when MICRO-033 execution evidence is missing", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-034-prep-"));
    const dbPath = path.join(dir, "microdrama.sqlite");

    const result = await prepareMicro034BoundedCanaryAuthorization({
      dbPath,
      admittedAt: ADMITTED_AT,
      preparedAt: PREPARED_AT,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.blockers).toContain("MICRO_033_EVIDENCE_MISSING");
  });

  it.runIf(process.env.MICRO_034_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database without dispatching paid visuals",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_034_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro034BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
      });

      const evidence = {
        schemaVersion: "mediaforge.microdrama.micro-034-authorization-evidence.v1",
        taskId: "MICRO-034",
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
        operatorId: "operator.microdrama",
        externalCalls: {
          image: 0,
          video: 0,
          render: 0,
          openAiApi: 0,
          paidProvider: 0,
          publication: 0,
        },
        ...result,
      };

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-034-authorization-evidence.json"
        ),
        `${JSON.stringify(evidence, null, 2)}\n`,
        "utf8"
      );

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
    }
  );
});
