/**
 * Internal, capability-gated publication execution. This deliberately owns no
 * OAuth secret or HTTP route: callers supply a tenant-scoped provider handle.
 * The durable store remains the authority for intent/effect/fence transitions.
 */
export interface PublicationExecutionCapability {
  readonly enabled: boolean;
}

/** Platform-owned deployment capability; omission is deliberately fail-closed. */
export function resolvePublicationExecutionCapability(input?: {
  readonly enabled?: boolean;
}): PublicationExecutionCapability {
  return { enabled: input?.enabled === true };
}

export interface PublicationExecutionIntent {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly approvalArtifactHash: string;
  readonly approvalPolicy: "legacy-v1" | "scoped-v1";
  readonly actorPrincipalId: string;
  readonly actorPrincipalRevision: number;
  readonly credentialVersion: string;
  readonly assetHash: string;
  readonly artifactBindings: readonly {
    readonly assetId: string;
    readonly role: string;
    readonly contentHash: string;
  }[];
  readonly metadataRevisionId: string;
  readonly metadataContentHash: string;
  readonly channelId: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly scheduledAt: string | null;
  readonly playlistIds: readonly string[];
  readonly recoveryIdentity: string;
  readonly status: "pending" | "executing" | "published" | "failed" | "reconciliation_required" | "cancelled";
}

export interface PublicationLease {
  readonly leaseFence: number;
}

export interface PublicationExecutionStore {
  get(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly publicationId: string;
  }): Promise<PublicationExecutionIntent | null>;
  claimIntentLease(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationLease | null>;
  beginExecution(input: PublicationExecutionIntent & {
    readonly workerId: string;
    readonly intentLeaseFence: number;
    readonly channelLeaseFence: number;
    readonly now: string;
  }): Promise<boolean>;
  markPublished(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly receipt: unknown;
    readonly now: string;
  }): Promise<boolean>;
  markFailed(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly evidence: unknown;
    readonly now: string;
  }): Promise<boolean>;
  markReconciliationRequired(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly evidence: unknown;
    readonly eventId: string;
    readonly outboxId: string;
    readonly now: string;
  }): Promise<boolean>;
}

export interface PublicationChannelLeaseStore {
  claim(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationLease | null>;
  /** A live fence must be renewed immediately before every provider mutation. */
  heartbeat(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationLease | null>;
  release(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean>;
}

export interface PublicationConfirmation {
  assertCurrent(input: PublicationExecutionIntent): Promise<void>;
}

export interface PublicationMetadataResolver {
  load(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly metadataRevisionId: string;
    readonly metadataContentHash: string;
  }): Promise<unknown>;
}

export interface PrivateFirstPublicationProvider {
  uploadPrivate(input: {
    readonly intent: PublicationExecutionIntent;
    readonly metadata: unknown;
    readonly executionFence: number;
  }): Promise<{ readonly providerObjectId: string; readonly evidence: unknown }>;
  validateProcessing(input: {
    readonly intent: PublicationExecutionIntent;
    readonly providerObjectId: string;
    readonly executionFence: number;
  }): Promise<unknown>;
  updateMetadata(input: {
    readonly intent: PublicationExecutionIntent;
    readonly providerObjectId: string;
    readonly metadata: unknown;
    readonly executionFence: number;
  }): Promise<unknown>;
  transitionVisibility(input: {
    readonly intent: PublicationExecutionIntent;
    readonly providerObjectId: string;
    readonly executionFence: number;
  }): Promise<unknown>;
}

export interface PublicationExecutionResult {
  readonly kind:
    | "disabled"
    | "not_pending"
    | "lease_unavailable"
    | "authority_rejected"
    | "published"
    | "failed"
    | "reconciliation_required";
}

function evidence(error: unknown, stage: string): unknown {
  return { stage, error: error instanceof Error ? error.message : String(error) };
}

/**
 * The coordinator never retries an upload. Metadata/visibility calls retry a
 * bounded number of times only after a known private receipt exists.
 */
export class FeatureGatedPublicationExecutor {
  public constructor(
    private readonly capability: PublicationExecutionCapability,
    private readonly publications: PublicationExecutionStore,
    private readonly channels: PublicationChannelLeaseStore,
    private readonly confirmation: PublicationConfirmation,
    private readonly metadata: PublicationMetadataResolver,
    private readonly provider: PrivateFirstPublicationProvider,
    private readonly options: {
      readonly workerId: string;
      readonly leaseSeconds: number;
      readonly metadataRetries?: number;
      readonly now?: () => Date;
      readonly createId?: (prefix: string) => string;
    }
  ) {}

  public async execute(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly publicationId: string;
  }): Promise<PublicationExecutionResult> {
    if (!this.capability.enabled) return { kind: "disabled" };
    const intent = await this.publications.get(input);
    if (!intent || intent.status !== "pending") return { kind: "not_pending" };
    const now = () => (this.options.now?.() ?? new Date()).toISOString();
    const intentLease = await this.publications.claimIntentLease({
      workspaceId: intent.workspaceId, publicationId: intent.publicationId,
      workerId: this.options.workerId, leaseSeconds: this.options.leaseSeconds, now: now(),
    });
    if (!intentLease) return { kind: "lease_unavailable" };
    const channelLease = await this.channels.claim({
      workspaceId: intent.workspaceId, channelId: intent.channelId,
      workerId: this.options.workerId, leaseSeconds: this.options.leaseSeconds, now: now(),
    });
    if (!channelLease) return { kind: "lease_unavailable" };
    try {
      await this.confirmation.assertCurrent(intent);
      const metadata = await this.metadata.load({
        workspaceId: intent.workspaceId, projectId: intent.projectId,
        metadataRevisionId: intent.metadataRevisionId,
        metadataContentHash: intent.metadataContentHash,
      });
      // Do not enter the in-flight state when the channel fence is already
      // stale; beginExecution then rechecks the same fence with authority.
      await this.requireLiveFence(intent, channelLease.leaseFence, now());
      const admitted = await this.publications.beginExecution({
        ...intent, workerId: this.options.workerId,
        intentLeaseFence: intentLease.leaseFence,
        channelLeaseFence: channelLease.leaseFence, now: now(),
      });
      if (!admitted) return { kind: "authority_rejected" };

      let uploaded: { readonly providerObjectId: string; readonly evidence: unknown };
      try {
        uploaded = await this.provider.uploadPrivate({
          intent, metadata, executionFence: channelLease.leaseFence,
        });
      } catch (error) {
        await this.markUncertain(intent, channelLease.leaseFence, evidence(error, "private_upload"), now());
        return { kind: "reconciliation_required" };
      }

      try {
        await this.requireLiveFence(intent, channelLease.leaseFence, now());
        const processing = await this.provider.validateProcessing({
          intent, providerObjectId: uploaded.providerObjectId, executionFence: channelLease.leaseFence,
        });
        const metadataEvidence = await this.retryMetadata(() => this.provider.updateMetadata({
          intent, providerObjectId: uploaded.providerObjectId, metadata, executionFence: channelLease.leaseFence,
        }), intent, channelLease.leaseFence, now);
        const visibilityEvidence = await this.retryMetadata(() => this.provider.transitionVisibility({
          intent, providerObjectId: uploaded.providerObjectId, executionFence: channelLease.leaseFence,
        }), intent, channelLease.leaseFence, now);
        const committed = await this.publications.markPublished({
          workspaceId: intent.workspaceId, publicationId: intent.publicationId,
          channelLeaseFence: channelLease.leaseFence,
          receipt: { providerObjectId: uploaded.providerObjectId, recoveryIdentity: intent.recoveryIdentity,
            upload: uploaded.evidence, processing, metadata: metadataEvidence, visibility: visibilityEvidence }, now: now(),
        });
        return committed ? { kind: "published" } : { kind: "authority_rejected" };
      } catch (error) {
        await this.publications.markFailed({
          workspaceId: intent.workspaceId, publicationId: intent.publicationId,
          channelLeaseFence: channelLease.leaseFence,
          evidence: { providerObjectId: uploaded.providerObjectId, recoveryIdentity: intent.recoveryIdentity,
            ...((evidence(error, "post_upload") as object)) }, now: now(),
        });
        return { kind: "failed" };
      }
    } catch (error) {
      return { kind: "authority_rejected" };
    } finally {
      await this.channels.release({
        workspaceId: intent.workspaceId, channelId: intent.channelId,
        workerId: this.options.workerId, leaseFence: channelLease.leaseFence, now: now(),
      });
    }
  }

  private async requireLiveFence(intent: PublicationExecutionIntent, leaseFence: number, now: string): Promise<void> {
    const live = await this.channels.heartbeat({
      workspaceId: intent.workspaceId, channelId: intent.channelId,
      workerId: this.options.workerId, leaseFence,
      leaseSeconds: this.options.leaseSeconds, now,
    });
    if (!live || live.leaseFence !== leaseFence) throw new Error("publication_fence_lost");
  }

  private async retryMetadata<T>(operation: () => Promise<T>, intent: PublicationExecutionIntent, leaseFence: number, now: () => string): Promise<T> {
    const attempts = (this.options.metadataRetries ?? 2) + 1;
    let error: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.requireLiveFence(intent, leaseFence, now());
        return await operation();
      } catch (caught) { error = caught; }
    }
    throw error;
  }

  private async markUncertain(intent: PublicationExecutionIntent, channelLeaseFence: number, terminalEvidence: unknown, now: string): Promise<void> {
    await this.publications.markReconciliationRequired({
      workspaceId: intent.workspaceId, publicationId: intent.publicationId,
      channelLeaseFence, evidence: terminalEvidence,
      eventId: this.options.createId?.("event-publication-reconciliation") ?? `event-${intent.publicationId}-reconciliation`,
      outboxId: this.options.createId?.("outbox-publication-reconciliation") ?? `outbox-${intent.publicationId}-reconciliation`, now,
    });
  }
}
