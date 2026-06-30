import { describe, expect, it } from "vitest";
import { summarizeRemoteStatusJob } from "./render-remote-inspection.js";

describe("remote render inspection", () => {
  it("marks a job as queued when the manifest exists but clip results do not", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-001",
        episodeId: "episode-1",
        generatedAt: "2026-06-30T00:00:00.000Z",
        totalClips: 2,
        clipIds: ["scene-001", "scene-002"],
        clipResults: [],
        logCount: 0,
      })
    ).toMatchObject({
      jobId: "run-001",
      state: "queued",
      counts: {
        total: 2,
        succeeded: 0,
        failed: 0,
        missing: 2,
      },
    });
  });

  it("marks a job as running when some clips have succeeded and others are still missing", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-002",
        totalClips: 3,
        clipResults: [{ clipId: "scene-001", status: "succeeded" }],
        logCount: 1,
      })
    ).toMatchObject({
      state: "running",
      counts: {
        total: 3,
        succeeded: 1,
        failed: 0,
        missing: 2,
      },
      logCount: 1,
    });
  });

  it("marks a job as succeeded when all clip results succeeded", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-003",
        totalClips: 2,
        clipResults: [
          { clipId: "scene-001", status: "succeeded" },
          { clipId: "scene-002", status: "succeeded" },
        ],
        logCount: 2,
      })
    ).toMatchObject({
      state: "succeeded",
      counts: {
        total: 2,
        succeeded: 2,
        failed: 0,
        missing: 0,
      },
    });
  });

  it("marks a job as partial when at least one clip fails before completion", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-004",
        totalClips: 3,
        clipResults: [
          { clipId: "scene-001", status: "succeeded" },
          { clipId: "scene-002", status: "failed" },
        ],
      })
    ).toMatchObject({
      state: "partial",
      counts: {
        total: 3,
        succeeded: 1,
        failed: 1,
        missing: 1,
      },
    });
  });

  it("marks a job as failed when every clip result failed", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-005",
        totalClips: 2,
        clipResults: [
          { clipId: "scene-001", status: "failed" },
          { clipId: "scene-002", status: "failed" },
        ],
      })
    ).toMatchObject({
      state: "failed",
      counts: {
        total: 2,
        succeeded: 0,
        failed: 2,
        missing: 0,
      },
    });
  });

  it("preserves parse errors for malformed remote metadata", () => {
    expect(
      summarizeRemoteStatusJob({
        jobId: "run-006",
        parseErrors: ["scene-001.json"],
      })
    ).toMatchObject({
      state: "unknown",
      parseErrors: ["scene-001.json"],
      counts: {
        total: 0,
        succeeded: 0,
        failed: 0,
        missing: 0,
      },
    });
  });
});

