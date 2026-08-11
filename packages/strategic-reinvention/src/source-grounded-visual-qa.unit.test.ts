import { describe, expect, it, vi } from "vitest";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import {
  FixtureEpisodeSequenceJudge,
  FixtureSemanticRemediationAdvisor,
  FixtureSourceGroundedSceneJudge,
  InMemorySourceGroundedVisualQaCache,
  SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
  SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
  SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
  SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION,
  benchmarkSourceGroundedReasoningPolicies,
  buildSourceGroundedQaRevision,
  coalesceSourceGroundedRemediationDirectives,
  deterministicRemediationDirective,
  episodeSequenceJudgementSchema,
  runSourceGroundedVisualQaController,
  sceneJudgementConsistencyReasons,
  semanticRemediationDirectiveSchema,
  semanticRemediationDirectiveConsistencyReasons,
  sourceGroundedPassJudgement,
  sourceGroundedPassBeatJudgement,
  sourceGroundedPassSequence,
  sourceGroundedProjectionContradictionReasons,
  sourceGroundedSceneJudgementSchema,
  sourceGroundedSceneCacheKey,
  type SemanticDefectCode,
  type SemanticFaultBoundary,
  type SourceGroundedSceneJudgement,
  type SourceGroundedSceneJudgePort,
  type SourceGroundedVisualBeatJudgement,
  type SourceGroundedVisualQaPolicy,
} from "./source-grounded-visual-qa.js";
import {
  SourceGroundedQaBudgetError,
  SourceGroundedQaScheduler,
  SourceGroundedQaTransportError,
  sourceGroundedQaExecutionPolicy,
} from "./source-grounded-qa-scheduler.js";

const policy: SourceGroundedVisualQaPolicy = {
  enabled: true,
  policyIdentity: "fixture-cheap-first.v1",
  sceneJudge: { model: "cheap-scene", reasoningEffort: "low" },
  escalation: { model: "strong-scene", reasoningEffort: "medium" },
  remediationAdvisor: { model: "strong-advisor", reasoningEffort: "medium" },
  sequenceJudge: { model: "cheap-sequence", reasoningEffort: "low" },
  maxRemediationRounds: 1,
  remediateReview: true,
  execution: sourceGroundedQaExecutionPolicy("INTERACTIVE", {
    providerMode: "FIXTURE",
  }),
};

function plan(sceneCount = 1): PositioningVisualPlanV2 {
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    const sceneId = `semantic-${ordinal}`;
    return {
      sceneId,
      progressionStage: index === 0 ? "HOOK" : "EXPLANATION",
      narrationAnchor:
        index === 0
          ? "The expert builds a package first, then searches for customers; this is the wrong sequence."
          : "A focused entry behaves like a doorway rather than a wall.",
      startMs: index * 5_000,
      durationMs: 5_000,
      treatment: {
        treatmentId: `treatment-${ordinal}`,
        sceneId,
        progressionStage: index === 0 ? "HOOK" : "EXPLANATION",
        narrativeBeat:
          "A buyer discovers a matching solution and understands it.",
        communicationIntent: "explain-causality",
        strategy: "human-scenario",
        subjectRequirement: "a buyer",
        environment: "generic evidence review wall",
        composition: "eye-level documentary medium shot",
        camera: "eye-level documentary",
        lighting: "daylight",
        action: "the buyer recognizes a problem and finds a matching response",
        actionOwnerRole: "buyer",
        props: ["generic evidence cards"],
        motionOpportunities: ["slow-push"],
        diagram: null,
        grammar: {
          strategy: "human-scenario",
          subjectArchetype: "buyer",
          environment: "generic evidence review wall",
          composition: "eye-level documentary medium shot",
          camera: "eye-level documentary",
          props: ["generic evidence cards"],
          topology: "none",
          semanticTokens: ["buyer", "solution"],
          continuityIdentityId: "protagonist",
        },
        viewerVisibleFingerprint: {
          strategyFamily: "human-scenario",
          subjectArchetype: "buyer",
          environmentArchetype: "generic evidence review wall",
          compositionArchetype: "medium shot",
          cameraArchetype: "documentary eye-level",
          lightingArchetype: "daylight",
          actionArchetype: "reviews evidence",
          dominantObjectArchetype: "evidence cards",
          motionArchetype: "slow push",
        },
        treatmentHash: `${index + 1}`.repeat(64).slice(0, 64),
      },
      assetId: `asset-${ordinal}`,
      eventIds: [],
      overlayKey: `overlay-${ordinal}`,
      visibleThesis: "The buyer recognizes a problem and finds the answer.",
      newInformation: "The buyer understands the matching response.",
      narrativeFunction: "HOOK",
      visualFamily: "HUMAN_SCENARIO",
      stateComplexity: "SINGLE_STATE",
      semanticProposition: {
        schemaVersion: "veronica-semantic-proposition.v3",
        narrationClaim: "The buyer recognizes a problem and finds the answer.",
        evidenceSpans: [
          {
            sentenceId: "s1",
            startOffset: 0,
            endOffset: 20,
            text: "The expert builds a package first",
            spanHash: "a".repeat(64),
          },
        ],
        polarity: "POSITIVE_STATE",
        stateRelation: "CAUSAL_BEFORE_AFTER",
        cause: "buyer recognizes problem",
        actorRole: "buyer",
        actorAction: "finds a matching solution",
        consequence: "understands it",
        visualMechanism: "market-problem-solution-chain",
        evidenceAnchors: ["buyer", "solution"],
        buyerConsequenceFamily: "UNDERSTANDS",
        confidence: {
          proposition: "HIGH",
          actorOwnership: "HIGH",
          consequence: "HIGH",
          visualMechanism: "HIGH",
        },
        propositionHash: "b".repeat(64),
      },
    } as const;
  });
  const assets = scenes.map(
    (scene, index) =>
      ({
        assetId: scene.assetId,
        contentId: "fixture-episode",
        sceneId: scene.sceneId,
        semanticPurpose: scene.visibleThesis,
        strategy: scene.treatment.strategy,
        prompt:
          index === 0
            ? "A buyer recognizes a problem, finds a matching response, and understands the solution. No readable text."
            : "A focused doorway opens into a relevant adjacent room; no readable text.",
        textFree: true,
        textInGeneratedImage: false,
        nativeAspectRatio: "16:9",
        ratioAdaptations: [],
        subjectIdentityId: "protagonist",
        referenceAssetId: null,
        semanticFingerprint: "c".repeat(64),
        generatedAssetCacheKey: "d".repeat(64),
      }) as const
  );
  return {
    contentId: "fixture-episode",
    parentLongFormId: "fixture-episode",
    format: "long",
    aspectRatio: "16:9",
    continuity: {
      mode: "persistent-protagonist",
      identityId: "protagonist",
      identityFingerprint: "persistent protagonist",
      appearance: {
        ageBand: "adult",
        genderPresentation: "woman",
        hair: "dark",
        wardrobeAnchor: "navy jacket",
      },
      referencePolicy: "reuse-only-for-linked-scenes",
      linkedSceneIds: scenes.map((scene) => scene.sceneId),
    },
    scenes,
    assets,
    selectedRecurringMotif:
      sceneCount > 1
        ? {
            schemaVersion: "veronica-selected-recurring-motif.v1",
            family: "threshold",
            concept: "focused entry behaves like a doorway rather than a wall",
            source: "narration-native",
            sceneIds: [scenes[1]!.sceneId],
          }
        : undefined,
  } as unknown as PositioningVisualPlanV2;
}

function semanticallyUniquePlan(sceneCount: number): PositioningVisualPlanV2 {
  const source = plan(sceneCount);
  return {
    ...source,
    assets: source.assets.map((asset, index) => ({
      ...asset,
      prompt: `${asset.prompt} Distinct evidence variant ${index + 1}.`,
    })),
  } as PositioningVisualPlanV2;
}

function multiBeatPlan(): PositioningVisualPlanV2 {
  const source = plan();
  const scene = source.scenes[0]!;
  const makeBeat = (ordinal: 1 | 2) => ({
    version: 1 as const,
    beatId: `${scene.sceneId}-B0${ordinal}`,
    sceneId: scene.sceneId,
    role: ordinal === 1 ? "establish" as const : "progression" as const,
    narrationRef: {
      semanticSceneId: scene.sceneId,
      sentenceIds: ["s1"],
      startOffset: 0,
      endOffset: 20,
      spanHash: `${ordinal}`.repeat(64),
    },
    parentTreatmentHash: scene.treatment.treatmentHash,
    coreMeaning: scene.semanticProposition!.narrationClaim,
    newInformation: ordinal === 1 ? "The buyer encounters the focused solution." : "The buyer uses the focused solution.",
    viewerShouldUnderstand: "The focused solution is useful.",
    visualThesis: ordinal === 1 ? "A buyer receives a focused solution." : "The buyer actively uses the focused solution.",
    subject: "a buyer",
    action: ordinal === 1 ? "receives a focused solution" : "uses the focused solution",
    state: ordinal === 1 ? "encounter" : "active use",
    environment: ordinal === 1 ? "direct handoff" : "working surface",
    composition: {
      description: ordinal === 1 ? "hands and object dominate" : "buyer and applied object dominate",
      camera: "eye-level documentary",
      lighting: "daylight",
      subtitleSafeAreaRequired: true as const,
    },
    continuationOfPreviousBeat: ordinal === 2,
    referenceRequirements: [],
    assetDecision: "new-image" as const,
    reuseSourceBeatId: null,
    timingWeight: 1,
    boundaryKind: ordinal === 1 ? "narration-aligned" as const : "editorially-allocated" as const,
    beatHash: `${ordinal + 2}`.repeat(64),
  });
  const beats = [makeBeat(1), makeBeat(2)];
  const assets = beats.map((beat, index) => ({
    ...source.assets[0]!,
    assetId: `asset-beat-${index + 1}`,
    visualBeatId: beat.beatId,
    visualBeatHash: beat.beatHash,
    visualBeatAssetDecision: "new-image" as const,
    prompt: `Provider prompt for ${beat.visualThesis}`,
    promptCompilation: {
      semanticQa: {
        schemaVersion: "veronica-provider-prompt-semantic-qa.v1" as const,
        status: "PASS" as const,
        sceneId: beat.sceneId,
        assetId: `asset-beat-${index + 1}`,
        canonicalContractHash: `${index + 5}`.repeat(64),
        providerPromptHash: `${index + 7}`.repeat(64),
        blockers: [],
      },
    },
  }));
  return {
    ...source,
    assets,
    visualBeatPlan: {
      schemaVersion: "veronica-visual-beat-plan.v1",
      policyVersion: "fixture-density.v1",
      contentId: source.contentId,
      semanticSceneCount: 1,
      beats,
      quality: {
        status: "PASS",
        findings: [],
        beatsInFirst5Seconds: 2,
        beatsInFirst10Seconds: 2,
        beatsInFirst15Seconds: 2,
        density: {
          semanticSceneCount: 1,
          visualBeatCount: 2,
          visualEventCount: 2,
          uniqueCanonicalAssetCount: 2,
          newImageBeatCount: 2,
          reuseWithMotionBeatCount: 0,
          reuseWithCropBeatCount: 0,
          reuseExistingAssetBeatCount: 0,
          sameAssetEventCount: 0,
          firstNewAssetChangeMs: 2500,
          uniqueAssetsInFirst5Seconds: 2,
          uniqueAssetsInFirst10Seconds: 2,
          uniqueAssetsInFirst15Seconds: 2,
          longestContinuousSameAssetHoldMs: 2500,
          averageCanonicalAssetHoldMs: 2500,
          redundantPaidImageCandidateBeatIds: [],
          informationGain: beats.map((beat) => ({
            beatId: beat.beatId,
            newInformationHash: beat.beatHash,
            addsMaterialInformation: true,
          })),
          higherImageDensityThanOnePerScene: true,
        },
      },
      beatPlanHash: "9".repeat(64),
    },
  } as PositioningVisualPlanV2;
}

function beatAwareJudge(
  beatResult: (beatId: string) => SourceGroundedVisualBeatJudgement
): SourceGroundedSceneJudgePort {
  const outputFor = (payload: Parameters<SourceGroundedSceneJudgePort["judge"]>[0]["payload"], instructionVersion: string) =>
    instructionVersion === SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION && "beatId" in payload
      ? beatResult(String(payload.beatId))
      : sourceGroundedPassJudgement();
  return {
    async judge(input) {
      return { output: outputFor(input.payload, input.instructionVersion) };
    },
    async judgeBatch(input) {
      return {
        outputs: input.items.map((item) => ({
          itemId: item.itemId,
          output: outputFor(item.payload, input.instructionVersion),
        })),
      };
    },
  };
}

function blocked(
  defectCodes: readonly SemanticDefectCode[],
  boundary: SemanticFaultBoundary,
  overrides: Partial<SourceGroundedSceneJudgement> = {}
): SourceGroundedSceneJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
    sourceFidelity: "FAIL",
    actorCorrect: !defectCodes.includes("ACTOR_INVERSION"),
    actionOwnerCorrect: !defectCodes.includes("ACTION_OWNER_INVERSION"),
    causalDirectionCorrect: !defectCodes.includes("CAUSAL_INVERSION"),
    polarityCorrect: !defectCodes.includes("POLARITY_INVERSION"),
    stateRolesCorrect: !defectCodes.includes("STATE_ROLE_INVERSION"),
    visualMechanismGrounded: !defectCodes.some(
      (code) =>
        code === "STALE_VISUAL_MECHANISM" || code === "SOURCE_DOMAIN_LOST"
    ),
    providerPromptDepictsNarration: false,
    renderableUnderConstraints: !defectCodes.some(
      (code) =>
        code === "TEXT_DEPENDENCY_CONFLICT" ||
        code === "ABSTRACT_UNRENDERABLE_STATE"
    ),
    informationCoverage: defectCodes.includes("SEVERE_UNDER_COVERAGE")
      ? "SEVERELY_UNDER_COVERED"
      : "PARTIAL",
    verdict: "BLOCK",
    defectCodes: [...defectCodes],
    earliestFaultBoundary: boundary,
    remediationRoute:
      boundary === "SEGMENTATION"
        ? "RESEGMENT"
        : boundary === "STATE_MODEL"
          ? "REBUILD_STATE_MODEL"
          : boundary === "PROVIDER_PROJECTION"
            ? "REPROJECT_PROVIDER_PROMPT"
            : "REBUILD_SEMANTICS",
    reason: `Source-grounded fixture detected ${defectCodes.join(", ")}.`,
    ...overrides,
  };
}

describe("source-grounded visual QA structured contracts", () => {
  it("strictly parses scene, remediation, and sequence structured outputs", () => {
    expect(
      sourceGroundedSceneJudgementSchema.parse(sourceGroundedPassJudgement())
        .verdict
    ).toBe("PASS");
    expect(
      semanticRemediationDirectiveSchema.parse({
        schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
        repairBoundary: "SEMANTIC_EXTRACTION",
        visualMechanism: "problem-first-sequence",
        actionOwnerRole: "expert",
        sourceSemantics: {
          actorRole: "expert",
          actionOwner: "expert",
          action: "creates a package first",
          causalDirection: "package then customer search",
          polarity: "negative",
          consequence: "market-first fit is absent",
        },
        requiredVisibleEvidence: [
          "expert holding a finished package before customers appear",
        ],
        requiredDomainObjects: ["package"],
        forbiddenMisinterpretations: ["buyer-led successful discovery"],
        reason: "Restore seller-led failed sequence.",
      }).repairBoundary
    ).toBe("SEMANTIC_EXTRACTION");
    expect(
      episodeSequenceJudgementSchema.parse(sourceGroundedPassSequence()).verdict
    ).toBe("PASS");
  });

  it("requires every remediation directive to carry a resolved typed visual mechanism", () => {
    expect(
      semanticRemediationDirectiveSchema.safeParse({
        schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
        repairBoundary: "SEMANTIC_EXTRACTION",
        sourceSemantics: {},
        requiredVisibleEvidence: [],
        requiredDomainObjects: [],
        forbiddenMisinterpretations: [],
        reason: "A prose-only repair is not authoritative.",
      }).success
    ).toBe(false);
    expect(
      semanticRemediationDirectiveSchema.safeParse({
        schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
        repairBoundary: "SEMANTIC_EXTRACTION",
        visualMechanism: "UNRESOLVED",
        actionOwnerRole: "expert",
        sourceSemantics: {},
        requiredVisibleEvidence: [],
        requiredDomainObjects: [],
        forbiddenMisinterpretations: [],
        reason: "An unresolved mechanism cannot enter regeneration.",
      }).success
    ).toBe(false);
  });

  it("rejects a typed mechanism whose canonical visible action has a different owner", () => {
    const directive = semanticRemediationDirectiveSchema.parse({
      schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
      repairBoundary: "STATE_MODEL",
      visualMechanism: "audience-fit-signal",
      actionOwnerRole: "expert",
      sourceSemantics: {},
      requiredVisibleEvidence: [],
      requiredDomainObjects: [],
      forbiddenMisinterpretations: [],
      reason: "The mechanism and action owner conflict.",
    });
    expect(semanticRemediationDirectiveConsistencyReasons(directive)).toEqual([
      expect.stringContaining("requires buyer action ownership"),
    ]);
  });

  it("rejects contradictory PASS and malformed BLOCK decisions deterministically", () => {
    expect(
      sceneJudgementConsistencyReasons({
        ...sourceGroundedPassJudgement(),
        causalDirectionCorrect: false,
      })
    ).toContainEqual(expect.stringContaining("causalDirectionCorrect"));
    expect(
      sceneJudgementConsistencyReasons({
        ...blocked(["CAUSAL_INVERSION"], "SEMANTIC_EXTRACTION"),
        defectCodes: [],
      })
    ).toContain("BLOCK has no defect code");
  });

  it("routes semantic replacement through the typed advisor instead of copying rejected state", () => {
    const judgement = blocked(
      ["ACTION_OWNER_INVERSION", "CAUSAL_INVERSION", "STALE_VISUAL_MECHANISM"],
      "SEMANTIC_EXTRACTION",
      {
        expectedSourceSemantics: {
          actorRole: "professional",
          actionOwner: "professional through their work",
          causalDirection: "professional work develops actual expertise; external recognition remains separate",
          polarity: "NEUTRAL",
          requiredDomainObjects: ["substantive work process", "expert work result"],
          requiredVisibleEvidence: ["actual expertise remains distinct from external recognition"],
        },
      },
    );
    const directive = deterministicRemediationDirective({
      scene: {
        sceneId: "generic-semantic-repair",
        episodeId: "generic-fixture",
        format: "SHORT",
        narrationBeat: "Doing substantive work develops expertise. External recognition is separate.",
        semantic: {
          actorRole: "buyer",
          actionOwner: "buyer",
          action: "buyer inspects proof",
          consequence: "proof establishes expertise",
          visualMechanism: "claim-to-proof",
        },
        structuredState: { relation: "STABLE" },
        treatment: {
          actor: "buyer",
          action: "buyer inspects proof",
          props: ["title badge", "proof cards"],
        },
        providerPrompt: "A buyer inspects proof and establishes expertise.",
        constraints: { readableTextAllowed: false, aspectRatio: "9:16" },
      },
      judgement,
    });
    expect(directive).toBeNull();
  });
});

describe("source-grounded scene regression diagnoses", () => {
  it.each([
    [
      "seller-first anti-pattern",
      [
        "ACTOR_INVERSION",
        "ACTION_OWNER_INVERSION",
        "CAUSAL_INVERSION",
        "POLARITY_INVERSION",
      ],
      "SEMANTIC_EXTRACTION",
    ],
    ["state role inversion", ["STATE_ROLE_INVERSION"], "STATE_MODEL"],
    [
      "website domain loss",
      ["SOURCE_DOMAIN_LOST", "STALE_VISUAL_MECHANISM"],
      "VISUAL_MECHANISM",
    ],
    ["offer structure domain loss", ["SOURCE_DOMAIN_LOST"], "VISUAL_MECHANISM"],
    [
      "content planning domain loss",
      ["SOURCE_DOMAIN_LOST"],
      "VISUAL_MECHANISM",
    ],
    ["text dependency", ["TEXT_DEPENDENCY_CONFLICT"], "PROVIDER_PROJECTION"],
    ["abstract state", ["ABSTRACT_UNRENDERABLE_STATE"], "PROVIDER_PROJECTION"],
    ["under-segmentation", ["SEVERE_UNDER_COVERAGE"], "SEGMENTATION"],
  ] as const)(
    "routes %s to the earliest responsible boundary",
    async (_label, codes, boundary) => {
      const result = blocked(codes, boundary);
      const judge = new FixtureSourceGroundedSceneJudge({
        "semantic-001": result,
      });
      const controlled = await runSourceGroundedVisualQaController({
        plan: plan(),
        narrationByScene: [plan().scenes[0]!.narrationAnchor],
        policy,
        primaryJudge: judge,
        sequenceJudge: new FixtureEpisodeSequenceJudge(
          sourceGroundedPassSequence()
        ),
        cache: new InMemorySourceGroundedVisualQaCache(),
      });
      expect(controlled.qa.scenes[0]!.judgement.defectCodes).toEqual(
        expect.arrayContaining([...codes])
      );
      expect(controlled.qa.scenes[0]!.judgement.earliestFaultBoundary).toBe(
        boundary
      );
      expect(controlled.qa.sourceFidelityReady).toBe(false);
      expect(controlled.qa.providerRequestsAllowed).toBe(false);
    }
  );

  it("allows a narration-native doorway metaphor", async () => {
    const twoScenePlan = plan(2);
    const judge = new FixtureSourceGroundedSceneJudge({
      "semantic-001": sourceGroundedPassJudgement(),
      "semantic-002": sourceGroundedPassJudgement(
        "The doorway directly preserves the narration-native metaphor."
      ),
    });
    const controlled = await runSourceGroundedVisualQaController({
      plan: twoScenePlan,
      narrationByScene: twoScenePlan.scenes.map(
        (scene) => scene.narrationAnchor
      ),
      policy,
      primaryJudge: judge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(controlled.qa.sourceFidelityReady).toBe(true);
  });
});

describe("cheap-first escalation and fail-closed behavior", () => {
  it("rejects a model PASS when the final provider projection depicts the opposing state", async () => {
    const opposing = plan();
    const sourceScene = opposing.scenes[0]!;
    const sourceAsset = opposing.assets[0]!;
    const negative = {
      ...opposing,
      scenes: [{
        ...sourceScene,
        semanticProposition: {
          ...sourceScene.semanticProposition!,
          polarity: "NEGATIVE_STATE" as const,
          stateRelation: "STABLE" as const,
          consequence: "the affected professional loses the client",
        },
        treatment: {
          ...sourceScene.treatment,
          composition: "one focused coherent cue connects every touchpoint",
          action: "the buyer recognizes one clear focused category and chooses it",
          props: ["focused coherent cue", "aligned touchpoints"],
        },
      }],
      assets: [{
        ...sourceAsset,
        prompt: "One focused coherent cue aligns every touchpoint. The buyer recognizes one clear category and chooses it.",
      }],
    } as PositioningVisualPlanV2;
    const modelPass = {
      ...sourceGroundedPassJudgement(),
      expectedSourceSemantics: {
        polarity: "NEGATIVE_STATE",
        actionOwner: "buyer",
        requiredVisibleEvidence: ["broad undifferentiated evidence", "buyer uncertainty"],
      },
    };
    const primary = new FixtureSourceGroundedSceneJudge({ "semantic-001": modelPass });
    const escalation = new FixtureSourceGroundedSceneJudge({ "semantic-001": modelPass });
    const controlled = await runSourceGroundedVisualQaController({
      plan: negative,
      narrationByScene: [negative.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: primary,
      escalationJudge: escalation,
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(sourceGroundedProjectionContradictionReasons({ payload: primary.calls[0]!, judgement: modelPass })).toContain("final-treatment-opposes-source-polarity");
    expect(escalation.calls).toHaveLength(1);
    expect(controlled.qa.scenes[0]!.judgement.verdict).toBe("REVIEW");
    expect(controlled.qa.sourceFidelityReady).toBe(false);
    expect(controlled.qa.providerRequestsAllowed).toBe(false);
    expect(controlled.qa.sequence.verdict).toBe("UNAVAILABLE");
  });

  it("does not escalate primary PASS or primary BLOCK", async () => {
    for (const primaryValue of [
      sourceGroundedPassJudgement(),
      blocked(["CAUSAL_INVERSION"], "SEMANTIC_EXTRACTION"),
    ]) {
      const primary = new FixtureSourceGroundedSceneJudge({
        "semantic-001": primaryValue,
      });
      const escalation = new FixtureSourceGroundedSceneJudge({
        "semantic-001": sourceGroundedPassJudgement(),
      });
      await runSourceGroundedVisualQaController({
        plan: plan(),
        narrationByScene: [plan().scenes[0]!.narrationAnchor],
        policy,
        primaryJudge: primary,
        escalationJudge: escalation,
        sequenceJudge: new FixtureEpisodeSequenceJudge(
          sourceGroundedPassSequence()
        ),
        cache: new InMemorySourceGroundedVisualQaCache(),
      });
      expect(primary.calls).toHaveLength(1);
      expect(escalation.calls).toHaveLength(0);
    }
  });

  it.each([["PASS"], ["BLOCK"], ["REVIEW"]] as const)(
    "escalates primary REVIEW to %s",
    async (finalVerdict) => {
      const review = {
        ...sourceGroundedPassJudgement(),
        sourceFidelity: "UNCERTAIN" as const,
        verdict: "REVIEW" as const,
        remediationRoute: "HUMAN_REVIEW" as const,
      };
      const escalated =
        finalVerdict === "PASS"
          ? sourceGroundedPassJudgement()
          : finalVerdict === "BLOCK"
            ? blocked(["SEMANTIC_DRIFT"], "SEMANTIC_EXTRACTION")
            : review;
      const escalation = new FixtureSourceGroundedSceneJudge({
        "semantic-001": escalated,
      });
      const controlled = await runSourceGroundedVisualQaController({
        plan: plan(),
        narrationByScene: [plan().scenes[0]!.narrationAnchor],
        policy,
        primaryJudge: new FixtureSourceGroundedSceneJudge({
          "semantic-001": review,
        }),
        escalationJudge: escalation,
        sequenceJudge: new FixtureEpisodeSequenceJudge(
          sourceGroundedPassSequence()
        ),
        cache: new InMemorySourceGroundedVisualQaCache(),
      });
      expect(escalation.calls).toHaveLength(1);
      expect(controlled.qa.scenes[0]!.judgement.verdict).toBe(finalVerdict);
    }
  );

  it("turns malformed output and API failure into UNAVAILABLE", async () => {
    const failingJudge = {
      judge: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const controlled = await runSourceGroundedVisualQaController({
      plan: plan(),
      narrationByScene: [plan().scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: failingJudge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(controlled.qa.scenes[0]!.judgement.verdict).toBe("UNAVAILABLE");
    expect(controlled.qa.blockers).toContain(
      "SOURCE_GROUNDED_SCENE_JUDGE_UNAVAILABLE"
    );
    expect(controlled.qa.providerRequestsAllowed).toBe(false);
  });
});

describe("cache, remediation independence, and hierarchical readiness", () => {
  it("reuses unchanged scene and sequence calls and invalidates changed narration", async () => {
    const cache = new InMemorySourceGroundedVisualQaCache();
    const judge = new FixtureSourceGroundedSceneJudge({
      "semantic-001": sourceGroundedPassJudgement(),
    });
    const sequence = new FixtureEpisodeSequenceJudge(
      sourceGroundedPassSequence()
    );
    const execute = (narration: string) =>
      runSourceGroundedVisualQaController({
        plan: plan(),
        narrationByScene: [narration],
        policy,
        primaryJudge: judge,
        sequenceJudge: sequence,
        cache,
      });
    const first = await execute(plan().scenes[0]!.narrationAnchor);
    const second = await execute(plan().scenes[0]!.narrationAnchor);
    await execute("The source narration changes materially.");
    expect(first.qa.aggregate.cacheMisses).toBe(2);
    expect(second.qa.aggregate.cacheHits).toBe(2);
    expect(judge.calls).toHaveLength(2);
    expect(sequence.calls).toHaveLength(1);
    expect(second.qa.scenes[0]!.provenance[0]).toMatchObject({
      cacheHit: true,
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("keeps advisor output separate, invokes canonical regeneration, rejudges, and remains bounded", async () => {
    const originalPlan = plan();
    const block = blocked(
      ["ACTION_OWNER_INVERSION", "CAUSAL_INVERSION"],
      "SEMANTIC_EXTRACTION"
    );
    let judgeRound = 0;
    const judge = new FixtureSourceGroundedSceneJudge(() =>
      judgeRound++ === 0 ? block : sourceGroundedPassJudgement()
    );
    const directive = {
      schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
      repairBoundary: "SEMANTIC_EXTRACTION" as const,
      visualMechanism: "problem-first-sequence" as const,
      actionOwnerRole: "expert" as const,
      sourceSemantics: {
        actorRole: "expert",
        actionOwner: "expert",
        action: "creates package before searching for customers",
        causalDirection: "package then customer search",
        polarity: "negative",
      },
      requiredVisibleEvidence: [
        "finished package exists before customer search",
      ],
      requiredDomainObjects: ["package"],
      forbiddenMisinterpretations: ["buyer-led success flow"],
      reason: "Restore the source action owner and failed causal order.",
    };
    const advisor = new FixtureSemanticRemediationAdvisor({
      "semantic-001": directive,
    });
    const regenerate = vi.fn(
      async ({ plan: current }: { readonly plan: PositioningVisualPlanV2 }) =>
        ({
          ...current,
          scenes: current.scenes.map((scene) => ({
            ...scene,
            treatment: {
              ...scene.treatment,
              actionOwnerRole: "expert" as const,
              action: "the expert creates the package before searching for customers",
            },
          })),
          assets: current.assets.map((asset) => ({
            ...asset,
            prompt: "The expert creates a finished package before searching for customers. No readable text.",
          })),
        }) as PositioningVisualPlanV2
    );
    const controlled = await runSourceGroundedVisualQaController({
      plan: originalPlan,
      narrationByScene: [originalPlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: judge,
      remediationAdvisor: advisor,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate,
    });
    expect(advisor.calls).toHaveLength(1);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(originalPlan.scenes[0]!.treatment.actionOwnerRole).toBe("buyer");
    expect(advisor.calls[0]!.scene.providerPrompt).not.toContain("replacement");
    expect(controlled.plan.scenes[0]!.treatment.actionOwnerRole).toBe("expert");
    expect(controlled.qa.remediationHistory[0]).toMatchObject({
      repairBoundary: "SEMANTIC_EXTRACTION",
      exhausted: false,
      postRemediationJudgement: { verdict: "PASS" },
    });
    expect(controlled.qa.sourceFidelityReady).toBe(true);
  });

  it("a scene BLOCK and a sequence BLOCK are non-compensatory", async () => {
    const sequenceBlock = {
      schemaVersion: SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION,
      verdict: "BLOCK" as const,
      defectCodes: [
        "ADJACENT_VISUAL_DUPLICATION" as const,
        "GENERIC_TEMPLATE_REPETITION" as const,
      ],
      repeatedGroups: [
        {
          sceneIds: ["semantic-001", "semantic-002"],
          type: "ADJACENT_VISUAL_DUPLICATION" as const,
          severity: "HIGH" as const,
          reason:
            "Same setting, composition, props, and viewer-visible arrangement.",
        },
      ],
      continuityProblems: [],
      remediationTargets: [
        {
          sceneIds: ["semantic-002"],
          target: "TREATMENT" as const,
          reason: "Advance the visible information.",
        },
      ],
      reason: "Adjacent generic template repetition is viewer-visible.",
    };
    const two = plan(2);
    const controlled = await runSourceGroundedVisualQaController({
      plan: two,
      narrationByScene: two.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: new FixtureSourceGroundedSceneJudge({
        "semantic-001": sourceGroundedPassJudgement(),
        "semantic-002": sourceGroundedPassJudgement(),
      }),
      sequenceJudge: new FixtureEpisodeSequenceJudge(sequenceBlock),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(controlled.qa.aggregate.scenePassCount).toBe(2);
    expect(controlled.qa.sequence.verdict).toBe("BLOCK");
    expect(controlled.qa.sourceFidelityReady).toBe(false);
    expect(controlled.qa.providerRequestsAllowed).toBe(false);
  });

  it("allows persistent protagonist, healthy motif reuse, and documentary camera grammar when information advances", async () => {
    const two = plan(2);
    const sequence = new FixtureEpisodeSequenceJudge((summaries) => {
      expect(new Set(summaries.map((summary) => summary.actor)).size).toBe(1);
      expect(
        summaries.every((summary) => summary.composition?.includes("eye-level"))
      ).toBe(true);
      return sourceGroundedPassSequence(
        "Continuity persists while action and information advance."
      );
    });
    const controlled = await runSourceGroundedVisualQaController({
      plan: two,
      narrationByScene: two.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: new FixtureSourceGroundedSceneJudge({
        "semantic-001": sourceGroundedPassJudgement(),
        "semantic-002": sourceGroundedPassJudgement(),
      }),
      sequenceJudge: sequence,
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(controlled.qa.sequence.verdict).toBe("PASS");
  });
});

describe("bounded source-grounded QA execution", () => {
  it("runs 32 scene evaluations concurrently while respecting global and per-pack bounds", async () => {
    const execution = {
      ...sourceGroundedQaExecutionPolicy("INTERACTIVE"),
      providerMode: "FIXTURE" as const,
      minConcurrency: 1,
      targetConcurrency: 4,
      maxConcurrency: 4,
      maxInFlightPerPack: 3,
      baseRetryDelayMs: 1,
    };
    const scheduler = new SourceGroundedQaScheduler(execution);
    let inFlight = 0;
    let maxInFlight = 0;
    const judge = {
      calls: 0,
      async judge() {
        this.calls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 3));
        inFlight -= 1;
        return { output: sourceGroundedPassJudgement() };
      },
    };
    const workload = semanticallyUniquePlan(32);
    const result = await runSourceGroundedVisualQaController({
      plan: workload,
      narrationByScene: workload.scenes.map((scene) => scene.narrationAnchor),
      policy: { ...policy, execution },
      primaryJudge: judge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
      scheduler,
    });
    expect(judge.calls).toBe(32);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(result.qa.aggregate.maxObservedConcurrency).toBeLessThanOrEqual(3);
    expect(result.qa.aggregate.primaryApiCalls).toBe(32);
  });

  it("shares one global budget fairly across packs", async () => {
    const execution = {
      ...sourceGroundedQaExecutionPolicy("INTERACTIVE"),
      providerMode: "FIXTURE" as const,
      minConcurrency: 1,
      targetConcurrency: 3,
      maxConcurrency: 3,
      maxInFlightPerPack: 2,
      baseRetryDelayMs: 1,
    };
    const scheduler = new SourceGroundedQaScheduler(execution);
    const starts: string[] = [];
    let running = 0;
    let maximum = 0;
    const tasks = ["pack-a", "pack-b"].flatMap((packId) =>
      Array.from({ length: 6 }, () =>
        scheduler.run({
          packId,
          priority: 30,
          estimatedTokens: 10,
          task: async () => {
            starts.push(packId);
            running += 1;
            maximum = Math.max(maximum, running);
            await new Promise((resolve) => setTimeout(resolve, 2));
            running -= 1;
            return packId;
          },
        })
      )
    );
    await Promise.all(tasks);
    expect(maximum).toBe(3);
    expect(new Set(starts.slice(0, 4))).toEqual(new Set(["pack-a", "pack-b"]));
    expect(scheduler.snapshot().maxObservedConcurrency).toBe(3);
  });

  it("retries rate limits, backs off, and recovers concurrency cautiously", async () => {
    const execution = {
      ...sourceGroundedQaExecutionPolicy("INTERACTIVE"),
      providerMode: "FIXTURE" as const,
      minConcurrency: 1,
      targetConcurrency: 4,
      maxConcurrency: 4,
      maxInFlightPerPack: 4,
      baseRetryDelayMs: 1,
    };
    const scheduler = new SourceGroundedQaScheduler(execution);
    let attempts = 0;
    const retried = await scheduler.run({
      packId: "rate-limited",
      priority: 1,
      estimatedTokens: 10,
      task: async () => {
        attempts += 1;
        if (attempts === 1)
          throw new SourceGroundedQaTransportError("rate limited", true, {
            retryAfterMs: 1,
          });
        return "ok";
      },
    });
    expect(retried.value).toBe("ok");
    expect(retried.telemetry).toMatchObject({
      attemptCount: 2,
      retryCount: 1,
      rateLimitEvents: 1,
      throttleEvents: 1,
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        scheduler.run({
          packId: "healthy",
          priority: 1,
          estimatedTokens: 10,
          task: async () => "ok",
        })
      )
    );
    expect(scheduler.snapshot().effectiveConcurrency).toBeGreaterThan(1);
    expect(scheduler.snapshot().effectiveConcurrency).toBeLessThanOrEqual(4);
  });

  it("resumes partial progress and single-flights identical uncached requests", async () => {
    const cache = new InMemorySourceGroundedVisualQaCache();
    const firstPlan = semanticallyUniquePlan(18);
    const firstJudge = new FixtureSourceGroundedSceneJudge(() =>
      sourceGroundedPassJudgement()
    );
    await runSourceGroundedVisualQaController({
      plan: firstPlan,
      narrationByScene: firstPlan.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: firstJudge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache,
    });
    const resumedPlan = semanticallyUniquePlan(32);
    const resumedJudge = new FixtureSourceGroundedSceneJudge(() =>
      sourceGroundedPassJudgement()
    );
    const resumed = await runSourceGroundedVisualQaController({
      plan: resumedPlan,
      narrationByScene: resumedPlan.scenes.map(
        (scene) => scene.narrationAnchor
      ),
      policy,
      primaryJudge: resumedJudge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache,
    });
    expect(resumedJudge.calls).toHaveLength(14);
    expect(resumed.qa.scenes.filter((scene) => scene.cacheHit)).toHaveLength(
      18
    );

    let providerCalls = 0;
    const slowJudge = {
      async judge() {
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { output: sourceGroundedPassJudgement() };
      },
    };
    const identical = plan();
    const controllers = [1, 2].map(() =>
      runSourceGroundedVisualQaController({
        plan: identical,
        narrationByScene: [identical.scenes[0]!.narrationAnchor],
        policy,
        primaryJudge: slowJudge,
        sequenceJudge: new FixtureEpisodeSequenceJudge(
          sourceGroundedPassSequence()
        ),
        cache: new InMemorySourceGroundedVisualQaCache(),
      })
    );
    const duplicateResults = await Promise.all(controllers);
    expect(providerCalls).toBe(1);
    expect(
      duplicateResults.reduce(
        (sum, result) => sum + result.qa.aggregate.singleFlightDeduplications,
        0
      )
    ).toBe(2);
  });

  it("rejects a mixed revision and reschedules against the changed dependency", async () => {
    const mutable = plan(4) as unknown as {
      assets: Array<{ prompt: string }>;
    } & PositioningVisualPlanV2;
    let calls = 0;
    const judge = {
      async judge() {
        calls += 1;
        if (calls === 1)
          mutable.assets[0]!.prompt = "Changed provider projection.";
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { output: sourceGroundedPassJudgement() };
      },
    };
    const result = await runSourceGroundedVisualQaController({
      plan: mutable,
      narrationByScene: mutable.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: judge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(calls).toBe(5);
    expect(result.qa.revision).toEqual(
      buildSourceGroundedQaRevision({
        plan: mutable,
        narrationByScene: mutable.scenes.map((scene) => scene.narrationAnchor),
        policy,
      })
    );
    expect(result.qa.sourceFidelityReady).toBe(true);
  });
});

describe("beat-aware source-grounded hierarchy", () => {
  it("does not let a parent-scene PASS authorize a blocked new-image beat", async () => {
    const fixture = multiBeatPlan();
    const blockedBeat: SourceGroundedVisualBeatJudgement = {
      ...sourceGroundedPassBeatJudgement(),
      sourceFidelity: "FAIL",
      sourceSupport: "UNSUPPORTED_INFERENCE",
      newInformationGrounded: false,
      causalDirectionCorrect: false,
      verdict: "BLOCK",
      defectCodes: ["NEW_INFORMATION_UNSUPPORTED", "UNSUPPORTED_CAUSAL_CLAIM"],
      reason: "The second beat invents an unsupported outcome.",
    };
    const sequence = new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence());
    const result = await runSourceGroundedVisualQaController({
      plan: fixture,
      narrationByScene: fixture.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: beatAwareJudge((beatId) =>
        beatId.endsWith("B02") ? blockedBeat : sourceGroundedPassBeatJudgement()
      ),
      sequenceJudge: sequence,
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(result.qa.scenes).toHaveLength(1);
    expect(result.qa.scenes[0]?.judgement.verdict).toBe("PASS");
    expect(result.qa.aggregate.beatPassCount).toBe(1);
    expect(result.qa.aggregate.beatBlockCount).toBe(1);
    expect(result.qa.sourceFidelityReady).toBe(false);
    expect(result.qa.blockers).toContain("SOURCE_GROUNDED_BEAT_BLOCKED");
    expect(sequence.calls).toHaveLength(0);
  });

  it("batches child beats and gives the sequence judge the ordered beat plan", async () => {
    const fixture = multiBeatPlan();
    const judge = beatAwareJudge(() => sourceGroundedPassBeatJudgement());
    const sequence = new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence());
    const result = await runSourceGroundedVisualQaController({
      plan: fixture,
      narrationByScene: fixture.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: judge,
      sequenceJudge: sequence,
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(result.qa.beats.map((entry) => entry.beatId)).toEqual([
      "semantic-001-B01",
      "semantic-001-B02",
    ]);
    expect(sequence.calls[0]?.map((entry) => entry.visualBeatId)).toEqual([
      "semantic-001-B01",
      "semantic-001-B02",
    ]);
    expect(result.qa.aggregate.beatPrimaryApiCalls).toBe(1);
    expect(result.qa.aggregate.primaryApiCalls).toBe(2);
    expect(result.qa.sourceFidelityReady).toBe(true);
  });
});

describe("cost and identity controls", () => {
  it("keeps cache and revision identity independent of execution profile", async () => {
    const captured = new FixtureSourceGroundedSceneJudge({
      "semantic-001": sourceGroundedPassJudgement(),
    });
    const fixturePlan = plan();
    await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: captured,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    const payload = captured.calls[0]!;
    const identity = sourceGroundedSceneCacheKey({
      payload,
      policyIdentity: policy.policyIdentity,
      model: policy.sceneJudge,
      instructionVersion:
        "veronica-source-grounded-scene-judge-instructions.v1",
    });
    expect(identity).toBe(
      sourceGroundedSceneCacheKey({
        payload,
        policyIdentity: policy.policyIdentity,
        model: policy.sceneJudge,
        instructionVersion:
          "veronica-source-grounded-scene-judge-instructions.v1",
      })
    );
    const interactive = buildSourceGroundedQaRevision({
      plan: fixturePlan,
      narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
      policy: {
        ...policy,
        execution: sourceGroundedQaExecutionPolicy("INTERACTIVE"),
      },
    });
    const cost = buildSourceGroundedQaRevision({
      plan: fixturePlan,
      narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
      policy: {
        ...policy,
        execution: sourceGroundedQaExecutionPolicy("COST_OPTIMIZED"),
      },
    });
    expect(cost.revisionId).toBe(interactive.revisionId);
  });

  it("skips the advisor for deterministic text reprojection and coalesces earliest repairs", async () => {
    const judgement = blocked(
      ["TEXT_DEPENDENCY_CONFLICT"],
      "PROVIDER_PROJECTION"
    );
    const fixturePlan = plan();
    let judgeCalls = 0;
    const judge = new FixtureSourceGroundedSceneJudge(() =>
      judgeCalls++ === 0 ? judgement : sourceGroundedPassJudgement()
    );
    const regenerate = vi.fn(
      async ({ plan: current }: { plan: PositioningVisualPlanV2 }) =>
        ({
          ...current,
          assets: current.assets.map((asset) => ({
            ...asset,
            prompt: `${asset.prompt} Reprojected without readable text.`,
          })),
        }) as PositioningVisualPlanV2
    );
    const result = await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: judge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate,
    });
    expect(result.qa.aggregate.remediationApiCalls).toBe(0);
    expect(result.qa.remediationHistory[0]!.directive?.repairBoundary).toBe(
      "PROVIDER_PROJECTION"
    );
    expect(result.qa.sourceFidelityReady).toBe(true);

    const providerDirective = deterministicRemediationDirective({
      scene: judge.calls[0]!,
      judgement,
    })!;
    const earlier = {
      ...providerDirective,
      repairBoundary: "SEMANTIC_EXTRACTION" as const,
    };
    expect(
      coalesceSourceGroundedRemediationDirectives([
        { sceneId: "semantic-001", directive: providerDirective },
        { sceneId: "semantic-001", directive: earlier },
      ])
    ).toEqual([{ sceneId: "semantic-001", directive: earlier }]);
  });

  it("benchmarks the required blocker/pass corpus before accepting cheaper reasoning", async () => {
    const seedPlan = plan();
    const capture = new FixtureSourceGroundedSceneJudge({
      "semantic-001": sourceGroundedPassJudgement(),
    });
    await runSourceGroundedVisualQaController({
      plan: seedPlan,
      narrationByScene: [seedPlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: capture,
      sequenceJudge: new FixtureEpisodeSequenceJudge(
        sourceGroundedPassSequence()
      ),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    const basePayload = capture.calls[0]!;
    const cases: readonly [
      string,
      readonly SemanticDefectCode[],
      SemanticFaultBoundary,
    ][] = [
      ["actor-inversion", ["ACTOR_INVERSION"], "SEMANTIC_EXTRACTION"],
      [
        "action-owner-inversion",
        ["ACTION_OWNER_INVERSION"],
        "SEMANTIC_EXTRACTION",
      ],
      ["causal-inversion", ["CAUSAL_INVERSION"], "SEMANTIC_EXTRACTION"],
      ["polarity-inversion", ["POLARITY_INVERSION"], "SEMANTIC_EXTRACTION"],
      ["state-role-inversion", ["STATE_ROLE_INVERSION"], "STATE_MODEL"],
      ["website-domain-loss", ["SOURCE_DOMAIN_LOST"], "VISUAL_MECHANISM"],
      ["offer-domain-loss", ["SOURCE_DOMAIN_LOST"], "VISUAL_MECHANISM"],
      [
        "content-planning-domain-loss",
        ["SOURCE_DOMAIN_LOST"],
        "VISUAL_MECHANISM",
      ],
      ["text-dependency", ["TEXT_DEPENDENCY_CONFLICT"], "PROVIDER_PROJECTION"],
      [
        "abstract-state",
        ["ABSTRACT_UNRENDERABLE_STATE"],
        "PROVIDER_PROJECTION",
      ],
      ["under-coverage", ["SEVERE_UNDER_COVERAGE"], "SEGMENTATION"],
    ];
    const outputs = new Map<string, SourceGroundedSceneJudgement>(
      cases.map(([id, codes, boundary]) => [id, blocked(codes, boundary)])
    );
    outputs.set("valid-metaphor", sourceGroundedPassJudgement());
    outputs.set("healthy-continuity", sourceGroundedPassJudgement());
    const corpus = [...outputs.entries()].map(([id, output]) => ({
      id,
      payload: { ...basePayload, sceneId: id },
      expectedVerdict: output.verdict as "PASS" | "BLOCK",
      expectedDefectCodes: output.defectCodes,
    }));
    const benchmarkJudge = new FixtureSourceGroundedSceneJudge(
      Object.fromEntries(outputs)
    );
    const report = await benchmarkSourceGroundedReasoningPolicies({
      corpus,
      judge: benchmarkJudge,
      current: { model: "gpt-5.4-mini", reasoningEffort: "low" },
      candidate: { model: "gpt-5.4-mini", reasoningEffort: "none" },
      execution: sourceGroundedQaExecutionPolicy("INTERACTIVE", {
        providerMode: "FIXTURE",
      }),
    });
    expect(report.current).toHaveLength(13);
    expect(report.candidate).toHaveLength(13);
    expect(report.candidateAccepted).toBe(true);
  });

  it("micro-batches 5 Short scenes into 1 request and 27 long scenes into 6 requests", async () => {
    const short = {
      ...semanticallyUniquePlan(5),
      format: "short",
    } as PositioningVisualPlanV2;
    const shortJudge = new FixtureSourceGroundedSceneJudge(() =>
      sourceGroundedPassJudgement()
    );
    const shortResult = await runSourceGroundedVisualQaController({
      plan: short,
      narrationByScene: short.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: shortJudge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(shortJudge.requestCount).toBe(1);
    expect(shortJudge.calls).toHaveLength(5);
    expect(shortResult.qa.aggregate.primaryApiCalls).toBe(1);

    const long = semanticallyUniquePlan(27);
    const longJudge = new FixtureSourceGroundedSceneJudge(() =>
      sourceGroundedPassJudgement()
    );
    const longResult = await runSourceGroundedVisualQaController({
      plan: long,
      narrationByScene: long.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: longJudge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(longJudge.requestCount).toBe(6);
    expect(longJudge.calls).toHaveLength(27);
    expect(longResult.qa.aggregate.primaryApiCalls).toBe(6);
  });

  it("bypasses deterministic advice and does not rejudge no-op segmentation", async () => {
    const underCovered = blocked(["SEVERE_UNDER_COVERAGE"], "SEGMENTATION");
    const judge = new FixtureSourceGroundedSceneJudge(() => underCovered);
    const advisor = new FixtureSemanticRemediationAdvisor(() => {
      throw new Error("advisor must be bypassed");
    });
    const fixturePlan = plan();
    const regenerate = vi.fn(async () => fixturePlan);
    const result = await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: judge,
      remediationAdvisor: advisor,
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate,
    });
    expect(advisor.requestCount).toBe(0);
    expect(result.qa.aggregate.advisorBypassCount).toBe(1);
    expect(result.qa.aggregate.noOpRemediationCount).toBe(1);
    expect(result.qa.aggregate.rejudgeRequestCount).toBe(0);
    expect(result.qa.aggregate.scenesRejudged).toBe(0);
    expect(judge.calls).toHaveLength(1);
    expect(result.qa.blockers).toContain("REMEDIATION_NO_SEMANTIC_CHANGE");
  });

  it("rejudges only changed scenes and enforces one automatic round", async () => {
    const two = semanticallyUniquePlan(2);
    const seen = new Map<string, number>();
    const judge = new FixtureSourceGroundedSceneJudge((payload) => {
      const count = seen.get(payload.sceneId) ?? 0;
      seen.set(payload.sceneId, count + 1);
      return payload.sceneId === "semantic-001" && count === 0
        ? blocked(["TEXT_DEPENDENCY_CONFLICT"], "PROVIDER_PROJECTION")
        : sourceGroundedPassJudgement();
    });
    const regenerate = vi.fn(
      async ({ plan: current }: { plan: PositioningVisualPlanV2 }) => ({
        ...current,
        assets: current.assets.map((asset) =>
          asset.sceneId === "semantic-001"
            ? { ...asset, prompt: `${asset.prompt} changed` }
            : asset
        ),
      }) as PositioningVisualPlanV2
    );
    const result = await runSourceGroundedVisualQaController({
      plan: two,
      narrationByScene: two.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: judge,
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate,
    });
    expect(seen.get("semantic-001")).toBe(2);
    expect(seen.get("semantic-002")).toBe(1);
    expect(result.qa.aggregate.scenesRejudged).toBe(1);
    expect(result.qa.aggregate.rejudgeRequestCount).toBe(1);
    expect(regenerate).toHaveBeenCalledTimes(1);

    const unresolvedPlan = plan();
    const unresolvedJudge = new FixtureSourceGroundedSceneJudge(() =>
      blocked(["TEXT_DEPENDENCY_CONFLICT"], "PROVIDER_PROJECTION")
    );
    const unresolvedRegenerate = vi.fn(
      async ({ plan: current }: { plan: PositioningVisualPlanV2 }) => ({
        ...current,
        assets: current.assets.map((asset) => ({
          ...asset,
          prompt: `${asset.prompt} one-round-change`,
        })),
      }) as PositioningVisualPlanV2
    );
    const unresolved = await runSourceGroundedVisualQaController({
      plan: unresolvedPlan,
      narrationByScene: [unresolvedPlan.scenes[0]!.narrationAnchor],
      policy,
      primaryJudge: unresolvedJudge,
      cache: new InMemorySourceGroundedVisualQaCache(),
      regenerate: unresolvedRegenerate,
    });
    expect(unresolvedRegenerate).toHaveBeenCalledTimes(1);
    expect(unresolvedJudge.requestCount).toBe(2);
    expect(unresolved.qa.sourceFidelityReady).toBe(false);
    expect(unresolved.qa.blockers).toContain("SOURCE_GROUNDED_REMEDIATION_EXHAUSTED");
  });

  it("blocks provider request N+1 before dispatch", async () => {
    const execution = sourceGroundedQaExecutionPolicy("INTERACTIVE", {
      providerMode: "LIVE_AUTHORIZED",
      maxRetries: 0,
      modelPricing: {
        test: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 },
      },
      budget: {
        authorizationId: "fixture-budget",
        maxProviderCalls: 1,
        maxEstimatedCostUsd: 1,
        maxFlagshipCallsPerPack: 1,
      },
    });
    const scheduler = new SourceGroundedQaScheduler(execution);
    let dispatches = 0;
    const submit = () => scheduler.run({
      packId: "pack",
      priority: 1,
      estimatedTokens: 2,
      execution,
      provider: {
        model: "test",
        flagship: false,
        estimatedInputTokens: 1,
        estimatedOutputTokens: 1,
        estimatedCostUsd: 0.000002,
      },
      task: async () => {
        dispatches += 1;
        return "ok";
      },
    });
    await submit();
    await expect(submit()).rejects.toBeInstanceOf(SourceGroundedQaBudgetError);
    expect(dispatches).toBe(1);
    expect(scheduler.snapshot()).toMatchObject({
      providerCallsReserved: 1,
      budgetStatus: "EXHAUSTED",
    });
  });

  it("is cache-only by default and preserves per-scene cache identity across batching", async () => {
    const fixturePlan = semanticallyUniquePlan(5);
    let forbiddenCalls = 0;
    const forbiddenJudge = {
      async judge() {
        forbiddenCalls += 1;
        return { output: sourceGroundedPassJudgement() };
      },
    };
    const cacheOnly = await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: fixturePlan.scenes.map((scene) => scene.narrationAnchor),
      policy: { ...policy, execution: sourceGroundedQaExecutionPolicy() },
      primaryJudge: forbiddenJudge,
      cache: new InMemorySourceGroundedVisualQaCache(),
    });
    expect(forbiddenCalls).toBe(0);
    expect(cacheOnly.qa.aggregate.budgetStatus).toBe("CACHE_ONLY");
    expect(cacheOnly.qa.sourceFidelityReady).toBe(false);

    const durableCache = new InMemorySourceGroundedVisualQaCache();
    const batched = new FixtureSourceGroundedSceneJudge(() =>
      sourceGroundedPassJudgement()
    );
    await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: fixturePlan.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: batched,
      cache: durableCache,
    });
    let singletonCalls = 0;
    const singleton = {
      async judge() {
        singletonCalls += 1;
        return { output: sourceGroundedPassJudgement() };
      },
    };
    const resumed = await runSourceGroundedVisualQaController({
      plan: fixturePlan,
      narrationByScene: fixturePlan.scenes.map((scene) => scene.narrationAnchor),
      policy,
      primaryJudge: singleton,
      cache: durableCache,
    });
    expect(singletonCalls).toBe(0);
    expect(resumed.qa.scenes.every((scene) => scene.cacheHit)).toBe(true);
  });

  it("negative-caches deterministic malformed output without treating it as PASS", async () => {
    const fixturePlan = plan();
    const cache = new InMemorySourceGroundedVisualQaCache();
    let providerCalls = 0;
    const malformed = {
      async judge() {
        providerCalls += 1;
        return { output: { verdict: "PASS" } };
      },
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await runSourceGroundedVisualQaController({
        plan: fixturePlan,
        narrationByScene: [fixturePlan.scenes[0]!.narrationAnchor],
        policy,
        primaryJudge: malformed,
        cache,
      });
      expect(result.qa.scenes[0]!.judgement.verdict).toBe("UNAVAILABLE");
      expect(result.qa.sourceFidelityReady).toBe(false);
    }
    expect(providerCalls).toBe(1);
  });
});
