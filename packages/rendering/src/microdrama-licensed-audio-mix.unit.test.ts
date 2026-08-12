import { describe, expect, it } from "vitest";

import {
  buildMinimalSceneShotPlanFixture,
  compileLocaleEpisodeTimeline,
  compileLocaleTtsSegmentation,
} from "@mediaforge/microdrama";
import {
  SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION,
  planLicensedAudioAssetRecord,
  selectedAudioTimingDependencySchema,
} from "@mediaforge/domain";

import { compileLocaleSubtitleProjection } from "./locale-subtitle-artifact.js";
import {
  compileLicensedAudioMixManifest,
  compileLicensedAudioMixToFfmpegFilter,
  licensedAudioMixCacheDependency,
} from "./microdrama-licensed-audio-mix.js";

const SCRIPT_REVISION_ID = "rev.script.e001.licensed-audio.v5";
const VOICE_PROFILE_VERSION_ID = "voice-version.narrator.v1";
const MODEL_CONFIGURATION = {
  provider: "openai" as const,
  model: "tts-1-hd",
  voice: "alloy",
  instructions: "Measured pacing for microdrama.",
  speed: 1,
};
const APPROVAL_HASH = "f".repeat(64);

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

function buildTimelineWithLicensedAudio() {
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
  const ambienceAsset = planLicensedAudioAssetRecord({
    assetId: "asset.ambience.city-night",
    layerKind: "ambience",
    assetHash: "1".repeat(64),
    mimeType: "audio/wav",
    byteSize: 4_096,
    storageUri: "file:///fixtures/audio/city-night.wav",
    provenance: {
      sourceKind: "stock-library",
      importReference: "library.track.city-night-001",
      importedAt: "2026-08-01T10:00:00.000Z",
      importedBy: "operator.audio",
    },
    rights: {
      status: "licensed",
      licenseReference: "license.stock.city-night.2026",
      rightsHolders: ["Example Audio Library"],
      permittedTerritories: ["WW"],
      commercialUse: true,
      expiresAt: "2027-08-01T00:00:00.000Z",
      approvalEvidenceHash: APPROVAL_HASH,
      approvedAt: "2026-08-01T11:00:00.000Z",
      approvedBy: "rights.reviewer",
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
  });
  const licensedAudio = {
    ambience: [
      {
        entryId: "track.ambience.main",
        assetId: ambienceAsset.assetId,
        assetFingerprint: ambienceAsset.fingerprint,
        startMs: 0,
        endMs: timingDependency.totalDurationMs,
        gainDb: -10,
      },
    ],
    sfx: [],
    music: [],
  };
  const timeline = compileLocaleEpisodeTimeline({
    plan,
    ttsBundle: bundle,
    timingDependency,
    subtitleProjection,
    sharedVisualDependencyHashes: {
      sharedVisualCache: "2".repeat(64),
    },
  });
  return {
    timeline: {
      ...timeline,
      tracks: {
        ...timeline.tracks,
        licensedAudio,
      },
    },
    ambienceAsset,
    licensedAudio,
  };
}

describe("microdrama licensed audio mix", () => {
  it("compiles separate ambience layers with rights-bound dependency identity", () => {
    const { timeline, ambienceAsset, licensedAudio } = buildTimelineWithLicensedAudio();
    const manifest = compileLicensedAudioMixManifest({
      timeline,
      tracks: licensedAudio,
      assetsById: new Map([[ambienceAsset.assetId, ambienceAsset]]),
      assetPaths: {
        [ambienceAsset.assetId]: "/tmp/audio/city-night.wav",
      },
      narrationAudioPath: "/tmp/narration.wav",
      evaluatedAt: "2026-08-12T12:00:00.000Z",
      territory: "US",
    });

    expect(manifest.layers).toHaveLength(1);
    expect(manifest.layers[0]?.layerKind).toBe("ambience");
    expect(manifest.dependencyIdentity.licensedAudioTracks).toBeDefined();
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/u);

    const filter = compileLicensedAudioMixToFfmpegFilter(manifest);
    expect(filter).toContain("amix=inputs=2");
    expect(filter).toContain("adelay=0|0");
    expect(filter).toContain("volume=0.3162");
  });

  it("blocks mix compilation when rights evidence has expired", () => {
    const { timeline, ambienceAsset, licensedAudio } = buildTimelineWithLicensedAudio();
    const expiredAsset = planLicensedAudioAssetRecord({
      ...ambienceAsset,
      rights: {
        ...ambienceAsset.rights,
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
      recordedAt: "2026-08-02T12:00:00.000Z",
    });
    const expiredTracks = {
      ...licensedAudio,
      ambience: licensedAudio.ambience.map((entry) => ({
        ...entry,
        assetFingerprint: expiredAsset.fingerprint,
      })),
    };

    expect(() =>
      compileLicensedAudioMixManifest({
        timeline,
        tracks: expiredTracks,
        assetsById: new Map([[expiredAsset.assetId, expiredAsset]]),
        assetPaths: {
          [expiredAsset.assetId]: "/tmp/audio/city-night.wav",
        },
        narrationAudioPath: "/tmp/narration.wav",
        evaluatedAt: "2026-08-12T12:00:00.000Z",
        territory: "US",
      })
    ).toThrow(/RIGHTS_EXPIRED/u);

    const cacheDependency = licensedAudioMixCacheDependency({
      tracks: licensedAudio,
      assetsById: new Map([[ambienceAsset.assetId, ambienceAsset]]),
    });
    const changedRights = licensedAudioMixCacheDependency({
      tracks: expiredTracks,
      assetsById: new Map([[expiredAsset.assetId, expiredAsset]]),
    });
    expect(cacheDependency.licensedAudioTracks).toBe(changedRights.licensedAudioTracks);
    expect(cacheDependency[ambienceAsset.assetId]).not.toBe(
      changedRights[expiredAsset.assetId]
    );
  });
});
