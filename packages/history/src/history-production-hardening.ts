import {
  hashProductionValue,
  runProductionHardeningDryRun,
  semanticTreatmentSchema,
  type ProductionHardeningDryRunResult,
  type ProductionVariant,
  type SemanticTreatment,
} from "@mediaforge/shared";

export const HISTORY_PRODUCTION_HARDENING_ADAPTER_VERSION =
  "history-production-hardening-adapter.v1" as const;

export interface HistoryHardeningSceneInput {
  readonly sceneId: string;
  readonly semanticPurpose: string;
  readonly visibleThesis: string;
  readonly primaryAction: string;
  readonly actionOwnerId: string;
  readonly actors: SemanticTreatment["requiredActors"];
  readonly environment: string;
  readonly composition: string;
  readonly stateComplexity: SemanticTreatment["stateComplexity"];
  readonly mapStateIds?: readonly string[];
  readonly diagramStateIds?: readonly string[];
  readonly visualInformationGain: string;
  readonly history: NonNullable<SemanticTreatment["history"]>;
  readonly viewerVisibleFamilies: SemanticTreatment["viewerVisibleFamilies"];
  readonly providerPrompt: string;
}

export function createHistoryHardeningTreatment(
  input: HistoryHardeningSceneInput,
): SemanticTreatment {
  const mapStateIds = [...(input.mapStateIds ?? [])];
  const diagramStateIds = [...(input.diagramStateIds ?? [])];
  const diagramRequirement =
    mapStateIds.length > 0
      ? { kind: "map" as const, stateIds: mapStateIds }
      : diagramStateIds.length > 0
        ? { kind: "diagram" as const, stateIds: diagramStateIds }
        : { kind: "none" as const, stateIds: [] };
  return semanticTreatmentSchema.parse({
    sceneId: input.sceneId,
    semanticPurpose: input.semanticPurpose,
    visibleThesis: input.visibleThesis,
    requiredActors: input.actors,
    primaryAction: input.primaryAction,
    actionOwnerId: input.actionOwnerId,
    supportingActorIds: input.actors
      .map((actor) => actor.actorId)
      .filter((actorId) => actorId !== input.actionOwnerId),
    environment: input.environment,
    composition: input.composition,
    evidenceRole: "trusted-script relation and approved map state",
    stateComplexity: input.stateComplexity,
    continuity: {
      mode: "persistent-causal-chain",
      identity: "1812-campaign",
      relation: "advance, strategic withdrawal, then attritional retreat",
      intentionalRepetition: true,
    },
    motif: {
      family: "campaign-route",
      description: "The Niemen-to-Moscow route tracks strategic distance and loss.",
      source: "trusted History episode geography",
      scope: "campaign progression",
      intentionalCoverage: [input.sceneId],
      reuseLimit: null,
    },
    diagramRequirement,
    visualInformationGain: input.visualInformationGain,
    viewerVisibleFamilies: input.viewerVisibleFamilies,
    providerActorIds: input.actors.map((actor) => actor.actorId),
    providerPrompt: input.providerPrompt,
    treatmentVersion: HISTORY_PRODUCTION_HARDENING_ADAPTER_VERSION,
    history: input.history,
  });
}

function historyFixtureTreatments(
  narrationHash: string,
): readonly SemanticTreatment[] {
  const trustedSemanticsHash = narrationHash;
  const napoleon = {
    actorId: "napoleon",
    role: "historical-person",
    identityMode: "resolved" as const,
    entityId: "history-person:napoleon-bonaparte",
    canonicalName: "Napoleon Bonaparte",
    faction: "French Empire",
    periodKey: "1812",
  };
  const grandeArmee = {
    actorId: "grande-armee",
    role: "army",
    identityMode: "resolved" as const,
    entityId: "history-force:grande-armee-1812",
    canonicalName: "Grande Armée",
    faction: "French Empire",
    periodKey: "1812",
  };
  const russianArmy = {
    actorId: "russian-army",
    role: "army",
    identityMode: "resolved" as const,
    entityId: "history-force:russian-army-1812",
    canonicalName: "Russian army",
    faction: "Russian Empire",
    periodKey: "1812",
  };
  return [
    createHistoryHardeningTreatment({
      sceneId: "history-1812-crossing",
      semanticPurpose: "campaign opening and logistical commitment",
      visibleThesis:
        "The multinational Grande Armée crosses into Russia and commits itself to a supply line that must stretch eastward.",
      primaryAction: "The Grande Armée crosses the Niemen under Napoleon's campaign order.",
      actionOwnerId: "grande-armee",
      actors: [grandeArmee, napoleon],
      environment: "Niemen River crossing in June 1812",
      composition: "army columns crossing while the supply train extends behind them",
      stateComplexity: "DECISIVE_TRANSITION_MOMENT",
      mapStateIds: ["niemEN-crossing-1812"],
      visualInformationGain: "The crossing makes the campaign's distance and supply dependency visible.",
      history: {
        periodKey: "1812",
        geographyIds: ["niemen-river", "russian-empire"],
        entityIds: ["history-force:grande-armee-1812", "history-person:napoleon-bonaparte"],
        factionIds: ["French Empire"],
        materialCultureKey: "napoleonic-army-1812",
        evidenceIds: ["trusted-script:opening-crossing"],
        trustedSemanticsHash,
      },
      viewerVisibleFamilies: {
        strategy: "map-and-human-scale",
        environment: "river-crossing",
        composition: "columns-and-supply-depth",
        camera: "documentary-wide",
        interaction: "army-crosses-border",
        dominantObject: "river-and-supply-wagons",
        motion: "route-begins",
        diagram: "campaign-map",
        motif: "campaign-route",
        continuityIdentity: "1812-campaign",
      },
      providerPrompt:
        "Napoleon's resolved 1812 Grande Armée crossing the Niemen, with the campaign route and long supply train preserved; do not substitute a generic army.",
    }),
    createHistoryHardeningTreatment({
      sceneId: "history-1812-russian-withdrawal",
      semanticPurpose: "strategic withdrawal trades geography for time",
      visibleThesis:
        "The Russian army withdraws instead of accepting destruction, preserving its force while the French route lengthens.",
      primaryAction: "The Russian army withdraws and denies Napoleon a decisive battle.",
      actionOwnerId: "russian-army",
      actors: [russianArmy, napoleon, grandeArmee],
      environment: "campaign route from the western frontier toward Smolensk and Moscow",
      composition: "sequential map states with Russian withdrawal and French advance kept distinct",
      stateComplexity: "MULTI_STATE_REQUIRED",
      mapStateIds: ["western-withdrawal", "smolensk-withdrawal", "moscow-approach"],
      visualInformationGain: "Map progression shows land traded for time without swapping attacker and defender.",
      history: {
        periodKey: "1812",
        geographyIds: ["smolensk", "moscow", "russian-empire"],
        entityIds: ["history-force:russian-army-1812", "history-force:grande-armee-1812"],
        factionIds: ["Russian Empire", "French Empire"],
        materialCultureKey: "napoleonic-armies-1812",
        evidenceIds: ["trusted-script:russian-strategic-withdrawal"],
        trustedSemanticsHash,
      },
      viewerVisibleFamilies: {
        strategy: "map-progression",
        environment: "continental-route",
        composition: "opposed-movement-arrows",
        camera: "orthographic-map",
        interaction: "withdrawal-versus-pursuit",
        dominantObject: "campaign-route",
        motion: "eastward-progression",
        diagram: "campaign-map",
        motif: "campaign-route",
        continuityIdentity: "1812-campaign",
      },
      providerPrompt:
        "Approved 1812 campaign map progression: the resolved Russian army withdraws east while Napoleon's resolved Grande Armée pursues; preserve factions and map-state geometry.",
    }),
    createHistoryHardeningTreatment({
      sceneId: "history-1812-retreat",
      semanticPurpose: "logistical failure becomes irreversible retreat",
      visibleThesis:
        "The weakened Grande Armée retreats along the devastated route, with cold intensifying losses that began through distance, hunger, disease, and failed logistics.",
      primaryAction: "The Grande Armée retreats west from Moscow along the depleted route.",
      actionOwnerId: "grande-armee",
      actors: [grandeArmee, russianArmy],
      environment: "retreat from Moscow toward the Berezina in late 1812",
      composition: "before-and-after force state tied to the westward route",
      stateComplexity: "MULTI_STATE_REQUIRED",
      mapStateIds: ["moscow-retreat", "berezina-crossing", "niemen-return"],
      visualInformationGain: "The sequence separates accumulated attrition from winter as the sole cause.",
      history: {
        periodKey: "1812",
        geographyIds: ["moscow", "berezina-river", "niemen-river"],
        entityIds: ["history-force:grande-armee-1812"],
        factionIds: ["French Empire", "Russian Empire"],
        materialCultureKey: "napoleonic-retreat-1812",
        evidenceIds: ["trusted-script:retreat-causality"],
        trustedSemanticsHash,
      },
      viewerVisibleFamilies: {
        strategy: "evidence-progression",
        environment: "winter-retreat-route",
        composition: "diminishing-column-sequence",
        camera: "map-to-ground-detail",
        interaction: "army-retreats-under-attrition",
        dominantObject: "abandoned-wagons",
        motion: "westward-retreat",
        diagram: "campaign-map",
        motif: "campaign-route",
        continuityIdentity: "1812-campaign",
      },
      providerPrompt:
        "Resolved Grande Armée retreating west on the approved 1812 route, materially accurate depleted force and abandoned equipment; show accumulated logistical attrition, not winter alone.",
    }),
  ];
}

export function runHistoryProductionHardeningFixture(input: {
  readonly fixtureId: string;
  readonly narrationHash: string;
  readonly variant: ProductionVariant;
  readonly selectedAudioDurationSeconds: number;
}): ProductionHardeningDryRunResult {
  const treatments = historyFixtureTreatments(input.narrationHash);
  const first = treatments[0]!.history!;
  const requested = {
    semanticPurpose: treatments[0]!.semanticPurpose,
    actorEntityIds: first.entityIds,
    periodKey: first.periodKey,
    factionIds: first.factionIds,
    geographyIds: first.geographyIds,
    materialCultureKey: first.materialCultureKey,
    environmentKey: treatments[0]!.environment,
    motifFamily: treatments[0]!.motif!.family,
    aspectRatios: ["16:9", "9:16"] as ("16:9" | "9:16")[],
    cropSafeAspectRatios: ["16:9", "9:16"] as ("16:9" | "9:16")[],
    generatedImageQa: "not-run" as const,
  };
  return runProductionHardeningDryRun({
    fixtureId: input.fixtureId,
    genre: "history",
    variant: input.variant,
    narrationHash: input.narrationHash,
    selectedAudioHash: hashProductionValue({
      fixtureId: input.fixtureId,
      variant: input.variant,
      source: "cached-fake-audio",
    }),
    selectedAudioDurationSeconds: input.selectedAudioDurationSeconds,
    treatments,
    reusePairs: [{ requested, candidate: requested }],
    humanApprovalState: "missing",
  });
}
