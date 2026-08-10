import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveHistoryMetadataArtifact,
  resolveHistoryMetadataNarration,
} from "./youtube-metadata.js";

describe("History YouTube metadata paths", () => {
  const episodeRoot = "/workspace/episodes/history-episode-001";

  it("resolves the requested locale and does not conflate variants", () => {
    expect(resolveHistoryMetadataNarration({ episodeRoot, locale: "en", variant: "full" }))
      .toBe(path.join(episodeRoot, "languages", "script-en.md"));
    expect(resolveHistoryMetadataNarration({ episodeRoot, locale: "en", variant: "short" }))
      .toBe(path.join(episodeRoot, "languages", "short", "script-en.md"));
    expect(resolveHistoryMetadataArtifact({ episodeRoot, locale: "en", variant: "short" }))
      .toBe(path.join(episodeRoot, "locales", "en", "short", "metadata"));
  });
});
