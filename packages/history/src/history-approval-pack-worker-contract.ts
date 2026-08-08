import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import type { HistoryApprovalPackResultV35 } from "./history-workflow-v35.js";

export interface HistoryApprovalPackEpisodeSummaryV35 {
  readonly episodeId: string;
  readonly planHash: string;
  readonly beats: number;
  readonly shots: number;
  readonly runtimeMs: number;
  readonly timingSource: HistoryVisualPlanV35["timing"]["timingSource"];
  readonly approval: HistoryVisualPlanV35["approval"];
  readonly qualityMetrics: HistoryVisualPlanV35["qualityMetrics"];
  readonly trustApproval: HistoryVisualPlanV35["trustApproval"];
  readonly modalityCounts: Record<string, number>;
  readonly mapStates: number;
  readonly timelineBeatUsage: number;
  readonly documentStates: number;
  readonly diagnostics: readonly string[];
}

export interface HistoryApprovalPackEpisodeResultV35 {
  readonly pack: HistoryApprovalPackResultV35;
  readonly summary: HistoryApprovalPackEpisodeSummaryV35;
}

export interface HistoryApprovalPackEpisodeTaskV35 {
  readonly episodeId: string;
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate: boolean;
  readonly reusePacksFrom?: string;
  readonly testSummary?: Record<string, unknown>;
}

export type HistoryApprovalPackWorkerRequestV35 =
  | {
      readonly type: "task";
      readonly taskId: number;
      readonly task: HistoryApprovalPackEpisodeTaskV35;
    }
  | {
      readonly type: "shutdown";
    };

export type HistoryApprovalPackWorkerResponseV35 =
  | {
      readonly type: "result";
      readonly taskId: number;
      readonly result: HistoryApprovalPackEpisodeResultV35;
    }
  | {
      readonly type: "error";
      readonly taskId: number;
      readonly message: string;
    };
