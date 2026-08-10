import {
  hashProductionValue,
  runProductionHardeningDryRun,
  semanticTreatmentSchema,
  type ProductionHardeningDryRunResult,
  type ProductionVariant,
  type SemanticTreatment,
} from "@mediaforge/shared";

export const DARK_TRUTH_PRODUCTION_HARDENING_ADAPTER_VERSION =
  "darktruth-production-hardening-adapter.v1" as const;

export interface DarkTruthHardeningSceneInput {
  readonly sceneId: string;
  readonly semanticPurpose: string;
  readonly visibleThesis: string;
  readonly primaryAction: string;
  readonly actionOwnerId: string;
  readonly actors: SemanticTreatment["requiredActors"];
  readonly environment: string;
  readonly composition: string;
  readonly stateComplexity: SemanticTreatment["stateComplexity"];
  readonly visualInformationGain: string;
  readonly storyState: string;
  readonly ambiguityIntentional: boolean;
  readonly atmospherePayoff: string;
  readonly viewerVisibleFamilies: SemanticTreatment["viewerVisibleFamilies"];
  readonly providerPrompt: string;
}

export function createDarkTruthHardeningTreatment(
  input: DarkTruthHardeningSceneInput,
): SemanticTreatment {
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
    evidenceRole: "story-specific investigative evidence",
    stateComplexity: input.stateComplexity,
    continuity: {
      mode: "hybrid",
      identity: "felix-and-corrupted-cartridge",
      relation: "the same protagonist, cartridge, room, and escalating threat state",
      intentionalRepetition: true,
    },
    motif: {
      family: "corrupted-game-signal",
      description: "CRT hum and reversed three-note melody mark major escalations.",
      source: "Episode 007 sound and visual direction",
      scope: "major escalation beats",
      intentionalCoverage: [input.sceneId],
      reuseLimit: 4,
    },
    diagramRequirement: { kind: "none", stateIds: [] },
    visualInformationGain: input.visualInformationGain,
    viewerVisibleFamilies: input.viewerVisibleFamilies,
    providerActorIds: input.actors.map((actor) => actor.actorId),
    providerPrompt: input.providerPrompt,
    treatmentVersion: DARK_TRUTH_PRODUCTION_HARDENING_ADAPTER_VERSION,
    darkTruth: {
      storyState: input.storyState,
      ambiguityIntentional: input.ambiguityIntentional,
      atmospherePayoff: input.atmospherePayoff,
      threatIdentity: "intentionally-unresolved-game-phenomenon",
    },
  });
}

function darkTruthFixtureTreatments(
  variant: ProductionVariant,
): readonly SemanticTreatment[] {
  const felix = {
    actorId: "felix-grant",
    role: "protagonist",
    identityMode: "resolved" as const,
    entityId: "darktruth-character:felix-grant",
    canonicalName: "Felix Grant",
  };
  const phenomenon = {
    actorId: "game-phenomenon",
    role: "unidentified-figure",
    identityMode: "intentionally-unspecified" as const,
  };
  return [
    createDarkTruthHardeningTreatment({
      sceneId: "darktruth-007-cartridge",
      semanticPurpose: "ordinary acquisition opens the threat path",
      visibleThesis:
        "Felix knowingly takes an unlabelled cartridge from an ordinary flea-market stall, creating a concrete origin for the later threat.",
      primaryAction: "Felix buys the unlabelled cartridge.",
      actionOwnerId: "felix-grant",
      actors: [felix],
      environment: "closing flea-market stall with recorded ordinary details",
      composition: "Felix's hand takes the unlabelled cartridge while the stall remains identifiable",
      stateComplexity: "SINGLE_STATE",
      visualInformationGain: "The viewer sees the specific object and the protagonist's voluntary acquisition.",
      storyState: "cartridge-acquired",
      ambiguityIntentional: false,
      atmospherePayoff: "Ordinary specificity makes the later corruption harder to dismiss.",
      viewerVisibleFamilies: {
        strategy: "grounded-human-scenario",
        environment: "flea-market",
        composition: "object-handoff",
        camera: "close-medium",
        interaction: "protagonist-buys-object",
        dominantObject: "unlabelled-cartridge",
        motion: "handoff",
        diagram: "none",
        motif: "corrupted-game-signal",
        continuityIdentity: "felix-and-cartridge",
      },
      providerPrompt:
        "Felix Grant buys the specific unlabelled game cartridge at a closing flea-market stall; grounded dark-documentary realism, no generic scary hallway.",
    }),
    createDarkTruthHardeningTreatment({
      sceneId: "darktruth-007-save-files",
      semanticPurpose: "the game demonstrates private knowledge",
      visibleThesis:
        "The corrupted game displays BEN and FELIX save files, proving that the threat knows Felix rather than merely malfunctioning.",
      primaryAction: "The game phenomenon creates and displays the private FELIX save file.",
      actionOwnerId: "game-phenomenon",
      actors: [phenomenon, felix],
      environment: "Felix's cramped apartment and retro game setup",
      composition: "Felix in foreground confronting the two impossible save-file identities",
      stateComplexity: "DECISIVE_TRANSITION_MOMENT",
      visualInformationGain: "The private name turns technical corruption into targeted knowledge.",
      storyState: "private-identity-revealed",
      ambiguityIntentional: true,
      atmospherePayoff: "The unidentified phenomenon remains unseen while its agency is visible through the targeted file.",
      viewerVisibleFamilies: {
        strategy: "evidence-reveal",
        environment: "cramped-retro-apartment",
        composition: "protagonist-and-impossible-display",
        camera: "over-shoulder",
        interaction: "phenomenon-targets-protagonist",
        dominantObject: "save-file-screen",
        motion: "name-appears",
        diagram: "none",
        motif: "corrupted-game-signal",
        continuityIdentity: "felix-and-cartridge",
      },
      providerPrompt:
        "The intentionally unseen game phenomenon reveals BEN and FELIX save identities while Felix watches; the targeted private knowledge is the threat, with restrained CRT darkness rather than stock horror.",
    }),
    createDarkTruthHardeningTreatment({
      sceneId: "darktruth-007-impossible-footage",
      semanticPurpose: "evidence reveals the threat has crossed into the room",
      visibleThesis:
        "Deleting the BEN file produces impossible footage of Felix's own room, showing that the threat now observes the physical space.",
      primaryAction: "The game phenomenon creates footage of Felix's room from impossible angles.",
      actionOwnerId: "game-phenomenon",
      actors: [phenomenon, felix],
      environment: "the same apartment, now visible both directly and through impossible footage",
      composition:
        variant === "short"
          ? "one decisive reveal: Felix sees the live impossible angle while the real room matches behind him"
          : "setup-to-reveal sequence from deletion to folder appearance to impossible room footage",
      stateComplexity:
        variant === "short"
          ? "DECISIVE_TRANSITION_MOMENT"
          : "MULTI_STATE_REQUIRED",
      visualInformationGain:
        variant === "short"
          ? "A single high-information frame compresses the digital-to-physical escalation."
          : "The sequence preserves the causal progression from deletion to impossible surveillance.",
      storyState: "threat-crossed-into-room",
      ambiguityIntentional: true,
      atmospherePayoff: "Negative space in the real room implies an observer without resolving its identity.",
      viewerVisibleFamilies: {
        strategy: variant === "short" ? "decisive-reveal" : "setup-to-reveal",
        environment: "corrupted-apartment",
        composition: "room-with-impossible-second-view",
        camera: "screen-to-room-comparison",
        interaction: "phenomenon-observes-protagonist",
        dominantObject: "impossible-footage-folder",
        motion: variant === "short" ? "instant-reveal" : "sequential-reveal",
        diagram: "none",
        motif: "corrupted-game-signal",
        continuityIdentity: "felix-and-cartridge",
      },
      providerPrompt:
        "Felix discovers story-specific impossible footage of his own unchanged room from an angle where no camera exists; restrained surveillance dread, the observer remains intentionally unspecified.",
    }),
  ];
}

export function runDarkTruthProductionHardeningFixture(input: {
  readonly fixtureId: string;
  readonly narrationHash: string;
  readonly variant: ProductionVariant;
  readonly selectedAudioDurationSeconds: number;
}): ProductionHardeningDryRunResult {
  const treatments = darkTruthFixtureTreatments(input.variant);
  const requested = {
    semanticPurpose: treatments[1]!.semanticPurpose,
    actorEntityIds: ["darktruth-character:felix-grant"],
    factionIds: [],
    geographyIds: [],
    storyState: "private-identity-revealed",
    environmentKey: "cramped-retro-apartment",
    motifFamily: "corrupted-game-signal",
    aspectRatios: ["16:9", "9:16"] as ("16:9" | "9:16")[],
    cropSafeAspectRatios: ["16:9", "9:16"] as ("16:9" | "9:16")[],
    generatedImageQa: "not-run" as const,
  };
  return runProductionHardeningDryRun({
    fixtureId: input.fixtureId,
    genre: "dark-truth",
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
