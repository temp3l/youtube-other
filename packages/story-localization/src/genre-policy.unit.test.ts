import { describe, expect, it } from "vitest";
import {
  createGenrePolicyRegistry,
  DEFAULT_GENRE_POLICY_REGISTRY,
  GENRE_POLICY_IDS,
  GENRE_POLICY_REGISTRY_VERSION,
  prohibitedTechniqueIdSchema,
  resolveGenrePolicy,
  tensionSourceIdSchema,
  validateGenrePolicyCompatibility,
} from "./genre-policy.js";
import type { StoryIR } from "./story-artifact-model.js";

function makeStoryIr(overrides: Partial<StoryIR> = {}): StoryIR {
  return {
    genre: "documentary",
    fictionality: "nonfiction",
    narrativeMode: "evidence-led",
    entities: [],
    immutableFacts: [],
    chronology: ["A witness arrived.", "Investigators reviewed the footage."],
    centralThreat: {
      type: "unknown",
      description: "An unresolved evidentiary anomaly",
      intelligent: false,
    },
    centralRuleMechanism: {
      description: "The evidence remained disputed.",
      supernatural: false,
    },
    criticalObjects: [],
    writtenMessages: [],
    climax: "Investigators compared the final witness statements.",
    endingConsequence: "No definitive explanation was proven.",
    allowedInventionBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: true,
      motives: false,
      undocumentedActions: false,
    },
    ...overrides,
  };
}

describe("genre policy", () => {
  it("registers exactly one policy per supported canonical genre", () => {
    expect(Object.keys(DEFAULT_GENRE_POLICY_REGISTRY.byGenre)).toHaveLength(7);
    expect(GENRE_POLICY_IDS).toHaveLength(7);
  });

  it("resolves policies deterministically", () => {
    const one = resolveGenrePolicy({ genre: "documentary" });
    const two = resolveGenrePolicy({ genre: "documentary" });
    expect(one).toEqual(two);
    expect(one.ok && one.policy.id).toBe("genre-policy/documentary");
  });

  it("rejects duplicate policy ids and duplicate genres", () => {
    const policy = DEFAULT_GENRE_POLICY_REGISTRY.policies["genre-policy/documentary"];
    expect(() =>
      createGenrePolicyRegistry({
        policies: [policy, policy],
      })
    ).toThrow(/Duplicate genre policy id/u);
  });

  it("cannot be mutated externally", () => {
    expect(Object.isFrozen(DEFAULT_GENRE_POLICY_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_GENRE_POLICY_REGISTRY.policies)).toBe(true);
  });

  it("validates explicit policy versions", () => {
    const resolution = resolveGenrePolicy({
      genre: "documentary",
      requestedPolicyId: "genre-policy/documentary",
      requestedPolicyVersion: "0.0.1",
    });
    expect(resolution.ok).toBe(false);
    expect(resolution.issues[0]?.code).toBe("GENRE_POLICY_VERSION_UNSUPPORTED");
  });

  it("selects the conservative unknown policy for unknown genre", () => {
    const resolution = resolveGenrePolicy({ genre: "unknown" });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.policy.id).toBe("genre-policy/unknown");
      expect(resolution.issues.map((issue) => issue.code)).toContain(
        "UNKNOWN_GENRE_REQUIRES_CONSERVATIVE_POLICY"
      );
    }
  });

  it("does not vary selection by locale", () => {
    expect(resolveGenrePolicy({ genre: "folklore" })).toEqual(
      resolveGenrePolicy({ genre: "folklore" })
    );
  });

  it("keeps lookup and compatibility validation separate", () => {
    const resolution = resolveGenrePolicy({ genre: "historical-mystery" });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      return;
    }
    const issues = validateGenrePolicyCompatibility({
      storyIr: makeStoryIr({
        genre: "historical-mystery",
        centralThreat: {
          type: "supernatural",
          description: "A ghostly force was blamed for the deaths.",
          intelligent: true,
        },
        centralRuleMechanism: {
          description: "Witnesses said a curse dictated the deaths.",
          supernatural: true,
        },
      }),
      policy: resolution.policy,
    });
    expect(issues.map((issue) => issue.code)).toContain(
      "SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY"
    );
  });

  it("keeps rule id unions strict", () => {
    expect(tensionSourceIdSchema.safeParse("evidence").success).toBe(true);
    expect(tensionSourceIdSchema.safeParse("freeform").success).toBe(false);
    expect(prohibitedTechniqueIdSchema.safeParse("victim-blaming").success).toBe(
      true
    );
    expect(
      prohibitedTechniqueIdSchema.safeParse("invent-anything").success
    ).toBe(false);
  });

  it("warns on unresolved fictionality for evidence-led genres", () => {
    const resolution = resolveGenrePolicy({ genre: "true-crime" });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      return;
    }
    const issues = validateGenrePolicyCompatibility({
      storyIr: makeStoryIr({
        genre: "true-crime",
        fictionality: "unknown",
      }),
      policy: resolution.policy,
    });
    expect(issues.map((issue) => issue.code)).toContain(
      "FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE"
    );
  });

  it("blocks nonfiction invention conflicts", () => {
    const resolution = resolveGenrePolicy({ genre: "documentary" });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      return;
    }
    const issues = validateGenrePolicyCompatibility({
      storyIr: makeStoryIr({
        allowedInventionBoundaries: {
          dialogue: false,
          internalThoughts: false,
          connectiveDetails: true,
          motives: false,
          undocumentedActions: false,
        },
      }),
      policy: resolution.policy,
    });
    expect(issues.some((issue) => issue.code === "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY")).toBe(false);
  });

  it("preserves fictional supernatural rules and blocks supernatural mechanics for psychological stories", () => {
    const supernatural = resolveGenrePolicy({ genre: "fictional-supernatural" });
    const psychological = resolveGenrePolicy({ genre: "fictional-psychological" });
    expect(supernatural.ok && supernatural.policy.allowSupernaturalAsFact).toBe(true);
    expect(psychological.ok && psychological.policy.allowSupernaturalAsFact).toBe(false);
  });

  it("enforces folklore combination rules", () => {
    const resolution = resolveGenrePolicy({ genre: "folklore" });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      return;
    }
    const issues = validateGenrePolicyCompatibility({
      storyIr: makeStoryIr({
        genre: "folklore",
        fictionality: "nonfiction",
        narrativeMode: "character-led",
      }),
      policy: resolution.policy,
    });
    expect(issues.map((issue) => issue.code)).toContain(
      "CONFLICTING_GENRE_AND_FICTIONALITY"
    );
  });

  it("exposes the default registry version", () => {
    expect(DEFAULT_GENRE_POLICY_REGISTRY.registryVersion).toBe(
      GENRE_POLICY_REGISTRY_VERSION
    );
  });
});
