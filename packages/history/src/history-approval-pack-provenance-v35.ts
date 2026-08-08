import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HISTORY_APPROVAL_PACK_V35,
  HISTORY_VISUAL_PLANNER_V35,
} from "./history-v35-contracts.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

const SEMANTIC_BASELINE_TAG = "history-v3.5-semantic-baseline";

function gitOutput(args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function resolveHistoryGitProvenanceV35(): {
  readonly gitCommitSha: string | null;
  readonly gitBranch: string | null;
  readonly semanticBaselineCommitSha: string | null;
} {
  return {
    gitCommitSha: gitOutput(["rev-parse", "HEAD"]),
    gitBranch: gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]),
    semanticBaselineCommitSha: gitOutput(["rev-parse", SEMANTIC_BASELINE_TAG]),
  };
}

export function buildHistoryApprovalPackProvenanceV35(input: {
  readonly generatedAt?: Date;
  readonly episodeRange: string;
}): {
  readonly generatedAt: string;
  readonly gitCommitSha: string | null;
  readonly gitBranch: string | null;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V35;
  readonly semanticBaselineCommitSha: string | null;
  readonly artifactKind: typeof HISTORY_APPROVAL_PACK_V35;
  readonly episodeRange: string;
} {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const git = resolveHistoryGitProvenanceV35();
  return {
    generatedAt,
    gitCommitSha: git.gitCommitSha,
    gitBranch: git.gitBranch,
    plannerVersion: HISTORY_VISUAL_PLANNER_V35,
    semanticBaselineCommitSha: git.semanticBaselineCommitSha,
    artifactKind: HISTORY_APPROVAL_PACK_V35,
    episodeRange: input.episodeRange,
  };
}
