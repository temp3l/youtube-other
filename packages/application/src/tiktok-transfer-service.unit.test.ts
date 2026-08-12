import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FixtureTikTokTransferChunkConstraintsPort,
  computeLocalFileContentHash,
} from "@mediaforge/tiktok-publishing";

import { TikTokTransferApplicationService } from "./tiktok-transfer-service.js";

const PLANNED_AT = "2026-08-12T06:20:00.000Z";

const testConstraints = {
  minChunkBytes: 64,
  maxChunkBytes: 256,
  preferredChunkBytes: 128,
} as const;

describe("TikTok transfer application service", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("persists FILE_UPLOAD plans and bounded streaming evidence", async () => {
    const payload = Buffer.from("tiktok-transfer-application-stream-fixture");
    const contentHash = computeLocalFileContentHash(payload);
    tempDir = await mkdtemp(join(tmpdir(), "tiktok-transfer-app-"));
    const filePath = join(tempDir, "render.mp4");
    await writeFile(filePath, payload);

    const savedPlans = [];
    const savedEvidence = [];
    const service = new TikTokTransferApplicationService({
      constraintsPort: new FixtureTikTokTransferChunkConstraintsPort(testConstraints),
      port: {
        saveTransferPlan: ({ plan }) => {
          savedPlans.push(plan);
          return plan;
        },
        saveTransferByteEvidence: ({ evidence }) => {
          savedEvidence.push(evidence);
          return evidence;
        },
      },
    });

    const plan = service.planLocalFileUpload({
      source: {
        relativePath: "renders/en-US/e001-final.mp4",
        mimeType: "video/mp4",
        byteLength: payload.byteLength,
        contentHash,
      },
      plannedAt: PLANNED_AT,
    });
    expect(plan.mode).toBe("FILE_UPLOAD");
    expect(savedPlans).toHaveLength(1);

    const evidence = await service.streamLocalFileUpload({
      filePath,
      plan,
      maxReadBufferBytes: 256,
      streamedAt: PLANNED_AT,
    });
    expect(evidence.streamedBytes).toBe(payload.byteLength);
    expect(savedEvidence).toHaveLength(1);
  });

  it("fails closed on PULL_FROM_URL without verified configuration", () => {
    const service = new TikTokTransferApplicationService({
      constraintsPort: new FixtureTikTokTransferChunkConstraintsPort(testConstraints),
      port: {
        saveTransferPlan: ({ plan }) => plan,
        saveTransferByteEvidence: ({ evidence }) => evidence,
      },
    });

    const eligibility = service.evaluatePullFromUrlEligibility({
      source: {
        relativePath: "renders/en-US/e001-final.mp4",
        mimeType: "video/mp4",
        byteLength: 512,
        contentHash: "d".repeat(64),
      },
      sourceUrl: "https://evil.example.net/render.mp4",
      domainConfiguration: null,
      evaluatedAt: PLANNED_AT,
    });
    expect(eligibility.eligible).toBe(false);
  });
});
