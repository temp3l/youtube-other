import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatHistoryApprovalPackTimestampV35,
  defaultHistoryApprovalPackRangeOutput,
  discoverHistoryStoryPackEpisodeIds,
  episodeNumberFromHistoryStoryPackDirectory,
  isCanonicalHistoryStoryPackDirectory,
} from "./history-episode-discovery.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeEpisodesDirectory(names: readonly string[]): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "history-episodes-"));
  tempDirectories.push(directory);
  for (const name of names) {
    fs.mkdirSync(path.join(directory, name));
  }
  return directory;
}

describe("history episode discovery", () => {
  it("parses canonical story-pack directories and ignores versioned duplicates", () => {
    expect(
      isCanonicalHistoryStoryPackDirectory(
        "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day"
      )
    ).toBe(true);
    expect(
      isCanonicalHistoryStoryPackDirectory(
        "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.4"
      )
    ).toBe(false);
    expect(episodeNumberFromHistoryStoryPackDirectory(
      "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england"
    )).toBe(20);
  });

  it("discovers and sorts episode ids for an inclusive numeric range", () => {
    const episodesDirectory = makeEpisodesDirectory([
      "history-youtube-history-30-video-story-pack-12-year-536-when-the-sun-disappeared",
      "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
      "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day-v3.4",
      "history-youtube-history-30-video-story-pack-13-caesar-in-gaul",
      "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
    ]);
    expect(
      discoverHistoryStoryPackEpisodeIds({
        episodesDirectory,
        from: 11,
        to: 12,
      })
    ).toEqual([
      "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
      "history-youtube-history-30-video-story-pack-12-year-536-when-the-sun-disappeared",
    ]);
  });

  it("builds the default combined approval-pack output directory", () => {
    expect(
      defaultHistoryApprovalPackRangeOutput({
        from: 11,
        to: 31,
        generatedAt: new Date("2026-08-08T13:56:00.000Z"),
      })
    ).toBe(
      "artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-11-31-20260808T135600Z"
    );
  });

  it("formats UTC approval-pack timestamps as YYYYMMDDTHHMMSSZ", () => {
    expect(
      formatHistoryApprovalPackTimestampV35(new Date("2026-08-08T13:56:00.000Z"))
    ).toBe("20260808T135600Z");
  });
});
