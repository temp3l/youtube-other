import {
  canonicalPublishEpisodeInputSchema,
  publicationAssetHash,
  publicationMetadataHash,
  type CanonicalPublishEpisodeInput,
} from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  CanonicalPublishEpisodeExecutor,
  PublishEpisodeExecutionError,
  type CanonicalPublicationChannelLeasePort,
  type CanonicalPublicationIntentPort,
  type PublishEpisodeMutationOutcome,
} from "./publish-episode.js";

type State =
  | "pending"
  | "executing"
  | "published"
  | "failed"
  | "reconciliation_required"
  | "cancelled";

function canonicalInput(): CanonicalPublishEpisodeInput {
  const metadata = {
    title: "Canonical publication",
    description: "Approved description",
    tags: ["architecture"],
    categoryId: "27",
    privacyStatus: "private" as const,
    madeForKids: false,
    notifySubscribers: false,
    publishAt: null,
  };
  const bindings = [
    { assetId: "asset-video-1", role: "video", contentHash: "a".repeat(64) },
    {
      assetId: "asset-metadata-1",
      role: "metadata",
      contentHash: publicationMetadataHash(metadata),
    },
  ];
  return canonicalPublishEpisodeInputSchema.parse({
    workspaceId: "workspace-1",
    projectId: "project-1",
    workflowRunId: "workflow-1",
    episodeId: "episode-001",
    taskId: "darktruth.publish",
    attemptId: "attempt-1",
    publicationId: "publication-1",
    approval: {
      id: "approval-1",
      revision: 3,
      artifactHash: "b".repeat(64),
      policy: "scoped-v1",
    },
    actor: { principalId: "principal-1", revision: 4 },
    credentialVersion: "credential-v2",
    artifacts: {
      aggregateHash: publicationAssetHash(bindings),
      bindings,
    },
    target: {
      channelId: "channel-1",
      visibility: "private",
      scheduledAt: null,
      playlistIds: [],
    },
    recoveryIdentity: "recovery-publication-1",
    providerRequest: {
      expectedChannelId: "channel-1",
      recoveryIdentity: "recovery-publication-1",
      video: {
        absolutePath: "/fixture/video.mp4",
        contentHash: "a".repeat(64),
      },
      metadata,
      metadataContentHash: publicationMetadataHash(metadata),
    },
    leaseSeconds: 60,
  });
}

function harness(options: {
  readonly initialState?: State;
  readonly authorityValid?: boolean;
  readonly heartbeatCurrent?: boolean;
  readonly mutation?: PublishEpisodeMutationOutcome;
  readonly reconciliationMatches?: 0 | 1 | 2;
  readonly rejectAdmission?: boolean;
} = {}) {
  const input = canonicalInput();
  let state: State = options.initialState ?? "pending";
  const events: string[] = [];
  const providerReceipt = {
    providerObjectId: "youtube-video-1",
    recoveryIdentity: input.recoveryIdentity,
    evidence: { requestId: "request-1" },
  };
  const binding = {
    projectId: input.projectId,
    runId: input.workflowRunId,
    approvalId: input.approval.id,
    approvalRevision: input.approval.revision,
    approvalArtifactHash: input.approval.artifactHash,
    approvalPolicy: input.approval.policy,
    actorPrincipalId: input.actor.principalId,
    actorPrincipalRevision: input.actor.revision,
    credentialVersion: input.credentialVersion,
    assetHash: input.artifacts.aggregateHash,
    artifactBindings: input.artifacts.bindings,
    channelId: input.target.channelId,
    visibility: input.target.visibility,
    scheduledAt: input.target.scheduledAt,
    playlistIds: input.target.playlistIds,
    recoveryIdentity: input.recoveryIdentity,
  } as const;
  const admit = vi.fn(async () => {
    events.push("intent-admitted");
    if (options.rejectAdmission) throw new Error("idempotency fingerprint conflict");
    return { kind: "admitted" };
  });
  const getForEpisode = vi.fn(async () => ({
    ...binding,
    workspaceId: input.workspaceId,
    publicationId: input.publicationId,
    status: state,
    revision: 2,
    executionFence: 7,
    intentLeaseFence: 5,
    channelLeaseFence: 7,
    providerReceipt: state === "published" ? providerReceipt : null,
    terminalEvidence: null,
  }));
  const intents: CanonicalPublicationIntentPort = {
    admit,
    getForEpisode,
    claimIntentLease: vi.fn(async () => ({
      publicationId: input.publicationId,
      workerId: "darktruth.publish:attempt-1",
      leaseFence: 5,
      leaseExpiresAt: "2026-08-11T12:01:00.000Z",
    })),
    beginExecution: vi.fn(async () => {
      if (options.authorityValid === false) return false;
      state = "executing";
      events.push("execution-fenced");
      return true;
    }),
    markPublished: vi.fn(async () => {
      if (state !== "executing") return false;
      state = "published";
      events.push("published-recorded");
      return true;
    }),
    markFailed: vi.fn(async () => {
      if (state !== "executing") return false;
      state = "failed";
      return true;
    }),
    markReconciliationRequired: vi.fn(async () => {
      if (state !== "executing") return false;
      state = "reconciliation_required";
      events.push("ambiguity-recorded");
      return true;
    }),
  };
  const channelLeases: CanonicalPublicationChannelLeasePort = {
    claim: vi.fn(async () => ({
      leaseOwner: "darktruth.publish:attempt-1",
      leaseFence: 7,
      leaseExpiresAt: "2026-08-11T12:01:00.000Z",
    })),
    heartbeat: vi.fn(async () =>
      options.heartbeatCurrent === false ? null : { leaseFence: 7 }
    ),
    release: vi.fn(async () => true),
  };
  const publishOnce = vi.fn(async () => {
    events.push("provider-called");
    return (
      options.mutation ?? {
        kind: "succeeded",
        receipt: providerReceipt,
      }
    );
  });
  const reconcile = vi.fn(async () => {
    const count = options.reconciliationMatches ?? 1;
    if (count === 1) {
      state = "published";
      return { kind: "published" as const, receipt: providerReceipt };
    }
    return {
      kind: "reconciliation_required" as const,
      reason: count === 0 ? ("no_match" as const) : ("multiple_matches" as const),
    };
  });
  const executor = new CanonicalPublishEpisodeExecutor({
    intents,
    channelLeases,
    mutation: { publishOnce },
    reconciliation: { reconcile },
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });
  return {
    executor,
    input,
    intents,
    channelLeases,
    publishOnce,
    reconcile,
    events,
  };
}

describe("CanonicalPublishEpisodeExecutor", () => {
  it("persists and fences immutable intent before one provider mutation, then replays idempotently", async () => {
    const fixture = harness();
    await expect(fixture.executor.execute(fixture.input)).resolves.toMatchObject({
      kind: "published",
      reconciled: false,
    });
    expect(fixture.events).toEqual([
      "intent-admitted",
      "execution-fenced",
      "provider-called",
      "published-recorded",
    ]);
    await expect(fixture.executor.execute(fixture.input)).resolves.toEqual({
      kind: "already-published",
      publicationId: "publication-1",
    });
    expect(fixture.publishOnce).toHaveBeenCalledTimes(1);
  });

  it("fails closed on missing identity, invalid approval authority, changed artifacts, and stale fences", async () => {
    const invalidIdentity = harness();
    await expect(
      invalidIdentity.executor.execute({
        ...invalidIdentity.input,
        workspaceId: "",
      })
    ).rejects.toMatchObject({ code: "invalid_canonical_publication" });
    expect(invalidIdentity.publishOnce).not.toHaveBeenCalled();

    const invalidApproval = harness({ authorityValid: false });
    await expect(
      invalidApproval.executor.execute(invalidApproval.input)
    ).rejects.toMatchObject({ code: "publication_authority_rejected" });
    expect(invalidApproval.publishOnce).not.toHaveBeenCalled();

    const changedArtifact = harness({ rejectAdmission: true });
    await expect(
      changedArtifact.executor.execute(changedArtifact.input)
    ).rejects.toBeInstanceOf(PublishEpisodeExecutionError);
    expect(changedArtifact.publishOnce).not.toHaveBeenCalled();

    const staleFence = harness({ heartbeatCurrent: false });
    await expect(staleFence.executor.execute(staleFence.input)).resolves.toMatchObject({
      kind: "failed-before-effect",
    });
    expect(staleFence.publishOnce).not.toHaveBeenCalled();
  });

  it("persists ambiguous outcomes and never blindly retries videos.insert", async () => {
    const fixture = harness({
      mutation: {
        kind: "ambiguous",
        evidence: { category: "transport-timeout" },
      },
    });
    await expect(fixture.executor.execute(fixture.input)).resolves.toMatchObject({
      kind: "reconciliation-required",
      reason: "ambiguous-provider-result",
    });
    await expect(fixture.executor.execute(fixture.input)).resolves.toMatchObject({
      kind: "published",
      reconciled: true,
    });
    expect(fixture.publishOnce).toHaveBeenCalledTimes(1);
    expect(fixture.reconcile).toHaveBeenCalledTimes(1);
  });

  it("recovers crash-equivalent executing state through read-only reconciliation", async () => {
    const fixture = harness({ initialState: "executing" });
    await expect(fixture.executor.execute(fixture.input)).resolves.toMatchObject({
      kind: "published",
      reconciled: true,
    });
    expect(fixture.intents.markReconciliationRequired).toHaveBeenCalledWith(
      expect.objectContaining({ channelLeaseFence: 7 })
    );
    expect(fixture.publishOnce).not.toHaveBeenCalled();
  });

  it.each([
    [0, "no_match"],
    [2, "multiple_matches"],
  ] as const)(
    "keeps reconciliation required for %i provider matches",
    async (matches, reason) => {
      const fixture = harness({
        initialState: "reconciliation_required",
        reconciliationMatches: matches,
      });
      await expect(fixture.executor.execute(fixture.input)).resolves.toMatchObject({
        kind: "reconciliation-required",
        reason,
      });
      expect(fixture.publishOnce).not.toHaveBeenCalled();
    }
  );
});
