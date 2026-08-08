import { describe, expect, it } from "vitest";

import {
  COMMAND_SECURITY_SCHEMA_VERSION,
  type WorkspaceMembership,
} from "./command-security-contracts.js";
import {
  assertPlatformInvariantNotOverridden,
  assertWorkspaceBoundary,
  buildImmutableAuditEnvelope,
  computeRequestFingerprint,
  computeScopedIdempotencyKey,
  evaluateActionAuthorization,
  evaluateIdempotencyReplay,
  evaluateOptimisticConcurrency,
  redactSecretsForAudit,
} from "./command-security.js";

const evaluatedAt = "2026-08-08T12:00:00.000Z";

function membership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
    workspaceId: "workspace-1",
    principalId: "principal-1",
    oidcSubject: "issuer|subject-1",
    kind: "user",
    role: "member",
    permissions: ["content.write", "workflow.start", "approval.decide"],
    revision: 2,
    active: true,
    ...overrides,
  };
}

describe("command security invariants", () => {
  it("blocks BOLA when membership workspace differs from requested workspace", () => {
    const violation = assertWorkspaceBoundary({
      membership: membership(),
      workspaceId: "workspace-2",
    });
    expect(violation).toEqual(
      expect.objectContaining({ code: "tenant_boundary_violation" })
    );
  });

  it("rejects revoked membership during authorization", () => {
    const result = evaluateActionAuthorization({
      membership: membership({
        active: false,
        revokedAt: evaluatedAt,
        revokedBySubject: "operator-1",
        revocationReason: "access removed",
      }),
      workspaceId: "workspace-1",
      actionId: "workflow.start",
      evaluatedAt,
    });
    expect(result.allowed).toBe(false);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "membership_revoked" }),
      ])
    );
  });

  it("detects stale optimistic concurrency preconditions", () => {
    const stale = evaluateOptimisticConcurrency({
      resourceRevision: 4,
      ifMatchRevision: 3,
    });
    expect(stale).toEqual(
      expect.objectContaining({ code: "precondition_stale" })
    );
  });

  it("replays identical idempotency fingerprints and conflicts on changed payload", () => {
    const scope = {
      schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
      workspaceId: "workspace-1",
      principalId: "principal-1",
      method: "POST" as const,
      normalizedRoute:
        "/v1/workspaces/workspace-1/projects/p1/episodes/e1/workflow-runs",
      clientKey: "idem-1",
    };
    const fingerprint = computeRequestFingerprint({
      episodeRevision: 2,
      locales: ["en"],
      variants: ["full"],
    });
    const scopedKey = computeScopedIdempotencyKey(scope);
    const replay = evaluateIdempotencyReplay({
      scope,
      fingerprint,
      existing: {
        scopedKey,
        fingerprint,
        commandId: "cmd-1",
        response: { workflowRunId: "run-1" },
        createdAt: evaluatedAt,
      },
    });
    expect(replay.outcome).toBe("replay");
    expect(replay.replayResponse).toEqual({ workflowRunId: "run-1" });

    const conflict = evaluateIdempotencyReplay({
      scope,
      fingerprint: computeRequestFingerprint({
        episodeRevision: 3,
        locales: ["en"],
        variants: ["full"],
      }),
      existing: {
        scopedKey,
        fingerprint,
        commandId: "cmd-1",
        response: { workflowRunId: "run-1" },
        createdAt: evaluatedAt,
      },
    });
    expect(conflict.outcome).toBe("conflict");
    expect(conflict.conflict).toEqual(
      expect.objectContaining({ code: "idempotency_conflict" })
    );
  });

  it("redacts secrets from audit payloads", () => {
    const redacted = redactSecretsForAudit({
      apiKey: "mfk_test_secret_value_1234567890",
      nested: { authorization: "Bearer abc.def.ghi" },
      title: "Episode title",
    });
    expect(redacted).toEqual({
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
      title: "Episode title",
    });
  });

  it("requires confirmation for destructive publishing actions", () => {
    const denied = evaluateActionAuthorization({
      membership: membership({
        role: "admin",
        permissions: ["publication.execute", "workspace.admin"],
      }),
      workspaceId: "workspace-1",
      actionId: "publication.execute",
      evaluatedAt,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "confirmation_required" }),
        expect.objectContaining({ code: "step_up_required" }),
      ])
    );
  });

  it("allows owner override only for permitted actions and never platform invariants", () => {
    const overrideAllowed = evaluateActionAuthorization({
      membership: membership({
        role: "owner",
        permissions: ["workspace.admin"],
      }),
      workspaceId: "workspace-1",
      actionId: "workflow.cancel",
      overrideRequested: true,
      confirmation: {
        schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
        actionId: "workflow.cancel",
        rationale: "Stop runaway workflow.",
      },
      evaluatedAt,
    });
    expect(overrideAllowed.allowed).toBe(true);

    const invariant = assertPlatformInvariantNotOverridden({
      invariant: "idempotency_integrity",
      overrideRequested: true,
    });
    expect(invariant).toEqual(
      expect.objectContaining({ code: "platform_invariant_violation" })
    );
  });

  it("builds tenant-safe immutable audit envelopes with redacted state", () => {
    const envelope = buildImmutableAuditEnvelope({
      auditId: "audit-1",
      workspaceId: "workspace-1",
      membership: membership(),
      action: "episode.update",
      commandId: "cmd-1",
      resourceType: "episode",
      resourceId: "episode-1",
      resourceRevision: 3,
      correlationId: "request-1",
      beforeState: { title: "Old", apiKey: "mfk_secret" },
      afterState: { title: "New" },
      occurredAt: evaluatedAt,
    });
    expect(envelope.workspaceId).toBe("workspace-1");
    expect(envelope.beforeState).toEqual({ title: "Old", apiKey: "[REDACTED]" });
    expect(envelope.auditId).toBe("audit-1");
  });
});
