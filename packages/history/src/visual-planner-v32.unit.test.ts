import { describe, expect, it } from "vitest";
import { buildHistoryVisualPlanV32, validateHistoryVisualPlanV32 } from "./visual-planner-v32.js";
describe("History V3.2 visual planner", () => {
  it("keeps unresolved provenance visible and blocks content rather than producing false green", () => { const plan = buildHistoryVisualPlanV32({ episodeId: "v32", narration: "Napoleon moved from Moscow to the Berezina River." }); expect(plan.approval.content.state).toBe("blocked"); expect(plan.approval.production.state).toBe("blocked"); expect(plan.claims.some((claim) => claim.provenance.status === "unresolved")).toBe(true); });
  it("uses provenance-bound diagram fallback and exact timing allocation", () => { const plan = buildHistoryVisualPlanV32({ episodeId: "v32-timing", narration: "A claim. Another claim." }); expect(plan.visual.diagramFallback).not.toBe("diagram"); expect(plan.narration.units.reduce((sum, unit) => sum + unit.durationMs, 0)).toBe(plan.timing.totalDurationMs); expect(validateHistoryVisualPlanV32(plan).approval).toEqual(plan.approval); });
});
