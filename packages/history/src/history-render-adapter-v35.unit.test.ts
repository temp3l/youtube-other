import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  structureTrustedScriptClaimsV34,
} from "./history-claims-v34.js";
import {
  buildHistoryVisualPlanV35,
} from "./visual-planner-v35.js";
import {
  assertHistoryVisualApprovalV35,
  compileHistoryRenderDerivativeV35,
  decideHistoryVisualApprovalV35,
  syncHistoryProductionArtifactsV35,
  v35ApprovalArtifactPath,
} from "./history-render-adapter-v35.js";

const NAPOLEON_SNIPPET = `On June 24, 1812, soldiers began crossing the Niemen River into Russia.

Napoleon commanded the largest army Europe had seen.

The campaign would test logistics, weather, and Russian resistance.`;

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

function buildFixturePlan() {
  const episodeId =
    "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
  const narration = normalizeHistoryNarrationV33({
    episodeId,
    rawScript: NAPOLEON_SNIPPET,
  });
  const structured = structureTrustedScriptClaimsV34({
    episodeId,
    narration,
    authorityMode: "trusted-script",
  });
  return buildHistoryVisualPlanV35({
    episodeId,
    title: "Napoleon's invasion of Russia",
    narration,
    authorityMode: "trusted-script",
    structuredClaims: structured,
  });
}

describe("History render adapter v3.5", () => {
  it("maps timed shots into a scene plan with both aspect ratios", () => {
    const plan = buildFixturePlan();
    const derivative = compileHistoryRenderDerivativeV35(plan);
    expect(derivative.planHash).toBe(plan.planHash);
    expect(derivative.shotCount).toBe(plan.shots.length);
    expect(derivative.scenePlan.scenes).toHaveLength(plan.shots.length);
    expect(
      derivative.scenePlan.scenes.every((scene) =>
        scene.aspectRatios.includes("9:16")
      )
    ).toBe(true);
    const first = derivative.scenePlan.scenes[0]!;
    const last = derivative.scenePlan.scenes.at(-1)!;
    expect(first.timing.startSeconds).toBe(0);
    expect(last.timing.endSeconds).toBeGreaterThan(first.timing.startSeconds);
    expect(first.canonicalNarration.length).toBeGreaterThan(0);
  });

  it("syncs production artifacts and enforces explicit v3.5 approval", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "history-v35-adapter-"));
    roots.push(outputRoot);
    const plan = buildFixturePlan();
    const episodeId = plan.episodeId;
    const root = path.join(outputRoot, episodeId);
    await fs.mkdir(path.join(root, "source", "history-v3.5"), { recursive: true });
    await fs.writeFile(
      path.join(root, "source", "history-v3.5", "plan.json"),
      JSON.stringify(plan)
    );
    const { derivative } = await syncHistoryProductionArtifactsV35({ root, plan });
    await expect(assertHistoryVisualApprovalV35(root)).rejects.toThrow(
      "explicit approval"
    );
    await decideHistoryVisualApprovalV35({
      episodeId,
      outputRoot,
      decision: "APPROVED",
      planHash: plan.planHash,
      derivativeHash: derivative.derivativeHash,
    });
    await expect(assertHistoryVisualApprovalV35(root)).resolves.toBeUndefined();
    const scenes = JSON.parse(
      await fs.readFile(path.join(root, "shared", "scenes.json"), "utf8")
    ) as { scenes: unknown[] };
    expect(scenes.scenes).toHaveLength(plan.shots.length);
    await expect(
      fs.access(
        v35ApprovalArtifactPath(
          path.join(root, "source"),
          plan.planHash,
          derivative.derivativeHash
        )
      )
    ).resolves.toBeUndefined();
  });
});
