import path from "node:path";
import { DEFAULT_OPENAI_CAPABILITY_POLICY } from "@mediaforge/shared";
import { getRepoRoot } from "./story-localization.utils.js";

export const SHORT_REWRITE_PROMPT_VERSION = "short-rewrite-v1";

/** @deprecated Use the capability policy at composition roots. */
export const DEFAULT_STORY_REWRITE_MODEL = DEFAULT_OPENAI_CAPABILITY_POLICY["story-rewrite"].model;
/** @deprecated Use the capability policy at composition roots. */
export const DEFAULT_STORY_REWRITE_REASONING_EFFORT = DEFAULT_OPENAI_CAPABILITY_POLICY["story-rewrite"].reasoning;
export const DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS = 5_500;
export const DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS = 5_500;
export const DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS = 1_200;
export const DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS = 1_200;

export const SHORT_REWRITE_SUPPORTED_LANGUAGES = {
  en: { name: "English", locale: "en" },
  de: { name: "German", locale: "de-DE" },
  es: { name: "Spanish", locale: "es-419" },
  fr: { name: "French", locale: "fr-FR" },
  it: { name: "Italian", locale: "it-IT" },
  pt: { name: "Portuguese", locale: "pt-BR" },
} as const;

export type ShortRewriteLanguage = keyof typeof SHORT_REWRITE_SUPPORTED_LANGUAGES;

export const SHORT_REWRITE_LANGUAGE_ORDER = Object.keys(
  SHORT_REWRITE_SUPPORTED_LANGUAGES
) as readonly ShortRewriteLanguage[];

export const SHORT_REWRITE_PREFERRED_WORD_RANGE = {
  min: 150,
  max: 170,
} as const;

export const SHORT_REWRITE_HARD_WORD_RANGE = {
  min: 150,
  max: 170,
} as const;

export const SHORT_REWRITE_THUMBNAIL_WORD_LIMIT = 4;

export const SHORT_REWRITE_DEFAULT_OUTPUT_ROOT = path.join(
  getRepoRoot(),
  "episodes"
);

export const SHORT_REWRITE_DEFAULT_MODEL = DEFAULT_OPENAI_CAPABILITY_POLICY["short-rewrite"].model;

export const SHORT_REWRITE_DEFAULT_TIMEOUT_MS = 120_000;

export const SHORT_REWRITE_DEFAULT_CONCURRENCY = 2;

export const SHORT_REWRITE_DEFAULT_MAX_RETRIES = 2;

export const SHORT_REWRITE_DEFAULT_TEMPERATURE = 0.5;

export const SHORT_REWRITE_DEFAULT_REASONING_EFFORT = DEFAULT_OPENAI_CAPABILITY_POLICY["short-rewrite"].reasoning;

export const SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES = 1_500_000;

export const FULL_STORY_PROVENANCE_MARKER = "<!-- mediaforge:generated-full-story -->";
