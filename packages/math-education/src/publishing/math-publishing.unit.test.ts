import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { createMetadataTimingEvidence, createTimingManifest } from "../lesson/timing.js";
import { localizeNarration } from "../localization/localization.js";
import { createMathMetadataEvidence, createMetadataWorkflowEvidence, createReviewedMetadataContext, generateMathMetadata } from "../metadata/math-metadata.js";
import { createReviewedCurriculumFixture } from "../testing/reviewed-curriculum-fixture.js";
import { createPublishDryRunManifest } from "./dry-run-manifest.js";

async function metadata() {
  const release = await createReviewedCurriculumFixture(
    await fs.mkdtemp(path.join(os.tmpdir(), "math-publish-release-"))
  );
  const skill = release.skills.find((item) => item.skillId === "M5-ZO-001")!;
  const lesson = buildLessonVariant(skill, "standard");
  const localization = localizeNarration(lesson, "en");
  const timing = createTimingManifest(lesson, localization);
  const timingEvidence = createMetadataTimingEvidence(lesson, localization, timing);
  return generateMathMetadata({
    reviewedContext: createReviewedMetadataContext(release, skill.skillId),
    skill, lesson, localization, timingEvidence,
    workflowEvidence: createMetadataWorkflowEvidence({
      lesson,
      localization,
      timingEvidence,
      parentFingerprints: {
        lesson: ["1".repeat(64)],
        localization: ["2".repeat(64)],
        timing: ["3".repeat(64)],
        output: ["4".repeat(64)],
      },
    }),
    evidence: createMathMetadataEvidence(skill, lesson, localization),
  });
}

describe("math publish dry-run packet", () => {
  it("binds all authoritative identities, hashes, policies, and zero side effects", async () => {
    const value = await metadata();
    const packet = createPublishDryRunManifest({
      metadata: value, metadataPath: "locales/en/metadata.json",
      thumbnailManifestPath: "locales/en/thumbnail.svg.manifest.json", thumbnailManifestHash: "1".repeat(64),
      thumbnailAssetPath: "locales/en/thumbnail.svg", thumbnailAssetHash: "2".repeat(64),
      finalMediaPath: "locales/en/render/final.mp4", finalMediaHash: "3".repeat(64),
      finalMediaEvidencePath: "locales/en/final-media.json", finalMediaEvidenceHash: "4".repeat(64),
      qualityPath: "canonical/quality.json", qualityHash: "5".repeat(64),
      brandPolicyPath: "locales/en/brand-policy.json", brandPolicyHash: "6".repeat(64),
      channelId: "math-en", privacyStatus: "private", madeForKids: false, containsSyntheticMedia: true,
      playlistIdsByKey: Object.fromEntries(value.playlists.map((playlist) => [playlist.key, `id-${playlist.key}`])),
    });
    expect(packet.identity).toEqual(value.identity);
    expect(packet.playlistAssignments).toHaveLength(3);
    expect(packet).toMatchObject({ dispatchAllowed: false, paidProviderCalled: false, networkCalls: 0, mutations: 0, blockers: [] });
  });

  it("blocks missing, duplicate, and path-escaping bindings", async () => {
    const value = await metadata();
    const base = {
      metadata: value, metadataPath: "locales/en/metadata.json",
      thumbnailManifestPath: "locales/en/thumbnail.svg.manifest.json", thumbnailManifestHash: "1".repeat(64),
      thumbnailAssetPath: "locales/en/thumbnail.svg", thumbnailAssetHash: "2".repeat(64),
      finalMediaPath: "locales/en/render/final.mp4", finalMediaHash: "3".repeat(64),
      finalMediaEvidencePath: "locales/en/final-media.json", finalMediaEvidenceHash: "4".repeat(64),
      qualityPath: "canonical/quality.json", qualityHash: "5".repeat(64),
      brandPolicyPath: "locales/en/brand-policy.json", brandPolicyHash: "6".repeat(64),
      channelId: "math-en", privacyStatus: "private" as const, madeForKids: false, containsSyntheticMedia: true,
    };
    expect(() => createPublishDryRunManifest({ ...base, playlistIdsByKey: {} })).toThrow(/PUBLISH_BLOCKED/u);
    expect(() => createPublishDryRunManifest({ ...base, playlistIdsByKey: Object.fromEntries(value.playlists.map((playlist) => [playlist.key, "duplicate"])) })).toThrow(/unique/u);
    expect(() => createPublishDryRunManifest({ ...base, metadataPath: "../escape.json", playlistIdsByKey: Object.fromEntries(value.playlists.map((playlist) => [playlist.key, playlist.key])) })).toThrow(/contained/u);
    expect(() => createPublishDryRunManifest({ ...base, finalMediaPath: "locales/en/final.mp4", playlistIdsByKey: Object.fromEntries(value.playlists.map((playlist) => [playlist.key, playlist.key])) })).toThrow(/canonical path/u);
  });

  it("preserves a placeholder artwork public-release blocker in a zero-mutation private dry run", async () => {
    const value = await metadata();
    const packet = createPublishDryRunManifest({
      metadata: value,
      metadataPath: "locales/en/metadata.json",
      thumbnailManifestPath: "locales/en/thumbnail.svg.manifest.json",
      thumbnailManifestHash: "1".repeat(64),
      thumbnailAssetPath: "locales/en/thumbnail.svg",
      thumbnailAssetHash: "2".repeat(64),
      finalMediaPath: "locales/en/render/final.mp4",
      finalMediaHash: "3".repeat(64),
      finalMediaEvidencePath: "locales/en/final-media.json",
      finalMediaEvidenceHash: "4".repeat(64),
      qualityPath: "canonical/quality.json",
      qualityHash: "5".repeat(64),
      brandPolicyPath: "locales/en/brand-policy.json",
      brandPolicyHash: "6".repeat(64),
      channelId: "math-en",
      privacyStatus: "private",
      madeForKids: false,
      containsSyntheticMedia: true,
      playlistIdsByKey: Object.fromEntries(
        value.playlists.map((playlist) => [playlist.key, `id-${playlist.key}`])
      ),
      blockers: [
        "placeholder-teacher-artwork-not-approved-for-public-release",
      ],
    });
    expect(packet.blockers).toEqual([
      "placeholder-teacher-artwork-not-approved-for-public-release",
    ]);
    expect(packet).toMatchObject({
      privacyStatus: "private",
      dispatchAllowed: false,
      networkCalls: 0,
      mutations: 0,
    });
  });
});
