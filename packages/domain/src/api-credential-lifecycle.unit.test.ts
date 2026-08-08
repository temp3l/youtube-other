import { describe, expect, it } from "vitest";

import {
  buildApiCredentialIssueResult,
  buildDeveloperJourneyExamples,
  evaluateApiCredentialIssueReplay,
  projectApiCredentialRecord,
} from "./api-credential-lifecycle.js";
import { redactApiCredentialAuditPayload } from "./api-credential-contracts.js";

const evaluatedAt = "2026-08-08T12:00:00.000Z";

function credentialRecord() {
  return projectApiCredentialRecord({
    workspaceId: "workspace-1",
    keyId: "key-1",
    name: "integration",
    principalId: "service-1",
    permissions: ["content.read", "workflow.start"],
    expiresAt: "2026-08-09T12:00:00.000Z",
    revokedAt: null,
    revision: 0,
    createdAt: evaluatedAt,
    updatedAt: evaluatedAt,
    evaluatedAt,
  });
}

describe("api credential lifecycle", () => {
  it("replays identical issue idempotency without returning the secret", () => {
    const body = {
      name: "integration",
      principalId: "service-1",
      permissions: ["content.read"],
      expiresAt: "2026-08-09T12:00:00.000Z",
    };
    const existing = {
      requestFingerprint: computeFingerprint(body),
      keyId: "key-1",
      createdAt: evaluatedAt,
    };
    const { replay } = evaluateApiCredentialIssueReplay({
      scope: {
        workspaceId: "workspace-1",
        principalId: "admin-1",
        idempotencyKey: "issue-1",
      },
      requestBody: body,
      existing,
    });
    expect(replay.outcome).toBe("replay");
    const result = buildApiCredentialIssueResult({
      credential: credentialRecord(),
      replayed: true,
    });
    expect(result.token).toBeUndefined();
    expect(result.showOnce).toBe(false);
  });

  it("conflicts when the idempotency key is reused with a changed payload", () => {
    const { replay } = evaluateApiCredentialIssueReplay({
      scope: {
        workspaceId: "workspace-1",
        principalId: "admin-1",
        idempotencyKey: "issue-1",
      },
      requestBody: { name: "changed" },
      existing: {
        requestFingerprint: computeFingerprint({ name: "original" }),
        keyId: "key-1",
        createdAt: evaluatedAt,
      },
    });
    expect(replay.outcome).toBe("conflict");
  });

  it("redacts secrets from audit payloads", () => {
    expect(
      redactApiCredentialAuditPayload({
        keyId: "key-1",
        token: "mfk_workspace.secret",
        secretHash: "scrypt$v1$...",
      })
    ).toEqual({ keyId: "key-1" });
  });

  it("builds developer journey examples from canonical SDK operations", () => {
    const journey = buildDeveloperJourneyExamples(evaluatedAt);
    expect(journey.steps.map((step) => step.operationId)).toEqual([
      "createProject",
      "createEpisode",
      "admitWorkflow",
      "getJob",
    ]);
  });
});

function computeFingerprint(body: unknown): string {
  return evaluateApiCredentialIssueReplay({
    scope: {
      workspaceId: "workspace-1",
      principalId: "admin-1",
      idempotencyKey: "probe",
    },
    requestBody: body,
  }).requestFingerprint;
}
