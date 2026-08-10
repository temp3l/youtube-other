import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveVeronicaMetadataArtifact,
  resolveVeronicaMetadataNarration,
} from "./youtube-metadata.js";

describe("Veronica YouTube metadata paths", () => {
  const episodeRoot = "/workspace/episodes/l01-s01-being-good-isnt-enough";

  it("keeps full and localized short narration paths distinct", () => {
    expect(resolveVeronicaMetadataNarration({ episodeRoot, locale: "en", variant: "full" }))
      .toBe(path.join(episodeRoot, "languages", "script-en.md"));
    expect(resolveVeronicaMetadataNarration({ episodeRoot, locale: "en", variant: "short" }))
      .toBe(path.join(episodeRoot, "languages", "short", "script-en.md"));
    expect(resolveVeronicaMetadataNarration({ episodeRoot, locale: "it", variant: "short" }))
      .toBe(path.join(episodeRoot, "languages", "short", "script-it.md"));
  });

  it("scopes persisted metadata by locale and variant", () => {
    expect(resolveVeronicaMetadataArtifact({ episodeRoot, locale: "it", variant: "short" }))
      .toBe(path.join(episodeRoot, "locales", "it", "short", "metadata"));
  });
});
