import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  alignFinalHistoryChapters,
  importHistoryContentPack,
  validateHistoryContentPack,
} from "./content-pack.js";
import { createHistoryWorkflowOperator } from "./task-registry.js";

const pack = path.resolve("content-packs/youtube-history-10-video-story-pack");
const temporaryRoots: string[] = [];

async function temporaryPack(): Promise<{ root: string; pack: string; output: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-history-test-"));
  temporaryRoots.push(root);
  const target = path.join(root, "youtube-history-10-video-story-pack");
  await fs.cp(pack, target, { recursive: true, dereference: false });
  return { root, pack: target, output: path.join(root, "episodes") };
}

async function checksum(file: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("History content-pack contract", () => {
  it("strictly validates all ten immutable source stories and applies the versioned overlay", async () => {
    const before = await checksum(path.join(pack, "01-bronze-age-collapse.md"));
    const result = await validateHistoryContentPack({ packPath: pack, genre: "history", mode: "strict" });
    expect(result.valid, result.diagnostics.map((value) => value.message).join("\n")).toBe(true);
    expect(result.validatedFiles).toHaveLength(10);
    expect(result.rejectedFiles).toEqual([]);
    expect(result.episodes.map((episode) => episode.normalizedMetadata.presetId)).toEqual([
      "civilization-rise-fall",
      "military-campaign",
      "civilization-rise-fall",
      "disaster-pandemic-survival",
      "archaeology-mystery",
      "military-campaign",
      "everyday-life",
      "world-war-geopolitics",
      "historical-biography",
      "disaster-pandemic-survival",
    ]);
    expect(result.episodes.every((episode) => episode.normalizedMetadata.canonicalFormat === "standard")).toBe(true);
    expect(result.episodes.every((episode) => episode.normalizedMetadata.canonicalGenre === "history")).toBe(true);
    expect(result.episodes.every((episode) => !episode.normalizedMetadata.publishReady)).toBe(true);
    expect(result.episodes.every((episode) => episode.chapters.every((chapter) => chapter.provisional))).toBe(true);
    expect(result.episodes.every((episode) => episode.researchSources.every((source) => source.status === "declared-by-pack"))).toBe(true);
    expect(await checksum(path.join(pack, "01-bronze-age-collapse.md"))).toBe(before);
  });

  it("imports idempotently, retains metadata, and invalidates derived tasks on source revision", async () => {
    const fixture = await temporaryPack();
    const request = { packPath: fixture.pack, genre: "history" as const, mode: "strict" as const, dryRun: false, failureMode: "collect-errors" as const, outputRoot: fixture.output, now: () => new Date("2026-08-02T10:00:00.000Z") };
    const first = await importHistoryContentPack(request);
    expect(first.importedEpisodes).toHaveLength(10);
    const second = await importHistoryContentPack(request);
    expect(second.noOpEpisodes).toHaveLength(10);
    const bronze = first.importedEpisodes[0]!;
    const metadata = JSON.parse(await fs.readFile(path.join(fixture.output, bronze, "source", "normalized-metadata.json"), "utf8")) as { originalFrontmatter: Record<string, unknown>; publishReady: boolean };
    expect(metadata.originalFrontmatter["writer_persona"]).toContain("Cinematic Public Historian");
    expect(metadata.publishReady).toBe(false);
    const operator = createHistoryWorkflowOperator({ unitRoot: path.join(fixture.output, bronze), episodeId: bronze });
    await operator.runTask("history.research-brief");
    expect((await operator.status()).tasks.find((task) => task.taskId === "history.research-brief")?.persistedStatus).toBe("succeeded");
    await fs.appendFile(path.join(fixture.pack, "01-bronze-age-collapse.md"), "\n");
    const third = await importHistoryContentPack({ ...request, now: () => new Date("2026-08-02T11:00:00.000Z") });
    expect(third.revisedEpisodes).toContain(bronze);
    expect(await fs.readdir(path.join(fixture.output, bronze, "source", "revisions"))).toHaveLength(2);
    const revisedStatus = await operator.status();
    expect(revisedStatus.tasks.find((task) => task.taskId === "history.research-brief")?.persistedStatus).toBe("invalidated");
    const validation = JSON.parse(await fs.readFile(path.join(fixture.output, bronze, "source", "validation-report.json"), "utf8")) as { publishReady: boolean; derivedArtifactsStale: boolean };
    expect(validation).toMatchObject({ publishReady: false, derivedArtifactsStale: true });
  }, 15_000);

  it("keeps dry-run write-free and rejects unsafe manifest paths", async () => {
    const fixture = await temporaryPack();
    const dry = await importHistoryContentPack({ packPath: fixture.pack, genre: "history", mode: "strict", dryRun: true, failureMode: "collect-errors", outputRoot: fixture.output });
    expect(dry.importedEpisodes).toHaveLength(10);
    await expect(fs.access(fixture.output)).rejects.toThrow();
    const manifestPath = path.join(fixture.pack, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { videos: Array<{ file: string }> };
    manifest.videos[0]!.file = "../escape.md";
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await expect(validateHistoryContentPack({ packPath: fixture.pack, genre: "history", mode: "strict" })).rejects.toThrow("Unsafe manifest path");
  });

  it("rejects missing narration and only publishes chapters aligned to actual audio", async () => {
    const fixture = await temporaryPack();
    const sourcePath = path.join(fixture.pack, "01-bronze-age-collapse.md");
    const source = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(sourcePath, source.replace("## Documentary story / narration", "## Removed narration"));
    const invalid = await validateHistoryContentPack({ packPath: fixture.pack, genre: "history", mode: "strict" });
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics.some((value) => value.code === "episode-invalid")).toBe(true);
    const editorial = [{ timestampSeconds: 0, title: "Opening", originalMarkdown: "- **00:00** — Opening", timingSource: "editorial-estimate" as const, provisional: true as const }];
    expect(alignFinalHistoryChapters(editorial, 60, [0]).final[0]).toMatchObject({ timingSource: "actual-audio", provisional: false });
  });
});
