import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { createPersistence } from "./index.js";
import { episodeManifestSchema } from "@mediaforge/domain";

describe("SQLite persistence", () => {
  it("stores and loads episode manifests", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-persistence-"));
    const db = createPersistence(path.join(dir, "db.sqlite"));
    db.migrate();
    const manifest = episodeManifestSchema.parse({
      episodeId: "episode-fixture",
      slug: "episode-fixture",
      source: { platform: "local-file", filePath: "/tmp/source.wav" },
      images: [],
      artifacts: [],
      pipelineRuns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    db.saveEpisodeManifest(manifest);
    expect(db.loadEpisodeManifest("episode-fixture")).toEqual(manifest);
  });
});

