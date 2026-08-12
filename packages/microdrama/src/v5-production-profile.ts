import {
  HERITAGE_SINGLE_VALUE_WPM,
  type LexicalTimingAuthorityResolution,
  type SevenMinutesAheadProductionProfile,
  type TimingAuthorityHint,
  type V5Bcp47Locale,
  sevenMinutesAheadProductionProfileSchema,
  validateSevenMinutesAheadProductionProfile,
} from "./v5-production-profile-contracts.js";
import {
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
} from "./v5-pack-constants.js";

const V5_PROFILE_ID = "production-profile.seven-minutes-ahead.v5-remediated";

const UNCALIBRATED_AUDIO_GATE = {
  gateKind: "AUDIO_GATE" as const,
  calibrationStatus: "UNCALIBRATED" as const,
  selectedAudioIsTimingAuthority: true as const,
  softDurationSeconds: null,
  hardDurationSeconds: null,
};

const V5_LOCALE_PROFILE_DATA: Readonly<
  Record<
    V5Bcp47Locale,
    {
      targetSpokenWpm: number;
      wordCountMin: number;
      wordCountMax: number;
      durationSecondsMin: number;
      durationSecondsMax: number;
      editorialGateMinScore: number;
    }
  >
> = {
  "en-US": {
    targetSpokenWpm: 155,
    wordCountMin: 145,
    wordCountMax: 160,
    durationSecondsMin: 56,
    durationSecondsMax: 62,
    editorialGateMinScore: 9.5,
  },
  "de-DE": {
    targetSpokenWpm: 150,
    wordCountMin: 140,
    wordCountMax: 155,
    durationSecondsMin: 56,
    durationSecondsMax: 62,
    editorialGateMinScore: 9.5,
  },
  "es-ES": {
    targetSpokenWpm: 155,
    wordCountMin: 145,
    wordCountMax: 160,
    durationSecondsMin: 56,
    durationSecondsMax: 62,
    editorialGateMinScore: 9.5,
  },
  "pt-BR": {
    targetSpokenWpm: 155,
    wordCountMin: 145,
    wordCountMax: 160,
    durationSecondsMin: 56,
    durationSecondsMax: 62,
    editorialGateMinScore: 9.5,
  },
};

export function buildSevenMinutesAheadProductionProfile(
  registeredAt = new Date().toISOString()
): SevenMinutesAheadProductionProfile {
  const supportedLocales = ["en-US", "de-DE", "es-ES", "pt-BR"] as const;
  const localeProfiles = supportedLocales.map((locale) => {
    const data = V5_LOCALE_PROFILE_DATA[locale];
    return {
      locale,
      lexicalGate: {
        gateKind: "LEXICAL_GATE" as const,
        targetSpokenWpm: data.targetSpokenWpm,
        wordCountMin: data.wordCountMin,
        wordCountMax: data.wordCountMax,
        durationSecondsMin: data.durationSecondsMin,
        durationSecondsMax: data.durationSecondsMax,
      },
      audioGate: UNCALIBRATED_AUDIO_GATE,
      editorialGateMinScore: data.editorialGateMinScore,
    };
  });

  return sevenMinutesAheadProductionProfileSchema.parse({
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    profileId: V5_PROFILE_ID,
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    packVersion: V5_REMEDIATED_PACK_VERSION,
    defaultLocale: "en-US",
    supportedLocales: [...supportedLocales],
    localeProfiles,
    aspectRatio: "9:16",
    registeredAt,
  });
}

export function resolveLocaleProductionProfile(
  profile: SevenMinutesAheadProductionProfile,
  locale: V5Bcp47Locale
) {
  return profile.localeProfiles.find((entry) => entry.locale === locale) ?? null;
}

export function resolveLexicalTimingAuthority(
  profile: SevenMinutesAheadProductionProfile,
  locale: V5Bcp47Locale,
  hints: readonly TimingAuthorityHint[] = []
): LexicalTimingAuthorityResolution {
  const localeProfile = resolveLocaleProductionProfile(profile, locale);
  if (!localeProfile) {
    return {
      ok: false,
      code: "unsupported_locale",
      message: `Locale ${locale} is not registered in the V5 production profile.`,
    };
  }

  for (const hint of hints) {
    if (hint.locale !== locale) {
      continue;
    }
    if (hint.spokenWpm === HERITAGE_SINGLE_VALUE_WPM) {
      return {
        ok: false,
        code: "heritage_wpm_rejected",
        message: `Heritage ${HERITAGE_SINGLE_VALUE_WPM} WPM is not V5 runtime authority for ${locale}.`,
      };
    }
    if (
      hint.source === "heritage_series_state" &&
      hint.spokenWpm !== undefined &&
      hint.spokenWpm !== localeProfile.lexicalGate.targetSpokenWpm
    ) {
      return {
        ok: false,
        code: "heritage_wpm_rejected",
        message: `Heritage series-state WPM ${hint.spokenWpm} cannot override V5 locale profile authority.`,
      };
    }
  }

  return {
    ok: true,
    localeProfile,
    authoritySource: "v5_locale_profile",
  };
}

export function heritageWpmIsRuntimeAuthority(spokenWpm: number): boolean {
  return spokenWpm !== HERITAGE_SINGLE_VALUE_WPM;
}

export { validateSevenMinutesAheadProductionProfile };
