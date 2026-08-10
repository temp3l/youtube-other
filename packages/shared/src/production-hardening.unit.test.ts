import { describe, expect, it } from "vitest";
import {
  ASSET_REUSE_POLICY_VERSION,
  DIVERSITY_NORMALIZATION_VERSION,
  PROVIDER_PROJECTION_VERSION,
  assessViewerVisibleDiversity,
  buildProductionHardeningFingerprint,
  createProductionHardeningTaskMaterial,
  createReviewIntegrityHash,
  deriveHardeningInvalidation,
  evaluateAssetReuse,
  evaluateProviderReadiness,
  hashProductionValue,
  reconcileCanonicalPostTtsTiming,
  regenerateVisualEvents,
  resolveProductionPolicy,
  semanticTreatmentHash,
  semanticTreatmentSchema,
  validateSemanticTreatments,
  validateVisualEventIntegrity,
  type SemanticTreatment,
} from "./production-hardening.js";

const hash = (value: string): string => hashProductionValue(value);

function treatment(
  overrides: Partial<SemanticTreatment> = {},
): SemanticTreatment {
  return semanticTreatmentSchema.parse({
    sceneId: "scene-1",
    semanticPurpose: "show a specific causal decision",
    visibleThesis: "The investigator chooses to preserve the evidence.",
    requiredActors: [
      {
        actorId: "investigator",
        role: "investigator",
        identityMode: "resolved",
        entityId: "character:investigator",
        canonicalName: "Investigator",
      },
      {
        actorId: "witness",
        role: "witness",
        identityMode: "resolved",
        entityId: "character:witness",
        canonicalName: "Witness",
      },
    ],
    primaryAction: "The investigator preserves the evidence.",
    actionOwnerId: "investigator",
    supportingActorIds: ["witness"],
    environment: "evidence room",
    composition: "investigator foreground, witness observing",
    evidenceRole: "specific object proves the relationship",
    stateComplexity: "SINGLE_STATE",
    continuity: {
      mode: "persistent-causal-chain",
      identity: "case-1",
      relation: "evidence chain",
      intentionalRepetition: true,
    },
    motif: {
      family: "evidence-file",
      description: "The same evidence file returns after each discovery.",
      source: "episode semantics",
      scope: "chapter",
      intentionalCoverage: ["scene-1"],
      reuseLimit: 3,
    },
    diagramRequirement: { kind: "none", stateIds: [] },
    visualInformationGain: "The evidence is preserved rather than destroyed.",
    viewerVisibleFamilies: {
      strategy: "human-scenario",
      environment: "evidence-room",
      composition: "owner-foreground",
      camera: "medium",
      interaction: "preserve-evidence",
      dominantObject: "evidence-file",
      motion: "hold",
      diagram: "none",
      motif: "evidence-file",
      continuityIdentity: "case-1",
    },
    providerActorIds: ["investigator", "witness"],
    providerPrompt: "The investigator preserves the evidence while the witness observes.",
    treatmentVersion: "test.v1",
    darkTruth: {
      storyState: "evidence-preserved",
      ambiguityIntentional: false,
      atmospherePayoff: "Concealment makes the evidence feel vulnerable.",
    },
    ...overrides,
  });
}

function reuse(overrides: Record<string, unknown> = {}) {
  return {
    semanticPurpose: "callback",
    actorEntityIds: ["actor-1"],
    periodKey: "1812",
    factionIds: ["faction-1"],
    geographyIds: ["place-1"],
    materialCultureKey: "material-1812",
    storyState: "safe-room",
    environmentKey: "room-1",
    motifFamily: "object-1",
    aspectRatios: ["16:9", "9:16"] as const,
    cropSafeAspectRatios: ["16:9", "9:16"] as const,
    generatedImageQa: "passed" as const,
    ...overrides,
  };
}

describe("cross-genre production hardening", () => {
  it("keeps canonical hardening fingerprint dependencies deterministic and scoped", () => {
    const historyLong = buildProductionHardeningFingerprint({
      taskId: "history.visual-planning",
      genre: "history",
      variant: "full",
    });
    expect(
      buildProductionHardeningFingerprint({
        taskId: "history.visual-planning",
        genre: "history",
        variant: "full",
      }),
    ).toEqual(historyLong);

    const changedHistoryLong = buildProductionHardeningFingerprint({
      taskId: "history.visual-planning",
      genre: "history",
      variant: "full",
      policy: {
        ...resolveProductionPolicy("history", "full"),
        visualDensityPolicy: "history-long-policy-v2",
      },
    });
    const historyShort = buildProductionHardeningFingerprint({
      taskId: "history.visual-planning",
      genre: "history",
      variant: "short",
    });
    const darkTruthLong = buildProductionHardeningFingerprint({
      taskId: "darktruth.shot-plan",
      genre: "dark-truth",
      variant: "full",
    });
    expect(changedHistoryLong.fingerprint).not.toBe(historyLong.fingerprint);
    expect(
      buildProductionHardeningFingerprint({
        taskId: "history.visual-planning",
        genre: "history",
        variant: "short",
      }).fingerprint,
    ).toBe(historyShort.fingerprint);
    expect(
      buildProductionHardeningFingerprint({
        taskId: "darktruth.shot-plan",
        genre: "dark-truth",
        variant: "full",
      }).fingerprint,
    ).toBe(darkTruthLong.fingerprint);
    expect(historyShort.policyFingerprint).not.toBe(historyLong.policyFingerprint);
    expect(darkTruthLong.policyFingerprint).not.toBe(historyLong.policyFingerprint);

    const sharedHistory = buildProductionHardeningFingerprint({
      taskId: "history.visual-planning",
      genre: "history",
      variant: "full",
      sharedPrimitiveRevision: "shared.v2",
    });
    const sharedDarkTruth = buildProductionHardeningFingerprint({
      taskId: "darktruth.shot-plan",
      genre: "dark-truth",
      variant: "full",
      sharedPrimitiveRevision: "shared.v2",
    });
    expect(sharedHistory.sharedPrimitiveFingerprint).not.toBe(
      historyLong.sharedPrimitiveFingerprint,
    );
    expect(sharedDarkTruth.sharedPrimitiveFingerprint).not.toBe(
      darkTruthLong.sharedPrimitiveFingerprint,
    );
    expect(
      createProductionHardeningTaskMaterial({
        taskId: "history.visual-planning",
        genre: "history",
        variant: "short",
      }).typedDependencies,
    ).toHaveLength(2);
  });
  it("keeps genre and variant pacing, aspect ratio, density, and state policy isolated", () => {
    const historyFull = resolveProductionPolicy("history", "full");
    const historyShort = resolveProductionPolicy("history", "short");
    const darkFull = resolveProductionPolicy("dark-truth", "full");
    const darkShort = resolveProductionPolicy("dark-truth", "short");
    expect(historyFull.pacing.mode).toBe("preserve-current");
    expect(historyShort.pacing.mode).toBe("adaptive-duration");
    expect(darkFull.pacing.mode).toBe("static-guidance");
    expect(darkShort.pacing.mode).toBe("static-guidance");
    expect(JSON.stringify([historyFull, historyShort, darkFull, darkShort])).not.toContain(
      "58,60",
    );
    expect(JSON.stringify([historyFull, historyShort, darkFull, darkShort])).not.toContain(
      "160,165",
    );
    expect(historyFull.aspectRatio).toBe("16:9");
    expect(historyShort.aspectRatio).toBe("9:16");
    expect(darkFull.aspectRatio).toBe("16:9");
    expect(darkShort.aspectRatio).toBe("9:16");
    expect(historyFull.visualDensityPolicy).not.toBe(historyShort.visualDensityPolicy);
    expect(darkFull.visualDensityPolicy).not.toBe(darkShort.visualDensityPolicy);
  });

  it("preserves the action owner and blocks structural actor replacement", () => {
    const valid = treatment();
    expect(
      validateSemanticTreatments({
        genre: "dark-truth",
        policy: resolveProductionPolicy("dark-truth", "full"),
        treatments: [valid],
      }),
    ).toEqual([]);
    const swapped = treatment({ providerActorIds: ["witness"] });
    expect(
      validateSemanticTreatments({
        genre: "dark-truth",
        policy: resolveProductionPolicy("dark-truth", "full"),
        treatments: [swapped],
      }).map((finding) => finding.code),
    ).toContain("ACTOR_ROLE_MISMATCH");
  });

  it("preserves intentional unidentified actors and requires resolved historical figures", () => {
    const ambiguous = treatment({
      requiredActors: [
        {
          actorId: "threat",
          role: "unidentified-figure",
          identityMode: "intentionally-unspecified",
        },
      ],
      actionOwnerId: "threat",
      supportingActorIds: [],
      providerActorIds: ["threat"],
      darkTruth: {
        storyState: "threat-implied",
        ambiguityIntentional: true,
        atmospherePayoff: "The unseen threat causes a specific door movement.",
      },
    });
    expect(
      validateSemanticTreatments({
        genre: "dark-truth",
        policy: resolveProductionPolicy("dark-truth", "short"),
        treatments: [ambiguous],
      }),
    ).toEqual([]);
    const history = treatment({
      requiredActors: [
        {
          actorId: "named-ruler",
          role: "historical-person",
          identityMode: "resolved",
          canonicalName: "Named Ruler",
        },
      ],
      actionOwnerId: "named-ruler",
      supportingActorIds: [],
      providerActorIds: ["named-ruler"],
      history: {
        periodKey: "1812",
        geographyIds: ["place"],
        entityIds: [],
        factionIds: ["side"],
        evidenceIds: ["claim"],
        trustedSemanticsHash: hash("trusted"),
      },
      darkTruth: undefined,
    });
    expect(
      validateSemanticTreatments({
        genre: "history",
        policy: resolveProductionPolicy("history", "full"),
        treatments: [history],
      }).map((finding) => finding.code),
    ).toContain("HISTORICAL_ENTITY_UNRESOLVED");
  });

  it("allows meaningful DarkTruth atmosphere but blocks positive stock-horror drift", () => {
    const atmospheric = treatment({
      providerPrompt:
        "Restrained symbolic surveillance imagery where negative space shows that a specific witness is being observed.",
    });
    expect(
      validateSemanticTreatments({
        genre: "dark-truth",
        policy: resolveProductionPolicy("dark-truth", "full"),
        treatments: [atmospheric],
      }),
    ).toEqual([]);
    const stock = treatment({
      providerPrompt: "Show a generic scary hallway with red lighting.",
    });
    expect(
      validateSemanticTreatments({
        genre: "dark-truth",
        policy: resolveProductionPolicy("dark-truth", "short"),
        treatments: [stock],
      }).map((finding) => finding.code),
    ).toContain("GENERIC_STOCK_HORROR_DRIFT");
  });

  it("regenerates decisive, multi-state, map, and diagram events from final treatment", () => {
    const scenes = [
      treatment({ sceneId: "single" }),
      treatment({
        sceneId: "decisive",
        stateComplexity: "DECISIVE_TRANSITION_MOMENT",
      }),
      treatment({
        sceneId: "multi",
        stateComplexity: "MULTI_STATE_REQUIRED",
      }),
      treatment({
        sceneId: "map",
        stateComplexity: "MULTI_STATE_REQUIRED",
        diagramRequirement: { kind: "map", stateIds: ["m1", "m2"] },
      }),
      treatment({
        sceneId: "diagram",
        stateComplexity: "MULTI_STATE_REQUIRED",
        diagramRequirement: { kind: "diagram", stateIds: ["d1", "d2"] },
      }),
    ];
    const timing = reconcileCanonicalPostTtsTiming({
      selectedAudioHash: hash("audio"),
      selectedAudioDurationSeconds: 50,
      scenes: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        plannedDurationSeconds: 10,
      })),
    });
    const events = regenerateVisualEvents({
      genre: "history",
      treatments: scenes,
      timing,
    });
    expect(events.map((event) => event.category)).toEqual([
      "hold",
      "decisive-transition",
      "multi-state-progression",
      "map-progression",
      "diagram-build",
    ]);
    expect(validateVisualEventIntegrity({ treatments: scenes, events, timing })).toEqual(
      [],
    );
    expect(
      validateVisualEventIntegrity({
        treatments: [treatment({ sceneId: "map" })],
        events: [events[3]!],
        timing: reconcileCanonicalPostTtsTiming({
          selectedAudioHash: hash("audio"),
          selectedAudioDurationSeconds: 10,
          scenes: [{ sceneId: "map", plannedDurationSeconds: 10 }],
        }),
      }).map((finding) => finding.code),
    ).toEqual(expect.arrayContaining(["STALE_DERIVED_EVENT", "ORPHAN_MAP_EVENT"]));
  });

  it("normalizes diversity while separating continuity from empty repetition", () => {
    const intentional = treatment({
      sceneId: "scene-2",
      visualInformationGain: "The witness now reveals the hidden relationship.",
      stateComplexity: "DECISIVE_TRANSITION_MOMENT",
      viewerVisibleFamilies: {
        ...treatment().viewerVisibleFamilies,
        interaction: "witness-reveals-evidence",
        motion: "reveal",
      },
    });
    const duplicate = treatment({ ...intentional, sceneId: "scene-3" });
    const assessment = assessViewerVisibleDiversity([
      treatment(),
      intentional,
      duplicate,
    ]);
    expect(assessment.normalizedFamilies).toHaveLength(3);
    expect(assessment.intentionalContinuityPairs).toContain("scene-1->scene-2");
    expect(assessment.harmfulRepetitionPairs).toContain("scene-2->scene-3");
  });

  it("enforces historical and DarkTruth semantic reuse constraints", () => {
    expect(
      evaluateAssetReuse({
        genre: "history",
        targetAspectRatio: "16:9",
        requested: reuse(),
        candidate: reuse(),
      }).allowed,
    ).toBe(true);
    const historicalMismatch = evaluateAssetReuse({
      genre: "history",
      targetAspectRatio: "16:9",
      requested: reuse(),
      candidate: reuse({
        periodKey: "1813",
        actorEntityIds: ["actor-2"],
        geographyIds: ["place-2"],
      }),
    });
    expect(historicalMismatch.reasons).toEqual(
      expect.arrayContaining([
        "HISTORICAL_PERIOD_MISMATCH",
        "ACTOR_ENTITY_MISMATCH",
        "HISTORICAL_GEOGRAPHY_MISMATCH",
      ]),
    );
    expect(
      evaluateAssetReuse({
        genre: "dark-truth",
        targetAspectRatio: "9:16",
        requested: reuse(),
        candidate: reuse({ storyState: "corrupted-room" }),
      }).reasons,
    ).toContain("DARKTRUTH_STORY_STATE_MISMATCH");
    expect(
      evaluateAssetReuse({
        genre: "dark-truth",
        targetAspectRatio: "9:16",
        requested: reuse(),
        candidate: reuse({
          semanticPurpose: "unrelated",
          cropSafeAspectRatios: ["9:16"],
        }),
      }).allowed,
    ).toBe(false);
  });

  it("uses selected final audio as canonical timing and labels proportional allocation accurately", () => {
    const timing = reconcileCanonicalPostTtsTiming({
      selectedAudioHash: hash("selected-audio"),
      selectedAudioDurationSeconds: 61.25,
      scenes: [
        { sceneId: "one", plannedDurationSeconds: 1 },
        { sceneId: "two", plannedDurationSeconds: 2 },
      ],
    });
    expect(timing.timingSource).toBe("proportional-total-audio-reconciliation");
    expect(timing.scenes.at(-1)?.endSeconds).toBe(61.25);
    expect(timing.selectedAudioHash).toBe(hash("selected-audio"));
  });

  it("fails provider readiness closed for every integrity blocker", () => {
    const reviewHash = createReviewIntegrityHash({
      narrationHash: hash("narration"),
      timingHash: hash("timing"),
      semanticPlanHash: hash("plan"),
      mapDiagramHash: hash("map"),
      semanticReviewHash: hash("review"),
      providerPromptHash: hash("prompt"),
      reuseDecisionHash: hash("reuse"),
      pacingCalibrationHash: null,
    });
    const readiness = evaluateProviderReadiness({
      findings: [
        {
          code: "ACTOR_ROLE_MISMATCH",
          severity: "blocking",
          sceneId: "scene",
          message: "mismatch",
        },
      ],
      timingCurrent: false,
      mapDiagramCurrent: false,
      expectedReviewHash: reviewHash,
      persistedReviewHash: hash("stale"),
      humanApprovalState: "missing",
    });
    expect(readiness.allowed).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        "SEMANTIC_BLOCKER",
        "ACTOR_MISMATCH",
        "INVALID_TIMING",
        "STALE_MAP_DIAGRAM_STATE",
        "STALE_REVIEW_ARTIFACT",
        "HUMAN_APPROVAL_MISSING",
      ]),
    );
  });

  it("invalidates only derived state affected by versioned changes", () => {
    const base = {
      treatmentHash: hash("treatment"),
      timingHash: hash("timing"),
      providerProjectionVersion: PROVIDER_PROJECTION_VERSION,
      diversityVersion: DIVERSITY_NORMALIZATION_VERSION,
      reusePolicyVersion: ASSET_REUSE_POLICY_VERSION,
    };
    expect(
      deriveHardeningInvalidation({
        previous: base,
        current: { ...base, reusePolicyVersion: "reuse.v2" },
      }),
    ).toEqual(["reuse-decisions"]);
    expect(
      deriveHardeningInvalidation({
        previous: base,
        current: { ...base, timingHash: hash("new-timing") },
      }),
    ).toEqual([
      "visual-events",
      "timing-render-instructions",
      "review-pack",
    ]);
    expect(
      deriveHardeningInvalidation({
        previous: base,
        current: {
          ...base,
          treatmentHash: semanticTreatmentHash(treatment()),
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "provider-prompts",
        "maps-diagrams",
        "visual-events",
        "reuse-decisions",
        "diversity-fingerprints",
        "review-pack",
      ]),
    );
  });
});
