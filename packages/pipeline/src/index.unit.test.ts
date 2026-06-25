import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPipeline } from "./index.js";

describe("MediaForgePipeline audio reuse", () => {
  it("regenerates stale scene audio when the scene hash changes", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-pipeline-audio-")
    );
    const sourcePath = path.join(baseDir, "source.wav");
    const transcriptPath = path.join(baseDir, "source.transcript.json");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "4",
        sourcePath,
      ],
      {
        stdio: "ignore",
      }
    );
    writeFileSync(
      transcriptPath,
      JSON.stringify(
        {
          sourceId: "episode-fixture",
          language: "en",
          text: "This is a local fixture. It exercises audio reuse. The final sentence should be regenerated.",
          segments: [
            {
              id: "scene-001",
              startSeconds: 0,
              endSeconds: 4,
              text: "This is a local fixture. It exercises audio reuse. The final sentence should be regenerated.",
              words: [],
            },
          ],
          words: [],
        },
        null,
        2
      )
    );

    const pipeline = await createPipeline({
      workspaceDir: path.join(baseDir, "workspace"),
      dbPath: path.join(baseDir, "db.sqlite"),
      transcriptionProvider: "mock",
      ttsProvider: "mock",
      imageProvider: "placeholder",
      textProvider: "mock",
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture",
    });

    const episodeDir = path.join(baseDir, "workspace", "episode-fixture");
    const staleAudioPath = path.join(
      episodeDir,
      "audio",
      "segments",
      "scene-001.wav"
    );
    await fs.mkdir(path.dirname(staleAudioPath), { recursive: true });
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "0.5",
        staleAudioPath,
      ],
      { stdio: "ignore" }
    );
    await fs.writeFile(
      path.join(episodeDir, "audio", "segments", "scene-001.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          sceneId: "scene-001",
          sceneHash: "stale-scene-hash",
          promptHash: "stale-prompt-hash",
          voiceProfileHash: "stale-voice-hash",
          outputPath: staleAudioPath,
          outputSha256: "stale-output-sha256",
          durationSeconds: 0.5,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const result = await pipeline.runEpisode(manifest.episodeId, {
      untilStage: "concatenate-audio",
    });
    expect(result.outputPaths).toContain(
      path.join(episodeDir, "audio", "narration.wav")
    );
    const manifestJson = JSON.parse(
      await fs.readFile(
        path.join(episodeDir, "audio", "segments", "scene-001.json"),
        "utf8"
      )
    ) as {
      sceneHash: string;
      promptHash: string;
      outputSha256: string;
    };
    expect(manifestJson.sceneHash).not.toBe("stale-scene-hash");
    expect(manifestJson.promptHash).not.toBe("stale-prompt-hash");
    expect(manifestJson.outputSha256).not.toBe("stale-output-sha256");
  }, 120000);
});
