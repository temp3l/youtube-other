import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertHistoryVisualApproval,
  buildHistoryVisualPlan,
  decideHistoryVisualApproval,
  historyVisualTargets,
  planHistoryVisuals,
  validateHistoryVisualPlan,
} from "./visual-planner.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});
const napoleon =
  "Napoleon launched an invasion into Russia in summer 1812. The army crossed the Niemen and advanced toward Moscow. Logistics failed across immense distances, while hunger, disease, and attrition consumed the force. During the winter retreat, Russian forces pursued the Grande Armée across the Berezina. The campaign changed European politics.".repeat(
    5
  );

describe("History visual planner", () => {
  it("interpolates runtime targets and requires maps and explanatory diagrams", () => {
    expect(historyVisualTargets(8)).toEqual({
      uniqueAssets: [28, 36],
      editedShots: [42, 57],
    });
    const plan = buildHistoryVisualPlan({
      episodeId: "napoleon-1812",
      narration: napoleon,
      targetDurationMinutes: 8,
    });
    expect(plan.strategy).toMatchObject({
      mapRequired: true,
      diagramRequired: true,
    });
    expect(plan.assets.length).toBeGreaterThanOrEqual(32);
    expect(plan.beats.some((beat) => beat.mediaType === "map")).toBe(true);
    expect(plan.beats.some((beat) => beat.mediaType === "diagram")).toBe(true);
    expect(validateHistoryVisualPlan(plan)).toMatchObject({
      valid: true,
      narrationCovered: true,
    });
  });

  it("binds approval to the current deterministic plan hash and blocks media before approval", async () => {
    const outputRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "history-visual-plan-")
    );
    temporaryRoots.push(outputRoot);
    const episode = "napoleon-1812";
    const root = path.join(outputRoot, episode);
    await fs.mkdir(path.join(root, "languages"), { recursive: true });
    await fs.mkdir(path.join(root, "source"), { recursive: true });
    await fs.writeFile(path.join(root, "languages", "script-en.md"), napoleon);
    await fs.writeFile(
      path.join(root, "source", "normalized-metadata.json"),
      JSON.stringify({ runtime: { targetDurationMinutes: 8 } })
    );
    const first = await planHistoryVisuals({ episodeId: episode, outputRoot });
    await expect(assertHistoryVisualApproval(root)).rejects.toThrow(
      "explicit approval"
    );
    await expect(
      decideHistoryVisualApproval({
        episodeId: episode,
        outputRoot,
        decision: "APPROVED",
        planHash: "0".repeat(64),
      })
    ).rejects.toThrow("stale");
    await decideHistoryVisualApproval({
      episodeId: episode,
      outputRoot,
      decision: "APPROVED",
      planHash: first.plan.planHash,
    });
    await expect(assertHistoryVisualApproval(root)).resolves.toBeUndefined();
    expect(
      (await planHistoryVisuals({ episodeId: episode, outputRoot })).cached
    ).toBe(true);
  });
});
