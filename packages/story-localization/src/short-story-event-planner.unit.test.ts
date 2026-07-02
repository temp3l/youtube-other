import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import {
  adaptCanonicalStoryFactsToStoryIR,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  buildShortSourceExtraction,
  validateShortSourceExtraction,
} from "./short-adaptation-contract.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { type ShortRewriteResolvedParent } from "./short-rewrite.types.js";

function buildTestParent(args: {
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly title: string;
  readonly sourcePath: string;
  readonly narrationParagraphs: readonly string[];
  readonly locale: string;
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly storyIrHash: string;
  readonly parentFullHash: string;
  readonly sourceSha256: string;
}): ShortRewriteResolvedParent {
  return {
    identity: {
      episodeId: args.episodeId,
      episodeSlug: args.episodeSlug,
      language: args.language,
      locale: args.locale,
      variant: "full",
    },
    title: args.title,
    sourcePath: args.sourcePath,
    sourceSha256: args.sourceSha256,
    parentFullHash: args.parentFullHash,
    storyIrHash: args.storyIrHash,
    contractHash: args.parentFullHash,
    narrationParagraphs: args.narrationParagraphs,
    characterRenameMap: {
      version: 1,
      episodeId: args.episodeId,
      sourceHash: args.sourceSha256,
      poolId: "test",
      entries: [],
      hash: args.parentFullHash,
    },
    canonical: true,
    provenance: "compatibility-source",
  };
}

describe("short story event planner", () => {
  it("extracts atomic event beats for episode 021", async () => {
    const sourcePath = path.resolve(
      "episodes/021-the-rake-at-the-bedroom-window/source/021-the-rake-at-the-bedroom-window-en-full.md"
    );
    const parsed = await parseCanonicalSourceStory(sourcePath);
    const canonicalFacts = extractCanonicalStoryFacts(parsed);
    const storyIr: StoryIR = adaptCanonicalStoryFactsToStoryIR(
      canonicalFacts,
      parsed
    );
    const sourceSha256 = "a".repeat(64);
    const parent = buildTestParent({
      episodeId: parsed.episodeNumber,
      episodeSlug: parsed.slug,
      title: parsed.title,
      sourcePath,
      narrationParagraphs: parsed.narrationParagraphs,
      locale: "en-US",
      language: "en",
      storyIrHash: "b".repeat(64),
      parentFullHash: "c".repeat(64),
      sourceSha256,
    });
    const extraction = buildShortSourceExtraction({
      parent,
      storyIr,
      outputConstraints: {
        variant: "short",
        targetWordRange: { min: 125, max: 150 },
        targetNarrationWpm: 190,
        targetDuration: {
          minSeconds: 55,
          maxSeconds: 65,
        },
        hookDeadlineSeconds: 8,
        fullVideoBridgeRequired: true,
      },
    });
    expect(validateShortSourceExtraction({
      extraction,
      outputConstraints: {
        variant: "short",
        targetWordRange: { min: 125, max: 150 },
        targetNarrationWpm: 190,
        targetDuration: {
          minSeconds: 55,
          maxSeconds: 65,
        },
        hookDeadlineSeconds: 8,
        fullVideoBridgeRequired: true,
      },
    })).toEqual([]);
    expect(extraction.events.length).toBeGreaterThan(extraction.selectedBeatIds.length);
    expect(extraction.selectedEventIds.length).toBeGreaterThanOrEqual(6);
    expect(extraction.beatPlan.targetDurationSeconds).toBe(60);
    expect(extraction.beatPlan.beats.map((beat) => beat.role)).toEqual(
      expect.arrayContaining(["hook", "evidence", "reveal", "sting"])
    );
    expect(extraction.causalValidation.status).toBe("passed");
    const selectedEvents = extraction.events.filter((event) =>
      extraction.selectedEventIds.includes(event.id)
    );
    const selectedStatements = selectedEvents.map((event) =>
      event.statement.toLowerCase()
    );
    expect(
      selectedStatements.some(
        (statement) =>
          statement.includes("second floor") ||
          statement.includes("window") ||
          statement.includes("glass") ||
          statement.includes("tapping")
      )
    ).toBe(true);
    expect(
      selectedStatements.some(
        (statement) =>
          statement.includes("footprints") ||
          statement.includes("marks") ||
          statement.includes("2:11") ||
          statement.includes("breathing")
      )
    ).toBe(true);
    expect(
      selectedStatements.some(
        (statement) =>
          statement.includes("camera") ||
          statement.includes("recording") ||
          statement.includes("figure")
      )
    ).toBe(true);
    expect(
      selectedStatements.some(
        (statement) =>
          statement.includes("inside") ||
          statement.includes("wardrobe") ||
          statement.includes("closed glass")
      )
    ).toBe(true);
    expect(
      extraction.events.some(
        (event) =>
          event.narrativeRoles.includes("hook") &&
          event.sourceBeatIds.length > 0
      )
    ).toBe(true);
  });

  it("keeps episode 014 on a full short arc", async () => {
    const sourcePath = path.resolve(
      "episodes/014-hachishakusama-the-eight-foot-woman/source/014-hachishakusama-the-eight-foot-woman-en-full.md"
    );
    const parsed = await parseCanonicalSourceStory(sourcePath);
    const canonicalFacts = extractCanonicalStoryFacts(parsed);
    const storyIr: StoryIR = adaptCanonicalStoryFactsToStoryIR(
      canonicalFacts,
      parsed
    );
    const parent = buildTestParent({
      episodeId: parsed.episodeNumber,
      episodeSlug: parsed.slug,
      title: parsed.title,
      sourcePath,
      narrationParagraphs: parsed.narrationParagraphs,
      locale: "en-US",
      language: "en",
      storyIrHash: "d".repeat(64),
      parentFullHash: "e".repeat(64),
      sourceSha256: "f".repeat(64),
    });
    const extraction = buildShortSourceExtraction({
      parent,
      storyIr,
      outputConstraints: {
        variant: "short",
        targetWordRange: { min: 125, max: 150 },
        targetNarrationWpm: 190,
        targetDuration: {
          minSeconds: 55,
          maxSeconds: 65,
        },
        hookDeadlineSeconds: 8,
        fullVideoBridgeRequired: true,
      },
    });
    expect(extraction.events.length).toBeGreaterThanOrEqual(6);
    expect(extraction.causalValidation.status).toBe("passed");
    expect(extraction.beatPlan.beats.length).toBeGreaterThanOrEqual(4);
  });
});
