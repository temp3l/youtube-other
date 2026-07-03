import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import {
  buildImageBatchCustomId,
  createImageBatchAssetIdentity,
  deriveImageBatchDestinationIdentity,
} from "./image-batch-identity.js";
import { normalizeImageBatchManifest } from "./image-batch-normalization.js";
import { prepareImageBatchForEpisode, planImageBatchForEpisode } from "./image-batch-planner.js";
import { readImageBatchManifest } from "./image-batch-storage.js";

function providerRequestHashForFixture(args: {
  readonly prompt: string;
  readonly model?: string;
  readonly requestedSize?: string;
  readonly quality?: string;
  readonly outputFormat?: string;
  readonly characterReferenceHashes?: readonly string[];
}): string {
  return hashText(
    JSON.stringify({
      operation: "image-generation",
      model: args.model ?? "gpt-image-2",
      prompt: args.prompt,
      n: 1,
      size: args.requestedSize ?? "1920x1088",
      quality: args.quality ?? "medium",
      outputFormat: args.outputFormat ?? "png",
      referenceImages: args.characterReferenceHashes ?? ["ref-hash"],
    })
  );
}

async function writeSceneManifest(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly prompt: string;
  readonly status: "generated" | "planned";
  readonly outputExists?: boolean;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
  readonly outputRelativePath?: string;
}): Promise<void> {
  const manifestsDir = path.join(
    args.episodeDir,
    "state",
    "image-generation",
    "manifests"
  );
  const promptsDir = path.join(
    args.episodeDir,
    "state",
    "image-generation",
    "prompts"
  );
  const imagesDir = path.join(
    args.episodeDir,
    "shared",
    "images",
    "generated"
  );
  await fs.mkdir(manifestsDir, { recursive: true });
  await fs.mkdir(promptsDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.writeFile(
    path.join(promptsDir, `${args.sceneId}.txt`),
    `${args.prompt}\n`
  );
  const outputRelativePath =
    args.outputRelativePath ??
    path.join(
      "shared",
      "images",
      "generated",
      `${args.sceneId}__000000-000004__16x9.png`
    );
  const outputPath = path.join(args.episodeDir, outputRelativePath);
  await fs.writeFile(
    path.join(manifestsDir, `${args.sceneId}.json`),
    JSON.stringify(
      {
        sceneId: args.sceneId,
        promptVersion: 1,
        ...(args.renderability ? { renderability: args.renderability } : {}),
        ...(args.reusedFromSceneId
          ? { reusedFromSceneId: args.reusedFromSceneId }
          : {}),
        finalPrompt: args.prompt,
        promptHash: "prompt-hash",
        providerRequestHash: providerRequestHashForFixture({
          prompt: args.prompt,
        }),
        materialDifferencesFromPrevious: [],
        characterIds: ["character-1"],
        referenceImages: [
          {
            characterId: "character-1",
            path: path.join(args.episodeDir, "ref.png"),
            sha256: "ref-hash",
          },
        ],
        model: "gpt-image-2",
        size: "1920x1088",
        quality: "medium",
        outputPath,
        status: args.status,
        attempts: 0,
      },
      null,
      2
    )
  );
  if (args.outputExists) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, "png");
  }
}

describe("image batch planner", () => {
  it("reuses cached scene images and prepares batch JSONL for uncached scenes", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-plan-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-001",
      prompt: "An opening hallway shot.",
      status: "generated",
      outputExists: true,
    });
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-002",
      prompt: "A figure in the doorway.",
      status: "planned",
    });

    const planned = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [
          { id: "scene-001", sequenceNumber: 1 },
          { id: "scene-002", sequenceNumber: 2 },
        ],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]?.skippedSceneIds).toEqual(["scene-001"]);
    expect(planned[0]?.scenePlans).toHaveLength(1);
    expect(planned[0]?.scenePlans[0]?.requestLine.url).toBe(
      "/v1/images/generations"
    );
    expect(planned[0]?.scenePlans[0]?.requestLine.body).toMatchObject({
      model: "gpt-image-2",
      prompt: "A figure in the doorway.",
      n: 1,
      size: "1920x1088",
      quality: "medium",
      output_format: "png",
    });
    expect(planned[0]?.scenePlans[0]?.requestLine.custom_id).toContain(
      "scene-002"
    );

    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [
          { id: "scene-001", sequenceNumber: 1 },
          { id: "scene-002", sequenceNumber: 2 },
        ],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    expect(prepared.writtenFiles).toHaveLength(2);
    const inputFile = await fs.readFile(
      prepared.groups[0]?.storagePlan.inputFilePath ?? "",
      "utf8"
    );
    const requestLine = JSON.parse(inputFile.trim()) as {
      readonly custom_id: string;
      readonly method: string;
      readonly url: string;
      readonly body: Record<string, unknown>;
    };
    expect(requestLine).toMatchObject({
      method: "POST",
      url: "/v1/images/generations",
      body: {
        model: "gpt-image-2",
        prompt: "A figure in the doorway.",
        n: 1,
        size: "1920x1088",
        quality: "medium",
        output_format: "png",
      },
    });
    expect(Object.keys(requestLine.body).sort()).toEqual([
      "model",
      "n",
      "output_format",
      "prompt",
      "quality",
      "size",
    ]);
    expect(inputFile).not.toContain("scene-001");
  });

  it("derives a stable full-scene identity from canonical v2 fields", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-identity-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-007",
      prompt: "A corridor with a recurring character.",
      status: "planned",
    });

    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "002-demo",
      scenePlan: {
        scenes: [{ id: "scene-007", sequenceNumber: 7 }],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    const group = prepared.groups[0];
    const scenePlan = group?.scenePlans[0];
    expect(scenePlan?.job.identity).toMatchObject({
      episodeId: "002-demo",
      language: "en",
      variant: "full",
      assetRole: "full-scene",
      operation: "generation",
      subject: { kind: "scene", id: "scene-007" },
      destination: {
        root: "shared-images-generated",
        relativePath:
          "shared/images/generated/scene-007__000000-000004__16x9.png",
      },
    });
    expect(scenePlan?.job.sceneId).toBe("scene-007");
    expect(scenePlan?.job.sceneIndex).toBe(7);
    expect(scenePlan?.manifestItem.identity.identityHash).toBe(
      scenePlan?.job.identity.identityHash
    );
    expect(scenePlan?.manifestItem.customId).toBe(
      scenePlan?.requestLine.custom_id
    );
    expect(scenePlan?.requestLine.custom_id.split(":").slice(0, 9)).toEqual([
      "dte-img",
      "v2",
      "002-demo",
      "en",
      "full",
      "full-scene",
      "generation",
      "scene",
      "scene-007",
    ]);
    const manifest = await readImageBatchManifest(
      group?.storagePlan.manifestPath ?? ""
    );
    expect(manifest?.schemaVersion).toBe("image-batch-v2");
    expect(manifest?.items[0]?.identity).toMatchObject({
      episodeId: "002-demo",
      language: "en",
      variant: "full",
    });
  });

  it("tracks reference hashes while current batch request lines omit reference image inputs", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-reference-gap-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-002",
      prompt: "A reference-assisted scene.",
      status: "planned",
    });

    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [{ id: "scene-002", sequenceNumber: 2 }],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    const group = prepared.groups[0];
    const scenePlan = group?.scenePlans[0];
    expect(scenePlan?.job.characterReferencePaths).toEqual([
      path.join(episodeDir, "ref.png"),
    ]);
    expect(scenePlan?.manifestItem.identity.dependencyHashes).toEqual([
      "ref-hash",
    ]);
    expect(scenePlan?.providerRequestHash).toBe(
      providerRequestHashForFixture({
        prompt: "A reference-assisted scene.",
        characterReferenceHashes: ["ref-hash"],
      })
    );
    expect(scenePlan?.requestLine.url).toBe("/v1/images/generations");
    expect(scenePlan?.requestLine.body).not.toHaveProperty("image");
    expect(scenePlan?.requestLine.body).not.toHaveProperty("images");
    expect(scenePlan?.requestLine.body).not.toHaveProperty("input_image");
    expect(scenePlan?.requestLine.body).not.toHaveProperty("reference_images");

    const inputFile = await fs.readFile(
      group?.storagePlan.inputFilePath ?? "",
      "utf8"
    );
    const requestLine = JSON.parse(inputFile.trim()) as {
      readonly url: string;
      readonly body: Record<string, unknown>;
    };
    expect(requestLine.url).toBe("/v1/images/generations");
    expect(requestLine.body).not.toHaveProperty("image");
    expect(requestLine.body).not.toHaveProperty("reference_images");
    expect(inputFile).not.toContain("ref-hash");
    expect(inputFile).not.toContain("ref.png");
  });

  it("supports localized full-scene identities without changing current request shape", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-localized-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-002",
      prompt: "A localized full scene.",
      status: "planned",
    });

    const planned = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
      options: {
        language: "de-DE",
      },
    });

    expect(planned[0]?.scenePlans[0]?.job.identity).toMatchObject({
      episodeId: "001-demo",
      language: "de",
      variant: "full",
      assetRole: "full-scene",
      subject: { kind: "scene", id: "scene-002" },
    });
    expect(planned[0]?.scenePlans[0]?.requestLine.url).toBe(
      "/v1/images/generations"
    );
  });

  it("builds short-scene and reference identities from canonical normalized fields", () => {
    const shortIdentity = createImageBatchAssetIdentity({
      episodeId: "001-demo",
      language: "en-US",
      variant: "short",
      assetRole: "short-scene",
      operation: "deterministic-transform",
      subject: { kind: "scene", id: "scene-009" },
      promptHash: "A".repeat(64),
      model: "sharp",
      size: "1080x1920",
      quality: "medium",
      dependencyHashes: ["b".repeat(64), "a".repeat(64), "b".repeat(64)],
      destination: {
        relativePath: "shared/short/images/generated/scene-009__000000-000008__9x16.png",
      },
    });
    expect(shortIdentity).toMatchObject({
      language: "en",
      variant: "short",
      assetRole: "short-scene",
      operation: "deterministic-transform",
      destination: {
        root: "shared-short-images-generated",
      },
      dependencyHashes: ["a".repeat(64), "b".repeat(64)],
    });

    const referenceIdentity = createImageBatchAssetIdentity({
      episodeId: "001-demo",
      language: "de",
      variant: "full",
      assetRole: "character-reference",
      operation: "edit",
      subject: { kind: "character", id: "daniel-mercer" },
      promptHash: "c".repeat(64),
      model: "gpt-image-2",
      size: "1536x1024",
      quality: "high",
      dependencyHashes: ["f".repeat(64)],
      destination: {
        relativePath: "shared/images/character-references/daniel-mercer.png",
      },
    });
    expect(referenceIdentity).toMatchObject({
      language: "de",
      variant: "full",
      assetRole: "character-reference",
      operation: "edit",
      subject: { kind: "character", id: "daniel-mercer" },
      destination: {
        root: "shared-character-references",
      },
    });
    expect(buildImageBatchCustomId(referenceIdentity).split(":").slice(0, 9)).toEqual([
      "dte-img",
      "v2",
      "001-demo",
      "de",
      "full",
      "character-reference",
      "edit",
      "character",
      "daniel-mercer",
    ]);
  });

  it("returns a no-op group when every selected scene is already reusable", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-noop-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-001",
      prompt: "A reused scene.",
      status: "generated",
      outputExists: true,
    });
    const planned = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [{ id: "scene-001", sequenceNumber: 1 }],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    expect(planned[0]?.scenePlans).toHaveLength(0);
    expect(planned[0]?.skippedSceneIds).toEqual(["scene-001"]);
  });

  it("plans a new batch request when provider settings change", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-provider-hash-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-001",
      prompt: "A reused scene.",
      status: "generated",
      outputExists: true,
    });

    const planned = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [{ id: "scene-001", sequenceNumber: 1 }],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "high",
        outputFormat: "png",
      },
    });

    expect(planned[0]?.skippedSceneIds).toEqual([]);
    expect(planned[0]?.scenePlans).toHaveLength(1);
    expect(planned[0]?.scenePlans[0]?.providerRequestHash).not.toBe(
      providerRequestHashForFixture({
        prompt: "A reused scene.",
      })
    );
  });

  it("propagates renderability and reuse provenance into planned batch jobs", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-renderability-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-002",
      prompt: "A merged abstract transition.",
      status: "planned",
      renderability: "mergeWithPrevious",
      reusedFromSceneId: "scene-001",
    });

    const planned = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [{ id: "scene-002", sequenceNumber: 2 }],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    expect(planned[0]?.scenePlans[0]?.job.renderability).toBe(
      "mergeWithPrevious"
    );
    expect(planned[0]?.scenePlans[0]?.job.reusedFromSceneId).toBe("scene-001");
    expect(planned[0]?.scenePlans[0]?.manifestItem.renderability).toBe(
      "mergeWithPrevious"
    );
    expect(planned[0]?.scenePlans[0]?.manifestItem.reusedFromSceneId).toBe(
      "scene-001"
    );
  });

  it("prepares scene plans in a deterministic identity order across repeated runs", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-deterministic-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-003",
      prompt: "Third scene.",
      status: "planned",
    });
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-001",
      prompt: "First scene.",
      status: "planned",
    });
    const scenePlan = {
      scenes: [
        { id: "scene-003", sequenceNumber: 3 },
        { id: "scene-001", sequenceNumber: 1 },
      ],
    };

    const first = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan,
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const second = await planImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan,
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });

    expect(first[0]?.scenePlans.map((item) => item.sceneId)).toEqual([
      "scene-001",
      "scene-003",
    ]);
    expect(first[0]?.scenePlans.map((item) => item.requestLine.custom_id)).toEqual(
      second[0]?.scenePlans.map((item) => item.requestLine.custom_id)
    );
    expect(
      first[0]?.scenePlans.map((item) => item.job.identity.identityHash)
    ).toEqual(second[0]?.scenePlans.map((item) => item.job.identity.identityHash));
  });

  it("rejects duplicate identities, custom ids, and destination paths during normalization", () => {
    const identity = createImageBatchAssetIdentity({
      episodeId: "001-demo",
      language: "en",
      variant: "full",
      assetRole: "full-scene",
      operation: "generation",
      subject: { kind: "scene", id: "scene-001" },
      promptHash: "d".repeat(64),
      model: "gpt-image-2",
      size: "1920x1088",
      quality: "medium",
      dependencyHashes: [],
      destination: {
        relativePath: "shared/images/generated/scene-001__000000-000004__16x9.png",
      },
    });
    const manifest = {
      schemaVersion: "image-batch-v2",
      category: "image-generation",
      localBatchId: "local-batch-0001",
      rootLocalBatchId: "local-batch-0001",
      retryNumber: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      endpoint: "/v1/images/generations",
      model: "gpt-image-2",
      completionWindow: "24h",
      inputFilePath: "/tmp/batch.jsonl",
      inputFileHash: "hash",
      status: "prepared",
      items: [
        {
          customId: buildImageBatchCustomId(identity),
          identity,
          sceneId: "scene-001",
          sceneIndex: 1,
          providerRequestHash: "provider-1",
          generationConfigurationHash: "config-1",
          expectedOutputPath: "/tmp/episode/shared/images/generated/scene-001__000000-000004__16x9.png",
          characterIds: [],
          requestedSize: "1920x1088",
          quality: "medium",
          outputFormat: "png",
          status: "planned",
        },
        {
          customId: buildImageBatchCustomId(identity),
          identity,
          sceneId: "scene-001-copy",
          sceneIndex: 2,
          providerRequestHash: "provider-2",
          generationConfigurationHash: "config-2",
          expectedOutputPath: "/tmp/episode/shared/images/generated/scene-001__000000-000004__16x9.png",
          characterIds: [],
          requestedSize: "1920x1088",
          quality: "medium",
          outputFormat: "png",
          status: "planned",
        },
      ],
    } as const;

    expect(() => normalizeImageBatchManifest(manifest)).toThrow(
      /Duplicate image batch identity|Duplicate image batch custom_id|Duplicate image batch destination path/u
    );
  });
});
