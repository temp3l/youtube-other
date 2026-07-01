import { describe, expect, it } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "@mediaforge/story-localization";
import {
  buildStoryPipelineStatusJson,
  formatStoryPipelineStatus,
} from "./story-pipeline-status-output.js";

describe("story pipeline status output", () => {
  it("formats planned workflow status for humans and JSON", () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const json = buildStoryPipelineStatusJson(manifest);
    const text = formatStoryPipelineStatus(manifest);
    expect(json.result).toBe("planned");
    expect(json.locales.some((entry) => entry.locale === "es")).toBe(true);
    expect(text).toContain("Workflow:");
    expect(text).toContain("Result: planned");
  });
});
