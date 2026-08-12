import { describe, expect, it } from "vitest";

import { compileLocaleSubtitleProjection } from "../../rendering/src/locale-subtitle-artifact.js";
import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";

import {
  compileLocaleEpisodeTimeline,
  compileLocaleTtsSegmentation,
} from "./index.js";
import { buildMinimalSceneShotPlanFixture } from "./scene-shot-plan-fixture.js";

const SCRIPT_REVISION_ID = "rev.script.e001.locale-composition.v5";
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
};

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

function loadE001Plan() {
  return buildMinimalSceneShotPlanFixture("E001");
}

describe("locale episode timeline composition", () => {
  it("preserves semantic shot order with independent locale timing", () => {
    const plan = loadE001Plan();
    const locales = ["en-US", "de-DE"] as const;
    const timelines = locales.map((locale) => {
      const bundle = compileLocaleTtsSegmentation({
        scriptText: LOCALE_SCRIPTS[locale],
        scriptRevisionId: `${SCRIPT_REVISION_ID}.${locale.toLowerCase()}`,
        locale,
        voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
        modelConfiguration: MODEL_CONFIGURATION,
        selectedAudio: LOCALE_SELECTED_AUDIO[locale],
      });
      const subtitleProjection = compileLocaleSubtitleProjection({
        locale,
        alignment: bundle.selectedAudioAlignment!,
        timingDependency: timingDependencyFor(locale, bundle),
      });
      return compileLocaleEpisodeTimeline({
        plan,
        ttsBundle: bundle,
        timingDependency: timingDependencyFor(locale, bundle),
        subtitleProjection,
        sharedVisualDependencyHashes: {
          sharedVisualCache: "a".repeat(64),
        },
      });
    });

    const english = timelines[0]!;
    const german = timelines[1]!;

    expect(english.shotTiming.map((entry) => entry.shotSemanticId)).toEqual(
      german.shotTiming.map((entry) => entry.shotSemanticId),
    );
    expect(english.shotTiming.map((entry) => entry.shotSemanticId)).toEqual(
      plan.shots.map((shot) => shot.shotSemanticId),
    );
    expect(english.totalDurationMs).toBe(LOCALE_SELECTED_AUDIO["en-US"].totalDurationMs);
    expect(german.totalDurationMs).toBe(LOCALE_SELECTED_AUDIO["de-DE"].totalDurationMs);
    expect(english.shotTiming.at(-1)?.endMs).not.toBe(german.shotTiming.at(-1)?.endMs);
    expect(english.fingerprint).not.toBe(german.fingerprint);
    expect(english.dependencyIdentity.subtitleProjection).toBeDefined();
    expect(english.dependencyIdentity.sharedVisualCache).toBe("a".repeat(64));
    expect(english.tracks.videoShots).toHaveLength(plan.shots.length);
    expect(english.tracks.subtitles.fingerprint).toBe(
      compileLocaleSubtitleProjection({
        locale: "en-US",
        alignment: compileLocaleTtsSegmentation({
          scriptText: LOCALE_SCRIPTS["en-US"],
          scriptRevisionId: `${SCRIPT_REVISION_ID}.en-us`,
          locale: "en-US",
          voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
          modelConfiguration: MODEL_CONFIGURATION,
          selectedAudio: LOCALE_SELECTED_AUDIO["en-US"],
        }).selectedAudioAlignment!,
        timingDependency: timingDependencyFor(
          "en-US",
          compileLocaleTtsSegmentation({
            scriptText: LOCALE_SCRIPTS["en-US"],
            scriptRevisionId: `${SCRIPT_REVISION_ID}.en-us`,
            locale: "en-US",
            voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
            modelConfiguration: MODEL_CONFIGURATION,
            selectedAudio: LOCALE_SELECTED_AUDIO["en-US"],
          }),
        ),
      }).fingerprint,
    );
  });

  it("changes timeline fingerprint when shared visual dependency changes", () => {
    const plan = loadE001Plan();
    const bundle = compileLocaleTtsSegmentation({
      scriptText: LOCALE_SCRIPTS["en-US"],
      scriptRevisionId: `${SCRIPT_REVISION_ID}.en-us`,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
      selectedAudio: LOCALE_SELECTED_AUDIO["en-US"],
    });
    const subtitleProjection = compileLocaleSubtitleProjection({
      locale: "en-US",
      alignment: bundle.selectedAudioAlignment!,
      timingDependency: timingDependencyFor("en-US", bundle),
    });
    const base = compileLocaleEpisodeTimeline({
      plan,
      ttsBundle: bundle,
      timingDependency: timingDependencyFor("en-US", bundle),
      subtitleProjection,
      sharedVisualDependencyHashes: {
        sharedVisualCache: "a".repeat(64),
      },
    });
    const changed = compileLocaleEpisodeTimeline({
      plan,
      ttsBundle: bundle,
      timingDependency: timingDependencyFor("en-US", bundle),
      subtitleProjection,
      sharedVisualDependencyHashes: {
        sharedVisualCache: "b".repeat(64),
      },
    });

    expect(base.fingerprint).not.toBe(changed.fingerprint);
    expect(base.timelineRevisionId).toBe(changed.timelineRevisionId);
  });
});
