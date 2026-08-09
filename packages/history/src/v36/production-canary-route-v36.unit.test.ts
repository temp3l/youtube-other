import { describe, expect, it } from "vitest";

import {
  parseHistoryV36CanaryEpisodes,
  resolveHistoryProductionCanaryRouteV36,
} from "./production-canary-route-v36.js";

const blackDeath = "history-youtube-history-10-video-story-pack-04-black-death";
const dDay = "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";
const allowlist = `${blackDeath},${dDay}`;

describe("V3.6 production canary routing", () => {
  it("normalizes and deduplicates exact episode allowlist values", () => {
    expect(parseHistoryV36CanaryEpisodes(` ${dDay},${blackDeath},${dDay} `)).toEqual([
      blackDeath,
      dDay,
    ]);
  });

  it("keeps V3.5 as the default route", () => {
    expect(
      resolveHistoryProductionCanaryRouteV36({
        episodeId: blackDeath,
        canaryEpisodesValue: allowlist,
      })
    ).toEqual(
      expect.objectContaining({
        route: "V3_5_PRODUCTION",
        productionActivated: false,
        reason: "V3_6_DISABLED_BY_DEFAULT",
      })
    );
  });

  it("selects V3.6 only for an explicitly allowlisted canary", () => {
    expect(
      resolveHistoryProductionCanaryRouteV36({
        episodeId: dDay,
        activationFlagValue: "canary",
        canaryEpisodesValue: allowlist,
      })
    ).toEqual(
      expect.objectContaining({
        route: "V3_6_PRODUCTION_CANDIDATE",
        productionActivated: false,
      })
    );
    expect(
      resolveHistoryProductionCanaryRouteV36({
        episodeId: "history-not-a-canary",
        activationFlagValue: "canary",
        canaryEpisodesValue: allowlist,
      })
    ).toEqual(
      expect.objectContaining({
        route: "V3_5_PRODUCTION",
        reason: "EPISODE_NOT_IN_CANARY_ALLOWLIST",
      })
    );
  });
});
