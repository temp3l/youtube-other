import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { HistoryVisualPlanV34 } from "../../src/history-v34-contracts.js";
import { createHistoryApprovalPackV34 } from "../../src/history-workflow-v34.js";

const BLACK_DEATH_EPISODE = "history-youtube-history-10-video-story-pack-04-black-death";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const EPISODES_ROOT = path.join(REPO_ROOT, "episodes");
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

function assertBlackDeathContract(plan: HistoryVisualPlanV34): void {
  expect(plan.sourceAuthorityMode).toBe("trusted-script");
  expect(plan.mapStates.length).toBeGreaterThanOrEqual(2);
  expect(plan.diagramStates.length).toBeGreaterThanOrEqual(2);
  expect(plan.timelineEvents.length).toBeGreaterThanOrEqual(3);

  const labels = new Set(
    plan.mapStates.flatMap((state) => [
      ...state.labels.map((label) => label.text),
      ...state.routes.flatMap((route) => [route.origin.label, route.destination.label]),
    ])
  );
  expect(labels.has("Messina") || labels.has("Black Sea")).toBe(true);
  expect(labels.has("Mediterranean") || labels.has("Europe")).toBe(true);

  const diagramQuestions = plan.diagramStates.map((state) => state.exactQuestion).join(" ");
  expect(/transmission|pathway/i.test(diagramQuestions)).toBe(true);
  expect(/consequence|economic|social/i.test(diagramQuestions)).toBe(true);

  expect(plan.beats.length).toBeGreaterThanOrEqual(40);
  expect(plan.beats.length).toBeLessThanOrEqual(65);
  expect(plan.shots.length).toBeGreaterThanOrEqual(65);
  expect(plan.shots.length).toBeLessThanOrEqual(90);
  expect(plan.approval.contentApprovalEligible).toBe(true);
}

describe("Black Death V3.4 generated-artifact acceptance", () => {
  it("generates spread maps, transmission/consequence diagrams, and timeline", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "black-death-v34-acceptance-"));
    roots.push(root);
    const output = path.join(root, "approval", BLACK_DEATH_EPISODE);
    await createHistoryApprovalPackV34({
      episodeId: BLACK_DEATH_EPISODE,
      output,
      outputRoot: EPISODES_ROOT,
      regenerate: true,
      testSummary: { status: "black-death-v34-acceptance", testFile: "black-death-v34.acceptance.ts" },
    });
    const plan = JSON.parse(
      await fs.readFile(path.join(output, "plan.json"), "utf8")
    ) as HistoryVisualPlanV34;
    assertBlackDeathContract(plan);
  }, 120_000);
});
