import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hashFile } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";

import { loadCurriculumRelease } from "../curriculum/release.js";
import { createReviewedMetadataContext } from "../metadata/math-metadata.js";
import { loadPrivateOwnerAttestation } from "../review/private-owner-attestation.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  verifyCanonicalPrivateMediaEvidenceFiles,
} from "./canonical-task-adapters.js";

const curriculumRoot = path.resolve(
  "packages/math-education/data/curriculum/v1"
);
const attestationPath = path.resolve(
  "packages/math-education/data/reviews/v1/private-owner-attestation.json"
);

describe("canonical private media", () => {
  it("authorizes metadata only through the registered exact owner attestation", async () => {
    const [curriculum, attestation] = await Promise.all([
      loadCurriculumRelease(curriculumRoot),
      loadPrivateOwnerAttestation(attestationPath),
    ]);
    expect(
      createReviewedMetadataContext(curriculum, "M5-ZO-001", attestation)
        .rolloutCapability.status
    ).toBe("owner-attested-private");
    expect(() =>
      createReviewedMetadataContext(curriculum, "M5-ZO-001")
    ).toThrow(/not reviewed/u);
  });

  it("rejects a corrupted media descendant during cache verification", async () => {
    const unitRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "canonical-private-media-")
    );
    const relativePaths = [
      "locales/de/audio/narration.wav",
      "locales/de/render/final.mp4",
      "locales/de/thumbnail.svg",
      "locales/de/thumbnail.svg.manifest.json",
      "locales/de/brand-policy.json",
    ] as const;
    for (const [index, relativePath] of relativePaths.entries()) {
      const absolutePath = path.join(unitRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, `private-media-${index}`);
    }
    const file = async (relativePath: (typeof relativePaths)[number]) => {
      const absolutePath = path.join(unitRoot, relativePath);
      return {
        relativePath,
        sha256: await hashFile(absolutePath),
        byteLength: (await fs.stat(absolutePath)).size,
      };
    };
    const payload = {
      artifactVersion: "math-canonical-private-media.v1" as const,
      identity: {
        lessonId: "m5-zo-001-standard",
        skillId: "M5-ZO-001",
        language: "de" as const,
        variant: "standard" as const,
      },
      provider: {
        mode: "fixture-mock" as const,
        calls: 0 as const,
        characters: 0 as const,
        retries: 0 as const,
        latencyMs: 0 as const,
        costMicros: 0 as const,
      },
      audio: {
        ...(await file(relativePaths[0])),
        durationSeconds: 240,
        codec: "pcm_s16le" as const,
        quality: {
          kind: "test-tone" as const,
          audibleNarration: false as const,
          probesPassed: false as const,
        },
      },
      video: {
        ...(await file(relativePaths[1])),
        validation: {
          valid: true as const,
          width: 1920 as const,
          height: 1080 as const,
          fps: 30 as const,
          durationSeconds: 240,
          videoCodec: "h264" as const,
          audioCodec: "aac",
          continuityChecked: true as const,
          corruptionScanPassed: true as const,
        },
      },
      thumbnail: {
        ...(await file(relativePaths[2])),
        width: 1920 as const,
        height: 1080 as const,
        factId: "fact-one",
        factSemanticHash: "1".repeat(64),
      },
      thumbnailManifest: await file(relativePaths[3]),
      brandPolicy: await file(relativePaths[4]),
      captions: {
        count: 9 as const,
        contentHash: "2".repeat(64),
        rendered: true as const,
      },
      visualPlanHash: "3".repeat(64),
      timingHash: "4".repeat(64),
      renderFingerprint: "5".repeat(64),
      visualPresentation: {
        strategy: "progressive-chalk-reveal" as const,
        rendererVersion: "math-semantic-chalk.v2" as const,
      },
      publication: {
        visibility: "private" as const,
        publicReady: false as const,
        blockers: ["private-only"],
      },
    };
    const evidence = { ...payload, contentHash: canonicalHash(payload) };
    await expect(
      verifyCanonicalPrivateMediaEvidenceFiles(unitRoot, evidence)
    ).resolves.toMatchObject({
      provider: { calls: 0, costMicros: 0 },
      audio: { quality: { audibleNarration: false, probesPassed: false } },
    });
    await fs.writeFile(path.join(unitRoot, relativePaths[1]), "corrupted");
    await expect(
      verifyCanonicalPrivateMediaEvidenceFiles(unitRoot, evidence)
    ).rejects.toThrow(/byte length|hash/u);
  });
});
