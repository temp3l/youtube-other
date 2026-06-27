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
import { countSpokenWords } from "@mediaforge/shared";
import {
  insertSectionBeforeMarker,
  loadAudioTemplate,
  renderTemplate,
} from "./prompt-template-loader.js";
import { loadMultilingualStoryLocalizationSettings } from "./multilingual-story-localization-settings.js";

function lineList(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function serializedFacts(facts: CanonicalStoryFacts): string {
  return JSON.stringify(facts, null, 2);
}

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
  const compactSource = buildCompactStorySource(args.sourceStory, args.canonicalFacts);
  const sourceNarration = args.sourceStory.narrationParagraphs.join("\n\n");
  const sourceWordCount = countSpokenWords(sourceNarration);
  const targetDurationSeconds = Math.max(
    1,
    Math.round((sourceWordCount / Math.max(1, args.languageProfile.fullNarrationWpm)) * 60)
  );
  const targetWordMin = Math.max(1, Math.round(sourceWordCount * 0.92));
  const targetWordMax = Math.max(targetWordMin, Math.round(sourceWordCount * 1.08));
  const system = loadAudioTemplate("system-prompt.md");
  const localeSettings = loadMultilingualStoryLocalizationSettings(
    args.languageProfile.locale
  );
  const user = renderTemplate(loadAudioTemplate("full-story-prompt.md"), {
    SOURCE_LANGUAGE: args.sourceStory.language === "en" ? "English" : args.sourceStory.language,
    TARGET_LANGUAGE: args.languageProfile.displayName,
    TARGET_LOCALE: args.languageProfile.locale,
    TARGET_DURATION_SECONDS: String(targetDurationSeconds),
    TARGET_WPM: String(args.languageProfile.fullNarrationWpm),
    TARGET_WORD_MIN: String(targetWordMin),
    TARGET_WORD_MAX: String(targetWordMax),
    SOURCE_NARRATION: sourceNarration,
    IMMUTABLE_FACTS: serializedFacts(args.canonicalFacts),
    CHARACTER_MAP: JSON.stringify(compactSource.canonicalFacts.characters, null, 2),
  });
  const localizedUser = insertSectionBeforeMarker(
    user,
    "## Task",
    [
      "## Locale settings",
      "",
      localeSettings,
    ].join("\n")
  );
  if (!args.productionContext) {
    return { system, user: localizedUser };
  }
  const contextSections: string[] = [
    "## Additional production context",
    "",
    `Adaptation mode: ${args.adaptationMode}`,
    `Target output: ${args.target}`,
    `Target language: ${args.languageProfile.displayName} (${args.languageProfile.locale})`,
  ];
  if (args.productionContext.analysis) {
    contextSections.push(
      "",
      "Source analysis:",
      JSON.stringify(args.productionContext.analysis, null, 2)
    );
  }
  if (args.productionContext.bible) {
    contextSections.push("", "Story bible:", JSON.stringify(args.productionContext.bible, null, 2));
  }
  if (args.productionContext.originalityReview) {
    contextSections.push(
      "",
      "Originality review:",
      JSON.stringify(args.productionContext.originalityReview, null, 2)
    );
  }
  if (args.productionContext.retentionPlan) {
    contextSections.push(
      "",
      "Retention plan:",
      JSON.stringify(args.productionContext.retentionPlan, null, 2)
    );
  }
  contextSections.push("", "Language guidance:", lineList(args.languageProfile.stylisticGuidance));
  return {
    system,
    user: insertSectionBeforeMarker(
      localizedUser,
      "## Final silent verification",
      contextSections.join("\n")
    ),
  };
}
