import fs from "node:fs/promises";
import path from "node:path";
import {
  createHistoryApprovalPackV35,
  reuseHistoryApprovalPackV35,
} from "./history-workflow-v35.js";
import type {
  HistoryApprovalPackEpisodeResultV35,
  HistoryApprovalPackEpisodeTaskV35,
  HistoryApprovalPackEpisodeSummaryV35,
} from "./history-approval-pack-worker-contract.js";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";

function summarizeHistoryVisualPlanV35(
  plan: HistoryVisualPlanV35
): HistoryApprovalPackEpisodeSummaryV35 {
  return {
    episodeId: plan.episodeId,
    planHash: plan.planHash,
    beats: plan.beats.length,
    shots: plan.shots.length,
    runtimeMs: plan.timing.totalDurationMs,
    timingSource: plan.timing.timingSource,
    approval: plan.approval,
    qualityMetrics: plan.qualityMetrics,
    trustApproval: plan.trustApproval,
    modalityCounts: plan.beats.reduce<Record<string, number>>((acc, beat) => {
      acc[beat.modality] = (acc[beat.modality] ?? 0) + 1;
      return acc;
    }, {}),
    mapStates: plan.mapStates.length,
    timelineBeatUsage: plan.beats.filter((beat) => beat.modality === "timeline")
      .length,
    documentStates: plan.documentStates.length,
    diagnostics: plan.diagnostics.map((item) => item.code),
  };
}

export async function completeHistoryApprovalPackEpisodeV35(
  task: HistoryApprovalPackEpisodeTaskV35
): Promise<HistoryApprovalPackEpisodeResultV35> {
  const pack =
    task.reusePacksFrom && !task.regenerate
      ? await reuseHistoryApprovalPackV35({
          episodeId: task.episodeId,
          output: task.output,
          reusePacksFrom: task.reusePacksFrom,
        })
      : await createHistoryApprovalPackV35({
          episodeId: task.episodeId,
          output: task.output,
          ...(task.outputRoot ? { outputRoot: task.outputRoot } : {}),
          ...(task.regenerate ? { regenerate: true } : {}),
          ...(task.testSummary ? { testSummary: task.testSummary } : {}),
        });
  const plan = JSON.parse(
    await fs.readFile(path.join(task.output, "plan.json"), "utf8")
  ) as HistoryVisualPlanV35;
  return {
    pack,
    summary: summarizeHistoryVisualPlanV35(plan),
  };
}
