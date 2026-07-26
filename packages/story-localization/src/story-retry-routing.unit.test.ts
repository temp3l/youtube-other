import { describe, expect, it } from "vitest";
import {
  assertRouteCompatible,
  computeStoryAffectRepairRoutingFingerprint,
  decideStoryAffectRepairRoute,
  decideRetryRoute,
  inferRepairScopeFromIssueCodes,
  normalizeIncompleteResponse,
  normalizeIncompleteReason,
  purposeFromVariant,
} from "./story-retry-routing.js";
import { GENERATED_STORY_VALIDATION_ISSUE_CODES } from "./generated-story-validator.js";
import {
  STORY_AFFECT_ISSUE_CODES,
  type StoryAffectIssueCode,
} from "./story-generation-contracts.js";

function affectFinding(
  issueCode: StoryAffectIssueCode,
  overrides: Partial<{
    readonly paragraphSpans: readonly { start: number; end: number }[];
    readonly beatIds: readonly string[];
    readonly repairScope: "beat" | "beat-range";
    readonly modifiableBeatIds: readonly string[];
    readonly protectedFacts: readonly { id: string; statement: string }[];
  }> = {}
) {
  return {
    id: `issue-${issueCode.toLowerCase()}`,
    assessment: "weakness" as const,
    issueCode,
    paragraphSpans: overrides.paragraphSpans ?? [{ start: 2, end: 2 }],
    affectRefs: {
      beatIds: overrides.beatIds ?? ["beat-002"],
    },
    repairScope: overrides.repairScope ?? ("beat" as const),
    modifiableBeatIds: overrides.modifiableBeatIds ?? ["beat-002"],
    protectedFacts: overrides.protectedFacts ?? [
      { id: "fact-ending", statement: "The bell rings one final time." },
    ],
  };
}

function architectureFinding(issueCode: StoryAffectIssueCode) {
  const finding = affectFinding(issueCode);
  return {
    id: finding.id,
    assessment: finding.assessment,
    issueCode: finding.issueCode,
    paragraphSpans: finding.paragraphSpans,
    affectRefs: finding.affectRefs,
  };
}

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

  it.each([
    STORY_AFFECT_ISSUE_CODES.LOCAL_RESPONSE_STEP_MISSING,
    STORY_AFFECT_ISSUE_CODES.LOCAL_COST_WEAKENED,
    STORY_AFFECT_ISSUE_CODES.LOCAL_BEAT_CONTRADICTION,
  ] as const)(
    "routes evidence-backed local affect issue %s to repair",
    (code) => {
      const decision = decideStoryAffectRepairRoute({
        purpose: "canonical-full",
        findings: [affectFinding(code)],
        paragraphCount: 4,
        availableModifiableBeatIds: ["beat-002"],
        attemptNumber: 0,
        retryCap: 1,
      });
      expect(decision).toMatchObject({
        action: "repair",
        scope: "beat",
        affectedBeatIds: ["beat-002"],
      });
    }
  );

  it.each([
    STORY_AFFECT_ISSUE_CODES.MISSING_CENTRAL_QUESTION,
    STORY_AFFECT_ISSUE_CODES.UNSUPPORTED_RULE,
    STORY_AFFECT_ISSUE_CODES.ARBITRARY_CLIMAX,
    STORY_AFFECT_ISSUE_CODES.CROSS_STORY_CAUSAL_FAILURE,
    STORY_AFFECT_ISSUE_CODES.INCOMPATIBLE_PAYOFF,
  ] as const)(
    "routes architecture affect issue %s to full regeneration",
    (code) => {
      const decision = decideStoryAffectRepairRoute({
        purpose: "canonical-full",
        findings: [architectureFinding(code)],
        paragraphCount: 4,
        availableModifiableBeatIds: ["beat-002"],
      });
      expect(decision).toMatchObject({
        action: "regenerate",
        scope: "full-regeneration",
      });
    }
  );

  it("blocks targeted repair without valid evidence, protected facts, or an existing modifiable beat", () => {
    const decision = decideStoryAffectRepairRoute({
      purpose: "localized-full",
      findings: [
        affectFinding(STORY_AFFECT_ISSUE_CODES.LOCAL_COST_WEAKENED, {
          paragraphSpans: [{ start: 2, end: 8 }],
          modifiableBeatIds: ["beat-invented"],
          protectedFacts: [],
        }),
      ],
      paragraphCount: 4,
      availableModifiableBeatIds: ["beat-002"],
    });
    expect(decision).toMatchObject({
      action: "block",
      reason: "invalid-repair-evidence",
    });
  });

  it("gives deterministic failures and retry ceilings precedence", () => {
    const finding = affectFinding(
      STORY_AFFECT_ISSUE_CODES.LOCAL_RESPONSE_STEP_MISSING
    );
    expect(
      decideStoryAffectRepairRoute({
        purpose: "canonical-full",
        findings: [finding],
        paragraphCount: 4,
        availableModifiableBeatIds: ["beat-002"],
        deterministicFailureIds: ["accepted-final-line"],
        attemptNumber: 0,
        retryCap: 1,
      })
    ).toMatchObject({
      action: "block",
      reason: "deterministic-validation",
    });
    expect(
      decideStoryAffectRepairRoute({
        purpose: "canonical-full",
        findings: [finding],
        paragraphCount: 4,
        availableModifiableBeatIds: ["beat-002"],
        attemptNumber: 1,
        retryCap: 1,
      })
    ).toMatchObject({
      action: "block",
      reason: "retry-cap-exhausted",
    });
  });

  it("blocks Short architecture repair pending parent full regeneration", () => {
    expect(
      decideStoryAffectRepairRoute({
        purpose: "canonical-short",
        findings: [
          architectureFinding(STORY_AFFECT_ISSUE_CODES.INCOMPATIBLE_PAYOFF),
        ],
        paragraphCount: 4,
        availableModifiableBeatIds: ["beat-002"],
      })
    ).toMatchObject({
      action: "block",
      reason: "requires-parent-full-regeneration",
    });
  });

  it("keeps routing fingerprints stable and invalidates them on policy inputs", () => {
    const input = {
      purpose: "canonical-full" as const,
      findings: [affectFinding(STORY_AFFECT_ISSUE_CODES.LOCAL_COST_WEAKENED)],
      paragraphCount: 4,
      availableModifiableBeatIds: ["beat-002"],
      attemptNumber: 0,
      retryCap: 1,
    };
    const fingerprint = computeStoryAffectRepairRoutingFingerprint(input);
    expect(computeStoryAffectRepairRoutingFingerprint(input)).toBe(fingerprint);
    expect(
      computeStoryAffectRepairRoutingFingerprint({
        ...input,
        attemptNumber: 1,
      })
    ).not.toBe(fingerprint);
  });
});
