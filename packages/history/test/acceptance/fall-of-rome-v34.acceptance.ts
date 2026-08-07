import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { HistoryVisualPlanV34 } from "../../src/history-v34-contracts.js";
import { createHistoryApprovalPackV34 } from "../../src/history-workflow-v34.js";

const ROME_EPISODE = "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const EPISODES_ROOT = path.join(REPO_ROOT, "episodes");
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

function assertRomeContract(plan: HistoryVisualPlanV34): void {
  expect(plan.sourceAuthorityMode).toBe("trusted-script");
  expect(plan.mapStates.length).toBeGreaterThanOrEqual(2);
  expect(plan.diagramStates.length).toBeGreaterThanOrEqual(1);
  expect(plan.timelineEvents.length).toBeGreaterThanOrEqual(4);

  const labels = new Set(plan.mapStates.flatMap((state) => state.labels.map((label) => label.text)));
  expect(labels.has("Rome")).toBe(true);
  expect(labels.has("Constantinople")).toBe(true);

  const diagramText = plan.diagramStates
    .flatMap((state) => state.nodes.map((node) => node.label))
    .join(" ");
  expect(/tax revenue|armies and administration|provincial control/i.test(diagramText)).toBe(true);

  expect(plan.beats.length).toBeGreaterThanOrEqual(45);
  expect(plan.beats.length).toBeLessThanOrEqual(70);
  expect(plan.shots.length).toBeGreaterThanOrEqual(70);
  expect(plan.shots.length).toBeLessThanOrEqual(95);
  expect(plan.approval.contentApprovalEligible).toBe(true);
}

describe("Fall of Rome V3.4 generated-artifact acceptance", () => {
  it("generates maps, diagram, and episode timeline from trusted narration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rome-v34-acceptance-"));
    roots.push(root);
    const output = path.join(root, "approval", ROME_EPISODE);
    const pack = await createHistoryApprovalPackV34({
      episodeId: ROME_EPISODE,
      output,
      outputRoot: EPISODES_ROOT,
      regenerate: true,
      testSummary: { status: "rome-v34-acceptance", testFile: "fall-of-rome-v34.acceptance.ts" },
    });
    const plan = JSON.parse(
      await fs.readFile(path.join(output, "plan.json"), "utf8")
    ) as HistoryVisualPlanV34;
    expect(pack.planHash).toBeTruthy();
    assertRomeContract(plan);
  }, 120_000);
});
