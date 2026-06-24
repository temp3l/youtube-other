import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEpisodeLoadResult,
  createApprovalRecord,
} from "@mediaforge/dark-truth";
import { hashFile } from "@mediaforge/shared";
import {
  commandEpisodeLocalized,
  commandEpisodeShort,
} from "./episode-commands.js";

const sourceRoot = path.resolve(
  "content-ideas/content/dark-truth-episodes-multilingual-production-pack"
);
const episodeSlug = "001-the-forbidden-village-where-japan-s-laws-do-not-apply";
const englishFullSource = path.join(
  sourceRoot,
  episodeSlug,
  "en",
  `${episodeSlug}-en-full.md`
);
const germanFullSource = path.join(
  sourceRoot,
  episodeSlug,
  "de",
  `${episodeSlug}-de-full.md`
);

async function approveCurrentManifest(
  outputRoot: string,
  sourceFile: string,
  language: "en" | "de" | "es" | "fr"
): Promise<string> {
  const result = await buildEpisodeLoadResult(sourceFile, outputRoot);
  const manifestHash = await hashFile(result.paths.generationManifestJson);
  await createApprovalRecord(
    path.join(outputRoot, episodeSlug, "reviews", language, "full"),
    {
      episodeId: episodeSlug,
      language,
      artifactType: "full",
      artifactPath: result.paths.generationManifestJson,
      artifactSha256: manifestHash,
      generationManifestSha256: manifestHash,
      sourceSha256: result.source.sourceSha256,
      reviewer: "steph",
      reviewedAt: new Date().toISOString(),
      decision: "approved",
    }
  );
  return result.paths.generationManifestJson;
}

async function mutateManifest(manifestPath: string): Promise<void> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  raw.generatedAt = new Date(Date.now() + 1000).toISOString();
  await fs.writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}

describe("episode commands", () => {
  it("rejects unsupported language codes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, englishFullSource, "en");
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de,xx",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Unsupported language code: xx");
  });

  it("rejects stale English approvals before localized generation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const manifestPath = await approveCurrentManifest(
      outputRoot,
      englishFullSource,
      "en"
    );
    await mutateManifest(manifestPath);
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Approval is stale");
  });

  it("rejects disabling image reuse", async () => {
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot: path.join(
          await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-")),
          "episodes"
        ),
        languages: "de,es,fr",
        reuseImages: false,
        dryRun: true,
      })
    ).rejects.toThrow("--reuse-images");
  });

  it("blocks localized generation before English approval", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de,es,fr",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Missing approval");
    expect(await fs.stat(outputRoot).catch(() => null)).toBeNull();
  });

  it("allows localized generation after current English approval and keeps images untouched in dry-run mode", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, englishFullSource, "en");

    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).resolves.toBeUndefined();
    expect(
      await fs
        .stat(
          path.join(
            outputRoot,
            episodeSlug,
            "shared",
            "images",
            "image-manifest.json"
          )
        )
        .catch(() => null)
    ).toBeNull();
  });

  it("requires German approval before the German Short", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Missing approval");
  });

  it("allows the German Short after German approval in dry-run mode without new images", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, germanFullSource, "de");

    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).resolves.toBeUndefined();
    expect(
      await fs
        .stat(
          path.join(
            outputRoot,
            episodeSlug,
            "shared",
            "images",
            "image-manifest.json"
          )
        )
        .catch(() => null)
    ).toBeNull();
  });

  it("rejects stale German approvals before the German Short", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const manifestPath = await approveCurrentManifest(
      outputRoot,
      germanFullSource,
      "de"
    );
    await mutateManifest(manifestPath);
    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Approval is stale");
  });
});
