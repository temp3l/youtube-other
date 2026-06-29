import { describe, expect, it } from "vitest";
import {
  buildFullStoryContract,
  computeFullStoryContractBuildFingerprint,
  computeFullStoryContractContentHash,
  computeStoryIrContentHash,
  FULL_STORY_CONTRACT_BUILDER_VERSION,
  fullStoryContractSchema,
} from "./full-story-contract.js";
import { DEFAULT_GENRE_POLICY_REGISTRY } from "./genre-policy.js";
import type {
  FullStoryOutputConstraints,
  StoryArtifactIdentity,
  StoryIR,
} from "./story-artifact-model.js";

function makeIdentity(
  overrides: Partial<StoryArtifactIdentity> = {}
): StoryArtifactIdentity {
  return {
    episodeNumber: "014",
    episodeSlug: "014-dyatlov-pass",
    language: "en",
    locale: "en-US",
    variant: "full",
    ...overrides,
  };
}

function makeConstraints(
  overrides: Partial<FullStoryOutputConstraints> = {}
): FullStoryOutputConstraints {
  return {
    variant: "full",
    targetNarrationWpm: 170,
    targetWordRange: { min: 2400, max: 3200 },
    targetDuration: { minSeconds: 840, maxSeconds: 1200 },
    ...overrides,
  };
}

function makeLineage() {
  return {
    kind: "story-ir-only" as const,
    storyIrHash: "a".repeat(64),
    reason: "test-fixture" as const,
  };
}

function makeStoryIr(overrides: Partial<StoryIR> = {}): StoryIR {
  return {
    genre: "historical-mystery",
    fictionality: "nonfiction",
    narrativeMode: "evidence-led",
    entities: [
      {
        id: "person:igor-dyatlov",
        name: "Igor Dyatlov",
        type: "person",
      },
    ],
    immutableFacts: [
      {
        id: "fact-1",
        statement: "The group left the tent during the night.",
        confidence: "confirmed",
        immutable: true,
      },
    ],
    chronology: [
      "The hikers camped high on the slope.",
      "Investigators found the tent cut open from the inside.",
    ],
    centralThreat: {
      type: "environmental",
      description: "A lethal environmental event of uncertain cause",
      intelligent: false,
    },
    centralRuleMechanism: {
      description: "The cause remains disputed by investigators.",
      supernatural: false,
    },
    criticalObjects: [],
    writtenMessages: [
      {
        text: "BACK BY MORNING",
        preserveVerbatim: true,
      },
    ],
    climax: "Investigators reconstructed the final movements from the physical evidence.",
    endingConsequence: "The deaths remained unresolved despite competing theories.",
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

describe("full story contract", () => {
  it("builds a valid full contract", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr(),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.contract.identity.variant).toBe("full");
    expect(result.contract.sourceTruth.narrativeCulmination).toContain(
      "Investigators reconstructed"
    );
  });

  it("rejects unknown contract properties", () => {
    const parsed = fullStoryContractSchema.safeParse({
      schemaVersion: "full-story-contract-schema-v1",
      contractVersion: "full-story-contract-v1",
      identity: makeIdentity(),
      classification: {
        genre: "documentary",
        fictionality: "nonfiction",
        narrativeMode: "documentary",
        genrePolicyId: "genre-policy/documentary",
        genrePolicyVersion: "1.0.0",
      },
      sourceTruth: {
        entities: [],
        immutableFacts: [],
        chronology: ["Event"],
        centralThreat: {
          type: "unknown",
          description: "A reported anomaly",
          intelligent: false,
        },
        criticalObjects: [],
        writtenMessages: [],
        narrativeCulmination: "Investigators closed the archive.",
        endingConsequence: "The uncertainty remained.",
        metadata: "forbidden",
      },
      generationBoundaries: {
        dialogue: false,
        internalThoughts: false,
        connectiveDetails: "qualified-only",
        motives: false,
        undocumentedActions: false,
        qualifiedReconstruction: true,
        requireConfidenceAttribution: true,
        prohibitUnsupportedCertainty: true,
      },
      fullOutputConstraints: makeConstraints(),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects short identities and constraints", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr(),
      artifactIdentity: makeIdentity({ variant: "short" }),
      outputConstraints: {
        variant: "short",
        targetNarrationWpm: 175,
        targetWordRange: { min: 160, max: 190 },
        targetDuration: { minSeconds: 45, maxSeconds: 60 },
        hookDeadlineSeconds: 3,
        fullVideoBridgeRequired: true,
      } as never,
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(false);
  });

  it("resolves effective boundaries before task 05 with restrictive policy precedence", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr({
        genre: "unknown",
        fictionality: "unknown",
        narrativeMode: "unknown",
        allowedInventionBoundaries: {
          dialogue: true,
          internalThoughts: true,
          connectiveDetails: true,
          motives: false,
          undocumentedActions: false,
        },
      }),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.contract.generationBoundaries.dialogue).toBe(false);
    expect(result.contract.generationBoundaries.internalThoughts).toBe(false);
    expect(result.contract.generationBoundaries.connectiveDetails).toBe(
      "qualified-only"
    );
  });

  it("preserves written messages and chronology order exactly", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr({
        chronology: ["One", "Two", "Two", "Three"],
      }),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.contract.sourceTruth.writtenMessages[0]?.text).toBe(
      "BACK BY MORNING"
    );
    expect(result.contract.sourceTruth.chronology).toEqual(["One", "Two", "Three"]);
  });

  it("handles exact duplicate facts deterministically and preserves conflicts as issues", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr({
        immutableFacts: [
          {
            id: "fact-1",
            statement: "The group left the tent during the night.",
            confidence: "confirmed",
            immutable: true,
          },
          {
            id: "fact-1",
            statement: "The group left the tent during the night.",
            confidence: "confirmed",
            immutable: true,
          },
          {
            id: "fact-2",
            statement: "The group left the tent during the night.",
            confidence: "disputed",
            immutable: true,
          },
        ],
      }),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.contract.sourceTruth.immutableFacts).toHaveLength(2);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "CONFLICTING_FACT_STATEMENTS"
    );
  });

  it("accepts a concrete unknown threat and rejects an empty one", () => {
    const valid = buildFullStoryContract({
      storyIr: makeStoryIr({
        centralThreat: {
          type: "unknown",
          description: "An unidentified force pressured the witnesses.",
          intelligent: false,
        },
      }),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(valid.ok).toBe(true);

    const invalid = buildFullStoryContract({
      storyIr: makeStoryIr({
        centralThreat: {
          type: "unknown",
          description: "",
          intelligent: false,
        },
      }) as never,
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.issues.map((issue) => issue.code)).toContain(
      "CONTRACT_SOURCE_IR_INVALID"
    );
  });

  it("maps StoryIR climax to narrative culmination without requiring a fictional confrontation", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr({
        genre: "documentary",
        fictionality: "nonfiction",
        narrativeMode: "documentary",
        climax: "Investigators compared the contradictory recordings in public.",
      }),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.contract.sourceTruth.narrativeCulmination).toBe(
      "Investigators compared the contradictory recordings in public."
    );
  });

  it("blocks missing culmination and ending", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr({
        climax: "",
        endingConsequence: "",
      }) as never,
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(false);
  });

  it("keeps metrics out of the contract and keeps hashes distinct from the build fingerprint", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr(),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect("metrics" in result.contract).toBe(false);
    expect(result.envelope.contractHash).not.toBe(result.envelope.buildFingerprint);
    const contractHash = computeFullStoryContractContentHash(result.contract);
    const storyIrHash = computeStoryIrContentHash(makeStoryIr());
    expect(contractHash).toBe(result.envelope.contractHash);
    expect(storyIrHash).toBe(result.envelope.storyIrHash);
  });

  it("changes the build fingerprint when the policy context changes", () => {
    const result = buildFullStoryContract({
      storyIr: makeStoryIr(),
      artifactIdentity: makeIdentity(),
      outputConstraints: makeConstraints(),
      lineage: makeLineage(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const changed = computeFullStoryContractBuildFingerprint({
      storyIrHash: result.envelope.storyIrHash,
      contractHash: result.envelope.contractHash,
      policy: {
        ...DEFAULT_GENRE_POLICY_REGISTRY.policies["genre-policy/historical-mystery"],
        version: "2.0.0",
      },
      registryVersion: DEFAULT_GENRE_POLICY_REGISTRY.registryVersion,
      lineage: result.envelope.lineage,
    });
    expect(changed).not.toBe(result.envelope.buildFingerprint);
    expect(FULL_STORY_CONTRACT_BUILDER_VERSION).toBe(
      "full-story-contract-builder-v1"
    );
  });

  it("does not mutate inputs", () => {
    const storyIr = makeStoryIr();
    const identity = makeIdentity();
    const constraints = makeConstraints();
    const before = JSON.stringify({ storyIr, identity, constraints });
    buildFullStoryContract({
      storyIr,
      artifactIdentity: identity,
      outputConstraints: constraints,
      lineage: makeLineage(),
    });
    expect(JSON.stringify({ storyIr, identity, constraints })).toBe(before);
  });
});
