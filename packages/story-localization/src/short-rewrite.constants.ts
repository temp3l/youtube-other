import path from "node:path";
import { getRepoRoot } from "./story-localization.utils.js";

export const SHORT_REWRITE_PROMPT_VERSION = "short-rewrite-v1";

export const SHORT_REWRITE_SUPPORTED_LANGUAGES = {
  en: { name: "English", locale: "en" },
  de: { name: "German", locale: "de-DE" },
  es: { name: "Spanish", locale: "es-419" },
  fr: { name: "French", locale: "fr-FR" },
  pt: { name: "Portuguese", locale: "pt-BR" },
} as const;

export type ShortRewriteLanguage = keyof typeof SHORT_REWRITE_SUPPORTED_LANGUAGES;

export const SHORT_REWRITE_LANGUAGE_ORDER = Object.keys(
  SHORT_REWRITE_SUPPORTED_LANGUAGES
) as readonly ShortRewriteLanguage[];

export const SHORT_REWRITE_PREFERRED_WORD_RANGE = {
  min: 150,
  max: 165,
} as const;

export const SHORT_REWRITE_HARD_WORD_RANGE = {
  min: 145,
  max: 170,
} as const;

export const SHORT_REWRITE_THUMBNAIL_WORD_LIMIT = 4;

export const SHORT_REWRITE_DEFAULT_OUTPUT_ROOT = path.join(
  getRepoRoot(),
  "episodes"
);

export const SHORT_REWRITE_DEFAULT_MODEL = "gpt-4.1-mini";

export const SHORT_REWRITE_DEFAULT_TIMEOUT_MS = 120_000;

export const SHORT_REWRITE_DEFAULT_CONCURRENCY = 2;

export const SHORT_REWRITE_DEFAULT_MAX_RETRIES = 2;

export const SHORT_REWRITE_DEFAULT_TEMPERATURE = 0.4;

export const SHORT_REWRITE_DEFAULT_MAX_SOURCE_BYTES = 1_500_000;

export const FULL_STORY_PROVENANCE_MARKER = "<!-- mediaforge:generated-full-story -->";
