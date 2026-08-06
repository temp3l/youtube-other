import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildHistoryVisualPlanV3, decideHistoryVisualApprovalV3, planHistoryVisualsV3, validateHistoryVisualPlanV3 } from "./visual-planner-v3.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
describe("History visual planner v3", () => {
  it("groups units, reuses semantic assets, and keeps render variants out of shot counts", () => {
    const plan = buildHistoryVisualPlanV3({ episodeId: "history-test", narration: "On June 24, 1812, soldiers crossed into Russia. They advanced across difficult terrain. Supply lines broke because distance increased. Napoleon ordered a retreat. The army left Russia." });
    const validation = validateHistoryVisualPlanV3(plan);
    expect(plan.entities.some((entry) => entry.canonicalName === "On June")).toBe(false);
    expect(plan.entities.some((entry) => entry.canonicalName === "Napoleon" && entry.type === "place")).toBe(false);
    expect(plan.beats.length).toBeLessThan(plan.narration.units.length);
    expect(validation.counts.renderVariants).toBe(plan.shots.length * 2);
    expect(validation.counts.editorialShots).toBe(plan.shots.length);
    expect(plan.beats.every((entry) => !entry.visualPurpose.startsWith("Clarify the complete narration unit"))).toBe(true);
  });
  it("is reviewable but never approves provisional or target-conflict timing", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "history-v3-")); roots.push(outputRoot); const episodeId = "history-blocked"; const episode = path.join(outputRoot, episodeId); await fs.mkdir(path.join(episode, "languages"), { recursive: true }); await fs.mkdir(path.join(episode, "source"), { recursive: true }); await fs.writeFile(path.join(episode, "languages", "script-en.md"), "A complete sentence survives. Another complete sentence survives."); await fs.writeFile(path.join(episode, "source", "normalized-metadata.json"), JSON.stringify({ runtime: { targetDurationMinutes: 10 } }));
    const result = await planHistoryVisualsV3({ episodeId, outputRoot });
    expect(result.validation.reviewable).toBe(true); expect(result.validation.approvalEligible).toBe(false);
    await expect(decideHistoryVisualApprovalV3({ episodeId, outputRoot, decision: "APPROVED", planHash: result.plan.planHash })).rejects.toThrow("blocked");
    const pack = await fs.readFile(path.join(episode, "source", `history-approval-pack.v3-${result.plan.planHash}.md`), "utf8"); expect(pack).toContain("Approval unavailable because blocking validation errors exist or immutable measured timing is absent."); expect(pack).not.toContain("visuals approve history-blocked");
  });
});
