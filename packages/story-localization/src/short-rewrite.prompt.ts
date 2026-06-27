import { getLanguageProfile } from "./language-profiles.js";
import {
  SHORT_REWRITE_PREFERRED_WORD_RANGE,
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";
import { type ShortRewritePromptContext } from "./short-rewrite.types.js";
import {
  insertSectionBeforeMarker,
  loadAudioTemplate,
  renderTemplate,
} from "./prompt-template-loader.js";

function buildTargetLanguageSection(language: ShortRewriteLanguage): string {
  const definition = SHORT_REWRITE_SUPPORTED_LANGUAGES[language];
  return [
    `TARGET LANGUAGE:`,
    `${definition.name} (${definition.locale})`,
    "",
    "Write all viewer-facing fields in this language.",
  ].join("\n");
}

function renderShortPrompt(context: ShortRewritePromptContext): string {
  const languageProfile = getLanguageProfile(context.targetLanguage);
  return renderTemplate(loadAudioTemplate("short-story-prompt.md"), {
    TARGET_LOCALE: context.targetLocale,
    TARGET_DURATION_SECONDS: "60",
    TARGET_WPM: String(languageProfile.shortNarrationWpm),
    TARGET_WORD_MIN: String(SHORT_REWRITE_PREFERRED_WORD_RANGE.min),
    TARGET_WORD_MAX: String(SHORT_REWRITE_PREFERRED_WORD_RANGE.max),
    FULL_LOCALIZED_STORY: context.sourceStory,
  });
}

export function buildShortRewritePrompt(context: ShortRewritePromptContext): {
  readonly system: string;
  readonly user: string;
} {
  return {
    system: loadAudioTemplate("system-prompt.md"),
    user: renderShortPrompt(context),
  };
}

export function buildShortRewriteRepairPrompt(args: {
  readonly context: ShortRewritePromptContext;
  readonly invalidResult: unknown;
  readonly validationErrors: readonly string[];
}): { readonly system: string; readonly user: string } {
  const basePrompt = renderShortPrompt(args.context);
  const repairSection = [
    buildTargetLanguageSection(args.context.targetLanguage),
    "",
    "The previous result was invalid.",
    "Fix only the problems described below and return the complete JSON again.",
    "",
    "Validation errors:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "",
    "Invalid result:",
    JSON.stringify(args.invalidResult, null, 2),
    "",
    "Do not repeat the errors in prose.",
  ].join("\n");
  return {
    system: loadAudioTemplate("system-prompt.md"),
    user: insertSectionBeforeMarker(
      basePrompt,
      "Before returning the result, silently verify:",
      repairSection
    ),
  };
}
