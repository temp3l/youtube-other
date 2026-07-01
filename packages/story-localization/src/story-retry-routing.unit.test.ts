import { describe, expect, it } from "vitest";
import {
  assertRouteCompatible,
  decideRetryRoute,
  inferRepairScopeFromIssueCodes,
  normalizeIncompleteResponse,
  normalizeIncompleteReason,
  purposeFromVariant,
} from "./story-retry-routing.js";
import { GENERATED_STORY_VALIDATION_ISSUE_CODES } from "./generated-story-validator.js";

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

  it("allows targeted repair for unsupported-fact short failures", () => {
    const decision = decideRetryRoute({
      purpose: "localized-short",
      issues: [
        "Short introduces unsupported facts.",
        "Short contains orphaned references.",
      ],
      issueCodes: [
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_UNSUPPORTED_FACT,
        GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_ORPHANED_REFERENCE,
      ],
      allowTargetedRepair: true,
    });
    expect(decision).toEqual({
      action: "repair",
      purpose: "localized-short",
      scope: "sentence",
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
    expect(
      normalizeIncompleteResponse({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        usage: {
          input_tokens: 12,
          output_tokens: 0,
          total_tokens: 12,
        },
      })
    ).toMatchObject({
      status: "incomplete",
      reason: "content_filter",
      usage: {
        inputTokens: 12,
        outputTokens: 0,
        totalTokens: 12,
      },
    });
  });

  it("maps repository variants to retry purposes", () => {
    expect(purposeFromVariant("canonical-english-full")).toBe("canonical-full");
    expect(purposeFromVariant("localized-full")).toBe("localized-full");
    expect(purposeFromVariant("canonical-english-short")).toBe(
      "canonical-short"
    );
    expect(purposeFromVariant("localized-short")).toBe("localized-short");
  });

  it("uses typed short issue codes to select a narrow repair scope", () => {
    expect(
      inferRepairScopeFromIssueCodes({
        purpose: "localized-short",
        issueCodes: [
          GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_HOOK_TOO_LATE,
        ],
      })
    ).toBe("hook");
  });

  it("rejects invalid full-to-short route combinations", () => {
    expect(() =>
      assertRouteCompatible({
        purpose: "localized-full",
        scope: "short-regeneration",
      })
    ).toThrow(/Incompatible full-story retry route/);
  });
});
