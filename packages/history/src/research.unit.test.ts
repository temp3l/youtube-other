import { describe, expect, it } from "vitest";
import {
  chronologySchema,
  historicalClaimSchema,
  historySourceSchema,
  requiresStrongerCorroboration,
  sourceQualityScore,
} from "./research.js";

describe("history research contracts", () => {
  it("requires assessed provenance before approving a source", () => {
    expect(historySourceSchema.safeParse({
      id: "archive-1", title: "Archive", url: "https://archive.example/source", domain: "archive.example",
      status: "approved", declaredByPack: true,
    }).success).toBe(false);
    expect(historySourceSchema.safeParse({
      id: "archive-1", title: "Archive", url: "https://archive.example/source", domain: "archive.example",
      status: "approved", declaredByPack: true, quality: "museum-archive-university", retrievedAt: "2026-08-02T10:00:00.000Z",
    }).success).toBe(true);
  });

  it("enforces source-backed quotations and ordered chronology", () => {
    expect(historicalClaimSchema.safeParse({
      id: "quote-1", statement: "A verified quotation", classification: "established", confidence: 1,
      sourceIds: [], requiresCorroboration: true, isQuotation: true,
    }).success).toBe(false);
    expect(chronologySchema.safeParse([
      { id: "later", label: "Later", order: 2 }, { id: "earlier", label: "Earlier", order: 1 },
    ]).success).toBe(false);
  });

  it("identifies consequential claims needing corroboration", () => {
    const claim = historicalClaimSchema.parse({
      id: "casualties", statement: "The battle caused 10,000 casualties.", classification: "consensus", confidence: 0.8,
      sourceIds: ["source-1"], requiresCorroboration: false,
    });
    expect(requiresStrongerCorroboration(claim)).toBe(true);
    expect(sourceQualityScore("primary")).toBeGreaterThan(sourceQualityScore("low-confidence-general-web"));
  });
});
