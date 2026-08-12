import { describe, expect, it } from "vitest";

import {
  createLocaleTtsCacheIdentity,
  hashLocaleTtsModelConfiguration,
  lexicalDurationForSegments,
  segmentLocaleScript,
} from "../../speech/src/locale-tts-segmentation.js";
import { hashText } from "@mediaforge/shared";

import {
  buildSevenMinutesAheadProductionProfile,
  compileLocaleTtsSegmentation,
  resolveLocaleTtsTimingAuthority,
} from "./index.js";

const SCRIPT_REVISION_ID = "rev.script.e001.en-us.v5";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.en-us.v1";
const MODEL_CONFIGURATION = {
  provider: "openai" as const,
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};

const SAMPLE_SCRIPT = [
  "Maya stares at the phone as the city noise fades behind her.",
  'MAYA: "Seven minutes. That is all we get."',
  "Ethan reaches for her hand, but the screen already shows the next message.",
  'ETHAN: "Then we move now."',
].join("\n\n");

const FAKE_SELECTED_AUDIO = {
  kind: "fake-measured-audio" as const,
  totalDurationMs: 61_250,
  segmentDurationsMs: [18_400, 9_850, 17_500, 15_500],
};

describe("locale TTS segmentation and timing authority", () => {
  it("builds revision-bound narration and dialogue segment requests", () => {
    const segments = segmentLocaleScript({
      scriptText: SAMPLE_SCRIPT,
      scriptRevisionId: SCRIPT_REVISION_ID,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });

    expect(segments).toHaveLength(4);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "narration",
      "dialogue",
      "narration",
      "dialogue",
    ]);
    expect(segments.every((segment) => segment.scriptRevisionId === SCRIPT_REVISION_ID)).toBe(
      true
    );
    expect(segments.every((segment) => segment.voiceProfileVersionId === VOICE_PROFILE_VERSION_ID)).toBe(
      true
    );
    expect(segments[1]?.characterId).toBe("character.maya");
    expect(segments[3]?.characterId).toBe("character.ethan");
    expect(
      segments.every(
        (segment) =>
          segment.modelConfigurationHash ===
          hashLocaleTtsModelConfiguration(MODEL_CONFIGURATION)
      )
    ).toBe(true);
  });

  it("uses fake selected audio to override lexical timing estimates", () => {
    const profile = buildSevenMinutesAheadProductionProfile();
    const lexicalOnly = compileLocaleTtsSegmentation({
      scriptText: SAMPLE_SCRIPT,
      scriptRevisionId: SCRIPT_REVISION_ID,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
      productionProfile: profile,
    });
    const withSelectedAudio = compileLocaleTtsSegmentation({
      scriptText: SAMPLE_SCRIPT,
      scriptRevisionId: SCRIPT_REVISION_ID,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
      productionProfile: profile,
      selectedAudio: FAKE_SELECTED_AUDIO,
    });

    expect(lexicalOnly.timingContract.authoritySource).toBe("lexical_estimate");
    expect(withSelectedAudio.timingContract.authoritySource).toBe("selected_audio");
    expect(withSelectedAudio.timingContract.totalDurationMs).toBe(
      FAKE_SELECTED_AUDIO.totalDurationMs
    );
    expect(withSelectedAudio.timingContract.totalDurationMs).not.toBe(
      lexicalOnly.timingContract.totalDurationMs
    );
    expect(withSelectedAudio.timingContract.measuredDurationMs).toBe(
      FAKE_SELECTED_AUDIO.totalDurationMs
    );
    expect(withSelectedAudio.selectedAudioAlignment?.totalDurationMs).toBe(
      FAKE_SELECTED_AUDIO.totalDurationMs
    );
    expect(withSelectedAudio.selectedAudioAlignment?.segments).toHaveLength(4);
  });

  it("includes script, locale, voice revision and model config in cache identity", () => {
    const scriptHash = hashText(SAMPLE_SCRIPT);
    const base = createLocaleTtsCacheIdentity({
      scriptContentHash: scriptHash,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const same = createLocaleTtsCacheIdentity({
      scriptContentHash: scriptHash,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const differentScript = createLocaleTtsCacheIdentity({
      scriptContentHash: hashText(`${SAMPLE_SCRIPT}\n`),
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const differentLocale = createLocaleTtsCacheIdentity({
      scriptContentHash: scriptHash,
      locale: "de-DE",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const differentVoiceRevision = createLocaleTtsCacheIdentity({
      scriptContentHash: scriptHash,
      locale: "en-US",
      voiceProfileVersionId: "voice-version.narrator.en-us.v2",
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const differentModel = createLocaleTtsCacheIdentity({
      scriptContentHash: scriptHash,
      locale: "en-US",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: {
        ...MODEL_CONFIGURATION,
        model: "gpt-4o-mini-tts",
      },
    });

    expect(same.cacheKey).toBe(base.cacheKey);
    expect(differentScript.cacheKey).not.toBe(base.cacheKey);
    expect(differentLocale.cacheKey).not.toBe(base.cacheKey);
    expect(differentVoiceRevision.cacheKey).not.toBe(base.cacheKey);
    expect(differentModel.cacheKey).not.toBe(base.cacheKey);
    expect(base.canonicalInput).toContain(scriptHash);
    expect(base.canonicalInput).toContain("en-US");
    expect(base.canonicalInput).toContain(VOICE_PROFILE_VERSION_ID);
  });

  it("keeps lexical and audio gates separate in the V5 production profile", () => {
    const profile = buildSevenMinutesAheadProductionProfile();
    const segments = segmentLocaleScript({
      scriptText: SAMPLE_SCRIPT,
      scriptRevisionId: SCRIPT_REVISION_ID,
      locale: "de-DE",
      voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
      modelConfiguration: MODEL_CONFIGURATION,
    });
    const lexicalEstimateDurationMs = lexicalDurationForSegments(
      segments,
      profile.localeProfiles.find((entry) => entry.locale === "de-DE")!.lexicalGate
        .targetSpokenWpm
    );
    const resolution = resolveLocaleTtsTimingAuthority({
      locale: "de-DE",
      segmentRequests: segments,
      productionProfile: profile,
      selectedAudio: FAKE_SELECTED_AUDIO,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) {
      throw new Error(resolution.message);
    }
    expect(resolution.localeProfile.lexicalGate.gateKind).toBe("LEXICAL_GATE");
    expect(resolution.localeProfile.audioGate.gateKind).toBe("AUDIO_GATE");
    expect(resolution.localeProfile.audioGate.calibrationStatus).toBe("UNCALIBRATED");
    expect(resolution.lexicalEstimateDurationMs).toBe(lexicalEstimateDurationMs);
    expect(resolution.authoritySource).toBe("selected_audio");
    expect(resolution.totalDurationMs).toBe(FAKE_SELECTED_AUDIO.totalDurationMs);
  });
});
