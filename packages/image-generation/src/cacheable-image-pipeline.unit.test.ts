import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashFile } from "@mediaforge/shared";
import {
  groupCacheableSceneRequests,
  ensureProviderReferenceAsset,
  imageGenerationIdentityHash,
  readImageResultCache,
  referenceBundleHash,
  registerProviderReferenceAsset,
  resolveDependencyPlan,
  routeImageRepair,
  writeImageResultCache,
  type ReferenceBundleIdentity,
} from "./cacheable-image-pipeline.js";

const bundle: ReferenceBundleIdentity = {
  orderedReferenceHashes: ["a".repeat(64), "b".repeat(64)],
  referenceRoles: ["character", "entity"],
  detail: "high",
  inputFidelity: "high",
  visualBibleVersion: "visual-v2",
  promptVersion: "scene-v5",
};

describe("cacheable image pipeline", () => {
  it("hashes ordered reference bundles and complete generation identities", () => {
    expect(referenceBundleHash(bundle)).not.toBe(
      referenceBundleHash({
        ...bundle,
        orderedReferenceHashes: [...bundle.orderedReferenceHashes].reverse(),
      })
    );
    const base = {
      operation: "scene-image" as const,
      format: "full" as const,
      promptVersion: "scene-v5",
      visualBibleVersion: "visual-v2",
      schemaVersion: "image-record-v1",
      validatorVersion: "image-validator-v2",
      model: "gpt-image-2",
      quality: "high",
      size: "1920x1080",
      stablePromptHash: "s",
      dynamicPromptHash: "d",
      orderedReferenceHashes: bundle.orderedReferenceHashes,
      orderedReferenceRoles: bundle.referenceRoles,
    };
    expect(imageGenerationIdentityHash(base)).not.toBe(
      imageGenerationIdentityHash({ ...base, validatorVersion: "image-validator-v3" })
    );
  });

  it("groups scenes by identical ordered references and cache dimensions", () => {
    const common = {
      model: "gpt-image-2",
      operation: "scene-image" as const,
      format: "full" as const,
      size: "1920x1080",
      aspectBucket: "16x9",
      promptFamily: "scene",
      promptVersion: "v5",
      referenceBundle: bundle,
      cacheShard: 0,
    };
    const groups = groupCacheableSceneRequests([
      { ...common, id: "scene-02" },
      { ...common, id: "scene-01" },
      { ...common, id: "scene-03", referenceBundle: { ...bundle, detail: "low" } },
    ]);
    expect(groups.size).toBe(2);
    expect([...groups.values()].map((items) => items.map((item) => item.id))).toContainEqual([
      "scene-01",
      "scene-02",
    ]);
  });

  it("blocks only nodes with unresolved dependencies", () => {
    const plan = resolveDependencyPlan({
      nodes: [
        { id: "ref-a", kind: "reference-image", dependsOn: [] },
        { id: "ref-b", kind: "reference-image", dependsOn: [] },
        { id: "scene-a", kind: "scene-image", dependsOn: ["ref-a"] },
        { id: "scene-b", kind: "scene-image", dependsOn: ["ref-b"] },
      ],
      statuses: { "ref-a": "failed", "ref-b": "completed" },
    });
    expect(plan.ready.map((node) => node.id)).toContain("scene-b");
    expect(plan.blocked.map((entry) => entry.node.id)).toContain("scene-a");
  });

  it("routes bounded targeted repairs", () => {
    expect(
      routeImageRepair({
        mechanicalOnly: false,
        wrongSubject: false,
        wrongComposition: false,
        continuityMismatch: true,
        attempt: 1,
        maxAttempts: 3,
      })
    ).toBe("targeted-repair");
    expect(
      routeImageRepair({
        mechanicalOnly: false,
        wrongSubject: true,
        wrongComposition: false,
        continuityMismatch: false,
        attempt: 3,
        maxAttempts: 3,
      })
    ).toBe("blocked");
  });

  it("reuses a provider file id for the same content hash", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-ref-"));
    const localPath = path.join(root, "reference.png");
    const registryPath = path.join(root, "registry.json");
    await fs.writeFile(localPath, "valid fixture bytes");
    const contentHash = await hashFile(localPath);
    await registerProviderReferenceAsset({
      registryPath,
      asset: {
        logicalId: "char-a",
        localPath,
        contentHash,
        mimeType: "image/png",
        width: 10,
        height: 10,
        provider: "openai",
        providerFileId: "file-123",
      },
    });
    const result = await registerProviderReferenceAsset({
      registryPath,
      asset: {
        logicalId: "char-a-copy",
        localPath,
        contentHash,
        mimeType: "image/png",
        width: 10,
        height: 10,
        provider: "openai",
      },
    });
    expect(result.find((entry) => entry.logicalId === "char-a-copy")?.providerFileId).toBe(
      "file-123"
    );
  });

  it("re-uploads an expired provider reference id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-expired-ref-"));
    const localPath = path.join(root, "reference.png");
    const registryPath = path.join(root, "registry.json");
    await fs.writeFile(localPath, "valid fixture bytes");
    const contentHash = await hashFile(localPath);
    await registerProviderReferenceAsset({
      registryPath,
      asset: {
        logicalId: "char-a",
        localPath,
        contentHash,
        mimeType: "image/png",
        width: 10,
        height: 10,
        provider: "openai",
        providerFileId: "file-expired",
      },
    });
    const registered = await ensureProviderReferenceAsset({
      registryPath,
      asset: {
        logicalId: "char-a",
        localPath,
        contentHash,
        mimeType: "image/png",
        width: 10,
        height: 10,
      },
      client: {
        validateReferenceFile: async () => false,
        uploadReferenceFile: async () => ({ fileId: "file-new" }),
      },
      now: () => new Date("2026-07-11T12:00:00.000Z"),
    });
    expect(registered.providerFileId).toBe("file-new");
    expect(registered.uploadedAt).toBe("2026-07-11T12:00:00.000Z");
  });

  it("reuses only valid content-addressed image artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-cache-"));
    const artifactPath = path.join(root, "scene.png");
    const cachePath = path.join(root, "cache", "scene.json");
    await fs.writeFile(artifactPath, "image bytes");
    const identity = {
      operation: "scene-image" as const,
      format: "full" as const,
      promptVersion: "scene-v5",
      visualBibleVersion: "visual-v2",
      schemaVersion: "record-v1",
      validatorVersion: "validator-v2",
      model: "gpt-image-2",
      quality: "high",
      size: "1920x1080",
      stablePromptHash: "stable",
      dynamicPromptHash: "dynamic",
      orderedReferenceHashes: bundle.orderedReferenceHashes,
      orderedReferenceRoles: bundle.referenceRoles,
    };
    await writeImageResultCache({
      cachePath,
      identity,
      artifactPath,
      validatedBy: "validator-v2",
    });
    expect((await readImageResultCache({ cachePath, identity })).state).toBe("hit");
    expect(
      (
        await readImageResultCache({
          cachePath,
          identity: { ...identity, promptVersion: "scene-v6" },
        })
      ).state
    ).toBe("stale");
    await fs.writeFile(artifactPath, "corrupted bytes");
    expect((await readImageResultCache({ cachePath, identity })).state).toBe("invalid");
  });
});
