import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, afterEach } from "vitest";

import {
  FixtureTikTokTransferChunkConstraintsPort,
  TikTokTransferPlanningService,
  computeLocalFileContentHash,
  streamTikTokFileUploadPlan,
} from "./tiktok-transfer-planning-service.js";

const PLANNED_AT = "2026-08-12T06:10:00.000Z";

const testConstraints = {
  minChunkBytes: 100,
  maxChunkBytes: 500,
  preferredChunkBytes: 250,
} as const;

describe("TikTok transfer planning and streaming", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("plans FILE_UPLOAD chunks and streams bounded byte evidence", async () => {
    const payload = Buffer.alloc(725, 0x7a);
    const contentHash = computeLocalFileContentHash(payload);
    tempDir = await mkdtemp(join(tmpdir(), "tiktok-transfer-"));
    const filePath = join(tempDir, "render.mp4");
    await writeFile(filePath, payload);

    const service = new TikTokTransferPlanningService({
      constraintsPort: new FixtureTikTokTransferChunkConstraintsPort(testConstraints),
    });
    const plan = service.planFileUpload({
      source: {
        relativePath: "renders/en-US/e001-final.mp4",
        mimeType: "video/mp4",
        byteLength: payload.byteLength,
        contentHash,
      },
      plannedAt: PLANNED_AT,
    });

    expect(plan.mode).toBe("FILE_UPLOAD");
    expect(plan.chunks).toHaveLength(3);

    const delivered: number[] = [];
    const evidence = await streamTikTokFileUploadPlan({
      filePath,
      plan,
      maxReadBufferBytes: 500,
      streamedAt: PLANNED_AT,
      deliverChunk: async (chunk) => {
        delivered.push(chunk.byteLength);
      },
    });

    expect(delivered).toEqual([250, 250, 225]);
    expect(evidence.streamedBytes).toBe(725);
    expect(evidence.chunkEvidence).toHaveLength(3);
    expect(evidence.chunkEvidence.every((entry) => entry.chunkHash.length === 64)).toBe(
      true
    );
  });

  it("rejects PULL_FROM_URL without verified operator-owned HTTPS configuration", () => {
    const service = new TikTokTransferPlanningService({
      constraintsPort: new FixtureTikTokTransferChunkConstraintsPort(testConstraints),
    });
    const source = {
      relativePath: "renders/en-US/e001-final.mp4",
      mimeType: "video/mp4",
      byteLength: 1024,
      contentHash: "b".repeat(64),
    };

    const eligibility = service.evaluatePullFromUrl({
      source,
      sourceUrl: "https://untrusted.example.net/render.mp4",
      domainConfiguration: null,
      evaluatedAt: PLANNED_AT,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonCode).toBe("VERIFIED_DOMAIN_CONFIGURATION_MISSING");

    expect(() =>
      service.planPullFromUrl({
        source,
        sourceUrl: "https://untrusted.example.net/render.mp4",
        domainConfiguration: {
          configurationId: "pull-domain.cdn.example",
          verifiedDomain: "cdn.example.com",
          operatorOwned: true,
          tiktokVerified: true,
          httpsOnly: true,
          active: true,
          recordedAt: PLANNED_AT,
        },
        plannedAt: PLANNED_AT,
      })
    ).toThrow(/verified operator-owned HTTPS configuration/u);
  });

  it("prepares PULL_FROM_URL eligibility without live transfer", () => {
    const service = new TikTokTransferPlanningService({
      constraintsPort: new FixtureTikTokTransferChunkConstraintsPort(testConstraints),
    });
    const source = {
      relativePath: "renders/en-US/e001-final.mp4",
      mimeType: "video/mp4",
      byteLength: 1024,
      contentHash: "c".repeat(64),
    };

    const plan = service.planPullFromUrl({
      source,
      sourceUrl: "https://media.cdn.example.com/render.mp4",
      domainConfiguration: {
        configurationId: "pull-domain.cdn.example",
        verifiedDomain: "cdn.example.com",
        operatorOwned: true,
        tiktokVerified: true,
        httpsOnly: true,
        active: true,
        recordedAt: PLANNED_AT,
      },
      plannedAt: PLANNED_AT,
    });

    expect(plan.mode).toBe("PULL_FROM_URL");
    expect(plan.pullFromUrl?.verifiedDomainConfigurationId).toBe(
      "pull-domain.cdn.example"
    );
    expect(plan.chunks).toHaveLength(1);
  });
});
