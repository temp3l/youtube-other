import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { createPersistence } from "./index.js";
import { episodeManifestSchema } from "@mediaforge/domain";

describe("SQLite persistence", () => {
  it("does not create legacy pipeline run tables during migration", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-persistence-"));
    const db = createPersistence(path.join(dir, "db.sqlite"));
    db.migrate();

    const rows = db.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = rows.map((row) => row.name);
    const legacyRunTable = ["pipeline", "runs"].join("_");
    const legacyStepTable = ["step", "runs"].join("_");

    expect(tableNames).toContain("episodes");
    expect(tableNames).not.toContain(legacyRunTable);
    expect(tableNames).not.toContain(legacyStepTable);
  });

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
