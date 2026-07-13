import fs from "node:fs/promises";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { scenePlanSchema } from "@mediaforge/domain";
import { createEpisodePathResolver, writeJsonAtomic } from "@mediaforge/shared";
const {
  mockGenerateYoutubeMetadataForTarget,
  mockReadAndValidateScenesFile,
} = vi.hoisted(() => ({
  mockGenerateYoutubeMetadataForTarget: vi.fn(),
  mockReadAndValidateScenesFile: vi.fn(),
}));
vi.mock("@mediaforge/metadata", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/metadata")>(
    "@mediaforge/metadata"
  );
  return {
    ...actual,
    generateYoutubeMetadataForTarget: mockGenerateYoutubeMetadataForTarget,
    readAndValidateScenesFile: mockReadAndValidateScenesFile,
  };
});
import {
  generateUploadMetadataForEpisode,
  uploadYoutubeEpisode,
  type YoutubeAuthSettings,
} from "./index.js";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "mediaforge-upload-"));
}

function makeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A simple opening.",
        sourceSegmentIds: ["segment-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "establish",
        subject: "room",
        action: "shown",
        setting: "dark room",
        composition: "centered",
        cameraFraming: "wide shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "dark room",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-002",
        sequenceNumber: 2,
        canonicalNarration: "The story shifts.",
        sourceSegmentIds: ["segment-002"],
        estimatedDurationSeconds: 5,
        timing: { startSeconds: 4, endSeconds: 9 },
        visualPurpose: "reveal",
        subject: "person",
        action: "turning",
        setting: "dark room",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "person turning",
        expectedImageFilenames: ["scene-002__000004-000009__16x9.png"],
        qualityStatus: "draft",
      },
      {
        id: "scene-003",
        sequenceNumber: 3,
        canonicalNarration: "The ending lands.",
        sourceSegmentIds: ["segment-003"],
        estimatedDurationSeconds: 6,
        timing: { startSeconds: 9, endSeconds: 15 },
        visualPurpose: "aftermath",
        subject: "object",
        action: "resting",
        setting: "dark room",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "uneasy",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "object resting",
        expectedImageFilenames: ["scene-003__000009-000015__16x9.png"],
        qualityStatus: "draft",
      },
    ],
  });
}

async function prepareEpisode(episodeDir: string): Promise<void> {
  await fs.mkdir(path.join(episodeDir, "metadata"), { recursive: true });
  await fs.mkdir(path.join(episodeDir, "output"), { recursive: true });
  await fs.mkdir(path.join(episodeDir, "canonical"), { recursive: true });
  await fs.mkdir(path.join("content-ideas", "audio-ready-thumbnails", "en"), { recursive: true });
  await writeJsonAtomic(
    path.join(episodeDir, "manifest.json"),
    {
      episodeId: "episode-fixture",
      slug: "episode-fixture",
      source: { platform: "youtube" },
      images: [],
      artifacts: [
        {
          id: "artifact-video",
          kind: "video",
          path: path.join(episodeDir, "output", "video.mp4"),
          mimeType: "video/mp4",
          sizeBytes: 12,
          checksumSha256: "a".repeat(64),
          createdAt: new Date().toISOString(),
        },
      ],
      pipelineRuns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
  await fs.writeFile(path.join(episodeDir, "output", "video.mp4"), Buffer.from("video"));
  await writeJsonAtomic(path.join(episodeDir, "canonical", "scenes.json"), makeScenePlan());
  await fs.writeFile(
    path.join(episodeDir, "output", "thumbnail.png"),
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#222222" } })
      .png()
      .toBuffer()
  );
  await fs.writeFile(
    path.join("content-ideas", "audio-ready-thumbnails", "en", "episode-fixture.png"),
    await sharp({ create: { width: 1200, height: 675, channels: 3, background: "#333333" } })
      .png()
      .toBuffer()
  );
  const metadata = {
    schemaVersion: "1.0",
    source: { sourceId: "episode-fixture", sceneCount: 3, durationSeconds: 15, language: "en" },
    seo: { primaryKeyword: "keyword", secondaryKeywords: ["keyword"], viewerSearchIntent: "learn" },
    title: { recommended: "A Simple Upload", alternatives: ["Alt 1", "Alt 2", "Alt 3", "Alt 4", "Alt 5"] },
    description: "Intro text.\n\nCHAPTERS\n00:00 Intro\n00:04 Middle\n00:09 End",
    chapters: {
      text: "00:00 Intro\n00:04 Middle\n00:09 End",
      characterCount: 33,
      items: [
        { timestamp: "00:00", startSeconds: 0, title: "Intro" },
        { timestamp: "00:04", startSeconds: 4, title: "Middle" },
        { timestamp: "00:09", startSeconds: 9, title: "End" },
      ],
    },
    tags: { text: "keyword, upload", characterCount: 15, items: ["keyword", "upload"] },
    hashtags: ["#keyword"],
    thumbnail: {
      recommendedText: "Simple Upload",
      alternativeTexts: ["Upload Story", "Simple Video", "Story Upload", "Watch Now"],
      imagePrompt: "prompt",
    },
    uploadSettings: {
      filename: "video.mp4",
      category: "Education",
      videoLanguage: "en",
      captionLanguage: "en",
      madeForKids: false,
      licence: "Standard YouTube License",
      playlists: [],
      comments: "allowed",
      automaticChapters: true,
    },
    pinnedComment: "Pinned",
    socialTeaser: "Teaser",
    contentSummary: "Summary",
    corrections: [],
    verificationWarnings: [],
  };
  await writeJsonAtomic(path.join(episodeDir, "metadata", "youtube.json"), metadata);
}

async function prepareLocalizedEpisode(episodeDir: string): Promise<void> {
  await prepareEpisode(episodeDir);
  const resolver = createEpisodePathResolver(path.dirname(episodeDir));
  const enContext = {
    episodeId: "episode-fixture",
    locale: "en",
    variant: "full" as const,
  };
  const deContext = {
    episodeId: "episode-fixture",
    locale: "de",
    variant: "full" as const,
  };
  const deShortContext = {
    episodeId: "episode-fixture",
    locale: "de",
    variant: "short" as const,
  };
  await fs.mkdir(resolver.metadataDir(enContext), { recursive: true });
  await fs.mkdir(resolver.metadataDir(deContext), { recursive: true });
  await fs.mkdir(resolver.metadataDir(deShortContext), { recursive: true });
  await fs.mkdir(path.join(episodeDir, "de", "full"), { recursive: true });
  await fs.mkdir(path.join(episodeDir, "de", "short"), { recursive: true });
  await fs.mkdir(resolver.renderDir(enContext, "youtube"), { recursive: true });
  await fs.mkdir(resolver.renderDir(deContext, "youtube"), { recursive: true });
  await fs.mkdir(resolver.renderDir(deShortContext, "vertical"), { recursive: true });
  const baseMetadata = JSON.parse(
    await fs.readFile(path.join(episodeDir, "metadata", "youtube.json"), "utf8")
  ) as Record<string, unknown>;
  await writeJsonAtomic(path.join(resolver.metadataDir(enContext), "youtube.json"), {
    ...baseMetadata,
    source: { ...(baseMetadata.source as Record<string, unknown>), language: "en" },
    title: {
      ...((baseMetadata.title as Record<string, unknown>) ?? {}),
      recommended: "English Upload",
    },
    uploadSettings: {
      ...((baseMetadata.uploadSettings as Record<string, unknown>) ?? {}),
      videoLanguage: "en",
      captionLanguage: "en",
    },
  });
  await writeJsonAtomic(path.join(resolver.metadataDir(deContext), "youtube.json"), {
    ...baseMetadata,
    source: { ...(baseMetadata.source as Record<string, unknown>), language: "de" },
    title: {
      ...((baseMetadata.title as Record<string, unknown>) ?? {}),
      recommended: "German Upload",
    },
    uploadSettings: {
      ...((baseMetadata.uploadSettings as Record<string, unknown>) ?? {}),
      videoLanguage: "de",
      captionLanguage: "de",
    },
  });
  await writeJsonAtomic(path.join(resolver.metadataDir(deShortContext), "youtube.json"), {
    ...baseMetadata,
    source: { ...(baseMetadata.source as Record<string, unknown>), language: "de" },
    title: {
      ...((baseMetadata.title as Record<string, unknown>) ?? {}),
      recommended: "German Short Upload",
    },
    uploadSettings: {
      ...((baseMetadata.uploadSettings as Record<string, unknown>) ?? {}),
      filename: "youtube-9x16-clean-de.mp4",
      videoLanguage: "de",
      captionLanguage: "de",
    },
  });
  await writeJsonAtomic(path.join(episodeDir, "de", "full", "scenes.json"), makeScenePlan());
  await writeJsonAtomic(path.join(episodeDir, "de", "short", "scenes.json"), makeScenePlan());
  await fs.writeFile(
    path.join(resolver.renderDir(enContext, "youtube"), "youtube-16x9-clean-en.mp4"),
    Buffer.from("english-video")
  );
  await fs.writeFile(
    path.join(resolver.renderDir(deContext, "youtube"), "youtube-16x9-clean-de.mp4"),
    Buffer.from("german-video")
  );
  await fs.writeFile(
    path.join(resolver.renderDir(deShortContext, "vertical"), "youtube-9x16-clean-de.mp4"),
    Buffer.from("german-short-video")
  );
  await fs.mkdir(path.join("content-ideas", "audio-ready-thumbnails", "de"), { recursive: true });
  await fs.writeFile(
    path.join("content-ideas", "audio-ready-thumbnails", "de", "episode-fixture.png"),
    await sharp({ create: { width: 1200, height: 675, channels: 3, background: "#444444" } })
      .png()
      .toBuffer()
  );
}

function createMockYoutubeClient() {
  const requests: string[] = [];
  const response = <T,>(data: T, headers: Record<string, string> = {}): { data: T; headers: Record<string, string> } => ({
    data,
    headers,
  });
  return {
    requests,
    channels: {
      list: vi.fn(async () => {
        requests.push("channels.list");
        return response({ items: [{ id: "channel-id" }] }, { "x-goog-request-id": "channel-request" });
      }),
    },
    videos: {
      insert: vi.fn(async () => {
        requests.push("videos.insert");
        return response({ id: "video-id" }, { "x-goog-request-id": "upload-request" });
      }),
      list: vi.fn(async () => {
        requests.push("videos.list");
        return response({ items: [{ id: "video-id" }] }, { "x-goog-request-id": "verification-request" });
      }),
    },
    thumbnails: {
      set: vi.fn(async () => {
        requests.push("thumbnails.set");
        return response({}, { "x-goog-request-id": "thumbnail-request" });
      }),
    },
    playlistItems: {
      insert: vi.fn(async () => {
        requests.push("playlistItems.insert");
        return response({ id: "playlist-item-id" }, { "x-goog-request-id": "playlist-request" });
      }),
    },
  };
}

describe("youtube upload", () => {
  const thumbnailFixturePath = path.join(
    "content-ideas",
    "audio-ready-thumbnails",
    "en",
    "episode-fixture.png"
  );
  const germanThumbnailFixturePath = path.join(
    "content-ideas",
    "audio-ready-thumbnails",
    "de",
    "episode-fixture.png"
  );

  afterEach(async () => {
    mockGenerateYoutubeMetadataForTarget.mockReset();
    mockReadAndValidateScenesFile.mockReset();
    await fs.rm(thumbnailFixturePath, { force: true }).catch(() => undefined);
    await fs.rm(germanThumbnailFixturePath, { force: true }).catch(() => undefined);
  });

  it("resolves episode assets and upload metadata", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture");
    expect(resolved.metadata.title.recommended).toBe("A Simple Upload");
    expect(resolved.resolvedVideoPath).toContain("video.mp4");
    expect(resolved.legacyVideoFallbackUsed).toBe(false);
    expect(resolved.resolvedThumbnailPath).toContain(thumbnailFixturePath);
  });

  it("prefers the manifest-owned video artifact over stale scanned output files", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    await fs.writeFile(
      path.join(episodeDir, "output", "youtube-16x9-clean.mp4"),
      Buffer.from("stale-clean-video")
    );

    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture");

    expect(resolved.resolvedVideoPath).toBe(
      path.join(episodeDir, "output", "video.mp4")
    );
    expect(resolved.legacyVideoFallbackUsed).toBe(false);
  });

  it("labels scanned mp4 selection as an explicit legacy fallback", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    await fs.rm(path.join(episodeDir, "manifest.json"));

    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture");

    expect(resolved.resolvedVideoPath).toBe(
      path.join(episodeDir, "output", "video.mp4")
    );
    expect(resolved.legacyVideoFallbackUsed).toBe(true);
  });

  it("writes an upload report using a mocked YouTube client", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const client = createMockYoutubeClient();
    const auth: YoutubeAuthSettings = {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      channelId: "channel-id",
    };
    const result = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth,
      client: client as never,
      overrides: {
        playlistId: "playlist-id",
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      force: true,
    });
    expect(result.report.status).toBe("uploaded");
    expect(result.report.youtubeVideoId).toBe("video-id");
    expect(result.report.thumbnail.sourcePath).toContain(
      path.join("content-ideas", "audio-ready-thumbnails", "en", "episode-fixture.png")
    );
    expect(result.report.thumbnail.path).toContain("state/upload/thumbnails/youtube-thumbnail.jpg");
    expect(client.requests).toEqual([
      "channels.list",
      "videos.insert",
      "thumbnails.set",
      "playlistItems.insert",
      "videos.list",
    ]);
    expect(await fs.readFile(result.reportPath, "utf8")).toContain("\"status\": \"uploaded\"");
  });

  it("preserves legacy configured-channel fallback and request-success verification semantics", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const client = createMockYoutubeClient();
    client.channels.list.mockResolvedValue({ data: { items: [] }, headers: { "x-goog-request-id": "channel-request" } });
    client.videos.list.mockResolvedValue({ data: { items: [] }, headers: { "x-goog-request-id": "verification-request" } });
    const result = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token", channelId: "configured-channel" },
      client: client as never,
      force: true,
    });
    expect(result.report.status).toBe("uploaded");
    expect(result.report.youtubeChannelId).toBe("configured-channel");
    expect(client.channels.list).toHaveBeenCalledOnce();
    expect(client.videos.list).toHaveBeenCalledOnce();
    expect(client.requests).toEqual(["videos.insert", "thumbnails.set"]);
  });

  it("preserves a separate report pair for every upload attempt", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const auth: YoutubeAuthSettings = {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      channelId: "channel-id",
    };

    const first = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth,
      client: createMockYoutubeClient() as never,
      force: true,
    });
    const second = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth,
      client: createMockYoutubeClient() as never,
      force: true,
    });

    expect(second.reportPath).not.toBe(first.reportPath);
    expect(second.markdownPath).not.toBe(first.markdownPath);
    await expect(fs.readFile(first.reportPath, "utf8")).resolves.toContain(
      "\"status\": \"uploaded\""
    );
    const reportFiles = await fs.readdir(path.dirname(first.reportPath));
    expect(reportFiles.filter((entry) => /^youtube-upload-.*\.(?:json|md)$/u.test(entry))).toHaveLength(4);
  });

  it("renders thumbnail into short uploads and skips the unsupported thumbnail API call", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const shortVideoPath = path.join(episodeDir, "output", "youtube-9x16-clean.mp4");
    await fs.writeFile(shortVideoPath, Buffer.from("short-video"));
    const client = createMockYoutubeClient();
    const auth: YoutubeAuthSettings = {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      channelId: "channel-id",
    };
    const result = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth,
      client: client as never,
      overrides: {
        videoPath: path.join("output", "youtube-9x16-clean.mp4"),
      },
      shortThumbnailIntroRenderer: async ({ videoPath, thumbnailPath, outputPath }) => {
        expect(videoPath).toBe(shortVideoPath);
        expect(thumbnailPath).toContain(
          path.join("content-ideas", "audio-ready-thumbnails", "en", "episode-fixture.png")
        );
        await fs.writeFile(outputPath, Buffer.from("short-video-with-thumbnail-intro"));
        return outputPath;
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      force: true,
    });
    expect(result.report.status).toBe("uploaded");
    expect(result.report.video.path).toBe(
      path.join(episodeDir, "output", "youtube-9x16-clean-with-thumbnail-intro.mp4")
    );
    expect(client.requests).toEqual([
      "channels.list",
      "videos.insert",
      "videos.list",
    ]);
    const uploadRequest = client.videos.insert.mock.calls[0]?.[0] as {
      readonly media?: { readonly body?: { readonly path?: unknown } };
    };
    expect(String(uploadRequest.media?.body?.path)).toContain(
      "youtube-9x16-clean-with-thumbnail-intro.mp4"
    );
  });

  it("does not render the short thumbnail intro twice", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const shortVideoPath = path.join(
      episodeDir,
      "output",
      "youtube-9x16-clean-with-thumbnail-intro.mp4"
    );
    await fs.writeFile(shortVideoPath, Buffer.from("short-video-with-thumbnail-intro"));
    const client = createMockYoutubeClient();
    const auth: YoutubeAuthSettings = {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      channelId: "channel-id",
    };
    const shortThumbnailIntroRenderer = vi.fn<
      YoutubeUploadCommandInput["shortThumbnailIntroRenderer"]
    >();

    const result = await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      auth,
      client: client as never,
      overrides: {
        videoPath: path.join("output", "youtube-9x16-clean-with-thumbnail-intro.mp4"),
      },
      shortThumbnailIntroRenderer,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      force: true,
    });

    expect(result.report.status).toBe("uploaded");
    expect(result.report.video.path).toBe(shortVideoPath);
    expect(shortThumbnailIntroRenderer).not.toHaveBeenCalled();
    const uploadRequest = client.videos.insert.mock.calls[0]?.[0] as {
      readonly media?: { readonly body?: { readonly path?: unknown } };
    };
    expect(String(uploadRequest.media?.body?.path)).toContain(
      "youtube-9x16-clean-with-thumbnail-intro.mp4"
    );
    expect(String(uploadRequest.media?.body?.path)).not.toContain(
      "with-thumbnail-intro-with-thumbnail-intro"
    );
  });

  it("preserves the requested metadata language when upload regenerates metadata", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareLocalizedEpisode(episodeDir);
    const client = createMockYoutubeClient();
    const auth: YoutubeAuthSettings = {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      channelId: "channel-id",
    };
    const generatedMetadata = {
      schemaVersion: "1.0",
      source: {
        sourceId: "episode-fixture",
        sceneCount: 3,
        durationSeconds: 15,
        language: "de",
      },
      seo: { primaryKeyword: "keyword", secondaryKeywords: ["keyword"], viewerSearchIntent: "learn" },
      title: { recommended: "Generated German Upload", alternatives: ["Alt 1", "Alt 2", "Alt 3", "Alt 4", "Alt 5"] },
      description: "Beschreibung",
      chapters: {
        text: "00:00 Intro\n00:04 Mitte\n00:09 Ende",
        characterCount: 35,
        items: [
          { timestamp: "00:00", startSeconds: 0, title: "Intro" },
          { timestamp: "00:04", startSeconds: 4, title: "Mitte" },
          { timestamp: "00:09", startSeconds: 9, title: "Ende" },
        ],
      },
      tags: { text: "keyword", characterCount: 7, items: ["keyword"] },
      hashtags: ["#keyword"],
      thumbnail: {
        recommendedText: "German Upload",
        alternativeTexts: ["German Story", "Generated Video", "Story Upload", "Watch Now"],
        imagePrompt: "prompt",
      },
      uploadSettings: {
        filename: "youtube-16x9-clean-de.mp4",
        category: "Education",
        videoLanguage: "de",
        captionLanguage: "de",
        madeForKids: false,
        licence: "Standard YouTube License",
        playlists: [],
        comments: "allowed",
        automaticChapters: true,
      },
      pinnedComment: "Pinned",
      socialTeaser: "Teaser",
      contentSummary: "Summary",
      corrections: [],
      verificationWarnings: [],
    };
    const generatedOutputs = {
      outputDir: path.join(episodeDir, "locales", "de", "short", "metadata"),
      jsonPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-metadata.json"),
      markdownPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-metadata.md"),
      descriptionPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-description.txt"),
      chaptersPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-chapters.txt"),
      tagsPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-tags.txt"),
      pinnedCommentPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-pinned-comment.txt"),
      generationPath: path.join(episodeDir, "locales", "de", "short", "metadata", "youtube-metadata-generation.json"),
    };
    mockReadAndValidateScenesFile.mockResolvedValue({
      sourceFilePath: path.join(episodeDir, "de", "short", "scenes.json"),
      episodeDir,
      outputDir: path.join(episodeDir, "output"),
      episodeSlug: "episode-fixture",
      sourceId: "episode-fixture",
      language: "de",
      locale: "de-DE",
      variant: "full",
      scenePlan: makeScenePlan(),
      sourceSha256: "a".repeat(64),
      durationSeconds: 15,
      narration: {
        episodeNumber: "episode",
        episodeSlug: "episode-fixture",
        language: "de",
        locale: "de-DE",
        variant: "full",
        narrationText: "Narration",
        narrationFingerprint: "b".repeat(64),
      },
    });
    mockGenerateYoutubeMetadataForTarget.mockImplementation(async (target) => {
      await fs.mkdir(generatedOutputs.outputDir, { recursive: true });
      await writeJsonAtomic(generatedOutputs.jsonPath, generatedMetadata);
      return {
        metadata: generatedMetadata,
        generation: {
          generatedAt: new Date().toISOString(),
          sourceFile: target.sourceFilePath,
          sourceSha256: target.sourceSha256,
          promptVersion: "test-prompt",
          model: "test-model",
          attemptCount: 1,
          chapterCharacterCount: 10,
          tagCharacterCount: 10,
          cacheKey: "cache-key",
          language: target.language,
          locale: target.locale,
          variant: target.variant,
          owner: "metadata",
          ownerVersion: "youtube-metadata-owner-v1",
          status: "completed",
          parentNarrationFingerprint: target.narration.narrationFingerprint,
          modelConfigFingerprint: "c".repeat(64),
          promptSchemaFingerprint: "d".repeat(64),
          narration: {
            episodeNumber: target.narration.episodeNumber,
            episodeSlug: target.narration.episodeSlug,
            language: target.narration.language,
            locale: target.narration.locale,
            variant: target.narration.variant,
            narrationFingerprint: target.narration.narrationFingerprint,
          },
        },
        outputs: generatedOutputs,
        cacheHit: false,
      };
    });

    await uploadYoutubeEpisode({
      workspaceDir: workspace,
      episodeId: "episode-fixture",
      episodeDir,
      auth,
      client: client as never,
      generateMetadata: true,
      metadataLanguage: "de",
      overrides: { languageHint: "de", variant: "short" },
      metadataGeneration: {
        apiKey: "api-key",
        model: "test-model",
        maxOutputTokens: 1000,
        repairModel: "repair-model",
        repairReasoningEffort: "minimal",
        repairMaxOutputTokens: 1000,
        promptText: "prompt",
        maxRetries: 1,
        timeoutMs: 1000,
        keepFile: false,
      },
      shortThumbnailIntroRenderer: async ({ outputPath }) => {
        await fs.writeFile(outputPath, Buffer.from("short-video-with-thumbnail-intro"));
        return outputPath;
      },
      force: true,
    });

    expect(mockReadAndValidateScenesFile).toHaveBeenCalledWith(
      path.join(episodeDir, "de", "short", "scenes.json"),
      "de"
    );
    expect(mockGenerateYoutubeMetadataForTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "short",
        outputDir: path.join(episodeDir, "locales", "de", "short", "metadata"),
        narration: expect.objectContaining({ variant: "short" }),
      }),
      expect.objectContaining({ language: "de" })
    );
  });

  it("prefers localized metadata and video matching the language hint", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareLocalizedEpisode(episodeDir);
    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture", {
      languageHint: "de",
    });
    expect(resolved.metadata.source.language).toBe("de");
    expect(resolved.metadata.title.recommended).toBe("German Upload");
    expect(resolved.resolvedVideoPath).toContain("youtube-16x9-clean-de.mp4");
    expect(resolved.resolvedThumbnailPath).toContain(
      path.join("content-ideas", "audio-ready-thumbnails", "de", "episode-fixture.png")
    );
  });

  it("selects short upload metadata and vertical video explicitly", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareLocalizedEpisode(episodeDir);
    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture", {
      languageHint: "de",
      variant: "short",
    });
    expect(resolved.metadata.source.language).toBe("de");
    expect(resolved.metadata.title.recommended).toBe("German Short Upload");
    expect(resolved.resolvedVariant).toBe("short");
    expect(resolved.metadataPath).toContain(path.join("de", "short", "metadata"));
    expect(resolved.resolvedVideoPath).toContain("youtube-9x16-clean-de.mp4");
    expect(resolved.resolvedThumbnailPath).toContain(
      path.join("content-ideas", "audio-ready-thumbnails", "de", "episode-fixture.png")
    );
  });
});
