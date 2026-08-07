import { describe, expect, it } from "vitest";
import { runStrategicPilotFixture } from "./pilot-fixture.js";

describe("strategic pilot fixture", () => {
  it("runs the accepted strategic workflow contract without provider mutations", async () => {
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
      supplementalTaskIds: expect.arrayContaining([
        "strategic.supplemental-ingest",
        "strategic.supplemental-review",
      ]),
      providerMutations: 0,
      publishStatus: "dry-run-blocked",
      publishBlockers: expect.arrayContaining([
        "Creator profile status is discovery.",
      ]),
      resumedSupplemental: true,
      sourceInvalidationDetected: true,
      status: "passed",
    });
    expect(first.supplementalTaskIds).toHaveLength(5);
    expect(first.publishBlockers.length).toBeGreaterThan(0);
  });
});
