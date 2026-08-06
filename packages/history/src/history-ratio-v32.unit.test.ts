import { describe, expect, it } from "vitest";
import { buildHistoryVisualPlanV32 } from "./visual-planner-v32.js";
describe("History V3.2 ratios", () => { it("records separate landscape and portrait production constraints", () => { const plan = buildHistoryVisualPlanV32({ episodeId: "ratio", narration: "A historical claim." }); expect(plan.visual.ratios).toEqual(expect.arrayContaining([expect.objectContaining({ ratio: "16:9", maxLabels: 12, minLabelPx: 28 }), expect.objectContaining({ ratio: "9:16", maxLabels: 8, minLabelPx: 32, independentRenderRequired: true })])); }); });
