import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalJson } from "../canonical-json.js";

export interface BulkApprovalEpisodeRef {
  readonly episodeId: string;
  readonly packRoot: string;
}

export interface BulkApprovalReviewResult {
  readonly outputDir: string;
  readonly aggregateReviewPath: string;
  readonly findingsPath: string;
  readonly episodeCount: number;
}

export async function exportBulkVeronicaApprovalReview(input: {
  readonly outputDir: string;
  readonly episodes: readonly BulkApprovalEpisodeRef[];
}): Promise<BulkApprovalReviewResult> {
  if (input.episodes.length === 0) {
    throw new Error("Bulk approval review requires at least one episode pack.");
  }
  await fs.mkdir(input.outputDir, { recursive: true });
  const episodeSummaries: Array<{
    episodeId: string;
    eligibility: boolean;
    packChecksum: string;
    blockingIssueCount: number;
    files: readonly string[];
  }> = [];
  const findings: string[] = ["# Cross-episode approval findings", ""];
  for (const episode of input.episodes) {
    const aggregatePath = path.join(episode.packRoot, "aggregate-review.json");
    const eligibilityPath = path.join(episode.packRoot, "approval-eligibility.json");
    const aggregate = JSON.parse(await fs.readFile(aggregatePath, "utf8")) as {
      eligibility?: boolean;
      packChecksum?: string;
      files?: string[];
    };
    let blockingIssueCount = 0;
    try {
      const eligibility = JSON.parse(await fs.readFile(eligibilityPath, "utf8")) as {
        issues?: Array<{ severity?: string }>;
      };
      blockingIssueCount =
        eligibility.issues?.filter((issue) => issue.severity === "blocking-error").length ?? 0;
    } catch {
      blockingIssueCount = aggregate.eligibility === true ? 0 : 1;
    }
    episodeSummaries.push({
      episodeId: episode.episodeId,
      eligibility: aggregate.eligibility === true,
      packChecksum: aggregate.packChecksum ?? "",
      blockingIssueCount,
      files: aggregate.files ?? [],
    });
    findings.push(
      `- **${episode.episodeId}**: eligibility=${aggregate.eligibility === true ? "eligible" : "review"}, blocking=${blockingIssueCount}`,
    );
  }
  const aggregateReview = {
    schemaVersion: "veronica-bulk-aggregate-review.v1",
    episodeCount: episodeSummaries.length,
    episodes: episodeSummaries,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(canonicalJson(episodeSummaries)).digest("hex"),
  };
  const aggregateReviewPath = path.join(input.outputDir, "aggregate-review.json");
  await fs.writeFile(aggregateReviewPath, `${JSON.stringify(aggregateReview, null, 2)}\n`, "utf8");
  const findingsPath = path.join(input.outputDir, "cross-episode-findings.md");
  await fs.writeFile(findingsPath, `${findings.join("\n")}\n`, "utf8");
  return {
    outputDir: input.outputDir,
    aggregateReviewPath,
    findingsPath,
    episodeCount: episodeSummaries.length,
  };
}
