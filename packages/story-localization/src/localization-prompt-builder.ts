import {
  type AdaptationMode,
  type CanonicalStoryFacts,
  type CompactStorySource,
  type LanguageProfile,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import {
  type OriginalityReview,
  type RetentionBeat,
  type StoryBible,
  type StorySourceAnalysis,
} from "./story-production.js";
import { compileFullStoryPrompt } from "./story-prompt-compiler.js";

export function buildCompactStorySource(
  sourceStory: ParsedSourceStory,
  canonicalFacts: CanonicalStoryFacts
): CompactStorySource {
  return {
    episodeNumber: sourceStory.episodeNumber,
    primaryTitle: sourceStory.title,
    ...(sourceStory.metadata.sourceTitle
      ? { sourceTitle: sourceStory.metadata.sourceTitle }
      : {}),
    narration: sourceStory.narrationParagraphs.join("\n\n"),
    ...(sourceStory.metadata.thumbnailText
      ? { thumbnailHook: sourceStory.metadata.thumbnailText }
      : {}),
    ...(sourceStory.metadata.contentDisclosure
      ? { contentDisclosure: sourceStory.metadata.contentDisclosure }
      : {}),
    ...(sourceStory.soundMotif ? { soundMotif: sourceStory.soundMotif } : {}),
    canonicalFacts: {
      characters: canonicalFacts.characters.map((character, index) => ({
        id: `c${index + 1}`,
        name: character.name,
        role: character.role,
        ...(character.relationship
          ? { relationship: character.relationship }
          : {}),
      })),
      ...(canonicalFacts.setting ? { setting: canonicalFacts.setting } : {}),
      criticalObjects: canonicalFacts.criticalObjects,
      criticalEvents: canonicalFacts.criticalEvents,
      writtenMessages: canonicalFacts.writtenMessages,
      centralThreat: canonicalFacts.threat,
      primaryReveal: canonicalFacts.primaryReveal,
      finalConsequence: canonicalFacts.finalConsequence,
    },
  };
}

export function buildLocalizationPrompt(args: {
  readonly languageProfile: LanguageProfile;
  readonly adaptationMode: AdaptationMode;
  readonly sourceStory: ParsedSourceStory;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly target: "full" | "short";
  readonly productionContext?: {
    readonly analysis?: StorySourceAnalysis;
    readonly bible?: StoryBible;
    readonly originalityReview?: OriginalityReview;
    readonly retentionPlan?: ReadonlyArray<RetentionBeat>;
  };
}): { readonly system: string; readonly user: string } {
  const compiled = compileFullStoryPrompt({
    language: args.languageProfile.code,
    adaptationMode: args.adaptationMode,
    sourceStory: args.sourceStory,
    canonicalFacts: args.canonicalFacts,
    ...(args.productionContext
      ? { productionContext: args.productionContext }
      : {}),
  });
  return {
    system: compiled.system,
    user: compiled.user,
  };
}
