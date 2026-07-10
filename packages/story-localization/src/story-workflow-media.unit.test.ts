import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateOutputReadiness,
  persistOutputReadiness,
  resolveMediaDependencies,
  summarizeOutputReadiness,
} from "./story-workflow-media.js";

describe("story workflow media adapters", () => {
  it("blocks render when audio is missing", () => {
    const result = resolveMediaDependencies({
      episodeId: "009-the-christmas-doll",
      locale: "es",
      format: "full",
      profile: "youtube",
      storyAccepted: true,
      imagesReady: true,
      audioReady: false,
      captionsReady: true,
      metadataReady: true,
      thumbnailReady: true,
    });
    expect(result.render).toBe("blocked");
    expect(result.publish).toBe("planned");
  });

  it("blocks publish when metadata or thumbnail is missing", () => {
    const result = resolveMediaDependencies({
      episodeId: "009-the-christmas-doll",
      locale: "es",
      format: "short",
      profile: "vertical",
      storyAccepted: true,
      imagesReady: true,
      audioReady: true,
      captionsReady: true,
      metadataReady: false,
      thumbnailReady: true,
      renderReady: true,
    });
    expect(result.publish).toBe("blocked");
  });

  it("summarizes only the affected outputs and persists readiness at locale/profile scope", async () => {
    const blocked = evaluateOutputReadiness({
      episodeId: "009-the-christmas-doll",
      locale: "de",
      format: "full",
      profile: "youtube",
      storyAccepted: true,
      imagesReady: false,
      audioReady: true,
      captionsReady: true,
      metadataReady: true,
      thumbnailReady: true,
    });
    const ready = evaluateOutputReadiness({
      episodeId: "010-another-episode",
      locale: "es",
      format: "short",
      profile: "vertical",
      storyAccepted: true,
      imagesReady: true,
      audioReady: true,
      captionsReady: true,
      metadataReady: true,
      thumbnailReady: true,
      renderReady: true,
    });

    const summary = summarizeOutputReadiness([blocked, ready]);
    expect(summary.summary.blocked).toBe(1);
    expect(summary.summary.ready).toBe(1);
    expect(blocked.imageSource).toBe("canonical-full-reuse");
    expect(ready.imageSource).toBe("short-only");
    expect(blocked.blockedBy).toEqual([
      {
        dependency: "images",
        message: "Missing or invalid render images.",
      },
    ]);

    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "story-workflow-media-")
    );
    const filePath = await persistOutputReadiness(workspaceRoot, blocked);
    expect(filePath).toBe(
      path.join(
        workspaceRoot,
        "009-the-christmas-doll",
        "locales",
        "de",
        "full",
        "renders",
        "youtube",
        "readiness.json"
      )
    );
    await expect(fs.readFile(filePath, "utf8")).resolves.toContain(
      "\"status\": \"blocked\""
    );
  });
});
