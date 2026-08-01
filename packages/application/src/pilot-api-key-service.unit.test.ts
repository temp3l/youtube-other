import { describe, expect, it, vi } from "vitest";

import {
  DurablePilotApiKeyAuthenticator,
  PilotApiKeyService,
  fingerprintPilotApiKey,
  parsePilotApiKeyWorkspace,
  type DurablePilotApiKeyCandidate,
  type DurablePilotApiKeyRecord,
  type DurablePilotApiKeyRepository,
} from "./pilot-api-key-service.js";

const record: DurablePilotApiKeyRecord = {
  workspaceId: "workspace-1",
  keyId: "key-1",
  principalId: "service-1",
  permissions: ["content.read", "workflow.start"],
  expiresAt: "2026-08-02T00:00:00.000Z",
  revokedAt: null,
  revision: 0,
};

function repository(): DurablePilotApiKeyRepository {
  return {
    issue: vi.fn(async () => record),
    rotate: vi.fn(async () => ({ ...record, keyId: "key-2" })),
    revoke: vi.fn(async () => ({ ...record, revokedAt: "2026-08-01T13:00:00.000Z", revision: 1 })),
    findActiveByFingerprint: vi.fn(async () => null),
  };
}

describe("durable pilot API keys", () => {
  it("returns plaintext only from show-once issuance while persisting hashes", async () => {
    const store = repository();
    const service = new PilotApiKeyService(store, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      createId: (kind) => `${kind}-1`,
      randomBytes: () => Buffer.alloc(32, 7),
    });
    const issued = await service.issue({
      workspaceId: "workspace-1",
      principalId: "service-1",
      permissions: ["workflow.start", "content.read"],
      expiresAt: record.expiresAt,
      actorSubject: "operator-1",
    });
    expect(issued.token).toMatch(/^mfk_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
    expect(parsePilotApiKeyWorkspace(issued.token)).toBe("workspace-1");
    const persisted = vi.mocked(store.issue).mock.calls[0]![0];
    expect(persisted.lookupFingerprint).toBe(fingerprintPilotApiKey(issued.token));
    expect(persisted.secretHash).toMatch(/^scrypt\$v1\$/u);
    expect(JSON.stringify(persisted)).not.toContain(issued.token);
  });

  it("atomically rotates through the repository and returns only the new token", async () => {
    const store = repository();
    const service = new PilotApiKeyService(store, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      createId: (kind) => `${kind}-2`,
      randomBytes: () => Buffer.alloc(32, 9),
    });
    const rotated = await service.rotate({
      workspaceId: "workspace-1",
      previousKeyId: "key-1",
      previousExpectedRevision: 0,
      principalId: "service-1",
      permissions: ["content.read"],
      expiresAt: record.expiresAt,
      actorSubject: "operator-1",
    });
    expect(rotated.key.keyId).toBe("key-2");
    expect(store.rotate).toHaveBeenCalledWith(expect.objectContaining({ previousKeyId: "key-1", previousExpectedRevision: 0 }));
  });

  it("authenticates by fingerprint plus scrypt and intersects current principal permissions", async () => {
    const issueStore = repository();
    const service = new PilotApiKeyService(issueStore, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      createId: (kind) => `${kind}-3`,
      randomBytes: () => Buffer.alloc(32, 11),
    });
    const issued = await service.issue({ workspaceId: "workspace-1", principalId: "service-1", permissions: record.permissions, expiresAt: record.expiresAt, actorSubject: "operator-1" });
    const persisted = vi.mocked(issueStore.issue).mock.calls[0]![0];
    const candidate: DurablePilotApiKeyCandidate = {
      ...record,
      secretHash: persisted.secretHash,
      principalPermissions: ["content.read"],
    };
    const authStore = repository();
    authStore.findActiveByFingerprint = vi.fn(async () => candidate);
    const authenticator = new DurablePilotApiKeyAuthenticator(authStore, () => new Date("2026-08-01T12:30:00.000Z"));
    await expect(authenticator.authenticate(issued.token)).resolves.toEqual({
      workspaceId: "workspace-1",
      principalId: "service-1",
      kind: "service",
      permissions: ["content.read"],
    });
    await expect(authenticator.authenticate(`${issued.token}x`)).resolves.toBeNull();
  });
});
