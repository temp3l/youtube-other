import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import {
  resolveHistoryApprovalPackConcurrency,
  runWithHistoryApprovalPackConcurrency,
} from "./history-approval-pack-concurrency.js";
import { completeHistoryApprovalPackEpisodeV35 } from "./history-approval-pack-episode.js";
import type {
  HistoryApprovalPackEpisodeResultV35,
  HistoryApprovalPackEpisodeTaskV35,
  HistoryApprovalPackWorkerRequestV35,
  HistoryApprovalPackWorkerResponseV35,
} from "./history-approval-pack-worker-contract.js";
import type { HistoryApprovalPackProgressEventV35 } from "./history-approval-pack-progress.js";

const require = createRequire(import.meta.url);

export function resolveHistoryApprovalPackWorkerUrl(): URL {
  const sourceWorker = fileURLToPath(
    new URL("./history-approval-pack-worker.ts", import.meta.url)
  );
  const compiledWorker = fileURLToPath(
    new URL("./history-approval-pack-worker.js", import.meta.url)
  );
  if (existsSync(compiledWorker) && !existsSync(sourceWorker)) {
    return pathToFileURL(compiledWorker);
  }
  return pathToFileURL(sourceWorker);
}

export function resolveHistoryApprovalPackWorkerExecArgv(): readonly string[] {
  if (process.execArgv.some((argument) => argument.includes("tsx"))) {
    return process.execArgv;
  }
  try {
    const tsxPath = require.resolve("tsx");
    return ["--import", tsxPath];
  } catch {
    return [];
  }
}

async function runHistoryApprovalPackWorkerTask(input: {
  readonly worker: Worker;
  readonly taskId: number;
  readonly task: HistoryApprovalPackEpisodeTaskV35;
}): Promise<HistoryApprovalPackEpisodeResultV35> {
  return await new Promise((resolve, reject) => {
    const onMessage = (message: HistoryApprovalPackWorkerResponseV35): void => {
      if (message.taskId !== input.taskId) {
        return;
      }
      cleanup();
      if (message.type === "error") {
        reject(
          new Error(
            `${input.task.episodeId}: ${message.message}`
          )
        );
        return;
      }
      resolve(message.result);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      input.worker.off("message", onMessage);
      input.worker.off("error", onError);
    };
    input.worker.on("message", onMessage);
    input.worker.on("error", onError);
    const request: HistoryApprovalPackWorkerRequestV35 = {
      type: "task",
      taskId: input.taskId,
      task: input.task,
    };
    input.worker.postMessage(request);
  });
}

async function shutdownHistoryApprovalPackWorker(worker: Worker): Promise<void> {
  worker.postMessage({ type: "shutdown" } satisfies HistoryApprovalPackWorkerRequestV35);
  await worker.terminate();
}

export async function runHistoryApprovalPackEpisodesInWorkerPool(input: {
  readonly tasks: readonly HistoryApprovalPackEpisodeTaskV35[];
  readonly concurrency?: number;
  readonly onProgress?: (event: HistoryApprovalPackProgressEventV35) => void;
}): Promise<HistoryApprovalPackEpisodeResultV35[]> {
  if (input.tasks.length === 0) {
    return [];
  }
  const concurrency = resolveHistoryApprovalPackConcurrency(input.concurrency);
  const workerCount = Math.min(concurrency, input.tasks.length);
  const workers = Array.from({ length: workerCount }, () => {
    return new Worker(resolveHistoryApprovalPackWorkerUrl(), {
      execArgv: [...resolveHistoryApprovalPackWorkerExecArgv()],
    });
  });
  const results = new Array<HistoryApprovalPackEpisodeResultV35>(input.tasks.length);
  let nextTaskIndex = 0;
  let completedCount = 0;
  try {
    await Promise.all(
      workers.map(async (worker) => {
        while (true) {
          const taskIndex = nextTaskIndex;
          nextTaskIndex += 1;
          if (taskIndex >= input.tasks.length) {
            return;
          }
          const task = input.tasks[taskIndex];
          if (!task) {
            throw new Error("History approval-pack worker task is missing.");
          }
          results[taskIndex] = await runHistoryApprovalPackWorkerTask({
            worker,
            taskId: taskIndex,
            task,
          });
          completedCount += 1;
          input.onProgress?.({
            completed: completedCount,
            total: input.tasks.length,
            episodeId: task.episodeId,
            phase: "episodes",
          });
        }
      })
    );
    return results;
  } finally {
    await Promise.all(workers.map((worker) => shutdownHistoryApprovalPackWorker(worker)));
  }
}

export async function runHistoryApprovalPackEpisodesV35(input: {
  readonly tasks: readonly HistoryApprovalPackEpisodeTaskV35[];
  readonly concurrency?: number;
  readonly useWorkerThreads?: boolean;
  readonly onProgress?: (event: HistoryApprovalPackProgressEventV35) => void;
}): Promise<HistoryApprovalPackEpisodeResultV35[]> {
  const reportEpisodeProgress = (
    completed: number,
    task: HistoryApprovalPackEpisodeTaskV35
  ): void => {
    input.onProgress?.({
      completed,
      total: input.tasks.length,
      episodeId: task.episodeId,
      phase: "episodes",
    });
  };
  if (input.useWorkerThreads === false) {
    return await runWithHistoryApprovalPackConcurrency(
      input.tasks,
      resolveHistoryApprovalPackConcurrency(input.concurrency),
      async (task) => completeHistoryApprovalPackEpisodeV35(task),
      {
        onItemComplete: ({ completed, item }) => {
          reportEpisodeProgress(completed, item);
        },
      }
    );
  }
  try {
    return await runHistoryApprovalPackEpisodesInWorkerPool({
      tasks: input.tasks,
      ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
  } catch (error) {
    if (input.useWorkerThreads === true) {
      throw error;
    }
    return await runWithHistoryApprovalPackConcurrency(
      input.tasks,
      resolveHistoryApprovalPackConcurrency(input.concurrency),
      async (task) => completeHistoryApprovalPackEpisodeV35(task),
      {
        onItemComplete: ({ completed, item }) => {
          reportEpisodeProgress(completed, item);
        },
      }
    );
  }
}
