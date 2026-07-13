import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  loadGenericYoutubePublishReport,
  publishYoutubeMedia,
  saveGenericYoutubePublishReport,
  type YoutubeMediaClient,
} from "./generic-media-publish.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "generic-youtube-"));
  const mediaPath = path.join(root, "video.mp4");
  const thumbnailPath = path.join(root, "thumbnail.svg");
  const metadataPath = path.join(root, "metadata.json");
  await Promise.all([
    fs.writeFile(mediaPath, "video"),
    fs.writeFile(thumbnailPath, "<svg/>"),
    fs.writeFile(metadataPath, "{}"),
  ]);
  return { mediaPath, thumbnailPath, metadataPath };
}

function client(options: {
  channelId?: string;
  failVideo?: boolean;
  failThumbnail?: boolean;
  failPlaylist?: string;
  retryableFailure?: boolean;
} = {}) {
  const playlistAttempts: string[] = [];
  const operations: string[] = [];
  const value: YoutubeMediaClient = {
    channels: { list: vi.fn(async () => {
      operations.push("channels.list");
      return { data: { items: [{ id: options.channelId ?? "math-channel" }] } };
    }) },
    videos: {
      insert: vi.fn(async () => {
        operations.push("videos.insert");
        if (options.failVideo)
          throw Object.assign(new Error("upload interrupted"), {
            response: { status: 400, data: { error: { errors: [{ reason: "badRequest" }] } } },
          });
        return { data: { id: "video-id" } };
      }),
      list: vi.fn(async () => {
        operations.push("videos.list");
        return { data: { items: [{ id: "video-id" }] } };
      }),
    },
    thumbnails: { set: vi.fn(async () => {
      operations.push("thumbnails.set");
      if (options.failThumbnail)
        throw Object.assign(new Error("thumbnail interrupted"), {
          response: options.retryableFailure
            ? { status: 503, data: { error: { errors: [{ reason: "backendError" }] } } }
            : { status: 400, data: { error: { errors: [{ reason: "invalidThumbnail" }] } } },
        });
      return {};
    }) },
    playlistItems: { insert: vi.fn(async (request: any) => {
      const id = request.requestBody.snippet.playlistId as string;
      operations.push(`playlistItems.insert:${id}`);
      playlistAttempts.push(id);
      if (id === options.failPlaylist)
        throw Object.assign(new Error("denied"), {
          response: options.retryableFailure
            ? { status: 503, data: { error: { errors: [{ reason: "backendError" }] } } }
            : { status: 403, data: { error: { errors: [{ reason: "forbidden" }] } } },
        });
      return { data: { id: `item-${id}` } };
    }) },
  };
  return { value, playlistAttempts, operations };
}

async function input(overrides: Record<string, unknown> = {}) {
  const files = await fixture();
  const fake = client();
  return {
    fake,
    value: {
      ...files,
      identity: { contentId: "lesson-1", language: "en", variant: "standard" },
      channelId: "math-channel",
      policy: { privacyStatus: "private", madeForKids: false, containsSyntheticMedia: true },
      playlistIds: ["grade", "topic", "variant"],
      metadata: { title: "Math lesson", description: "Description", tags: ["math"], categoryId: "27" },
      client: fake.value,
      ...overrides,
    },
  };
}

describe("genre-neutral YouTube media publish", () => {
  it("deduplicates playlists and attempts every unique assignment on partial failure", async () => {
    const setup = await input({ playlistIds: ["grade", "topic", "grade", "variant"] });
    const failing = client({ failPlaylist: "topic" });
    setup.value.client = failing.value;
    const result = await publishYoutubeMedia(setup.value);
    expect(failing.playlistAttempts).toEqual(["grade", "topic", "variant"]);
    expect(result.report.status).toBe("PUBLISH_BLOCKED");
    expect(result.report.playlistResults.map((item) => item.status)).toEqual(["assigned", "failed", "assigned"]);
  });

  it("blocks channel mismatch and missing explicit policy before any mutation", async () => {
    const mismatch = await input();
    const wrong = client({ channelId: "story-channel" });
    mismatch.value.client = wrong.value;
    const result = await publishYoutubeMedia(mismatch.value);
    expect(result.report.status).toBe("PUBLISH_BLOCKED");
    expect(wrong.value.videos.insert).not.toHaveBeenCalled();
    for (const missing of [
      { privacyStatus: undefined, madeForKids: false, containsSyntheticMedia: true },
      { privacyStatus: "private", madeForKids: undefined, containsSyntheticMedia: true },
      { privacyStatus: "private", madeForKids: false, containsSyntheticMedia: undefined },
    ]) {
      const setup = await input({ policy: missing });
      const blocked = await publishYoutubeMedia(setup.value);
      expect(blocked.report.status).toBe("PUBLISH_BLOCKED");
      expect(setup.fake.value.channels.list).not.toHaveBeenCalled();
    }
  });

  it("reuses a matching completed report and rejects a stale report without mutations", async () => {
    const setup = await input();
    const first = await publishYoutubeMedia(setup.value);
    expect(first.report.status).toBe("PUBLISHED");
    const repeatFake = client();
    const repeat = await publishYoutubeMedia({ ...setup.value, client: repeatFake.value, priorReport: first.report });
    expect(repeat.reused).toBe(true);
    expect(repeatFake.value.channels.list).not.toHaveBeenCalled();
    const staleFake = client();
    const stale = await publishYoutubeMedia({ ...setup.value, client: staleFake.value, priorReport: { ...first.report, requestFingerprint: "0".repeat(64) } });
    expect(stale.report.status).toBe("PUBLISH_BLOCKED");
    expect(staleFake.value.channels.list).not.toHaveBeenCalled();
  });

  it("runtime-validates prior reports and rejects malformed, impossible, and cross-video evidence before calls", async () => {
    const setup = await input();
    const first = await publishYoutubeMedia(setup.value);
    const attacks: unknown[] = [
      { ...first.report, videoHash: "0".repeat(64) },
      { ...first.report, channelId: "other-channel" },
      { ...first.report, videoId: null, thumbnailStatus: "assigned" },
      { ...first.report, playlistResults: [
        first.report.playlistResults[0],
        first.report.playlistResults[0],
      ] },
      { ...first.report, status: "PUBLISHED", blockers: ["contradiction"] },
      { ...first.report, unknown: true },
      {
        ...first.report,
        videoId: "attacker-video",
        videoBindingHash: first.report.videoBindingHash,
      },
    ];
    for (const priorReport of attacks) {
      const fake = client();
      const result = await publishYoutubeMedia({
        ...setup.value,
        client: fake.value,
        priorReport,
      });
      expect(result.report.status).toBe("PUBLISH_BLOCKED");
      expect(fake.operations).toEqual([]);
    }
  });

  it("persists partial progress and resumes with zero duplicate successful mutations", async () => {
    const setup = await input();
    const playlistFailure = client({ failPlaylist: "topic", retryableFailure: true });
    const partial = await publishYoutubeMedia({ ...setup.value, client: playlistFailure.value });
    expect(partial.report).toMatchObject({
      status: "PUBLISH_BLOCKED",
      videoId: "video-id",
      thumbnailStatus: "assigned",
    });
    expect(partial.report.playlistResults.map((entry) => entry.status)).toEqual([
      "assigned",
      "failed",
      "assigned",
    ]);

    const resumedClient = client();
    const resumed = await publishYoutubeMedia({
      ...setup.value,
      client: resumedClient.value,
      priorReport: partial.report,
    });
    expect(resumed.report.status).toBe("PUBLISHED");
    expect(resumedClient.operations).not.toContain("videos.insert");
    expect(resumedClient.operations).not.toContain("playlistItems.insert:grade");
    expect(resumedClient.operations).not.toContain("playlistItems.insert:variant");
    expect(resumedClient.operations).toEqual([
      "channels.list",
      "playlistItems.insert:topic",
      "videos.list",
    ]);
  });

  it("does not retry explicitly non-retryable incomplete operations", async () => {
    const setup = await input();
    const failure = client({ failThumbnail: true, failPlaylist: "topic" });
    const partial = await publishYoutubeMedia({ ...setup.value, client: failure.value });
    expect(partial.report.thumbnailRetryable).toBe(false);
    expect(partial.report.playlistResults.find((entry) => entry.playlistId === "topic")?.retryable).toBe(false);
    const resumedClient = client();
    const resumed = await publishYoutubeMedia({ ...setup.value, client: resumedClient.value, priorReport: partial.report });
    expect(resumed.report.status).toBe("PUBLISH_BLOCKED");
    expect(resumedClient.operations).not.toContain("videos.insert");
    expect(resumedClient.operations).not.toContain("thumbnails.set");
    expect(resumedClient.operations).not.toContain("playlistItems.insert:topic");
  });

  it("checkpoints after insertion and thumbnail so interruption resumes without duplicate mutations", async () => {
    const setup = await input();
    const afterInsert = await publishYoutubeMedia({
      ...setup.value,
      checkpoint: async (report) => {
        if (report.videoId && report.thumbnailStatus === "not-attempted")
          throw new Error("interrupt after insert checkpoint");
      },
    });
    expect(afterInsert.report.videoId).toBe("video-id");
    const resumeInsertClient = client();
    const resumedInsert = await publishYoutubeMedia({ ...setup.value, client: resumeInsertClient.value, priorReport: afterInsert.report });
    expect(resumedInsert.report.status).toBe("PUBLISHED");
    expect(resumeInsertClient.operations).not.toContain("videos.insert");

    const thumbnailClient = client();
    const afterThumbnail = await publishYoutubeMedia({
      ...setup.value,
      client: thumbnailClient.value,
      checkpoint: async (report) => {
        if (report.thumbnailStatus === "assigned" && report.playlistResults.length === 0)
          throw new Error("interrupt after thumbnail checkpoint");
      },
    });
    expect(afterThumbnail.report.thumbnailStatus).toBe("assigned");
    const resumeThumbnailClient = client();
    const resumedThumbnail = await publishYoutubeMedia({ ...setup.value, client: resumeThumbnailClient.value, priorReport: afterThumbnail.report });
    expect(resumedThumbnail.report.status).toBe("PUBLISHED");
    expect(resumeThumbnailClient.operations).not.toContain("videos.insert");
    expect(resumeThumbnailClient.operations).not.toContain("thumbnails.set");
  });

  it("loads persistent prior state only from a regular contained file with the expected hash", async () => {
    const setup = await input();
    const first = await publishYoutubeMedia(setup.value);
    const reportRoot = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-report-authority-"));
    const saved = await saveGenericYoutubePublishReport({ reportRoot, report: first.report });
    const loaded = await loadGenericYoutubePublishReport({ reportRoot, reportPath: saved.reportPath, expectedContentHash: saved.contentHash });
    const repeatClient = client();
    const repeated = await publishYoutubeMedia({ ...setup.value, client: repeatClient.value, priorReport: loaded });
    expect(repeated.reused).toBe(true);
    expect(repeatClient.operations).toEqual([]);
    await fs.writeFile(saved.reportPath, JSON.stringify({ ...first.report, videoId: "attacker-video" }));
    await expect(loadGenericYoutubePublishReport({ reportRoot, reportPath: saved.reportPath, expectedContentHash: saved.contentHash })).rejects.toThrow(/hash mismatch/u);
  });

  it("classifies interrupted video insertion and verifies successful uploads", async () => {
    const setup = await input();
    const interrupted = client({ failVideo: true });
    const failed = await publishYoutubeMedia({ ...setup.value, client: interrupted.value });
    expect(failed.report.status).toBe("PUBLISH_BLOCKED");
    expect(failed.report.videoId).toBeNull();
    expect(interrupted.operations).toEqual(["channels.list", "videos.insert"]);
    const resumeClient = client();
    const resumed = await publishYoutubeMedia({ ...setup.value, client: resumeClient.value, priorReport: failed.report });
    expect(resumed.report.status).toBe("PUBLISH_BLOCKED");
    expect(resumeClient.operations).toEqual(["channels.list"]);

    const successful = client();
    const completed = await publishYoutubeMedia({ ...setup.value, client: successful.value });
    expect(completed.report.status).toBe("PUBLISHED");
    expect(successful.operations.at(-1)).toBe("videos.list");
  });
});
