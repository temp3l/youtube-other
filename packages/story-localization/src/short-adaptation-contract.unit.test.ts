import { describe, expect, it } from "vitest";
import { type StoryIR } from "./story-artifact-model.js";
import {
  buildShortAdaptationContract,
  buildShortSourceExtraction,
  detectOrphanedShortReferences,
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
