import type { WorkflowOperator } from "@mediaforge/workflow-engine";

/**
 * Mathematics exposes the shared engine materialization directly. It does not
 * translate engine status into a second mutable profile state model.
 */
export async function deriveMathWorkflowState(
  operator: Pick<WorkflowOperator, "status">
): Promise<Awaited<ReturnType<WorkflowOperator["status"]>>> {
  return operator.status();
}
