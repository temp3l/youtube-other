import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hashFile, hashProductionValue } from "@mediaforge/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CanonicalYoutubePublicationMutation,
  publishYoutubeVideoOnce,
  type YoutubeMutationClient,
} from "./youtube-mutation-seam.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

function client(options: {
  readonly channelId?: string | null;
  readonly insertError?: Error;
  readonly videoId?: string | null;
} = {}) {
  const channelsList = vi.fn(async () => ({
    data: { items: [{ id: options.channelId ?? "channel-1" }] },
  }));
  const videosInsert = vi.fn(async () => {
    if (options.insertError) throw options.insertError;
    return {
      data: { id: options.videoId === undefined ? "video-1" : options.videoId },
      headers: { "x-goog-request-id": "request-1" },
    };
  });
  const value = {
    channels: { list: channelsList },
    videos: { insert: videosInsert },
    thumbnails: { set: vi.fn(async () => ({})) },
    playlistItems: { insert: vi.fn(async () => ({})) },
  } satisfies YoutubeMutationClient;
  return { value, channelsList, videosInsert };
}

function uploadRequest() {
  return {
    part: ["snippet", "status"],
    notifySubscribers: false,
    requestBody: {
      snippet: { title: "Title", description: "Description" },
      status: { privacyStatus: "private" },
    },
    media: { body: "fixture" },
    uploadType: "resumable" as const,
  };
}

describe("canonical YouTube publication mutation", () => {
  it("adds the recovery marker and invokes videos.insert exactly once", async () => {
    const fixture = client();
    await expect(
      publishYoutubeVideoOnce({
        client: fixture.value,
        expectedChannelId: "channel-1",
        recoveryIdentity: "recovery-1",
        channelRequest: { part: ["id"], mine: true },
        uploadRequest: uploadRequest(),
      })
    ).resolves.toMatchObject({
      kind: "succeeded",
      receipt: {
        providerObjectId: "video-1",
        recoveryIdentity: "recovery-1",
      },
    });
    expect(fixture.videosInsert).toHaveBeenCalledTimes(1);
    const request = fixture.videosInsert.mock.calls[0]?.[0];
    expect(
      Reflect.get(
        Reflect.get(Reflect.get(request, "requestBody"), "snippet"),
        "description"
      )
    ).toContain("mediaforge-publication:recovery-1");
  });

  it("classifies every videos.insert rejection as ambiguous without retry", async () => {
    const fixture = client({ insertError: new Error("socket closed") });
    await expect(
      publishYoutubeVideoOnce({
        client: fixture.value,
        expectedChannelId: "channel-1",
        recoveryIdentity: "recovery-1",
        channelRequest: { part: ["id"], mine: true },
        uploadRequest: uploadRequest(),
      })
    ).resolves.toMatchObject({
      kind: "ambiguous",
      evidence: { category: "videos-insert-outcome-uncertain" },
    });
    expect(fixture.videosInsert).toHaveBeenCalledTimes(1);
  });

  it("fails channel and artifact validation before the provider effect", async () => {
    const wrongChannel = client({ channelId: "channel-2" });
    await expect(
      publishYoutubeVideoOnce({
        client: wrongChannel.value,
        expectedChannelId: "channel-1",
        recoveryIdentity: "recovery-1",
        channelRequest: { part: ["id"], mine: true },
        uploadRequest: uploadRequest(),
      })
    ).resolves.toMatchObject({ kind: "failed-before-effect" });
    expect(wrongChannel.videosInsert).not.toHaveBeenCalled();

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-once-"));
    temporaryDirectories.push(directory);
    const videoPath = path.join(directory, "video.mp4");
    await fs.writeFile(videoPath, "video-bytes");
    const fixture = client();
    const metadata = {
      title: "Title",
      description: "Description",
      tags: ["tag"],
      categoryId: "27",
      privacyStatus: "private" as const,
      madeForKids: false,
      notifySubscribers: false,
      publishAt: null,
    };
    const mutation = new CanonicalYoutubePublicationMutation(fixture.value);
    await expect(
      mutation.publishOnce({
        expectedChannelId: "channel-1",
        recoveryIdentity: "recovery-1",
        video: { absolutePath: videoPath, contentHash: "f".repeat(64) },
        metadata,
        metadataContentHash: hashProductionValue(metadata),
      })
    ).resolves.toMatchObject({
      kind: "failed-before-effect",
      evidence: { category: "video-content-hash-mismatch" },
    });
    expect(await hashFile(videoPath)).not.toBe("f".repeat(64));
    expect(fixture.videosInsert).not.toHaveBeenCalled();
  });
});
