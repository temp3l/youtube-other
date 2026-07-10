import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: path.join(os.tmpdir(), "story-workflow-helper-workspace", "episodes"),
  })),
}));

import { createEpisodePathResolver } from "@mediaforge/shared";
import { loadProductionStatuses } from "./story-workflow-command-helpers.js";

describe("story workflow command helpers", () => {
  it("falls back to current workspace state when no workflow manifest exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-workflow-helper-"));
    const episodesRoot = path.join(root, "episodes");
    const episodeId = "028-the-man-in-the-attic";
    const resolver = createEpisodePathResolver(episodesRoot);

    await fs.mkdir(path.join(episodesRoot, episodeId, "languages"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(episodesRoot, episodeId, "languages", "script-en.md"),
      "# Source\n",
      "utf8"
    );

    const context = { episodeId, locale: "en" as const, variant: "full" as const };
    await fs.mkdir(path.dirname(resolver.generatedNarrationScript(context)), {
      recursive: true,
    });
    await fs.writeFile(resolver.generatedNarrationScript(context), "# Generated\n", "utf8");
    await fs.mkdir(path.dirname(resolver.audioNarration(context)), { recursive: true });
    await fs.writeFile(resolver.audioNarration(context), "audio", "utf8");
    await fs.mkdir(path.dirname(resolver.captionsFile(context, "ass")), {
      recursive: true,
    });
    await fs.writeFile(
      resolver.captionsFile(context, "ass"),
      "[Script Info]\n",
      "utf8"
    );
    await fs.mkdir(resolver.metadataDir(context), { recursive: true });
    await fs.writeFile(
      path.join(resolver.metadataDir(context), "youtube-metadata.json"),
      "{}\n",
      "utf8"
    );
    await fs.mkdir(path.dirname(resolver.renderManifest(context, "youtube")), {
      recursive: true,
    });
    await fs.writeFile(
      resolver.renderManifest(context, "youtube"),
      "{}\n",
      "utf8"
    );

    const statuses = await loadProductionStatuses({
      episode: episodeId,
      outputRoot: episodesRoot,
    });

    expect(statuses).toHaveLength(1);
    const report = statuses[0]?.report;
    expect(report?.entries).toContainEqual(
      expect.objectContaining({
        stageType: "rewrite-full",
        locale: "en",
        format: "full",
        status: "completed",
      })
    );
    expect(report?.entries).toContainEqual(
      expect.objectContaining({
        stageType: "audio",
        locale: "en",
        format: "full",
        status: "completed",
      })
    );
    expect(report?.entries).toContainEqual(
      expect.objectContaining({
        stageType: "render",
        locale: "en",
        format: "full",
        status: "completed",
      })
    );
  });
});
