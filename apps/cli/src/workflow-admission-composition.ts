import { WorkflowAdmissionHandler } from "@mediaforge/application";
import { PostgresWorkflowAdmissionPort, PostgresWorkflowRepository, type PostgresPool } from "@mediaforge/persistence";

/** Connected CLI uses exactly the same durable admission handler as the API. */
export function createPostgresCliWorkflowAdmissionHandler(pool: PostgresPool): WorkflowAdmissionHandler {
  return new WorkflowAdmissionHandler(
    new PostgresWorkflowAdmissionPort({
      repository: new PostgresWorkflowRepository(pool),
    })
  );
}
