import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VERONICA_PLANNING_TIMING_POLICY } from "@mediaforge/domain";
import { assertCanonicalVeronicaProductionSource } from "./veronica-content-pack-2-ingestion.js";
import {
  hashVeronicaNarration,
  assessVeronicaShortTiming,
  parseVeronicaCanonicalPackDocuments,
  resolveVeronicaContentSource,
  resolveVeronicaLocalizedNarration,
  validateVeronicaContentSource,
  veronicaSeriesPlanSchema,
  veronicaUnifiedPackManifestSchema,
} from "./veronica-content-source.js";

const repositoryRoot = path.resolve(".");
const packRoot = path.join(repositoryRoot, "content-packs", "veronica-unified-content-pack-v3");
const temporaryDirectories: string[] = [];

async function readPackDocuments() {
  const [manifest, seriesPlan] = await Promise.all([
    fs.readFile(path.join(packRoot, "manifest.json"), "utf8").then((value) =>
      veronicaUnifiedPackManifestSchema.parse(JSON.parse(value) as unknown)),
    fs.readFile(path.join(packRoot, "metadata", "series-plan-v2.json"), "utf8").then((value) =>
      veronicaSeriesPlanSchema.parse(JSON.parse(value) as unknown)),
  ]);
  return { manifest, seriesPlan };
}

async function temporaryRepository(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(root);
  await Promise.all([
    fs.writeFile(path.join(root, "package.json"), "{}\n"),
    fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n"),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })));
});

describe("canonical Veronica content source", () => {
  it("resolves the one configured pack and indexes the 18-episode corpus", async () => {
    const source = await resolveVeronicaContentSource({ repositoryRoot, useCache: false });
    const episodeSeven = source.registry.episodeByOrder.get(7);

    expect(source.config.allowLegacyFallback).toBe(false);
    expect(source.registry.stories).toHaveLength(54);
    expect(source.registry.episodes).toHaveLength(18);
    expect(source.registry.stories.filter((story) => story.kind === "long")).toHaveLength(18);
    expect(source.registry.stories.filter((story) => story.kind === "short")).toHaveLength(36);
    expect(episodeSeven?.long.storyId).toBe("osc-l04");
    expect(episodeSeven?.shorts.map((story) => story.storyId)).toEqual(["osc-s04a", "osc-s04b"]);
  });

  it("fails closed when only legacy packs exist", async () => {
    const root = await temporaryRepository("veronica-no-canonical-");
    await fs.mkdir(path.join(root, "content-packs", "veronica-content-pack-1"), { recursive: true });
    await fs.mkdir(path.join(root, "content-packs", "veronica-content-pack-2"), { recursive: true });

    await expect(resolveVeronicaContentSource({ repositoryRoot: root, useCache: false }))
      .rejects.toMatchObject({ code: "VERONICA_CANONICAL_PACK_NOT_FOUND" });
  });

  it("rejects a narration symlink that escapes the canonical pack", async () => {
    const root = await temporaryRepository("veronica-symlink-escape-");
    const copiedPack = path.join(root, "content-packs", "veronica-unified-content-pack-v3");
    await fs.cp(packRoot, copiedPack, { recursive: true });
    const manifest = veronicaUnifiedPackManifestSchema.parse(JSON.parse(
      await fs.readFile(path.join(copiedPack, "manifest.json"), "utf8"),
    ) as unknown);
    const target = path.join(copiedPack, manifest.stories[0]!.paths.en!);
    const outside = path.join(root, "outside.md");
    await fs.writeFile(outside, "outside narration\n");
    await fs.unlink(target);
    await fs.symlink(outside, target);

    await expect(resolveVeronicaContentSource({ repositoryRoot: root, useCache: false }))
      .rejects.toMatchObject({ code: "VERONICA_CANONICAL_MANIFEST_INVALID" });
  });

  it("rejects duplicate IDs, invalid kinds/locales, path escapes, duplicate assignments, and orphans", async () => {
    const documents = await readPackDocuments();
    const first = documents.manifest.stories[0]!;
    const second = documents.manifest.stories[1]!;
    const duplicate = { ...documents.manifest, stories: [first, { ...second, id: first.id }, ...documents.manifest.stories.slice(2)] };
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: duplicate, seriesPlan: documents.seriesPlan }))
      .toThrow(/duplicate story ID/u);

    const invalidKind = { ...documents.manifest, stories: [{ ...first, format: "clip" }, ...documents.manifest.stories.slice(1)] };
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: invalidKind, seriesPlan: documents.seriesPlan })).toThrow();

    const invalidLocale = { ...documents.manifest, stories: [{ ...first, locales: ["en", "nl"] }, ...documents.manifest.stories.slice(1)] };
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: invalidLocale, seriesPlan: documents.seriesPlan })).toThrow();

    const escapedPath = { ...documents.manifest, stories: [{ ...first, paths: { ...first.paths, en: "../escape.md" } }, ...documents.manifest.stories.slice(1)] };
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: escapedPath, seriesPlan: documents.seriesPlan })).toThrow(/contained portable relative path/u);

    const duplicatePlan = documents.seriesPlan.map((episode, index) => index === 1
      ? { ...episode, long_id: documents.seriesPlan[0]!.long_id }
      : episode);
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: documents.manifest, seriesPlan: duplicatePlan }))
      .toThrow(/duplicate episode assignment/u);

    const orphanPlan = documents.seriesPlan.map((episode, index) => index === 17
      ? { ...episode, short_b_id: "missing-story" }
      : episode);
    expect(() => parseVeronicaCanonicalPackDocuments({ manifest: documents.manifest, seriesPlan: orphanPlan }))
      .toThrow(/short slot is invalid/u);
  });

  it("resolves exact locales and never substitutes English for a missing translation", async () => {
    const source = await resolveVeronicaContentSource({ repositoryRoot, useCache: false });
    expect(resolveVeronicaLocalizedNarration({ registry: source.registry, storyId: "osc-l01", locale: "de" }).locale).toBe("de");
    expect(resolveVeronicaLocalizedNarration({ registry: source.registry, storyId: "tx-l004", locale: "de" }).locale).toBe("de");
  });

  it("uses the centralized WPM policy and deterministic normalized hashes", async () => {
    expect(VERONICA_PLANNING_TIMING_POLICY.long.wpm).toEqual({ en: 150, de: 145, es: 150, fr: 150, it: 150, pt: 150 });
    expect(VERONICA_PLANNING_TIMING_POLICY.short.wpm).toEqual({ en: 155, de: 150, es: 155, fr: 155, it: 155, pt: 155 });
    expect(VERONICA_PLANNING_TIMING_POLICY.short.englishWordPolicy).toEqual({
      preferred: [215, 225], actionableWarning: [226, 230], hardMinimum: 215, hardMaximum: 230,
    });
    expect(hashVeronicaNarration("One line.\r\n\r\nTwo.   ")).toBe(hashVeronicaNarration("One line.\n\nTwo.\n"));
    expect(hashVeronicaNarration("One line.\n")).not.toBe(hashVeronicaNarration("Changed line.\n"));

    const result = await validateVeronicaContentSource({ repositoryRoot });
    expect(result).toMatchObject({ episodes: 18, longs: 18, shorts: 36, canonicalEnglishAssets: 54, paidProviderCalls: 0 });
    expect(result.timingViolations).toHaveLength(0);
    expect(result.missingTranslations).toHaveLength(0);
  });

  it("classifies English Short timing as preferred, actionable warning, or blocker", () => {
    expect(assessVeronicaShortTiming({ locale: "en", wordCount: 215 })).toBe("preferred");
    expect(assessVeronicaShortTiming({ locale: "en", wordCount: 225 })).toBe("preferred");
    expect(assessVeronicaShortTiming({ locale: "en", wordCount: 226 })).toBe("warning");
    expect(assessVeronicaShortTiming({ locale: "en", wordCount: 230 })).toBe("warning");
    expect(assessVeronicaShortTiming({ locale: "en", wordCount: 231 })).toBe("blocked");
  });

  it("forbids legacy source descriptors at the production planning boundary", () => {
    expect(() => assertCanonicalVeronicaProductionSource({
      sourcePackId: "veronica-content-pack-2",
    } as never)).toThrow(/VERONICA_LEGACY_PACK_FORBIDDEN/u);
  });
});
