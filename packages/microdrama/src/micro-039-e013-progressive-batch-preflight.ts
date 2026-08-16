import type {
  CreativeRecommendationRevision,
  MicrodramaAssetGenerationApproval,
  MicrodramaCanaryPreflightResult,
  MicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";
import {
  evaluateBoundedProductionAndPublicationBatchCanaryPreflight,
  planCreativeRecommendation,
} from "@mediaforge/domain";
import {
  NARRATIVE_SCHEMA_VERSION,
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  seriesIdSchema,
  type NarrativeSnapshotPayload,
} from "@mediaforge/narrative-core";

import {
  acceptCreativeRecommendationForPlanning,
  validateCreativeRecommendationCanonSafety,
} from "./learning-admission.js";
import {
  assertMicro039E013EpisodeRangeAllowed,
  buildMicro039E013BatchBindingProbe,
  MICRO_039_E013_EPISODE_RANGE,
  MICRO_039_E013_TASK_ID,
} from "./micro-039-e013-batch-bindings.js";
import {
  micro036EvidenceProvesBatchDone,
  micro038EvidenceProvesPublicDone,
  micro039E012EvidenceProvesProgressiveDone,
  micro042EvidenceProvesReadDone,
  type Micro039E013UpstreamEvidence,
} from "./micro-039-e013-batch-evidence.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

export const MICRO_039_E013_LEARNING_ADMISSION_ID =
  "admission.micro-039-e013.e013.hook-presentation";

function anchoredSnapshotForE012(): NarrativeSnapshotPayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    snapshotId: narrativeSnapshotIdSchema.parse("snapshot.season-1.e012"),
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    episodeId: "episode.e012",
    acceptedSeriesBibleRevisionId: narrativeRevisionIdSchema.parse(
      "rev.series-bible.v5-remediated"
    ),
    characterStates: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        characterId: "mara",
        goal: "Decode the signal",
        belief: "The loop is real",
        emotionalState: "anxious",
        injuriesAndStatus: [],
        provenanceRevisionIds: [],
      },
    ],
    relationshipStates: [],
    secrets: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        secretId: narrativeSecretIdSchema.parse("secret.signal-origin"),
        objectiveFact: "The signal originates outside the loop",
        holderCharacterIds: ["mara"],
        affectedCharacterIds: ["mara"],
        audienceKnowledge: "unknown",
        revealConstraints: ["forbidden before E050"],
        revealStatus: "hidden",
        revealProvenanceRevisionIds: [],
      },
    ],
    knowledgeClaims: [],
    promises: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        promiseId: narrativePromiseIdSchema.parse("promise.packet-truth"),
        description: "Reveal who sent the packet",
        plantedEpisodeId: "episode.e001",
        payoffWindowStartEpisodeId: "episode.e020",
        payoffWindowEndEpisodeId: "episode.e030",
        progression: "Escalate suspicion",
        status: "open",
      },
    ],
    provenance: {
      sourceKind: "acceptance",
      sourceRevisionIds: [
        narrativeRevisionIdSchema.parse("rev.snapshot.season-1.e012"),
      ],
    },
  };
}

export function evaluateMicro039E013LearningAdmission(input: {
  readonly evaluatedAt: string;
}): {
  readonly ok: boolean;
  readonly admissionId: string | null;
  readonly message?: string;
  readonly recommendation: CreativeRecommendationRevision;
} {
  const recommendation = planCreativeRecommendation({
    recommendationId: "recommendation.micro-039-e013.e013.hook",
    revisionNumber: 1,
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    findingRevisionIds: ["finding.micro-042.public-video-read"],
    targetEpisodeIds: ["E013"],
    targetPlanningHorizons: ["current_episode"],
    canonImpact: {
      kind: "planning_only",
      surfaces: ["hook_presentation"],
    },
    guidance:
      "Tighten the cold-open hook presentation for E013 based on public-video counters.",
    status: "VALIDATED",
    recordedAt: input.evaluatedAt,
  });

  const context = {
    anchoredSnapshot: anchoredSnapshotForE012(),
    anchoredSnapshotRevisionId: "rev.snapshot.season-1.e012",
    lastAcceptedEpisodeNumber: 12,
  };

  const validation = validateCreativeRecommendationCanonSafety({
    recommendation,
    context,
  });
  if (!validation.ok) {
    return {
      ok: false,
      admissionId: null,
      message: validation.issues.map((issue) => issue.code).join(","),
      recommendation,
    };
  }

  const acceptance = acceptCreativeRecommendationForPlanning({
    recommendation,
    context,
    admissionId: MICRO_039_E013_LEARNING_ADMISSION_ID,
    acceptedBy: "operator.microdrama",
    acceptedAt: input.evaluatedAt,
  });
  if (!acceptance.ok) {
    return {
      ok: false,
      admissionId: null,
      message: "LEARNING_ADMISSION_REJECTED",
      recommendation,
    };
  }

  return {
    ok: true,
    admissionId: MICRO_039_E013_LEARNING_ADMISSION_ID,
    recommendation,
  };
}

export type Micro039E013ProgressiveBatchPreflightInput = {
  readonly evaluatedAt: string;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly assetGenerationApproval?: MicrodramaAssetGenerationApproval;
  readonly revisionSet: readonly string[];
  readonly micro036Evidence?: Micro039E013UpstreamEvidence | null;
  readonly micro038Evidence?: Micro039E013UpstreamEvidence | null;
  readonly micro039E012Evidence?: Micro039E013UpstreamEvidence | null;
  readonly micro042Evidence?: Micro039E013UpstreamEvidence | null;
  readonly storyScriptReady?: boolean;
  readonly selectedAudioApproved?: boolean;
  readonly visualRenderReady?: boolean;
  readonly publicationReady?: boolean;
  readonly costBudgetApproved?: boolean;
  readonly publicationApproved?: boolean;
};

export type Micro039E013ProgressiveBatchPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: ReturnType<typeof buildMicro039E013BatchBindingProbe>;
  readonly learningAdmissionId: string | null;
  readonly rangeAdmission: ReturnType<typeof assertMicro039E013EpisodeRangeAllowed>;
};

export function evaluateMicro039E013ProgressiveBatchPreflight(
  input: Micro039E013ProgressiveBatchPreflightInput
): Micro039E013ProgressiveBatchPreflightResult {
  const bindingProbe =
    input.operatorAuthorization &&
    "episodeRange" in input.operatorAuthorization.bindings
      ? input.operatorAuthorization.bindings
      : buildMicro039E013BatchBindingProbe({ revisionSet: input.revisionSet });

  const rangeAdmission = assertMicro039E013EpisodeRangeAllowed(bindingProbe.episodeRange);
  const learning = evaluateMicro039E013LearningAdmission({
    evaluatedAt: input.evaluatedAt,
  });

  const assetApproved =
    input.assetGenerationApproval?.state === "active" &&
    input.assetGenerationApproval.taskId === MICRO_039_E013_TASK_ID;

  const readinessGates = [
    {
      gate: "STORY_SCRIPT_READY",
      ok: input.storyScriptReady !== false,
      ...(input.storyScriptReady === false
        ? { message: "Story script not ready for progressive batch." }
        : {}),
    },
    {
      gate: "SELECTED_AUDIO_APPROVED",
      ok: input.selectedAudioApproved !== false,
      ...(input.selectedAudioApproved === false
        ? { message: "Selected audio not approved." }
        : {}),
    },
    {
      gate: "VISUAL_RENDER_READY",
      ok: input.visualRenderReady !== false,
      ...(input.visualRenderReady === false
        ? { message: "Visual render not ready." }
        : {}),
    },
    {
      gate: "PUBLICATION_READY",
      ok: input.publicationReady !== false && micro038EvidenceProvesPublicDone(input.micro038Evidence ?? null),
      ...(!(input.publicationReady !== false && micro038EvidenceProvesPublicDone(input.micro038Evidence ?? null))
        ? { message: "Publication readiness requires MICRO-038 public canary evidence." }
        : {}),
    },
    {
      gate: "ASSET_GENERATION_APPROVED",
      ok: assetApproved,
      ...(assetApproved ? {} : { message: "Asset generation approval missing." }),
    },
    {
      gate: "COST_BUDGET_APPROVED",
      ok: input.costBudgetApproved !== false,
      ...(input.costBudgetApproved === false
        ? { message: "Cost budget not approved." }
        : {}),
    },
    {
      gate: "PUBLICATION_APPROVED",
      ok: input.publicationApproved !== false,
      ...(input.publicationApproved === false
        ? { message: "Publication not approved for progressive batch." }
        : {}),
    },
    {
      gate: "UPSTREAM_BOUNDED_BATCH_DONE",
      ok: micro036EvidenceProvesBatchDone(input.micro036Evidence ?? null),
      ...(micro036EvidenceProvesBatchDone(input.micro036Evidence ?? null)
        ? {}
        : { message: "MICRO-036 bounded batch evidence missing." }),
    },
    {
      gate: "UPSTREAM_PROGRESSIVE_E012_BATCH_DONE",
      ok: micro039E012EvidenceProvesProgressiveDone(input.micro039E012Evidence ?? null),
      ...(micro039E012EvidenceProvesProgressiveDone(input.micro039E012Evidence ?? null)
        ? {}
        : { message: "MICRO-039 E012 progressive batch evidence missing." }),
    },
    {
      gate: "UPSTREAM_PUBLIC_VIDEO_READ_DONE",
      ok: micro042EvidenceProvesReadDone(input.micro042Evidence ?? null),
      ...(micro042EvidenceProvesReadDone(input.micro042Evidence ?? null)
        ? {}
        : { message: "MICRO-042 read evidence missing." }),
    },
    {
      gate: "LEARNING_ADMISSION_READY",
      ok: learning.ok && rangeAdmission.allowed,
      ...(!(learning.ok && rangeAdmission.allowed)
        ? {
            message:
              learning.message ??
              rangeAdmission.reason ??
              "Learning admission or episode range blocked.",
          }
        : {}),
    },
  ];

  const preflight = evaluateBoundedProductionAndPublicationBatchCanaryPreflight({
    taskId: MICRO_039_E013_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    readinessGates,
    bindingProbe,
    permittedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: true,
      publicationCallsAllowed: true,
    },
    requestedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: true,
      publicationCallsAllowed: true,
    },
    evaluatedAt: input.evaluatedAt,
  });

  return {
    preflight,
    bindingProbe,
    learningAdmissionId: learning.admissionId,
    rangeAdmission,
  };
}

export { MICRO_039_E013_EPISODE_RANGE };
