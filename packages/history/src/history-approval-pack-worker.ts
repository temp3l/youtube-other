import { parentPort } from "node:worker_threads";
import { completeHistoryApprovalPackEpisodeV35 } from "./history-approval-pack-episode.js";
import type {
  HistoryApprovalPackWorkerRequestV35,
  HistoryApprovalPackWorkerResponseV35,
} from "./history-approval-pack-worker-contract.js";

function postMessage(message: HistoryApprovalPackWorkerResponseV35): void {
  parentPort?.postMessage(message);
}

parentPort?.on(
  "message",
  async (message: HistoryApprovalPackWorkerRequestV35) => {
    if (message.type === "shutdown") {
      process.exit(0);
    }
    try {
      const result = await completeHistoryApprovalPackEpisodeV35(message.task);
      postMessage({
        type: "result",
        taskId: message.taskId,
        result,
      });
    } catch (error: unknown) {
      postMessage({
        type: "error",
        taskId: message.taskId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
