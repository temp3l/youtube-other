import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: await fs.mkdtemp(path.join(os.tmpdir(), "story-pipeline-cli-")),
  })),
}));

import {
  buildPlannedStoryWorkflowManifest,
  StoryWorkflowManifestStore,
} from "@mediaforge/story-localization";
import {
  commandStoriesPipelineInspect,
  commandStoriesPipelineStatus,
} from "./story-pipeline-command.js";

function makeOutput() {
  let text = "";
  return {
    stdout: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    read() {
      return text;
    },
  };
}

describe("story pipeline CLI integration", () => {
  it("reads persisted manifests for status and inspect", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-pipeline-status-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    await new StoryWorkflowManifestStore(root, manifest.episodeId).create(manifest);
    const statusOutput = makeOutput();
    await commandStoriesPipelineStatus(
      {
        episode: manifest.episodeId,
        workflow: manifest.workflowId,
        outputRoot: root,
        json: true,
      },
      statusOutput
    );
    expect(JSON.parse(statusOutput.read()).result).toBe("planned");

    const inspectOutput = makeOutput();
    await commandStoriesPipelineInspect(
      {
        episode: manifest.episodeId,
        workflow: manifest.workflowId,
        outputRoot: root,
      },
      inspectOutput
    );
    expect(JSON.parse(inspectOutput.read()).workflowId).toBe(manifest.workflowId);
  });
});
