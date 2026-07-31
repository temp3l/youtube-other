import { PublicationReconciliationWorker } from "@mediaforge/application";
import { PostgresPublicationReconciliationStore, PostgresWorkflowRepository, type PostgresPool } from "@mediaforge/persistence";
import { YoutubePublicationEvidenceLookup, type YoutubeReconciliationClient } from "@mediaforge/youtube-upload";

/** Production composition for a tenant's read-only YouTube reconciliation worker. */
export function createPostgresYoutubePublicationReconciliationWorker(input: {
  readonly pool: PostgresPool;
  readonly workspaceId: string;
  readonly youtube: YoutubeReconciliationClient;
}): PublicationReconciliationWorker {
  return new PublicationReconciliationWorker(
    new YoutubePublicationEvidenceLookup(input.youtube),
    new PostgresPublicationReconciliationStore({
      repository: new PostgresWorkflowRepository(input.pool),
      workspaceId: input.workspaceId,
    })
  );
}
