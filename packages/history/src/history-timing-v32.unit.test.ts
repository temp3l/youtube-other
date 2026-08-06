import { describe, expect, it } from "vitest";
import {
  allocateHistoryTimingV32,
  classifyHistoryTimingDeltaV32,
  estimateHistoryTimingV32,
} from "./history-timing-v32.js";

describe("History V3.2 timing", () => {
  it("derives a bounded total independently of narration unit segmentation", () => {
    const text = Array.from({ length: 180 }, () => "A measured historical claim.").join(" ");
    const timing = estimateHistoryTimingV32(text, { paragraphCount: 20, chapterCount: 4 });
    expect(timing.totalDurationMs).toBeLessThan(timing.baseSpeechMs * 1.05);
    expect(estimateHistoryTimingV32(text).totalDurationMs).toBeLessThan(timing.totalDurationMs);
  });

  it("caps pauses and allocates exactly with stable largest remainders", () => {
    const timing = estimateHistoryTimingV32("Word,".repeat(5_000), { paragraphCount: 500, chapterCount: 100 });
    expect(timing.punctuationPauseMs).toBeLessThanOrEqual(15_000);
    expect(timing.paragraphPauseMs).toBeLessThanOrEqual(12_000);
    expect(timing.chapterPauseMs).toBeLessThanOrEqual(6_000);
    expect(allocateHistoryTimingV32(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateHistoryTimingV32(10, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("classifies tolerance bands without episode exceptions", () => {
    expect(classifyHistoryTimingDeltaV32(605_000, 600_000)).toBe("pass");
    expect(classifyHistoryTimingDeltaV32(630_000, 600_000)).toBe("warning");
    expect(classifyHistoryTimingDeltaV32(700_001, 600_000)).toBe("block");
  });
});
