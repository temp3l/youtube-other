import { describe, expect, it } from "vitest";
import {
  formatHistoryApprovalPackProgressLine,
  formatHistoryApprovalPackProgressPercent,
} from "./history-approval-pack-progress.js";

describe("history approval-pack progress", () => {
  it("formats percentage from completed episode count", () => {
    expect(formatHistoryApprovalPackProgressPercent(3, 10)).toBe("30%");
    expect(formatHistoryApprovalPackProgressPercent(1, 3)).toBe("33%");
    expect(formatHistoryApprovalPackProgressPercent(10, 10)).toBe("100%");
  });

  it("formats a progress line with episode id", () => {
    expect(
      formatHistoryApprovalPackProgressLine({
        completed: 5,
        total: 30,
        episodeId: "history-youtube-history-10-video-story-pack-05-franklin-expedition",
        phase: "episodes",
      })
    ).toBe(
      "History approval packs: 17% (5/30 episodes) history-youtube-history-10-video-story-pack-05-franklin-expedition"
    );
  });
});
