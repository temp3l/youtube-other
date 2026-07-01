import {
  stageFailureSchemaVersion,
  type CacheMetadata,
  type CostMetrics,
  type StageFailure,
} from "./story-workflow.types.js";

export interface WorkflowBudget {
  readonly maxEstimatedCostMicros?: number;
  readonly maxActualCostMicros?: number;
}

export interface WorkflowCostDecision {
  readonly allowed: boolean;
  readonly cost: CostMetrics;
  readonly cacheSavingsMicros: number;
  readonly failure?: StageFailure;
}

export function emptyCostMetrics(): CostMetrics {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: null,
    actualCostMicros: null,
  };
}

export function reconcileWorkflowCost(args: {
  readonly cost: CostMetrics;
  readonly cache: CacheMetadata;
  readonly budget?: WorkflowBudget;
}): WorkflowCostDecision {
  const estimated = args.cost.estimatedCostMicros ?? 0;
  const actual = args.cost.actualCostMicros ?? 0;
  const exceeded =
    (args.budget?.maxEstimatedCostMicros !== undefined &&
      estimated > args.budget.maxEstimatedCostMicros) ||
    (args.budget?.maxActualCostMicros !== undefined &&
      actual > args.budget.maxActualCostMicros);
  const cacheSavingsMicros =
    args.cache.status === "hit" && args.cost.estimatedCostMicros !== null
      ? args.cost.estimatedCostMicros
      : 0;
  return {
    allowed: !exceeded,
    cost: args.cost,
    cacheSavingsMicros,
    ...(exceeded
      ? {
          failure: {
            schemaVersion: stageFailureSchemaVersion,
            category: "budget-exceeded",
            retryability: "retry-after-change",
            message: "Workflow budget exceeded.",
            occurredAt: new Date().toISOString(),
            details: {
              estimatedCostMicros: estimated,
              actualCostMicros: actual,
            },
          },
        }
      : {}),
  };
}
