import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createStrategicFullTaskRegistry,
  createStrategicSupplementalTaskRegistry,
  loadStrategicReinventionProfile,
  runStrategicSupplementalMediaBridge,
  strategicFullWorkflowDefinition,
  strategicSupplementalWorkflowDefinition,
  STRATEGIC_FULL_TASK_IDS,
} from "./index.js";
import { createFixturePng, createFixturePptx } from "@mediaforge/veronica-media";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("strategic supplemental media workflow", () => {
  it("keeps strategic-reinvention production blocked by default", async () => {
    const profile = await loadStrategicReinventionProfile();
    expect(profile.productionReadiness.status).toBe("PRODUCTION_BLOCKED");
  });

  it("registers the full strategic-reinvention episode DAG", () => {
    const registry = createStrategicFullTaskRegistry();
    expect(strategicFullWorkflowDefinition.profileId).toBe("strategic-reinvention");
    const taskIds = registry.list("strategic-reinvention").map((task) => task.id);
    expect(taskIds).toHaveLength(STRATEGIC_FULL_TASK_IDS.length);
    expect(new Set(taskIds)).toEqual(new Set(STRATEGIC_FULL_TASK_IDS));
  });

  it("keeps the supplemental-media slice as a sub-workflow", () => {
    const registry = createStrategicSupplementalTaskRegistry();
    expect(strategicSupplementalWorkflowDefinition.profileId).toBe("strategic-reinvention");
    const taskIds = registry.list("strategic-reinvention").map((task) => task.id);
    expect(taskIds).toHaveLength(5);
  });

  it("runs the strategic bridge over episode narration and sources/content", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-bridge-"));
    temporaryRoots.push(workspace);
    const episodeId = "episode-001";
    const episodeRoot = path.join(workspace, episodeId);
    await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
    await fs.mkdir(path.join(episodeRoot, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(episodeRoot, "languages", "script-it.md"),
      "Benvenuti. Esploriamo il percorso di reinvenzione professionale.",
      "utf8",
    );
    await fs.writeFile(
      path.join(episodeRoot, "sources", "content", "deck.pptx"),
      createFixturePptx(2),
    );
    await fs.writeFile(
      path.join(episodeRoot, "sources", "content", "chart.png"),
      createFixturePng("chart"),
    );
    const first = await runStrategicSupplementalMediaBridge({
      workspaceRoot: workspace,
      episodeId,
    });
    const second = await runStrategicSupplementalMediaBridge({
      workspaceRoot: workspace,
      episodeId,
      resume: true,
    });
    expect(first.plan.schemaVersion).toBe("veronica-media-plan.v1");
    expect(second.resumed).toBe(true);
    expect(second.plan.contentHash).toBe(first.plan.contentHash);
  });
});
