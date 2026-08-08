import { runDarkTruthDeterministicFixture } from "@mediaforge/dark-truth";
import {
  createHistoryTaskRegistrations,
  historyWorkflowDefinition,
} from "@mediaforge/history";
import { runMathProfileDeterministicFixture } from "@mediaforge/math-education";
import { runStrategicFullWorkflowFixture } from "@mediaforge/strategic-reinvention";
import { createTaskRegistry } from "@mediaforge/workflow-engine";
import { z } from "zod";

import type { CanonicalDurableWorkflowExecutor } from "./durable-workflow-job-handler.js";

export const providerFreeEpisodeProfileSchema = z.enum([
  "dark_truth",
  "mathematics_education",
  "history",
  "strategic_reinvention",
]);

export type ProviderFreeEpisodeProfile = z.infer<
  typeof providerFreeEpisodeProfileSchema
>;

const persistedProfileSchema = z
  .object({
    input: z
      .object({
        profile: providerFreeEpisodeProfileSchema,
      })
      .passthrough(),
  })
  .passthrough();

function assertActive(
  control: Parameters<CanonicalDurableWorkflowExecutor["execute"]>[0]["control"]
): void {
  if (control.signal.aborted) {
    throw control.signal.reason instanceof Error
      ? control.signal.reason
      : new Error("Provider-free workflow execution was cancelled.");
  }
  if (
    control.deadlineAt !== null &&
    new Date(control.deadlineAt).getTime() <= Date.now()
  ) {
    throw new Error("Provider-free workflow execution deadline has elapsed.");
  }
}

/**
 * Provider-free canonical execution for the internal pilot. The profile is
 * pinned in the persisted admission specification, never selected by a job
 * payload, and each branch validates its owning package's real task registry.
 */
export function createProviderFreeProfileExecutor(): CanonicalDurableWorkflowExecutor {
  return {
    async execute(input) {
      assertActive(input.control);
      const parsed = persistedProfileSchema.safeParse(input.run.execution);
      if (!parsed.success) {
        throw new Error(
          "Persisted workflow execution does not contain an entitled profile."
        );
      }

      switch (parsed.data.input.profile) {
        case "mathematics_education":
          runMathProfileDeterministicFixture();
          break;
        case "dark_truth":
          runDarkTruthDeterministicFixture();
          break;
        case "history": {
          const registry = createTaskRegistry(createHistoryTaskRegistrations());
          registry.validateWorkflow(historyWorkflowDefinition);
          break;
        }
        case "strategic_reinvention":
          runStrategicFullWorkflowFixture();
          break;
      }
      assertActive(input.control);
    },
  };
}
