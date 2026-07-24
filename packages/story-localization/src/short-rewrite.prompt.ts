import { type ShortRewritePromptContext } from "./short-rewrite.types.js";
import {
  applyCharacterRenameMapToCanonicalFacts,
  buildCharacterRenameMap,
} from "./character-rename.service.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { adaptCanonicalStoryFactsToStoryIR } from "./story-artifact-model.js";
import { getLanguageProfile } from "./language-profiles.js";
import { compileShortStoryPrompt } from "./story-prompt-compiler.js";
import { DEFAULT_SHORT_DURATION_WINDOW } from "./narration-constraints.js";
import { countSpokenWords } from "@mediaforge/shared";
import { insertSectionBeforeMarker } from "./prompt-template-loader.js";

function resolvePromptContext(context: ShortRewritePromptContext) {
  if (
    typeof context.sourceStory !== "string" &&
    context.canonicalFacts &&
    context.storyIr &&
    context.outputConstraints &&
    context.sourceExtraction &&
    context.adaptationContract
  ) {
    if (!context.characterRenameMap) {
      throw new Error(
        "Structured short rewrite prompts require the canonical character rename map."
      );
    }
    return {
      sourceStory: context.sourceStory,
      canonicalFacts: context.canonicalFacts,
      storyIr: context.storyIr,
      outputConstraints: context.outputConstraints,
      sourceExtraction: context.sourceExtraction,
      adaptationContract: context.adaptationContract,
      characterRenameMap: context.characterRenameMap,
    };
  }
  const narration = context.narration ?? (typeof context.sourceStory === "string" ? context.sourceStory : context.sourceStory.narrationParagraphs.join("\n\n"));
  const parsedSourceStory = {
    language: "en" as const,
    sourceFile: `${context.episodeSlug ?? "episode"}.md`,
    sourceHash: "compatibility-source",
    episodeNumber: context.episodeNumber ?? "episode",
    slug: context.episodeSlug ?? "episode",
    title: context.title ?? "Story",
    audioInstructions: [],
    narrationParagraphs: narration.split(/\n{2,}/u).filter(Boolean),
    metadata: {
      episodeNumber: context.episodeNumber ?? "episode",
      primaryTitle: context.title ?? "Story",
      audioInstructions: [],
      narration: narration.split(/\n{2,}/u).filter(Boolean),
      tags: [],
      hashtags: [],
    },
    content: narration,
  };
  const canonicalFacts = extractCanonicalStoryFacts(parsedSourceStory);
  const storyIr = adaptCanonicalStoryFactsToStoryIR(canonicalFacts, parsedSourceStory);
  const characterRenameMap = buildCharacterRenameMap({
    episodeId: parsedSourceStory.episodeNumber,
    sourceHash: parsedSourceStory.sourceHash,
    canonicalFacts,
    storyIr,
  });
  const profile = getLanguageProfile(context.targetLanguage);
  return {
    sourceStory: parsedSourceStory,
    canonicalFacts: applyCharacterRenameMapToCanonicalFacts(canonicalFacts, characterRenameMap),
    storyIr,
    outputConstraints: context.outputConstraints ?? {
      variant: "short" as const,
      targetWordRange: {
        min: profile.shortWordRange.min,
        max: profile.shortWordRange.max,
      },
      targetNarrationWpm: profile.shortNarrationWpm,
      targetDuration: {
        minSeconds: DEFAULT_SHORT_DURATION_WINDOW.minSeconds,
        maxSeconds: DEFAULT_SHORT_DURATION_WINDOW.maxSeconds,
      },
      hookDeadlineSeconds: 8,
      fullVideoBridgeRequired: true,
    },
    sourceExtraction: context.sourceExtraction ?? {
      version: "compatibility",
      parentFullHash: "compatibility",
      storyIrHash: "compatibility",
      locale: context.targetLocale,
      targetVariant: "short" as const,
      maximumBeats: 6,
      selectedBeatIds: [],
      removedBeatIds: [],
      beats: [],
      orphanedReferences: [],
      extractionHash: "compatibility".padEnd(64, "0"),
    },
    adaptationContract:
      context.adaptationContract ??
      {
        schemaVersion: "compatibility",
        contractVersion: "compatibility",
        identity: {
          episodeId: parsedSourceStory.episodeNumber,
          episodeSlug: parsedSourceStory.slug,
          language: context.targetLanguage,
          locale: context.targetLocale,
          variant: "short" as const,
        },
        parent: {
          episodeId: parsedSourceStory.episodeNumber,
          episodeSlug: parsedSourceStory.slug,
          language: context.targetLanguage,
          locale: context.targetLocale,
          variant: "full" as const,
          parentFullHash: "compatibility".padEnd(64, "0"),
          sourceSha256: "compatibility".padEnd(64, "0"),
        },
        storyIrHash: "compatibility".padEnd(64, "0"),
        immutableFacts: [],
        centralThreat: storyIr.centralThreat.description,
        centralRuleOrMechanism: storyIr.centralRuleMechanism.description,
        criticalObject: storyIr.criticalObjects[0]?.name ?? "",
        climaxOrIrreversibleTurn: storyIr.climax,
        finalConsequenceOrSting: storyIr.endingConsequence,
        exactWrittenMessages: storyIr.writtenMessages.map((entry) => entry.text),
        allowedCompression: [],
        forbiddenOmissions: [],
        retentionBoundaries: {
          factsMustRemain: [],
          detailsMayCompress: [],
          detailsMayRemove: [],
          dialogueMayShorten: [],
        },
        inventionBoundaries: [],
        constraints: {
          targetDurationSeconds: {
            min: DEFAULT_SHORT_DURATION_WINDOW.minSeconds,
            max: DEFAULT_SHORT_DURATION_WINDOW.maxSeconds,
          },
          targetNarrationWpm: profile.shortNarrationWpm,
          targetWordRange: {
            min: profile.shortWordRange.min,
            max: profile.shortWordRange.max,
          },
          hookDeadlineSeconds: 8,
          maximumBeats: 6,
        },
        sourceExtraction: {
          extractionHash: "compatibility".padEnd(64, "0"),
          selectedBeatIds: [],
          orphanedReferences: [],
        },
        contractHash: "compatibility".padEnd(64, "0"),
      },
    characterRenameMap,
  };
}

export function buildShortRewritePrompt(context: ShortRewritePromptContext): {
  readonly system: string;
  readonly user: string;
} {
  const resolved = resolvePromptContext(context);
  const compiled = compileShortStoryPrompt({
    language: context.targetLanguage,
    adaptationMode: "retention-optimized",
    sourceStory: resolved.sourceStory,
    canonicalFacts: resolved.canonicalFacts,
    storyIr: resolved.storyIr,
    sourceExtraction: resolved.sourceExtraction,
    adaptationContract: resolved.adaptationContract,
    outputConstraints: resolved.outputConstraints,
    characterRenameMap: resolved.characterRenameMap,
  });
  return {
    system: compiled.system,
    user: compiled.user,
  };
}

export function buildShortRewriteRepairPrompt(args: {
  readonly context: ShortRewritePromptContext;
  readonly invalidResult: unknown;
  readonly validationErrors: readonly string[];
}): { readonly system: string; readonly user: string } {
  const basePrompt = buildShortRewritePrompt(args.context);
  const resolved = resolvePromptContext(args.context);
  const serialized = JSON.stringify(args.invalidResult);
  const narration = typeof args.invalidResult === "string"
    ? args.invalidResult
    : args.invalidResult && typeof args.invalidResult === "object" && "narration" in args.invalidResult && typeof (args.invalidResult as { readonly narration?: unknown }).narration === "string"
      ? (args.invalidResult as { readonly narration: string }).narration
      : serialized;
  const currentWordCount = countSpokenWords(narration);
  const target = resolved.outputConstraints.targetWordRange;
  const wordInstruction = currentWordCount < target.min
    ? `Add between ${target.min - currentWordCount} and ${target.max - currentWordCount} words.`
    : currentWordCount > target.max
      ? `Remove between ${currentWordCount - target.max} and ${currentWordCount - target.min} words.`
      : "Do not change the word count except where the listed defect requires it.";
  const immutableOpening = resolved.canonicalFacts.openingImpossibleDetail ?? resolved.sourceStory.narrationParagraphs[0] ?? "";
  const immutableFinalLine = resolved.canonicalFacts.requiredFinalLine ?? resolved.adaptationContract.finalConsequenceOrSting;
  const repairSection = [
    "The previous result was invalid.",
    "Fix only the problems described below and return the complete JSON again.",
    "Reuse the supplied fictional character map exactly. Do not invent new names.",
    "Preserve approved story facts, concrete objects, locations, supernatural rule, primary reveal, final consequence, and emotional cost.",
    `Current word count: ${currentWordCount}.`,
    `Target minimum: ${target.min}.`,
    `Target maximum: ${target.max}.`,
    wordInstruction,
    `Missing canonical event IDs: ${resolved.sourceExtraction.selectedEventIds?.filter((id) => args.validationErrors.some((error) => error.includes(id))).join(", ") || "none explicitly identified"}.`,
    `Exact immutable opening when present: ${immutableOpening}`,
    `Exact immutable final line (preserve byte-for-byte and place last): ${immutableFinalLine}`,
    "Sections that may be modified: only passages implicated by the listed validation errors.",
    "Sections that must not be modified: established facts, selected event order, mechanics, names, relationships, exact opening, and exact final line.",
    "If the issue is outline prose, convert only the broken section into narrated scene action.",
    "If the issue is missing emotional cost, add the protagonist attachment and costly final refusal, loss, destruction, abandonment, betrayal, or acceptance without changing the plot.",
    "",
    "Fix these issues in the new result:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "",
    "Previous invalid short result:",
    JSON.stringify(args.invalidResult, null, 2),
    "",
    "Do not repeat the errors in prose.",
  ].join("\n");
  return {
    system: basePrompt.system,
    user: insertSectionBeforeMarker(
      basePrompt.user,
      "Before returning the result, silently verify:",
      repairSection,
      { strict: true, fileName: "short-rewrite-repair" }
    ),
  };
}

export function buildShortRewriteRegenerationPrompt(args: {
  readonly context: ShortRewritePromptContext;
  readonly validationErrors: readonly string[];
  readonly invalidResult?: unknown;
}): { readonly system: string; readonly user: string } {
  void args.invalidResult;
  const basePrompt = buildShortRewritePrompt(args.context);
  const regenerationSection = [
    "Regenerate the short narration from scratch.",
    "Keep the same parent facts, selected events, validated beat plan, target pace, target duration, target word range, and fictional character map.",
    "Fix these issues in the new result:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "Return only the structured schema result.",
  ].join("\n");
  return {
    system: basePrompt.system,
    user: insertSectionBeforeMarker(
      basePrompt.user,
      "<SHORT_ADAPTATION_EVENTS>",
      `${regenerationSection}\n`,
      { strict: true, fileName: "short-rewrite-regenerate" }
    ),
  };
}
