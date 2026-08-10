import { describe, expect, it } from "vitest";
import { veronicaPreImageReviewInstruction } from "./veronica-pre-image-review-pack.js";

describe("Veronica pre-image review instructions", () => {
  it("keeps Short-specific review criteria on the short variant", () => {
    const instruction = veronicaPreImageReviewInstruction("short");
    expect(instruction).toContain("Review this Short");
    expect(instruction).toContain("9:16 readability");
    expect(instruction).not.toContain("full / long-form");
  });

  it("projects full-form sequence and 16:9 criteria without Short language", () => {
    const instruction = veronicaPreImageReviewInstruction("full");
    expect(instruction).toContain("full / long-form");
    expect(instruction).toContain("16:9 composition");
    expect(instruction).toContain("multi-state representation validity");
    expect(instruction).toContain("long-form scene/event sequence coherence");
    expect(instruction).not.toContain("Review this Short");
    expect(instruction).not.toContain("9:16 readability");
  });
});
