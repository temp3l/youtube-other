import { describe, expect, it } from "vitest";

import {
  buildTaskFingerprint,
  createSubsystemLegacyCacheAdapter,
  createVersionedLegacyCacheAdapter,
  evaluateTaskCache,
  normalizeFingerprintValue,
  planCachePrune,
} from "./cache.js";

const base = {
  workflowId: "fixture.workflow",
  workflowRevision: "fixture.v1",
  taskId: "fixture.prepare",
  taskVersion: "fixture.v1",
  unitId: "fixture",
  profileId: "dark-truth",
  locale: "en",
  variant: "full",
} as const;

describe("workflow cache fingerprints", () => {
  it("is stable across object keys and artifact ordering", () => {
    const left = buildTaskFingerprint({
      ...base,
      dependencyFingerprints: ["b".repeat(64), "a".repeat(64)],
      material: { configuration: { z: 1, a: [true, null] } },
    });
    const right = buildTaskFingerprint({
      ...base,
      dependencyFingerprints: ["a".repeat(64), "b".repeat(64)],
      material: { configuration: { a: [true, null], z: 1 } },
    });
    expect(left).toBe(right);
  });

  it.each([
    ["task version", { taskVersion: "fixture.v2" }],
    ["configuration", { material: { configuration: { value: 2 } } }],
    ["prompt", { material: { prompt: { version: "prompt.v2" } } }],
    ["schema", { material: { schemas: { response: "schema.v2" } } }],
    ["profile", { material: { profile: { policy: "profile.v2" } } }],
    ["provider", { material: { provider: "provider.v2" } }],
    ["model", { material: { model: "model-v2" } }],
    ["parameters", { material: { parameters: { temperature: 0.1 } } }],
    ["tools", { material: { tools: { ffmpeg: "8" } } }],
    ["renderer", { material: { renderer: "render.v2" } }],
    ["locale", { locale: "de" }],
    ["variant", { variant: "short" }],
    ["bible", { material: { bibleRevision: "bible.v2" } }],
    ["references", { material: { referenceSetRevision: "refs.v2" } }],
    ["curriculum", { material: { curriculumRevision: "curriculum.v2" } }],
    ["visual style", { material: { visualStyleRevision: "visual.v2" } }],
    ["dependency", { dependencyFingerprints: ["a".repeat(64)] }],
  ])("changes when material input %s changes", (_name, change) => {
    expect(buildTaskFingerprint({ ...base, ...change })).not.toBe(
      buildTaskFingerprint(base)
    );
  });

  it("rejects lossy or unstable values", () => {
    expect(() => normalizeFingerprintValue({ value: undefined })).toThrow(
      /undefined/u
    );
    expect(() => normalizeFingerprintValue(Number.NaN)).toThrow(/non-finite/u);
    expect(() => normalizeFingerprintValue(new Date())).toThrow(/plain JSON/u);
  });
});

describe("workflow cache decisions", () => {
  it.each([
    "prompt",
    "narration",
    "story",
    "image",
    "render",
    "mathematics",
  ] as const)("provides a versioned %s subsystem adapter", (family) => {
    const adapter = createSubsystemLegacyCacheAdapter({
      family,
      inspect: () => [],
    });
    expect(adapter.supportedIdentityVersions.size).toBeGreaterThan(0);
  });

  it("treats unknown legacy identity as a miss", async () => {
    const fingerprint = buildTaskFingerprint(base);
    const decision = await evaluateTaskCache({
      taskId: base.taskId,
      taskVersion: base.taskVersion,
      policy: "fingerprint",
      fingerprint,
      attempts: [],
      outputsRequired: false,
      verifyManifest: () => true,
      legacyAdapters: [
        createVersionedLegacyCacheAdapter({
          family: "story",
          supportedIdentityVersions: ["story-cache.v3"],
          inspect: () => [
            {
              successful: true,
              fingerprint,
              outputManifests: [],
              evidence: "unversioned story cache entry",
            },
          ],
        }),
      ],
    });
    expect(decision).toMatchObject({
      status: "miss",
      reason: "legacy-identity-unknown",
    });
  });

  it("never hits on a successful record without required manifests", async () => {
    const fingerprint = buildTaskFingerprint(base);
    const decision = await evaluateTaskCache({
      taskId: base.taskId,
      taskVersion: base.taskVersion,
      policy: "fingerprint",
      fingerprint,
      attempts: [
        {
          schemaVersion: "mediaforge.workflow-store.v1",
          status: "completed",
          id: "attempt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          runId: "run-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          workflowInstanceId: "workflow-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          taskId: base.taskId,
          fingerprint,
          attemptNumber: 1,
          startedAt: "2026-07-14T10:00:00.000Z",
          completedAt: "2026-07-14T10:00:01.000Z",
          result: {
            schemaVersion: "mediaforge.task.v1",
            status: "succeeded",
            outputs: [],
            warnings: [],
          },
        },
      ],
      outputsRequired: true,
      verifyManifest: () => true,
    });
    expect(decision.reason).toBe("output-manifest-missing");
  });
});

describe("cache prune safety", () => {
  it("protects attempt history, hits, unknown entries, and active locks", () => {
    const plan = planCachePrune([
      { family: "canonical-attempt", key: "attempt-1", status: "stale" },
      { family: "story", key: "hit", status: "hit" },
      { family: "render", key: "unknown", status: "unknown" },
      { family: "image", key: "locked", status: "invalid", locked: true },
      { family: "narration", key: "stale", status: "stale" },
    ]);
    expect(plan.removable).toEqual([
      { family: "narration", key: "stale", status: "stale" },
    ]);
    expect(plan.protected).toHaveLength(4);
  });
});
