import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { semanticImagePromptHash, type SemanticImagePromptBriefV1 } from "@mediaforge/shared";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import {
  HISTORY_SEMANTIC_ANTI_DRIFT_RULES,
  HISTORY_SEMANTIC_VISUAL_DIRECTION_VERSION,
  assembleHistorySemanticImagePrompts,
  buildHistorySemanticImagePromptPlanInput,
  deriveHistorySemanticImagePromptBrief,
  validateHistorySemanticImagePromptBrief,
} from "./history-semantic-image-prompt-v1.js";

function historyPlan(input: {
  episodeId: string;
  narration: string;
  subject: string;
  action: string;
  purpose: string;
  modality?: HistoryVisualPlanV35["beats"][number]["modality"];
  period?: string;
  place?: string;
  prohibited?: string[];
  figure?: { canonicalPersonId: string; canonicalName: string; referenceAssetId: string };
}): HistoryVisualPlanV35 {
  const modality = input.modality ?? "restrained atmospheric reconstruction";
  const claimId = "claim-1";
  const entityId = input.place ? "entity-place-1" : input.figure ? "entity-person-1" : "entity-1";
  const temporal = input.period
    ? [
        {
          id: "time-1",
          claimId,
          kind: "period" as const,
          normalizedValue: input.period,
          verbatimText: input.period,
          span: { startUtf16: 0, endUtf16Exclusive: input.period.length },
        },
      ]
    : [];
  const entities = [
    ...(input.place
      ? [
          {
            id: entityId,
            claimId,
            text: input.place,
            normalizedLabel: input.place,
            entityType: "place" as const,
            semanticRole: "location" as const,
            narrationSpan: { startUtf16: 0, endUtf16Exclusive: input.narration.length },
            confidenceSource: "editorial" as const,
          },
        ]
      : []),
    ...(input.figure
      ? [
          {
            id: "entity-person-1",
            claimId,
            text: input.figure.canonicalName,
            normalizedLabel: input.figure.canonicalName,
            entityType: "person" as const,
            semanticRole: "actor" as const,
            narrationSpan: { startUtf16: 0, endUtf16Exclusive: input.narration.length },
            confidenceSource: "editorial" as const,
          },
        ]
      : []),
  ];
  return {
    schemaVersion: "history-visual-plan.v3.5",
    plannerVersion: "history-visual-planner.v3.5.0",
    episodeId: input.episodeId,
    title: input.episodeId,
    sourceAuthorityMode: "trusted-script",
    trustSnapshotHash: semanticImagePromptHash(input.narration),
    trustApproval: {} as HistoryVisualPlanV35["trustApproval"],
    narration: { normalizedText: input.narration } as HistoryVisualPlanV35["narration"],
    durationPolicy: {} as HistoryVisualPlanV35["durationPolicy"],
    timing: {} as HistoryVisualPlanV35["timing"],
    claims: [
      {
        id: claimId,
        episodeId: input.episodeId,
        narrationUnitIds: ["unit-1"],
        narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: input.narration.length }],
        verbatimTexts: [input.narration],
        normalizedProposition: input.narration,
        claimKind: "event",
        materiality: "material",
        entityMentionIds: entities.map((entity) => entity.id),
        temporalQualifierIds: temporal.map((item) => item.id),
        geographicQualifierIds: input.place ? ["geo-1"] : [],
        quantitativeQualifierIds: [],
        uncertaintyMarkers: [],
        authorityMode: "trusted-script",
        provenanceStatus: "trusted_input",
        trustAttestationId: "attestation-1",
        independentlyVerified: false,
        schemaVersion: "history-claim.v3.4",
      },
    ],
    entities,
    rejectedEntities: [],
    temporalQualifiers: temporal,
    geographicQualifiers: input.place
      ? [{ id: "geo-1", claimId, entityMentionId: entityId, role: "location" }]
      : [],
    quantitativeQualifiers: [],
    places: [],
    visualConcepts: [
      {
        id: "concept-1",
        beatId: "beat-1",
        modality,
        historicalSubject: input.subject,
        approximatePeriod: input.period ?? null,
        settingGeography: input.place ?? null,
        evidenceSourceClass: "trusted canonical narration",
        intendedComposition: "foreground cause with visible consequence in depth",
        protectedFactualRelation: input.purpose,
        uncertaintyLimits: ["do not broaden the approved claim"],
        forbiddenAnachronisms: input.prohibited ?? [],
        fingerprint: semanticImagePromptHash(input.purpose),
      },
    ],
    visualPurposes: [],
    beats: [
      {
        id: "beat-1",
        narrationUnitIds: ["unit-1"],
        narrationSpan: { startUtf16: 0, endUtf16Exclusive: input.narration.length },
        startMs: 0,
        endMs: 5_000,
        linkedClaimIds: [claimId],
        visualPurposeId: "purpose-1",
        modality,
        assetIntentId: "asset-intent-1",
        mapMasterId: modality === "map" ? "map-master-1" : null,
        mapStateId: modality === "map" ? "map-state-1" : null,
        diagramMasterId: modality === "diagram" ? "diagram-master-1" : null,
        diagramStateId: modality === "diagram" ? "diagram-state-1" : null,
        timelineMasterId: null,
        timelineStateId: null,
        dateCardStateId: null,
        documentStateId: null,
        shotIds: ["shot-1"],
        transition: "cut",
        continuityNotes: "preserve approved context",
        uncertaintyTreatment: "omit unsupported detail",
        aspectRatioPlanIds: [],
      },
    ],
    shots: [
      {
        id: "shot-1",
        beatId: "beat-1",
        purpose: input.purpose,
        durationMs: 5_000,
        startMs: 0,
        endMs: 5_000,
        framing: "40mm documentary wide",
        cameraMovement: "slow evidence reveal",
        subject: input.subject,
        action: input.action,
        foreground: "approved material evidence",
        midground: "actor consequence",
        background: input.place ?? "approved historical environment",
        factualLabels: [],
        permittedMotion: ["slow push"],
        prohibitedAdditions: input.prohibited ?? [],
        transition: "cut",
        linkedClaimIds: [claimId],
        modalityStateReference:
          modality === "map"
            ? "map-state-1"
            : modality === "diagram"
              ? "diagram-state-1"
              : null,
        adaptation16x9: "approved wide composition",
        adaptation9x16: "approved portrait reflow",
        reconstructionPolicy:
          modality === "map" || modality === "diagram"
            ? "map-or-diagram"
            : "historically-constrained-reconstruction",
      },
    ],
    assetIntents: [],
    mediaDecisions: [],
    mapMasters:
      modality === "map"
        ? [{ id: "map-master-1", purpose: input.purpose, mapPurpose: "location", supportedRatios: ["16:9", "9:16"] }]
        : [],
    mapStates:
      modality === "map"
        ? [
            {
              id: "map-state-1",
              masterId: "map-master-1",
              purpose: input.purpose,
              mapPurpose: "location",
              baseGeography: input.place ?? "approved geography",
              timePeriod: input.period ?? "approved period",
              affectedArea: input.place ?? "approved geography",
              labels: [],
              routes: [],
              uncertainty: "none",
              semanticStatus: "valid",
              blockerCodes: [],
            },
          ]
        : [],
    diagramMasters:
      modality === "diagram"
        ? [{ id: "diagram-master-1", diagramType: "causal-chain", exactQuestion: input.purpose, supportedRatios: ["16:9", "9:16"] }]
        : [],
    diagramStates:
      modality === "diagram"
        ? [
            {
              id: "diagram-state-1",
              masterId: "diagram-master-1",
              diagramType: "causal-chain",
              exactQuestion: input.purpose,
              nodes: [],
              edges: [],
              semanticStatus: "valid",
              blockerCodes: [],
              fallbackDecision: null,
            },
          ]
        : [],
    timelineMasters: [],
    timelineStates: [],
    timelineEvents: [],
    dateCardStates: [],
    documentStates: [],
    aspectRatioPlans: [],
    qualityMetrics: {} as HistoryVisualPlanV35["qualityMetrics"],
    visualOpportunities: [],
    visualOpportunitySummary: {} as HistoryVisualPlanV35["visualOpportunitySummary"],
    historicalPersonReferences: {
      usages: input.figure
        ? [
            {
              shotId: "shot-1",
              beatId: "beat-1",
              entityMentionId: "entity-person-1",
              canonicalPersonId: input.figure.canonicalPersonId,
              canonicalName: input.figure.canonicalName,
              likenessPolicy: "reference-required",
              selectedReferenceAssetIds: [input.figure.referenceAssetId],
              attachmentStatus: "attached",
              reason: "approved named-figure reference",
            },
          ]
        : [],
      resolvedPersonCount: input.figure ? 1 : 0,
      attachedReferenceCount: input.figure ? 1 : 0,
    },
    diagnostics: [],
    approval: {} as HistoryVisualPlanV35["approval"],
    planHash: semanticImagePromptHash({ episodeId: input.episodeId, narration: input.narration }),
  };
}

function brief(input: ReturnType<typeof buildHistorySemanticImagePromptPlanInput>, semantics: {
  spokenMeaning: string;
  viewerTakeaway: string;
  mustShow: string[];
  actionIntent: string;
  relationship?: "event" | "movement" | "cause-effect" | "spatial";
}): SemanticImagePromptBriefV1 {
  const approved = input.assets[0]!;
  return {
    schemaVersion: 1,
    genre: "history",
    contentId: input.contentId,
    sourceSemanticHash: input.sourceSemanticHash,
    visualPlanHash: input.visualPlanHash,
    contentThesis: semantics.spokenMeaning,
    viewerPromise: semantics.viewerTakeaway,
    visualDirection: {
      coreStoryLogic: semantics.spokenMeaning,
      emotionalArc: "evidence to consequence",
      realismLevel: "fact-bound documentary",
      overallVisualLanguage: ["approved event-specific documentary visuals"],
      forbiddenDrift: [...HISTORY_SEMANTIC_ANTI_DRIFT_RULES],
    },
    assets: [
      {
        assetId: approved.assetId,
        beatId: approved.beatId,
        narrativePurpose: approved.approved.narrativePurpose as "event",
        spokenMeaning: semantics.spokenMeaning,
        viewerTakeaway: semantics.viewerTakeaway,
        instantRead: semantics.viewerTakeaway,
        visualRelationship: semantics.relationship ?? "event",
        mustShow: semantics.mustShow,
        mustNotShow: ["unsupported event detail"],
        subjectRoles: [approved.approved.subject],
        environmentIntent: approved.approved.environment,
        actionIntent: semantics.actionIntent,
        objectIntent: approved.approved.props,
        conceptualComposition: approved.approved.composition,
        relevanceAnchors: semantics.mustShow,
        genericDriftRisks: ["generic historical mood"],
        generationBasePrompt: `${semantics.spokenMeaning} ${semantics.actionIntent}`,
        historyContext: approved.historyContext,
      },
    ],
    genreContext: input.genreContext,
  };
}

const fixtures = {
  napoleon: historyPlan({
    episodeId: "history-youtube-history-02-napoleons-invasion-of-russia",
    narration: "During the 1812 retreat, the army's supply and logistics system collapsed near the Berezina River.",
    subject: "retreating army and failing supply column",
    action: "abandoned wagons visibly break the logistics chain during retreat",
    purpose: "show supply collapse as a physical cause of retreat failure",
    period: "1812",
    place: "Berezina River",
    prohibited: ["motor vehicles"],
    figure: {
      canonicalPersonId: "napoleon-bonaparte",
      canonicalName: "Napoleon Bonaparte",
      referenceAssetId: "napoleon-reference-1",
    },
  }),
  blackDeath: historyPlan({
    episodeId: "history-youtube-history-04-black-death",
    narration: "Authorities imposed an approved quarantine policy response to limit contact.",
    subject: "port authority enforcing quarantine separation",
    action: "officials visibly separate arriving travelers from the community",
    purpose: "show institutional quarantine policy and its social consequence",
    modality: "diagram",
    period: "fourteenth century",
    prohibited: ["electrical lighting"],
  }),
  franklin: historyPlan({
    episodeId: "history-youtube-history-05-franklin-expedition",
    narration: "The expedition became isolated as the ship remained trapped and supplies failed in the Arctic.",
    subject: "trapped expedition ship and visibly dwindling supply system",
    action: "crew confront isolation while the supply chain physically runs out",
    purpose: "show trapped ship, environmental isolation, and supply failure as one relation",
    period: "1845",
    place: "Arctic",
    prohibited: ["modern icebreaker"],
  }),
};

describe("History semantic image-prompt adapter", () => {
  it.each([
    [fixtures.napoleon, "collapsing logistics during retreat", ["abandoned supply wagons", "broken logistics chain"]],
    [fixtures.blackDeath, "quarantine as an institutional policy response", ["authority enforcing separation", "visible social consequence"]],
    [fixtures.franklin, "ship entrapment causes isolation and supply failure", ["trapped ship", "failing supplies"]],
  ] as const)("grounds an existing History fixture without generic documentary drift", (plan, meaning, anchors) => {
    const normalized = buildHistorySemanticImagePromptPlanInput(plan);
    const output = brief(normalized, {
      spokenMeaning: meaning,
      viewerTakeaway: meaning,
      mustShow: [...anchors],
      actionIntent: plan.shots[0]!.action,
      relationship: "cause-effect",
    });
    expect(validateHistorySemanticImagePromptBrief({ brief: output, plan: normalized })).toEqual([]);
    const prompt = assembleHistorySemanticImagePrompts({ plan, brief: output })[0]!.prompt;
    expect(prompt).toContain(plan.shots[0]!.action);
    expect(prompt).toContain(plan.shots[0]!.framing);
    expect(prompt).toContain(plan.visualConcepts[0]!.intendedComposition);
    expect(prompt).toContain("persisted History camera/image visual direction");
  });

  it("performs one cached semantic call in trusted-script mode and exposes no research hooks", async () => {
    const plan = fixtures.napoleon;
    const normalized = buildHistorySemanticImagePromptPlanInput(plan);
    const output = brief(normalized, {
      spokenMeaning: "collapsing logistics during retreat",
      viewerTakeaway: "the supply system visibly fails",
      mustShow: ["broken supply chain", "retreat"],
      actionIntent: plan.shots[0]!.action,
      relationship: "cause-effect",
    });
    const create = vi.fn(async () => ({ id: "history-fixture", output_text: JSON.stringify(output) }));
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "history-semantic-"));
    const request = {
      episodeDir,
      plan,
      client: { responses: { create } },
      model: "configured-planning-model",
    } as const;
    await deriveHistorySemanticImagePromptBrief(request);
    await deriveHistorySemanticImagePromptBrief(request);
    expect(create).toHaveBeenCalledTimes(1);
    expect(plan.sourceAuthorityMode).toBe("trusted-script");
    expect(Object.keys(request)).not.toEqual(
      expect.arrayContaining(["researchProvider", "claimExtractionProvider", "webProvider", "imageProvider"]),
    );
  });

  it("preserves map/diagram state and existing named-figure reference gating", () => {
    const mapPlan = historyPlan({
      episodeId: "history-youtube-history-map-fixture",
      narration: "The approved map locates the Berezina River.",
      subject: "approved location map",
      action: "emphasize the approved event location",
      purpose: "event location",
      modality: "map",
      place: "Berezina River",
      period: "1812",
    });
    const before = semanticImagePromptHash(mapPlan.mapStates);
    const normalized = buildHistorySemanticImagePromptPlanInput(mapPlan);
    const output = brief(normalized, {
      spokenMeaning: "locate the approved event at the Berezina River",
      viewerTakeaway: "where the event occurred",
      mustShow: ["approved Berezina River location"],
      actionIntent: "emphasize the approved location without changing geometry",
      relationship: "spatial",
    });
    const prompt = assembleHistorySemanticImagePrompts({ plan: mapPlan, brief: output })[0]!.prompt;
    expect(prompt).toContain("preserve state IDs map-state-1");
    expect(semanticImagePromptHash(mapPlan.mapStates)).toBe(before);

    const named = buildHistorySemanticImagePromptPlanInput(fixtures.napoleon).assets[0]!
      .historyContext;
    const unnamed = buildHistorySemanticImagePromptPlanInput(fixtures.franklin).assets[0]!
      .historyContext;
    expect(named?.historicalFigures?.[0]).toMatchObject({
      canonicalName: "Napoleon Bonaparte",
      referenceEligible: true,
      referenceAssetId: "napoleon-reference-1",
    });
    expect(unnamed?.historicalFigures).toBeUndefined();
  });

  it("blocks unsupported chronology, anachronisms, generic imagery, and map mutation", () => {
    const plan = historyPlan({
      episodeId: "history-youtube-history-map-invalid",
      narration: "In 1812 the approved map locates the Berezina River.",
      subject: "approved event location",
      action: "show the approved location",
      purpose: "event location",
      modality: "map",
      period: "1812",
      place: "Berezina River",
      prohibited: ["motor vehicles"],
    });
    const normalized = buildHistorySemanticImagePromptPlanInput(plan);
    const output = brief(normalized, {
      spokenMeaning: "dramatic generic historical battlefield in 1945",
      viewerTakeaway: "historical mood",
      mustShow: ["motor vehicles", "generic soldiers"],
      actionIntent: "draw an arrow and add a route from invented coordinates",
      relationship: "event",
    });
    const codes = validateHistorySemanticImagePromptBrief({ brief: output, plan: normalized }).map(
      (finding) => finding.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
        "HISTORY_SEMANTIC_PROMPT_CHRONOLOGY_CONFLICT",
        "HISTORY_SEMANTIC_PROMPT_ANACHRONISM",
        "HISTORY_SEMANTIC_PROMPT_MAP_MUTATION",
      ]),
    );
  });
});
