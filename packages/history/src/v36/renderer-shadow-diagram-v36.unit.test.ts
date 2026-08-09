import { describe, expect, it } from "vitest";

import type { DiagramIntentV36 } from "./compiler-shadow-contract-v36.js";
import {
  adaptDiagramIntentToRenderSpecV36,
  renderDiagramSpecSvgV36,
} from "./renderer-shadow-diagram-v36.js";

const common = {
  schemaVersion: "history-compiler-shadow-intent.v1",
  compilerVersion: "history-compiler-shadow.v3.6.0",
  episodeId: "episode",
  relationId: "relation",
  provenance: {
    relationId: "relation",
    evidenceFingerprint: "evidence",
    supportClaimIds: ["claim"],
    structuredPropositionIds: [],
    atomicGroundingIds: [],
  },
  shadowOnly: true,
  disposition: "DIAGRAM",
} as const;

describe("V3.6 diagram renderer shadow adapter", () => {
  it.each([
    ["dependency", "depends-on-requirement"],
    ["process", "process-order-not-causality"],
    ["temporal-sequence", "chronology-not-causality"],
  ] as const)("keeps %s distinct from causality", (kind, edgeType) => {
    const tail =
      kind === "dependency"
        ? { dependency: { canonicalLabel: "A" }, dependent: { canonicalLabel: "B" }, diagramSemanticType: "dependency", compilerRule: "diagram-dependency.v1" }
        : { steps: [{ canonicalLabel: "A" }, { canonicalLabel: "B" }], diagramSemanticType: kind === "process" ? "process" : "temporal-sequence", orderSemantics: kind === "process" ? "process-order-not-causality" : "chronology-not-causality", compilerRule: `diagram-${kind}.v1` };
    const spec = adaptDiagramIntentToRenderSpecV36({
      ...common,
      compilerIntentId: `${kind}-intent`,
      relationKind: kind,
      ...tail,
    } as DiagramIntentV36);
    expect(spec.edges[0]?.semanticType).toBe(edgeType);
    expect(spec.edges[0]?.semanticType).not.toBe("causes");
  });

  it("preserves asymmetric policy modality and proof", () => {
    const intent = {
      ...common,
      compilerIntentId: "policy-intent",
      relationKind: "policy-response",
      compilerRule: "diagram-policy-response.v1",
      diagramSemanticType: "policy-response",
      condition: { canonicalLabel: "uncertain condition" },
      conditionAssertionStatus: "uncertain",
      response: { canonicalLabel: "attempted response" },
      responseAssertionStatus: "attempted",
      provenance: { ...common.provenance, proof: { proofEvidenceId: "e", proofId: "p", proofEvidenceFingerprint: "f", premises: [] } },
    } as DiagramIntentV36;
    const spec = adaptDiagramIntentToRenderSpecV36(intent);
    expect(spec.points.map((point) => point.status)).toEqual(["uncertain", "attempted"]);
    expect(spec.legend).toContain("proof: p");
    expect(renderDiagramSpecSvgV36(spec)).toContain("attempted");
  });

  it("creates no edges or semantic ordering for evidence members", () => {
    const intent = {
      ...common,
      compilerIntentId: "evidence-intent",
      relationKind: "evidence-set",
      compilerRule: "diagram-evidence-set.v1",
      diagramSemanticType: "evidence-set",
      subject: { canonicalLabel: "target" },
      evidence: [{ canonicalLabel: "member B" }, { canonicalLabel: "member A" }],
      unorderedSemanticSet: true,
      semanticEdges: [],
    } as DiagramIntentV36;
    const spec = adaptDiagramIntentToRenderSpecV36(intent);
    expect(spec.edges).toEqual([]);
    expect(spec.points.filter((point) => point.role === "unordered-evidence-member")).toHaveLength(2);
  });
});
