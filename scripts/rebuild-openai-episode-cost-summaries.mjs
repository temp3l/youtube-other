#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { rebuildOpenAIEpisodeCostSummary } from "@mediaforge/shared";

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function episodeRoots(root) {
  if (await isDirectory(path.join(root, "debug", "openai-calls"))) return [root];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (await isDirectory(path.join(candidate, "debug", "openai-calls"))) {
      roots.push(candidate);
    }
  }
  return roots.sort();
}

async function main() {
  const root = path.resolve(process.argv[2] ?? "episodes");
  const roots = await episodeRoots(root);
  if (roots.length === 0) {
    throw new Error(`No episode-local OpenAI call logs found under ${root}.`);
  }
  for (const episodeRoot of roots) {
    const summary = await rebuildOpenAIEpisodeCostSummary({ episodeRoot });
    const total =
      summary.totalEstimatedCostUsd === null
        ? `$${summary.knownEstimatedCostUsd.toFixed(6)} known (${summary.calls.unpricedProviderCalls} unpriced)`
        : `$${summary.totalEstimatedCostUsd.toFixed(6)}`;
    process.stdout.write(
      `${path.relative(process.cwd(), episodeRoot)}: ${summary.calls.paidProviderCalls} paid calls | ${total}\n`
    );
  }
}

await main();
