import { contentLocaleSchema, contentVariantSchema } from "@mediaforge/domain";

import { DARK_TRUTH_SUPPORTED_LOCALES } from "./profile-contracts.js";
import {
  DARK_TRUTH_TASK_IDS,
  createDarkTruthTaskRegistry,
  darkTruthWorkflowDefinition,
} from "./task-registry.js";

export const DARK_TRUTH_FIXTURE_SCHEMA_VERSION =
  "darktruth.deterministic-fixture.v1" as const;

export interface DarkTruthFixtureTraversal {
  readonly locale: (typeof DARK_TRUTH_SUPPORTED_LOCALES)[number];
  readonly variant: "full" | "short";
  readonly taskIds: readonly string[];
  readonly providerCalls: 0;
  readonly status: "passed";
}

export interface DarkTruthFixtureResult {
  readonly schemaVersion: typeof DARK_TRUTH_FIXTURE_SCHEMA_VERSION;
  readonly workflowRevision: string;
  readonly traversals: readonly DarkTruthFixtureTraversal[];
  readonly providerCalls: 0;
  readonly status: "passed";
}

const shortOnly = new Set([
  "darktruth.shorts-derive",
  "darktruth.quality-shorts",
]);

export function runDarkTruthDeterministicFixture(): DarkTruthFixtureResult {
  const registry = createDarkTruthTaskRegistry();
  registry.validateWorkflow(darkTruthWorkflowDefinition);
  const traversals = DARK_TRUTH_SUPPORTED_LOCALES.flatMap((localeInput) => {
    const locale = contentLocaleSchema.parse(localeInput);
    return (["full", "short"] as const).map((variantInput) => {
      const variant = contentVariantSchema.parse(variantInput);
      const activeTaskIds = DARK_TRUTH_TASK_IDS.filter(
        (taskId) => variant === "short" || !shortOnly.has(taskId)
      );
      const active = new Set(activeTaskIds);
      const completed = new Set<string>();
      const taskIds: string[] = [];
      while (completed.size < active.size) {
        const next = activeTaskIds.find((taskId) => {
          if (completed.has(taskId)) return false;
          return registry.get(taskId).definition.dependencies.every(
            (dependency) =>
              (!active.has(dependency.taskId) && dependency.optional) ||
              completed.has(dependency.taskId)
          );
        });
        if (!next) {
          throw new Error(
            `Deterministic ${locale}/${variant} fixture cannot advance through the profile DAG.`
          );
        }
        // Provider/model/manual stages are satisfied by deterministic fixture
        // evidence; no implementation or external provider is invoked.
        completed.add(next);
        taskIds.push(next);
      }
      return {
        locale,
        variant,
        taskIds,
        providerCalls: 0 as const,
        status: "passed" as const,
      };
    });
  });
  return {
    schemaVersion: DARK_TRUTH_FIXTURE_SCHEMA_VERSION,
    workflowRevision: darkTruthWorkflowDefinition.revision,
    traversals,
    providerCalls: 0,
    status: "passed",
  };
}
