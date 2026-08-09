import { describe, expect, it } from "vitest";

import { redactContentReuseAuditPayload } from "./content-reuse-contracts.js";
import {
  buildAssetReferenceAttachment,
  buildEpisodeCloneResult,
  buildProductionTemplateApplyResult,
  buildProductionTemplateBinding,
  cloneEpisodeContent,
  evaluateAssetReuseEligibility,
  projectAssetDescriptor,
  projectProductionTemplateRecord,
  resolvePinnedTemplateSnapshot,
} from "./content-reuse-lifecycle.js";

const evaluatedAt = "2026-08-09T12:00:00.000Z";

function assetDescriptor(
  overrides: Partial<{
    assetId: string;
    lifecycle: string;
    provenance: string;
  }> = {}
) {
  return projectAssetDescriptor({
    assetId: overrides.assetId ?? "asset-1",
    mimeType: "image/png",
    bytes: 1024,
    sha256: "a".repeat(64),
    lifecycle: overrides.lifecycle ?? "active",
    provenance:
      overrides.provenance ??
      JSON.stringify({ ownerProjectId: "project-source", sharingScope: "project" }),
    ownerProjectId: "project-source",
  });
}

describe("content reuse lifecycle", () => {
  it("omits prohibited and revoked assets during clone", () => {
    const prohibited = assetDescriptor({
      assetId: "asset-prohibited",
      lifecycle: "prohibited",
    });
    const revoked = assetDescriptor({
      assetId: "asset-revoked",
      lifecycle: "revoked",
    });
    const permitted = assetDescriptor({ assetId: "asset-ok" });
    const { content, omittedAssets } = cloneEpisodeContent({
      sourceContent: {
        type: "dark_truth",
        version: "1",
        premise: "test",
        storyBibleId: "bible-1",
        referenceAssetIds: [
          "asset-ok",
          "asset-prohibited",
          "asset-revoked",
        ],
      },
      sourceProjectId: "project-source",
      targetProjectId: "project-source",
      assetCatalog: {
        [prohibited.assetId]: prohibited,
        [revoked.assetId]: revoked,
        [permitted.assetId]: permitted,
      },
      copyPolicy: "content_and_permitted_assets",
    });
    expect((content as { referenceAssetIds: string[] }).referenceAssetIds).toEqual([
      "asset-ok",
    ]);
    expect(omittedAssets).toEqual([
      { assetId: "asset-prohibited", reason: "asset_prohibited" },
      { assetId: "asset-revoked", reason: "asset_revoked" },
    ]);
  });

  it("reports reset runtime identity on clone results", () => {
    const result = buildEpisodeCloneResult({
      episodeId: "episode-new",
      revision: 0,
      omittedAssets: [],
    });
    expect(result.resetRuntimeIdentity).toBe(true);
    expect(result.id).toBe("episode-new");
  });

  it("keeps pinned template snapshots stable when the template advances", () => {
    const template = projectProductionTemplateRecord({
      workspaceId: "workspace-1",
      templateId: "template-1",
      name: "History defaults",
      profile: "history",
      revision: 1,
      snapshot: {
        profile: "history",
        configDefaults: { format: "standard" },
      },
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    });
    const binding = buildProductionTemplateBinding({
      template,
      pinnedRevision: 1,
      appliedAt: evaluatedAt,
    });
    const advanced = projectProductionTemplateRecord({
      ...template,
      revision: 3,
      snapshot: {
        profile: "history",
        configDefaults: { format: "long" },
      },
      updatedAt: "2026-08-10T12:00:00.000Z",
    });
    expect(
      resolvePinnedTemplateSnapshot({ binding, currentTemplate: advanced })
    ).toEqual({
      profile: "history",
      configDefaults: { format: "standard" },
    });
    expect(
      buildProductionTemplateApplyResult({ binding }).resolvedSnapshot
    ).toEqual(binding.appliedSnapshot);
  });

  it("references immutable asset hash and provenance on attachment", () => {
    const asset = assetDescriptor();
    const reference = buildAssetReferenceAttachment({
      asset,
      attachmentKey: "attach-1",
      createdAt: evaluatedAt,
    });
    expect(reference.sha256).toBe(asset.sha256);
    expect(reference.provenance).toBe(asset.provenance);
    expect(reference.mode).toBe("reference");
  });

  it("supports copy-on-write attachment mode when requested", () => {
    const asset = assetDescriptor();
    const eligibility = evaluateAssetReuseEligibility({
      asset,
      sourceProjectId: "project-source",
      targetProjectId: "project-source",
      requestedMode: "copy_on_write",
    });
    expect(eligibility).toMatchObject({ eligible: true, mode: "copy_on_write" });
    const reference = buildAssetReferenceAttachment({
      asset,
      attachmentKey: "attach-copy",
      mode: "copy_on_write",
      createdAt: evaluatedAt,
    });
    expect(reference.mode).toBe("copy_on_write");
  });

  it("redacts provenance and hash fields from audit payloads", () => {
    expect(
      redactContentReuseAuditPayload({
        sourceEpisodeId: "episode-1",
        sha256: "hidden",
        provenance: "hidden",
      })
    ).toEqual({ sourceEpisodeId: "episode-1" });
  });
});
