import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { StoryBatchIndexService } from "@mediaforge/story-localization";
import {
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeShortsImageManifestPath,
} from "@mediaforge/shared";
import {
  planReferenceImageBatchForEpisode,
  prepareImageBatchForEpisode,
  prepareShortSceneImageBatches,
} from "./image-batch-planner.js";
import {
  writeImageBatchInputFile,
  readImageBatchManifest,
  type ImageBatchStoragePlan,
  writeImageBatchManifest,
} from "./image-batch-storage.js";
import {
  type CharacterDefinition,
  upsertCharacterRegistry,
} from "./episode-image-pipeline.js";
import {
  importImageBatch,
  refreshImageBatch,
  retryFailedImageBatch,
  submitImageBatch,
  summarizeImageBatchState,
} from "./image-batch-service.js";

function makeCharacter(args: {
  readonly id?: string;
  readonly referenceStatus: CharacterDefinition["referenceStatus"];
  readonly referenceImagePath?: string;
}): CharacterDefinition {
  return {
    id: args.id ?? "character-1",
    name: "Daniel Mercer",
    role: "lead",
    physicalDescription: "Tall, pale, severe features.",
    ageRange: "30s",
    genderPresentation: "masculine",
    face: {
      shape: "angular",
      skinTone: "pale",
      eyeColor: "gray",
      eyebrows: "dark",
      nose: "straight",
      mouth: "thin",
      distinguishingFeatures: ["scar on left cheek"],
    },
    hair: {
      color: "dark brown",
      length: "short",
      style: "neat",
    },
    build: "lean",
    defaultWardrobe: {
      upperBody: "black coat",
      lowerBody: "dark trousers",
      footwear: "boots",
      accessories: [],
      carriedObjects: [],
      colors: ["black"],
    },
    continuityTraits: ["scar on left cheek"],
    ...(args.referenceImagePath
      ? { referenceImagePath: args.referenceImagePath }
      : {}),
    referenceStatus: args.referenceStatus,
  };
}

async function writeSceneManifest(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
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
    `Prompt for ${args.sceneId}.\n`
  );
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
        finalPrompt: `Prompt for ${args.sceneId}.`,
        promptHash: `hash-${args.sceneId}`,
        materialDifferencesFromPrevious: [],
        characterIds: [],
        referenceImages: [],
        model: "gpt-image-2",
        size: "1920x1088",
        quality: "medium",
        outputPath: path.join(
          args.episodeDir,
          "shared",
          "images",
          "generated",
          `${args.sceneId}.png`
        ),
        status: "planned",
        attempts: 0,
      },
      null,
      2
    )
  );
}

function makeClient() {
  return {
    files: {
      create: vi.fn(async () => ({ id: "file_1" })),
      content: vi.fn(async () => new Response("")),
    },
    batches: {
      create: vi.fn(async () => ({
        id: "batch_1",
        status: "validating",
        endpoint: "/v1/images/generations",
        input_file_id: "file_1",
        completion_window: "24h",
        created_at: 1,
        object: "batch",
      })),
      retrieve: vi.fn(async () => ({
        id: "batch_1",
        status: "completed",
        endpoint: "/v1/images/generations",
        input_file_id: "file_1",
        output_file_id: "file_out",
        completion_window: "24h",
        created_at: 1,
        completed_at: 2,
        request_counts: { total: 1, completed: 1, failed: 0 },
        object: "batch",
      })),
      cancel: vi.fn(),
    },
    responses: {
      create: vi.fn(),
    },
  };
}

async function makeBase64Image(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 20, b: 10, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return buffer.toString("base64");
}

function makeImportClient(args: {
  readonly outputText?: string;
  readonly errorText?: string;
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
}) {
  return {
    files: {
      create: vi.fn(async () => ({ id: "file_1" })),
      content: vi.fn(async (fileId: string) => ({
        text: async () =>
          fileId === "file_out"
            ? (args.outputText ?? "")
            : fileId === "file_err"
              ? (args.errorText ?? "")
              : "",
      })),
    },
    batches: {
      create: vi.fn(async () => ({
        id: "batch_1",
        status: "validating",
        endpoint: "/v1/images/generations",
        input_file_id: "file_1",
        completion_window: "24h",
        created_at: 1,
        object: "batch",
      })),
      retrieve: vi.fn(async () => ({
        id: "batch_1",
        status: "completed",
        endpoint: "/v1/images/generations",
        input_file_id: "file_1",
        output_file_id: "file_out",
        ...(args.errorText ? { error_file_id: "file_err" } : {}),
        completion_window: "24h",
        created_at: 1,
        completed_at: 2,
        request_counts: {
          total: args.total,
          completed: args.completed,
          failed: args.failed,
        },
        object: "batch",
      })),
      cancel: vi.fn(),
    },
    responses: {
      create: vi.fn(),
    },
  };
}

describe("image batch service", () => {
  it("normalizes legacy v1 image batch manifests into the v2 identity shape", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-v1-normalize-"));
    const manifestPath = path.join(tempDir, "batch-v1.manifest.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: "image-batch-v1",
          category: "image-generation",
          localBatchId: "local-batch-0001",
          rootLocalBatchId: "local-batch-0001",
          retryNumber: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          endpoint: "/v1/images/generations",
          model: "gpt-image-2",
          completionWindow: "24h",
          inputFilePath: path.join(tempDir, "batch.jsonl"),
          inputFileHash: "hash",
          status: "prepared",
          items: [
            {
              customId: "legacy-custom-id",
              episodeNumber: "001-demo",
              episodeSlug: "001-demo",
              language: "en",
              format: "full",
              sceneId: "scene-002",
              sceneIndex: 2,
              promptHash: "a".repeat(64),
              providerRequestHash: "b".repeat(64),
              generationConfigurationHash: "c".repeat(64),
              expectedOutputPath: path.join(
                tempDir,
                "episode",
                "shared",
                "images",
                "generated",
                "scene-002__000008-000016__16x9.png"
              ),
              characterIds: ["character-1"],
              characterReferenceHashes: ["d".repeat(64), "e".repeat(64)],
              requestedSize: "1920x1088",
              quality: "medium",
              outputFormat: "png",
              status: "planned",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const manifest = await readImageBatchManifest(manifestPath);

    expect(manifest?.schemaVersion).toBe("image-batch-v2");
    expect(manifest?.items[0]?.identity).toMatchObject({
      episodeId: "001-demo",
      language: "en",
      variant: "full",
      assetRole: "full-scene",
      operation: "generation",
      subject: { kind: "scene", id: "scene-002" },
      dependencyHashes: ["d".repeat(64), "e".repeat(64)],
      destination: {
        root: "shared-images-generated",
        relativePath:
          "shared/images/generated/scene-002__000008-000016__16x9.png",
      },
    });
    expect(manifest?.items[0]?.customId).toMatch(/^dte-img:v2:/u);
  });

  it("submits and refreshes an image batch while updating the shared index", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-service-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
    };
    const client = makeClient();
    const submitted = await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    expect(submitted.openAIBatchId).toBe("batch_1");

    const manifestAfterSubmit = await readImageBatchManifest(
      group.storagePlan.manifestPath
    );
    expect(manifestAfterSubmit?.status).toBe("submitted");
    expect(manifestAfterSubmit?.openAIBatchId).toBe("batch_1");

    const refreshed = await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    expect(refreshed.status).toBe("completed");
    expect(refreshed.outputFileId).toBe("file_out");

    const index = new StoryBatchIndexService(
      path.join(episodeDir, "state", "image-generation")
    );
    const latest = await index.getLatest({ category: "image-generation" });
    expect(latest?.openAIBatchId).toBe("batch_1");
    expect(latest?.status).toBe("completed");
  });

  it("summarizes merge and reuse metadata in the batch readiness report", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-summary-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-001",
      renderability: "mergeWithNext",
    });
    await writeSceneManifest({
      episodeDir,
      sceneId: "scene-002",
      renderability: "mergeWithPrevious",
      reusedFromSceneId: "scene-001",
    });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-001", sequenceNumber: 1 }, { id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    expect(prepared.groups[0]?.scenePlans).toHaveLength(2);
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      prepared.groups[0]?.storagePlan.localBatchId ?? "",
      makeClient() as never
    );
    const readiness = await summarizeImageBatchState(
      path.join(episodeDir, "state", "image-generation")
    );
    expect(readiness.mergedWithNextScenes).toBeGreaterThanOrEqual(1);
    expect(readiness.mergedWithPreviousScenes).toBeGreaterThanOrEqual(1);
    expect(readiness.reusedScenes).toBeGreaterThanOrEqual(1);
  });

  it("imports completed image batch outputs and persists images atomically", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-import-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly job: { readonly expectedOutputPath: string };
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const imageBase64 = await makeBase64Image(1920, 1088);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: {
          data: [{ b64_json: imageBase64 }],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 2 },
          },
        },
      },
    });
    const client = {
      files: {
        create: vi.fn(async () => ({ id: "file_1" })),
        content: vi.fn(async (fileId: string) => ({
          text: async () => (fileId === "file_out" ? `${outputJsonl}\n` : ""),
        })),
      },
      batches: {
        create: vi.fn(async () => ({
          id: "batch_1",
          status: "validating",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          completion_window: "24h",
          created_at: 1,
          object: "batch",
        })),
        retrieve: vi.fn(async () => ({
          id: "batch_1",
          status: "completed",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          output_file_id: "file_out",
          completion_window: "24h",
          created_at: 1,
          completed_at: 2,
          request_counts: { total: 1, completed: 1, failed: 0 },
          object: "batch",
        })),
        cancel: vi.fn(),
      },
      responses: {
        create: vi.fn(),
      },
    };
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported");
    expect(imported.importedItemCount).toBe(1);
    expect(imported.failedItemCount).toBe(0);

    const imagePath = group.scenePlans[0]?.job.expectedOutputPath ?? "";
    expect((await fs.readFile(imagePath)).byteLength).toBeGreaterThan(0);
    const metadata = await sharp(imagePath).metadata();
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1088);

    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.status).toBe("imported");
    expect(manifest?.items[0]?.status).toBe("persisted");

    const sceneManifest = JSON.parse(
      await fs.readFile(
        path.join(
          episodeDir,
          "state",
          "image-generation",
          "manifests",
          "scene-002.json"
        ),
        "utf8"
      )
    ) as { readonly status?: string; readonly outputSha256?: string };
    expect(sceneManifest.status).toBe("generated");
    expect(sceneManifest.outputSha256).toMatch(/^[a-f0-9]{64}$/u);

    const readiness = await summarizeImageBatchState(
      path.join(episodeDir, "state", "image-generation")
    );
    expect(readiness.readyForRender).toBe(true);
    expect(readiness.importedBatches).toBe(1);
    expect(readiness.requiresImportBatches).toBe(0);
  });

  it("marks partial imports as failures when one scene is rejected", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-partial-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    await writeSceneManifest({ episodeDir, sceneId: "scene-003" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [
          { id: "scene-002", sequenceNumber: 2 },
          { id: "scene-003", sequenceNumber: 3 },
        ],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const imageBase64 = await makeBase64Image(1920, 1088);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: imageBase64 }] },
      },
    });
    const errorJsonl = JSON.stringify({
      custom_id: group.scenePlans[1]?.manifestItem.customId,
      error: {
        code: "policy_violation",
        message: "content rejected",
      },
    });
    const client = {
      files: {
        create: vi.fn(async () => ({ id: "file_1" })),
        content: vi.fn(async (fileId: string) => ({
          text: async () =>
            fileId === "file_out"
              ? `${outputJsonl}\n`
              : fileId === "file_err"
                ? `${errorJsonl}\n`
                : "",
        })),
      },
      batches: {
        create: vi.fn(async () => ({
          id: "batch_1",
          status: "validating",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          completion_window: "24h",
          created_at: 1,
          object: "batch",
        })),
        retrieve: vi.fn(async () => ({
          id: "batch_1",
          status: "completed",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          output_file_id: "file_out",
          error_file_id: "file_err",
          completion_window: "24h",
          created_at: 1,
          completed_at: 2,
          request_counts: { total: 2, completed: 1, failed: 1 },
          object: "batch",
        })),
        cancel: vi.fn(),
      },
      responses: {
        create: vi.fn(),
      },
    };
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    expect(imported.failedItemCount).toBe(1);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("persisted");
    expect(manifest?.items[1]?.status).toBe("policy-rejected");

    const readiness = await summarizeImageBatchState(
      path.join(episodeDir, "state", "image-generation")
    );
    expect(readiness.readyForRender).toBe(false);
    expect(readiness.failedBatches).toBeGreaterThan(0);
  });

  it("reconciles completed image outputs by custom_id when result lines are out of order", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-order-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    await writeSceneManifest({ episodeDir, sceneId: "scene-003" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [
          { id: "scene-002", sequenceNumber: 2 },
          { id: "scene-003", sequenceNumber: 3 },
        ],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const firstImageBase64 = await makeBase64Image(1920, 1088);
    const secondImageBase64 = await makeBase64Image(1920, 1088);
    const firstLine = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: firstImageBase64 }] },
      },
    });
    const secondLine = JSON.stringify({
      custom_id: group.scenePlans[1]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: secondImageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${secondLine}\n${firstLine}\n`,
      total: 2,
      completed: 2,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported");
    expect(imported.importedItemCount).toBe(2);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items.map((item) => [item.sceneId, item.status])).toEqual([
      ["scene-002", "persisted"],
      ["scene-003", "persisted"],
    ]);
  });

  it("marks missing result lines as retry-required during import", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-missing-result-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
    };
    const client = makeImportClient({
      outputText: "",
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    expect(imported.failedItemCount).toBe(1);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("retry-required");
    expect(manifest?.items[0]?.error).toMatchObject({
      category: "missing-result",
    });
  });

  it("marks invalid image dimensions as validation failures during import", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-bad-dimensions-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const wrongSizeImageBase64 = await makeBase64Image(8, 8);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: wrongSizeImageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    expect(imported.failedItemCount).toBe(1);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("validation-failed");
    expect(manifest?.items[0]?.error).toMatchObject({
      category: "invalid-dimensions",
    });
    expect(manifest?.items[0]?.error?.message).toContain(
      "Unexpected image dimensions"
    );
  });

  it("classifies duplicate and unknown custom_id lines during import", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-duplicate-lines-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const imageBase64 = await makeBase64Image(1920, 1088);
    const duplicateLine = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: { status_code: 200, body: { data: [{ b64_json: imageBase64 }] } },
    });
    const unknownLine = JSON.stringify({
      custom_id: "unknown-custom-id",
      response: { status_code: 200, body: { data: [{ b64_json: imageBase64 }] } },
    });
    const client = makeImportClient({
      outputText: `${duplicateLine}\n${duplicateLine}\n${unknownLine}\n`,
      total: 3,
      completed: 3,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    expect(imported.duplicateResultCount).toBe(1);
    expect(imported.unknownResultCount).toBe(1);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("validation-failed");
    expect(manifest?.items[0]?.error).toMatchObject({
      category: "duplicate-id",
    });
  });

  it("classifies invalid base64 payloads without treating them as imported", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-invalid-base64-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: "%%%not-base64%%%" }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("decode-failed");
    expect(manifest?.items[0]?.error).toMatchObject({
      category: "invalid-base64",
    });
  });

  it("returns non-terminal when download is requested before the batch is complete", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-non-terminal-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
    };
    const client = {
      files: {
        create: vi.fn(async () => ({ id: "file_1" })),
        content: vi.fn(async () => ({ text: async () => "" })),
      },
      batches: {
        create: vi.fn(async () => ({
          id: "batch_1",
          status: "validating",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          completion_window: "24h",
          created_at: 1,
          object: "batch",
        })),
        retrieve: vi.fn(async () => ({
          id: "batch_1",
          status: "in_progress",
          endpoint: "/v1/images/generations",
          input_file_id: "file_1",
          completion_window: "24h",
          created_at: 1,
          object: "batch",
        })),
        cancel: vi.fn(),
      },
      responses: { create: vi.fn() },
    };
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("non_terminal");
    expect(imported.providerStatus).toBe("in_progress");
  });

  it("keeps repeated imports idempotent after a successful import", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-repeat-import-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const imageBase64 = await makeBase64Image(1920, 1088);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: imageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const firstImport = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    const secondImport = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(firstImport.status).toBe("imported");
    expect(secondImport.status).toBe("imported");
    expect(secondImport.failedItemCount).toBe(0);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("persisted");
  });

  it("imports native short-scene batch outputs into canonical shared portrait paths", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-short-import-"));
    const episodeDir = path.join(tempDir, "001-demo");
    process.env["SHORTS_KEY_SCENE_COUNT"] = "1";
    process.env["SHORTS_KEY_SCENE_RATIO"] = "0";
    await fs.mkdir(path.join(episodeDir, "locales", "de", "short"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(episodeDir, "locales", "de", "short", "script.md"),
      "# de short\n",
      "utf8"
    );
    await fs.mkdir(path.join(episodeDir, "de", "short"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "de", "short", "scenes.json"),
      JSON.stringify({
        sourceId: "001-demo",
        scenes: [
          {
            id: "scene-001",
            sequenceNumber: 1,
            canonicalNarration: "Narration 1",
            sourceSegmentIds: ["scene-001"],
            estimatedDurationSeconds: 4,
            timing: { startSeconds: 0, endSeconds: 4 },
            visualPurpose: "hook",
            subject: "Subject 1",
            action: "shown",
            setting: "Setting 1",
            composition: "centered",
            cameraFraming: "medium shot",
            mood: "tense",
            continuityReferences: [],
            onScreenText: "",
            textRequirement: { required: false },
            negativeConstraints: [],
            aspectRatios: ["16:9"],
            imagePrompt: "Prompt 1",
            expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
            qualityStatus: "draft",
          },
        ],
      }),
      "utf8"
    );
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "shared", "characters.json"),
      JSON.stringify({
        episodeId: "001-demo",
        characters: [],
        updatedAt: new Date().toISOString(),
      }),
      "utf8"
    );

    const prepared = await prepareShortSceneImageBatches({
      episodeDir,
      episodeId: "001-demo",
      languages: ["de"],
      variant: "short",
      settings: {
        model: "gpt-image-2",
        requestedSize: "1024x1536",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
        readonly job: { readonly expectedOutputPath: string };
      }>;
    };
    const imageBase64 = await makeBase64Image(1024, 1536);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: imageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported");
    expect(group.scenePlans[0]?.job.expectedOutputPath).toContain(
      path.join("shared", "short", "images", "generated")
    );
    const shortsManifest = JSON.parse(
      await fs.readFile(resolveEpisodeShortsImageManifestPath(episodeDir), "utf8")
    ) as Array<Record<string, unknown>>;
    expect(shortsManifest).toHaveLength(1);
    expect(shortsManifest[0]?.["outputImagePath"]).toBe(
      group.scenePlans[0]?.job.expectedOutputPath
    );
    expect(shortsManifest[0]?.["promptHash"]).toBeDefined();
  });

  it("imports character reference batch outputs into canonical shared reference paths", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-reference-import-"));
    const episodeDir = path.join(tempDir, "episode");
    const referencePath = resolveEpisodeCharacterReferencePath(
      episodeDir,
      "character-1"
    );
    await upsertCharacterRegistry(episodeDir, "001-demo", [
      makeCharacter({
        referenceStatus: "missing",
        referenceImagePath: referencePath,
      }),
    ]);

    const groups = await planReferenceImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly referencePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
        readonly requestLine: Record<string, unknown>;
        readonly job: { readonly expectedOutputPath: string };
      }>;
    };
    const { inputFilePath, inputFileHash } = await writeImageBatchInputFile(
      group.storagePlan,
      group.referencePlans.map((plan) => JSON.stringify(plan.requestLine))
    );
    await writeImageBatchManifest(group.storagePlan, {
      schemaVersion: "image-batch-v2",
      category: "image-generation",
      localBatchId: group.storagePlan.localBatchId,
      rootLocalBatchId: group.storagePlan.localBatchId,
      retryNumber: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endpoint: "/v1/images/generations",
      model: "gpt-image-2",
      completionWindow: "24h",
      inputFilePath,
      inputFileHash,
      status: "prepared",
      items: group.referencePlans.map((plan) => plan.manifestItem),
    });
    const imageBase64 = await makeBase64Image(1920, 1088);
    const outputJsonl = JSON.stringify({
      custom_id: group.referencePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: imageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported");
    expect(group.referencePlans[0]?.job.expectedOutputPath).toBe(referencePath);
    const registry = JSON.parse(
      await fs.readFile(path.join(episodeDir, "shared", "characters.json"), "utf8")
    ) as {
      readonly characters: Array<{
        readonly id: string;
        readonly referenceImagePath?: string;
        readonly referenceStatus?: string;
      }>;
    };
    expect(registry.characters[0]).toMatchObject({
      id: "character-1",
      referenceImagePath: referencePath,
      referenceStatus: "generated",
    });
  });

  it("marks manifest/filesystem destination disagreement as a validation failure during import", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-destination-conflict-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
      readonly scenePlans: ReadonlyArray<{
        readonly manifestItem: { readonly customId: string };
      }>;
    };
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    if (!manifest) {
      throw new Error("expected batch manifest");
    }
    await fs.writeFile(
      group.storagePlan.manifestPath,
      JSON.stringify(
        {
          ...manifest,
          items: manifest.items.map((item) => ({
            ...item,
            expectedOutputPath: path.join(
              episodeDir,
              "shared",
              "images",
              "generated",
              "scene-999__000000-000004__16x9.png"
            ),
          })),
        },
        null,
        2
      ),
      "utf8"
    );
    const imageBase64 = await makeBase64Image(1920, 1088);
    const outputJsonl = JSON.stringify({
      custom_id: group.scenePlans[0]?.manifestItem.customId,
      response: {
        status_code: 200,
        body: { data: [{ b64_json: imageBase64 }] },
      },
    });
    const client = makeImportClient({
      outputText: `${outputJsonl}\n`,
      total: 1,
      completed: 1,
      failed: 0,
    });
    await submitImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    const nextManifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(nextManifest?.items[0]?.status).toBe("validation-failed");
    expect(nextManifest?.items[0]?.error).toMatchObject({
      category: "destination-conflict",
      code: "destination-conflict",
    });
    expect(nextManifest?.items[0]?.error?.message).toContain(
      "Manifest/filesystem disagreement"
    );
  });

  it("retries only failed image scenes and keeps the successful ones out of the new batch", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-retry-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    await writeSceneManifest({ episodeDir, sceneId: "scene-003" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: {
        scenes: [
          { id: "scene-002", sequenceNumber: 2 },
          { id: "scene-003", sequenceNumber: 3 },
        ],
      },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
    };
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest).toBeDefined();
    if (!manifest) {
      return;
    }
    await fs.writeFile(
      group.storagePlan.manifestPath,
      JSON.stringify(
        {
          ...manifest,
          items: manifest.items.map((item) =>
            item.sceneId === "scene-002"
              ? { ...item, status: "persisted" as const }
              : { ...item, status: "decode-failed" as const }
          ),
        },
        null,
        2
      )
    );

    const retried = await retryFailedImageBatch(
      path.join(episodeDir, "state", "image-generation"),
      group.storagePlan.localBatchId
    );

    expect(retried.itemCount).toBe(1);
    expect(retried.inputFilePath).toContain(".batch/inputs/");
    const retryManifest = await readImageBatchManifest(retried.manifestPath);
    expect(retryManifest?.parentLocalBatchId).toBe(group.storagePlan.localBatchId);
    expect(retryManifest?.retryNumber).toBe(1);
    expect(retryManifest?.items).toHaveLength(1);
    expect(retryManifest?.items[0]?.sceneId).toBe("scene-003");
  });

  it("does not prepare retries for items already recovered in the same lineage", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "image-batch-lineage-retry-"));
    const episodeDir = path.join(tempDir, "episode");
    await writeSceneManifest({ episodeDir, sceneId: "scene-002" });
    const prepared = await prepareImageBatchForEpisode({
      episodeDir,
      episodeId: "001-demo",
      scenePlan: { scenes: [{ id: "scene-002", sequenceNumber: 2 }] },
      settings: {
        model: "gpt-image-2",
        requestedSize: "1920x1088",
        quality: "medium",
        outputFormat: "png",
      },
    });
    const group = prepared.groups[0] as {
      readonly storagePlan: ImageBatchStoragePlan;
    };
    const rootManifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(rootManifest).toBeDefined();
    if (!rootManifest) {
      return;
    }
    await fs.writeFile(
      group.storagePlan.manifestPath,
      JSON.stringify(
        {
          ...rootManifest,
          items: rootManifest.items.map((item) => ({
            ...item,
            status: "decode-failed" as const,
            retryCount: 0,
          })),
        },
        null,
        2
      )
    );
    await fs.writeFile(
      path.join(
        episodeDir,
        "state",
        "image-generation",
        ".batch",
        "manifests",
        "batch-imgb-child.manifest.json"
      ),
      JSON.stringify(
        {
          ...rootManifest,
          localBatchId: "imgb-child",
          rootLocalBatchId: rootManifest.localBatchId,
          parentLocalBatchId: rootManifest.localBatchId,
          retryNumber: 1,
          status: "imported",
          items: rootManifest.items.map((item) => ({
            ...item,
            status: "persisted" as const,
            retryCount: 1,
          })),
        },
        null,
        2
      )
    );

    await expect(
      retryFailedImageBatch(
        path.join(episodeDir, "state", "image-generation"),
        group.storagePlan.localBatchId
      )
    ).rejects.toThrow(/no retryable items/u);
  });
});
