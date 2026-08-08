#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCombinedHistoryApprovalBundleForRangeV35,
} from "../packages/history/src/history-approval-pack-range.js";
import { resolveHistoryApprovalPackConcurrency } from "../packages/history/src/history-approval-pack-concurrency.js";
import { reportHistoryApprovalPackProgress } from "../packages/history/src/history-approval-pack-progress.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  let output;
  let concurrency;
  let useWorkerThreads = true;
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--concurrency") {
      concurrency = parsePositiveInteger(argv[index + 1] ?? "", "concurrency");
      index += 1;
      continue;
    }
    if (token === "--no-worker-threads") {
      useWorkerThreads = false;
      continue;
    }
    positional.push(token ?? "");
  }
  const from = parsePositiveInteger(positional[0] ?? "", "from");
  const to = parsePositiveInteger(positional[1] ?? "", "to");
  if (positional[2]) {
    output = path.resolve(repoRoot, positional[2]);
  }
  return {
    from,
    to,
    ...(output ? { output } : {}),
    concurrency: resolveHistoryApprovalPackConcurrency(concurrency),
    useWorkerThreads,
  };
}

const args = parseArgs(process.argv.slice(2));

const result = await createCombinedHistoryApprovalBundleForRangeV35({
  from: args.from,
  to: args.to,
  episodesDirectory: path.join(repoRoot, "episodes"),
  regenerate: true,
  concurrency: args.concurrency,
  useWorkerThreads: args.useWorkerThreads,
  onProgress: (event) => reportHistoryApprovalPackProgress(event),
  ...(args.output ? { output: args.output } : {}),
});

process.stdout.write(
  `${JSON.stringify(
    {
      from: result.from,
      to: result.to,
      regenerate: true,
      concurrency: args.concurrency,
      useWorkerThreads: args.useWorkerThreads,
      output: result.bundle.directory,
      zipPath: result.bundle.zipPath,
      zipSha256: result.bundle.zipSha256,
      comparisonReportPath: result.bundle.comparisonReportPath,
      reusedFrom: null,
      reusedEpisodeIds: [],
      regeneratedEpisodeIds: result.regeneratedEpisodeIds,
      episodes: result.bundle.episodes.map((episode) => ({
        episodeId: episode.episodeId,
        planHash: episode.planHash,
        zipSha256: episode.zipSha256,
      })),
    },
    null,
    2
  )}\n`
);
