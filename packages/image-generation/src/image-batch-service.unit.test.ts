import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { StoryBatchIndexService } from "@mediaforge/story-localization";
import { prepareImageBatchForEpisode } from "./image-batch-planner.js";
import {
  readImageBatchManifest,
  type ImageBatchStoragePlan,
} from "./image-batch-storage.js";
import {
  importImageBatch,
  refreshImageBatch,
  retryFailedImageBatch,
  submitImageBatch,
  summarizeImageBatchState,
} from "./image-batch-service.js";

async function writeSceneManifest(args: {
  readonly episodeDir: string;
  readonly sceneId: string;
}): Promise<void> {
  const manifestsDir = path.join(
    args.episodeDir,
    "generated-assets",
    "image-manifests"
  );
  const promptsDir = path.join(args.episodeDir, "generated-assets", "prompts");
  const imagesDir = path.join(args.episodeDir, "generated-assets", "images");
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
        finalPrompt: `Prompt for ${args.sceneId}.`,
        promptHash: `hash-${args.sceneId}`,
        materialDifferencesFromPrevious: [],
        characterIds: ["character-1"],
        referenceImages: [
          {
            characterId: "character-1",
            path: path.join(args.episodeDir, "ref.png"),
            sha256: `ref-${args.sceneId}`,
          },
        ],
        model: "gpt-image-2",
        size: "1920x1088",
        quality: "medium",
        outputPath: path.join(
          args.episodeDir,
          "generated-assets",
          "images",
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

describe("image batch service", () => {
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
      path.join(episodeDir, "generated-assets"),
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
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );
    expect(refreshed.status).toBe("completed");
    expect(refreshed.outputFileId).toBe("file_out");

    const index = new StoryBatchIndexService(path.join(episodeDir, "generated-assets"));
    const latest = await index.getLatest({ category: "image-generation" });
    expect(latest?.openAIBatchId).toBe("batch_1");
    expect(latest?.status).toBe("completed");
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
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "generated-assets"),
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
          "generated-assets",
          "image-manifests",
          "scene-002.json"
        ),
        "utf8"
      )
    ) as { readonly status?: string; readonly outputSha256?: string };
    expect(sceneManifest.status).toBe("generated");
    expect(sceneManifest.outputSha256).toMatch(/^[a-f0-9]{64}$/u);

    const readiness = await summarizeImageBatchState(
      path.join(episodeDir, "generated-assets")
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
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );
    await refreshImageBatch(
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );

    const imported = await importImageBatch(
      path.join(episodeDir, "generated-assets"),
      group.storagePlan.localBatchId,
      client as never
    );

    expect(imported.status).toBe("imported_with_failures");
    expect(imported.failedItemCount).toBe(1);
    const manifest = await readImageBatchManifest(group.storagePlan.manifestPath);
    expect(manifest?.items[0]?.status).toBe("persisted");
    expect(manifest?.items[1]?.status).toBe("policy-rejected");

    const readiness = await summarizeImageBatchState(
      path.join(episodeDir, "generated-assets")
    );
    expect(readiness.readyForRender).toBe(false);
    expect(readiness.failedBatches).toBeGreaterThan(0);
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
      path.join(episodeDir, "generated-assets"),
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
});
