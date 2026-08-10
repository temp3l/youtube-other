import { describe, expect, it } from "vitest";

import {
  HISTORY_SHORT_TARGET_DURATION_SECONDS,
  createHistoryShortTtsCalibrationPlan,
  planHistoryShortVisuals,
  resolveHistoryShortNarration,
} from "./history-short-workflow.js";

const trustedNarration = [
  "In June 1812, Napoleon led the Grande Armée across the Niemen into Russia.",
  "The army depended on supply lines that grew longer with every mile east.",
  "Russian commanders repeatedly withdrew instead of giving Napoleon the battle he wanted.",
  "By the retreat from Moscow, hunger, disease, distance, and cold had devastated the army.",
].join(" ");

describe("History Short workflow", () => {
  it("creates a dedicated Short narration and first-class vertical plan", () => {
    const narration = resolveHistoryShortNarration({ trustedLongNarration: trustedNarration });
    const plan = planHistoryShortVisuals({ narration });
    expect(narration.sourceMode).toBe("derived-from-trusted-long");
    expect(narration.targetDurationSeconds).toBe(HISTORY_SHORT_TARGET_DURATION_SECONDS);
    expect(narration.narration).not.toContain("#");
    expect(plan.variant).toBe("short");
    expect(plan.aspectRatio).toBe("9:16");
    expect(plan.scenes[0]?.phase).toBe("hook");
    expect(plan.scenes.at(-1)?.phase).toBe("payoff");
    expect(plan.scenes.every((scene) => scene.aspectRatio === "9:16")).toBe(true);
    expect(plan.scenes.map((scene) => scene.id)).not.toContain("scene-001");
    expect(createHistoryShortTtsCalibrationPlan(narration)).toMatchObject({
      mode: "adaptive-duration",
      targetDurationSeconds: 60,
      preferredDurationRangeSeconds: [55, 65],
    });
  });

  it("uses an explicitly supplied short source and never silently treats long narration as one", () => {
    const narration = resolveHistoryShortNarration({
      trustedLongNarration: trustedNarration,
      dedicatedShortNarration:
        "Napoleon crossed the Niemen in 1812, but every mile stretched his supply line. Russia traded land for time, and the retreat exposed the accumulated cost.",
    });
    expect(narration.sourceMode).toBe("dedicated-source");
    expect(narration.narration).toContain("Russia traded land for time");
  });
});
