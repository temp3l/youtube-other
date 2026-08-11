import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildEpisodeReviewPack,
  registerEpisodeReviewPackCommand,
  type EpisodeMediaProbe,
} from "./episode-review-pack.js";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function createEpisode(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "episode-review-pack-"));
  temporaryRoots.push(root);
  const episode = path.join(root, "episode-one");
  await fs.mkdir(path.join(episode, "source"), { recursive: true });
  await fs.mkdir(path.join(episode, "audio"), { recursive: true });
  await fs.mkdir(path.join(episode, "render"), { recursive: true });
  await fs.mkdir(path.join(episode, "reviews", "older-pack"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(episode, "source", "story.md"),
    "# Story\n\nEvidence.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(episode, "manifest.json"),
    '{"episodeId":"episode-one"}\n',
    "utf8"
  );
  await fs.writeFile(
    path.join(episode, "audio", "narration.wav"),
    Buffer.from("fake wav payload")
  );
  await fs.writeFile(
    path.join(episode, "render", "final.mp4"),
    Buffer.from("fake video payload")
  );
  await fs.writeFile(
    path.join(episode, "reviews", "older-pack", "stale.json"),
    "{}\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(episode, ".env"),
    "OPENAI_API_KEY=never-pack-me\n",
    "utf8"
  );
  return episode;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("episode ChatGPT review packs", () => {
  it("replaces audio/video payloads with ffprobe metadata and creates a valid ZIP", async () => {
    const episodeFolder = await createEpisode();
    const probedPaths: string[] = [];
    const result = await buildEpisodeReviewPack(
      { episodeFolder },
      {
        now: () => new Date("2026-08-11T12:34:56.000Z"),
        ffprobeVersion: async () => "ffprobe version fixture",
        probeMedia: async (file): Promise<EpisodeMediaProbe> => {
          probedPaths.push(file.relativePath);
          return {
            path: file.relativePath,
            kind: file.kind,
            sizeBytes: file.sizeBytes,
            status: "probed",
            format: {
              format_name: file.kind === "audio" ? "wav" : "mov,mp4",
              duration: 12.5,
            },
            streams: [
              {
                codec_type: file.kind,
                codec_name: file.kind === "audio" ? "pcm_s16le" : "h264",
              },
            ],
          };
        },
      }
    );

    expect(result.status).toBe("READY");
    expect(probedPaths).toEqual(["audio/narration.wav", "render/final.mp4"]);
    expect(result.mediaFilesProbed).toBe(2);
    const listing = (
      await execFileAsync("unzip", ["-Z1", result.zipPath], {
        encoding: "utf8",
      })
    ).stdout;
    expect(listing).toContain("/episode/source/story.md");
    expect(listing).toContain("/media/ffprobe.json");
    expect(listing).not.toContain("narration.wav");
    expect(listing).not.toContain("final.mp4");
    expect(listing).not.toContain("stale.json");
    expect(listing).not.toContain(".env");

    expect(path.dirname(result.zipPath)).toBe(
      path.join(path.dirname(episodeFolder), "reviews")
    );
    await expect(
      fs.access(
        path.join(
          path.dirname(result.zipPath),
          path.basename(result.zipPath, ".zip")
        )
      )
    ).rejects.toThrow();
    const archiveRoot = path.basename(result.zipPath, ".zip");
    const media = JSON.parse(
      (
        await execFileAsync(
          "unzip",
          ["-p", result.zipPath, `${archiveRoot}/media/ffprobe.json`],
          { encoding: "utf8" }
        )
      ).stdout
    ) as {
      mediaPayloadsIncluded: boolean;
      files: Array<{ path: string; format: { duration: number } }>;
    };
    expect(media.mediaPayloadsIncluded).toBe(false);
    expect(media.files.map((file) => file.path)).toEqual(probedPaths);
    expect(media.files[0]?.format.duration).toBe(12.5);
  });

  it("records probe failures without embedding media and reports a partial pack", async () => {
    const episodeFolder = await createEpisode();
    const result = await buildEpisodeReviewPack(
      { episodeFolder },
      {
        now: () => new Date("2026-08-11T12:35:00.000Z"),
        ffprobeVersion: async () => "ffprobe version fixture",
        probeMedia: async (file) => ({
          path: file.relativePath,
          kind: file.kind,
          sizeBytes: file.sizeBytes,
          status: "failed",
          error: "invalid media fixture",
        }),
      }
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.mediaProbeFailures).toBe(2);
    const listing = (
      await execFileAsync("unzip", ["-Z1", result.zipPath], {
        encoding: "utf8",
      })
    ).stdout;
    expect(listing).not.toMatch(/\.(?:wav|mp4)$/mu);
  });

  it("registers the folder-oriented episode review-pack command", () => {
    const program = new Command();
    const episode = program.command("episode");
    registerEpisodeReviewPackCommand(episode);
    const command = episode.commands.find(
      (candidate) => candidate.name() === "review-pack"
    );

    expect(command).toBeDefined();
    expect(command?.registeredArguments[0]?.required).toBe(true);
    expect(command?.options.map((option) => option.long)).toEqual([
      "--max-file-bytes",
      "--max-pack-bytes",
      "--probe-concurrency",
      "--json",
    ]);
  });
});
