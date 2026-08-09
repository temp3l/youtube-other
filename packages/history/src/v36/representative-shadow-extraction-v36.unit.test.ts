import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canComposeAdjacentMovementV36, runRepresentativeShadowExtractionV36 } from "./representative-shadow-extraction-v36.js";

function source(episodeId: string) {
  const root = resolve(process.cwd(), "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(readFileSync(resolve(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(readFileSync(resolve(root, "plan.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places };
}

function movementSource(proposition: string) {
  const labels = ["Britain", "Northwest Passage", "Greenland"];
  const mentioned = labels.filter((label) => proposition.includes(label));
  return {
    episodeId: "movement-purpose-control",
    claims: [{
      id: "claim-movement-control",
      episodeId: "movement-purpose-control",
      normalizedProposition: proposition,
      claimKind: "event",
      entityMentionIds: mentioned.map((label) => `entity-${label.toLowerCase().replaceAll(" ", "-")}`),
      narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: proposition.length }],
    }],
    entities: mentioned.map((label) => ({
      id: `entity-${label.toLowerCase().replaceAll(" ", "-")}`,
      claimId: "claim-movement-control",
      normalizedLabel: label,
      entityType: "place",
    })),
    places: [],
  };
}

describe("V3.6 representative structured-claim shadow projection", () => {
  it("extracts only explicit Black Death movement and causal propositions, retaining policy ambiguity", () => {
    const result = runRepresentativeShadowExtractionV36(source("history-youtube-history-10-video-story-pack-04-black-death"));
    expect(result.extraction.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "movement", from: expect.objectContaining({ canonicalLabel: "Black Sea" }), to: expect.objectContaining({ canonicalLabel: "Messina" }) }),
      expect.objectContaining({ kind: "causal" }),
    ]));
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: "claim-095a61f563fa2980b636c6cc", status: "rejected", diagnostics: [expect.objectContaining({ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS" })] }),
    ]));
  });

  it("rejects Franklin purpose as a destination while preserving evidence enumeration", () => {
    const result = runRepresentativeShadowExtractionV36(source("history-youtube-history-10-video-story-pack-05-franklin-expedition"));
    expect(result.extraction.relations.some((relation) => relation.kind === "movement" && relation.from.canonicalLabel === "Britain" && relation.to.canonicalLabel === "Northwest Passage")).toBe(false);
    expect(result.extraction.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evidence-set", evidence: expect.arrayContaining([expect.objectContaining({ canonicalLabel: "graves" }), expect.objectContaining({ canonicalLabel: "abandoned equipment" }), expect.objectContaining({ canonicalLabel: "human remains" }), expect.objectContaining({ canonicalLabel: "one written message" })]) }),
    ]));
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: "claim-6102997fabdd9aa3492eccb4", status: "rejected", diagnostics: [expect.objectContaining({ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS" })] }),
    ]));
    const grouped = result.extraction.relations.find((relation) => relation.supportClaimIds.includes("claim-318504248e85a04faa5519d6" as never));
    expect(grouped).toMatchObject({ kind: "evidence-set", evidence: [expect.objectContaining({ canonicalLabel: "the remains of the expedition’s winter camp from 1845 to 1846" }), expect.objectContaining({ canonicalLabel: "graves of John Torrington, John Hartnell, and William Braine" })] });
  });

  it.each([
    ["sailed from Britain to search for the Northwest Passage", false, undefined],
    ["sailed from Britain to Greenland", true, "Greenland"],
    ["sailed from Britain toward Greenland", true, "Greenland"],
    ["sailed from Britain to investigate Greenland", false, undefined],
  ])("distinguishes movement endpoint semantics in %s", (proposition, expectedMovement, destination) => {
    const result = runRepresentativeShadowExtractionV36(movementSource(proposition));
    const movements = result.extraction.relations.filter((relation) => relation.kind === "movement");
    expect(movements.length > 0).toBe(expectedMovement);
    if (destination) expect(movements[0]).toMatchObject({ from: { canonicalLabel: "Britain" }, to: { canonicalLabel: destination } });
  });

  it("keeps D-Day comparison entity-bound and 1066 movement incomplete", () => {
    const dday = runRepresentativeShadowExtractionV36(source("history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion"));
    expect(dday.extraction.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "spatial-comparison", places: expect.arrayContaining([expect.objectContaining({ canonicalLabel: "Normandy" }), expect.objectContaining({ canonicalLabel: "Pas-de-Calais" })]) }),
    ]));
    const battle = runRepresentativeShadowExtractionV36(source("history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england"));
    expect(battle.extraction.relations.some((relation) => relation.kind === "movement")).toBe(false);
    expect(battle.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: "claim-bfba0073ddda4cc140d4753e", status: "rejected", diagnostics: [expect.objectContaining({ code: "SHADOW_RELATION_INSUFFICIENT_CARDINALITY" })] }),
    ]));
  });

  it("is deterministic for a representative source and excludes cross-episode support", () => {
    const input = source("history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded");
    const first = runRepresentativeShadowExtractionV36(input);
    const second = runRepresentativeShadowExtractionV36(input);
    expect(first).toEqual(second);
    expect(first.extraction.relations.every((relation) => relation.supportClaimIds.every((claimId) => first.claims.some((claim) => claim.id === claimId && claim.episodeId === relation.episodeId)))).toBe(true);
    expect(first.extraction.relations.some((relation) => relation.supportClaimIds.includes("claim-26e91771c4ed2a2828ff484b" as never))).toBe(false);
  });

  it("permits the explicit Titanic ice concept without fragmenting an unrelated proper name", () => {
    const result = runRepresentativeShadowExtractionV36(source("history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster"));
    expect(result.grounding.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ claimId: "claim-cf84a3dbbd24f86a28cc6978", predicate: "causes" })]));
    expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ claimId: "claim-cf84a3dbbd24f86a28cc6978", source: "atomic-claim-grounding", status: "valid" })]));
    expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ claimId: "claim-cf84a3dbbd24f86a28cc6978", status: "valid", diagnostics: [] })]));
    expect(result.extraction.relations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "causal", cause: expect.objectContaining({ canonicalLabel: "ice" }) })]));
  });

  it("bounds adjacent composition to two claims and rejects purpose-only routes", () => {
    expect(canComposeAdjacentMovementV36({ first: "Ships sailed from Britain.", second: "Ships arrived at Messina.", sameActor: true, resolvedOrigin: true, resolvedDestination: true })).toBe(true);
    expect(canComposeAdjacentMovementV36({ first: "A fleet sailed from Lisbon.", second: "Its mission was to move through the English Channel.", sameActor: true, resolvedOrigin: true, resolvedDestination: true })).toBe(false);
    const armada = runRepresentativeShadowExtractionV36(source("history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed"));
    expect(armada.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ source: "bounded-adjacent-claim-projection", status: "rejected", windowSize: 2 })]));
  });

  it("keeps Spanish causal participants inside the relative causal clause", () => {
    const armada = runRepresentativeShadowExtractionV36(source("history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed"));
    expect(armada.extraction.relations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "causal", cause: expect.objectContaining({ canonicalLabel: "storms, navigation, hunger, disease, and shipwreck" }), effect: expect.objectContaining({ canonicalLabel: "further losses" }) })]));
  });
});
