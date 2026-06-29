import { describe, expect, it } from "vitest";
import {
  adaptCanonicalStoryFactsToStoryIR,
  fullStoryOutputConstraintsSchema,
  normalizeStoryIRCompatibility,
  storyArtifactIdentitySchema,
  storyIrSchema,
  storyOutputConstraintsSchema,
  validateArtifactRouting,
  validateStoryIR,
  validateStoryOutputConstraints,
} from "./story-artifact-model.js";
import type {
  CanonicalStoryFacts,
  ParsedSourceStory,
} from "./story-localization.types.js";

function makeFacts(overrides: Partial<CanonicalStoryFacts> = {}): CanonicalStoryFacts {
  return {
    episodeNumber: "009",
    primaryTitle: "The Christmas Doll",
    characters: [{ name: "Mara Vale", role: "main protagonist" }],
    setting: "An isolated attic room",
    criticalObjects: ["Porcelain doll", "burned dress"],
    criticalEvents: [
      "Mara heard the doll breathing behind the attic door.",
      "The mirror showed the doll holding her brother's photograph.",
    ],
    writtenMessages: ["SHE OPENED THE DOOR"],
    threat: "A haunted doll",
    primaryReveal: "The doll had followed the family home.",
    finalConsequence: "The final photograph placed the doll behind Jon.",
    unresolvedQuestion: "Why did the doll wait until Mara looked away?",
    ...overrides,
  };
}

function makeParsed(overrides: Partial<ParsedSourceStory> = {}): ParsedSourceStory {
  return {
    language: "en",
    sourceFile: "/stories/009-the-christmas-doll-en-full.md",
    sourceHash: "abc123",
    episodeNumber: "009",
    slug: "009-the-christmas-doll",
    title: "The Christmas Doll",
    audioInstructions: ["Keep the delivery restrained."],
    narrationParagraphs: [
      "Mara heard the doll breathing behind the attic door.",
      "The mirror showed the doll holding her brother's photograph.",
    ],
    metadata: {
      episodeNumber: "009",
      primaryTitle: "The Christmas Doll",
      audioInstructions: ["Keep the delivery restrained."],
      narration: ["Mara heard the doll breathing behind the attic door."],
      contentDisclosure: "Fictional horror narration.",
      tags: ["haunted doll", "attic"],
      hashtags: ["#HorrorStory"],
    },
    content: "story",
    ...overrides,
  };
}

describe("story artifact model", () => {
  it("narrows the discriminated constraint union", () => {
    const constraints = storyOutputConstraintsSchema.parse({
      variant: "short",
      targetNarrationWpm: 170,
      targetDuration: { minSeconds: 53, maxSeconds: 55 },
      targetWordRange: { min: 160, max: 190 },
      hookDeadlineSeconds: 3,
      fullVideoBridgeRequired: true,
    });
    expect(constraints.variant).toBe("short");
  });

  it("accepts valid full constraints", () => {
    const constraints = fullStoryOutputConstraintsSchema.parse({
      variant: "full",
      targetNarrationWpm: 178,
      targetDuration: { minSeconds: 900, maxSeconds: 1200 },
      targetWordRange: { min: 2500, max: 3600 },
      preserveChapterScale: true,
    });
    expect(constraints.variant).toBe("full");
  });

  it("rejects mixed full and short constraint fields", () => {
    const fullWithShortField = storyOutputConstraintsSchema.safeParse({
      variant: "full",
      targetNarrationWpm: 170,
      targetWordRange: { min: 2500, max: 3000 },
      hookDeadlineSeconds: 3,
    });
    expect(fullWithShortField.success).toBe(false);
  });

  it("rejects invalid word ranges in schema and helper output", () => {
    expect(
      validateStoryOutputConstraints({
        targetWordRange: { min: 0, max: 10 },
      }).map((issue) => issue.code)
    ).toContain("INVALID_WORD_RANGE");
  });

  it("requires native StoryIR narrativeMode and extended invention boundaries", () => {
    const parsed = storyIrSchema.safeParse({
      genre: "documentary",
      fictionality: "nonfiction",
      entities: [],
      immutableFacts: [],
      chronology: ["Event"],
      centralThreat: {
        type: "unknown",
        description: "A reported anomaly",
        intelligent: false,
      },
      centralRuleMechanism: {
        description: "The evidence remains incomplete.",
        supernatural: false,
      },
      criticalObjects: [],
      writtenMessages: [],
      climax: "A witness revisited the final account.",
      endingConsequence: "The case remained unresolved.",
      allowedInventionBoundaries: {
        dialogue: false,
        internalThoughts: false,
        connectiveDetails: true,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("maps legacy missing narrativeMode to unknown conservatively", () => {
    const storyIr = normalizeStoryIRCompatibility({
      genre: "horror",
      fictionality: "fiction",
      entities: [],
      immutableFacts: [],
      chronology: ["Event"],
      centralThreat: {
        type: "supernatural",
        description: "A haunted doll",
        intelligent: true,
      },
      centralRuleMechanism: {
        description: "The doll follows its chosen family home.",
        supernatural: true,
      },
      criticalObjects: [],
      writtenMessages: [],
      climax: "The doll appeared in the final photograph.",
      endingConsequence: "The family never escaped the doll.",
      allowedInventionBoundaries: {
        dialogue: true,
        internalThoughts: true,
        connectiveDetails: true,
      },
    });
    expect(storyIr.genre).toBe("fictional-supernatural");
    expect(storyIr.narrativeMode).toBe("unknown");
    expect(storyIr.allowedInventionBoundaries.motives).toBe(false);
    expect(storyIr.allowedInventionBoundaries.undocumentedActions).toBe(false);
  });

  it("rejects malformed native narrative mode values", () => {
    const parsed = storyIrSchema.safeParse({
      genre: "documentary",
      fictionality: "nonfiction",
      narrativeMode: "omniscient",
      entities: [],
      immutableFacts: [],
      chronology: ["Event"],
      centralThreat: {
        type: "unknown",
        description: "A reported anomaly",
        intelligent: false,
      },
      centralRuleMechanism: {
        description: "The evidence remains incomplete.",
        supernatural: false,
      },
      criticalObjects: [],
      writtenMessages: [],
      climax: "A witness revisited the final account.",
      endingConsequence: "The case remained unresolved.",
      allowedInventionBoundaries: {
        dialogue: false,
        internalThoughts: false,
        connectiveDetails: true,
        motives: false,
        undocumentedActions: false,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps unknown narrative mode explicit when present", () => {
    const storyIr = storyIrSchema.parse({
      genre: "unknown",
      fictionality: "unknown",
      narrativeMode: "unknown",
      entities: [],
      immutableFacts: [],
      chronology: ["Event"],
      centralThreat: {
        type: "unknown",
        description: "An unexplained danger",
        intelligent: false,
      },
      centralRuleMechanism: {
        description: "The pattern is unclear.",
        supernatural: false,
      },
      criticalObjects: [],
      writtenMessages: [],
      climax: "The evidence stopped short of a clean answer.",
      endingConsequence: "The uncertainty persisted.",
      allowedInventionBoundaries: {
        dialogue: false,
        internalThoughts: false,
        connectiveDetails: true,
        motives: false,
        undocumentedActions: false,
      },
    });
    expect(storyIr.narrativeMode).toBe("unknown");
  });

  it("preserves existing task-02 issue behavior for location and supernatural nonfiction checks", () => {
    const issues = validateStoryIR({
      genre: "documentary",
      fictionality: "nonfiction",
      narrativeMode: "evidence-led",
      entities: [
        {
          id: "entity-1",
          name: "Attic room",
          type: "person",
        },
      ],
      immutableFacts: [],
      chronology: ["Event"],
      centralThreat: {
        type: "environmental",
        description: "A winter storm",
        intelligent: true,
      },
      centralRuleMechanism: {
        description: "A haunted force returned every night.",
        supernatural: true,
      },
      criticalObjects: [],
      writtenMessages: [],
      climax: "Investigators recovered the final tape.",
      endingConsequence: "The cause was never proven.",
      allowedInventionBoundaries: {
        dialogue: false,
        internalThoughts: false,
        connectiveDetails: true,
        motives: false,
        undocumentedActions: false,
      },
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "LOCATION_CLASSIFIED_AS_CHARACTER",
        "SUPERNATURAL_RULE_IN_NONFICTION",
        "ENVIRONMENTAL_THREAT_MARKED_INTELLIGENT",
      ])
    );
  });

  it("produces conservative adapter defaults for nonfiction", () => {
    const storyIr = adaptCanonicalStoryFactsToStoryIR(
      makeFacts({
        threat: "A suspicious death in an isolated village",
        primaryReveal: "Witness statements contradicted each other.",
      }),
      makeParsed({
        metadata: {
          episodeNumber: "009",
          primaryTitle: "The Christmas Doll",
          audioInstructions: [],
          narration: [],
          contentDisclosure: "Nonfiction documentary account.",
          tags: [],
          hashtags: [],
        },
      })
    );
    expect(storyIr.narrativeMode).toBe("documentary");
    expect(storyIr.allowedInventionBoundaries).toMatchObject({
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: true,
      motives: false,
      undocumentedActions: false,
    });
  });

  it("validates artifact routing mismatches", () => {
    expect(
      validateArtifactRouting({
        requestedVariant: "full",
        generatorVariant: "short",
      })[0]?.code
    ).toBe("FULL_STORY_ROUTED_TO_SHORT_GENERATOR");
  });

  it("validates story artifact identity locales", () => {
    expect(
      storyArtifactIdentitySchema.parse({
        episodeNumber: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "en",
        locale: "en-US",
        variant: "full",
      }).locale
    ).toBe("en-US");
  });
});
