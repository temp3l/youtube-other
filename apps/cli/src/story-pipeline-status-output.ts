import {
  buildStoryWorkflowStatusReport,
  type StoryWorkflowStatusReport,
} from "@mediaforge/story-localization";
import type { StoryWorkflowManifest } from "@mediaforge/story-localization";

export function buildStoryPipelineStatusJson(
  manifest: StoryWorkflowManifest,
  currentManifest?: StoryWorkflowManifest
): StoryWorkflowStatusReport {
  return buildStoryWorkflowStatusReport(manifest, {
    ...(currentManifest ? { currentManifest } : {}),
  });
}

export function formatStoryPipelineStatus(
  manifest: StoryWorkflowManifest,
  currentManifest?: StoryWorkflowManifest
): string {
  const report = buildStoryPipelineStatusJson(manifest, currentManifest);
  const localeLines = report.locales.map(
    (entry) =>
      `- ${entry.locale}: ${entry.succeeded} succeeded, ${entry.failed} failed, ${entry.blocked} blocked, ${entry.planned} planned`
  );
  const failureLines = report.failures.map(
    (failure) =>
      `- ${failure.stageId}: ${failure.failureCategory} (${failure.retryability}) - ${failure.message}`
  );
  const staleLines = report.staleStages.map(
    (stage) =>
      `- ${stage.stageId}: ${stage.reasons.join(", ")}`
  );
  const fallbackLines = (report.fallbacks ?? []).map(
    (fallback) =>
      `- ${fallback.stageId}: ${fallback.provenance} (${fallback.status})`
  );
  return [
    `Workflow: ${report.workflowId}`,
    `Execution: ${report.executionId}`,
    `Episode: ${report.episodeId}`,
    `Result: ${report.result}`,
    "Locales:",
    ...(localeLines.length > 0 ? localeLines : ["- none"]),
    ...(staleLines.length > 0 ? ["Stale stages:", ...staleLines] : []),
    ...(fallbackLines.length > 0 ? ["Fallbacks:", ...fallbackLines] : []),
    ...(failureLines.length > 0 ? ["Failures:", ...failureLines] : []),
  ].join("\n") + "\n";
}
