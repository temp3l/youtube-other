import { describe, expect, it } from "vitest";

import {
  HistoryProductionRoutingConfigErrorV36,
  parseHistoryProductionModeV36,
  parseHistoryV36CanaryEpisodes,
  resolveHistoryProductionCanaryRouteV36,
  resolveHistoryProductionRouteV36,
} from "./production-canary-route-v36.js";

const blackDeath = "history-youtube-history-10-video-story-pack-04-black-death";
const dDay = "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";
const nonCanary =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
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

  it("models OFF, CANARY, and GLOBAL as explicit production states", () => {
    expect(parseHistoryProductionModeV36(undefined)).toBe("global");
    expect(parseHistoryProductionModeV36("shadow")).toBe("off");
    expect(
      resolveHistoryProductionRouteV36({ episodeId: nonCanary })
    ).toMatchObject({
      route: "V3_6_PRODUCTION",
      mode: "global",
      productionActivated: true,
    });
    expect(
      resolveHistoryProductionRouteV36({
        episodeId: blackDeath,
        activationFlagValue: "off",
        canaryEpisodesValue: allowlist,
      })
    ).toMatchObject({ route: "V3_5_PRODUCTION", mode: "off" });
    expect(
      resolveHistoryProductionRouteV36({
        episodeId: blackDeath,
        activationFlagValue: "canary",
        canaryEpisodesValue: allowlist,
      })
    ).toMatchObject({ route: "V3_6_PRODUCTION", mode: "canary" });
    expect(
      resolveHistoryProductionRouteV36({
        episodeId: "history-not-a-canary",
        activationFlagValue: "canary",
        canaryEpisodesValue: allowlist,
      })
    ).toMatchObject({ route: "V3_5_PRODUCTION", mode: "canary" });
    expect(
      resolveHistoryProductionRouteV36({
        episodeId: "history-not-a-canary",
        activationFlagValue: "global",
        canaryEpisodesValue: "",
      })
    ).toMatchObject({
      route: "V3_6_PRODUCTION",
      mode: "global",
      productionActivated: true,
    });
  });

  it("fails closed for an invalid production routing value", () => {
    expect(() =>
      parseHistoryProductionModeV36("production")
    ).toThrow(HistoryProductionRoutingConfigErrorV36);
  });
});
