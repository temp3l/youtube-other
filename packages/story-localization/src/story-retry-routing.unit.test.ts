import { describe, expect, it } from "vitest";
import {
  decideRetryRoute,
  normalizeIncompleteReason,
  purposeFromVariant,
} from "./story-retry-routing.js";

describe("story retry routing", () => {
  it("routes localized full token exhaustion to full regeneration", () => {
    const decision = decideRetryRoute({
      purpose: "localized-full",
      incompleteReason: "max_output_tokens",
      currentOutputCap: 6000,
      nextOutputCap: 9000,
    });
    expect(decision).toEqual({
      action: "regenerate",
      purpose: "localized-full",
      scope: "full-regeneration",
    });
  });

  it("routes short token exhaustion to short regeneration", () => {
    const decision = decideRetryRoute({
      purpose: "localized-short",
      incompleteReason: "max_output_tokens",
      currentOutputCap: 600,
      nextOutputCap: 900,
    });
    expect(decision).toEqual({
      action: "regenerate",
      purpose: "localized-short",
      scope: "short-regeneration",
    });
  });

  it("blocks deterministic non-repairable validation failures", () => {
    const decision = decideRetryRoute({
      purpose: "localized-short",
      issues: ["Missing central threat in short narration."],
      allowTargetedRepair: true,
    });
    expect(decision).toEqual({
      action: "block",
      reason: "deterministic-validation",
    });
  });

  it("suppresses unchanged exhausted retries", () => {
    const decision = decideRetryRoute({
      purpose: "localized-full",
      incompleteReason: "max_output_tokens",
      currentOutputCap: 6000,
      nextOutputCap: 6000,
    });
    expect(decision).toEqual({
      action: "block",
      reason: "unchanged-output-cap",
    });
  });

  it("normalizes sync and batch incomplete response shapes the same way", () => {
    expect(
      normalizeIncompleteReason({
        incomplete_details: { reason: "max_output_tokens" },
      })
    ).toBe("max_output_tokens");
    expect(
      normalizeIncompleteReason({
        response: {
          body: {
            incomplete_details: { reason: "max_output_tokens" },
          },
        },
      })
    ).toBe("max_output_tokens");
  });

  it("maps repository variants to retry purposes", () => {
    expect(purposeFromVariant("canonical-english-full")).toBe("canonical-full");
    expect(purposeFromVariant("localized-full")).toBe("localized-full");
    expect(purposeFromVariant("canonical-english-short")).toBe(
      "canonical-short"
    );
    expect(purposeFromVariant("localized-short")).toBe("localized-short");
  });
});
