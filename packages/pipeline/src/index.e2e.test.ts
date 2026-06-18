import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { createPipeline } from "./index.js";
import { validateRenderedVideo } from "@mediaforge/rendering";

describe("pipeline e2e", () => {
  it("runs the local fixture through to a validated mp4", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-e2e-"));
    const sourcePath = path.join(baseDir, "source.wav");
    const transcriptPath = path.join(baseDir, "source.transcript.json");
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "6", sourcePath], {
      stdio: "ignore"
    });
    writeFileSync(
      transcriptPath,
      JSON.stringify(
        {
          sourceId: "episode-fixture",
          language: "en",
          text: "This is a local fixture. It exercises the pipeline. The rendered output should validate.",
          segments: [
            { id: "scene-001", startSeconds: 0, endSeconds: 2, text: "This is a local fixture.", words: [] },
            { id: "scene-002", startSeconds: 2, endSeconds: 4, text: "It exercises the pipeline.", words: [] },
            { id: "scene-003", startSeconds: 4, endSeconds: 6, text: "The rendered output should validate.", words: [] }
          ],
          words: []
        },
        null,
        2
      )
    );
    const pipeline = await createPipeline({
      workspaceDir: path.join(baseDir, "workspace"),
      dbPath: path.join(baseDir, "db.sqlite")
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture"
    });
    const result = await pipeline.runEpisode(manifest.episodeId);
    expect(result.outputPaths.length).toBeGreaterThan(0);
    const video = result.outputPaths.find((item) => item.endsWith("-captioned.mp4")) ?? result.outputPaths[0];
    expect(video).toBeTruthy();
    const validation = await validateRenderedVideo(video!);
    expect(validation.valid).toBe(true);
    const manifestText = readFileSync(path.join(baseDir, "workspace", "episode-fixture", "manifest.json"), "utf8");
    expect(manifestText).toContain("episode-fixture");
  });
});

