import { describe, expect, it, vi } from "vitest";

import {
  FeatureGatedPublicationExecutor,
  resolvePublicationExecutionCapability,
  type PublicationExecutionIntent,
} from "./publication-execution.js";

const intent: PublicationExecutionIntent = {
  workspaceId: "workspace-1", publicationId: "publication-1", projectId: "project-1", runId: "run-1",
  approvalId: "approval-1", approvalRevision: 1, approvalArtifactHash: "a".repeat(64), approvalPolicy: "scoped-v1",
  actorPrincipalId: "publisher-1", actorPrincipalRevision: 2, credentialVersion: "credential-1", assetHash: "b".repeat(64),
  artifactBindings: [{ assetId: "video-1", role: "video", contentHash: "b".repeat(64) }],
  metadataRevisionId: "metadata-1", metadataContentHash: "c".repeat(64), channelId: "channel-1", visibility: "public",
  scheduledAt: null, playlistIds: [], recoveryIdentity: "recovery-1", status: "pending",
};

function fixture(overrides: { readonly enabled?: boolean; readonly begin?: boolean; readonly heartbeat?: boolean; readonly upload?: () => Promise<{ providerObjectId: string; evidence: unknown }>; readonly metadata?: () => Promise<unknown> } = {}) {
  const calls: string[] = [];
  const publications = {
    get: vi.fn(async () => intent),
    claimIntentLease: vi.fn(async () => ({ leaseFence: 4 })),
    beginExecution: vi.fn(async () => overrides.begin ?? true),
    markPublished: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
    markReconciliationRequired: vi.fn(async () => true),
  };
  const channels = {
    claim: vi.fn(async () => ({ leaseFence: 8 })),
    heartbeat: vi.fn(async () => (overrides.heartbeat === false ? null : { leaseFence: 8 })),
    release: vi.fn(async () => true),
  };
  const provider = {
    uploadPrivate: vi.fn(async () => {
      calls.push("upload-private");
      return overrides.upload ? overrides.upload() : { providerObjectId: "video-1", evidence: { private: true } };
    }),
    validateProcessing: vi.fn(async () => { calls.push("processing"); return { processed: true }; }),
    updateMetadata: vi.fn(async () => { calls.push("metadata"); return overrides.metadata ? overrides.metadata() : { updated: true }; }),
    transitionVisibility: vi.fn(async () => { calls.push("visibility"); return { visibility: "public" }; }),
  };
  const executor = new FeatureGatedPublicationExecutor(
    { enabled: overrides.enabled ?? true }, publications, channels,
    { assertCurrent: vi.fn(async () => undefined) },
    { load: vi.fn(async () => ({ title: "Bound metadata" })) }, provider,
    { workerId: "worker-1", leaseSeconds: 60, metadataRetries: 2, now: () => new Date("2026-08-09T12:00:00Z") }
  );
  return { executor, publications, channels, provider, calls };
}

describe("feature-gated publication execution", () => {
  it("defaults the platform capability to off", () => {
    expect(resolvePublicationExecutionCapability()).toEqual({ enabled: false });
    expect(resolvePublicationExecutionCapability({ enabled: true })).toEqual({ enabled: true });
  });

  it("makes zero provider or lease mutations while the platform flag is off", async () => {
    const test = fixture({ enabled: false });
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "disabled" });
    expect(test.provider.uploadPrivate).not.toHaveBeenCalled();
    expect(test.channels.claim).not.toHaveBeenCalled();
    expect(test.publications.beginExecution).not.toHaveBeenCalled();
  });

  it("fences private upload, processing, metadata, and intended visibility before committing one audited receipt", async () => {
    const test = fixture();
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "published" });
    expect(test.calls).toEqual(["upload-private", "processing", "metadata", "visibility"]);
    expect(test.provider.uploadPrivate).toHaveBeenCalledWith(expect.objectContaining({ executionFence: 8, intent: expect.objectContaining({ visibility: "public" }) }));
    expect(test.publications.markPublished).toHaveBeenCalledWith(expect.objectContaining({ channelLeaseFence: 8, receipt: expect.objectContaining({ recoveryIdentity: "recovery-1", providerObjectId: "video-1" }) }));
    expect(test.channels.heartbeat).toHaveBeenCalledTimes(4);
  });

  it("does not mutate when immediate authority recheck loses a stale approval or credential", async () => {
    const test = fixture({ begin: false });
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "authority_rejected" });
    expect(test.provider.uploadPrivate).not.toHaveBeenCalled();
    expect(test.publications.markPublished).not.toHaveBeenCalled();
  });

  it("routes every ambiguous upload boundary fault to reconciliation without a second upload", async () => {
    const test = fixture({ upload: async () => { throw new Error("connection lost after provider acceptance"); } });
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "reconciliation_required" });
    expect(test.provider.uploadPrivate).toHaveBeenCalledOnce();
    expect(test.publications.markReconciliationRequired).toHaveBeenCalledWith(expect.objectContaining({ evidence: expect.objectContaining({ stage: "private_upload" }) }));
    expect(test.provider.updateMetadata).not.toHaveBeenCalled();
  });

  it("performs bounded metadata-only retries after exactly one private upload", async () => {
    let metadataAttempts = 0;
    const test = fixture({ metadata: async () => {
      metadataAttempts += 1;
      if (metadataAttempts < 3) throw new Error("temporary metadata outage");
      return { updated: true };
    } });
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "published" });
    expect(test.provider.uploadPrivate).toHaveBeenCalledOnce();
    expect(test.provider.updateMetadata).toHaveBeenCalledTimes(3);
    expect(test.provider.transitionVisibility).toHaveBeenCalledOnce();
  });

  it("does not invoke a provider command after a late channel fence", async () => {
    const test = fixture({ heartbeat: false });
    await expect(test.executor.execute({ workspaceId: intent.workspaceId, projectId: intent.projectId, publicationId: intent.publicationId }))
      .resolves.toEqual({ kind: "authority_rejected" });
    expect(test.provider.uploadPrivate).not.toHaveBeenCalled();
    expect(test.publications.beginExecution).not.toHaveBeenCalled();
  });
});
