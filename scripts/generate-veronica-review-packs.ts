import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVeronicaBeniniReviewPacks } from "../packages/strategic-reinvention/src/review-pack-batch.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.join(repoRoot, "episodes", "veronica-benini");
const bulkOutputDir = path.join(repoRoot, "artifacts", "veronica-benini", "approval-packs");
const contentMatrixPath = path.join(
  repoRoot,
  "docs/discovery-packs/veronica-benini-youtube-genre-discovery-pack/06-samples/content-matrix.csv",
);

const result = await generateVeronicaBeniniReviewPacks({
  workspaceRoot,
  bulkOutputDir,
  contentMatrixPath,
  scaffoldMissing: true,
  resume: false,
});

process.stdout.write(
  `${JSON.stringify(
    {
      episodeCount: result.episodes.length,
      workspaceRoot: result.workspaceRoot,
      bulkOutputDir: result.bulk.outputDir,
      aggregateReviewPath: result.bulk.aggregateReviewPath,
      findingsPath: result.bulk.findingsPath,
      episodes: result.episodes.map((episode) => ({
        episodeId: episode.episodeId,
        approvalPackDir: episode.approvalPackDir,
        renderEligible: episode.renderEligible,
        contentHash: episode.contentHash,
      })),
    },
    null,
    2,
  )}\n`,
);
