import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeEpisodeImageState } from "./episode-image-summary.js";

async function writeSceneManifest(
  episodeDir: string,
  sceneId: string,
  status: "generated" | "failed",
  outputExists = true
): Promise<void> {
  const manifestsDir = path.join(episodeDir, "state", "image-generation", "manifests");
  const imagesDir = path.join(episodeDir, "state", "image-generation", "images");
  await fs.mkdir(manifestsDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  const outputPath = path.join(imagesDir, `${sceneId}.png`);
  if (outputExists && status === "generated") {
    await fs.writeFile(outputPath, "image", "utf8");
  }
  await fs.writeFile(
    path.join(manifestsDir, `${sceneId}.json`),
    JSON.stringify(
      {
        sceneId,
        promptVersion: 1,
        finalPrompt: `${sceneId} prompt`,
        promptHash: `${sceneId}-hash`,
        materialDifferencesFromPrevious: [],
        characterIds: [],
        referenceImages: [],
        model: "gpt-image-2",
        size: "1536x1024",
        quality: "medium",
        outputPath,
        status,
        attempts: 1,
        generatedAt: new Date().toISOString(),
        ...(status === "failed"
          ? {
              error: {
                message: "prompt overlaps too much with the previous prompt",
                retryable: false,
              },
            }
          : {}),
      },
      null,
      2
    ),
    "utf8"
  );
}

describe("episode image summary", () => {
  it("counts generated, failed, missing, and merge metadata from scene manifests", async () => {
    const episodeDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "episode-image-summary-")
    );
    await writeSceneManifest(episodeDir, "scene-001", "generated");
    await writeSceneManifest(episodeDir, "scene-002", "generated", false);
    await writeSceneManifest(episodeDir, "scene-003", "failed");

    const summary = await summarizeEpisodeImageState(episodeDir, [
      "scene-001",
      "scene-002",
      "scene-003",
      "scene-004",
    ]);

    expect(summary).toMatchObject({
      plannedScenes: 4,
      generatedScenes: 1,
      failedScenes: 1,
      missingManifests: 1,
      missingImages: 1,
      readyForRender: false,
      missingSceneIds: ["scene-002", "scene-004"],
    });
  });
});
