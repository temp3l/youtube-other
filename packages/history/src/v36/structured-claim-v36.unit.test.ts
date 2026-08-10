import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  groundAtomicClaimsV36,
  groundAtomicClaimsFallbackV36,
  type AtomicGroundingSourceV36,
} from "./atomic-claim-grounder-v36.js";
import { atomicGroundingArtifactSchemaV36 } from "./atomic-claim-grounding-v36.js";
import { explanatoryRelationSchemaV36 } from "./explanatory-relation-v36.js";
import { runRepresentativeShadowExtractionV36, type RepresentativeShadowSourceV36 } from "./representative-shadow-extraction-v36.js";
import {
  backfillStructuredClaimsV36,
  createNativeStructuredClaimEnvelopeV36,
} from "./structured-claim-enricher-v36.js";
import {
  HISTORY_STRUCTURED_CLAIM_GENERATOR_V36,
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  createStructuredPropositionV36,
  structuredClaimArtifactSchemaV36,
  structuredClaimEnvelopeSchemaV36,
  structuredClaimJsonSchemaV36,
  structuredPropositionSchemaV36,
} from "./structured-claim-v36.js";

function source(episodeId: string): RepresentativeShadowSourceV36 {
  const root = resolve(process.cwd(), "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(readFileSync(resolve(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(readFileSync(resolve(root, "plan.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] };
}

const droughtText = "Drought caused harvest failure.";
const droughtSource: AtomicGroundingSourceV36 = {
  episodeId: "episode-structured-control",
  claims: [{
    id: "claim-structured-control",
    episodeId: "episode-structured-control",
    normalizedProposition: droughtText,
    claimKind: "causal",
    entityMentionIds: [],
    narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: droughtText.length }],
  }],
  entities: [],
};

const fallback = groundAtomicClaimsFallbackV36(droughtSource);
const backfill = backfillStructuredClaimsV36(droughtSource, fallback);
const validEnvelope = backfill.envelopes[0]!;
const validArtifact = {
  schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  episodeId: droughtSource.episodeId,
  envelopes: [validEnvelope],
  diagnostics: [],
};

describe("History V3.6 structured claim runtime and generated schemas", () => {
  const jsonSchema = z.fromJSONSchema(structuredClaimJsonSchemaV36);

  function runtimeRejected(mutate: (payload: any) => void): void {
    const payload = JSON.parse(JSON.stringify(validArtifact));
    mutate(payload);
    expect(structuredClaimArtifactSchemaV36.safeParse(payload).success).toBe(false);
  }

  it("accepts the mechanically generated schema control and rejects primitive/unknown shapes", () => {
    expect(structuredClaimArtifactSchemaV36.safeParse(validArtifact).success).toBe(true);
    expect(jsonSchema.safeParse(validArtifact).success).toBe(true);
    expect(structuredClaimArtifactSchemaV36.safeParse(42).success).toBe(false);
    expect(structuredClaimArtifactSchemaV36.safeParse({}).success).toBe(false);
    expect(jsonSchema.safeParse({ ...validArtifact, unknown: true }).success).toBe(false);
    expect(structuredClaimJsonSchemaV36.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("rejects missing IDs/spans, unknown versions/enums/roles, malformed bindings, and additional properties", () => {
    runtimeRejected((payload) => { payload.schemaVersion = "history-structured-claim.v999"; });
    runtimeRejected((payload) => { delete payload.envelopes[0].claimId; });
    runtimeRejected((payload) => { payload.envelopes[0].propositions[0].predicate = "free-form"; });
    runtimeRejected((payload) => { payload.envelopes[0].propositions[0].assertionStatus = "completed"; });
    runtimeRejected((payload) => { delete payload.envelopes[0].propositions[0].sourceSpan; });
    runtimeRejected((payload) => { payload.envelopes[0].propositions[0].sourceSpan.endUtf16Exclusive = 0; });
    runtimeRejected((payload) => { delete payload.envelopes[0].propositions[0].subject.binding.referenceId; });
    runtimeRejected((payload) => { payload.envelopes[0].propositions[0].roles[0].role = "invented-role"; });
    runtimeRejected((payload) => { payload.envelopes[0].propositions[0].unknown = true; });
  });

  it("rejects purpose/destination conflation and invalid ordered-step qualifiers", () => {
    const purpose = JSON.parse(JSON.stringify(validEnvelope.propositions[0]));
    purpose.predicate = "search-object";
    purpose.roles = [
      { role: "actor", participant: purpose.subject },
      { role: "objective", participant: purpose.object },
      { role: "destination", participant: purpose.object },
    ];
    expect(structuredPropositionSchemaV36.safeParse(purpose).success).toBe(false);
    purpose.roles = [{ role: "actor", participant: purpose.subject }, { role: "objective", participant: purpose.object }];
    purpose.qualifiers = [{ kind: "step-order", value: "first" }];
    expect(structuredPropositionSchemaV36.safeParse(purpose).success).toBe(false);
  });
});

describe("History V3.6 structured proposition identity and atomic priority", () => {
  it("derives deterministic IDs without timestamps, Git SHAs, or random input", () => {
    const proposition = validEnvelope.propositions[0]!;
    const copy = createStructuredPropositionV36({ ...proposition, propositionId: undefined } as never);
    expect(copy.propositionId).toBe(proposition.propositionId);
  });

  it("prefers native structure over compatibility backfill and preserves atomic validation", () => {
    const compatibility = validEnvelope.propositions[0]!;
    const nativeProposition = createStructuredPropositionV36({
      ...compatibility,
      propositionId: undefined,
      provenance: {
        ...compatibility.provenance,
        generationMethod: "native-structured-claim-generation",
        generatorVersion: HISTORY_STRUCTURED_CLAIM_GENERATOR_V36,
      },
    } as never);
    const native = createNativeStructuredClaimEnvelopeV36({
      episodeId: droughtSource.episodeId,
      claimId: droughtSource.claims[0]!.id,
      canonicalClaimSchemaVersion: "history-claim.v3.4",
      propositions: [nativeProposition],
    });
    const result = groundAtomicClaimsV36({
      ...droughtSource,
      structuredClaimEnvelopes: [validEnvelope, native],
    });
    expect(result.propositions).toHaveLength(1);
    expect(result.propositions[0]?.provenance.sourceKind).toBe("native-structured-proposition");
    expect(atomicGroundingArtifactSchemaV36.safeParse({
      schemaVersion: result.schemaVersion,
      episodeId: result.episodeId,
      claims: result.claims,
    }).success).toBe(true);
  });
});

describe("History V3.6 representative structured-claim safety gate", () => {
  const representativeEpisodeIds = [
    "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
    "history-youtube-history-10-video-story-pack-04-black-death",
    "history-youtube-history-10-video-story-pack-05-franklin-expedition",
    "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed",
    "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion",
    "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england",
    "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
    "history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded",
  ] as const;
  const runs = representativeEpisodeIds.map((episodeId) => runRepresentativeShadowExtractionV36(source(episodeId)));

  it("passes all eight representative schema and semantic invariants before corpus measurement", () => {
    expect(runs).toHaveLength(8);
    for (const result of runs) {
      expect(structuredClaimArtifactSchemaV36.safeParse({
        schemaVersion: result.structuredClaims.schemaVersion,
        episodeId: result.episodeId,
        envelopes: result.structuredClaims.envelopes,
        diagnostics: result.structuredClaims.diagnostics,
      }).success).toBe(true);
      expect(atomicGroundingArtifactSchemaV36.safeParse({
        schemaVersion: result.grounding.schemaVersion,
        episodeId: result.episodeId,
        claims: result.grounding.claims,
      }).success).toBe(true);
      expect(result.extraction.relations.every((relation) => explanatoryRelationSchemaV36.safeParse(relation).success)).toBe(true);
      expect(new Set(result.extraction.relations.map((relation) => relation.id)).size).toBe(result.extraction.relations.length);
      expect(result.extraction.relations.every((relation) => relation.episodeId === result.episodeId)).toBe(true);
    }

    const franklin = runs.find((result) => result.episodeId.includes("franklin-expedition"))!;
    expect(franklin.extraction.relations.some((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Northwest Passage")).toBe(false);
    expect(franklin.structuredClaims.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "STRUCTURED_CLAIM_PURPOSE_NOT_DESTINATION" }),
    ]));

    const battle = runs.find((result) => result.episodeId.includes("20-1066"))!;
    expect(battle.extraction.relations.some((relation) => JSON.stringify(relation).includes("King Edward") && JSON.stringify(relation).includes("Europe"))).toBe(false);
    expect(battle.grounding.propositions.some((proposition) => proposition.object?.label === "Pevensey")).toBe(false);
  });
});
