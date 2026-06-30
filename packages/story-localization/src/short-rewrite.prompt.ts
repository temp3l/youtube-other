import { getLanguageProfile } from "./language-profiles.js";
import { SHORT_REWRITE_PREFERRED_WORD_RANGE } from "./short-rewrite.constants.js";
import { type ShortRewritePromptContext } from "./short-rewrite.types.js";
import { compileShortStoryPrompt } from "./story-prompt-compiler.js";
import { adaptCanonicalStoryFactsToStoryIR } from "./story-artifact-model.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { loadAudioTemplate } from "./prompt-template-loader.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { insertSectionBeforeMarker } from "./prompt-template-loader.js";
import { normalizeWhitespace } from "@mediaforge/shared";
import { StorySourceParseError } from "./story-localization.errors.js";
import {
  buildShortAdaptationContract,
  buildShortSourceExtraction,
} from "./short-adaptation-contract.js";

function buildCompatibilityParsedSource(context: ShortRewritePromptContext) {
  const compatibilityMarkdown = [
    `# Episode ${context.episodeNumber} — ${context.title}`,
    "",
    "## Narration Script",
    context.sourceStory,
  ].join("\n");
  return {
    language: "en" as const,
    sourceFile: `${context.episodeSlug}.md`,
    sourceHash: "",
    episodeNumber: context.episodeNumber,
    slug: context.episodeSlug,
    title: context.title,
    audioInstructions: [],
    narrationParagraphs: [normalizeWhitespace(context.narration)],
    metadata: {
      episodeNumber: context.episodeNumber,
      primaryTitle: context.title,
      audioInstructions: [],
      narration: [normalizeWhitespace(context.narration)],
      tags: [],
      hashtags: [],
    },
    content: compatibilityMarkdown,
  };
}

export function buildShortRewritePrompt(context: ShortRewritePromptContext): {
  readonly system: string;
  readonly user: string;
} {
  const compatibilityParsed = buildCompatibilityParsedSource(context);
  const facts = extractCanonicalStoryFacts(compatibilityParsed);
  const storyIr = adaptCanonicalStoryFactsToStoryIR(facts, compatibilityParsed);
  const outputConstraints = {
    variant: "short" as const,
    targetWordRange: {
      min: SHORT_REWRITE_PREFERRED_WORD_RANGE.min,
      max: SHORT_REWRITE_PREFERRED_WORD_RANGE.max,
    },
    targetNarrationWpm: getLanguageProfile(context.targetLanguage)
      .shortNarrationWpm,
    targetDuration: {
      minSeconds: 55,
      maxSeconds: 65,
    },
    hookDeadlineSeconds: 8,
    fullVideoBridgeRequired: true,
  };
  const parent = {
    identity: {
      episodeId: context.episodeNumber,
      episodeSlug: context.episodeSlug,
      language: "en" as const,
      locale: "en-US",
      variant: "full" as const,
    },
    title: context.title,
    sourcePath: compatibilityParsed.sourceFile,
    sourceSha256: "0".repeat(64),
    parentFullHash: "1".repeat(64),
    storyIrHash: "2".repeat(64),
    contractHash: "3".repeat(64),
    narrationParagraphs: compatibilityParsed.narrationParagraphs,
    canonical: false,
    provenance: "compatibility-source" as const,
  };
  const sourceExtraction = buildShortSourceExtraction({
    parent,
    storyIr,
    outputConstraints,
  });
  const adaptationContract = buildShortAdaptationContract({
    identity: {
      episodeId: context.episodeNumber,
      episodeSlug: context.episodeSlug,
      language: context.targetLanguage,
      locale: context.targetLocale,
      variant: "short",
    },
    parent,
    storyIr,
    extraction: sourceExtraction,
    outputConstraints,
  });
  const compiled = compileShortStoryPrompt({
    language: context.targetLanguage,
    adaptationMode: "retention-optimized",
    sourceStory: compatibilityParsed,
    canonicalFacts: facts,
    storyIr,
    sourceExtraction,
    adaptationContract,
    outputConstraints,
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
  const sanitizedInvalidResult = sanitizeRepairPayload(args.invalidResult);
  const repairSection = [
    "The previous result was invalid.",
    "Fix only the problems described below and return the complete JSON again.",
    "",
    "Validation errors:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "",
    "Invalid short result:",
    JSON.stringify(sanitizedInvalidResult, null, 2),
    "",
    "Do not repeat the errors in prose.",
  ].join("\n");
  return {
    system: basePrompt.system,
    user: insertSectionBeforeMarker(
      basePrompt.user,
      "Before returning the result, silently verify:",
      repairSection
    ),
  };
}

function sanitizeRepairPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRepairPayload(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const blockedKeys = new Set([
    "audioInstructions",
    "visualDirection",
    "visualGuidance",
    "metadata",
    "repairHistory",
    "full",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, entry]) => [key, sanitizeRepairPayload(entry)])
  );
}

export function buildShortRewriteRegenerationPrompt(args: {
  readonly context: ShortRewritePromptContext;
  readonly validationErrors: readonly string[];
}): { readonly system: string; readonly user: string } {
  const basePrompt = buildShortRewritePrompt(args.context);
  const regenerationSection = [
    "Regenerate the short narration from scratch.",
    "Keep the same short-only contract and source beats.",
    "Fix these issues in the new result:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "Return only the structured schema result.",
  ].join("\n");
  return {
    system: basePrompt.system,
    user: insertSectionBeforeMarker(
      basePrompt.user,
      "<SHORT_ADAPTATION_SOURCE>",
      `${regenerationSection}\n`
    ),
  };
}
