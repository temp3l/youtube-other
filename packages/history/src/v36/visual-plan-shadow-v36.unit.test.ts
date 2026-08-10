import { describe, expect, it } from "vitest";

import type { HistoryVisualPlanV35 } from "../history-v35-contracts.js";
import type { DiagramRenderSpecV36 } from "./renderer-shadow-contract-v36.js";
import {
  buildHistoryVisualPlanShadowV36,
  placeRenderSpecInVisualPlanV36,
  resolveHistoryVisualPlanRouteV36,
  validateHistoryVisualPlanShadowV36,
} from "./visual-plan-shadow-v36.js";

const beat = (input: {
  id: string;
  startMs: number;
  endMs: number;
  claimIds: string[];
  shotIds: string[];
}) =>
  ({
    id: input.id,
    startMs: input.startMs,
    endMs: input.endMs,
    linkedClaimIds: input.claimIds,
    shotIds: input.shotIds,
    narrationSpan: {
      startUtf16: input.startMs / 10,
      endUtf16Exclusive: input.endMs / 10,
    },
  }) as HistoryVisualPlanV35["beats"][number];

function basePlan(): HistoryVisualPlanV35 {
  return {
    schemaVersion: "history-visual-plan.v3.5",
    plannerVersion: "history-visual-planner.v3.5.0",
    episodeId: "history-episode",
    planHash: "a".repeat(64),
    timing: {
      timingSource: "provisional-text-estimate",
      totalDurationMs: 30_000,
    },
    approval: {
      production: { blockerCodes: ["TIMING_MEASUREMENT_REQUIRED"] },
    },
    beats: [
      beat({
        id: "beat-001",
        startMs: 0,
        endMs: 10_000,
        claimIds: ["claim-a"],
        shotIds: ["shot-001"],
      }),
      beat({
        id: "beat-002",
        startMs: 10_000,
        endMs: 20_000,
        claimIds: ["claim-b"],
        shotIds: ["shot-002"],
      }),
    ],
    shots: [{ id: "shot-001" }, { id: "shot-002" }],
  } as HistoryVisualPlanV35;
}

function renderSpec(
  supportClaimIds: string[] = ["claim-a", "claim-b"]
): DiagramRenderSpecV36 {
  return {
    schemaVersion: "history-renderer-shadow-spec.v1",
    rendererVersion: "history-renderer-shadow.v3.6.0",
    disposition: "RENDER_SPEC",
    renderTarget: "DIAGRAM_SVG",
    renderSpecId: "history-render-spec-a",
    compilerIntentId: "history-compiler-intent-a",
    relationId: "history-relation-a",
    relationKind: "causal",
    episodeId: "history-episode",
    rendererRule: "diagram-causal-svg.v1",
    shadowOnly: true,
    provenance: {
      relationId: "history-relation-a",
      evidenceFingerprint: "fingerprint-a",
      supportClaimIds,
      structuredPropositionIds: [],
      atomicGroundingIds: [],
    },
    width: 1200,
    height: 675,
    semanticPayload: {} as DiagramRenderSpecV36["semanticPayload"],
    points: [],
    edges: [],
    legend: [],
  };
}

describe("V3.6 shadow visual-plan integration", () => {
  it("anchors after all exact support claims and preserves ordinary shots", () => {
    const base = basePlan();
    const original = structuredClone(base);
    const plan = buildHistoryVisualPlanShadowV36({
      basePlan: base,
      renderSpecs: [renderSpec()],
    });

    expect(plan.placements).toEqual([
      expect.objectContaining({
        disposition: "PLACED",
        operation: "ATTACH_SEMANTIC_OVERLAY",
        supportBeatIds: ["beat-001", "beat-002"],
        anchor: expect.objectContaining({ beatId: "beat-002" }),
        preservedBaseShotIds: ["shot-002"],
        preservesBaseShots: true,
      }),
    ]);
    expect(plan.basePlan.shotIds).toEqual(["shot-001", "shot-002"]);
    expect(plan.summary.replacementCount).toBe(0);
    expect(validateHistoryVisualPlanShadowV36(plan, base)).toEqual(
      expect.objectContaining({ valid: true })
    );
    expect(base).toEqual(original);
  });

  it("fails closed when an exact supporting claim has no beat anchor", () => {
    expect(
      placeRenderSpecInVisualPlanV36({
        basePlan: basePlan(),
        renderSpec: renderSpec(["claim-missing"]),
      })
    ).toEqual(
      expect.objectContaining({
        disposition: "NO_SAFE_PLACEMENT",
        diagnosticCode: "SUPPORT_CLAIM_NOT_IN_BASE_PLAN",
      })
    );
  });

  it("rejects duplicate semantic insertion", () => {
    const spec = renderSpec();
    expect(() =>
      buildHistoryVisualPlanShadowV36({
        basePlan: basePlan(),
        renderSpecs: [spec, spec],
      })
    ).toThrow("duplicate render spec ID");
  });

  it("routes V3.5 by default and V3.6 only for explicit shadow mode", () => {
    expect(resolveHistoryVisualPlanRouteV36({ genre: "history" })).toEqual(
      expect.objectContaining({
        route: "V3_5_PRODUCTION",
        productionActivated: false,
      })
    );
    expect(
      resolveHistoryVisualPlanRouteV36({
        genre: "history",
        activationFlagValue: "shadow",
      })
    ).toEqual(
      expect.objectContaining({
        route: "V3_6_SHADOW",
        productionActivated: false,
      })
    );
    expect(
      resolveHistoryVisualPlanRouteV36({
        genre: "history",
        activationFlagValue: "production",
      }).route
    ).toBe("V3_5_PRODUCTION");
  });
});
