import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRejectedEntityTextV34 } from "../../src/history-claims-v34.js";
import type { HistoryMapStateV34, HistoryVisualPlanV34 } from "../../src/history-v34-contracts.js";
import { buildHistoryValidationSnapshotV34 } from "../../src/visual-planner-v34.js";
import { createHistoryApprovalPackV34 } from "../../src/history-workflow-v34.js";

const NAPOLEON_EPISODE =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const EPISODES_ROOT = path.join(REPO_ROOT, "episodes");
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

function assertNoPlaceholderCoordinates(mapStates: readonly HistoryMapStateV34[]): void {
  for (const state of mapStates) {
    for (const route of state.routes) {
      for (const endpoint of [route.origin, route.destination]) {
        const key = JSON.stringify(endpoint.coordinates);
        expect(["[0,0]", "[1,1]"]).not.toContain(key);
      }
    }
  }
}

function assertPlanContract(plan: HistoryVisualPlanV34): void {
  expect(plan.sourceAuthorityMode).toBe("trusted-script");
  expect(plan.mapStates.length).toBeGreaterThanOrEqual(3);
  expect(plan.diagramStates.length).toBeGreaterThanOrEqual(1);
  assertNoPlaceholderCoordinates(plan.mapStates);

  const labels = new Set(
    plan.mapStates.flatMap((state) => [
      ...state.labels.map((label) => label.text),
      ...state.routes.flatMap((route) => [route.origin.label, route.destination.label]),
    ])
  );
  for (const place of ["Niemen River", "Moscow", "Smolensk", "Berezina River"]) {
    expect(labels.has(place), `expected map coverage for ${place}`).toBe(true);
  }

  const logisticsNodes = plan.diagramStates.flatMap((state) => state.nodes.map((node) => node.label));
  expect(
    logisticsNodes.some((label) => /supply|distance|disease|hunger|attrition|fodder|horse/i.test(label))
  ).toBe(true);

  for (const state of plan.mapStates) {
    for (const route of state.routes) {
      expect(isRejectedEntityTextV34(route.movingActor).reject).toBe(false);
    }
  }

  const sceneCount = plan.beats.length;
  const visualUpdates = plan.shots.length;
  const totalSeconds = plan.timing.totalDurationMs / 1000;
  expect(sceneCount).toBeGreaterThanOrEqual(40);
  expect(sceneCount).toBeLessThanOrEqual(65);
  expect(visualUpdates).toBeGreaterThanOrEqual(65);
  expect(visualUpdates).toBeLessThanOrEqual(90);
  expect(totalSeconds / visualUpdates).toBeGreaterThanOrEqual(6.5);
  expect(totalSeconds / visualUpdates).toBeLessThanOrEqual(9.5);

  expect(plan.qualityMetrics.passes).toBe(true);
  expect(plan.approval.contentApprovalEligible).toBe(true);
  expect(plan.approval.production.blockerCodes).toEqual(
    expect.arrayContaining(["TIMING_MEASUREMENT_REQUIRED"])
  );
}

describe("Napoleon V3.4 generated-artifact acceptance", () => {
  it("generates a trusted-script approval pack with mandatory maps and logistics diagram", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "napoleon-v34-acceptance-"));
    roots.push(root);
    const output = path.join(root, "approval", NAPOLEON_EPISODE);

    const first = await createHistoryApprovalPackV34({
      episodeId: NAPOLEON_EPISODE,
      output,
      outputRoot: EPISODES_ROOT,
      regenerate: true,
      testSummary: { status: "napoleon-v34-acceptance", testFile: "napoleon-v34.acceptance.ts" },
    });
    const second = await createHistoryApprovalPackV34({
      episodeId: NAPOLEON_EPISODE,
      output,
      outputRoot: EPISODES_ROOT,
      regenerate: true,
      testSummary: { status: "napoleon-v34-acceptance", testFile: "napoleon-v34.acceptance.ts" },
    });
    expect(second.planHash).toBe(first.planHash);

    const plan = JSON.parse(
      await fs.readFile(path.join(output, "plan.json"), "utf8")
    ) as HistoryVisualPlanV34;
    const authoringMode = JSON.parse(
      await fs.readFile(path.join(output, "authoring-mode.json"), "utf8")
    ) as { research: { providerCalls: number; webSearchCalls: number } };

    expect(authoringMode.research.providerCalls).toBe(0);
    expect(authoringMode.research.webSearchCalls).toBe(0);
    assertPlanContract(plan);

    const validation = JSON.parse(await fs.readFile(path.join(output, "validation.json"), "utf8"));
    const snapshot = buildHistoryValidationSnapshotV34(plan);
    expect(validation.productionBlockerCodes).toEqual(snapshot.productionBlockerCodes);
  }, 120_000);
});
