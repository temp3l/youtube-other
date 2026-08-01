import { describe, expect, it } from "vitest";

import {
  YoutubePublicationEvidenceLookup,
  youtubePublicationRecoveryMarker,
} from "./publication-reconciliation.js";

describe("YouTube publication reconciliation", () => {
  it("accepts only a video whose returned description contains the exact recovery marker", async () => {
    const searchRequests: unknown[] = [];
    const lookup = new YoutubePublicationEvidenceLookup({
      search: {
        list: async (request) => {
          searchRequests.push(request);
          return {
            data: {
              items: [
                { id: { videoId: "video-good" } },
                { id: { videoId: "video-stale" } },
              ],
            },
          };
        },
      },
      videos: {
        list: async () => ({
          data: {
            items: [
              {
                id: "video-good",
                snippet: {
                  description: `published ${youtubePublicationRecoveryMarker("recovery-intent-42")}`,
                  channelId: "channel-1",
                },
                status: { privacyStatus: "private" },
              },
              {
                id: "video-stale",
                snippet: { description: "a loose search result" },
              },
            ],
          },
        }),
      },
    });
    await expect(
      lookup.findByRecoveryIdentity({
        publicationId: "publication-1",
        recoveryIdentity: "recovery-intent-42",
      })
    ).resolves.toEqual([
      expect.objectContaining({
        providerObjectId: "video-good",
        recoveryIdentity: "recovery-intent-42",
      }),
    ]);
    expect(searchRequests).toEqual([
      expect.objectContaining({
        forMine: true,
        type: ["video"],
        q: youtubePublicationRecoveryMarker("recovery-intent-42"),
      }),
    ]);
  });

  it("propagates provider failure so the reconciliation worker retains operator-owned uncertainty", async () => {
    const lookup = new YoutubePublicationEvidenceLookup({
      search: {
        list: async () => {
          throw new Error("youtube unavailable");
        },
      },
      videos: { list: async () => ({}) },
    });
    await expect(
      lookup.findByRecoveryIdentity({
        publicationId: "publication-1",
        recoveryIdentity: "recovery-intent-42",
      })
    ).rejects.toThrow("youtube unavailable");
  });
});
