import { describe, expect, it } from "vitest";
import { resolveShortWorkflow } from "./story-workflow-shorts.js";
import { type ArtifactLineage } from "./story-workflow.types.js";

function artifact(format: "full" | "short"): ArtifactLineage {
  return {
    artifactId: `artifact:009-the-christmas-doll:en:${format}:narration:deadbeef` as ArtifactLineage["artifactId"],
    artifactType: `${format}-story-package`,
    owner: "narration",
    locale: "en",
    format,
    provenance: "generated",
    path: `en/${format}/script.md`,
    fingerprint: "b".repeat(64),
    schemaVersion: `${format}-story-package-v1`,
    parents: [],
    sourceStageId: `stage:rewrite-${format}:en:${format}` as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow shorts", () => {
  it("skips short generation when full is blocked", () => {
    expect(resolveShortWorkflow({ locale: "en" }).status).toBe("skipped");
  });

  it("accepts a short independently from full", () => {
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      shortArtifact: artifact("short"),
      qualityPassed: true,
    });
    expect(result.status).toBe("accepted");
  });

  it("blocks on short quality failure without falling back to full", () => {
    const result = resolveShortWorkflow({
      locale: "en",
      parentFull: artifact("full"),
      shortArtifact: artifact("short"),
      qualityPassed: false,
    });
    expect(result.status).toBe("blocked");
    expect(result.failure?.category).toBe("short-quality-gate-failed");
  });
});
