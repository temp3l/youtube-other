import { describe, expect, it } from "vitest";
import { extractHistoryNarrationUnits } from "./visual-planner-v2.js";
import { extractHistorySemanticsV31 } from "./history-semantic-v31.js";

describe("history semantic v3.1", () => {
  it("normalises aliases, rejects weak candidates, and classifies narration claims", () => {
    const narration =
      "Napoleon's army crossed into Russia on June 24, 1812. Napoleon Bonaparte ordered a retreat because supply lines failed. In August, the Roman formation was not a place. They may have lost more than 10,000 men. The Black Death spread across Europe. Was Rome prepared?";
    const result = extractHistorySemanticsV31(
      narration,
      extractHistoryNarrationUnits(narration)
    );
    const napoleon = result.entities.find(
      (entity) => entity.canonicalName === "Napoleon Bonaparte"
    );
    expect(napoleon).toMatchObject({
      type: "person",
      surfaceForms: expect.arrayContaining([
        "Napoleon's",
        "Napoleon Bonaparte",
      ]),
      normalisationMethod: "possessive-stripped",
    });
    expect(
      result.entities.some(
        (entity) => entity.canonicalName === "August" && entity.type === "place"
      )
    ).toBe(false);
    expect(result.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Roman" }),
        expect.objectContaining({ value: "formation" }),
        expect.objectContaining({ value: "They" }),
        expect.objectContaining({ value: "August" }),
      ])
    );
    expect(result.diagnostics.entityNormalisationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "Napoleon's",
          correctedValue: "Napoleon Bonaparte",
        }),
      ])
    );
    expect(result.diagnostics.entityTypeCorrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "August", correctedType: "period" }),
      ])
    );
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: "Russia", type: "place" }),
        expect.objectContaining({ canonicalName: "Rome", type: "place" }),
        expect.objectContaining({
          canonicalName: "Black Death",
          type: "event",
        }),
      ])
    );
    expect(result.claims.map((claim) => claim.kind)).toEqual(
      expect.arrayContaining([
        "chronological",
        "causal",
        "uncertain",
        "geographic",
        "rhetorical",
      ])
    );
    expect(
      result.claims.find((claim) => claim.kind === "uncertain")
    ).toMatchObject({
      sourceStatus: "unresolved",
      sourceReferenceIds: [],
      historicalUncertainty:
        "Narration explicitly signals uncertainty or dispute.",
    });
  });

  it("recognises major actors, places, groups, policies, and disease without episode-specific branching", () => {
    const narration =
      "Tsar Alexander the First defended the Russian Empire with the Grande Armée near the Niemen River. Odoacer removed Romulus Augustulus from the Western Roman Empire while Goths served in Roman armies. The Black Death spread from Messina along trade routes; Yersinia pestis and plague affected Jewish communities. England enforced the Ordinance and Statute of Labourers.";
    const result = extractHistorySemanticsV31(
      narration,
      extractHistoryNarrationUnits(narration)
    );
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "Tsar Alexander the First",
          type: "person",
        }),
        expect.objectContaining({
          canonicalName: "Grande Armée",
          type: "army-or-formation",
        }),
        expect.objectContaining({
          canonicalName: "Western Roman Empire",
          type: "state-or-polity",
        }),
        expect.objectContaining({
          canonicalName: "Goths",
          type: "ethnic-or-social-group",
        }),
        expect.objectContaining({
          canonicalName: "Yersinia pestis",
          type: "disease-or-pathogen",
        }),
        expect.objectContaining({
          canonicalName: "trade routes",
          type: "trade-route",
        }),
        expect.objectContaining({
          canonicalName: "Statute of Labourers",
          type: "law-or-policy",
        }),
      ])
    );
  });
});
