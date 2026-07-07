import { describe, expect, it } from "vitest";
import {
  buildMotionRenderReportShot,
  createMotionRenderReport,
  motionRenderReportFilename,
  summarizeFilterOperations,
} from "./report.js";

describe("motion render report", () => {
  it("summarizes filters without command arguments", () => {
    expect(
      summarizeFilterOperations([
        {
          kind: "zoompan",
          durationSeconds: 1,
          fps: 10,
          outputWidthPx: 90,
          outputHeightPx: 160,
          startZoom: 1,
          endZoom: 1.08,
          startCenter: { x: 0.5, y: 0.5 },
          endCenter: { x: 0.5, y: 0.5 },
        },
        { kind: "format", pixelFormat: "yuv420p" },
      ])
    ).toBe("zoompan+format");
  });

  it("builds deterministic shot entries from rendered shot metadata", () => {
    const shot = buildMotionRenderReportShot({
      shot: {
        shotId: "scene-001-shot-001",
        sourceSceneId: "source-scene-001",
        sceneId: "scene-001",
        sourceImageId: "source-image-001",
        startMs: 0,
        endMs: 500,
        treatment: {
          family: "framing",
          catalogVersion: "shot-treatment-catalog-v1",
          treatmentId: "medium-crop",
          variant: "medium-crop",
        },
        crop: { x: 0, y: 0, width: 1, height: 1 },
        motion: {
          kind: "push-in",
          startScale: 1,
          endScale: 1.08,
          anchor: { x: 0.5, y: 0.5 },
        },
        overlays: [],
        transition: { kind: "hard-cut", durationMs: 0 },
      },
      sourceImageId: "source-image-001",
      durationMs: 500,
      inputImage: "shared/images/generated/source-001.png",
      outputSegment: "state/render/derived-shots/abc.mp4",
      seed: "seed:scene-001-shot-001",
      operations: [{ kind: "format", pixelFormat: "yuv420p" }],
      cache: { status: "hit", fingerprint: "a".repeat(64) },
    });

    expect(motionRenderReportFilename).toBe("motion-report.json");
    expect(shot).toMatchObject({
      shotId: "scene-001-shot-001",
      selectedPreset: {
        id: "doc_slow_push_in",
        family: "documentary",
        intensity: "low",
      },
      filterSummary: "format",
      reason: "shot-plan-motion:push-in",
      cache: { status: "hit" },
    });
  });

  it("creates versioned report payloads", () => {
    expect(
      createMotionRenderReport({
        episodeId: "episode-fixture",
        rendererVersion: "renderer-v1",
        outputDir: ".",
        generatedAt: "2026-07-04T00:00:00.000Z",
        shots: [],
      })
    ).toEqual({
      schemaVersion: 1,
      episodeId: "episode-fixture",
      rendererVersion: "renderer-v1",
      outputDir: ".",
      generatedAt: "2026-07-04T00:00:00.000Z",
      shots: [],
    });
  });
});
