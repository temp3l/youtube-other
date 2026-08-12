import { describe, expect, it } from "vitest";

import {
  fixtureSafeZoneLayout,
  validateSafeZoneLayout,
} from "./safe-zone-layout.js";

describe("platform safe-zone layout", () => {
  it("keeps fixture UI, subtitles, faces and reveals inside base 9:16 content safe area", () => {
    const result = fixtureSafeZoneLayout("base-9x16");
    expect(result.issues).toEqual([]);
  });

  it("flags TikTok overlay collisions for bottom subtitles and right-rail UI", () => {
    const result = validateSafeZoneLayout({
      target: "tiktok",
      elements: [
        {
          id: "subtitle.segment-001",
          kind: "subtitles",
          bounds: { x: 0.12, y: 0.74, width: 0.68, height: 0.08 },
        },
        {
          id: "signal-ui.action-chip",
          kind: "ui",
          bounds: { x: 0.83, y: 0.46, width: 0.1, height: 0.1 },
        },
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "SAFE_ZONE_PLATFORM_COLLISION",
      "SAFE_ZONE_PLATFORM_COLLISION",
    ]);
  });

  it("keeps the fixture clear on YouTube Shorts by staying above bottom chrome", () => {
    const result = fixtureSafeZoneLayout("youtube-shorts");
    expect(result.issues).toEqual([]);
  });

  it("blocks critical reveals that intersect platform chrome", () => {
    const result = validateSafeZoneLayout({
      target: "youtube-shorts",
      elements: [
        {
          id: "reveal.countdown-digits",
          kind: "critical-reveals",
          bounds: { x: 0.38, y: 0.82, width: 0.24, height: 0.1 },
        },
      ],
    });

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "SAFE_ZONE_CRITICAL_REVEAL_BLOCKED",
        elementId: "reveal.countdown-digits",
        regionId: "youtube-shorts.bottom-band",
      }),
    ]);
  });
});
