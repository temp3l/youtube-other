import { describe, expect, it } from "vitest";

import {
  assertChunkPlanCoversExactBytes,
  buildTikTokFileUploadTransferPlan,
  buildTikTokPullFromUrlTransferPlan,
  evaluatePullFromUrlEligibility,
  planTikTokFileUploadChunks,
  resolveTikTokTransferMode,
  TikTokTransferPolicyViolationError,
} from "./tiktok-transfer-lifecycle.js";

const PLANNED_AT = "2026-08-12T06:00:00.000Z";

const testConstraints = {
  minChunkBytes: 100,
  maxChunkBytes: 500,
  preferredChunkBytes: 250,
} as const;

function artifact(byteLength: number, contentHash = "a".repeat(64)) {
  return {
    relativePath: "renders/en-US/e001-final.mp4",
    mimeType: "video/mp4",
    byteLength,
    contentHash,
  };
}

function verifiedDomainConfig() {
  return {
    configurationId: "pull-domain.cdn.example",
    verifiedDomain: "cdn.example.com",
    operatorOwned: true as const,
    tiktokVerified: true as const,
    httpsOnly: true as const,
    active: true,
    recordedAt: PLANNED_AT,
  };
}

describe("tiktok transfer lifecycle", () => {
  it("defaults local render artifacts to FILE_UPLOAD", () => {
    expect(
      resolveTikTokTransferMode({
        source: artifact(1024),
      })
    ).toBe("FILE_UPLOAD");
  });

  it("plans contiguous chunks that cover exact immutable bytes", () => {
    const chunks = planTikTokFileUploadChunks({
      totalBytes: 725,
      constraints: testConstraints,
    });
    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        byteStart: 0,
        byteEndExclusive: 250,
        byteLength: 250,
      },
      {
        chunkIndex: 1,
        byteStart: 250,
        byteEndExclusive: 500,
        byteLength: 250,
      },
      {
        chunkIndex: 2,
        byteStart: 500,
        byteEndExclusive: 725,
        byteLength: 225,
      },
    ]);
    expect(() =>
      assertChunkPlanCoversExactBytes({
        totalBytes: 725,
        chunks,
        constraints: testConstraints,
      })
    ).not.toThrow();
  });

  it("builds a FILE_UPLOAD transfer plan for local files", () => {
    const plan = buildTikTokFileUploadTransferPlan({
      source: artifact(725),
      constraints: testConstraints,
      plannedAt: PLANNED_AT,
    });
    expect(plan.mode).toBe("FILE_UPLOAD");
    expect(plan.totalBytes).toBe(725);
    expect(plan.chunks.at(-1)?.byteEndExclusive).toBe(725);
    expect(plan.pullFromUrl).toBeUndefined();
  });

  it("fails closed for PULL_FROM_URL without verified operator-owned HTTPS configuration", () => {
    const eligibility = evaluatePullFromUrlEligibility({
      sourceUrl: "http://cdn.example.com/renders/e001.mp4",
      artifactContentHash: "a".repeat(64),
      expectedContentHash: "a".repeat(64),
      domainConfiguration: verifiedDomainConfig(),
      evaluatedAt: PLANNED_AT,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonCode).toBe("SOURCE_URL_NOT_HTTPS");

    expect(() =>
      buildTikTokPullFromUrlTransferPlan({
        source: artifact(1024),
        sourceUrl: "https://evil.example.net/renders/e001.mp4",
        domainConfiguration: verifiedDomainConfig(),
        constraints: testConstraints,
        plannedAt: PLANNED_AT,
      })
    ).toThrow(TikTokTransferPolicyViolationError);
  });

  it("accepts verified-domain PULL_FROM_URL eligibility without live transfer", () => {
    const eligibility = evaluatePullFromUrlEligibility({
      sourceUrl: "https://media.cdn.example.com/renders/e001.mp4",
      artifactContentHash: "a".repeat(64),
      expectedContentHash: "a".repeat(64),
      domainConfiguration: verifiedDomainConfig(),
      evaluatedAt: PLANNED_AT,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.verifiedDomainConfigurationId).toBe("pull-domain.cdn.example");

    const plan = buildTikTokPullFromUrlTransferPlan({
      source: artifact(1024),
      sourceUrl: "https://media.cdn.example.com/renders/e001.mp4",
      domainConfiguration: verifiedDomainConfig(),
      constraints: testConstraints,
      plannedAt: PLANNED_AT,
    });
    expect(plan.mode).toBe("PULL_FROM_URL");
    expect(plan.pullFromUrl?.sourceUrl).toBe(
      "https://media.cdn.example.com/renders/e001.mp4"
    );
  });
});
