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
      schemaVersion: "strategic-reinvention.pilot-fixture.v1",
      creatorProfileId: "veronica-benini",
      genreId: "strategic-reinvention",
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
      status: "passed",
    });
    expect(first.fullTaskIds).toEqual(STRATEGIC_FULL_TASK_IDS);
    expect(first.completedStageCount).toBe(STRATEGIC_FULL_TASK_IDS.length);
    expect(first.publishBlockers.length).toBeGreaterThan(0);
    },
    60_000,
  );
});
