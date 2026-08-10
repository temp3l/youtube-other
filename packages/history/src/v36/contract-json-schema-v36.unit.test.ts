import { execFileSync } from "node:child_process";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  createExplanatoryRelationV36,
  explanatoryRelationJsonSchemaV36,
  explanatoryRelationSchemaV36,
  type ExplanatoryRelationV36,
} from "./explanatory-relation-v36.js";
import { goldenSemanticFixturesV36 } from "./golden-semantic-fixtures-v36.js";
import {
  HISTORY_V36_REVIEW_ARTIFACT_KIND,
  HISTORY_V36_REVIEW_PROVENANCE_SCHEMA,
  HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_ARTIFACT_KIND,
  HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_PROVENANCE_SCHEMA,
  processTemporalCandidateReviewProvenanceJsonSchemaV36,
  processTemporalCandidateReviewProvenanceSchemaV36,
  reviewArtifactProvenanceJsonSchemaV36,
  reviewArtifactProvenanceSchemaV36,
} from "./review-provenance-v36.js";

const relationJsonSchema = z.fromJSONSchema(explanatoryRelationJsonSchemaV36);
const provenanceJsonSchema = z.fromJSONSchema(reviewArtifactProvenanceJsonSchemaV36);
const processTemporalProvenanceJsonSchema = z.fromJSONSchema(processTemporalCandidateReviewProvenanceJsonSchemaV36);

function serialized(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function expectRelationRejected(value: unknown): void {
  expect(explanatoryRelationSchemaV36.safeParse(value).success).toBe(false);
  expect(relationJsonSchema.safeParse(value).success).toBe(false);
}

function expectProvenanceRejected(value: unknown): void {
  expect(reviewArtifactProvenanceSchemaV36.safeParse(value).success).toBe(false);
  expect(provenanceJsonSchema.safeParse(value).success).toBe(false);
}

const validProvenance = {
  generatedAt: "2026-08-09T10:36:38.226Z",
  gitCommitSha: "fc328285fe04b1a634d55f30b58a37b998cb705f",
  gitBranch: "master",
  v36ImplementationCommitSha: "fc328285fe04b1a634d55f30b58a37b998cb705f",
  frozenV35ProductionCommitSha: "f04262c16bfd1a89d1b404b1ac291a89dc699a0d",
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  schemaVersion: HISTORY_V36_REVIEW_PROVENANCE_SCHEMA,
  artifactKind: HISTORY_V36_REVIEW_ARTIFACT_KIND,
  episodeSet: ["representative-episode"],
};

describe("History V3.6 generated relation JSON Schema", () => {
  const validByKind = new Map<string, ExplanatoryRelationV36>();
  for (const fixture of goldenSemanticFixturesV36) {
    for (const draft of fixture.expectedRelations) {
      const relation = createExplanatoryRelationV36(draft);
      validByKind.set(relation.kind, relation);
    }
  }

  it("is an enforceable Draft 2020-12 schema generated from the runtime validator", () => {
    expect(explanatoryRelationJsonSchemaV36.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(explanatoryRelationJsonSchemaV36.$id).toContain("relation-schema.json");
    expect(explanatoryRelationJsonSchemaV36.oneOf).toHaveLength(10);
  });

  it("rejects primitive, empty, unknown, incomplete, and wrong-discriminator payloads", () => {
    for (const payload of [42, {}, { totally: "invalid" }, { kind: "movement" }, { kind: "unknown" }]) {
      expectRelationRejected(payload);
    }
  });

  it("requires each kind's semantic fields and typed participants", () => {
    const requiredFields: Record<string, readonly string[]> = {
      movement: ["from", "to", "via"],
      "spatial-comparison": ["places"],
      "spatial-area": ["place"],
      causal: ["cause", "effect"],
      dependency: ["dependency", "dependent"],
      process: ["steps"],
      "temporal-sequence": ["steps"],
      "policy-response": ["condition", "response"],
      "evidence-set": ["evidence"],
      "event-location": ["event", "location", "assertionStatus"],
    };
    for (const [kind, relation] of validByKind) {
      for (const field of requiredFields[kind]!) {
        const incomplete = serialized(relation);
        delete incomplete[field];
        expectRelationRejected(incomplete);
      }
    }
    const movement = serialized(validByKind.get("movement"));
    movement.from = { canonicalLabel: "Lisbon" };
    expectRelationRejected(movement);
    const causal = serialized(validByKind.get("causal"));
    causal.cause = "drought";
    expectRelationRejected(causal);
  });

  it("enforces structural array cardinality and accepts a valid instance of every kind", () => {
    const process = serialized(validByKind.get("process"));
    process.steps = [(process.steps as unknown[])[0]];
    expectRelationRejected(process);
    const temporal = serialized(validByKind.get("temporal-sequence"));
    temporal.steps = [(temporal.steps as unknown[])[0]];
    expectRelationRejected(temporal);
    const comparison = serialized(validByKind.get("spatial-comparison"));
    comparison.places = [(comparison.places as unknown[])[0]];
    expectRelationRejected(comparison);
    expect([...validByKind.values()]).toHaveLength(10);
    for (const relation of validByKind.values()) {
      expect(explanatoryRelationSchemaV36.safeParse(relation).success).toBe(true);
      expect(relationJsonSchema.safeParse(serialized(relation)).success).toBe(true);
    }
  });
});

describe("History V3.6 generated provenance JSON Schema", () => {
  it("is a strict object schema with all authoritative fields", () => {
    expect(HISTORY_V36_REVIEW_PROVENANCE_SCHEMA).toBe("history-v3.6-relation-ir-review-provenance.v3");
    expect(HISTORY_V36_REVIEW_ARTIFACT_KIND).toBe("history-v3.6-shadow-relations-review");
    expect(reviewArtifactProvenanceJsonSchemaV36.type).toBe("object");
    expect(reviewArtifactProvenanceJsonSchemaV36.additionalProperties).toBe(false);
    expect(reviewArtifactProvenanceJsonSchemaV36.required).toHaveLength(12);
    expect(reviewArtifactProvenanceSchemaV36.safeParse(validProvenance).success).toBe(true);
    expect(provenanceJsonSchema.safeParse(validProvenance).success).toBe(true);
  });

  it("rejects primitive, incomplete, malformed, wrong-kind, and unknown provenance", () => {
    expectProvenanceRejected(42);
    expectProvenanceRejected({});
    const missingSha = { ...validProvenance };
    delete (missingSha as Record<string, unknown>).gitCommitSha;
    expectProvenanceRejected(missingSha);
    expectProvenanceRejected({ ...validProvenance, gitCommitSha: "not-a-sha" });
    expectProvenanceRejected({ ...validProvenance, generatedAt: "2026-08-09T10:36:38+02:00" });
    expectProvenanceRejected({ ...validProvenance, artifactKind: "wrong-artifact" });
    expectProvenanceRejected({ ...validProvenance, unexpected: true });
  });
});

describe("History V3.6 Phase 2.8 provenance JSON Schema", () => {
  const valid = {
    v36ImplementationCommitSha: "a".repeat(40),
    phase27ImplementationCommitSha: "8e40dda55ec1f83162be21907b2194f01c8241c7",
    phase27ReportCommitSha: "c71189ed7f70e02179012911feb4fffd13b87cb1",
    phase27Tag: "history-v3.6-native-process-temporal-baseline",
    contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
    contractBaselineTag: "history-v3.6-contract-preflight-baseline",
    frozenV35ProductionCommitSha: "f04262c16bfd1a89d1b404b1ac291a89dc699a0d",
    frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
    frozenV35ProductionTagObjectSha: "149a2d160b140d13a97f66155a4b8705f6adf652",
    acceptedV35SemanticBaselineCommitSha: "82b4192f6e832523ce00675e39593e3f98a96403",
    acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
    artifactKind: HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_ARTIFACT_KIND,
    schemaVersion: HISTORY_V36_PROCESS_TEMPORAL_CANDIDATE_REVIEW_PROVENANCE_SCHEMA,
    episodeSet: Array.from({ length: 8 }, (_, index) => ({ episodeId: `episode-${index}`, title: `Episode ${index}` })),
    generatedAt: "2026-08-09T18:00:00.000Z",
    gitBranch: "master",
    liveProviderCalls: 0,
  };

  it("requires separate peeled commit and annotated tag-object fields", () => {
    const parsed = processTemporalCandidateReviewProvenanceSchemaV36.parse(valid);
    expect(execFileSync("git", ["cat-file", "-t", parsed.frozenV35ProductionCommitSha], { encoding: "utf8" }).trim()).toBe("commit");
    expect(execFileSync("git", ["cat-file", "-t", parsed.frozenV35ProductionTagObjectSha], { encoding: "utf8" }).trim()).toBe("tag");
    expect(processTemporalProvenanceJsonSchema.safeParse(valid).success).toBe(true);
    const missingTagObject = { ...valid };
    delete (missingTagObject as Partial<typeof valid>).frozenV35ProductionTagObjectSha;
    expect(processTemporalCandidateReviewProvenanceSchemaV36.safeParse(missingTagObject).success).toBe(false);
    expect(processTemporalCandidateReviewProvenanceSchemaV36.safeParse({
      ...valid,
      frozenV35ProductionCommitSha: "149a2d160b140d13a97f66155a4b8705f6adf652",
      unexpectedAlias: true,
    }).success).toBe(false);
  });
});
