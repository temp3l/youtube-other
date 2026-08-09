import { describe, expect, it } from "vitest";

import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  type ExplanatoryRelationV36,
} from "./explanatory-relation-v36.js";
import { compileDiagramRelationV36 } from "./compiler-shadow-diagram-v36.js";
import {
  compileHistoryShadowArtifactV36,
  compileRelationShadowV36,
} from "./compiler-shadow-v36.js";

const episodeId = episodeIdV36("episode-diagram-compiler");
const claimA = claimIdV36("claim-a");
const claimB = claimIdV36("claim-b");
const concept = (canonicalLabel: string, id?: string) => ({
  canonicalLabel,
  ...(id ? { entityId: entityIdV36(id) } : {}),
});

describe("History V3.6 strict shadow diagram compiler", () => {
  it("preserves causal direction and non-asserted modality", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "causal",
      cause: concept("cause"),
      effect: concept("effect"),
      causalAssertionStatus: "uncertain",
      supportClaimIds: [claimA],
    });
    expect(compileDiagramRelationV36(relation)).toMatchObject({
      disposition: "DIAGRAM",
      relationKind: "causal",
      cause: relation.cause,
      effect: relation.effect,
      causalAssertionStatus: "uncertain",
    });
  });

  it("preserves dependency direction without causal conversion", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "dependency",
      dependency: concept("required input"),
      dependent: concept("dependent result"),
      supportClaimIds: [claimA],
    });
    const compiled = compileDiagramRelationV36(relation);
    expect(compiled).toMatchObject({
      disposition: "DIAGRAM",
      relationKind: "dependency",
      dependency: relation.dependency,
      dependent: relation.dependent,
    });
    expect(compiled).not.toHaveProperty("cause");
  });

  it("preserves process and temporal orders with explicitly non-causal semantics", () => {
    const process = createExplanatoryRelationV36({
      episodeId,
      kind: "process",
      steps: [concept("step three"), concept("step one"), concept("step two")],
      supportClaimIds: [claimA],
    });
    const temporal = createExplanatoryRelationV36({
      episodeId,
      kind: "temporal-sequence",
      steps: [concept("before"), concept("after")],
      supportClaimIds: [claimA],
    });
    expect(compileDiagramRelationV36(process)).toMatchObject({
      steps: process.steps,
      orderSemantics: "process-order-not-causality",
    });
    expect(compileDiagramRelationV36(temporal)).toMatchObject({
      steps: temporal.steps,
      orderSemantics: "chronology-not-causality",
    });
  });

  it("preserves asymmetric policy-response modality and proof lineage", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "policy-response",
      condition: concept("wage demand", "condition"),
      conditionAssertionStatus: "uncertain",
      response: concept("restriction attempt", "response"),
      responseAssertionStatus: "attempted",
      supportClaimIds: [claimA, claimB],
    });
    const proof = {
      proofEvidenceId: "relation-proof-evidence-accepted",
      proofId: "cross-claim-proof-accepted",
      proofEvidenceFingerprint: "cross-claim-proof-evidence-accepted",
      premises: [
        {
          premiseId: "condition" as const,
          claimId: claimA,
          structuredPropositionId: "structured-condition",
          atomicGroundingId: "grounding-condition",
          assertionStatus: "uncertain" as const,
        },
        {
          premiseId: "response" as const,
          claimId: claimB,
          structuredPropositionId: "structured-response",
          atomicGroundingId: "grounding-response",
          assertionStatus: "attempted" as const,
        },
      ],
    };
    const compiled = compileDiagramRelationV36(relation, { proof });
    expect(compiled).toMatchObject({
      disposition: "DIAGRAM",
      relationKind: "policy-response",
      conditionAssertionStatus: "uncertain",
      responseAssertionStatus: "attempted",
      provenance: { proof },
    });
    const mismatched = compileDiagramRelationV36(relation, {
      proof: {
        ...proof,
        premises: [
          { ...proof.premises[0]!, assertionStatus: "asserted" as const },
          proof.premises[1]!,
        ],
      },
    });
    expect(mismatched).toMatchObject({
      disposition: "NO_SAFE_COMPILATION",
      diagnosticCode: "COMPILER_PROOF_MODALITY_MISMATCH",
    });
  });

  it("canonicalizes evidence only for serialization and creates no semantic edges", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "evidence-set",
      subject: concept("subject"),
      evidence: [concept("Z evidence", "z"), concept("A evidence", "a")],
      supportClaimIds: [claimA],
    });
    const compiled = compileDiagramRelationV36(relation);
    expect(compiled).toMatchObject({
      disposition: "DIAGRAM",
      relationKind: "evidence-set",
      unorderedSemanticSet: true,
      semanticEdges: [],
    });
    if (compiled.disposition !== "DIAGRAM" || compiled.relationKind !== "evidence-set")
      throw new Error("Expected evidence-set diagram intent.");
    expect(compiled.evidence.map((item) => item.entityId)).toEqual(["a", "z"]);
  });

  it("dispatches every accepted relation kind to exactly one deterministic output", () => {
    const place = (id: string) => ({ entityId: entityIdV36(id), canonicalLabel: id });
    const relations: readonly ExplanatoryRelationV36[] = [
      createExplanatoryRelationV36({ episodeId, kind: "movement", from: place("a"), to: place("b"), via: [], supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "spatial-comparison", places: [place("a"), place("b")], supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "spatial-area", place: place("a"), supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "causal", cause: concept("a"), effect: concept("b"), supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "dependency", dependency: concept("a"), dependent: concept("b"), supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "process", steps: [concept("a"), concept("b")], supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "temporal-sequence", steps: [concept("a"), concept("b")], supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "policy-response", condition: concept("a"), response: concept("b"), supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "evidence-set", evidence: [concept("a"), concept("b")], supportClaimIds: [claimA] }),
      createExplanatoryRelationV36({ episodeId, kind: "event-location", event: { canonicalLabel: "event", eventType: "event" }, location: place("a"), assertionStatus: "intended", supportClaimIds: [claimA] }),
    ];
    const outputs = relations.map((relation) => compileRelationShadowV36(relation));
    expect(outputs).toHaveLength(relations.length);
    expect(outputs.map((output) => output.disposition)).toEqual([
      "MAP", "MAP", "MAP", "DIAGRAM", "DIAGRAM", "DIAGRAM", "DIAGRAM", "DIAGRAM", "DIAGRAM", "MAP",
    ]);
    expect(new Set(outputs.map((output) => output.compilerIntentId)).size).toBe(10);
    expect(outputs).toEqual(relations.map((relation) => compileRelationShadowV36(relation)));
  });

  it("sorts batch outputs and rejects cross-episode support without dropping it", () => {
    const relation = createExplanatoryRelationV36({
      episodeId,
      kind: "causal",
      cause: concept("cause"),
      effect: concept("effect"),
      supportClaimIds: [claimA],
    });
    const first = compileHistoryShadowArtifactV36({
      episodeId: "different-episode",
      relations: [{ relation }],
    });
    expect(first.intents).toHaveLength(1);
    expect(first.intents[0]).toMatchObject({
      disposition: "NO_SAFE_COMPILATION",
      diagnosticCode: "CROSS_EPISODE_COMPILER_SUPPORT",
    });
    expect(first).toEqual(
      compileHistoryShadowArtifactV36({
        episodeId: "different-episode",
        relations: [{ relation }],
      })
    );
  });
});
