import path from "node:path";

import { WorkflowStore } from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS,
  createDarkTruthSafeCanonicalTaskImplementations,
} from "./canonical-task-composition.js";
import {
  DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS,
  type DarkTruthCanonicalMediaService,
  type DarkTruthMediaExecutableTaskId,
} from "./canonical-media-task-adapters.js";
import {
  DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS,
  createDarkTruthCanonicalStoryArtifactRepository,
  type DarkTruthCanonicalStoryService,
  type DarkTruthStoryExecutableTaskId,
} from "./canonical-story-task-adapters.js";
import {
  DARK_TRUTH_TASK_IDS,
  createDarkTruthTaskRegistry,
  darkTruthWorkflowDefinition,
} from "./task-registry.js";

const intentionallyUnboundTaskIds = [
  "darktruth.story-approval",
  "darktruth.reference-approval",
  "darktruth.publish-approval",
  "darktruth.publish",
] as const;

function services<T extends string>(
  taskIds: readonly T[],
  execute: ReturnType<typeof vi.fn>
): Record<T, DarkTruthCanonicalStoryService | DarkTruthCanonicalMediaService> {
  return Object.fromEntries(
    taskIds.map((taskId) => [
      taskId,
      { providerMode: "fake", execute },
    ])
  ) as Record<
    T,
    DarkTruthCanonicalStoryService | DarkTruthCanonicalMediaService
  >;
}

function fixture() {
  const workspaceRoot = path.resolve("/tmp/darktruth-composition-fixture");
  const unitId = "episode-composition-1";
  const unitRoot = path.join(workspaceRoot, unitId);
  const identity = {
    instanceId: "darktruth-composition-fixture",
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
  const execute = vi.fn();
  const storyServices = services(DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS, execute) as Record<
    DarkTruthStoryExecutableTaskId,
    DarkTruthCanonicalStoryService
  >;
  const mediaServices = services(DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS, execute) as Record<
    DarkTruthMediaExecutableTaskId,
    DarkTruthCanonicalMediaService
  >;
  const story = {
    workspaceRoot,
    unitRoot,
    unitId,
    policyRevision: "darktruth-policy-fixture-v1",
    store,
    repository,
    services: storyServices,
  };
  const media = {
    workspaceRoot,
    unitRoot,
    unitId,
    policyRevision: "darktruth-policy-fixture-v1",
    store,
    repository,
    services: mediaServices,
    storySourcePort: { load: vi.fn() },
    approvalBindingPort: { load: vi.fn() },
  };
  return { story, media, execute };
}

describe("canonical Dark Truth task composition", () => {
  it("binds exactly every safe reversible canonical task", () => {
    const { story, media, execute } = fixture();
    const implementations = createDarkTruthSafeCanonicalTaskImplementations({
      story,
      media,
    });
    const registry = createDarkTruthTaskRegistry(implementations, {
      bibleReady: true,
      bibleReasons: [],
      referencesReady: true,
      referenceReasons: [],
    });

    expect(Object.keys(implementations).sort()).toEqual(
      [...DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS].sort()
    );
    expect(
      DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS.every(
        (taskId) => registry.explain(taskId).implementationBound
      )
    ).toBe(true);
    expect(
      DARK_TRUTH_TASK_IDS.filter(
        (taskId) => !registry.explain(taskId).implementationBound
      )
    ).toEqual(intentionallyUnboundTaskIds);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects inconsistent identity and missing services before composition", () => {
    const { story, media } = fixture();
    expect(() =>
      createDarkTruthSafeCanonicalTaskImplementations({
        story,
        media: { ...media, policyRevision: "different-policy" },
      })
    ).toThrow(/identity mismatch: policyRevision/u);

    const servicesWithoutRender = { ...media.services } as Partial<
      typeof media.services
    >;
    delete servicesWithoutRender["darktruth.render"];
    expect(() =>
      createDarkTruthSafeCanonicalTaskImplementations({
        story,
        media: {
          ...media,
          services: servicesWithoutRender as typeof media.services,
        },
      })
    ).toThrow(/Missing source-authoritative service for darktruth\.render/u);
  });
});
