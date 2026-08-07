import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportBulkVeronicaApprovalReview } from "./bulk-aggregate.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function writeEpisodePack(root: string, episodeId: string, eligible: boolean): Promise<string> {
  const packRoot = path.join(root, episodeId, "approval-pack");
  await fs.mkdir(packRoot, { recursive: true });
  await fs.writeFile(
    path.join(packRoot, "aggregate-review.json"),
    `${JSON.stringify(
      {
        schemaVersion: "veronica-aggregate-review.v1",
        episodeId,
        eligibility: eligible,
        packChecksum: `${episodeId}-checksum`,
        files: ["semantic-plan.json"],
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.join(packRoot, "approval-eligibility.json"),
    `${JSON.stringify(
      {
        renderEligible: eligible,
        issues: eligible
          ? []
          : [{ severity: "blocking-error", code: "TEST_BLOCK", detail: "fixture blocker" }],
      },
      null,
      2,
    )}\n`,
  );
  return packRoot;
}

describe("exportBulkVeronicaApprovalReview", () => {
  it("aggregates multiple episode approval packs into a bulk review", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bulk-approval-"));
    temporaryRoots.push(workspace);
    const packA = await writeEpisodePack(workspace, "episode-a", true);
    const packB = await writeEpisodePack(workspace, "episode-b", false);
    const outputDir = path.join(workspace, "bulk-review");
    const result = await exportBulkVeronicaApprovalReview({
      outputDir,
      episodes: [
        { episodeId: "episode-a", packRoot: packA },
        { episodeId: "episode-b", packRoot: packB },
      ],
    });
    const aggregate = JSON.parse(await fs.readFile(result.aggregateReviewPath, "utf8")) as {
      episodeCount: number;
      episodes: Array<{ episodeId: string; eligibility: boolean }>;
    };
    expect(result.episodeCount).toBe(2);
    expect(aggregate.episodeCount).toBe(2);
    expect(aggregate.episodes.map((entry) => entry.episodeId)).toEqual(["episode-a", "episode-b"]);
    expect(aggregate.episodes[0]?.eligibility).toBe(true);
    expect(aggregate.episodes[1]?.eligibility).toBe(false);
    const findings = await fs.readFile(result.findingsPath, "utf8");
    expect(findings).toContain("episode-a");
    expect(findings).toContain("episode-b");
  });
});
