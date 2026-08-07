import { describe, expect, it } from "vitest";
import { planHistoryVisualsV34 } from "../../src/history-workflow-v34.js";

const EPISODES = [
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia",
  "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
] as const;

describe("History V3.4 portfolio acceptance", () => {
  it("satisfies cross-episode mandatory visual thresholds", async () => {
    const plans = [];
    for (const episodeId of EPISODES) {
      const { plan } = await planHistoryVisualsV34({
        episodeId,
        outputRoot: "episodes",
        force: true,
      });
      plans.push(plan);
      expect(plan.sourceAuthorityMode).toBe("trusted-script");
      expect(plan.approval.contentApprovalEligible).toBe(true);
      for (const ratio of plan.aspectRatioPlans) {
        expect(ratio.evaluated).toBe(true);
      }
    }

    const totalMaps = plans.reduce((sum, plan) => sum + plan.mapStates.length, 0);
    const totalDiagrams = plans.reduce((sum, plan) => sum + plan.diagramStates.length, 0);
    expect(totalMaps).toBeGreaterThanOrEqual(11);
    expect(totalDiagrams).toBeGreaterThanOrEqual(5);
    expect(plans.every((plan) => plan.qualityMetrics.passes)).toBe(true);
  }, 180_000);
});
