import { describe, expect, it } from "vitest";

import {
  buildLocalizationComparison,
  classifyReusedAssetLanguageDependency,
  computeSourceContentFingerprint,
  evaluateLocalizationPreflight,
  evaluateLocalizationRetryAdmission,
  evaluateSourceLinkageStale,
} from "./localization-derivative-lifecycle.js";

describe("localization derivative lifecycle", () => {
  it("rejects unsupported locale and variant combinations in preflight", () => {
    const result = evaluateLocalizationPreflight({
      supportedLocales: ["en"],
      supportedVariants: ["full"],
      targetLocale: "de",
      contentVariant: "short",
    });
    expect(result.admitted).toBe(false);
    expect(result.rejections.map((r) => r.code)).toEqual(
      expect.arrayContaining(["locale_not_supported", "variant_not_supported"])
    );
  });

  it("detects stale source linkage when revision or fingerprint changes", () => {
    expect(
      evaluateSourceLinkageStale({
        boundSourceRevision: 2,
        currentSourceRevision: 3,
        boundFingerprint: "a".repeat(64),
        currentFingerprint: "a".repeat(64),
      })
    ).toBe(true);
    expect(
      buildLocalizationComparison({
        derivativeId: "derivative-1",
        rootEpisodeId: "episode-root",
        derivativeEpisodeId: "episode-de",
        sourceEpisodeRevision: 1,
        currentSourceRevision: 2,
        sourceContentFingerprint: "a".repeat(64),
        currentSourceFingerprint: "b".repeat(64),
        targetLocale: "de",
        contentVariant: "full",
        reusedAssets: [],
        derivativeStatus: "in_progress",
        derivativeRevision: 0,
      }).sourceStale
    ).toBe(true);
  });

  it("classifies imagery as language-independent and captions as locale-specific", () => {
    expect(
      classifyReusedAssetLanguageDependency({
        mimeType: "image/png",
        role: "scene",
      })
    ).toBe(true);
    expect(
      classifyReusedAssetLanguageDependency({
        mimeType: "text/vtt",
        role: "caption",
      })
    ).toBe(false);
  });

  it("allows retry for failed derivatives", () => {
    expect(
      evaluateLocalizationRetryAdmission({ status: "failed" }).allowed
    ).toBe(true);
    expect(
      evaluateLocalizationRetryAdmission({ status: "ready" }).allowed
    ).toBe(false);
  });

  it("fingerprints source content deterministically", () => {
    const a = computeSourceContentFingerprint({
      episodeId: "episode-1",
      revision: 1,
      content: { title: "Root" },
    });
    const b = computeSourceContentFingerprint({
      episodeId: "episode-1",
      revision: 1,
      content: { title: "Root" },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/u);
  });
});
