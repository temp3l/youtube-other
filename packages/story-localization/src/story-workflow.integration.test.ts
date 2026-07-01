import { describe, expect, it } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { resolveLocaleWorkflowBranch } from "./story-workflow-locales.js";
import { resolveShortWorkflow } from "./story-workflow-shorts.js";
import { resolveVisualBranch } from "./story-workflow-visual.js";
import { buildStoryWorkflowStatusReport } from "./story-workflow-status.js";
import { workflowLocaleSchema } from "./story-workflow.schemas.js";

describe("story workflow integration harness", () => {
  it("covers planned success, locale fallback, partial failure, and sp prevention", () => {
    expect(workflowLocaleSchema.safeParse("sp").success).toBe(false);
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const english = manifest.artifacts[0];
    const locale = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const short = resolveShortWorkflow({
      locale: "en",
      ...(english ? { parentFull: english } : {}),
    });
    const visual = resolveVisualBranch({
      englishFullAccepted: true,
      englishQualityPassed: true,
      localeFailures: ["es"],
    });
    const status = buildStoryWorkflowStatusReport(manifest);
    expect(locale.status).toBe("blocked");
    expect(short.status).toBe("skipped");
    expect(visual.sharedImagesStatus).toBe("planned");
    expect(status.result).toBe("planned");
  });
});
