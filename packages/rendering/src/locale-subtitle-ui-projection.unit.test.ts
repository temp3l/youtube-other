import { describe, expect, it } from "vitest";

import { buildLocaleTtsSelectedAudioAlignment } from "@mediaforge/alignment";
import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  projectSignalUiForLocale,
  selectedAudioTimingDependencySchema,
  signalUiLocaleTextBundleSchema,
  signalUiStateSchema,
} from "@mediaforge/domain";
import { compileLocaleTtsSegmentation } from "@mediaforge/microdrama";
import {
  compileLocaleSubtitleArtifact,
  compileLocaleSubtitleProjection,
} from "./locale-subtitle-artifact.js";
import { compileLocalizedSignalUiCompositorArtifact } from "./signal-ui-projection.js";

const SCRIPT_REVISION_ID = "rev.script.e001.locale-subtitle.v5";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.v1";
const MODEL_CONFIGURATION = {
  provider: "openai" as const,
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};

const LOCALE_SCRIPTS = {
  "en-US": [
    "Maya stares at the phone as the city noise fades behind her.",
    'MAYA: "Seven minutes. That is all we get."',
    "Ethan reaches for her hand, but the screen already shows the next message.",
    'ETHAN: "Then we move now."',
  ].join("\n\n"),
  "de-DE": [
    "Maya starrt auf das Telefon, während der Stadtlärm hinter ihr verblasst.",
    'MAYA: "Sieben Minuten. Das ist alles, was wir bekommen."',
    "Ethan greift nach ihrer Hand, aber der Bildschirm zeigt bereits die nächste Nachricht.",
    'ETHAN: "Dann bewegen wir uns jetzt."',
  ].join("\n\n"),
  "es-ES": [
    "Maya mira fijamente el teléfono mientras el ruido de la ciudad se desvanece detrás de ella.",
    'MAYA: "Siete minutos. Eso es todo lo que tenemos."',
    "Ethan le toma la mano, pero la pantalla ya muestra el siguiente mensaje.",
    'ETHAN: "Entonces nos movemos ahora."',
  ].join("\n\n"),
} as const;

const LOCALE_SELECTED_AUDIO = {
  "en-US": {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 61_250,
    segmentDurationsMs: [18_400, 9_850, 17_500, 15_500],
  },
  "de-DE": {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 66_800,
    segmentDurationsMs: [20_100, 11_200, 18_900, 16_600],
  },
  "es-ES": {
    kind: "fake-measured-audio" as const,
    totalDurationMs: 63_400,
    segmentDurationsMs: [19_200, 10_400, 17_800, 16_000],
  },
};

const canonicalSignalUiState = signalUiStateSchema.parse({
  schemaVersion: "mediaforge.signal-ui-state.v1",
  stateId: "signal-ui.e001.insert-001",
  shotSemanticId: "shot.e001.signal-insert-001",
  templateId: "signal-phone.v1",
  screenBounds: { x: 0.22, y: 0.18, width: 0.56, height: 0.64 },
  phoneFrameBounds: { x: 0.18, y: 0.12, width: 0.64, height: 0.76 },
  elements: [
    {
      elementId: "header.app-name",
      kind: "app-label-slot",
      layoutBounds: { x: 0.24, y: 0.2, width: 0.52, height: 0.06 },
      contentRef: "term.signal-app-name",
    },
    {
      elementId: "message.body-001",
      kind: "message-body",
      layoutBounds: { x: 0.24, y: 0.42, width: 0.52, height: 0.24 },
      contentRef: "script.warning-001",
    },
  ],
  criticalRevealRegions: [],
  provenance: {
    source: "typed-state",
    rejectsScreenshotCanon: true,
  },
});

const localizedUiBodies = {
  "en-US": "Seven minutes before Ethan dies.",
  "de-DE": "Sieben Minuten, bevor Ethan stirbt.",
  "es-ES": "Siete minutos antes de que Ethan muera.",
} as const;

function timingDependencyFor(
  locale: keyof typeof LOCALE_SCRIPTS,
  bundle: ReturnType<typeof compileLocaleTtsSegmentation>,
) {
  return selectedAudioTimingDependencySchema.parse({
    schemaVersion: SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
    locale,
    alignmentRevisionId: bundle.timingContract.alignmentRevisionId,
    cacheKey: bundle.timingContract.cacheKey,
    authoritySource: bundle.timingContract.authoritySource,
    totalDurationMs: bundle.timingContract.totalDurationMs,
  });
}

describe("locale subtitle and Signal UI projections", () => {
  it("derives locale-owned subtitle timing and line breaks from selected audio", () => {
    const locales = ["en-US", "de-DE", "es-ES"] as const;
    const projections = locales.map((locale) => {
      const bundle = compileLocaleTtsSegmentation({
        scriptText: LOCALE_SCRIPTS[locale],
        scriptRevisionId: `${SCRIPT_REVISION_ID}.${locale.toLowerCase()}`,
        locale,
        voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
        modelConfiguration: MODEL_CONFIGURATION,
        selectedAudio: LOCALE_SELECTED_AUDIO[locale],
      });
      expect(bundle.selectedAudioAlignment).toBeDefined();
      return compileLocaleSubtitleProjection({
        locale,
        alignment: bundle.selectedAudioAlignment!,
        timingDependency: timingDependencyFor(locale, bundle),
      });
    });

    const english = projections[0]!;
    const german = projections[1]!;
    const spanish = projections[2]!;

    expect(english.captionPlan.segments[0]?.endMs).not.toBe(
      german.captionPlan.segments[0]?.endMs,
    );
    expect(german.captionPlan.segments[0]?.lines).not.toEqual(
      english.captionPlan.segments[0]?.lines,
    );
    expect(english.captionPlan.segments.at(-1)?.endMs).not.toBe(
      german.captionPlan.segments.at(-1)?.endMs,
    );
    expect(spanish.captionPlan.locale).toBe("es-ES");
    expect(spanish.captionPlan.segments.map((segment) => segment.text).join(" ")).toContain(
      "Siete minutos",
    );

    const englishArtifact = compileLocaleSubtitleArtifact(english);
    const germanArtifact = compileLocaleSubtitleArtifact(german);
    expect(englishArtifact.fingerprint).not.toBe(germanArtifact.fingerprint);
    expect(englishArtifact.srt).toContain("00:00:00,000");
    expect(germanArtifact.vtt).toContain("WEBVTT");
    expect(englishArtifact.timingDependencyFingerprint).not.toBe(
      germanArtifact.timingDependencyFingerprint,
    );
  });

  it("does not reuse English timestamps when compiling non-English subtitles", () => {
    const englishBundle = compileLocaleTtsSegmentation({
      scriptText: LOCALE_SCRIPTS["en-US"],
      scriptRevisionId: `${SCRIPT_REVISION_ID}.en-us`,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
      selectedAudio: LOCALE_SELECTED_AUDIO["en-US"],
    });
    const germanBundle = compileLocaleTtsSegmentation({
      scriptText: LOCALE_SCRIPTS["de-DE"],
      scriptRevisionId: `${SCRIPT_REVISION_ID}.de-de`,
      locale: "de-DE",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
      selectedAudio: LOCALE_SELECTED_AUDIO["de-DE"],
    });

    const englishFromEnglishAudio = compileLocaleSubtitleProjection({
      locale: "en-US",
      alignment: englishBundle.selectedAudioAlignment!,
      timingDependency: timingDependencyFor("en-US", englishBundle),
    });
    const germanFromGermanAudio = compileLocaleSubtitleProjection({
      locale: "de-DE",
      alignment: germanBundle.selectedAudioAlignment!,
      timingDependency: timingDependencyFor("de-DE", germanBundle),
    });
    const misalignedGermanOnEnglishAudio = buildLocaleTtsSelectedAudioAlignment({
      alignmentRevisionId: germanBundle.timingContract.alignmentRevisionId,
      segments: germanBundle.segmentRequests.map((segment, index) => ({
        segmentId: segment.segmentId,
        text: segment.text,
        durationMs: LOCALE_SELECTED_AUDIO["en-US"].segmentDurationsMs[index]!,
      })),
    });
    const germanWithEnglishTimestamps = compileLocaleSubtitleProjection({
      locale: "de-DE",
      alignment: misalignedGermanOnEnglishAudio,
      timingDependency: timingDependencyFor("de-DE", germanBundle),
    });

    expect(germanFromGermanAudio.captionPlan.segments[0]?.endMs).not.toBe(
      englishFromEnglishAudio.captionPlan.segments[0]?.endMs,
    );
    expect(germanWithEnglishTimestamps.fingerprint).not.toBe(
      germanFromGermanAudio.fingerprint,
    );
    expect(germanWithEnglishTimestamps.captionPlan.segments.at(-1)?.endMs).not.toBe(
      germanFromGermanAudio.captionPlan.segments.at(-1)?.endMs,
    );
  });

  it("includes locale and selected-audio dependencies in Signal UI compositor hashes", () => {
    const locales = ["en-US", "de-DE", "es-ES"] as const;
    const artifacts = locales.map((locale) => {
      const bundle = compileLocaleTtsSegmentation({
        scriptText: LOCALE_SCRIPTS[locale],
        scriptRevisionId: `${SCRIPT_REVISION_ID}.${locale.toLowerCase()}`,
        locale,
        voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
        modelConfiguration: MODEL_CONFIGURATION,
        selectedAudio: LOCALE_SELECTED_AUDIO[locale],
      });
      const timingDependency = timingDependencyFor(locale, bundle);
      const projection = projectSignalUiForLocale({
        state: canonicalSignalUiState,
        locale,
        textBundle: signalUiLocaleTextBundleSchema.parse({
          locale,
          slots: [
            {
              contentRef: "script.warning-001",
              text: localizedUiBodies[locale],
            },
          ],
        }),
        timingDependency,
      });
      expect(projection.ok).toBe(true);
      if (!projection.ok) {
        throw new Error(projection.message);
      }
      return compileLocalizedSignalUiCompositorArtifact(projection.projection, {
        timingDependency,
      });
    });

    expect(artifacts[0]?.projectionFingerprint).not.toBe(
      artifacts[1]?.projectionFingerprint,
    );
    expect(artifacts[1]?.dependencyIdentity.timingDependencyFingerprint).not.toBe(
      artifacts[2]?.dependencyIdentity.timingDependencyFingerprint,
    );
    expect(artifacts.every((artifact) => artifact.dependencyIdentity.locale)).toBe(true);
  });
});
