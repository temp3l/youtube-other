import { describe, expect, it } from "vitest";
import {
  adaptCanonicalStoryFactsToStoryIR,
  adaptGeneratedFullPackageToStoryArtifact,
  adaptShortRewriteArtifactToStoryArtifact,
  adaptShortRewriteSidecarToStoryArtifact,
  adaptStoryProductionArtifactsToStoryIR,
  storyArtifactIdentitySchema,
  storyIrSchema,
  storyOutputConstraintsSchema,
  validateArtifactRouting,
  validateStoryIR,
  validateStoryOutputConstraints,
} from "./story-artifact-model.js";
import type {
  CanonicalStoryFacts,
  GeneratedStoryPackage,
  ParsedSourceStory,
} from "./story-localization.types.js";
import type {
  OriginalityReview,
  RetentionBeat,
  StoryBible,
  StorySourceAnalysis,
} from "./story-production.js";
import type {
  ShortRewriteArtifact,
  ShortRewriteJsonSidecar,
} from "./short-rewrite.types.js";

function makeFacts(overrides: Partial<CanonicalStoryFacts> = {}): CanonicalStoryFacts {
  return {
    episodeNumber: "009",
    primaryTitle: "The Christmas Doll",
    characters: [
      { name: "Mara Vale", role: "main protagonist" },
      { name: "Jon Vale", role: "supporting character", relationship: "brother" },
    ],
    setting: "An isolated attic room",
    criticalObjects: ["Porcelain doll", "burned dress"],
    criticalEvents: [
      "Mara heard the doll breathing behind the attic door.",
      "The mirror showed the doll holding her brother's photograph.",
    ],
    writtenMessages: ["SHE OPENED THE DOOR"],
    threat: "A haunted doll waiting inside the house",
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

function makeProductionArtifacts(): {
  readonly parsed: ParsedSourceStory;
  readonly facts: CanonicalStoryFacts;
  readonly analysis: StorySourceAnalysis;
  readonly bible: StoryBible;
  readonly originalityReview: OriginalityReview;
  readonly retentionPlan: readonly RetentionBeat[];
} {
  const facts = makeFacts();
  return {
    parsed: makeParsed(),
    facts,
    analysis: {
      episodeNumber: "009",
      slug: "009-the-christmas-doll",
      title: "The Christmas Doll",
      protagonist: "Mara Vale",
      antagonist: "A haunted doll",
      setting: "An isolated attic room",
      issueSummary: "2 characters, 2 objects, 1 message",
      keyCharacters: ["Mara Vale", "Jon Vale"],
      keyObjects: ["Porcelain doll", "burned dress"],
      writtenMessages: ["SHE OPENED THE DOOR"],
      sceneCount: 2,
      summary: "Episode 009 centers on Mara Vale facing a haunted doll.",
    },
    bible: {
      episodeNumber: "009",
      slug: "009-the-christmas-doll",
      title: "The Christmas Doll",
      protagonist: "Mara Vale",
      antagonist: "A haunted doll",
      setting: "An isolated attic room",
      premise: "Mara confronts the doll.",
      centralThreat: facts.threat,
      primaryReveal: facts.primaryReveal,
      finalConsequence: facts.finalConsequence,
      cast: [
        { name: "Mara Vale", role: "main protagonist" },
        { name: "Jon Vale", role: "supporting character", relationship: "brother" },
      ],
      keyObjects: facts.criticalObjects,
      writtenMessages: facts.writtenMessages,
      storyRules: [
        "Preserve the exact written messages verbatim.",
        "Do not change the ending.",
      ],
      sceneOrder: ["scene-1", "scene-2"],
    },
    originalityReview: {
      episodeNumber: "009",
      slug: "009-the-christmas-doll",
      risk: "low",
      summary: "Keep the source premise intact.",
      protectedElements: ["Mara Vale", "A haunted doll", "SHE OPENED THE DOOR"],
      notes: ["Use the source as reference only."],
    },
    retentionPlan: [
      {
        id: "reveal",
        label: "Reveal",
        purpose: "Land the reveal.",
        tension: "The doll had followed the family home.",
        payoff: "The threat becomes explicit.",
      },
    ],
  };
}

function makeGeneratedFullPackage(): GeneratedStoryPackage & {
  readonly full: NonNullable<GeneratedStoryPackage["full"]>;
} {
  return {
    language: "de",
    full: {
      title: "Die Weihnachtspuppe",
      audioInstructions: ["Ruhig sprechen."],
      narrationParagraphs: ["Absatz eins", "Absatz zwei", "Absatz drei"],
      thumbnailText: "DIE PUPPE",
      contentDisclosure: "Fiktive Horrorgeschichte.",
      seoDescription: "Eine Puppe wartet im Dachboden.",
      tags: ["horror", "puppe", "dachboden"],
      hashtags: ["#HorrorStory"],
      targetNarrationWpm: 168,
      visualDirection: "Dunkler Dachboden",
    },
    short: {
      title: "Kurzfassung",
      narrationInstructions: ["Sofort beginnen."],
      narrationParagraphs: ["Kurztext"],
      thumbnailText: "DIE PUPPE",
      description: "Kurzbeschreibung",
      hashtags: ["#Shorts"],
      targetNarrationWpm: 170,
      recommendedDurationSeconds: { min: 55, max: 65 },
      visualGuidance: "Schneller Einstieg",
    },
    preservationChecklist: {
      charactersPreserved: true,
      relationshipsPreserved: true,
      chronologyPreserved: true,
      criticalObjectsPreserved: true,
      cluesPreserved: true,
      writtenMessagesPreserved: true,
      primaryRevealPreserved: true,
      endingPreserved: true,
      noNewPlotElementsAdded: true,
    },
    diagnostics: {
      fullWordCount: 120,
      shortWordCount: 155,
      shortEstimatedDurationSeconds: 58,
      removedGenericFiller: [],
      adaptationNotes: [],
    },
  };
}

function makeShortRewriteSidecar(): ShortRewriteJsonSidecar {
  return {
    schemaVersion: 1,
    episodeId: "009",
    episodeSlug: "009-the-christmas-doll",
    sourceLanguage: "en",
    targetLanguage: "de",
    promptVersion: "short-rewrite-v1",
    model: "gpt-5.5",
    sourcePath: "/stories/009-the-christmas-doll-en-full.md",
    sourceSha256: "a".repeat(64),
    generatedAt: "2026-06-29T00:00:00.000Z",
    generation: {
      title: "Die Weihnachtspuppe",
      hook: "Mara horte die Puppe atmen.",
      narration: "Kurztext",
      wordCount: 160,
      estimatedDurationSecondsAt175Wpm: 55,
      estimatedDurationSecondsAt180Wpm: 53,
      thumbnailText: "DIE PUPPE",
      fullVideoBridge: "Zum ganzen Video.",
    },
    usage: {},
    validation: {
      preferredWordRangeSatisfied: true,
      hardWordRangeSatisfied: true,
      hookMatchesNarration: true,
      thumbnailWordCount: 2,
      warnings: [],
    },
  };
}

function makeShortRewriteArtifact(): ShortRewriteArtifact {
  return {
    schemaVersion: 1,
    promptVersion: "short-rewrite-v1",
    status: "completed",
    episodeId: "009",
    episodeSlug: "009-the-christmas-doll",
    sourceLanguage: "en",
    targetLanguage: "de",
    sourcePath: "/stories/009-the-christmas-doll-en-full.md",
    sourceSha256: "b".repeat(64),
    markdownOutputPath: "/episodes/009-the-christmas-doll/de/short/out.md",
    jsonOutputPath: "/episodes/009-the-christmas-doll/de/short/out.json",
    generatedAt: "2026-06-29T00:00:00.000Z",
    model: "gpt-5.5",
    generationDurationMs: 4000,
    validation: {
      preferredWordRangeSatisfied: true,
      hardWordRangeSatisfied: true,
      hookMatchesNarration: true,
      thumbnailWordCount: 2,
      warnings: [],
    },
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
    if (constraints.variant === "short") {
      expect(constraints.hookDeadlineSeconds).toBe(3);
    }
  });

  it("accepts valid full constraints", () => {
    const constraints = storyOutputConstraintsSchema.parse({
      variant: "full",
      targetNarrationWpm: 178,
      targetDuration: { minSeconds: 900, maxSeconds: 1200 },
      targetWordRange: { min: 2500, max: 3600 },
      preserveChapterScale: true,
    });
    expect(constraints.variant).toBe("full");
  });

  it("accepts valid short constraints", () => {
    const constraints = storyOutputConstraintsSchema.parse({
      variant: "short",
      targetNarrationWpm: 180,
      targetDuration: { minSeconds: 50, maxSeconds: 65 },
      targetWordRange: { min: 160, max: 190 },
      hookDeadlineSeconds: 3,
      fullVideoBridgeRequired: true,
    });
    expect(constraints.variant).toBe("short");
  });

  it("rejects mixed full and short constraint fields", () => {
    const fullWithShortField = storyOutputConstraintsSchema.safeParse({
      variant: "full",
      targetNarrationWpm: 170,
      targetWordRange: { min: 2500, max: 3000 },
      hookDeadlineSeconds: 3,
    });
    const shortWithFullField = storyOutputConstraintsSchema.safeParse({
      variant: "short",
      targetNarrationWpm: 170,
      targetDuration: { minSeconds: 50, maxSeconds: 65 },
      targetWordRange: { min: 160, max: 190 },
      hookDeadlineSeconds: 3,
      fullVideoBridgeRequired: true,
      preserveChapterScale: true,
    });
    expect(fullWithShortField.success).toBe(false);
    expect(shortWithFullField.success).toBe(false);
  });

  it("rejects invalid word ranges in schema and helper output", () => {
    const invalidRanges = [
      { min: -1, max: 10 },
      { min: 0, max: 10 },
      { min: 20, max: 10 },
      { min: 1.5, max: 10 },
      { min: Number.POSITIVE_INFINITY, max: 10 },
    ];
    for (const targetWordRange of invalidRanges) {
      const parsed = storyOutputConstraintsSchema.safeParse({
        variant: "full",
        targetNarrationWpm: 178,
        targetWordRange,
      });
      expect(parsed.success).toBe(false);
      expect(
        validateStoryOutputConstraints({
          variant: "full",
          targetNarrationWpm: 178,
          targetWordRange,
        }).map((issue) => issue.code)
      ).toEqual(["INVALID_WORD_RANGE"]);
    }
  });

  it("validates locale and variant identity", () => {
    const identity = storyArtifactIdentitySchema.parse({
      episodeNumber: "009",
      episodeSlug: "009-the-christmas-doll",
      language: "de",
      locale: "de-DE",
      variant: "short",
    });
    expect(identity.locale).toBe("de-DE");
    expect(identity.variant).toBe("short");
  });

  it("rejects invalid identity values", () => {
    expect(
      storyArtifactIdentitySchema.safeParse({
        episodeNumber: "",
        episodeSlug: "009-the-christmas-doll",
        language: "it",
        locale: "de_DE",
        variant: "preview",
      }).success
    ).toBe(false);
  });

  it("adapts canonical facts into source-truth StoryIR without presentation fields", () => {
    const storyIr = adaptCanonicalStoryFactsToStoryIR(makeFacts(), makeParsed());
    expect(storyIr.centralThreat.description).toBe(
      "A haunted doll waiting inside the house"
    );
    expect(storyIr.criticalObjects.map((object) => object.name)).toContain(
      "Porcelain doll"
    );
    expect(storyIr.writtenMessages.map((message) => message.text)).toContain(
      "SHE OPENED THE DOOR"
    );
    expect(storyIrSchema.safeParse(storyIr).success).toBe(true);
    expect("targetWordRange" in storyIr).toBe(false);
  });

  it("adapts current production artifacts and preserves meaningful source truth", () => {
    const storyIr = adaptStoryProductionArtifactsToStoryIR(makeProductionArtifacts());
    expect(storyIr.allowedInventionBoundaries.notes).toContain(
      "Preserve the exact written messages verbatim."
    );
    expect(storyIr.climax).toBe("The doll had followed the family home.");
    expect(storyIr.immutableFacts.map((fact) => fact.statement)).toContain(
      "SHE OPENED THE DOOR"
    );
  });

  it("handles absent legacy fields without fabricating unavailable facts", () => {
    const storyIr = adaptCanonicalStoryFactsToStoryIR(
      makeFacts({
        setting: undefined,
        criticalObjects: [],
        writtenMessages: [],
        unresolvedQuestion: undefined,
      }),
      makeParsed({ metadata: { ...makeParsed().metadata, contentDisclosure: undefined } })
    );
    expect(storyIr.entities.some((entity) => entity.type === "location")).toBe(false);
    expect(storyIr.criticalObjects).toEqual([]);
    expect(storyIr.writtenMessages).toEqual([]);
    expect(storyIr.fictionality).toBe("unknown");
  });

  it("adapts generated full packages with explicit lossy warnings", () => {
    const result = adaptGeneratedFullPackageToStoryArtifact({
      episodeNumber: "009",
      episodeSlug: "009-the-christmas-doll",
      generatedPackage: makeGeneratedFullPackage(),
    });
    expect(result.artifact.identity.variant).toBe("full");
    expect(result.artifact.identity.locale).toBe("de-DE");
    expect(result.artifact.constraints).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });

  it("adapts short rewrite sidecars into short artifact constraints", () => {
    const result = adaptShortRewriteSidecarToStoryArtifact(makeShortRewriteSidecar());
    expect(result.artifact.identity.locale).toBe("de-DE");
    expect(result.artifact.constraints?.variant).toBe("short");
    expect(result.warnings).toEqual([]);
  });

  it("adapts short rewrite artifacts with absent duration noted", () => {
    const result = adaptShortRewriteArtifactToStoryArtifact(makeShortRewriteArtifact());
    expect(result.artifact.owner).toBe("publication");
    expect(result.artifact.constraints?.variant).toBe("short");
    expect(result.warnings).toHaveLength(1);
  });

  it("returns LOCATION_CLASSIFIED_AS_CHARACTER", () => {
    const issues = validateStoryIR(
      storyIrSchema.parse({
        ...adaptCanonicalStoryFactsToStoryIR(makeFacts(), makeParsed()),
        entities: [
          {
            id: "person:attic-room",
            name: "Attic Room",
            type: "person",
            narrativeRole: "character",
          },
        ],
      })
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      "LOCATION_CLASSIFIED_AS_CHARACTER",
    ]);
  });

  it("returns EVENT_CLASSIFIED_AS_CHARACTER", () => {
    const issues = validateStoryIR(
      storyIrSchema.parse({
        ...adaptCanonicalStoryFactsToStoryIR(makeFacts(), makeParsed()),
        entities: [
          {
            id: "person:storm-arrival",
            name: "Storm Arrival",
            type: "person",
            narrativeRole: "character",
          },
        ],
      })
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      "EVENT_CLASSIFIED_AS_CHARACTER",
    ]);
  });

  it("returns SUPERNATURAL_RULE_IN_NONFICTION", () => {
    const issues = validateStoryIR(
      storyIrSchema.parse({
        ...adaptCanonicalStoryFactsToStoryIR(
          makeFacts(),
          makeParsed({
            metadata: {
              ...makeParsed().metadata,
              contentDisclosure: "Nonfiction documentary.",
            },
          })
        ),
        fictionality: "nonfiction",
        centralRuleMechanism: {
          description: "A haunted voice answers from the wall.",
          supernatural: true,
        },
      })
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      "SUPERNATURAL_RULE_IN_NONFICTION",
    ]);
  });

  it("returns INVALID_WORD_RANGE", () => {
    expect(
      validateStoryOutputConstraints({
        variant: "short",
        targetNarrationWpm: 170,
        targetDuration: { minSeconds: 55, maxSeconds: 65 },
        targetWordRange: { min: 190, max: 160 },
        hookDeadlineSeconds: 3,
        fullVideoBridgeRequired: true,
      }).map((issue) => issue.code)
    ).toEqual(["INVALID_WORD_RANGE"]);
  });

  it("returns artifact routing issue codes", () => {
    expect(
      validateArtifactRouting({
        requestedVariant: "full",
        generatorVariant: "short",
      }).map((issue) => issue.code)
    ).toEqual(["FULL_STORY_ROUTED_TO_SHORT_GENERATOR"]);
    expect(
      validateArtifactRouting({
        requestedVariant: "short",
        generatorVariant: "full",
      }).map((issue) => issue.code)
    ).toEqual(["SHORT_STORY_ROUTED_TO_FULL_REGENERATION"]);
  });
});
