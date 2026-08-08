import fs from "node:fs/promises";
import path from "node:path";
import { normalizeEpisodeId } from "@mediaforge/shared";
import {
  defaultHistoryApprovalPackRangeOutput,
  discoverHistoryStoryPackEpisodeIds,
} from "./history-episode-discovery.js";
import { createCombinedHistoryApprovalBundleV35 } from "./history-workflow-v35.js";
import type { HistoryApprovalPackProgressEventV35 } from "./history-approval-pack-progress.js";

async function historyApprovalPackExists(
  reuseDirectory: string,
  episodeId: string
): Promise<boolean> {
  const nested = path.join(
    reuseDirectory,
    `${normalizeEpisodeId(episodeId)}-v3.5`
  );
  try {
    await fs.access(nested);
    await fs.access(`${nested}.zip`);
    return true;
  } catch {
    return false;
  }
}

export async function buildCombinedHistoryApprovalBundleRequestV35(input: {
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot: string;
  readonly regenerate?: boolean;
  readonly reusePacksFrom?: string;
  readonly concurrency?: number;
  readonly useWorkerThreads?: boolean;
  readonly onProgress?: (event: HistoryApprovalPackProgressEventV35) => void;
}): Promise<{
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot: string;
  readonly regenerate?: boolean;
  readonly reusePacksFrom?: string;
  readonly regenerateOnlyEpisodeIds?: readonly string[];
  readonly concurrency?: number;
  readonly useWorkerThreads?: boolean;
  readonly onProgress?: (event: HistoryApprovalPackProgressEventV35) => void;
}> {
  if (input.regenerate || !input.reusePacksFrom) {
    return {
      episodeIds: input.episodeIds,
      output: input.output,
      outputRoot: input.outputRoot,
      ...(input.regenerate ? { regenerate: true } : {}),
      ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
      ...(input.useWorkerThreads !== undefined
        ? { useWorkerThreads: input.useWorkerThreads }
        : {}),
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    };
  }
  const reusePacksFrom = path.resolve(input.reusePacksFrom);
  const reusedEpisodeIds: string[] = [];
  for (const episodeId of input.episodeIds) {
    if (await historyApprovalPackExists(reusePacksFrom, episodeId)) {
      reusedEpisodeIds.push(episodeId);
    }
  }
  const regenerateOnlyEpisodeIds = input.episodeIds.filter(
    (episodeId) => !reusedEpisodeIds.includes(episodeId)
  );
  return {
    episodeIds: input.episodeIds,
    output: input.output,
    outputRoot: input.outputRoot,
    ...(reusedEpisodeIds.length ? { reusePacksFrom } : {}),
    regenerateOnlyEpisodeIds,
    ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
    ...(input.useWorkerThreads !== undefined
      ? { useWorkerThreads: input.useWorkerThreads }
      : {}),
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  };
}

export async function createCombinedHistoryApprovalBundleForRangeV35(input: {
  readonly from: number;
  readonly to: number;
  readonly episodesDirectory: string;
  readonly output?: string;
  readonly regenerate?: boolean;
  readonly reusePacksFrom?: string;
  readonly concurrency?: number;
  readonly useWorkerThreads?: boolean;
  readonly onProgress?: (event: HistoryApprovalPackProgressEventV35) => void;
}): Promise<{
  readonly from: number;
  readonly to: number;
  readonly episodeIds: readonly string[];
  readonly reusedEpisodeIds: readonly string[];
  readonly regeneratedEpisodeIds: readonly string[];
  readonly bundle: Awaited<ReturnType<typeof createCombinedHistoryApprovalBundleV35>>;
}> {
  const episodeIds = discoverHistoryStoryPackEpisodeIds({
    episodesDirectory: input.episodesDirectory,
    from: input.from,
    to: input.to,
  });
  if (episodeIds.length === 0) {
    throw new Error(
      `No canonical History story-pack episodes found for range ${input.from}-${input.to} under ${input.episodesDirectory}.`
    );
  }
  const output = path.resolve(
    input.output ??
      defaultHistoryApprovalPackRangeOutput({
        from: input.from,
        to: input.to,
      })
  );
  const request = await buildCombinedHistoryApprovalBundleRequestV35({
    episodeIds,
    output,
    outputRoot: input.episodesDirectory,
    ...(input.regenerate ? { regenerate: true } : {}),
    ...(input.reusePacksFrom ? { reusePacksFrom: input.reusePacksFrom } : {}),
    ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
    ...(input.useWorkerThreads !== undefined
      ? { useWorkerThreads: input.useWorkerThreads }
      : {}),
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  });
  const bundle = await createCombinedHistoryApprovalBundleV35(request);
  const reusedEpisodeIds = request.reusePacksFrom
    ? episodeIds.filter(
        (episodeId) => !request.regenerateOnlyEpisodeIds?.includes(episodeId)
      )
    : [];
  const regeneratedEpisodeIds = request.regenerate
    ? [...episodeIds]
    : (request.regenerateOnlyEpisodeIds ?? [...episodeIds]);
  return {
    from: input.from,
    to: input.to,
    episodeIds,
    reusedEpisodeIds,
    regeneratedEpisodeIds,
    bundle,
  };
}
