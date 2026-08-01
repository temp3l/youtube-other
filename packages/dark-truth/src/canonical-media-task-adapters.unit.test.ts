import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  workflowDefinitionSchema,
} from "@mediaforge/domain";
import {
  WorkflowOperator,
  WorkflowStore,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS,
  createDarkTruthMediaTaskImplementations,
  verifyCanonicalDarkTruthMediaArtifact,
  type DarkTruthCanonicalMediaService,
  type DarkTruthMediaExecutableTaskId,
} from "./canonical-media-task-adapters.js";
import { createDarkTruthCanonicalStoryArtifactRepository } from "./canonical-story-task-adapters.js";
import { createDarkTruthTaskRegistrations } from "./task-registry.js";

const fakeProviderTasks = new Set<DarkTruthMediaExecutableTaskId>([
  "darktruth.reference-prepare",
  "darktruth.scene-images",
  "darktruth.thumbnail-concept",
  "darktruth.thumbnail-generate",
  "darktruth.audio-generate",
  "darktruth.metadata",
]);

const expectedStorySources = {
  "darktruth.shot-plan": ["darktruth.rewrite-full"],
  "darktruth.reference-plan": ["darktruth.episode-bible"],
  "darktruth.thumbnail-concept": [
    "darktruth.episode-bible",
    "darktruth.rewrite-full",
  ],
  "darktruth.narration-instructions": [
    "darktruth.localize",
    "darktruth.quality-localization",
  ],
  "darktruth.metadata": [
    "darktruth.localize",
    "darktruth.quality-localization",
  ],
} as const;

const syntheticPrerequisiteTaskIds = new Set([
  "darktruth.story-approval",
  "darktruth.quality-localization",
]);

const mediaFixtureWorkflow = workflowDefinitionSchema.parse({
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  id: "darktruth.media-fixture",
  revision: "darktruth.media-fixture.v1",
  profileId: "dark-truth",
  taskIds: [
    "darktruth.story-approval",
    "darktruth.quality-localization",
    ...DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS.slice(0, 4),
    "darktruth.reference-approval",
    ...DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS.slice(4),
  ],
});

async function fixture(corruptStorySource = false) {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "darktruth-canonical-media-")
  );
  const unitId = "episode-media-1";
  const unitRoot = path.join(workspaceRoot, unitId);
  const identity = {
    instanceId: "darktruth-media-fixture",
    unitId,
    locale: "en",
    variant: "full",
  } as const;
  const store = new WorkflowStore({
    unitRoot,
    workflow: mediaFixtureWorkflow,
    identity,
  });
  const repository =
    createDarkTruthCanonicalStoryArtifactRepository(workspaceRoot);
  const controller = new AbortController();
  const network = vi.fn(async () => undefined);
  const calls: DarkTruthMediaExecutableTaskId[] = [];
  const storySourceCalls: string[] = [];
  const approvalBindingCalls: string[] = [];
  const services = Object.fromEntries(
    DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS.map((taskId) => [
      taskId,
      {
        providerMode: fakeProviderTasks.has(taskId) ? "fake" : "none",
        execute: async (input) => {
          expect(input.signal).toBe(controller.signal);
          expect(Object.keys(input.storySources).sort()).toEqual(
            [
              ...(expectedStorySources[
                taskId as keyof typeof expectedStorySources
              ] ?? []),
            ].sort()
          );
          expect(Object.keys(input.approvalBindings).sort()).toEqual(
            taskId === "darktruth.publish-dry-run"
              ? ["darktruth.reference-approval", "darktruth.story-approval"]
              : []
          );
          calls.push(taskId);
          return {
            payload: {
              taskId,
              dependencyTaskIds: Object.keys(input.dependencies).sort(),
              sourceAuthoritative: true,
            },
            validation: {
              validatorId: `fixture.${taskId}`,
              validatorVersion: "fixture.v1",
              status: "passed" as const,
            },
          };
        },
      } satisfies DarkTruthCanonicalMediaService,
    ])
  ) as Record<DarkTruthMediaExecutableTaskId, DarkTruthCanonicalMediaService>;
  const implementations = createDarkTruthMediaTaskImplementations({
    workspaceRoot,
    unitRoot,
    unitId,
    policyRevision: "darktruth-media-policy-fixture-v1",
    store,
    repository,
    services,
    storySourcePort: {
      load: async (input) => {
        expect(input.signal).toBe(controller.signal);
        storySourceCalls.push(input.taskId);
        const payload = { canonicalStoryTaskId: input.taskId };
        return {
          taskId: input.taskId,
          fingerprint: "a".repeat(64),
          payloadSha256: corruptStorySource
            ? "b".repeat(64)
            : crypto
                .createHash("sha256")
                .update(JSON.stringify(payload))
                .digest("hex"),
          payload,
        };
      },
    },
    approvalBindingPort: {
      load: async (input) => {
        expect(input.signal).toBe(controller.signal);
        approvalBindingCalls.push(input.taskId);
        return {
          taskId: input.taskId,
          approvalId: `approval.${input.taskId}`,
          boundRevision: "darktruth.task-registry.v2",
          evidenceFingerprint: "c".repeat(64),
        };
      },
    },
  });
  const registrations = createDarkTruthTaskRegistrations(implementations, {
    bibleReady: true,
    bibleReasons: [],
    referencesReady: true,
    referenceReasons: [],
  }).map((registration) => {
    if (syntheticPrerequisiteTaskIds.has(registration.definition.id)) {
      return {
        ...registration,
        definition: taskDefinitionSchema.parse({
          ...registration.definition,
          dependencies: [],
          outputs: [],
        }),
      };
    }
    if (
      registration.definition.id === "darktruth.reference-plan" ||
      registration.definition.id === "darktruth.narration-instructions"
    ) {
      return {
        ...registration,
        definition: taskDefinitionSchema.parse({
          ...registration.definition,
          dependencies: registration.definition.dependencies.filter(
            ({ taskId }) =>
              taskId !== "darktruth.episode-bible" &&
              taskId !== "darktruth.quality-localization"
          ),
          inputs:
            registration.definition.id === "darktruth.reference-plan"
              ? registration.definition.inputs.filter(
                  ({ kind }) => kind !== "story-bible"
                )
              : registration.definition.inputs,
        }),
      };
    }
    return registration;
  });
  const registry = createTaskRegistry(registrations);
  let id = 0;
  const operator = new WorkflowOperator({
    unitRoot,
    workflow: mediaFixtureWorkflow,
    registry,
    identity,
    store,
    idFactory: () => `mediafixture${++id}`,
    executionControl: {
      signal: controller.signal,
      deadlineAt: null,
      leaseFence: 13,
      dispatchAttempt: 3,
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
  return {
    operator,
    registry,
    repository,
    calls,
    storySourceCalls,
    approvalBindingCalls,
    network,
  };
}

async function approvePrerequisite(
  operator: WorkflowOperator,
  taskId: string
): Promise<void> {
  await operator.override({
    taskId,
    actor: "fixture-reviewer",
    reason: `Approved exact fixture evidence for ${taskId}.`,
    scope: "task-success",
  });
}

describe("canonical Dark Truth media task adapters", () => {
  it("executes reversible media tasks with hashes, lineage, signals, and explicit approval gates", async () => {
    const {
      operator,
      registry,
      repository,
      calls,
      storySourceCalls,
      approvalBindingCalls,
      network,
    } = await fixture();
    for (const taskId of [
      "darktruth.story-approval",
      "darktruth.quality-localization",
    ]) {
      await approvePrerequisite(operator, taskId);
    }
    for (const taskId of [
      "darktruth.shot-plan",
      "darktruth.reference-plan",
      "darktruth.reference-prepare",
      "darktruth.reference-validate",
    ] as const) {
      await operator.runTask(taskId);
    }
    await expect(operator.runTask("darktruth.scene-images")).rejects.toThrow(
      /not ready/u
    );
    expect(
      registry.explain("darktruth.reference-approval").implementationBound
    ).toBe(false);
    await expect(
      operator.runTask("darktruth.reference-approval")
    ).rejects.toThrow(/no migrated implementation binding/u);
    await approvePrerequisite(operator, "darktruth.reference-approval");

    for (const taskId of [
      "darktruth.scene-images",
      "darktruth.quality-visual-continuity",
      "darktruth.thumbnail-concept",
      "darktruth.thumbnail-generate",
      "darktruth.thumbnail-validate",
      "darktruth.narration-instructions",
      "darktruth.audio-generate",
      "darktruth.audio-validate",
      "darktruth.captions",
      "darktruth.render",
      "darktruth.quality-audiovisual",
      "darktruth.metadata",
      "darktruth.publish-dry-run",
    ] as const) {
      await operator.runTask(taskId);
    }

    expect(calls).toEqual(DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS);
    expect(storySourceCalls).toEqual([
      "darktruth.rewrite-full",
      "darktruth.episode-bible",
      "darktruth.episode-bible",
      "darktruth.rewrite-full",
      "darktruth.localize",
      "darktruth.quality-localization",
      "darktruth.localize",
      "darktruth.quality-localization",
    ]);
    expect(approvalBindingCalls).toEqual([
      "darktruth.story-approval",
      "darktruth.reference-approval",
    ]);
    expect(network).not.toHaveBeenCalled();
    expect(
      DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS.every(
        (taskId) => registry.explain(taskId).implementationBound
      )
    ).toBe(true);
    for (const taskId of [
      "darktruth.publish-approval",
      "darktruth.publish",
    ]) {
      expect(registry.explain(taskId).implementationBound).toBe(false);
    }

    const state = await operator.store.readState();
    for (const taskId of DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS) {
      const task = state.tasks.find((candidate) => candidate.taskId === taskId);
      expect(task?.status).toBe("succeeded");
      const attempt = await operator.store.readAttempt(task!.attemptId!);
      if (
        attempt.status !== "completed" ||
        attempt.result.status !== "succeeded"
      ) {
        throw new Error(`Expected a successful attempt for ${taskId}.`);
      }
      const manifest = attempt.result.outputs[0]!;
      expect(manifest).toMatchObject({
        producerTaskId: taskId,
        producerAttemptId: task!.attemptId,
      });
      const verifiedArtifact = await verifyCanonicalDarkTruthMediaArtifact(
        repository,
        manifest
      );
      expect(verifiedArtifact).toMatchObject({
        taskId,
        fingerprint: attempt.fingerprint,
        evidence: {
          payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
          storySources: (
            expectedStorySources[
              taskId as keyof typeof expectedStorySources
            ] ?? []
          ).map((sourceTaskId) => ({ taskId: sourceTaskId })),
          approvalBindings:
            taskId === "darktruth.publish-dry-run"
              ? [
                  { taskId: "darktruth.story-approval" },
                  { taskId: "darktruth.reference-approval" },
                ]
              : [],
        },
        validation: { status: "passed" },
      });
      expect(verifiedArtifact.dependencyFingerprints).toEqual(
        manifest.dependencyFingerprints
      );
    }
  }, 15_000);

  it("fails closed when the story source port returns corrupt evidence", async () => {
    const { operator } = await fixture(true);
    await approvePrerequisite(operator, "darktruth.story-approval");
    await expect(operator.runTask("darktruth.shot-plan")).rejects.toThrow(
      /failed integrity validation/u
    );
  });

  it("fails closed when reference readiness evidence is missing", async () => {
    const { registry } = await fixture();
    const readiness = registry.readiness("darktruth.scene-images", {
      profileId: "dark-truth",
      completedTaskIds: new Set([
        "darktruth.reference-approval",
        "darktruth.shot-plan",
      ] as never[]),
      availableArtifacts: registry.get("darktruth.scene-images").definition
        .inputs,
      approvedTaskIds: new Set(),
    });
    expect(readiness.status).toBe("ready");

    const blocked = createTaskRegistry(
      createDarkTruthTaskRegistrations(
        {},
        {
          bibleReady: true,
          bibleReasons: [],
          referencesReady: false,
          referenceReasons: ["Approved reference revision is missing."],
        }
      )
    ).readiness("darktruth.scene-images", {
      profileId: "dark-truth",
      completedTaskIds: new Set([
        "darktruth.reference-approval",
        "darktruth.shot-plan",
      ] as never[]),
      availableArtifacts: registry.get("darktruth.scene-images").definition
        .inputs,
      approvedTaskIds: new Set(),
    });
    expect(blocked).toMatchObject({
      status: "blocked",
      reasons: expect.arrayContaining([
        "Approved reference revision is missing.",
      ]),
    });
  });
});
