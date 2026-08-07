import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVeronicaBulkApprovalZip } from "../packages/veronica-media/src/review-pack/bulk-zip-pack.js";
import {
  discoverVeronicaBeniniEpisodes,
  veronicaApprovalPackDir,
} from "../packages/strategic-reinvention/src/review-pack-batch.js";
import { veronicaEpisodeStateDir } from "../packages/veronica-media/src/pipeline/orchestrator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.join(repoRoot, "episodes", "veronica-benini");
const outputDir = path.join(repoRoot, "artifacts", "review");

const episodeIds = await discoverVeronicaBeniniEpisodes(workspaceRoot);
if (episodeIds.length === 0) {
  throw new Error(`No veronica-benini episodes found under ${workspaceRoot}. Run pnpm veronica:review-packs first.`);
}

const episodes = episodeIds.map((episodeId) => {
  const episodeRoot = path.join(workspaceRoot, episodeId);
  const stateDir = veronicaEpisodeStateDir(workspaceRoot, episodeId);
  return {
    episodeId,
    episodeRoot,
    stateDir,
    approvalPackDir: veronicaApprovalPackDir(workspaceRoot, episodeId),
  };
});

const result = await buildVeronicaBulkApprovalZip({
  episodes,
  outputDir,
  zipFileName: "veronica-bulk-approval-pack-v2.zip",
});

process.stdout.write(
  `${JSON.stringify(
    {
      episodesIncluded: result.episodesIncluded,
      episodesOmitted: result.episodesOmitted,
      zipPath: result.zipPath,
      zipBytes: result.zipBytes,
      zipChecksum: result.zipChecksum,
      filesPerEpisode: result.filesPerEpisode,
      contactSheetsIncluded: result.contactSheetsIncluded,
      renderEvidenceIncluded: result.renderEvidenceIncluded,
      integrityValid: result.integrityValid,
      redactionValid: result.redactionValid,
      limitations: result.limitations,
    },
    null,
    2,
  )}\n`,
);
