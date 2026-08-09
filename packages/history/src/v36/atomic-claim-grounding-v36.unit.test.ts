import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  atomicConceptIdV36,
  atomicGroundingArtifactSchemaV36,
  atomicGroundingJsonSchemaV36,
  atomicPredicateValuesV36,
  createAtomicPropositionV36,
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  sourceTextHashV36,
} from "./atomic-claim-grounding-v36.js";
import {
  groundAtomicClaimsV36,
  lowerAtomicGroundingEvidenceV36,
  type AtomicGroundingSourceV36,
} from "./atomic-claim-grounder-v36.js";
import { claimIdV36, episodeIdV36 } from "./explanatory-relation-v36.js";
import { atomicGroundingReviewArtifactProvenanceSchemaV36 } from "./review-provenance-v36.js";

function source(episodeId: string): AtomicGroundingSourceV36 {
  const root = resolve(process.cwd(), "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(readFileSync(resolve(root, "structured-claims.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities };
}

function syntheticSource(proposition: string, entities: AtomicGroundingSourceV36["entities"] = []): AtomicGroundingSourceV36 {
  return {
    episodeId: "episode-scope-control",
    claims: [{ id: "claim-scope-control", episodeId: "episode-scope-control", normalizedProposition: proposition, claimKind: "event", entityMentionIds: entities.map((entity) => entity.id), narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: proposition.length }] }],
    entities,
  };
}

const exactText = "Drought caused harvest failure.";
const validProposition = createAtomicPropositionV36({
  episodeId: episodeIdV36("episode-control"),
  claimId: claimIdV36("claim-control"),
  subject: { id: atomicConceptIdV36("drought"), label: "drought", kind: "concept" },
  predicate: "causes",
  object: { id: atomicConceptIdV36("harvest failure"), label: "harvest failure", kind: "concept" },
  assertionStatus: "asserted",
  sourceSpan: {
    startUtf16: 0,
    endUtf16Exclusive: exactText.length,
    text: exactText,
    textHash: sourceTextHashV36(exactText),
  },
  provenance: {
    sourceKind: "bounded-deterministic-normalization",
    groundingRuleId: "bounded-causal-clause-v1",
    groundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
    resolvedParticipantIds: [atomicConceptIdV36("drought"), atomicConceptIdV36("harvest failure")],
  },
});

const validArtifact = {
  schemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
  episodeId: "episode-control",
  claims: [{
    claimId: "claim-control",
    coverage: "new-deterministic-grounding",
    propositions: [validProposition],
    diagnostics: [],
  }],
};

describe("History V3.6 atomic grounding runtime and generated schemas", () => {
  const jsonSchema = z.fromJSONSchema(atomicGroundingJsonSchemaV36);

  function rejected(value: unknown): void {
    expect(atomicGroundingArtifactSchemaV36.safeParse(value).success).toBe(false);
    expect(jsonSchema.safeParse(value).success).toBe(false);
  }

  it("accepts a valid control in both mechanically tied schemas", () => {
    expect(atomicGroundingArtifactSchemaV36.safeParse(validArtifact).success).toBe(true);
    expect(jsonSchema.safeParse(validArtifact).success).toBe(true);
    expect(atomicGroundingJsonSchemaV36.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(atomicGroundingJsonSchemaV36.additionalProperties).toBe(false);
  });

  it("rejects primitives, missing fields, malformed refs/spans, unknown enums, and additional properties", () => {
    rejected(42);
    rejected({});
    const base = JSON.parse(JSON.stringify(validArtifact));
    for (const field of ["claimId", "subject"] as const) {
      const payload = JSON.parse(JSON.stringify(base));
      delete payload.claims[0].propositions[0][field];
      rejected(payload);
    }
    rejected({ ...base, unknown: true });
    rejected({ ...base, claims: [{ ...base.claims[0], propositions: [{ ...base.claims[0].propositions[0], predicate: "open-ended" }] }] });
    rejected({ ...base, claims: [{ ...base.claims[0], propositions: [{ ...base.claims[0].propositions[0], assertionStatus: "completed" }] }] });
    rejected({ ...base, claims: [{ ...base.claims[0], propositions: [{ ...base.claims[0].propositions[0], subject: { id: "x", kind: "concept" } }] }] });
    rejected({ ...base, claims: [{ ...base.claims[0], propositions: [{ ...base.claims[0].propositions[0], sourceSpan: { ...base.claims[0].propositions[0].sourceSpan, startUtf16: -1 } }] }] });
    rejected({ ...base, claims: [{ ...base.claims[0], propositions: [{ ...base.claims[0].propositions[0], provenance: { ...base.claims[0].propositions[0].provenance, groundingRuleId: "ad-hoc-v1" } }] }] });
  });

  it("validates source-span ordering, exact length, and hash at runtime", () => {
    const proposition = JSON.parse(JSON.stringify(validProposition));
    proposition.sourceSpan.endUtf16Exclusive = proposition.sourceSpan.startUtf16;
    expect(() => createAtomicPropositionV36(proposition)).toThrow();
    proposition.sourceSpan.endUtf16Exclusive = exactText.length;
    proposition.sourceSpan.textHash = "0".repeat(64);
    expect(() => createAtomicPropositionV36(proposition)).toThrow();
  });

  it("keeps the predicate vocabulary bounded", () => {
    expect(atomicPredicateValuesV36).toEqual([
      "causes", "contributes-to", "depends-on", "compares-with", "contains-evidence-of",
      "moves-from", "moves-through", "search-object", "located-in", "transforms", "demands", "restricts",
    ]);
  });

  it("enforces dedicated exact-eight Phase 2.3 artifact provenance", () => {
    const valid = {
      generatedAt: "2026-08-09T12:00:00Z",
      v36ImplementationCommitSha: "a".repeat(40),
      phase22BaselineCommitSha: "b".repeat(40),
      phase22BaselineTag: "history-v3.6-bounded-llm-shadow-baseline",
      contractBaselineCommitSha: "c".repeat(40),
      contractBaselineTag: "history-v3.6-contract-preflight-baseline",
      frozenV35ProductionCommitSha: "d".repeat(40),
      frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
      acceptedV35SemanticBaselineCommitSha: "e".repeat(40),
      acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
      groundingSchemaVersion: "history-atomic-claim-grounding.v1",
      schemaVersion: "history-v3.6-atomic-grounding-review-provenance.v1",
      artifactKind: "history-v3.6-atomic-grounding-review",
      episodeSet: Array.from({ length: 8 }, (_, index) => `episode-${index}`),
      liveLlmCalls: false,
    };
    expect(atomicGroundingReviewArtifactProvenanceSchemaV36.safeParse(valid).success).toBe(true);
    expect(atomicGroundingReviewArtifactProvenanceSchemaV36.safeParse({ ...valid, episodeSet: valid.episodeSet.slice(0, 7) }).success).toBe(false);
    expect(atomicGroundingReviewArtifactProvenanceSchemaV36.safeParse({ ...valid, liveLlmCalls: true }).success).toBe(false);
  });
});

describe("History V3.6 atomic grounding invariants", () => {
  it("derives deterministic IDs independent of object reuse", () => {
    const copy = createAtomicPropositionV36({
      ...validProposition,
      groundingId: undefined,
    } as never);
    expect(copy.groundingId).toBe(validProposition.groundingId);
  });

  it("keeps every proposition episode-local, claim-local, and inside its exact claim span", () => {
    const input = source("history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster");
    const result = groundAtomicClaimsV36(input);
    for (const proposition of result.propositions) {
      expect(proposition.episodeId).toBe(input.episodeId);
      const claim = input.claims.find((item) => item.id === proposition.claimId)!;
      expect(claim).toBeDefined();
      expect(claim.normalizedProposition.includes(proposition.sourceSpan.text)).toBe(true);
      expect(proposition.sourceSpan.startUtf16).toBeGreaterThanOrEqual(claim.narrationSpans[0]!.startUtf16);
      expect(proposition.sourceSpan.endUtf16Exclusive).toBeLessThanOrEqual(claim.narrationSpans[0]!.endUtf16Exclusive);
    }
  });

  it("fails closed on foreign claims and unresolved Pevensey", () => {
    const battle = source("history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england");
    const result = groundAtomicClaimsV36(battle);
    const landing = result.claims.find((item) => item.claimId === "claim-bfba0073ddda4cc140d4753e");
    expect(landing).toMatchObject({ coverage: "unresolved-participant", propositions: [] });
    expect(landing?.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GROUNDING_PARTICIPANT_UNRESOLVED", affectedIds: ["Pevensey"] })]));

    const foreign = groundAtomicClaimsV36({ ...battle, episodeId: "foreign-episode", claims: [battle.claims[0]!] });
    expect(foreign.propositions).toHaveLength(0);
    expect(foreign.diagnostics[0]?.code).toBe("GROUNDING_UNSUPPORTED_STRUCTURE");
  });

  it("preserves Franklin purpose, grouped graves, and evidence nesting", () => {
    const result = groundAtomicClaimsV36(source("history-youtube-history-10-video-story-pack-05-franklin-expedition"));
    const departure = result.claims.find((item) => item.claimId === "claim-6102997fabdd9aa3492eccb4")!;
    expect(departure.propositions).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicate: "moves-from", object: expect.objectContaining({ label: "Britain" }), assertionStatus: "asserted" }),
      expect.objectContaining({ predicate: "search-object", object: expect.objectContaining({ label: "Northwest Passage" }), assertionStatus: "intended" }),
    ]));
    expect(departure.propositions.some((item) => item.predicate === "moves-through" || item.predicate === "located-in")).toBe(false);
    expect(departure.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GROUNDING_PURPOSE_NOT_DESTINATION" })]));

    const graves = result.claims.find((item) => item.claimId === "claim-318504248e85a04faa5519d6")!;
    expect(graves.propositions).toHaveLength(2);
    expect(graves.propositions.filter((item) => item.object?.label.startsWith("graves of"))).toHaveLength(1);
    expect(graves.propositions.flatMap((item) => item.qualifiers ?? [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "nested-entity", value: "John Torrington | John Hartnell | William Braine" }),
    ]));
  });

  it("preserves actual-versus-intended Armada movement and clause boundaries", () => {
    const result = groundAtomicClaimsV36(source("history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed"));
    const origin = result.claims.find((item) => item.claimId === "claim-a6f0630762f216aee3e63456")!;
    const mission = result.claims.find((item) => item.claimId === "claim-dc974d4bfc009c22c481bf02")!;
    expect(origin.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ predicate: "moves-from", object: expect.objectContaining({ label: "Lisbon" }), assertionStatus: "asserted" })]));
    expect(mission.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ predicate: "moves-through", object: expect.objectContaining({ label: "English Channel" }), assertionStatus: "intended" })]));
    const losses = result.claims.find((item) => item.claimId === "claim-be7255357533271755d5dc0e")!.propositions[0]!;
    expect(losses).toMatchObject({ predicate: "causes", subject: { label: "storms, navigation, hunger, disease, and shipwreck" }, object: { label: "further losses" } });
    expect(losses.sourceSpan.text.startsWith("storms")).toBe(true);
    expect(losses.sourceSpan.text).not.toContain("sailed north");
  });

  it("grounds Black Death atoms without synthesizing a cross-claim wage relation", () => {
    const result = groundAtomicClaimsV36(source("history-youtube-history-10-video-story-pack-04-black-death"));
    expect(result.propositions).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: "claim-e7ccf1aa69a13de61594802b", predicate: "causes", assertionStatus: "asserted" }),
      expect.objectContaining({ claimId: "claim-3b3f5f2d628d9410657dcfe8", predicate: "transforms", assertionStatus: "asserted" }),
      expect.objectContaining({ claimId: "claim-ee76bea77004b9d801b6630b", predicate: "demands", assertionStatus: "uncertain", qualifiers: [expect.objectContaining({ kind: "grouped-concept" })] }),
      expect.objectContaining({ claimId: "claim-095a61f563fa2980b636c6cc", predicate: "restricts", assertionStatus: "attempted" }),
    ]));
    expect(lowerAtomicGroundingEvidenceV36(result.propositions).some((item) =>
      item.kind === "causal" && item.cause.canonicalLabel.includes("labour") && item.effect.canonicalLabel.includes("wage")
    )).toBe(false);
  });

  it("preserves Titanic ice causality without proper-name fragmentation", () => {
    const result = groundAtomicClaimsV36(source("history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster"));
    const ice = result.propositions.find((item) => item.claimId === "claim-cf84a3dbbd24f86a28cc6978")!;
    expect(ice).toMatchObject({ predicate: "causes", subject: { label: "ice" }, assertionStatus: "asserted" });
    const labels = result.propositions.flatMap((item) => [item.subject.label, item.object?.label]).filter(Boolean);
    expect(labels).not.toContain("Ice");
    expect(labels).not.toContain("Patrol");
  });

  it("keeps uncertain/counterfactual controls from becoming asserted causal evidence", () => {
    const bronze = groundAtomicClaimsV36(source("history-youtube-history-10-video-story-pack-01-bronze-age-collapse"));
    expect(bronze.propositions.some((item) => item.claimId === "claim-1336fb1a574cbaff0723cc10" && item.assertionStatus === "asserted")).toBe(false);
    const chernobyl = groundAtomicClaimsV36(source("history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded"));
    expect(chernobyl.propositions.some((item) => item.claimId === "claim-c7ad46546ded069ddbc9b491")).toBe(false);
  });

  it("scopes modality to the emitted clause and preserves might, could, intent, and attempt", () => {
    const adjacent = groundAtomicClaimsV36(syntheticSource("Drought caused harvest failure, but merchants could have waited."));
    expect(adjacent.propositions[0]).toMatchObject({ predicate: "causes", assertionStatus: "asserted" });

    const might = groundAtomicClaimsV36(syntheticSource("The fleet might have sailed from Lisbon.", [{ id: "entity-lisbon", claimId: "claim-scope-control", normalizedLabel: "Lisbon", entityType: "place" }]));
    expect(might.propositions[0]).toMatchObject({ predicate: "moves-from", assertionStatus: "uncertain" });

    const could = groundAtomicClaimsV36(source("history-youtube-history-10-video-story-pack-04-black-death"));
    expect(could.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ predicate: "demands", assertionStatus: "uncertain" })]));

    const intent = groundAtomicClaimsV36(source("history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed"));
    expect(intent.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ predicate: "moves-through", assertionStatus: "intended" })]));
    expect(could.propositions).toEqual(expect.arrayContaining([expect.objectContaining({ predicate: "restricts", assertionStatus: "attempted" })]));
  });

  it("retains proper-name unresolved participants but filters arbitrary clause fragments", () => {
    const properPlace = groundAtomicClaimsV36(syntheticSource("The army landed at Caerleon."));
    expect(properPlace.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GROUNDING_PARTICIPANT_UNRESOLVED", affectedIds: ["Caerleon"] })]));

    const ordinaryPhrase = groundAtomicClaimsV36(syntheticSource("The army landed at wrong place or lost commanders."));
    expect(ordinaryPhrase.diagnostics.some((item) => item.code === "GROUNDING_PARTICIPANT_UNRESOLVED")).toBe(false);

    const clauseFragment = groundAtomicClaimsV36(syntheticSource("The army departed from to begin the war from where they had arrived."));
    expect(clauseFragment.diagnostics.some((item) => item.code === "GROUNDING_PARTICIPANT_UNRESOLVED")).toBe(false);
  });
});
