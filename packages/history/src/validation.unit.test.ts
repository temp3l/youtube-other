import { describe, expect, it } from "vitest";
import {
  validateChronologyForHistory,
  validateDisputedClaimPreservation,
  validateHistoricalNarration,
  validateQuotations,
  validateUnsupportedCertainty,
} from "./validation.js";
import type { HistoricalClaim } from "./research.js";

const disputedClaim: HistoricalClaim = {
  id: "cause", statement: "Drought caused the collapse.", classification: "disputed", confidence: 0.4,
  sourceIds: ["source-1"], requiresCorroboration: true, sensitivityTags: [], isQuotation: false,
};

describe("history factual validation", () => {
  it("flags certainty framing for unresolved claims", () => {
    expect(validateUnsupportedCertainty("Drought definitively caused the collapse.", [disputedClaim])).toHaveLength(1);
    expect(validateDisputedClaimPreservation("Drought caused the collapse.", [disputedClaim])).toHaveLength(1);
    expect(validateDisputedClaimPreservation("Drought may have caused the collapse.", [disputedClaim])).toHaveLength(0);
  });

  it("requires quotations to be verified and chronology to be ordered", () => {
    expect(validateQuotations("The record says \"we survived\".", [])).toHaveLength(1);
    expect(validateQuotations("The record says \"we survived\".", ["we survived"])).toHaveLength(0);
    expect(validateChronologyForHistory([{ id: "b", label: "B", order: 2 }, { id: "a", label: "A", order: 1 }])).toHaveLength(1);
  });

  it("fails an aggregate result for an unverified quotation", () => {
    expect(validateHistoricalNarration({
      narration: "A source says \"invented words\".", claims: [disputedClaim], chronology: [{ id: "a", label: "A", order: 1 }],
    }).status).toBe("failed");
  });
});
