import { describe, expect, it } from "vitest";

const worker = await import("../../../scripts/remote-render-worker.mjs");

describe("remote render worker manifest gate", () => {
  const workspace = "/srv/mediaforge/jobs/run-001";
  const assets = "/srv/mediaforge/assets";
  const dependency = { sourcePath: "/private/source", contentHash: "a".repeat(64), remotePath: `${assets}/${"a".repeat(64)}`, sizeBytes: 1 };
  const job = {
    clipId: "scene-001", sequenceNumber: 1, inputPaths: [dependency.remotePath], readyPath: `${workspace}/ready/scene-001.json`,
    dependencies: [dependency], outputPath: `${workspace}/output/scene-001.mp4`, metadataPath: `${workspace}/metadata/scene-001.json`, logPath: `${workspace}/logs/scene-001.log`, ffmpegArguments: ["-i", dependency.remotePath, `${workspace}/output/scene-001.mp4`],
  };
  const manifest = (nextJob = job) => ({ schemaVersion: 2, runId: "run", episodeId: "episode", concurrency: 1, generatedAt: "2026-08-01T00:00:00.000Z", jobs: [nextJob] });

  it("rejects malicious manifest paths before a child process can be created", () => {
    expect(() => worker.validateManifest(manifest({ ...job, ffmpegArguments: ["/etc/passwd"] }), workspace, assets)).toThrow(/controlled roots/u);
    expect(() => worker.validateManifest(manifest({ ...job, inputPaths: ["/tmp/asset"] }), workspace, assets)).toThrow(/dependencies/u);
    expect(() => worker.validateManifest(manifest({ ...job, ffmpegArguments: ["subtitles=/etc/passwd"] }), workspace, assets)).toThrow(/forbidden/u);
    expect(() => worker.validateManifest(manifest({ ...job, ffmpegArguments: ["-i", "../../secret"] }), workspace, assets)).toThrow(/traversal/u);
    expect(() => worker.validateManifest(manifest({ ...job, ffmpegArguments: ["assets/../../secret"] }), workspace, assets)).toThrow(/traversal/u);
    expect(() => worker.validateManifest(manifest({ ...job, sequenceNumber: -1 }), workspace, assets)).toThrow(/invalid/u);
    expect(() => worker.validateManifest({ ...manifest(), generatedAt: "2026-99-99T99:99:99Z" }, workspace, assets)).toThrow(/Invalid/u);
    expect(() => worker.validateManifest({ ...manifest(), generatedAt: "2026-02-30T00:00Z" }, workspace, assets)).toThrow(/Invalid/u);
    expect(() => worker.validateManifest({ ...manifest(), generatedAt: "2024-02-29T00:00Z" }, workspace, assets)).not.toThrow();
    expect(() => worker.validateManifest({ ...manifest(), generatedAt: "2026-08-01T00:00Z" }, workspace, assets)).not.toThrow();
    expect(() => worker.validateManifest({ ...manifest(), generatedAt: "2026-08-01T00:00:00+01:00" }, workspace, assets)).toThrow(/Invalid/u);
    expect(() => worker.validateManifest(manifest({ ...job, dependencies: [{ ...dependency, sourcePath: "" }] }), workspace, assets)).toThrow(/invalid dependency/u);
  });

  it("requires exact marker input, hash, and dependency pairs", () => {
    const marker = { schemaVersion: 1, clipId: job.clipId, generatedAt: "2026-08-01T00:00:00.000Z", inputPaths: [...job.inputPaths], dependencyHashes: [dependency.contentHash], dependencies: [{ ...dependency }] };
    expect(worker.isValidReadyMarker(job, marker)).toBe(true);
    expect(worker.isValidReadyMarker(job, { ...marker, dependencies: [{ ...dependency, sizeBytes: 2 }] })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, dependencyHashes: ["b".repeat(64)] })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "not-a-date" })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "August 1, 2026" })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "2026-99-99T99:99:99Z" })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "2026-02-30T00:00Z" })).toBe(false);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "2024-02-29T00:00Z" })).toBe(true);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "2026-08-01T00:00Z" })).toBe(true);
    expect(worker.isValidReadyMarker(job, { ...marker, generatedAt: "2026-08-01T00:00:00+01:00" })).toBe(false);
  });
});
