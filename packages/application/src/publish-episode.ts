import { createHash } from "node:crypto";

import {
  canonicalPublishEpisodeInputSchema,
  type CanonicalPublicationArtifactBinding,
  type CanonicalPublishEpisodeInput,
  type PublishEpisodeExecutor,
  type PublishEpisodeResult,
} from "@mediaforge/workflow-engine";

import type {
  PublicationIntent,
  PublicationReceipt,
  PublicationReconciliationResult,
} from "./publication-safety.js";

type PublicationStatus = PublicationIntent["state"];

interface PublicationBinding {
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
  readonly artifactBindings: readonly CanonicalPublicationArtifactBinding[];
  readonly channelId: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly scheduledAt: string | null;
  readonly playlistIds: readonly string[];
  readonly recoveryIdentity: string;
}

interface PublicationRecord extends PublicationBinding {
  readonly workspaceId: string;
  readonly publicationId: string;
  readonly status: PublicationStatus;
  readonly revision: number;
  readonly executionFence: number;
  readonly intentLeaseFence: number;
  readonly channelLeaseFence: number;
  readonly providerReceipt: unknown | null;
  readonly terminalEvidence: unknown | null;
}

interface PublicationIntentLease {
  readonly publicationId: string;
  readonly workerId: string;
  readonly leaseFence: number;
  readonly leaseExpiresAt: string;
}

export interface CanonicalPublicationIntentPort {
  admit(input: PublicationBinding & {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly effectId: string;
    readonly eventId: string;
    readonly outboxId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly now: string;
  }): Promise<unknown>;
  getForEpisode(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly episodeId: string;
    readonly publicationId: string;
  }): Promise<PublicationRecord | null>;
  claimIntentLease(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<PublicationIntentLease | null>;
  beginExecution(input: PublicationBinding & {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly workerId: string;
    readonly intentLeaseFence: number;
    readonly channelLeaseFence: number;
    readonly now: string;
  }): Promise<boolean>;
  markPublished(input: {
    readonly workspaceId: string;
    readonly publicationId: string;
    readonly channelLeaseFence: number;
    readonly receipt: PublicationReceipt;
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

export interface CanonicalPublicationChannelLeasePort {
  claim(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<{
    readonly leaseOwner: string;
    readonly leaseFence: number;
    readonly leaseExpiresAt: string;
  } | null>;
  heartbeat(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<{ readonly leaseFence: number } | null>;
  release(input: {
    readonly workspaceId: string;
    readonly channelId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean>;
}

export type PublishEpisodeMutationOutcome =
  | {
      readonly kind: "succeeded";
      readonly receipt: PublicationReceipt;
    }
  | {
      readonly kind: "failed-before-effect";
      readonly evidence: unknown;
    }
  | {
      readonly kind: "ambiguous";
      readonly evidence: unknown;
    };

export interface PublishEpisodeMutationPort {
  publishOnce(
    request: CanonicalPublishEpisodeInput["providerRequest"]
  ): Promise<PublishEpisodeMutationOutcome>;
}

export interface PublishEpisodeReconciliationPort {
  reconcile(intent: PublicationIntent): Promise<PublicationReconciliationResult>;
}

export interface PublishEpisodeStructuredLogger {
  info(event: string, fields: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields: Readonly<Record<string, unknown>>): void;
}

export type PublishEpisodeExecutionErrorCode =
  | "invalid_canonical_publication"
  | "publication_identity_not_bound"
  | "publication_authority_rejected"
  | "publication_state_conflict"
  | "publication_persistence_failed";

export class PublishEpisodeExecutionError extends Error {
  public constructor(
    public readonly code: PublishEpisodeExecutionErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "PublishEpisodeExecutionError";
  }
}

export interface CanonicalPublishEpisodeExecutorOptions {
  readonly intents: CanonicalPublicationIntentPort;
  readonly channelLeases: CanonicalPublicationChannelLeasePort;
  readonly mutation: PublishEpisodeMutationPort;
  readonly reconciliation: PublishEpisodeReconciliationPort;
  readonly logger?: PublishEpisodeStructuredLogger;
  readonly now?: () => Date;
}

const silentLogger: PublishEpisodeStructuredLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function bindingFrom(input: CanonicalPublishEpisodeInput): PublicationBinding {
  return {
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
    artifactBindings: [...input.artifacts.bindings].sort((left, right) =>
      `${left.role}:${left.assetId}`.localeCompare(`${right.role}:${right.assetId}`)
    ),
    channelId: input.target.channelId,
    visibility: input.target.visibility,
    scheduledAt: input.target.scheduledAt,
    playlistIds: [...input.target.playlistIds].sort(),
    recoveryIdentity: input.recoveryIdentity,
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function workerId(input: CanonicalPublishEpisodeInput): string {
  return `${input.taskId}:${input.attemptId}`;
}

function publicationIntent(record: PublicationRecord): PublicationIntent {
  return {
    id: record.publicationId,
    approvalRevision: record.approvalRevision,
    credentialVersion: record.credentialVersion,
    assetHash: record.assetHash,
    recoveryIdentity: record.recoveryIdentity,
    state: record.status,
  };
}

function receiptProviderObjectId(receipt: unknown): string | null {
  if (receipt === null || typeof receipt !== "object") return null;
  const value = Reflect.get(receipt, "providerObjectId");
  return typeof value === "string" && value.length > 0 ? value : null;
}

function assertActive(input: CanonicalPublishEpisodeInput): void {
  if (input.signal?.aborted) {
    throw new PublishEpisodeExecutionError(
      "publication_authority_rejected",
      "Canonical publication was cancelled before provider dispatch."
    );
  }
}

export class CanonicalPublishEpisodeExecutor implements PublishEpisodeExecutor {
  private readonly logger: PublishEpisodeStructuredLogger;
  private readonly now: () => Date;

  public constructor(private readonly options: CanonicalPublishEpisodeExecutorOptions) {
    this.logger = options.logger ?? silentLogger;
    this.now = options.now ?? (() => new Date());
  }

  public async execute(
    candidate: CanonicalPublishEpisodeInput
  ): Promise<PublishEpisodeResult> {
    const parsed = canonicalPublishEpisodeInputSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new PublishEpisodeExecutionError(
        "invalid_canonical_publication",
        `Canonical publication input is invalid: ${parsed.error.issues[0]?.message ?? "unknown validation error"}.`
      );
    }
    const input: CanonicalPublishEpisodeInput = {
      ...parsed.data,
      ...(candidate.signal ? { signal: candidate.signal } : {}),
    };
    assertActive(input);
    const binding = bindingFrom(input);
    const immutableFingerprint = fingerprint({
      publicationId: input.publicationId,
      episodeId: input.episodeId,
      taskId: input.taskId,
      binding,
      videoContentHash: input.providerRequest.video.contentHash,
      metadata: input.providerRequest.metadata,
      metadataContentHash: input.providerRequest.metadataContentHash,
      thumbnailContentHash: input.providerRequest.thumbnail?.contentHash ?? null,
    });
    const timestamp = this.now().toISOString();
    const ids = {
      effectId: `publication-effect:${input.publicationId}`,
      eventId: `publication-intent:${input.publicationId}`,
      outboxId: `publication-intent:${input.publicationId}`,
      commandId: `publication-command:${input.publicationId}`,
      idempotencyKey: `publication:${input.publicationId}`,
    } as const;
    try {
      await this.options.intents.admit({
        ...binding,
        workspaceId: input.workspaceId,
        publicationId: input.publicationId,
        ...ids,
        requestFingerprint: immutableFingerprint,
        now: timestamp,
      });
    } catch (error) {
      throw new PublishEpisodeExecutionError(
        "publication_persistence_failed",
        "Canonical publication intent admission failed.",
        error
      );
    }
    this.log("publication.intent_admitted", input, {});
    const record = await this.loadBoundIntent(input);
    if (record.status === "published") {
      this.log("publication.already_published", input, {
        providerObjectId: receiptProviderObjectId(record.providerReceipt),
      });
      return { kind: "already-published", publicationId: input.publicationId };
    }
    if (record.status === "reconciliation_required") {
      return this.reconcile(input, record);
    }
    if (record.status === "executing") {
      return this.recoverAbandonedExecution(input, record);
    }
    if (record.status === "failed" || record.status === "cancelled") {
      throw new PublishEpisodeExecutionError(
        "publication_state_conflict",
        `Publication ${input.publicationId} is terminal in state ${record.status}.`
      );
    }

    const owner = workerId(input);
    const intentLease = await this.options.intents.claimIntentLease({
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      workerId: owner,
      leaseSeconds: input.leaseSeconds,
      now: this.now().toISOString(),
    });
    if (!intentLease) {
      return {
        kind: "deferred",
        publicationId: input.publicationId,
        reason: "intent-lease-unavailable",
      };
    }
    const channelLease = await this.options.channelLeases.claim({
      workspaceId: input.workspaceId,
      channelId: binding.channelId,
      workerId: owner,
      leaseSeconds: input.leaseSeconds,
      now: this.now().toISOString(),
    });
    if (!channelLease) {
      return {
        kind: "deferred",
        publicationId: input.publicationId,
        reason: "channel-lease-unavailable",
      };
    }
    try {
      const began = await this.options.intents.beginExecution({
        ...binding,
        workspaceId: input.workspaceId,
        publicationId: input.publicationId,
        workerId: owner,
        intentLeaseFence: intentLease.leaseFence,
        channelLeaseFence: channelLease.leaseFence,
        now: this.now().toISOString(),
      });
      if (!began) {
        throw new PublishEpisodeExecutionError(
          "publication_authority_rejected",
          "Approval, actor, credential, artifact, schedule, or lease authority changed before publication."
        );
      }
      this.log("publication.execution_fenced", input, {
        intentLeaseFence: intentLease.leaseFence,
        channelLeaseFence: channelLease.leaseFence,
      });
      assertActive(input);
      const currentLease = await this.options.channelLeases.heartbeat({
        workspaceId: input.workspaceId,
        channelId: binding.channelId,
        workerId: owner,
        leaseFence: channelLease.leaseFence,
        leaseSeconds: input.leaseSeconds,
        now: this.now().toISOString(),
      });
      if (!currentLease) {
        const marked = await this.options.intents.markFailed({
          workspaceId: input.workspaceId,
          publicationId: input.publicationId,
          channelLeaseFence: channelLease.leaseFence,
          evidence: { category: "lost-fence-before-effect" },
          now: this.now().toISOString(),
        });
        if (!marked) throw this.persistenceConflict(input.publicationId);
        return {
          kind: "failed-before-effect",
          publicationId: input.publicationId,
          reason: "Publication fence was lost before provider dispatch.",
        };
      }
      return await this.mutate(input, channelLease.leaseFence);
    } finally {
      await this.options.channelLeases.release({
        workspaceId: input.workspaceId,
        channelId: binding.channelId,
        workerId: owner,
        leaseFence: channelLease.leaseFence,
        now: this.now().toISOString(),
      }).catch(() => false);
    }
  }

  private async loadBoundIntent(
    input: CanonicalPublishEpisodeInput
  ): Promise<PublicationRecord> {
    const record = await this.options.intents.getForEpisode({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      episodeId: input.episodeId,
      publicationId: input.publicationId,
    });
    if (!record) {
      throw new PublishEpisodeExecutionError(
        "publication_identity_not_bound",
        "Publication intent is not bound to the canonical workspace, project, workflow run, and episode."
      );
    }
    return record;
  }

  private async mutate(
    input: CanonicalPublishEpisodeInput,
    channelLeaseFence: number
  ): Promise<PublishEpisodeResult> {
    this.log("publication.provider_attempted", input, { channelLeaseFence });
    let outcome: PublishEpisodeMutationOutcome;
    try {
      outcome = await this.options.mutation.publishOnce(input.providerRequest);
    } catch (error) {
      outcome = {
        kind: "ambiguous",
        evidence: {
          category: "mutation-port-threw",
          message: error instanceof Error ? error.message : "Unknown mutation error.",
        },
      };
    }
    this.log("publication.provider_result", input, { category: outcome.kind });
    switch (outcome.kind) {
      case "succeeded": {
        if (outcome.receipt.recoveryIdentity !== input.recoveryIdentity) {
          return this.persistAmbiguity(input, channelLeaseFence, {
            category: "provider-recovery-identity-mismatch",
          });
        }
        const marked = await this.options.intents.markPublished({
          workspaceId: input.workspaceId,
          publicationId: input.publicationId,
          channelLeaseFence,
          receipt: outcome.receipt,
          now: this.now().toISOString(),
        });
        if (!marked) throw this.persistenceConflict(input.publicationId);
        this.log("publication.published", input, {
          providerObjectId: outcome.receipt.providerObjectId,
        });
        return {
          kind: "published",
          publicationId: input.publicationId,
          providerObjectId: outcome.receipt.providerObjectId,
          reconciled: false,
        };
      }
      case "failed-before-effect": {
        const marked = await this.options.intents.markFailed({
          workspaceId: input.workspaceId,
          publicationId: input.publicationId,
          channelLeaseFence,
          evidence: outcome.evidence,
          now: this.now().toISOString(),
        });
        if (!marked) throw this.persistenceConflict(input.publicationId);
        return {
          kind: "failed-before-effect",
          publicationId: input.publicationId,
          reason: "YouTube publication failed before videos.insert was invoked.",
        };
      }
      case "ambiguous":
        return this.persistAmbiguity(input, channelLeaseFence, outcome.evidence);
    }
  }

  private async persistAmbiguity(
    input: CanonicalPublishEpisodeInput,
    channelLeaseFence: number,
    evidence: unknown
  ): Promise<PublishEpisodeResult> {
    const marked = await this.options.intents.markReconciliationRequired({
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      channelLeaseFence,
      evidence,
      eventId: `publication-uncertain:${input.publicationId}`,
      outboxId: `publication-uncertain:${input.publicationId}`,
      now: this.now().toISOString(),
    });
    if (!marked) throw this.persistenceConflict(input.publicationId);
    this.logger.warn("publication.reconciliation_required", {
      ...this.logIdentity(input),
      channelLeaseFence,
      providerResultCategory: "ambiguous",
    });
    return {
      kind: "reconciliation-required",
      publicationId: input.publicationId,
      reason: "ambiguous-provider-result",
    };
  }

  private async recoverAbandonedExecution(
    input: CanonicalPublishEpisodeInput,
    record: PublicationRecord
  ): Promise<PublishEpisodeResult> {
    // An executing record proves videos.insert may already have happened. A
    // resumed worker may only make the durable state uncertain, never upload.
    const marked = await this.options.intents.markReconciliationRequired({
      workspaceId: input.workspaceId,
      publicationId: input.publicationId,
      channelLeaseFence: record.executionFence,
      evidence: { category: "abandoned-execution" },
      eventId: `publication-abandoned:${input.publicationId}:${record.revision}`,
      outboxId: `publication-abandoned:${input.publicationId}:${record.revision}`,
      now: this.now().toISOString(),
    });
    if (!marked) {
      const current = await this.loadBoundIntent(input);
      if (current.status === "published") {
        return { kind: "already-published", publicationId: input.publicationId };
      }
      if (current.status !== "reconciliation_required") {
        throw this.persistenceConflict(input.publicationId);
      }
      return this.reconcile(input, current);
    }
    this.logger.warn("publication.abandoned_execution", {
      ...this.logIdentity(input),
      priorExecutionFence: record.executionFence,
    });
    return this.reconcile(input, { ...record, status: "reconciliation_required" });
  }

  private async reconcile(
    input: CanonicalPublishEpisodeInput,
    record: PublicationRecord
  ): Promise<PublishEpisodeResult> {
    const result = await this.options.reconciliation.reconcile(
      publicationIntent(record)
    );
    this.log("publication.reconciled", input, { result: result.kind });
    if (result.kind === "published") {
      return {
        kind: "published",
        publicationId: input.publicationId,
        providerObjectId: result.receipt.providerObjectId,
        reconciled: true,
      };
    }
    return {
      kind: "reconciliation-required",
      publicationId: input.publicationId,
      reason: result.reason,
    };
  }

  private persistenceConflict(publicationId: string): PublishEpisodeExecutionError {
    return new PublishEpisodeExecutionError(
      "publication_state_conflict",
      `Publication ${publicationId} lost its expected durable state or fence.`
    );
  }

  private logIdentity(
    input: CanonicalPublishEpisodeInput
  ): Readonly<Record<string, unknown>> {
    return {
      publicationIntentId: input.publicationId,
      workflowRunId: input.workflowRunId,
      taskId: input.taskId,
      episodeId: input.episodeId,
      attemptId: input.attemptId,
    };
  }

  private log(
    event: string,
    input: CanonicalPublishEpisodeInput,
    fields: Readonly<Record<string, unknown>>
  ): void {
    this.logger.info(event, { ...this.logIdentity(input), ...fields });
  }
}
