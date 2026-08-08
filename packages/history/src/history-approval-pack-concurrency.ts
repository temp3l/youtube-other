import os from "node:os";

export const DEFAULT_HISTORY_APPROVAL_PACK_CONCURRENCY = Math.max(
  1,
  os.cpus().length
);

export function resolveHistoryApprovalPackConcurrency(
  concurrency: number | undefined
): number {
  if (concurrency === undefined) {
    return DEFAULT_HISTORY_APPROVAL_PACK_CONCURRENCY;
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("History approval-pack concurrency must be a positive integer.");
  }
  return concurrency;
}

export async function runWithHistoryApprovalPackConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
  options?: {
    readonly onItemComplete?: (input: {
      readonly completed: number;
      readonly total: number;
      readonly index: number;
      readonly item: TInput;
    }) => void;
  }
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }
  const results: TOutput[] = Array.from({ length: items.length });
  let nextIndex = 0;
  let completedCount = 0;
  const workerCount = Math.max(
    1,
    Math.min(resolveHistoryApprovalPackConcurrency(concurrency), items.length)
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) {
          return;
        }
        const item = items[current] as TInput;
        results[current] = await worker(item, current);
        completedCount += 1;
        options?.onItemComplete?.({
          completed: completedCount,
          total: items.length,
          index: current,
          item,
        });
      }
    })
  );
  return results;
}
