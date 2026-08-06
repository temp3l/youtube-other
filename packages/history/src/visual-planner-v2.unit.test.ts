import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHistoryVisualPlanV2,
  compileHistoryRenderDerivativeV2,
  decideHistoryVisualApprovalV2,
  extractHistoryNarrationUnits,
  planHistoryVisualsV2,
  validateHistoryVisualPlanV2,
} from "./visual-planner-v2.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("History visual planner v2", () => {
  it("keeps Unicode, abbreviations, decimals, and source coverage in deterministic units", () => {
    const narration = "Dr. Élodie measured 3.14 miles. Then she reached Paris!";
    const units = extractHistoryNarrationUnits(narration);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ start: 0, kind: "sentence" });
    expect(units.at(-1)?.end).toBe(narration.length);
    const plan = buildHistoryVisualPlanV2({ episodeId: "unicode-history", narration });
    expect(validateHistoryVisualPlanV2(plan)).toMatchObject({ valid: true, plannedNarrationCharacters: narration.length });
  });

  it("blocks incomplete narration and target conflicts without clipping the conclusion", () => {
    const narration = "The campaign began. Its conclusion remained unfinished";
    const plan = buildHistoryVisualPlanV2({ episodeId: "boundary-history", narration, targetDurationMs: 600_000 });
    const validation = validateHistoryVisualPlanV2(plan);
    expect(plan.timedUnits.at(-1)?.end).toBe(narration.length);
    expect(validation.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["NARRATION_FINAL_BOUNDARY_INVALID", "NARRATION_DURATION_CONFLICT"]));
    expect(validation.valid).toBe(false);
  });

  it("blocks source-lineage disagreement without repairing either narration", () => {
    const plan = buildHistoryVisualPlanV2({ episodeId: "lineage-history", narration: "The source narration is intact." });
    const validation = validateHistoryVisualPlanV2(plan, { sourceNarration: "A different imported narration is intact." });
    expect(validation.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NARRATION_LINEAGE_MISMATCH", severity: "error" })]));
  });

  it("uses measured audio proportionally, emits stateful variants, and maps an immutable derivative", () => {
    const narration = "The army crossed the river. Logistics collapsed during the retreat.";
    const plan = buildHistoryVisualPlanV2({ episodeId: "campaign-history", narration, timing: { audioHash: "a".repeat(64), durationMs: 12_000 } });
    const derivative = compileHistoryRenderDerivativeV2(plan);
    const validation = validateHistoryVisualPlanV2(plan, { derivative });
    expect(plan.timing).toMatchObject({ durationMs: 12_000, provisional: false, source: { kind: "measured-audio-proportional" } });
    expect(plan.states.length).toBeGreaterThan(0);
    expect(derivative).toMatchObject({ planHash: plan.planHash, ratios: ["16:9", "9:16"] });
    expect(derivative.scenePlan.scenes.every((scene) => scene.aspectRatios.includes("9:16"))).toBe(true);
    expect(validation.valid).toBe(true);
  });

  it("keeps v2 artifacts separate and refuses approval for a blocked plan", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "history-v2-")); roots.push(outputRoot);
    const episodeId = "blocked-history"; const root = path.join(outputRoot, episodeId);
    await fs.mkdir(path.join(root, "languages"), { recursive: true }); await fs.mkdir(path.join(root, "source"), { recursive: true });
    await fs.writeFile(path.join(root, "languages", "script-en.md"), "A final sentence without punctuation");
    const result = await planHistoryVisualsV2({ episodeId, outputRoot });
    expect(result.validation.valid).toBe(false);
    await expect(decideHistoryVisualApprovalV2({ episodeId, outputRoot, decision: "APPROVED", planHash: result.plan.planHash, derivativeHash: result.derivative.derivativeHash })).rejects.toThrow("blocked");
    await expect(fs.access(path.join(root, "source", "history-visual-plan.json"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "source", `history-visual-plan.v2-${result.plan.planHash}.json`))).resolves.toBeUndefined();
  });
});
