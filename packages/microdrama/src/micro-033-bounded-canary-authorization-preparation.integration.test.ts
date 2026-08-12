import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  prepareMicro033BoundedCanaryAuthorization,
} from "./micro-033-bounded-canary-authorization-preparation.js";
import {
  computeMicro033ProviderConfigRevision,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES,
} from "./micro-033-canary-bindings.js";
import { MICRO_033_OPENAI_CREDENTIAL_HANDLE } from "./microdrama-openai-speech-credential.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const PREPARED_AT = "2026-08-12T06:00:00.000Z";

describe("MICRO-033 bounded canary authorization preparation", () => {
  it("persists approvals and passes preflight without dispatching TTS", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-used-for-network";

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-033-prep-"));
      const dbPath = path.join(dir, "microdrama.sqlite");

      const result = await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
      expect(result.voiceRevision).toBe(SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID);
      expect(result.voiceBindingStatus).toBe("CANARY_APPROVED");
      expect(result.credentialHandle).toBe(MICRO_033_OPENAI_CREDENTIAL_HANDLE);
      expect(result.costLimitMinor).toBe(199);
      expect(result.maximumProviderRequests).toBe(111);
      expect(result.operatorAuthorizationId).toBe("auth.micro-033.bounded-canary");
      expect(result.assetGenerationApprovalId).toBe(
        "approval.micro-033.asset-generation"
      );
      expect(result.costBudgetApprovalId).toBe("cost-budget-approval.micro-033");
      expect(computeMicro033ProviderConfigRevision()).toBe(
        "a5b5a465a3c8cb33cb71467421e0e7d9471143342cecbb88511e5c9ff2a967e9"
      );
      expect(MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES.E001).toHaveLength(64);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it("blocks when OpenAI secret is not configured", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousToken = process.env.OPENAI_API_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_TOKEN;

    try {
      const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-033-prep-"));
      const dbPath = path.join(dir, "microdrama.sqlite");

      const result = await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt: PREPARED_AT,
      });

      expect(result.status).toBe("BLOCKED");
      expect(result.blockers).toContain("OPENAI_SECRET_REQUIRED");
      expect(result.credentialHandle).toBeNull();
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
      if (previousToken === undefined) {
        delete process.env.OPENAI_API_TOKEN;
      } else {
        process.env.OPENAI_API_TOKEN = previousToken;
      }
    }
  });

  it.runIf(process.env.MICRO_033_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database without dispatching TTS",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_033_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro033BoundedCanaryAuthorization({
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
      });

      const evidence = {
        schemaVersion: "mediaforge.microdrama.micro-033-authorization-evidence.v1",
        taskId: "MICRO-033",
        dbPath,
        admittedAt: ADMITTED_AT,
        preparedAt,
        operatorId: "operator.microdrama",
        externalCalls: {
          tts: 0,
          openAiApi: 0,
          paidProvider: 0,
          publication: 0,
        },
        ...result,
      };

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-033-authorization-evidence.json"
        ),
        `${JSON.stringify(evidence, null, 2)}\n`,
        "utf8"
      );

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
      expect(result.credentialHandle).toBe(MICRO_033_OPENAI_CREDENTIAL_HANDLE);
    }
  );
});
