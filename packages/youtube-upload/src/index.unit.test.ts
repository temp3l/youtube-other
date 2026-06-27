import fs from "node:fs/promises";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { scenePlanSchema } from "@mediaforge/domain";
import { writeJsonAtomic } from "@mediaforge/shared";
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
      recommendedText: "Upload",
      alternativeTexts: ["Alt", "Alt", "Alt", "Alt"],
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

  afterEach(async () => {
    await fs.rm(thumbnailFixturePath, { force: true }).catch(() => undefined);
  });

  it("resolves episode assets and upload metadata", async () => {
    const workspace = createWorkspace();
    const episodeDir = path.join(workspace, "episode-fixture");
    await prepareEpisode(episodeDir);
    const resolved = await generateUploadMetadataForEpisode(episodeDir, "episode-fixture");
    expect(resolved.metadata.title.recommended).toBe("A Simple Upload");
    expect(resolved.resolvedVideoPath).toContain("video.mp4");
    expect(resolved.resolvedThumbnailPath).toContain(thumbnailFixturePath);
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
});
