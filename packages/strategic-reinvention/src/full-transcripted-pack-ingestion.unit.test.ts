import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverFullTranscriptedPackEpisodes,
} from "./full-transcripted-pack-ingestion.js";
import { prepareCanonicalSourceEpisodeWorkspace } from "./veronica-content-pack-2-ingestion.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeFullTranscriptedFixture(): Promise<string> {
  const packDir = await temporaryDirectory("full-transcripted-pack-");
  const waveDir = path.join(packDir, "production-wave-01");
  await fs.mkdir(path.join(waveDir, "scripts", "shorts"), { recursive: true });
  await fs.mkdir(path.join(waveDir, "scripts", "longs"), { recursive: true });
  await fs.writeFile(path.join(waveDir, "scripts", "shorts", "S001.txt"), "Specific positioning makes expertise easier to remember.\n");
  await fs.writeFile(path.join(waveDir, "scripts", "longs", "L004.txt"), "Differentiation creates a category buyers can recognize.\n");
  await fs.writeFile(
    path.join(waveDir, "qa.json"),
    `${JSON.stringify([
      {
        storyId: "S001",
        title: "Why Being Good Is Not Enough",
        format: "short",
        sourceIds: ["source-short"],
        sourceQualities: { "source-short": "clean" },
        timingPass: true,
        originalityPass: true,
        plainNarrationOnly: true,
        qaPass: true,
      },
      {
        storyId: "L004",
        title: "How to Differentiate",
        format: "long",
        sourceIds: ["source-long"],
        sourceQualities: { "source-long": "review" },
        timingPass: true,
        originalityPass: true,
        plainNarrationOnly: true,
        qaPass: true,
      },
    ], null, 2)}\n`,
  );
  return packDir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("full-transcripted Pack ingestion", () => {
  it("discovers only QA-approved Wave 01 scripts and preserves their source grounding", async () => {
    const packDir = await writeFullTranscriptedFixture();
    const episodes = await discoverFullTranscriptedPackEpisodes({ packDir });
    const short = episodes.find((episode) => episode.sourceGrounding?.storyId === "S001");
    const long = episodes.find((episode) => episode.sourceGrounding?.storyId === "L004");

    expect(short).toMatchObject({
      episodeId: "s001-why-being-good-is-not-enough",
      format: "short",
      sourcePackId: "full-transcripted-pack",
      sourceGrounding: { sourceIds: ["source-short"], qaPass: true },
    });
    expect(long).toMatchObject({
      episodeId: "l004-how-to-differentiate",
      format: "long",
      sourceGrounding: { sourceQualities: { "source-long": "review" } },
    });
  });

  it("materializes variant-correct canonical scripts and records source QA in the manifest", async () => {
    const packDir = await writeFullTranscriptedFixture();
    const workspaceRoot = await temporaryDirectory("full-transcripted-workspace-");
    const episodes = await discoverFullTranscriptedPackEpisodes({ packDir });
    const short = episodes.find((episode) => episode.format === "short");
    const long = episodes.find((episode) => episode.format === "long");
    if (!short || !long) throw new Error("Fixture episodes were not discovered.");

    const [preparedShort, preparedLong] = await Promise.all([
      prepareCanonicalSourceEpisodeWorkspace({ workspaceRoot, sourceEpisode: short, locale: "en" }),
      prepareCanonicalSourceEpisodeWorkspace({ workspaceRoot, sourceEpisode: long, locale: "en" }),
    ]);
    const longManifest = JSON.parse(await fs.readFile(path.join(preparedLong.episodeDir, "manifest.json"), "utf8")) as {
      readonly sourceMetadata: { readonly sourceGrounding: { readonly storyId: string } };
    };

    expect(preparedShort.scriptPath).toContain("languages/short/script-en.md");
    expect(preparedLong.scriptPath).toContain("languages/script-en.md");
    await expect(fs.readFile(preparedLong.scriptPath, "utf8")).resolves.toContain("Differentiation creates");
    expect(longManifest.sourceMetadata.sourceGrounding.storyId).toBe("L004");
  });
});
