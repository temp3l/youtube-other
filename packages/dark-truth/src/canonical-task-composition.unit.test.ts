import path from "node:path";

import {
  WorkflowStore,
  canonicalPublishEpisodeInputSchema,
  publicationAssetHash,
  publicationMetadataHash,
} from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS,
  createDarkTruthCanonicalTaskImplementations,
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

  it("binds darktruth.publish only through the canonical publication executor", async () => {
    const { story, media } = fixture();
    const metadata = {
      title: "Canonical publication",
      description: "Approved",
      tags: ["dark-truth"],
      categoryId: "27",
      privacyStatus: "private" as const,
      madeForKids: false,
      notifySubscribers: false,
      publishAt: null,
    };
    const bindings = [
      { assetId: "video-1", role: "video", contentHash: "a".repeat(64) },
      {
        assetId: "metadata-1",
        role: "metadata",
        contentHash: publicationMetadataHash(metadata),
      },
    ];
    const input = canonicalPublishEpisodeInputSchema.parse({
      workspaceId: "workspace-1",
      projectId: "project-1",
      workflowRunId: "workflow-1",
      episodeId: "episode-composition-1",
      taskId: "darktruth.publish",
      attemptId: "attempt-1",
      publicationId: "publication-1",
      approval: {
        id: "approval-1",
        revision: 1,
        artifactHash: "b".repeat(64),
        policy: "scoped-v1",
      },
      actor: { principalId: "principal-1", revision: 1 },
      credentialVersion: "credential-v1",
      artifacts: {
        aggregateHash: publicationAssetHash(bindings),
        bindings,
      },
      target: {
        channelId: "channel-1",
        visibility: "private",
        scheduledAt: null,
        playlistIds: [],
      },
      recoveryIdentity: "recovery-1",
      providerRequest: {
        expectedChannelId: "channel-1",
        recoveryIdentity: "recovery-1",
        video: {
          absolutePath: "/fixture/video.mp4",
          contentHash: "a".repeat(64),
        },
        metadata,
        metadataContentHash: publicationMetadataHash(metadata),
      },
      leaseSeconds: 60,
    });
    const resolve = vi.fn(async () => input);
    const executePublication = vi.fn(async () => ({
      kind: "published" as const,
      publicationId: "publication-1",
      providerObjectId: "youtube-1",
      reconciled: false,
    }));
    const implementations = createDarkTruthCanonicalTaskImplementations({
      story,
      media,
      publication: {
        context: { resolve },
        executor: { execute: executePublication },
      },
    });
    const result = await implementations["darktruth.publish"]({
      unitId: "episode-composition-1",
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      dryRun: false,
      runId: input.workflowRunId,
      attemptId: input.attemptId,
      fingerprint: "c".repeat(64),
      dependencyFingerprints: ["d".repeat(64)],
      control: {
        signal: new AbortController().signal,
        deadlineAt: "2026-08-11T12:10:00.000Z",
        leaseFence: 9,
        dispatchAttempt: 1,
      },
    });
    expect(executePublication).toHaveBeenCalledOnce();
    expect(result.outputArtifacts).toEqual([
      expect.objectContaining({
        taskId: "darktruth.publish",
        publicationId: "publication-1",
      }),
    ]);

    await expect(
      implementations["darktruth.publish"]({
        unitId: "episode-composition-1",
        profileId: "dark-truth",
        locale: "en",
        variant: "full",
        dryRun: false,
        runId: input.workflowRunId,
        attemptId: input.attemptId,
        fingerprint: "c".repeat(64),
        dependencyFingerprints: ["d".repeat(64)],
        control: {
          signal: new AbortController().signal,
          deadlineAt: null,
          leaseFence: null,
          dispatchAttempt: 1,
        },
      })
    ).rejects.toThrow(/filesystem-legacy execution is forbidden/u);
    expect(resolve).toHaveBeenCalledOnce();
  });
});
