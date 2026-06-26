import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildConfigurationHash,
  buildOutputFiles,
  countWords,
  copyFileAtomicIfChanged,
  detectForbiddenPhrases,
  detectGenericFiller,
  discoverCanonicalSourceStories,
  estimateDurationSeconds,
  extractCanonicalStoryFacts,
  getLanguageProfile,
  parseCanonicalSourceFilename,
  parseCanonicalSourceStory,
  resolveDefaultOutputDirectory,
  resolveDefaultSourceDirectory,
  selectSourceCandidates,
  validateHashtags,
  validatePreservationChecklist,
  validateTitleAndThumbnail,
  validateWrittenMessagesPreserved,
  writeTextAtomicIfChanged,
} from "./index.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sourceFile = path.join(
  repoRoot,
  "content-ideas",
  "content",
  "dark-truth-episodes-multilingual-production-pack",
  "002-even-killers-can-lick",
  "en",
  "002-even-killers-can-lick-en-full.md"
);

describe("story localization helpers", () => {
  it("resolves the fixed default directories from the repository root", () => {
    expect(resolveDefaultSourceDirectory()).toBe(
      path.join(repoRoot, "content", "dark-truth-episodes-multilingual-production-pack")
    );
    expect(resolveDefaultOutputDirectory()).toBe(
      path.join(repoRoot, "content-ideas", "content", "dark-truth-episodes")
    );
  });

  it("parses canonical source filenames", () => {
    expect(
      parseCanonicalSourceFilename("002-even-killers-can-lick-en-full.md")
    ).toMatchObject({
      episodeNumber: "002",
      slug: "even-killers-can-lick",
    });
  });

  it("builds episode-prefixed output filenames", () => {
    expect(
      buildOutputFiles("/out", "002-even-killers-can-lick", "de")
    ).toEqual({
      full: "/out/002-even-killers-can-lick-de-full.md",
      short: "/out/002-even-killers-can-lick-de-short.md",
    });
  });

  it("discovers only canonical English full stories", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-discovery-"));
    const episodeDir = path.join(tempDir, "001-demo");
    await fs.mkdir(path.join(episodeDir, "en"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "de"), { recursive: true });
    await fs.writeFile(path.join(episodeDir, "en", "001-demo-en-full.md"), "# Episode 001 — Demo\n\n## Narration Script\n\nText\n\n## Episode Metadata\n**Episode number:** 001\n**Primary title:** Demo\n");
    await fs.writeFile(path.join(episodeDir, "en", "001-demo-en-short.md"), "# Short 001 — Demo");
    await fs.writeFile(path.join(episodeDir, "de", "001-demo-de-full.md"), "# Episode 001 — Demo");
    const discovered = await discoverCanonicalSourceStories(tempDir);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.filePath).toContain("001-demo-en-full.md");
  });

  it("matches explicit file selections against normalized absolute paths", () => {
    const selected = selectSourceCandidates(
      [
        {
          episodeNumber: "002",
          slug: "even-killers-can-lick",
          filePath: path.resolve(
            repoRoot,
            "content-ideas",
            "content",
            "dark-truth-episodes-multilingual-production-pack",
            "002-even-killers-can-lick",
            "en",
            "002-even-killers-can-lick-en-full.md"
          ),
        },
      ],
      {
        file: path.join(
          repoRoot,
          "content-ideas",
          "content",
          "dark-truth-episodes-multilingual-production-pack",
          "002-even-killers-can-lick",
          "en",
          "002-even-killers-can-lick-en-full.md"
        ),
      }
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.episodeNumber).toBe("002");
  });

  it("counts words and estimates spoken duration", () => {
    expect(countWords("One two three")).toBe(3);
    expect(Math.round(estimateDurationSeconds(180, 180))).toBe(60);
  });

  it("loads the language profile for Portuguese", () => {
    const profile = getLanguageProfile("pt");
    expect(profile.locale).toBe("pt-BR");
    expect(profile.shortWordRange.target).toBeGreaterThan(0);
  });

  it("detects title, thumbnail, hashtag, and preservation issues", () => {
    expect(validateTitleAndThumbnail("", "Valid thumb").length).toBeGreaterThan(0);
    expect(validateHashtags(["#Valid", "bad tag"])).toEqual(["bad tag"]);
    expect(validatePreservationChecklist({
      charactersPreserved: true,
      relationshipsPreserved: false,
      chronologyPreserved: true,
      criticalObjectsPreserved: true,
      cluesPreserved: true,
      writtenMessagesPreserved: true,
      primaryRevealPreserved: true,
      endingPreserved: true,
      noNewPlotElementsAdded: true,
    })).toContain("relationshipsPreserved");
  });

  it("detects generic filler and forbidden phrases", () => {
    expect(detectGenericFiller("The protagonist arrived.")).toContain("The protagonist");
    expect(detectForbiddenPhrases("Here is the translation of the story.")).toContain("Here is the translation");
  });

  it("preserves written messages semantically", () => {
    const missing = validateWrittenMessagesPreserved(
      {
        episodeNumber: "002",
        primaryTitle: "Test",
        characters: [],
        criticalObjects: [],
        criticalEvents: [],
        writtenMessages: ["HUMANS CAN LICK TOO"],
        threat: "threat",
        primaryReveal: "reveal",
        finalConsequence: "ending",
      },
      "A story without the note."
    );
    expect(missing).toEqual(["HUMANS CAN LICK TOO"]);
  });

  it("keeps cache hashes stable", () => {
    expect(buildConfigurationHash(["a", "b"])).toBe(buildConfigurationHash(["a", "b"]));
    expect(buildConfigurationHash(["a", "b"])).not.toBe(buildConfigurationHash(["a", "c"]));
  });

  it("writes files atomically and skips unchanged writes", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "story-localization-atomic-"));
    const filePath = path.join(tempDir, "note.txt");
    expect(await writeTextAtomicIfChanged(filePath, "hello", false)).toBe("written");
    expect(await writeTextAtomicIfChanged(filePath, "hello", false)).toBe("skipped");
    const copyPath = path.join(tempDir, "copy.txt");
    expect(await copyFileAtomicIfChanged(filePath, copyPath, false)).toBe("written");
    expect(await fs.readFile(copyPath, "utf8")).toBe("hello");
  });

  it("parses the canonical English source story and extracts facts", async () => {
    const parsed = await parseCanonicalSourceStory(sourceFile);
    const facts = extractCanonicalStoryFacts(parsed);
    expect(parsed.language).toBe("en");
    expect(facts.episodeNumber).toBe("002");
    expect(facts.characters.some((character) => character.name.includes("Elena"))).toBe(true);
    expect(facts.writtenMessages.join(" ")).toContain("HUMANS CAN LICK TOO");
  });
});
