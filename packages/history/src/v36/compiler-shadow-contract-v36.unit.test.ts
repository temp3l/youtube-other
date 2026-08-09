import { describe, expect, it } from "vitest";

import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
} from "./explanatory-relation-v36.js";
import {
  HISTORY_COMPILER_SHADOW_SCHEMA_V36,
  HISTORY_COMPILER_SHADOW_VERSION_V36,
  compilerIntentIdV36,
  compilerProvenanceV36,
  type CompilerIntentV36,
} from "./compiler-shadow-contract-v36.js";

describe("History V3.6 shadow compiler contract", () => {
  const relation = createExplanatoryRelationV36({
    episodeId: episodeIdV36("episode-contract"),
    kind: "movement",
    from: { entityId: entityIdV36("place-a"), canonicalLabel: "A" },
    to: { entityId: entityIdV36("place-b"), canonicalLabel: "B" },
    via: [],
    supportClaimIds: [claimIdV36("claim-b"), claimIdV36("claim-a")],
  });

  it("derives a deterministic compiler identity separate from relation identity", () => {
    const semanticIntent = { from: relation.kind === "movement" ? relation.from : null };
    const first = compilerIntentIdV36({
      target: "MAP",
      relationId: relation.id,
      semanticIntent,
    });
    const second = compilerIntentIdV36({
      semanticIntent,
      relationId: relation.id,
      target: "MAP",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^history-compiler-intent-[a-f0-9]{24}$/u);
    expect(first).not.toBe(relation.id);
  });

  it("keeps evidence lineage out of identity while retaining canonical provenance", () => {
    const first = compilerProvenanceV36(relation, {
      atomicGroundingIds: ["grounding-b", "grounding-a", "grounding-a"],
      structuredPropositionIds: ["proposition-b", "proposition-a"],
    });
    const second = compilerProvenanceV36(relation, {
      atomicGroundingIds: ["grounding-a", "grounding-b"],
      structuredPropositionIds: ["proposition-a", "proposition-b"],
    });
    expect(first).toEqual(second);
    expect(first.relationId).toBe(relation.id);
    expect(first.evidenceFingerprint).toBe(relation.evidenceFingerprint);
    expect(first.supportClaimIds).toEqual(relation.supportClaimIds);
  });

  it("types all three required dispositions as shadow-only outputs", () => {
    const common = {
      schemaVersion: HISTORY_COMPILER_SHADOW_SCHEMA_V36,
      compilerVersion: HISTORY_COMPILER_SHADOW_VERSION_V36,
      compilerIntentId: "history-compiler-intent-000000000000000000000000",
      episodeId: relation.episodeId,
      relationId: relation.id,
      provenance: compilerProvenanceV36(relation),
      shadowOnly: true as const,
    };
    const outputs: readonly CompilerIntentV36[] = [
      {
        ...common,
        disposition: "MAP",
        relationKind: "movement",
        compilerRule: "map-movement.v1",
        mapSemanticType: "movement",
        from: relation.kind === "movement" ? relation.from : neverValue(),
        to: relation.kind === "movement" ? relation.to : neverValue(),
        via: relation.kind === "movement" ? relation.via : neverValue(),
      },
      {
        ...common,
        disposition: "DIAGRAM",
        relationKind: "causal",
        compilerRule: "diagram-causal.v1",
        diagramSemanticType: "causal-chain",
        cause: { canonicalLabel: "cause" },
        effect: { canonicalLabel: "effect" },
        causalAssertionStatus: "asserted",
      },
      {
        ...common,
        disposition: "NO_SAFE_COMPILATION",
        relationKind: "movement",
        compilerRule: "map-movement.v1",
        diagnosticCode: "NO_SAFE_TEST",
        reason: "Contract characterization only.",
      },
    ];
    expect(outputs.map((output) => output.disposition)).toEqual([
      "MAP",
      "DIAGRAM",
      "NO_SAFE_COMPILATION",
    ]);
    expect(outputs.every((output) => output.shadowOnly)).toBe(true);
  });
});

function neverValue(): never {
  throw new Error("unreachable");
}
