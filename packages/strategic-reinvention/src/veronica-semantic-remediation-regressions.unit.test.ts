import { describe, expect, it } from "vitest";
import {
  deriveVeronicaNarrativeFunction,
  deriveVeronicaSourceSpanProposition,
  validateVeronicaUnifiedV3Portfolio,
  validateVeronicaUnifiedV3SemanticPlan,
  type VeronicaSemanticAssetV3,
  type VeronicaSemanticEventV3,
  type VeronicaSemanticSceneV3,
  type VeronicaUnifiedV3SemanticPlan,
  type VeronicaVisualStateV3,
} from "./veronica-unified-v3-semantic-plan.js";

function scene(input: {
  readonly id: string;
  readonly proposition?: string;
  readonly identity?: string | null;
  readonly treatment?: string;
}): VeronicaSemanticSceneV3 {
  const proposition =
    input.proposition ?? "A shipping box reveals the cost of each return";
  return {
    sceneId: input.id,
    narrationSpan: {
      text: proposition,
      startOffset: 0,
      endOffset: proposition.length,
      sourceHash: `source-${input.id}`,
    },
    narrativeFunction: "mechanism",
    communicationIntent: "explain-causality",
    proposition,
    visualizableClaim: proposition,
    continuityGroup: "story-character-led",
    subject: {
      mode: "character-led",
      primaryIdentityId: input.identity ?? "story-owner",
      supportingIdentityIds: [],
      subjectRole: "business-operator",
    },
    evidenceNeed: {
      required: true,
      objectPhrase: "shipping box",
      sourceHash: `source-${input.id}`,
    },
    transitionRelationship: "explains",
    treatment: {
      strategy: input.treatment ?? "product-object-still-life",
      environment: "operational decision table",
      composition: "physical inputs and consequence remain legible together",
      camera: "50mm editorial object view",
    },
    assetId: `${input.id}-asset`,
    visualStateId: `${input.id}-state`,
  };
}

function plan(input: {
  readonly id: string;
  readonly scenes?: readonly VeronicaSemanticSceneV3[];
  readonly assets?: readonly VeronicaSemanticAssetV3[];
  readonly states?: readonly VeronicaVisualStateV3[];
  readonly events?: readonly VeronicaSemanticEventV3[];
  readonly thumbnail?: string;
}): Omit<VeronicaUnifiedV3SemanticPlan, "validation" | "planHash"> {
  const scenes = input.scenes ?? [scene({ id: `${input.id}-s1` })];
  const states =
    input.states ??
    scenes.map((entry) => ({
      visualStateId: entry.visualStateId,
      assetId: entry.assetId,
      sceneId: entry.sceneId,
      startMs: 0,
      durationMs: 10_000,
      semanticClaimHash: `claim-${entry.sceneId}`,
      explicitMultiStateAsset: false as const,
    }));
  const assets =
    input.assets ??
    scenes.map((entry) => ({
      assetId: entry.assetId,
      sceneId: entry.sceneId,
      prompt:
        "Text-free editorial still. Concrete source-backed object: shipping box.",
      promptHash: `prompt-${entry.sceneId}`,
      textFree: true as const,
    }));
  const events =
    input.events ??
    states.map((entry) => ({
      eventId: `${entry.sceneId}-event`,
      sceneId: entry.sceneId,
      assetId: entry.assetId,
      visualStateId: entry.visualStateId,
      kind: "establishing-crop" as const,
      startMs: entry.startMs,
      durationMs: entry.durationMs,
    }));
  return {
    schemaVersion: "veronica-unified-v3-semantic-plan.v3",
    plannerVersion: "veronica-unified-v3-semantic-planner.v1",
    contentId: input.id,
    format: "short",
    canonicalSourceHash: `canonical-${input.id}`,
    legacyPlanHash: `legacy-${input.id}`,
    sourceNarrationHash: `narration-${input.id}`,
    subjectPlan: scenes[0]!.subject,
    scenes,
    visualStates: states,
    assets,
    visualEvents: events,
    thumbnail: {
      centralContradiction:
        input.thumbnail ?? "A shipping box exposes the return-cost consequence",
      primaryObjectOrPerson: "shipping box",
      tension: "a return changes the retained margin",
      composition: "return package beside its cost consequence",
      titleRelationship:
        "thumbnail visualizes the consequence or contradiction; title supplies the claim",
      distinctFromNeighboringEpisodes: "return economics is source-specific",
      sourceHash: `thumb-${input.id}`,
    },
    cadence: {
      motionEventCount: events.length,
      baseVisualStateCount: states.length,
      semanticNoveltyCount: new Set(
        states.map((entry) => entry.semanticClaimHash)
      ).size,
      longestBaseVisualStateHoldMs: Math.max(
        ...states.map((entry) => entry.durationMs)
      ),
    },
  };
}

describe("Veronica unified V3 semantic remediation regressions", () => {
  it("keeps business-model propositions source-specific rather than projecting positioning boilerplate", () => {
    const proposition = deriveVeronicaSourceSpanProposition(
      "One sale moves through variable costs before a small retained remainder remains."
    );

    expect(proposition).toMatch(/sale|cost|remainder/iu);
    expect(proposition).not.toMatch(
      /understood and chosen|decorative restatement/iu
    );
  });

  it.each([
    "are evidence artifact",
    "can evidence artifact",
    "after evidence artifact",
    "isn evidence artifact",
  ])(
    "blocks malformed evidence fragment %s with its scene identity",
    (fragment) => {
      const fixture = plan({
        id: "invalid-evidence",
        assets: [
          {
            assetId: "invalid-evidence-s1-asset",
            sceneId: "invalid-evidence-s1",
            prompt: `Text-free still. ${fragment}.`,
            promptHash: "bad",
            textFree: true,
          },
        ],
      });

      expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(
        expect.objectContaining({
          code: "INVALID_EVIDENCE_FRAGMENT",
          sceneIds: ["invalid-evidence-s1"],
        })
      );
    }
  );

  it("derives Short functions from content signals rather than a fixed scene index template", () => {
    const business = [
      "Why does margin disappear?",
      "Each return adds shipping cost.",
      "Start by measuring the returned package.",
    ];
    const audience = [
      "Everyone is not your customer.",
      "For example, a specialist buyer recognizes one need.",
      "The result is a clearer decision.",
    ];
    const signature = (spans: readonly string[]) =>
      spans
        .map((span, index) =>
          deriveVeronicaNarrativeFunction({ span, index, count: spans.length })
        )
        .join(",");

    expect(signature(business)).not.toEqual(signature(audience));
  });

  it("reports portfolio concentration and duplicate thumbnail concepts", () => {
    const plans = Array.from({ length: 8 }, (_, index) => {
      const fixture = plan({
        id: `repeated-${index}`,
        thumbnail: "The same concrete return-cost contradiction",
      });
      return {
        ...fixture,
        validation: { status: "pass" as const, findings: [] },
        planHash: `hash-${index}`,
      };
    });
    const validation = validateVeronicaUnifiedV3Portfolio(plans);

    expect(validation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PORTFOLIO_TREATMENT_CONCENTRATION" }),
        expect.objectContaining({ code: "THUMBNAIL_CONCEPT_DUPLICATION" }),
      ])
    );
  });

  it("blocks unrelated subject churn without ensemble evidence", () => {
    const fixture = plan({
      id: "subject-churn",
      scenes: [
        scene({ id: "s1", identity: "architect" }),
        scene({ id: "s2", identity: "chef" }),
        scene({ id: "s3", identity: "surgeon" }),
      ],
    });

    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(
      expect.objectContaining({ code: "UNJUSTIFIED_SUBJECT_CHURN" })
    );
  });

  it("does not count repeated motion on one raster as new semantic visual information", () => {
    const fixture = plan({
      id: "one-raster",
      events: ["crop", "push", "reveal"].map((kind, index) => ({
        eventId: kind,
        sceneId: "one-raster-s1",
        assetId: "one-raster-s1-asset",
        visualStateId: "one-raster-s1-state",
        kind:
          index === 0
            ? ("establishing-crop" as const)
            : index === 1
              ? ("slow-push" as const)
              : ("reveal" as const),
        startMs: index * 3_000,
        durationMs: 3_000,
      })),
    });

    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(
      expect.objectContaining({ code: "SEMANTIC_STATE_NOVELTY_INSUFFICIENT" })
    );
  });

  it("requires thumbnail concepts to remain concrete and source-specific", () => {
    const thumbnail = plan({ id: "thumbnail" }).thumbnail.centralContradiction;
    expect(thumbnail).toMatch(/shipping box|return-cost/iu);
    expect(thumbnail).not.toMatch(/visible evidence trails|generic portrait/iu);
  });
});
