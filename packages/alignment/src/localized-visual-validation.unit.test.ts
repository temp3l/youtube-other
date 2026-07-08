import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CanonicalVisualManifest,
  LocalizedAlignmentManifest,
} from "@mediaforge/domain";
import { validateLocalizedVisuals } from "./localized-visual-validation.js";

async function tempEpisodeDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "localized-visual-validation-"));
}

function canonicalManifest(
  variant: "full" | "short",
  imagePath = `visuals/${variant}/images/scene-001.png`
): CanonicalVisualManifest {
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    variant,
    canonicalLanguage: "en",
    schemaVersion: 1,
    createdAt: "2026-07-08T00:00:00.000Z",
    scenes: [
      {
        sceneId: "scene-001" as never,
        visualBeat: "A hallway under one dim light.",
        characters: [],
        location: "hallway",
        visibleElements: ["dim light"],
        continuityTags: ["hallway"],
        imagePath,
        minDurationSeconds: 4,
        maxDurationSeconds: 8,
      },
      {
        sceneId: "scene-002" as never,
        visualBeat: "A hand reaches for a door.",
        characters: [],
        location: "hallway",
        visibleElements: ["door"],
        continuityTags: ["hallway"],
        imagePath: `visuals/${variant}/images/scene-002.png`,
        minDurationSeconds: 2,
        maxDurationSeconds: 6,
      },
    ],
  };
}

function alignmentManifest(args: {
  readonly language: "en" | "de" | "es" | "fr" | "pt";
  readonly variant: "full" | "short";
  readonly manifestPath?: string;
  readonly firstDuration?: number;
  readonly sceneIds?: readonly string[];
}): LocalizedAlignmentManifest {
  const sceneIds = args.sceneIds ?? ["scene-001", "scene-002"];
  let cursor = 0;
  return {
    episodeSlug: "022-the-whistler-in-the-woods" as never,
    language: args.language,
    variant: args.variant,
    canonicalVisualManifestPath:
      args.manifestPath ?? `visuals/${args.variant}/scene-plan.json`,
    schemaVersion: 1,
    createdAt: "2026-07-08T00:00:00.000Z",
    alignments: sceneIds.map((sceneId, index) => {
      const duration = index === 0 ? (args.firstDuration ?? 6) : 3;
      const row = {
        language: args.language,
        variant: args.variant,
        sceneId: sceneId as never,
        narrationText: `${args.language} narration for ${sceneId}`,
        audioStartSeconds: cursor,
        audioEndSeconds: cursor + duration,
      };
      cursor += duration;
      return row;
    }),
  };
}

async function writeImages(episodeDir: string, variant: "full" | "short"): Promise<void> {
  const imageDir = path.join(episodeDir, "visuals", variant, "images");
  await fs.mkdir(imageDir, { recursive: true });
  await fs.writeFile(path.join(imageDir, "scene-001.png"), "one");
  await fs.writeFile(path.join(imageDir, "scene-002.png"), "two");
}

describe("localized visual validation", () => {
  it("marks equal-duration English full alignment safe", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "full");

    const report = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("full"),
      alignmentManifest: alignmentManifest({ language: "en", variant: "full" }),
      now: new Date("2026-07-08T00:00:00.000Z"),
    });

    expect(report.status).toBe("safe");
    expect(report.issues).toEqual([]);
  });

  it("warns for longer German full scenes and shorter French full scenes", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "full");

    const german = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("full"),
      alignmentManifest: alignmentManifest({ language: "de", variant: "full", firstDuration: 12 }),
    });
    const french = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("full"),
      alignmentManifest: alignmentManifest({ language: "fr", variant: "full", firstDuration: 1 }),
    });

    expect(german.status).toBe("warn");
    expect(french.status).toBe("warn");
  });

  it("supports longer Spanish short and shorter Portuguese short alignment warnings", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "short");

    const spanish = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("short"),
      alignmentManifest: alignmentManifest({ language: "es", variant: "short", firstDuration: 12 }),
    });
    const portuguese = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("short"),
      alignmentManifest: alignmentManifest({ language: "pt", variant: "short", firstDuration: 1 }),
    });

    expect(spanish.status).toBe("warn");
    expect(portuguese.status).toBe("warn");
  });

  it("blocks invalid cross-variant manifest references and reordered scenes", async () => {
    const episodeDir = await tempEpisodeDir();
    await writeImages(episodeDir, "short");

    const report = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("short"),
      alignmentManifest: alignmentManifest({
        language: "de",
        variant: "short",
        manifestPath: "visuals/full/scene-plan.json",
        sceneIds: ["scene-002", "scene-001"],
      }),
    });

    expect(report.status).toBe("block");
    expect(report.issues.map((entry) => entry.reason).join("\n")).toContain(
      "expected visuals/short/scene-plan.json"
    );
    expect(report.issues.map((entry) => entry.reason).join("\n")).toContain(
      "reorders canonical visual scene IDs"
    );
  });

  it("blocks missing localized alignment and missing short images without full fallback", async () => {
    const episodeDir = await tempEpisodeDir();
    await fs.mkdir(path.join(episodeDir, "visuals/full/images"), { recursive: true });
    await fs.writeFile(path.join(episodeDir, "visuals/full/images/scene-001.png"), "full");
    await fs.writeFile(path.join(episodeDir, "visuals/full/images/scene-002.png"), "full");

    const report = await validateLocalizedVisuals({
      episodeDir,
      canonicalManifest: canonicalManifest("short"),
      alignmentManifest: alignmentManifest({
        language: "pt",
        variant: "short",
        sceneIds: ["scene-001"],
      }),
    });

    expect(report.status).toBe("block");
    expect(report.issues.map((entry) => entry.reason).join("\n")).toContain(
      "missing canonical scene scene-002"
    );
    expect(report.issues.map((entry) => entry.recommendation).join("\n")).toContain(
      "Full-video image fallback is disabled for short renders."
    );
  });
});
