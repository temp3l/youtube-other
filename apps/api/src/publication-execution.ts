import {
  FeatureGatedPublicationExecutor,
  resolvePublicationExecutionCapability,
  type PrivateFirstPublicationProvider,
  type PublicationConfirmation,
  type PublicationMetadataResolver,
} from "@mediaforge/application";
import {
  PostgresPublicationChannelLeaseRepository,
  PostgresPublicationIntentRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";

/**
 * Internal composition only. There is intentionally no HTTP mutation route:
 * a deployment must explicitly supply both the platform flag and tenant-bound
 * OAuth-backed provider implementation before any provider command is possible.
 */
export function createPostgresPublicationExecutor(input: {
  readonly pool: PostgresPool;
  readonly enabled?: boolean;
  readonly provider: PrivateFirstPublicationProvider;
  readonly confirmation: PublicationConfirmation;
  readonly metadata: PublicationMetadataResolver;
  readonly workerId: string;
  readonly leaseSeconds?: number;
  readonly metadataRetries?: number;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  const workflow = new PostgresWorkflowRepository(input.pool);
  return new FeatureGatedPublicationExecutor(
    resolvePublicationExecutionCapability(
      input.enabled === undefined ? undefined : { enabled: input.enabled }
    ),
    new PostgresPublicationIntentRepository(workflow),
    new PostgresPublicationChannelLeaseRepository(input.pool),
    input.confirmation,
    input.metadata,
    input.provider,
    {
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds ?? 60,
      metadataRetries: input.metadataRetries ?? 2,
      ...(input.now ? { now: input.now } : {}),
      ...(input.createId ? { createId: input.createId } : {}),
    }
  );
}
