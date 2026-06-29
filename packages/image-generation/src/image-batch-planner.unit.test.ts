import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import { prepareImageBatchForEpisode, planImageBatchForEpisode } from "./image-batch-planner.js";

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
        outputPath: path.join(
          args.episodeDir,
          "shared",
          "images",
          "generated",
          `${args.sceneId}__000000-000004__16x9.png`
        ),
        status: args.status,
        attempts: 0,
      },
      null,
      2
    )
  );
  if (args.outputExists) {
    await fs.writeFile(
      path.join(
        args.episodeDir,
        "shared",
        "images",
        "generated",
        `${args.sceneId}__000000-000004__16x9.png`
      ),
      "png"
    );
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
    expect(inputFile).toContain("/v1/images/generations");
    expect(inputFile).toContain('"n":1');
    expect(inputFile).not.toContain("scene-001");
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
});
