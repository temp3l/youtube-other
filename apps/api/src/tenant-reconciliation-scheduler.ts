import {
  DurableOutboxWorker,
  type DurableOutboxRepository,
  type OutboxDispatchResult,
  type PublicationIntent,
} from "@mediaforge/application";
import {
  PostgresPublicationIntentRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import {
  createYoutubePublicationReconciliationClient,
  type YoutubeAuthSettings,
  type YoutubeReconciliationClient,
} from "@mediaforge/youtube-upload";

import { createPostgresYoutubePublicationReconciliationWorker } from "./publication-reconciliation.js";

const reconciliationTopic = "publication.reconciliation_required";

interface ReconciliationEventPayload extends PublicationIntent {
  readonly projectId: string;
}

function publicationIntent(value: unknown): ReconciliationEventPayload {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof Reflect.get(value, "id") !== "string" ||
    typeof Reflect.get(value, "projectId") !== "string" ||
    typeof Reflect.get(value, "approvalRevision") !== "number" ||
    typeof Reflect.get(value, "credentialVersion") !== "string" ||
    typeof Reflect.get(value, "assetHash") !== "string" ||
    typeof Reflect.get(value, "recoveryIdentity") !== "string" ||
    Reflect.get(value, "state") !== "reconciliation_required"
  )
    throw new Error("Invalid publication reconciliation outbox payload.");
  return value as ReconciliationEventPayload;
}

function createTenantOutboxRepository(input: {
  readonly repository: PostgresWorkflowRepository;
  readonly workspaceId: string;
}): DurableOutboxRepository {
  return {
    claimNextOutbox: (request) =>
      input.repository.withWorkspaceTransaction(
        input.workspaceId,
        (transaction) => transaction.claimNextOutbox(request)
      ),
    markOutboxDelivered: (request) =>
      input.repository.withWorkspaceTransaction(
        input.workspaceId,
        (transaction) => transaction.markOutboxDelivered(request)
      ),
    rescheduleOutbox: (request) =>
      input.repository.withWorkspaceTransaction(
        input.workspaceId,
        (transaction) => transaction.rescheduleOutbox(request)
      ),
  };
}

export interface TenantReconciliationScheduler {
  dispatchOne(): Promise<OutboxDispatchResult>;
}

/**
 * A tenant-bound scheduler role. It claims only reconciliation events, so it
 * cannot consume general workflow dispatches with the tenant's provider grant.
 */
export function createPostgresTenantYoutubeReconciliationScheduler(input: {
  readonly pool: PostgresPool;
  readonly workspaceId: string;
  readonly youtube: YoutubeReconciliationClient;
  readonly workerId: string;
  readonly leaseSeconds?: number;
  readonly maxAttempts?: number;
  readonly now?: () => Date;
  readonly retryAt?: (attempt: number, now: Date) => Date;
}): TenantReconciliationScheduler {
  const repository = new PostgresWorkflowRepository(input.pool);
  const intents = new PostgresPublicationIntentRepository(repository);
  const worker = createPostgresYoutubePublicationReconciliationWorker({
    pool: input.pool,
    workspaceId: input.workspaceId,
    youtube: input.youtube,
  });
  const outbox = new DurableOutboxWorker(
    createTenantOutboxRepository({
      repository,
      workspaceId: input.workspaceId,
    }),
    {
      dispatch: async (event) => {
        if (
          event.workspaceId !== input.workspaceId ||
          event.topic !== reconciliationTopic
        )
          throw new Error(
            "Tenant reconciliation scheduler received an unauthorized event."
          );
        const payload = publicationIntent(event.payload);
        const stored = await intents.get({
          workspaceId: input.workspaceId,
          projectId: payload.projectId,
          publicationId: payload.id,
        });
        if (
          !stored ||
          stored.status !== "reconciliation_required" ||
          stored.recoveryIdentity !== payload.recoveryIdentity
        ) {
          throw new Error(
            "Publication reconciliation intent is missing, stale, or mismatched."
          );
        }
        const result = await worker.reconcile({
          id: stored.publicationId,
          approvalRevision: stored.approvalRevision,
          credentialVersion: stored.credentialVersion,
          assetHash: stored.assetHash,
          recoveryIdentity: stored.recoveryIdentity,
          state: stored.status,
        });
        if (
          result.kind === "reconciliation_required" &&
          result.reason === "provider_unavailable"
        ) {
          throw new Error("YouTube reconciliation is temporarily unavailable.");
        }
      },
    },
    {
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds ?? 60,
      maxAttempts: input.maxAttempts ?? 8,
      now: input.now ?? (() => new Date()),
      retryAt:
        input.retryAt ??
        ((attempt, now) =>
          new Date(now.getTime() + Math.min(60_000, 1_000 * 2 ** attempt))),
      topic: reconciliationTopic,
    }
  );
  return { dispatchOne: () => outbox.dispatchOne(input.workspaceId) };
}

/** Connects the tenant scheduler to the real OAuth-backed YouTube API client. */
export function createLivePostgresTenantYoutubeReconciliationScheduler(
  input: Omit<
    Parameters<typeof createPostgresTenantYoutubeReconciliationScheduler>[0],
    "youtube"
  > & {
    readonly youtubeAuth: YoutubeAuthSettings;
  }
): TenantReconciliationScheduler {
  return createPostgresTenantYoutubeReconciliationScheduler({
    ...input,
    youtube: createYoutubePublicationReconciliationClient(input.youtubeAuth),
  });
}

export { reconciliationTopic as publicationReconciliationTopic };
