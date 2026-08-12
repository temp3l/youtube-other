import { describe, expect, it } from "vitest";

import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";
import {
  buildMinimalSceneShotPlanFixture,
  compileLocaleEpisodeTimeline,
  compileLocaleTtsSegmentation,
} from "@mediaforge/microdrama";

import {
  buildMicrodramaRenderCacheIdentity,
  compileMicrodramaRenderManifest,
  compileMicrodramaRenderManifestToFfmpegArgs,
  validateCompiledMicrodramaFfmpegSafety,
} from "./microdrama-render-manifest.js";
import { compileLocaleSubtitleProjection } from "./locale-subtitle-artifact.js";

const SCRIPT_REVISION_ID = "rev.script.e001.render-manifest.v5";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.v1";
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

function buildFixtureTimeline() {
  const plan = buildMinimalSceneShotPlanFixture("E001");
  const bundle = compileLocaleTtsSegmentation({
    scriptText: SAMPLE_SCRIPT,
    scriptRevisionId: SCRIPT_REVISION_ID,
    locale: "en-US",
    voiceProfileVersionId: VOICE_PROFILE_VERSION_ID,
    modelConfiguration: MODEL_CONFIGURATION,
    selectedAudio: FAKE_SELECTED_AUDIO,
  });
  const timingDependency = selectedAudioTimingDependencySchema.parse({
    schemaVersion: SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
    locale: "en-US",
    alignmentRevisionId: bundle.timingContract.alignmentRevisionId,
    cacheKey: bundle.timingContract.cacheKey,
    authoritySource: bundle.timingContract.authoritySource,
    totalDurationMs: bundle.timingContract.totalDurationMs,
  });
  const subtitleProjection = compileLocaleSubtitleProjection({
    locale: "en-US",
    alignment: bundle.selectedAudioAlignment!,
    timingDependency,
  });
  return compileLocaleEpisodeTimeline({
    plan,
    ttsBundle: bundle,
    timingDependency,
    subtitleProjection,
    sharedVisualDependencyHashes: {
      sharedVisualCache: "c".repeat(64),
    },
  });
}

describe("microdrama render manifest and cache identity", () => {
  it("compiles typed ffmpeg manifests without shell interpolation", () => {
    const timeline = buildFixtureTimeline();
    const clipAssetPaths = Object.fromEntries(
      timeline.tracks.videoShots.map((shot, index) => [
        shot.shotSemanticId,
        `/tmp/visuals/${String(index + 1).padStart(3, "0")}.png`,
      ]),
    );
    const manifest = compileMicrodramaRenderManifest({
      timeline,
      narrationAudioPath: "/tmp/narration.wav",
      subtitlePath: "/tmp/subtitles.srt",
      outputPath: "/tmp/output.mp4",
      clipAssetPaths,
    });

    expect(manifest.timelineRevisionId).toBe(timeline.timelineRevisionId);
    expect(manifest.clips).toHaveLength(timeline.tracks.videoShots.length);
    expect(manifest.clips[0]?.operations[0]?.kind).toBe("cover");
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/u);

    const commands = compileMicrodramaRenderManifestToFfmpegArgs(manifest);
    validateCompiledMicrodramaFfmpegSafety(commands);
    expect(commands[0]?.join(" ")).not.toMatch(/[;&|`$]/u);
    expect(commands.at(-1)?.join(" ")).toContain("subtitles=");
  });

  it("includes shared and localized dependency hashes in render cache identity", () => {
    const timeline = buildFixtureTimeline();
    const base = buildMicrodramaRenderCacheIdentity({
      timelineFingerprint: timeline.fingerprint,
      dependencyIdentity: timeline.dependencyIdentity,
      renderProfileRevision: "render-profile.microdrama.vertical.v1",
      locale: timeline.locale,
    });
    const same = buildMicrodramaRenderCacheIdentity({
      timelineFingerprint: timeline.fingerprint,
      dependencyIdentity: timeline.dependencyIdentity,
      renderProfileRevision: "render-profile.microdrama.vertical.v1",
      locale: timeline.locale,
    });
    const differentSubtitle = buildMicrodramaRenderCacheIdentity({
      timelineFingerprint: timeline.fingerprint,
      dependencyIdentity: {
        ...timeline.dependencyIdentity,
        subtitleProjection: "d".repeat(64),
      },
      renderProfileRevision: "render-profile.microdrama.vertical.v1",
      locale: timeline.locale,
    });
    const differentProfile = buildMicrodramaRenderCacheIdentity({
      timelineFingerprint: timeline.fingerprint,
      dependencyIdentity: timeline.dependencyIdentity,
      renderProfileRevision: "render-profile.microdrama.vertical.v2",
      locale: timeline.locale,
    });

    expect(same.cacheKey).toBe(base.cacheKey);
    expect(differentSubtitle.cacheKey).not.toBe(base.cacheKey);
    expect(differentProfile.cacheKey).not.toBe(base.cacheKey);
    expect(base.dependencyIdentity.timeline).toBe(timeline.fingerprint);
    expect(base.dependencyIdentity.subtitleProjection).toBe(
      timeline.dependencyIdentity.subtitleProjection,
    );
    expect(base.dependencyIdentity.sharedVisualCache).toBe("c".repeat(64));
    expect(base.canonicalInput).toContain(timeline.locale);
  });
});
