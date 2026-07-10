import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: path.join(os.tmpdir(), "story-render-workspace", "episodes"),
  })),
}));

import {
  buildPlannedStoryWorkflowManifest,
  StoryWorkflowManifestStore,
} from "@mediaforge/story-localization";
import {
  createEpisodePathResolver,
  hashText,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  createNarrationArtifactPaths,
  NARRATION_ARTIFACT_SCHEMA_VERSION,
} from "@mediaforge/speech";
import { FFmpegVideoRenderer } from "@mediaforge/rendering";
import {
  commandStoriesProductionRepair,
  commandStoriesRender,
} from "./story-render-command.js";

function makeOutput() {
  let text = "";
  return {
    stdout: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    read() {
      return text;
    },
  };
}

async function writePng(
  filePath: string,
  width: number,
  height: number
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#556677",
    },
  })
    .png()
    .toFile(filePath);
}

async function createRenderFixture(args: {
  readonly locales: readonly ("en" | "de")[];
  readonly imageSize: { readonly width: number; readonly height: number };
  readonly withAudioLocales: readonly ("en" | "de")[];
  readonly withCaptionLocales?: readonly ("en" | "de")[];
}): Promise<{ readonly root: string; readonly episodesRoot: string; readonly episodeId: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-render-command-"));
  const episodesRoot = path.join(root, "episodes");
  const episodeId = "009-the-christmas-doll";
  const episodeDir = path.join(episodesRoot, episodeId);
  const resolver = createEpisodePathResolver(root);
  const manifest = buildPlannedStoryWorkflowManifest({
    episodeId,
    locales: args.locales,
    formats: ["full"],
    createdAt: "2026-07-09T00:00:00.000Z",
    dryRun: true,
  });
  await new StoryWorkflowManifestStore(episodesRoot, episodeId).create(manifest);

  const canonicalManifestPath = resolver.canonicalVisualManifest(episodeId, "full");
  await writeJsonAtomic(canonicalManifestPath, {
    episodeSlug: episodeId,
    variant: "full",
    canonicalLanguage: "en",
    schemaVersion: 1,
    createdAt: "2026-07-09T00:00:00.000Z",
    scenes: [
      {
        sceneId: "scene-001",
        visualBeat: "A candlelit room.",
        characters: [],
        continuityTags: [],
        imagePath: "visuals/full/images/scene-001.png",
      },
    ],
  });
  await writePng(
    path.join(episodeDir, "visuals", "full", "images", "scene-001.png"),
    args.imageSize.width,
    args.imageSize.height
  );

  for (const locale of args.locales) {
    await writeJsonAtomic(
      resolver.localizedAlignment(episodeId, locale, "full"),
      {
        episodeSlug: episodeId,
        language: locale,
        variant: "full",
        canonicalVisualManifestPath: "visuals/full/scene-plan.json",
        schemaVersion: 1,
        createdAt: "2026-07-09T00:00:00.000Z",
        alignments: [
          {
            language: locale,
            variant: "full",
            sceneId: "scene-001",
            narrationText: `${locale} narration`,
            audioStartSeconds: 0,
            audioEndSeconds: 3,
          },
        ],
      }
    );
    await writeJsonAtomic(
      resolver.localizedVisualValidation(episodeId, locale, "full"),
      {
        episodeSlug: episodeId,
        language: locale,
        variant: "full",
        status: "safe",
        issues: [],
        createdAt: "2026-07-09T00:00:00.000Z",
      }
    );
    if (args.withAudioLocales.includes(locale)) {
      const context = { episodeId, locale, variant: "full" as const };
      const narrationPath = resolver.audioNarration(context);
      await fs.mkdir(path.dirname(narrationPath), { recursive: true });
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=24000:cl=mono",
          "-t",
          "3",
          narrationPath,
        ],
        { stdio: "ignore" }
      );
      const qualityGatePath = createNarrationArtifactPaths({
        episodeId,
        locale,
        variant: "full",
        episodeRoot: episodeDir,
      }).qualityGateJson;
      await fs.mkdir(path.dirname(qualityGatePath), { recursive: true });
      await writeJsonAtomic(
        qualityGatePath,
        {
          schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
          episodeId,
          locale,
          variant: "full",
          outcome: "READY",
          inputArtifactFingerprints: ["a".repeat(64)],
          checks: [],
          warningCount: 0,
          errorCount: 0,
          fallbackSummary: {
            used: false,
            count: 0,
            reasons: [],
          },
          compatibilityOutputStatus: "written",
          cleanNarrationPath: "clean-narration.wav",
          reportFingerprint: hashText(`${episodeId}:${locale}:quality`),
          createdAt: "2026-07-09T00:00:00.000Z",
        }
      );
    }
    if (args.withCaptionLocales?.includes(locale)) {
      const captionsPath = resolver.captionsFile(
        { episodeId, locale, variant: "full" },
        "ass"
      );
      await fs.mkdir(path.dirname(captionsPath), { recursive: true });
      await fs.writeFile(
        captionsPath,
        "[Script Info]\nTitle: captions\n\n[V4+ Styles]\n\n[Events]\n",
        "utf8"
      );
    }
  }

  return { root, episodesRoot, episodeId };
}

describe("story render command", () => {
  it("skips blocked outputs instead of throwing when only-ready is set", async () => {
    const fixture = await createRenderFixture({
      locales: ["de"],
      imageSize: { width: 1536, height: 864 },
      withAudioLocales: [],
    });
    const renderSpy = vi
      .spyOn(FFmpegVideoRenderer.prototype, "render")
      .mockResolvedValue({
        cleanPath: path.join(fixture.episodesRoot, fixture.episodeId, "ok.mp4"),
        validation: {
          valid: true,
          width: 1920,
          height: 1080,
          durationSeconds: 3,
          videoCodec: "h264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          issues: [],
        },
      });
    const output = makeOutput();
    try {
      await commandStoriesRender(
        {
          episode: fixture.episodeId,
          outputRoot: fixture.episodesRoot,
          languages: "de",
          profiles: "full",
          onlyReady: true,
          json: true,
        },
        output
      );

      const payload = JSON.parse(output.read()) as {
        readonly results: readonly { readonly locale: string; readonly skipped: boolean }[];
      };
      expect(payload.results).toHaveLength(1);
      expect(payload.results[0]).toMatchObject({ locale: "de", skipped: true });
      expect(renderSpy).not.toHaveBeenCalled();
    } finally {
      renderSpy.mockRestore();
    }
  });

  it("does not burn captions by default when caption sidecars exist", async () => {
    const fixture = await createRenderFixture({
      locales: ["en"],
      imageSize: { width: 1536, height: 864 },
      withAudioLocales: ["en"],
      withCaptionLocales: ["en"],
    });
    const renderSpy = vi
      .spyOn(FFmpegVideoRenderer.prototype, "render")
      .mockResolvedValue({
        cleanPath: path.join(fixture.episodesRoot, fixture.episodeId, "ok.mp4"),
        validation: {
          valid: true,
          width: 1920,
          height: 1080,
          durationSeconds: 3,
          videoCodec: "h264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          issues: [],
        },
      });
    const output = makeOutput();

    try {
      await commandStoriesRender({
        episode: fixture.episodeId,
        outputRoot: fixture.episodesRoot,
        languages: "en",
        profiles: "full",
      }, output);

      expect(renderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          captionBurnIn: false,
        }),
        expect.any(AbortSignal)
      );
      expect(renderSpy.mock.calls[0]?.[0]).not.toHaveProperty("captionsPath");
    } finally {
      renderSpy.mockRestore();
    }
  });

  it("rejects missing audio before render start", async () => {
    const fixture = await createRenderFixture({
      locales: ["en"],
      imageSize: { width: 1536, height: 864 },
      withAudioLocales: [],
    });

    await expect(
      commandStoriesRender({
        episode: fixture.episodeId,
        outputRoot: fixture.episodesRoot,
        languages: "en",
        profiles: "full",
      })
    ).rejects.toThrow(/Render prerequisites failed|quality-gate\.json/i);
  });

  it("rejects invalid images before render start", async () => {
    const fixture = await createRenderFixture({
      locales: ["en"],
      imageSize: { width: 1920, height: 1080 },
      withAudioLocales: ["en"],
    });

    await expect(
      commandStoriesRender({
        episode: fixture.episodeId,
        outputRoot: fixture.episodesRoot,
        languages: "en",
        profiles: "full",
      })
    ).rejects.toThrow(/Invalid full image-generation image dimensions/);
  });

  it("filters repair commands to the selected upstream action", async () => {
    const fixture = await createRenderFixture({
      locales: ["en"],
      imageSize: { width: 1536, height: 864 },
      withAudioLocales: [],
    });
    const output = makeOutput();
    await commandStoriesProductionRepair(
      {
        episode: fixture.episodeId,
        outputRoot: fixture.episodesRoot,
        languages: "en",
        profiles: "full",
        regenerateAudio: true,
        render: true,
        json: true,
      },
      output
    );

    const payload = JSON.parse(output.read()) as {
      readonly repairs: readonly { readonly commands: readonly string[] }[];
    };
    expect(payload.repairs[0]?.commands).toEqual([
      `npm run mediaforge -- stories audio generate --episode ${fixture.episodeId} --languages en --profiles full --only-ready`,
      `npm run mediaforge -- stories render --episode ${fixture.episodeId} --languages en --profiles full --only-ready`,
    ]);
  });
});
