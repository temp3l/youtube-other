import { countSpokenWords } from "@mediaforge/shared";
import { languageCodes, type LanguageCode } from "@mediaforge/story-localization";

export const speechNarrationArtifactTypes = ["full", "short"] as const;
export type SpeechNarrationArtifactType =
  (typeof speechNarrationArtifactTypes)[number];

interface DurationTolerance {
  readonly warningMinRatio: number;
  readonly warningMaxRatio: number;
  readonly failMinRatio: number;
  readonly failMaxRatio: number;
}

export interface SpeechNarrationPacingPreset {
  readonly id: string;
  readonly language: LanguageCode;
  readonly artifactType: SpeechNarrationArtifactType;
  readonly targetWpm: number;
  readonly providerSpeed: number;
  readonly durationTolerance: DurationTolerance;
}

const defaultDurationTolerance: DurationTolerance = {
  warningMinRatio: 0.88,
  warningMaxRatio: 1.15,
  failMinRatio: 0.78,
  failMaxRatio: 1.3,
};

const presetConfig = {
  en: {
    full: { targetWpm: 182, providerSpeed: 1.12 },
    short: { targetWpm: 188, providerSpeed: 1.16 },
  },
  de: {
    full: { targetWpm: 184, providerSpeed: 1.45 },
    short: { targetWpm: 190, providerSpeed: 1.6 },
  },
  es: {
    full: { targetWpm: 182, providerSpeed: 1.14 },
    short: { targetWpm: 188, providerSpeed: 1.18 },
  },
  fr: {
    full: { targetWpm: 180, providerSpeed: 1.12 },
    short: { targetWpm: 184, providerSpeed: 1.16 },
  },
  pt: {
    full: { targetWpm: 182, providerSpeed: 1.16 },
    short: { targetWpm: 188, providerSpeed: 1.18 },
  },
} as const satisfies Readonly<
  Record<
    LanguageCode,
    Readonly<
      Record<
        SpeechNarrationArtifactType,
        Readonly<{
          readonly targetWpm: number;
          readonly providerSpeed: number;
        }>
      >
    >
  >
>;

export const SPEECH_NARRATION_PACING_PRESETS: Readonly<
  Record<
    LanguageCode,
    Readonly<Record<SpeechNarrationArtifactType, SpeechNarrationPacingPreset>>
  >
> = Object.freeze(
  Object.fromEntries(
    languageCodes.map((language) => [
      language,
      Object.freeze(
        Object.fromEntries(
          speechNarrationArtifactTypes.map((artifactType) => {
            const config = presetConfig[language][artifactType];
            return [
              artifactType,
              Object.freeze({
                id: `dark-truth-${language}-${artifactType}-pace-v1`,
                language,
                artifactType,
                targetWpm: config.targetWpm,
                providerSpeed: config.providerSpeed,
                durationTolerance: defaultDurationTolerance,
              } satisfies SpeechNarrationPacingPreset),
            ];
          })
        ) as Record<SpeechNarrationArtifactType, SpeechNarrationPacingPreset>
      ),
    ])
  ) as Record<
    LanguageCode,
    Record<SpeechNarrationArtifactType, SpeechNarrationPacingPreset>
  >
);

function normalizeLanguage(language: string): LanguageCode {
  const normalized = language.trim().toLowerCase().split("-", 1)[0] ?? "";
  if (
    normalized === "en" ||
    normalized === "de" ||
    normalized === "es" ||
    normalized === "fr" ||
    normalized === "pt"
  ) {
    return normalized;
  }
  throw new Error(
    `Unsupported narration pacing language "${language}". Expected one of: ${languageCodes.join(", ")}.`
  );
}

function normalizeArtifactType(
  artifactType: string
): SpeechNarrationArtifactType {
  if (artifactType === "full" || artifactType === "short") {
    return artifactType;
  }
  throw new Error(
    `Unsupported narration pacing profile "${artifactType}". Expected one of: ${speechNarrationArtifactTypes.join(", ")}.`
  );
}

export function resolveSpeechNarrationPacingPreset(
  language: string,
  artifactType: string
): SpeechNarrationPacingPreset {
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedArtifactType = normalizeArtifactType(artifactType);
  const preset =
    SPEECH_NARRATION_PACING_PRESETS[normalizedLanguage]?.[
      normalizedArtifactType
    ];
  if (!preset) {
    throw new Error(
      `Missing narration pacing preset for ${normalizedLanguage}/${normalizedArtifactType}.`
    );
  }
  return preset;
}

export interface NarrationDurationRangeMs {
  readonly minMs: number;
  readonly maxMs: number;
}

export interface NarrationDurationExpectation {
  readonly wordCount: number;
  readonly targetWpm: number;
  readonly expectedDurationMs: number;
  readonly warningDurationRangeMs: NarrationDurationRangeMs;
  readonly failDurationRangeMs: NarrationDurationRangeMs;
}

export function buildNarrationDurationExpectation(input: {
  readonly wordCount: number;
  readonly targetWpm: number;
  readonly durationTolerance?: DurationTolerance;
}): NarrationDurationExpectation {
  const durationTolerance = input.durationTolerance ?? defaultDurationTolerance;
  const expectedDurationMs =
    (input.wordCount / Math.max(1, input.targetWpm)) * 60_000;
  return {
    wordCount: input.wordCount,
    targetWpm: input.targetWpm,
    expectedDurationMs,
    warningDurationRangeMs: {
      minMs: expectedDurationMs * durationTolerance.warningMinRatio,
      maxMs: expectedDurationMs * durationTolerance.warningMaxRatio,
    },
    failDurationRangeMs: {
      minMs: expectedDurationMs * durationTolerance.failMinRatio,
      maxMs: expectedDurationMs * durationTolerance.failMaxRatio,
    },
  };
}

export interface NarrationPacingAssessment
  extends NarrationDurationExpectation {
  readonly presetId: string;
  readonly language: LanguageCode;
  readonly artifactType: SpeechNarrationArtifactType;
  readonly providerSpeed: number;
  readonly actualDurationMs: number;
  readonly actualWpm: number;
  readonly status: "passed" | "warning" | "failed";
}

export function assessNarrationPacing(input: {
  readonly language: string;
  readonly artifactType: string;
  readonly wordCount?: number;
  readonly text?: string;
  readonly actualDurationMs: number;
}): NarrationPacingAssessment {
  const preset = resolveSpeechNarrationPacingPreset(
    input.language,
    input.artifactType
  );
  const wordCount =
    input.wordCount ?? countSpokenWords(input.text ?? "");
  const expectation = buildNarrationDurationExpectation({
    wordCount,
    targetWpm: preset.targetWpm,
    durationTolerance: preset.durationTolerance,
  });
  const actualWpm =
    input.actualDurationMs > 0
      ? (wordCount / input.actualDurationMs) * 60_000
      : 0;
  const status =
    input.actualDurationMs < expectation.failDurationRangeMs.minMs ||
    input.actualDurationMs > expectation.failDurationRangeMs.maxMs
      ? "failed"
      : input.actualDurationMs < expectation.warningDurationRangeMs.minMs ||
          input.actualDurationMs > expectation.warningDurationRangeMs.maxMs
        ? "warning"
        : "passed";
  return {
    presetId: preset.id,
    language: preset.language,
    artifactType: preset.artifactType,
    providerSpeed: preset.providerSpeed,
    actualDurationMs: input.actualDurationMs,
    actualWpm,
    status,
    ...expectation,
  };
}
