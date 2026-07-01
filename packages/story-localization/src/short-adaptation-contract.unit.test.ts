import { describe, expect, it } from "vitest";
import { type StoryIR } from "./story-artifact-model.js";
import {
  buildShortAdaptationContract,
  buildShortSourceExtraction,
  detectOrphanedShortReferences,
  validateShortSourceExtraction,
} from "./short-adaptation-contract.js";
import { stableSerialize } from "./stable-json.js";
import { type ShortRewriteResolvedParent } from "./short-rewrite.types.js";

function makeStoryIr(): StoryIR {
  return {
    genre: "fictional-supernatural",
    fictionality: "fiction",
    narrativeMode: "character-led",
    entities: [
      { id: "mara", name: "Mara", type: "person" },
      { id: "doll", name: "doll", type: "object" },
      { id: "photo", name: "photograph", type: "object" },
    ],
    immutableFacts: [
      {
        id: "fact-1",
        statement: "Mara hears the doll under the attic door.",
        confidence: "confirmed",
        immutable: true,
      },
      {
        id: "fact-2",
        statement: "The final photograph shows the doll behind her brother.",
        confidence: "confirmed",
        immutable: true,
      },
    ],
    chronology: ["hook", "escalation", "ending"],
    centralThreat: {
      type: "supernatural",
      description: "A doll keeps returning to Mara's house.",
      intelligent: true,
    },
    centralRuleMechanism: {
      description: "Destroying the doll's dress does not break its hold.",
      supernatural: true,
    },
    criticalObjects: [
      {
        id: "doll",
        name: "doll",
        narrativeFunction: "carries the haunting",
      },
    ],
    writtenMessages: [
      {
        text: "MARA",
        preserveVerbatim: true,
      },
    ],
    climax:
      "Mara burns the dress and believes the house is quiet again.",
    endingConsequence:
      "The final photograph shows the doll behind her brother.",
    allowedInventionBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: true,
      motives: false,
      undocumentedActions: false,
    },
  };
}

function makeParent(parentFullHash = "a".repeat(64)): ShortRewriteResolvedParent {
  return {
    identity: {
      episodeId: "009",
      episodeSlug: "009-the-christmas-doll",
      language: "de",
      locale: "de-DE",
      variant: "full",
    },
    title: "Die Weihnachtspuppe",
    sourcePath: "/tmp/de/full/script.md",
    sourceSha256: "b".repeat(64),
    parentFullHash,
    storyIrHash: "c".repeat(64),
    contractHash: "d".repeat(64),
    contractBuildFingerprint: "e".repeat(64),
    narrationParagraphs: [
      "Mara hörte die Puppe unter der Dachbodentür atmen.",
      "Später saß die Puppe mit nassen Händen auf dem Kinderstuhl und ihr Name stand im Glas.",
      "Die letzte Fotografie zeigte die Puppe direkt hinter ihrem Bruder.",
    ],
    canonical: true,
    provenance: "localized-full-artifact",
  };
}

const outputConstraints = {
  variant: "short" as const,
  targetWordRange: { min: 145, max: 170 },
  targetNarrationWpm: 178,
  targetDuration: { minSeconds: 55, maxSeconds: 65 },
  hookDeadlineSeconds: 8,
  fullVideoBridgeRequired: true,
};

describe("short adaptation contract", () => {
  it("detects orphaned references when a retained beat depends on a removed introduction", () => {
    const orphaned = detectOrphanedShortReferences({
      beats: [
        {
          id: "b01",
          paragraphIndex: 0,
          sentenceIndex: 0,
          text: "Mara heard breathing under the attic door.",
          references: [],
          retained: true,
        },
        {
          id: "b02",
          paragraphIndex: 1,
          sentenceIndex: 0,
          text: "Mara found a photograph in the nursery.",
          references: ["photograph"],
          retained: false,
        },
        {
          id: "b03",
          paragraphIndex: 2,
          sentenceIndex: 0,
          text: "The final photograph shows the doll behind her brother.",
          references: ["photograph", "doll"],
          retained: true,
        },
      ],
      selectedBeatIds: ["b01", "b03"],
    });
    expect(orphaned.some((entry) => entry.reference === "photograph")).toBe(true);
  });

  it("ignores non-specific pronoun-only references in orphan detection", () => {
    const orphaned = detectOrphanedShortReferences({
      beats: [
        {
          id: "b01",
          paragraphIndex: 0,
          sentenceIndex: 0,
          text: "Her name came from the hallway.",
          references: ["her"],
          retained: false,
        },
        {
          id: "b02",
          paragraphIndex: 1,
          sentenceIndex: 0,
          text: "Her hand shook when the call came again.",
          references: ["her"],
          retained: true,
        },
      ],
      selectedBeatIds: ["b02"],
    });

    expect(orphaned).toEqual([]);
  });

  it("builds a compact contract without duplicating the full story or full StoryIR", () => {
    const storyIr = makeStoryIr();
    const parent = makeParent();
    const extraction = buildShortSourceExtraction({
      parent,
      storyIr,
      outputConstraints,
    });
    const contract = buildShortAdaptationContract({
      identity: {
        episodeId: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "de",
        locale: "de-DE",
        variant: "short",
      },
      parent,
      storyIr,
      extraction,
      outputConstraints,
    });
    const serialized = stableSerialize(contract);
    expect(serialized).not.toContain('"entities"');
    expect(serialized).not.toContain(parent.narrationParagraphs.join("\\n\\n"));
  });

  it("retains enough beats for the configured short target", () => {
    const storyIr = makeStoryIr();
    const extraction = buildShortSourceExtraction({
      parent: makeParent(),
      storyIr,
      outputConstraints,
    });

    expect(extraction.selectedBeatIds.length).toBeGreaterThanOrEqual(3);
    expect(validateShortSourceExtraction({ extraction, outputConstraints })).toEqual([]);
  });

  it("adds a bridge beat when the opening and ending are otherwise isolated", () => {
    const extraction = buildShortSourceExtraction({
      parent: {
        ...makeParent(),
        narrationParagraphs: [
          "A white hat moved above the wall.",
          "Clara told herself it was only a trick of the light.",
          "Her grandfather locked every window before dark.",
          "Sometimes, before the caller speaks again, she hears three low syllables beneath the voice.",
        ],
      },
      storyIr: {
        ...makeStoryIr(),
        centralThreat: {
          type: "supernatural",
          description: "A white hat moved above the wall.",
          intelligent: true,
        },
        centralRuleMechanism: {
          description:
            "Sometimes, before the caller speaks again, she hears three low syllables beneath the voice.",
          supernatural: true,
        },
        climax:
          "Sometimes, before the caller speaks again, she hears three low syllables beneath the voice.",
        endingConsequence:
          "Sometimes, before the caller speaks again, she hears three low syllables beneath the voice.",
        criticalObjects: [],
        writtenMessages: [],
        immutableFacts: [],
      },
      outputConstraints,
    });

    expect(extraction.selectedBeatIds.length).toBeGreaterThanOrEqual(3);
    expect(extraction.selectedBeatIds).toContain("b02");
    expect(validateShortSourceExtraction({ extraction, outputConstraints })).toEqual([]);
  });

  it("flags under-specified short source extraction before generation", () => {
    const issues = validateShortSourceExtraction({
      extraction: {
        version: "short-source-extraction-v1",
        parentFullHash: "a".repeat(64),
        storyIrHash: "b".repeat(64),
        locale: "en-US",
        targetVariant: "short",
        maximumBeats: 6,
        selectedBeatIds: ["b01", "b82"],
        removedBeatIds: [],
        beats: [],
        orphanedReferences: [
          {
            reference: "voice",
            introducedByBeatId: "b02",
            firstRetainedBeatId: "b82",
          },
        ],
        extractionHash: "c".repeat(64),
      },
      outputConstraints,
    });

    expect(issues).toEqual([
      "Short source extraction retained only 2 beats; at least 3 are required for the configured short target.",
      "Short source extraction contains orphaned references: voice",
    ]);
  });

  it("produces a deterministic contract hash and invalidates it when the parent hash changes", () => {
    const storyIr = makeStoryIr();
    const extraction = buildShortSourceExtraction({
      parent: makeParent(),
      storyIr,
      outputConstraints,
    });
    const one = buildShortAdaptationContract({
      identity: {
        episodeId: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "de",
        locale: "de-DE",
        variant: "short",
      },
      parent: makeParent(),
      storyIr,
      extraction,
      outputConstraints,
    });
    const two = buildShortAdaptationContract({
      identity: {
        episodeId: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "de",
        locale: "de-DE",
        variant: "short",
      },
      parent: makeParent(),
      storyIr,
      extraction,
      outputConstraints,
    });
    const changedParent = makeParent("f".repeat(64));
    const changedExtraction = buildShortSourceExtraction({
      parent: changedParent,
      storyIr,
      outputConstraints,
    });
    const changed = buildShortAdaptationContract({
      identity: {
        episodeId: "009",
        episodeSlug: "009-the-christmas-doll",
        language: "de",
        locale: "de-DE",
        variant: "short",
      },
      parent: changedParent,
      storyIr,
      extraction: changedExtraction,
      outputConstraints,
    });
    expect(one.contractHash).toBe(two.contractHash);
    expect(changed.contractHash).not.toBe(one.contractHash);
  });
});
