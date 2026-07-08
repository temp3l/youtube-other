import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CanonicalVisualManifest,
  LocalizedAlignmentManifest,
  LocalizedVisualValidationReport,
} from "@mediaforge/domain";
import { resolveSharedVisualRenderTimeline } from "./shared-visual-render.js";

async function tempEpisodeDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "shared-visual-render-"));
}

function manifest(variant: "full" | "short", sceneCount = 1): CanonicalVisualManifest {
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    variant,
    canonicalLanguage: "en",
    schemaVersion: 1,
    createdAt: "2026-07-08T00:00:00.000Z",
    scenes: Array.from({ length: sceneCount }, (_, index) => {
      const sceneId = `scene-${String(index + 1).padStart(3, "0")}` as never;
      return {
        sceneId,
        visualBeat: `Visual beat ${index + 1}`,
        characters: [],
        continuityTags: [],
        imagePath: `visuals/${variant}/images/${sceneId}.png`,
      };
    }),
  };
}

function alignment(args: {
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly variant: "full" | "short";
  readonly durations: readonly number[];
}): LocalizedAlignmentManifest {
  let cursor = 0;
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    language: args.language,
    variant: args.variant,
    canonicalVisualManifestPath: `visuals/${args.variant}/scene-plan.json`,
    schemaVersion: 1,
    createdAt: "2026-07-08T00:00:00.000Z",
    alignments: args.durations.map((duration, index) => {
      const sceneId = `scene-${String(index + 1).padStart(3, "0")}` as never;
      const row = {
        language: args.language,
        variant: args.variant,
        sceneId,
        narrationText: `${args.language} narration`,
        audioStartSeconds: cursor,
        audioEndSeconds: cursor + duration,
      };
      cursor += duration;
      return row;
    }),
  };
}

function validation(args: {
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly variant: "full" | "short";
  readonly status?: "safe" | "warn" | "block";
}): LocalizedVisualValidationReport {
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    language: args.language,
    variant: args.variant,
    status: args.status ?? "safe",
    issues: [],
    createdAt: "2026-07-08T00:00:00.000Z",
  };
}

async function writeImages(
  episodeDir: string,
  variant: "full" | "short",
  sceneCount = 1
): Promise<void> {
  const imageDir = path.join(episodeDir, "visuals", variant, "images");
  await fs.mkdir(imageDir, { recursive: true });
  for (let index = 0; index < sceneCount; index += 1) {
    const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
    await fs.writeFile(path.join(imageDir, `${sceneId}.png`), sceneId);
  }
}

describe("shared visual render timeline", () => {
  it("maps English and German full renders to the same canonical full images", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "full", 2);

    const english = await resolveSharedVisualRenderTimeline({
      episodeDir,
      canonicalManifest: manifest("full", 2),
      alignmentManifest: alignment({ language: "en", variant: "full", durations: [3, 4] }),
      validationReport: validation({ language: "en", variant: "full" }),
    });
    const german = await resolveSharedVisualRenderTimeline({
      episodeDir,
      canonicalManifest: manifest("full", 2),
      alignmentManifest: alignment({ language: "de", variant: "full", durations: [7, 2] }),
      validationReport: validation({ language: "de", variant: "full", status: "warn" }),
    });

    expect(english.map((segment) => segment.imagePath)).toEqual(
      german.map((segment) => segment.imagePath)
    );
    expect(german.map((segment) => segment.durationSeconds)).toEqual([7, 2]);
  });

  it("maps Spanish, French, and Portuguese short renders only to short images", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "short");

    for (const language of ["es", "fr", "pt"] as const) {
      const timeline = await resolveSharedVisualRenderTimeline({
        episodeDir,
        canonicalManifest: manifest("short"),
        alignmentManifest: alignment({ language, variant: "short", durations: [5] }),
        validationReport: validation({ language, variant: "short" }),
      });
      expect(timeline[0]?.imagePath).toContain(path.join("visuals", "short", "images"));
      expect(timeline[0]?.imagePath).not.toContain(path.join("visuals", "full", "images"));
    }
  });

  it("fails for missing short images without falling back to full images", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "full");

    await expect(
      resolveSharedVisualRenderTimeline({
        episodeDir,
        canonicalManifest: manifest("short"),
        alignmentManifest: alignment({ language: "en", variant: "short", durations: [3] }),
        validationReport: validation({ language: "en", variant: "short" }),
      })
    ).rejects.toThrow("Full-video image fallback is disabled for short renders.");
  });

  it("fails before rendering when validation is blocked", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "full");

    await expect(
      resolveSharedVisualRenderTimeline({
        episodeDir,
        canonicalManifest: manifest("full"),
        alignmentManifest: alignment({ language: "de", variant: "full", durations: [3] }),
        validationReport: validation({ language: "de", variant: "full", status: "block" }),
      })
    ).rejects.toThrow("Localized visual validation blocked de/full render.");
  });

  it("rejects full renders that reference short images", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "short");
    const wrongManifest = manifest("full");
    wrongManifest.scenes[0] = {
      ...wrongManifest.scenes[0]!,
      imagePath: "visuals/short/images/scene-001.png",
    };

    await expect(
      resolveSharedVisualRenderTimeline({
        episodeDir,
        canonicalManifest: wrongManifest,
        alignmentManifest: alignment({ language: "en", variant: "full", durations: [3] }),
        validationReport: validation({ language: "en", variant: "full" }),
      })
    ).rejects.toThrow("full render references the wrong variant image path");
  });
});
