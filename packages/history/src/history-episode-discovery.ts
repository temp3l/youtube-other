import fs from "node:fs";

const HISTORY_STORY_PACK_DIRECTORY_PATTERN =
  /^history-youtube-history-(?:10|30)-video-story-pack-(\d{2})-/u;
const VERSION_SUFFIX_PATTERN = /-v\d+(?:\.\d+)?$/u;

export function episodeNumberFromHistoryStoryPackDirectory(
  directoryName: string
): number | undefined {
  const match = directoryName.match(HISTORY_STORY_PACK_DIRECTORY_PATTERN);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

export function isCanonicalHistoryStoryPackDirectory(
  directoryName: string
): boolean {
  if (!HISTORY_STORY_PACK_DIRECTORY_PATTERN.test(directoryName)) {
    return false;
  }
  return !VERSION_SUFFIX_PATTERN.test(directoryName);
}

export function discoverHistoryStoryPackEpisodeIds(input: {
  readonly episodesDirectory: string;
  readonly from: number;
  readonly to: number;
}): string[] {
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to)) {
    throw new Error("History episode range bounds must be integers.");
  }
  if (input.from < 1 || input.to < input.from) {
    throw new Error(
      `Invalid History episode range ${input.from}-${input.to}; require 1 <= from <= to.`
    );
  }
  const byEpisodeNumber = new Map<number, string>();
  for (const directoryName of fs.readdirSync(input.episodesDirectory)) {
    if (!isCanonicalHistoryStoryPackDirectory(directoryName)) {
      continue;
    }
    const episodeNumber = episodeNumberFromHistoryStoryPackDirectory(directoryName);
    if (
      episodeNumber === undefined ||
      episodeNumber < input.from ||
      episodeNumber > input.to
    ) {
      continue;
    }
    const existing = byEpisodeNumber.get(episodeNumber);
    if (!existing || directoryName < existing) {
      byEpisodeNumber.set(episodeNumber, directoryName);
    }
  }
  return [...byEpisodeNumber.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, directoryName]) => directoryName);
}

export function defaultHistoryApprovalPackRangeOutput(input: {
  readonly from: number;
  readonly to: number;
  readonly baseDirectory?: string;
}): string {
  const baseDirectory = input.baseDirectory ?? "artifacts/chatgpt-review";
  return `${baseDirectory}/history-approval-packs-v3.5-episodes-${String(input.from).padStart(2, "0")}-${String(input.to).padStart(2, "0")}`;
}
