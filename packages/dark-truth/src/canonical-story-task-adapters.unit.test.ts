import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ArtifactRepository,
  WorkflowOperator,
  WorkflowStore,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS,
  createDarkTruthCanonicalStoryArtifactRepository,
  createDarkTruthStoryTaskImplementations,
  verifyCanonicalDarkTruthStoryArtifact,
  type DarkTruthCanonicalStoryService,
  type DarkTruthStoryExecutableTaskId,
} from "./canonical-story-task-adapters.js";
import {
  createDarkTruthTaskRegistrations,
  darkTruthWorkflowDefinition,
} from "./task-registry.js";

const deterministicTasks = new Set<DarkTruthStoryExecutableTaskId>([
  "darktruth.quality-structure",
  "darktruth.quality-repetition",
  "darktruth.quality-continuity",
  "darktruth.quality-localization",
  "darktruth.quality-shorts",
]);

async function fixture() {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "darktruth-canonical-story-")
  );
  const unitId = "episode-1";
  const unitRoot = path.join(workspaceRoot, unitId);
  const identity = {
    instanceId: "darktruth-story-fixture",
    unitId,
    locale: "en",
    variant: "full",
  } as const;
  const store = new WorkflowStore({
    unitRoot,
    workflow: darkTruthWorkflowDefinition,
    identity,
  });
  const repository =
    createDarkTruthCanonicalStoryArtifactRepository(workspaceRoot);
  const controller = new AbortController();
  const network = vi.fn(async () => undefined);
  const calls: DarkTruthStoryExecutableTaskId[] = [];
  const services = Object.fromEntries(
    DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS.map((taskId) => [
      taskId,
      {
        providerMode: deterministicTasks.has(taskId) ? "none" : "fake",
        execute: async (input) => {
          expect(input.signal).toBe(controller.signal);
          calls.push(taskId);
          return {
            payload: {
              taskId,
              dependencyTaskIds: Object.keys(input.dependencies).sort(),
              canonicalSourceService: true,
            },
            validation: {
              validatorId: `fixture.${taskId}`,
              validatorVersion: "fixture.v1",
              status: "passed" as const,
            },
          };
        },
      } satisfies DarkTruthCanonicalStoryService,
    ])
  ) as Record<DarkTruthStoryExecutableTaskId, DarkTruthCanonicalStoryService>;
  const implementations = createDarkTruthStoryTaskImplementations({
    workspaceRoot,
    unitRoot,
    unitId,
    policyRevision: "darktruth-policy-fixture-v1",
    store,
    repository,
    services,
  });
  const registrations = createDarkTruthTaskRegistrations(implementations);
  const registry = createTaskRegistry(registrations);
  let id = 0;
  const operator = new WorkflowOperator({
    unitRoot,
    workflow: darkTruthWorkflowDefinition,
    registry,
    identity,
    store,
    availableArtifacts: registry.get("darktruth.concept-select").definition
      .inputs,
    idFactory: () => `storyfixture${++id}`,
    executionControl: {
      signal: controller.signal,
      deadlineAt: null,
      leaseFence: 11,
      dispatchAttempt: 2,
    },
    verifyArtifact: async (manifest) => {
      try {
        const verified = await repository.verify(manifest.ref, {
          dependencyFingerprints: manifest.dependencyFingerprints,
        });
        return (
          verified.manifest.id === manifest.id &&
          verified.manifest.checksumSha256 === manifest.checksumSha256
        );
      } catch {
        return false;
      }
    },
  });
  return { operator, registry, repository, calls, network };
}

describe("canonical Dark Truth story task adapters", () => {
  it("executes canonical story/localization tasks with validated lineage and an explicit approval boundary", async () => {
    const { operator, registry, repository, calls, network } = await fixture();
    for (const taskId of [
      "darktruth.concept-select",
      "darktruth.episode-bible",
      "darktruth.story-outline",
      "darktruth.rewrite-full",
      "darktruth.quality-structure",
      "darktruth.quality-horror",
      "darktruth.quality-repetition",
      "darktruth.quality-continuity",
      "darktruth.quality-emotional-cost",
      "darktruth.quality-supernatural-rule",
      "darktruth.quality-opening",
      "darktruth.quality-ending",
    ] as const) {
      await operator.runTask(taskId);
    }

    expect(
      registry.explain("darktruth.story-approval").implementationBound
    ).toBe(false);
    await expect(operator.runTask("darktruth.story-approval")).rejects.toThrow(
      /no migrated implementation binding/u
    );
    await operator.override({
      taskId: "darktruth.story-approval",
      actor: "fixture-reviewer",
      reason: "Approved exact canonical fixture artifacts.",
      scope: "task-success",
    });
    for (const taskId of [
      "darktruth.localize",
      "darktruth.quality-localization",
      "darktruth.shorts-derive",
      "darktruth.quality-shorts",
    ] as const) {
      await operator.runTask(taskId);
    }

    expect(calls).toEqual(DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS);
    expect(network).not.toHaveBeenCalled();
    expect(
      DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS.every(
        (taskId) => registry.explain(taskId).implementationBound
      )
    ).toBe(true);

    const state = await operator.store.readState();
    for (const taskId of DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS) {
      const task = state.tasks.find((candidate) => candidate.taskId === taskId);
      expect(task?.status).toBe("succeeded");
      const attempt = await operator.store.readAttempt(task!.attemptId!);
      if (
        attempt.status !== "completed" ||
        attempt.result.status !== "succeeded"
      ) {
        throw new Error(`Expected a successful attempt for ${taskId}.`);
      }
      expect(attempt.result.outputs).toHaveLength(1);
      const manifest = attempt.result.outputs[0]!;
      expect(manifest).toMatchObject({
        producerTaskId: taskId,
        producerAttemptId: task!.attemptId,
      });
      const verifiedArtifact = await verifyCanonicalDarkTruthStoryArtifact(
        repository,
        manifest
      );
      expect(verifiedArtifact).toMatchObject({
        taskId,
        fingerprint: attempt.fingerprint,
        validation: { status: "passed" },
      });
      expect(verifiedArtifact.dependencyFingerprints).toEqual(
        manifest.dependencyFingerprints
      );
    }
  }, 15_000);

  it("fails closed when an external model service lacks operator authorization", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "darktruth-provider-auth-")
    );
    const unitId = "episode-2";
    const unitRoot = path.join(workspaceRoot, unitId);
    const store = new WorkflowStore({
      unitRoot,
      workflow: darkTruthWorkflowDefinition,
      identity: {
        instanceId: "provider-auth-fixture",
        unitId,
        locale: "en",
        variant: "full",
      },
    });
    const fake: DarkTruthCanonicalStoryService = {
      providerMode: "fake",
      execute: async () => ({
        payload: {},
        validation: {
          validatorId: "fixture",
          validatorVersion: "1",
          status: "passed",
        },
      }),
    };
    const services = Object.fromEntries(
      DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS.map((taskId) => [taskId, fake])
    ) as Record<DarkTruthStoryExecutableTaskId, DarkTruthCanonicalStoryService>;
    services["darktruth.rewrite-full"] = {
      ...fake,
      providerMode: "external",
    };

    expect(() =>
      createDarkTruthStoryTaskImplementations({
        workspaceRoot,
        unitRoot,
        unitId,
        policyRevision: "fixture-v1",
        store,
        repository: new ArtifactRepository({ workspaceRoot }),
        services,
      })
    ).toThrow(/explicit operator authorization/u);
  });
});
