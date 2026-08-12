export const MICRODRAMA_PACK_SCHEMA_VERSION = "mediaforge.microdrama-pack.v1" as const;

export const SEVEN_MINUTES_AHEAD_SERIES_ID = "seven-minutes-ahead" as const;
export const V5_REMEDIATED_PACK_VERSION = "v5-remediated" as const;

export const V5_EXPECTED_FILE_COUNT = 434;
export const V5_EXPECTED_HASH_MANIFEST_ENTRIES = 433;
export const V5_EXPECTED_EPISODE_COUNT = 100;
export const V5_EXPECTED_LOCALE_VARIANT_COUNT = 400;

export const ROLLING_PLAN_DEFAULT_EPISODE_SECONDS = 59.6 as const;

export const V5_HASH_MANIFEST_RELATIVE_PATH = "qa/sha256-v5.json";
export const V5_VALIDATION_RELATIVE_PATH = "qa/validation-v5.json";

export const V5_PACK_MANIFEST_HASH =
  "878f277b47fb6075ee1231e2edcd5e724213207fad67e6f657c51078da50f55c" as const;

export const V5_SOURCE_LOCALE_ALIASES = ["en", "de", "es", "pt-BR"] as const;
export type V5SourceLocaleAlias = (typeof V5_SOURCE_LOCALE_ALIASES)[number];

export const V5_LOCALE_PROFILES: Readonly<
  Record<V5SourceLocaleAlias, { locale: string; wpm: number }>
> = {
  en: { locale: "en-US", wpm: 155 },
  de: { locale: "de-DE", wpm: 150 },
  es: { locale: "es-ES", wpm: 155 },
  "pt-BR": { locale: "pt-BR", wpm: 155 },
};

export const V5_ROOT_ALLOWLIST = new Set([
  "README.md",
  "languages",
  "qa",
  "shared",
]);

export const CANONICAL_EPISODE_ID_PATTERN = /^E(\d{3})$/u;

export function canonicalEpisodeIds(): string[] {
  return Array.from({ length: V5_EXPECTED_EPISODE_COUNT }, (_, index) => {
    const episodeNumber = index + 1;
    return `E${String(episodeNumber).padStart(3, "0")}`;
  });
}
