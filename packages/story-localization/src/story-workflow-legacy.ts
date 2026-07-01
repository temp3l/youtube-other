export interface LegacyWorkflowDelegationInput {
  readonly workflowEnabled?: boolean;
  readonly dryRun?: boolean;
  readonly command: "rewrite-full" | "rewrite-short" | "analyze" | "localize";
}

export interface LegacyWorkflowDelegationDecision {
  readonly delegate: boolean;
  readonly reason: string;
}

export function decideLegacyWorkflowDelegation(
  input: LegacyWorkflowDelegationInput
): LegacyWorkflowDelegationDecision {
  if (input.workflowEnabled) {
    return {
      delegate: true,
      reason: "Workflow mode explicitly enabled.",
    };
  }
  if (input.dryRun) {
    return {
      delegate: true,
      reason: "Dry-run can use the workflow planner without changing legacy outputs.",
    };
  }
  return {
    delegate: false,
    reason: `Legacy ${input.command} behavior remains the default until parity is enabled.`,
  };
}
