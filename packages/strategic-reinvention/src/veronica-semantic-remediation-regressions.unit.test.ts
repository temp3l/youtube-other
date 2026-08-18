import { describe, expect, it } from "vitest";
import {
  deriveVeronicaNarrativeFunction,
  deriveVeronicaLongStateRoles,
  validateVeronicaUnifiedV3Portfolio,
  validateVeronicaUnifiedV3SemanticPlan,
  validateVeronicaPersonaReviewEvidence,
  type VeronicaSemanticSceneV3,
  type VeronicaUnifiedV3SemanticPlan,
} from "./veronica-unified-v3-semantic-plan.js";

function scene(input: {
  readonly id: string;
  readonly copied?: boolean;
  readonly identity?: string | null;
  readonly mode?: VeronicaSemanticSceneV3["subject"]["mode"];
  readonly evidence?: string;
}): VeronicaSemanticSceneV3 {
  const proposition = "A return reduces retained margin after shipping costs";
  const depiction = input.copied
    ? proposition
    : "On a returns bench, an opened parcel sits beside a refund receipt while retained-value tokens move into a smaller tray";
  const mode = input.mode ?? "character-led";
  return {
    sceneId: input.id,
    narrationSpan: { text: proposition, startOffset: 0, endOffset: proposition.length, sourceHash: `source-${input.id}` },
    narrativeFunction: "mechanism",
    communicationIntent: "explain-causality",
    proposition,
    visualIntent: "show the physical cost path of a return",
    depiction: {
      description: depiction,
      primarySubject: "opened returned parcel",
      primaryAction: "moves retained-value tokens into a smaller tray",
      concreteObjects: ["opened returned parcel", "refund receipt beside a shipping label"],
      environment: "compact returns inspection bench",
      spatialRelationship: "parcel dominates the foreground while the smaller retained-value tray recedes behind it",
      semanticFocus: "the sale does not equal the value retained",
    },
    visualizableClaim: depiction,
    continuityGroup: `story-${mode}`,
    subject: {
      mode,
      primaryIdentityId: mode === "character-led" ? (input.identity ?? "story-owner") : null,
      supportingIdentityIds: [],
      subjectRole: mode === "character-led" ? "business-operator" : "none",
    },
    evidenceNeed: { required: true, objectPhrase: input.evidence ?? "opened returned parcel", sourceHash: `source-${input.id}` },
    transitionRelationship: "explains",
    treatment: {
      strategy: "evidence-proof",
      environment: "compact returns inspection bench",
      composition: "proof remains connected to its operational consequence",
      camera: "70mm evidence-in-context detail",
    },
    assetId: `${input.id}-asset`,
    visualStateId: `${input.id}-asset-state-01`,
    multiStateAsset: null,
  };
}

function plan(input: {
  readonly id: string;
  readonly scenes?: readonly VeronicaSemanticSceneV3[];
  readonly thumbnail?: string;
}): Omit<VeronicaUnifiedV3SemanticPlan, "validation" | "planHash"> {
  const scenes = input.scenes ?? [scene({ id: `${input.id}-s1` })];
  const visualStates = scenes.map((entry, index) => ({
    visualStateId: entry.visualStateId,
    assetId: entry.assetId,
    sceneId: entry.sceneId,
    startMs: index * 10_000,
    durationMs: 10_000,
    semanticClaimHash: `claim-${entry.sceneId}`,
    explicitMultiStateAsset: false,
    stateRole: "single" as const,
    cropFocus: "full vertical frame",
    semanticPurpose: entry.visualIntent,
    crop: null,
  }));
  const assets = scenes.map((entry) => ({
    assetId: entry.assetId,
    sceneId: entry.sceneId,
    prompt: `Text-free evidence image. Depict ${entry.depiction.description}. ${entry.subject.primaryIdentityId ? `Identity continuity key ${entry.subject.primaryIdentityId}.` : ""}`,
    promptHash: `prompt-${entry.sceneId}`,
    textFree: true as const,
    multiState: null,
  }));
  const visualEvents = visualStates.map((entry) => ({
    eventId: `${entry.sceneId}-event`, sceneId: entry.sceneId, assetId: entry.assetId,
    visualStateId: entry.visualStateId, kind: "evidence-emphasis" as const,
    startMs: entry.startMs, durationMs: entry.durationMs,
  }));
  return {
    schemaVersion: "veronica-unified-v3-semantic-plan.v3",
    plannerVersion: "veronica-unified-v3-semantic-planner.v2",
    contentId: input.id,
    format: "short",
    canonicalSourceHash: `canonical-${input.id}`,
    legacyPlanHash: `legacy-${input.id}`,
    sourceNarrationHash: `narration-${input.id}`,
    visualDirectionHash: `direction-${input.id}`,
    subjectPlan: { mode: "mixed", primaryIdentityId: "story-owner", supportingIdentityIds: [], subjectRole: "business-operator" },
    scenes, visualStates, assets, visualEvents,
    thumbnail: {
      centralContradiction: input.thumbnail ?? "A returned package exposes the margin that revenue hides",
      primaryObjectOrPerson: "opened returned package beside a refund receipt",
      visibleActionOrState: "retained-value tokens leave the sales tray after the parcel returns",
      tension: "a visible sale can still destroy retained value",
      composition: "returned parcel in foreground, shrinking value tray behind",
      titleRelationship: "thumbnail visualizes the consequence or contradiction; title supplies the claim",
      authoredTitleRelationship: "image shows the cost while title names the revenue trap",
      distinctFromNeighboringEpisodes: "Unlike the pricing story, this image centers a physical return and disappearing retained value after a completed sale.",
      sourceHash: `thumb-${input.id}`,
    },
    cadence: {
      motionEventCount: visualEvents.length,
      baseVisualStateCount: scenes.length,
      semanticNoveltyCount: visualStates.length,
      longestBaseVisualStateHoldMs: 10_000,
      semanticStateCount: visualStates.length,
      longestSemanticStateHoldMs: 10_000,
      longestUnchangedSemanticRegionMs: 10_000,
      trueMultiStateAssetCount: 0,
      paidBaseAssetCount: assets.length,
    },
  };
}

describe("Veronica unified V3 visual-direction regressions", () => {
  it("blocks narration copied into the depiction field", () => {
    const fixture = plan({ id: "copied", scenes: [scene({ id: "copied-s1", copied: true })] });
    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(expect.objectContaining({ code: "PROPOSITION_COPY_IS_NOT_VISUAL_TRANSLATION" }));
  });

  it("blocks a character identity that is dead metadata", () => {
    const fixture = plan({ id: "continuity" });
    const assets = fixture.assets.map((asset) => ({ ...asset, prompt: "Text-free returned package on a bench." }));
    expect(validateVeronicaUnifiedV3SemanticPlan({ ...fixture, assets })).toContainEqual(expect.objectContaining({ code: "CHARACTER_CONTINUITY_NOT_COMPILED" }));
  });

  it("blocks generic evidence placeholders", () => {
    const fixture = plan({ id: "evidence", scenes: [scene({ id: "evidence-s1", mode: "evidence-led", evidence: "product" })] });
    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(expect.objectContaining({ code: "WEAK_EVIDENCE_OBJECT" }));
  });

  it("derives Short narrative functions from content signals", () => {
    const signature = (spans: readonly string[]) => spans.map((span, index) => deriveVeronicaNarrativeFunction({ span, index, count: spans.length })).join(",");
    expect(signature(["Why does margin disappear?", "Each return adds shipping cost.", "Start by measuring the returned package."]))
      .not.toEqual(signature(["Everyone is not your customer.", "For example, a specialist buyer recognizes one need.", "The result is a clearer decision."]));
  });

  it("measures full visual tuples and adjacent tuple patterns", () => {
    const plans = Array.from({ length: 8 }, (_, index) => ({ ...plan({ id: `repeat-${index}`, thumbnail: "Same return-cost contradiction" }), validation: { status: "pass" as const, findings: [] }, planHash: `hash-${index}` }));
    const validation = validateVeronicaUnifiedV3Portfolio(plans);
    expect(validation.distributions.tuple?.[0]?.count).toBe(8);
    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PORTFOLIO_TUPLE_CONCENTRATION" }),
      expect.objectContaining({ code: "THUMBNAIL_CONCEPT_DUPLICATION" }),
    ]));
  });

  it("blocks unrelated recurring-identity churn", () => {
    const fixture = plan({ id: "churn", scenes: [scene({ id: "s1", identity: "architect" }), scene({ id: "s2", identity: "chef" })] });
    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(expect.objectContaining({ code: "UNJUSTIFIED_SUBJECT_CHURN" }));
  });

  it("rejects hash-only thumbnail differentiation", () => {
    const fixture = plan({ id: "thumbnail" });
    expect(validateVeronicaUnifiedV3SemanticPlan({ ...fixture, thumbnail: { ...fixture.thumbnail, distinctFromNeighboringEpisodes: "source claim 70c39885c16d" } }))
      .toContainEqual(expect.objectContaining({ code: "THUMBNAIL_NEIGHBOR_DISTINCTION_NOT_EDITORIAL" }));
  });

  it("detects normalized A/B environment alternation and fixed intent breakpoints", () => {
    const patterned = Array.from({ length: 8 }, (_, planIndex) => {
      const scenes = Array.from({ length: 8 }, (_, index) => {
        const base = scene({ id: `alternating-${planIndex}-${index}`, mode: "object-led" });
        return { ...base, visualIntent: index < 3 ? "problem" : index < 6 ? "mechanism" : "payoff", depiction: { ...base.depiction, environment: index % 2 ? `desk-${planIndex}` : `bench-${planIndex}` } };
      });
      return { ...plan({ id: `alternating-${planIndex}`, scenes }), validation: { status: "pass" as const, findings: [] }, planHash: `hash-${planIndex}` };
    });
    const validation = validateVeronicaUnifiedV3Portfolio(patterned);
    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ENVIRONMENT_SEQUENCE_TEMPLATE_CONCENTRATION" }),
      expect.objectContaining({ code: "VISUAL_INTENT_BREAKPOINT_TEMPLATE_CONCENTRATION" }),
    ]));
  });

  it("detects ABC and ABCD subject cycles plus generic action shells", () => {
    const patterned = Array.from({ length: 8 }, (_, planIndex) => {
      const scenes = Array.from({ length: 8 }, (_, index) => {
        const base = scene({ id: `cycle-${planIndex}-${index}`, mode: "object-led" });
        const subject = ["invoice", "parcel", "receipt", "calendar"][index % (planIndex % 2 ? 4 : 3)]!;
        return { ...base, depiction: { ...base.depiction, primarySubject: subject, primaryAction: `${subject} moves through ordered work stages from input to a visibly changed outcome` } };
      });
      return { ...plan({ id: `cycle-${planIndex}`, scenes }), validation: { status: "pass" as const, findings: [] }, planHash: `hash-${planIndex}` };
    });
    const validation = validateVeronicaUnifiedV3Portfolio(patterned);
    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SUBJECT_SEQUENCE_CYCLE" }),
      expect.objectContaining({ code: "PRIMARY_ACTION_SHELL_CONCENTRATION" }),
    ]));
  });

  it("detects uniform multi-state and motion structures", () => {
    const patterned = Array.from({ length: 8 }, (_, planIndex) => {
      const base = plan({ id: `long-${planIndex}` });
      const states = ["establishing", "evidence-detail", "consequence"].map((stateRole, index) => ({
        ...base.visualStates[0]!, visualStateId: `long-${planIndex}-${index}`, stateRole, cropFocus: `${stateRole} crop`, crop: { x: index * 0.1, y: index * 0.1, width: 0.7, height: 0.7, focalObject: "returned parcel" }, semanticPurpose: stateRole,
      }));
      const asset = { ...base.assets[0]!, multiState: { assetLevelDepiction: "returned parcel", spatialLayout: "each proof object is visible", safeFraming: "crop-safe", states: states.map((state) => ({ stateRole: state.stateRole, cropFocus: state.cropFocus, semanticPurpose: state.semanticPurpose, crop: state.crop! })) } };
      return { ...base, format: "long" as const, visualStates: states, assets: [asset], visualEvents: states.map((state) => ({ eventId: `${state.visualStateId}-event`, sceneId: state.sceneId, assetId: state.assetId, visualStateId: state.visualStateId, kind: state.stateRole === "establishing" ? "establish" as const : state.stateRole === "evidence-detail" ? "detail-crop" as const : "consequence-reveal" as const, startMs: state.startMs, durationMs: state.durationMs })), validation: { status: "pass" as const, findings: [] }, planHash: `long-hash-${planIndex}` };
    });
    const validation = validateVeronicaUnifiedV3Portfolio(patterned);
    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SEMANTIC_STATE_ROLE_SEQUENCE_CONCENTRATION" }),
      expect.objectContaining({ code: "MOTION_SEQUENCE_CONCENTRATION" }),
    ]));
  });

  it("rejects invalid multi-state crop geometry", () => {
    const base = plan({ id: "crop" });
    const state = { ...base.visualStates[0]!, crop: { x: 0.6, y: 0, width: 0.6, height: 0.4, focalObject: "" } };
    const asset = { ...base.assets[0]!, prompt: "crop-safe multi-state", multiState: { assetLevelDepiction: "parcel", spatialLayout: "parcel", safeFraming: "crop-safe", states: [{ stateRole: "detail", cropFocus: "detail", semanticPurpose: "detail", crop: state.crop }] } };
    const fixture = { ...base, format: "long" as const, visualStates: [state], assets: [asset] };
    expect(validateVeronicaUnifiedV3SemanticPlan(fixture)).toContainEqual(expect.objectContaining({ code: "MULTISTATE_CROP_INVALID" }));
  });

  it("does not present identical persona scores as independent review evidence", () => {
    const findings = validateVeronicaPersonaReviewEvidence(Array.from({ length: 54 }, (_, index) => ({ storyId: `review-${index}`, scores: { grounding: 9.7, continuity: 9.7 } })));
    expect(findings).toContainEqual(expect.objectContaining({ code: "PERSONA_SCORE_DEGENERACY" }));
  });

  it("gives long hook and contrast scenes a narration-grounded middle state rather than a timing filler", () => {
    const deliveryHook = deriveVeronicaLongStateRoles({ narrativeFunction: "hook", narrationSpan: "A returned parcel stalls at the shipping handoff before the customer sees the cost." });
    const buyerContrast = deriveVeronicaLongStateRoles({ narrativeFunction: "contrast", narrationSpan: "A buyer chooses the precise offer instead of the broad package." });
    const setup = deriveVeronicaLongStateRoles({ narrativeFunction: "setup", narrationSpan: "The calendar exposes a time trade-off before the new process begins." });
    expect(deliveryHook).toEqual(["initial-tension", "handoff", "stakes"]);
    expect(buyerContrast).toEqual(["option-a", "selection-criterion", "option-b"]);
    expect(setup).toEqual(["orientation", "trade-off", "relevance"]);
    expect(new Set([...deliveryHook, ...buyerContrast]).size).toBe(6);
  });
});
