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
  reviewArtifactProvenanceJsonSchemaV36,
  reviewArtifactProvenanceSchemaV36,
} from "./review-provenance-v36.js";

const relationJsonSchema = z.fromJSONSchema(explanatoryRelationJsonSchemaV36);
const provenanceJsonSchema = z.fromJSONSchema(reviewArtifactProvenanceJsonSchemaV36);

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
  schemaVersion: HISTORY_V36_REVIEW_PROVENANCE_SCHEMA,
  artifactKind: HISTORY_V36_REVIEW_ARTIFACT_KIND,
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
    expect(explanatoryRelationJsonSchemaV36.oneOf).toHaveLength(9);
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
    expect([...validByKind.values()]).toHaveLength(9);
    for (const relation of validByKind.values()) {
      expect(explanatoryRelationSchemaV36.safeParse(relation).success).toBe(true);
      expect(relationJsonSchema.safeParse(serialized(relation)).success).toBe(true);
    }
  });
});

describe("History V3.6 generated provenance JSON Schema", () => {
  it("is a strict object schema with all authoritative fields", () => {
    expect(reviewArtifactProvenanceJsonSchemaV36.type).toBe("object");
    expect(reviewArtifactProvenanceJsonSchemaV36.additionalProperties).toBe(false);
    expect(reviewArtifactProvenanceJsonSchemaV36.required).toHaveLength(10);
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
