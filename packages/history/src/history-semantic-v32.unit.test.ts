import { describe, expect, it } from "vitest";
import { selectHistoryDiagramFallbackV32 } from "./history-geo-v32.js";
describe("History V3.2 semantics", () => { it("uses a map fallback deterministically when diagram evidence is absent", () => { expect(selectHistoryDiagramFallbackV32({ hasVerifiedDiagramEvidence: false, hasMap: true, hasTimeline: true, hasQuotation: true })).toBe("map"); }); });
