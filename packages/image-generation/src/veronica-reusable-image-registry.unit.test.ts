import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findVeronicaCrossEpisodeReuse,
  materializeVeronicaReusableImage,
  registerVeronicaReusableImage,
  resolveVeronicaReusableImageRegistryPath,
  type VeronicaReusableImageSemanticsV1,
} from "./veronica-reusable-image-registry.js";

function semantics(overrides: Partial<VeronicaReusableImageSemanticsV1> = {}): VeronicaReusableImageSemanticsV1 {
  return {
    visualIntent: "calm strategic reflection", semanticBeat: "considering options", subjectArchetypes: ["professional"], actions: ["thinking"],
    settingArchetype: "quiet office", compositionArchetype: "medium portrait", evidenceMode: "illustrative", aspectRatio: "16:9", visualContractVersion: "veronica-v1",
    containsVisibleText: false, containsEpisodeSpecificText: false, containsNamedPerson: false, containsNamedBrand: false, usesReferenceImage: false,
    localizationSensitive: false, continuitySensitive: false, identitySensitive: false, uniqueEvidence: false, uniqueProductIdentity: false, materialEditingMask: false,
    occupationNeutral: true, occupationCues: [], permittedOccupationCues: [], reuseEligibility: "eligible", ...overrides,
  };
}

async function registered(root: string, overrides: Partial<VeronicaReusableImageSemanticsV1> = {}) {
  const source = path.join(root, "assets", "source.png");
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, "image bytes");
  const asset = await registerVeronicaReusableImage({ registryPath: resolveVeronicaReusableImageRegistryPath(root), workspaceRoot: root, sourcePath: source, descriptor: { ...semantics(overrides), assetId: "asset-a", sourceEpisodeId: "episode-a", sourceSceneId: "scene-a", generationFingerprint: "generation-a" } });
  if (!asset) throw new Error("test asset was unexpectedly ineligible");
  return asset;
}

describe("Veronica reusable image registry", () => {
  it("selects structured semantic equivalents independently of wording and copies with provenance", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "veronica-registry-"));
    const asset = await registered(root);
    const decision = await findVeronicaCrossEpisodeReuse({ registryPath: resolveVeronicaReusableImageRegistryPath(root), workspaceRoot: root, target: { ...semantics({ visualIntent: "calm reflection on strategic choices" }), episodeId: "episode-b", sceneId: "scene-b", sceneIndex: 3 }, usedAssetIds: new Set(), reusedSceneIndexes: [], crossEpisodeReuseCount: 0 });
    expect(decision.kind).toBe("reuse");
    if (decision.kind !== "reuse") return;
    expect(decision.asset.assetId).toBe(asset.assetId);
    const provenance = await materializeVeronicaReusableImage({ workspaceRoot: root, asset: decision.asset, targetPath: path.join(root, "output", "scene-b.png"), targetEpisodeId: "episode-b", targetSceneId: "scene-b", compatibility: decision.reason });
    expect(provenance).toMatchObject({ kind: "CROSS_EPISODE_SEMANTIC_REUSE", materialization: "copy", sourceEpisodeId: "episode-a" });
  });

  it("fails closed for hard guards, diversity limits, force, stale files, and corrupt registries", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "veronica-registry-"));
    const asset = await registered(root);
    const args = { registryPath: resolveVeronicaReusableImageRegistryPath(root), workspaceRoot: root, target: { ...semantics(), episodeId: "episode-b", sceneId: "scene-b", sceneIndex: 3 }, usedAssetIds: new Set<string>(), reusedSceneIndexes: [] as number[], crossEpisodeReuseCount: 0 };
    await expect(findVeronicaCrossEpisodeReuse({ ...args, force: true })).resolves.toMatchObject({ kind: "generate", reason: "FORCED" });
    await expect(findVeronicaCrossEpisodeReuse({ ...args, target: { ...args.target, containsVisibleText: true } })).resolves.toMatchObject({ kind: "generate", reason: "TARGET_INELIGIBLE" });
    await expect(findVeronicaCrossEpisodeReuse({ ...args, target: { ...args.target, sceneIndex: 1 }, usedAssetIds: new Set([asset.assetId]) })).resolves.toMatchObject({ kind: "generate", reason: "NO_COMPATIBLE_CANDIDATE" });
    await fs.unlink(path.join(root, asset.relativePath));
    await expect(findVeronicaCrossEpisodeReuse(args)).resolves.toMatchObject({ kind: "generate", reason: "STALE_ASSET" });
    await fs.writeFile(args.registryPath, "not json");
    await expect(findVeronicaCrossEpisodeReuse(args)).resolves.toMatchObject({ kind: "generate", reason: "REGISTRY_INVALID" });
  });

  it("rejects occupation-proxy drift and contract/aspect mismatches", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "veronica-registry-"));
    await registered(root, { occupationNeutral: false, occupationCues: ["doctor stethoscope"] });
    const base = { registryPath: resolveVeronicaReusableImageRegistryPath(root), workspaceRoot: root, usedAssetIds: new Set<string>(), reusedSceneIndexes: [] as number[], crossEpisodeReuseCount: 0 };
    await expect(findVeronicaCrossEpisodeReuse({ ...base, target: { ...semantics(), episodeId: "episode-b", sceneId: "scene-b", sceneIndex: 3 } })).resolves.toMatchObject({ kind: "generate" });
    await expect(findVeronicaCrossEpisodeReuse({ ...base, target: { ...semantics({ aspectRatio: "9:16" }), episodeId: "episode-b", sceneId: "scene-b", sceneIndex: 3 } })).resolves.toMatchObject({ kind: "generate" });
  });
});
