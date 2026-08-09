import { describe, expect, it } from "vitest";
import { runStrategicPilotFixture } from "./pilot-fixture.js";
import { STRATEGIC_FULL_TASK_IDS } from "./task-registry.js";

describe("strategic pilot fixture", () => {
  it(
    "runs the accepted strategic workflow contract without provider mutations",
    async () => {
    const first = await runStrategicPilotFixture();
    const second = await runStrategicPilotFixture();
    expect(first).toEqual({
      ...second,
      episodeId: first.episodeId,
    });
    expect(first).toMatchObject({
      schemaVersion: "veronicabenini.pilot-fixture.v2",
      contentProfileId: "veronicabenini",
      creatorProfileId: "veronica-benini",
      compatibilityAlias: "strategic-reinvention",
      locales: ["it", "en", "es"],
      variants: ["full", "short"],
      fullTaskIds: expect.arrayContaining([
        "strategic.source-ingest",
        "strategic.supplemental-ingest",
        "strategic.publish-approval",
      ]),
      providerMutations: 0,
      publishStatus: "dry-run-blocked",
      publishBlockers: expect.arrayContaining([
        "Creator profile status is discovery.",
      ]),
      resumedEpisode: true,
      sourceInvalidationDetected: true,
      acceptanceEvidence: {
        schemaVersion: "veronicabenini.acceptance-evidence.v1",
        contentProfileId: "veronicabenini",
        localizationReuse: {
          locales: ["en", "es"],
          rationale: "language-independent-visual",
          invalidatedSharedVisuals: false,
        },
        cacheReuse: {
          resumedContentHashMatch: true,
          rationale: "content-hash-match",
        },
        sourceInvalidation: {
          detected: true,
          rationale: "source-content-changed",
        },
        approvedHistoryPreserved: true,
        releaseGate: {
          providerDispatchEnabled: false,
          irreversibleWorkEnabled: false,
          publicationState: "dry-run-blocked",
          failureEvidence: {
            code: "EXTERNAL_ACTIVATION_REQUIRED",
            redacted: true,
          },
        },
      },
      status: "passed",
    });
    expect(first.fullTaskIds).toEqual(STRATEGIC_FULL_TASK_IDS);
    expect(first.completedStageCount).toBe(STRATEGIC_FULL_TASK_IDS.length);
    expect(first.publishBlockers.length).toBeGreaterThan(0);
    expect(first.acceptanceEvidence.artifactBindings).toHaveLength(4);
    expect(new Set(first.acceptanceEvidence.localizationReuse.locales)).toEqual(new Set(["en", "es"]));
    expect(first.acceptanceEvidence.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    },
    60_000,
  );
});
