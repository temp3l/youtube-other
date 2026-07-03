import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeEpisodeScriptContent,
  planEpisodeLayoutMigration,
  registerEpisodeLayoutMigrationCommand,
} from "./episode-layout-migration-command.js";

async function createEpisodesRoot(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "episode-layout-"));
  const episodesRoot = path.join(tempDir, "episodes");
  await fs.mkdir(episodesRoot, { recursive: true });
  return episodesRoot;
}

async function writeEpisodeFile(
  episodesRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = path.join(episodesRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

describe("episode layout migration command", () => {
  it("normalizes script content with the documented policy", () => {
    expect(normalizeEpisodeScriptContent(Buffer.from("\uFEFFLine 1  \r\nLine 2\t\r\n\r\n"))).toBe(
      "Line 1\nLine 2\n"
    );
  });

  it("classifies episode 022 English and German duplicate layouts without writing", async () => {
    const episodesRoot = await createEpisodesRoot();
    const episode = "022-the-whistler-in-the-woods";
    await writeEpisodeFile(episodesRoot, `${episode}/languages/script-en.md`, "English\n");
    await writeEpisodeFile(episodesRoot, `${episode}/script.md`, "English  \r\n");
    await writeEpisodeFile(episodesRoot, `${episode}/en/full/script.md`, "Different English\n");
    await writeEpisodeFile(episodesRoot, `${episode}/languages/script-de.md`, "Deutsch\n");
    await writeEpisodeFile(episodesRoot, `${episode}/de/full/script.md`, "Deutsch\r\n");
    await writeEpisodeFile(episodesRoot, `${episode}/locales/en/full/script.md`, "Generated\n");
    await writeEpisodeFile(episodesRoot, `${episode}/state/script.md`, "Generated state\n");

    const report = await planEpisodeLayoutMigration({
      episodesRoot,
      now: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(report.dryRun).toBe(true);
    expect(report.candidates.map((candidate) => candidate.repositoryRelativePath)).toEqual([
      `episodes/${episode}/de/full/script.md`,
      `episodes/${episode}/en/full/script.md`,
      `episodes/${episode}/languages/script-de.md`,
      `episodes/${episode}/languages/script-en.md`,
      `episodes/${episode}/script.md`,
    ]);
    expect(
      report.candidates.find((candidate) => candidate.relativePath === "languages/script-en.md")
    ).toMatchObject({ classification: "already_canonical", language: "en", variant: "full" });
    expect(
      report.candidates.find((candidate) => candidate.relativePath === "script.md")
    ).toMatchObject({ classification: "identical_duplicate" });
    expect(
      report.candidates.find((candidate) => candidate.relativePath === "en/full/script.md")
    ).toMatchObject({ classification: "divergent_duplicate" });
    expect(
      report.candidates.find((candidate) => candidate.relativePath === "de/full/script.md")
    ).toMatchObject({ classification: "identical_duplicate", language: "de" });
    expect(report.summary.already_canonical).toBe(2);
    expect(report.summary.identical_duplicate).toBe(2);
    expect(report.summary.divergent_duplicate).toBe(1);
  });

  it("plans safe moves, invalid language, and target collisions deterministically", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(
      episodesRoot,
      "010-safe/source/010-safe-en-full.md",
      "Move me\n"
    );
    await writeEpisodeFile(
      episodesRoot,
      "011-invalid/languages/script-sp.md",
      "Legacy Spanish\n"
    );
    await writeEpisodeFile(
      episodesRoot,
      "012-collision/en/full/script.md",
      "Cannot move\n"
    );
    await fs.mkdir(path.join(episodesRoot, "012-collision", "languages"), {
      recursive: true,
    });
    await fs.mkdir(
      path.join(episodesRoot, "012-collision", "languages", "script-en.md"),
      { recursive: true }
    );

    const report = await planEpisodeLayoutMigration({ episodesRoot });

    expect(
      report.candidates.find((candidate) => candidate.episodeSlug === "010-safe")
    ).toMatchObject({
      classification: "safe_move",
      canonicalRepositoryRelativePath: "episodes/010-safe/languages/script-en.md",
      move: { performed: false },
    });
    expect(
      report.candidates.find((candidate) => candidate.episodeSlug === "011-invalid")
    ).toMatchObject({ classification: "invalid_language_or_variant" });
    expect(
      report.candidates.find((candidate) => candidate.episodeSlug === "012-collision")
    ).toMatchObject({ classification: "target_collision" });
  });

  it("write mode performs only safe non-overwriting moves with rollback metadata", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(
      episodesRoot,
      "010-safe/source/010-safe-en-full.md",
      "Move me\n"
    );

    const report = await planEpisodeLayoutMigration({ episodesRoot, write: true });
    const candidate = report.candidates[0];

    expect(candidate).toMatchObject({
      classification: "safe_move",
      move: { performed: true },
    });
    expect(candidate?.move?.rollback.command).toContain("mv ");
    await expect(
      fs.readFile(path.join(episodesRoot, "010-safe/languages/script-en.md"), "utf8")
    ).resolves.toBe("Move me\n");
    await expect(
      fs.access(path.join(episodesRoot, "010-safe/source/010-safe-en-full.md"))
    ).rejects.toThrow();
  });

  it("registers a dry-run JSON CLI command", async () => {
    const episodesRoot = await createEpisodesRoot();
    await writeEpisodeFile(
      episodesRoot,
      "010-safe/source/010-safe-en-full.md",
      "Move me\n"
    );
    const program = new Command();
    const episode = program.command("episode");
    registerEpisodeLayoutMigrationCommand(episode);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let stdout = "";
    try {
      await program.parseAsync([
        "node",
        "cli",
        "episode",
        "migrate-layout",
        "--episodes-root",
        episodesRoot,
        "--dry-run",
        "--json",
      ]);
      stdout = String(output.mock.calls[0]?.[0] ?? "{}");
    } finally {
      output.mockRestore();
    }
    const payload = JSON.parse(stdout) as {
      readonly dryRun: boolean;
      readonly candidates: readonly unknown[];
    };
    expect(payload.dryRun).toBe(true);
    expect(payload.candidates).toHaveLength(1);
  });
});
