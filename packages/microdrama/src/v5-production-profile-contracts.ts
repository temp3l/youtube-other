import { z } from "zod";

import {
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
} from "./v5-pack-constants.js";

export const V5_BCP47_LOCALES = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
export const v5Bcp47LocaleSchema = z.enum(V5_BCP47_LOCALES);
export type V5Bcp47Locale = z.infer<typeof v5Bcp47LocaleSchema>;

export const HERITAGE_SINGLE_VALUE_WPM = 160 as const;

export const lexicalGatePolicySchema = z
  .object({
    gateKind: z.literal("LEXICAL_GATE"),
    targetSpokenWpm: z.number().int().min(1).max(400),
    wordCountMin: z.number().int().min(1),
    wordCountMax: z.number().int().min(1),
    durationSecondsMin: z.number(),
    durationSecondsMax: z.number(),
  })
  .strict()
  .refine((value) => value.wordCountMin <= value.wordCountMax, {
    message: "wordCountMin must be <= wordCountMax",
  })
  .refine((value) => value.durationSecondsMin <= value.durationSecondsMax, {
    message: "durationSecondsMin must be <= durationSecondsMax",
  });
export type LexicalGatePolicy = z.infer<typeof lexicalGatePolicySchema>;

export const audioGatePolicySchema = z
  .object({
    gateKind: z.literal("AUDIO_GATE"),
    calibrationStatus: z.literal("UNCALIBRATED"),
    selectedAudioIsTimingAuthority: z.literal(true),
    softDurationSeconds: z.null(),
    hardDurationSeconds: z.null(),
  })
  .strict();
export type AudioGatePolicy = z.infer<typeof audioGatePolicySchema>;

export const localeProductionProfileSchema = z
  .object({
    locale: v5Bcp47LocaleSchema,
    lexicalGate: lexicalGatePolicySchema,
    audioGate: audioGatePolicySchema,
    editorialGateMinScore: z.number(),
  })
  .strict();
export type LocaleProductionProfile = z.infer<typeof localeProductionProfileSchema>;

export const sevenMinutesAheadProductionProfileSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    profileId: z.string().min(1).max(160),
    seriesId: z.literal(SEVEN_MINUTES_AHEAD_SERIES_ID),
    packVersion: z.literal(V5_REMEDIATED_PACK_VERSION),
    defaultLocale: v5Bcp47LocaleSchema,
    supportedLocales: z.array(v5Bcp47LocaleSchema).length(4),
    localeProfiles: z.array(localeProductionProfileSchema).length(4),
    aspectRatio: z.literal("9:16"),
    registeredAt: z.string(),
  })
  .strict()
  .refine(
    (value) =>
      value.supportedLocales.every((locale) =>
        value.localeProfiles.some((profile) => profile.locale === locale)
      ),
    { message: "Every supported locale must have a locale profile." }
  );
export type SevenMinutesAheadProductionProfile = z.infer<
  typeof sevenMinutesAheadProductionProfileSchema
>;

export type TimingAuthorityHintSource =
  | "heritage_series_state"
  | "v5_locale_profile"
  | "manifest";

export type TimingAuthorityHint = {
  source: TimingAuthorityHintSource;
  locale: V5Bcp47Locale;
  spokenWpm?: number;
};

export type LexicalTimingAuthorityResolution =
  | { ok: true; localeProfile: LocaleProductionProfile; authoritySource: "v5_locale_profile" }
  | { ok: false; code: "unsupported_locale" | "heritage_wpm_rejected" | "invalid_hint"; message: string };

export function validateSevenMinutesAheadProductionProfile(
  profile: unknown
): SevenMinutesAheadProductionProfile {
  return sevenMinutesAheadProductionProfileSchema.parse(profile);
}
