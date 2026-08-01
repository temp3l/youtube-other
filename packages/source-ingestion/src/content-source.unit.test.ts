import fs from "node:fs/promises";
import { renameSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { contentSourceManifestSchema } from "@mediaforge/domain";
import { createEpisodePathResolver, normalizeEpisodeId } from "@mediaforge/shared";
import { hashCanonicalSourceBytes, persistContentSourceManifest } from "./index.js";

const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

function manifestFor(bytes: Uint8Array) {
  return contentSourceManifestSchema.parse({
    schemaVersion: "1.1", sourceId: "source-001", title: "Private source text", owner: "Owner",
    sourceType: "creator-written-note", provenance: { kind: "file", location: "private.md", originalLanguage: "it" }, accessLevel: "public",
    rights: { status: "creator-owned", allowedUses: ["adapt"], permittedLocales: ["it"], commercialUse: true },
    aiTransformations: { structure: true, summarize: true, adapt: true, translate: false, syntheticVoice: false, syntheticLikeness: false },
    sensitivity: { classification: "normal", tags: ["none"], manualReviewRequired: false }, sourceHash: hashCanonicalSourceBytes(bytes),
    createdAt: "2026-01-01T00:00:00.000Z", approvedAt: "2026-01-02T00:00:00.000Z", approvedBy: "editor-001",
  });
}

describe("content source provenance", () => {
  it("hashes canonical bytes and atomically persists only to a resolver-selected episode path", async () => {
    const first = Buffer.from("same title, first bytes", "utf8");
    const second = Buffer.from("same title, second bytes", "utf8");
    expect(hashCanonicalSourceBytes(first)).not.toBe(hashCanonicalSourceBytes(second));
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-")); temporaryRoots.push(workspace);
    const episodeId = normalizeEpisodeId("episode-001");
    const result = await persistContentSourceManifest({ resolver: createEpisodePathResolver(workspace), episodeId, manifest: manifestFor(first), sourceBytes: first, authorize: () => ({ allowed: true, reasonCodes: [] }) });
    expect(result.manifestPath).toBe(path.join(workspace, "episode-001", "sources", "manifests", "source-001.json"));
    expect(JSON.parse(await fs.readFile(result.manifestPath, "utf8"))).toMatchObject({ sourceId: "source-001", sourceHash: hashCanonicalSourceBytes(first) });
    expect(result.telemetry).toEqual({ sourceId: "source-001", sourceHash: hashCanonicalSourceBytes(first), allowed: true, reasonCodes: [] });
  });

  it("rejects a manifest whose declared hash does not bind its source bytes", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-")); temporaryRoots.push(workspace);
    const bytes = Buffer.from("canonical bytes", "utf8");
    const manifest = manifestFor(bytes);
    await expect(persistContentSourceManifest({ resolver: createEpisodePathResolver(workspace), episodeId: normalizeEpisodeId("episode-001"), manifest: { ...manifest, sourceHash: "b".repeat(64) }, sourceBytes: bytes, authorize: () => ({ allowed: true, reasonCodes: [] }) })).rejects.toThrow("hash does not match");
  });

  it("rejects a symlinked episode component without writing outside the episode", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-")); temporaryRoots.push(workspace);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-outside-")); temporaryRoots.push(outside);
    const episodeId = normalizeEpisodeId("episode-001");
    await fs.mkdir(path.join(workspace, "episode-001"));
    await fs.symlink(outside, path.join(workspace, "episode-001", "sources"));
    const bytes = Buffer.from("canonical bytes", "utf8");
    await expect(persistContentSourceManifest({ resolver: createEpisodePathResolver(workspace), episodeId, manifest: manifestFor(bytes), sourceBytes: bytes, authorize: () => ({ allowed: true, reasonCodes: [] }) })).rejects.toThrow("Race-safe");
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it("fails closed when an attacker swaps a bound parent during persistence", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-")); temporaryRoots.push(workspace);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "source-provenance-outside-")); temporaryRoots.push(outside);
    const episodeId = normalizeEpisodeId("episode-001");
    const sources = path.join(workspace, "episode-001", "sources");
    const displacedSources = path.join(workspace, "episode-001", "sources-displaced");
    await fs.mkdir(path.join(sources, "manifests"), { recursive: true });
    const bytes = Buffer.from("canonical bytes", "utf8");
    await expect(persistContentSourceManifest({
      resolver: createEpisodePathResolver(workspace), episodeId, manifest: manifestFor(bytes), sourceBytes: bytes,
      authorize: () => {
        renameSync(sources, displacedSources);
        symlinkSync(outside, sources, "dir");
        return { allowed: true, reasonCodes: [] };
      },
    })).rejects.toThrow("Race-safe");
    expect(await fs.readdir(outside)).toEqual([]);
    expect(await fs.readdir(path.join(displacedSources, "manifests"))).toEqual([]);
  });
});
