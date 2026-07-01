import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  THUMBNAIL_DEFAULT_STYLE,
  THUMBNAIL_FONT_FAMILY,
  THUMBNAIL_OUTPUTS,
  THUMBNAIL_TEXT_LAYOUT_VERSION,
  buildOpenAiThumbnailRequestBody,
  compileStoryThumbnailPrompt,
  compositeStoryThumbnailText,
  computeBackgroundFingerprint,
  computeCompositionFingerprint,
  generateStoryThumbnail,
  loadThumbnailGenerationConfig,
  normalizeThumbnailBackground,
  readThumbnailStoryFile,
  resolveThumbnailReference,
  selectThumbnailEmphasisWord,
  ThumbnailArtifactConflictError,
  ThumbnailReferenceValidationError,
} from "./story-thumbnail.js";

function makeInput(workspaceRoot: string) {
  return {
    workspaceRoot,
    episodeSlug: "018-the-smiling-man",
    episodeNumber: 18,
    locale: "de",
    format: "full" as const,
    style: "cinematic-horror" as const,
    hookText: "ER FOLGTE IHR NACH HAUSE",
    storyTitle: "The Smiling Man",
    storySummary: "A woman notices a smiling stranger pacing under moonlight.",
    protagonistDescription: "an adult woman backing away in fear",
    threatDescription: "a tall smiling man lurking deeper in the street",
    settingDescription: "an empty suburban road at night",
    moodDescription: "dread and rising panic",
    keyVisualMoment: "she realizes the smiling figure is following her home",
  };
}

async function createPng(
  width: number,
  height: number,
  color = "#101820"
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe("thumbnail reference resolver", () => {
  it("resolves repository-root defaults and validates orientation", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const config = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
    });
    const full = await resolveThumbnailReference({
      repoRoot,
      format: "full",
      config,
    });
    const short = await resolveThumbnailReference({
      repoRoot,
      format: "short",
      config,
    });
    expect(full.repoRelativePath).toBe("reference-thumbnails/thumbnail-full.png");
    expect(short.repoRelativePath).toBe("reference-thumbnails/thumbnail-short.png");
    expect(full.width).toBeGreaterThan(full.height);
    expect(short.height).toBeGreaterThan(short.width);
    expect(full.sha256).not.toBe(short.sha256);
  });

  it("rejects paths outside the repo and wrong orientation", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const config = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
    });
    await expect(
      resolveThumbnailReference({
        repoRoot,
        format: "full",
        overridePath: "/tmp/outside.png",
        config,
      })
    ).rejects.toBeInstanceOf(ThumbnailReferenceValidationError);

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "thumb-ref-invalid-"));
    const portraitPath = path.join(tempDir, "portrait.png");
    await fs.writeFile(portraitPath, await createPng(600, 900));
    await expect(
      resolveThumbnailReference({
        repoRoot: tempDir,
        format: "full",
        overridePath: portraitPath,
        config,
      })
    ).rejects.toBeInstanceOf(ThumbnailReferenceValidationError);
  });
});

describe("thumbnail prompt compiler", () => {
  it("is deterministic and differentiates full versus short composition", async () => {
    const settings = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
    });
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-prompt-"));
    const fullInput = makeInput(workspaceRoot);
    const fullReference = await resolveThumbnailReference({
      repoRoot,
      format: "full",
      config: settings,
    });
    const shortReference = await resolveThumbnailReference({
      repoRoot,
      format: "short",
      config: settings,
    });
    const first = compileStoryThumbnailPrompt(fullInput, settings, fullReference);
    const second = compileStoryThumbnailPrompt(fullInput, settings, fullReference);
    const shortPrompt = compileStoryThumbnailPrompt(
      { ...fullInput, format: "short" as const },
      settings,
      shortReference
    );
    expect(first).toEqual(second);
    expect(first.prompt).toContain("Use the supplied image only as a visual style and composition reference.");
    expect(first.prompt).toContain("Do not copy:");
    expect(first.prompt).toContain("Do not render any text");
    expect(first.prompt).toContain("reserve natural dark negative space on the left 35% to 42%");
    expect(shortPrompt.prompt).toContain("dedicated portrait composition");
  });

  it("changes only the relevant fingerprints", () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-fp-"));
    const input = makeInput(workspaceRoot);
    const background = computeBackgroundFingerprint({
      input,
      style: THUMBNAIL_DEFAULT_STYLE,
      prompt: {
        prompt: "x",
        version: "v",
        fingerprint: "p",
        sourceFingerprint: "s",
        format: "full",
        style: "cinematic-horror",
        referencePath: "reference-thumbnails/thumbnail-full.png",
        referenceSha256: "a".repeat(64),
      },
      config: { model: "gpt-image-2", quality: "high" },
    });
    const changedTextBackground = computeBackgroundFingerprint({
      input: { ...input, hookText: "ER LÄCHELTE WEITER" },
      style: THUMBNAIL_DEFAULT_STYLE,
      prompt: {
        prompt: "x",
        version: "v",
        fingerprint: "p",
        sourceFingerprint: "s",
        format: "full",
        style: "cinematic-horror",
        referencePath: "reference-thumbnails/thumbnail-full.png",
        referenceSha256: "a".repeat(64),
      },
      config: { model: "gpt-image-2", quality: "high" },
    });
    const composition = computeCompositionFingerprint({
      input,
      style: THUMBNAIL_DEFAULT_STYLE,
      backgroundFingerprint: background,
      emphasisWord: "FOLGTE",
      fontFamily: THUMBNAIL_FONT_FAMILY,
      textLayoutVersion: THUMBNAIL_TEXT_LAYOUT_VERSION,
    });
    const changedComposition = computeCompositionFingerprint({
      input: { ...input, hookText: "ER LÄCHELTE WEITER" },
      style: THUMBNAIL_DEFAULT_STYLE,
      backgroundFingerprint: background,
      emphasisWord: "LÄCHELTE",
      fontFamily: THUMBNAIL_FONT_FAMILY,
      textLayoutVersion: THUMBNAIL_TEXT_LAYOUT_VERSION,
    });
    expect(changedTextBackground).toBe(background);
    expect(changedComposition).not.toBe(composition);
  });

  it("selects a deterministic emphasis word", () => {
    expect(selectThumbnailEmphasisWord("HE FOLLOWED HER HOME", "en")).toBe("FOLLOWED");
    expect(selectThumbnailEmphasisWord("ER FOLGTE IHR NACH HAUSE", "de")).toBe("FOLGTE");
  });
});

describe("thumbnail adapter and compositor", () => {
  it("builds an OpenAI edit request with the reference attachment", async () => {
    const settings = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_THUMBNAIL_MODEL: "gpt-image-2",
      OPENAI_THUMBNAIL_QUALITY: "high",
    });
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "thumb-request-"));
    const referencePath = path.join(tempDir, "reference.png");
    await fs.writeFile(referencePath, Buffer.from("placeholder"));
    const body = buildOpenAiThumbnailRequestBody({
      input: makeInput("/tmp/workspace"),
      settings,
      promptText: "Prompt",
      referenceImagePath: referencePath,
    });
    expect(body.model).toBe("gpt-image-2");
    expect(body.size).toBe("1536x1024");
    expect(body.quality).toBe("high");
    expect(body.output_format).toBe("png");
    expect(body.background).toBe("opaque");
    expect(body.n).toBe(1);
    expect(body.input_fidelity).toBe("high");
  });

  it("normalizes backgrounds and composes exact localized text at final dimensions", async () => {
    const normalized = await normalizeThumbnailBackground({
      imageBuffer: await createPng(1536, 1024, "#1a2233"),
      format: "full",
    });
    const output = await compositeStoryThumbnailText({
      background: normalized,
      input: {
        format: "full",
        locale: "de",
        hookText: "ER FOLGTE IHR NACH HAUSE",
        style: "cinematic-horror",
      },
      emphasisWord: "FOLGTE",
    });
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(THUMBNAIL_OUTPUTS.full.width);
    expect(metadata.height).toBe(THUMBNAIL_OUTPUTS.full.height);
  });
});

describe("thumbnail persistence and reuse", () => {
  it("writes background and final manifests, then reuses the background on text-only changes", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-persist-"));
    const settings = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
      THUMBNAIL_MAX_RETRIES: "0",
    });
    const generatorImage = await createPng(1536, 1024, "#20263a");
    const client = {
      images: {
        edit: vi.fn(async () => ({
          data: [{ b64_json: generatorImage.toString("base64") }],
        })),
      },
    };
    const first = await generateStoryThumbnail(makeInput(workspaceRoot), {
      settings,
      client,
    });
    expect(first.generated).toBe(true);
    expect(await fs.stat(first.backgroundPath)).toBeTruthy();
    expect(await fs.stat(first.outputPath)).toBeTruthy();

    const second = await generateStoryThumbnail(
      {
        ...makeInput(workspaceRoot),
        hookText: "ER LÄCHELTE WEITER",
        force: true,
      },
      { settings, client }
    );
    expect(second.backgroundReused).toBe(true);
    expect(second.generated).toBe(true);
    expect(client.images.edit).toHaveBeenCalledTimes(1);
  });

  it("throws a conflict when the targeted final artifact changes without force", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-conflict-"));
    const settings = loadThumbnailGenerationConfig({
      OPENAI_API_KEY: "test-key",
    });
    const generatorImage = await createPng(1536, 1024, "#18202d");
    const client = {
      images: {
        edit: vi.fn(async () => ({
          data: [{ b64_json: generatorImage.toString("base64") }],
        })),
      },
    };
    await generateStoryThumbnail(makeInput(workspaceRoot), {
      settings,
      client,
    });
    await expect(
      generateStoryThumbnail(
        { ...makeInput(workspaceRoot), hookText: "ER LÄCHELTE WEITER" },
        {
          settings,
          client,
        }
      )
    ).rejects.toBeInstanceOf(ThumbnailArtifactConflictError);
  });
});

describe("thumbnail story file", () => {
  it("reads the expanded story schema", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "thumb-story-"));
    const storyPath = path.join(workspaceRoot, "story.json");
    await fs.writeFile(
      storyPath,
      JSON.stringify({
        episodeNumber: 18,
        title: "The Smiling Man",
        summary: "A smiling figure keeps following her.",
        protagonist: "an adult woman in fear",
        threat: "a smiling man in shadow",
        setting: "a dark street",
        mood: "dread",
        thumbnailConcept: "the woman looks back and sees him still smiling",
      })
    );
    const story = await readThumbnailStoryFile({
      workspaceRoot,
      storyFilePath: storyPath,
    });
    expect(story.storyTitle).toBe("The Smiling Man");
    expect(story.keyVisualMoment).toContain("still smiling");
    expect(story.protagonistDescription).toContain("adult woman");
  });
});
