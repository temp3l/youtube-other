import { createHash } from "node:crypto";
import {
  veronicaFallbackPolicySchema,
  veronicaMediaPlacementSchema,
  veronicaMediaPlanSchema,
  veronicaPreparedAssetSchema,
  veronicaProvenanceRecordSchema,
  veronicaVisualStateSchema,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";
import type { VeronicaIngestedAsset } from "../ingestion/secure-ingest.js";
import { buildNarrationAnchors, buildNarrationRevision } from "../narration/revision.js";
import { hashCanonical } from "../canonical-json.js";
import { evaluateApprovalEligibility } from "../approval/eligibility.js";
import { computePlannerMetrics } from "../metrics/planner-metrics.js";
import {
  sceneVisualPolicyConfigurationHash,
  selectSceneVisualMedia,
} from "@mediaforge/visual-planning";

export interface SemanticPlannerInput {
  readonly episodeId: string;
  readonly originalNarration: string;
  readonly revisedNarration?: string;
  readonly assets: readonly VeronicaIngestedAsset[];
  readonly targetLanguage: string;
  readonly sourceLanguage?: string;
  /** Canonical source-led revision identity, when narration was planned upstream. */
  readonly narrationRevisionId?: string;
  /** Stable source-led scene/line lineage; visual semantics remain locale-independent. */
  readonly narrationOutline?: readonly {
    readonly sceneId: string;
    readonly narrationLineId: string;
  }[];
  readonly overrides?: Readonly<
    Record<
      string,
      {
        readonly requirement?: "required" | "preferred" | "optional";
        readonly candidateId?: string;
      }
    >
  >;
}

function stableId(prefix: string, episodeId: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${episodeId}:${value}`).digest("hex").slice(0, 12)}`;
}

function chooseCandidates(asset: VeronicaIngestedAsset) {
  return asset.extractedCandidates.slice(0, 3);
}

export function buildSemanticMediaPlan(input: SemanticPlannerInput): VeronicaMediaPlan {
  const revision = buildNarrationRevision({
    revisionId: input.narrationRevisionId ?? `revision-${input.episodeId}`,
    originalScript: input.originalNarration,
    ...(input.revisedNarration ? { revisedScript: input.revisedNarration } : {}),
  });
  const anchors = buildNarrationAnchors({
    episodeId: input.episodeId,
    revisedScript: revision.revisedScript,
  });
  const sourceAssets = input.assets.map((asset) => ({
    assetId: asset.assetId,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    checksum: asset.checksum,
    byteLength: asset.byteLength,
    mediaKind: asset.mediaKind,
    ...(asset.sourceKind ? { sourceKind: asset.sourceKind } : {}),
    ...(asset.displayPolicy ? { displayPolicy: asset.displayPolicy } : {}),
    ...(asset.immutableOriginal ? { immutableOriginal: true as const } : {}),
  }));
  const visualStates: VeronicaMediaPlan["visualStates"] = [];
  const preparedAssets: VeronicaMediaPlan["preparedAssets"] = [];
  const provenance: VeronicaMediaPlan["provenance"] = [];
  const placements: VeronicaMediaPlan["placements"] = [];
  const claims: VeronicaMediaPlan["claims"] = [];
  const visualPolicy = selectSceneVisualMedia({
    contentProfileId: "veronicabenini",
    narrationRevisionId: revision.revisionId,
    effectiveConfigurationHash: sceneVisualPolicyConfigurationHash({
      narrationRevisionId: revision.revisionId,
      sources: input.assets.map((asset) => ({
        sourceAssetId: asset.assetId,
        checksum: asset.checksum,
        ...(asset.displayPolicy ? { displayPolicy: asset.displayPolicy } : {}),
      })),
    }),
    dependencyIdentity: Object.fromEntries(
      input.assets
        .map((asset) => [asset.assetId, asset.checksum] as const)
        .sort(([a], [b]) => a.localeCompare(b, "en")),
    ),
    scenes: anchors.map((anchor, index) => ({
      sceneId: input.narrationOutline?.[index]?.sceneId ?? anchor.sceneId,
      narrationLineId: input.narrationOutline?.[index]?.narrationLineId ?? anchor.anchorId,
    })),
    sources: input.assets.map((asset) => ({
      sourceAssetId: asset.assetId,
      checksum: asset.checksum,
      ...(asset.displayPolicy ? { displayPolicy: asset.displayPolicy } : {}),
      candidates: chooseCandidates(asset).map((candidate) => ({
        candidateId: candidate.candidateId,
        provenanceId: stableId("prov", input.episodeId, `${asset.assetId}:${candidate.candidateId}`),
      })),
    })),
  });

  anchors.forEach((anchor, anchorIndex) => {
    const selection = visualPolicy.selections[anchorIndex];
    const asset = selection?.sourceAssetId
      ? input.assets.find((candidate) => candidate.assetId === selection.sourceAssetId)
      : undefined;
    if (!asset) return;
    const override = input.overrides?.[asset.assetId];
    const candidates = chooseCandidates(asset);
    const candidate =
      candidates.find((entry) => entry.candidateId === override?.candidateId) ??
      candidates.find((entry) => entry.candidateId === selection?.candidateId);
    if (!candidate) return;
    const provenanceId = stableId("prov", input.episodeId, `${asset.assetId}:${candidate.candidateId}`);
    const sourceReference = {
      sourceAssetId: asset.assetId,
      ...(candidate.pageNumber ? { pageNumber: candidate.pageNumber } : {}),
      ...(candidate.slideNumber ? { slideNumber: candidate.slideNumber } : {}),
      extractionMethod: asset.mediaKind === "pptx" ? "pptx-slide-raster" : "page-raster",
    };
    provenance.push(
      veronicaProvenanceRecordSchema.parse({
        provenanceId,
        sourceAssetId: asset.assetId,
        originalFilename: asset.originalFilename,
        checksum: asset.checksum,
        sourceReference,
        transformationChain: ["adapt"],
        language: input.sourceLanguage ?? "und",
        attributionMode: "on-screen",
        confidence: 0.9,
        warningCodes: [],
      }),
    );
    const stateIds: string[] = [];
    const stateCount = asset.mediaKind === "pptx" || asset.mediaKind === "pdf" ? 2 : 1;
    for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
      const stateId = stableId("state", input.episodeId, `${anchor.anchorId}:${stateIndex}`);
      const preparedAssetId = stableId("prep", input.episodeId, `${stateId}:landscape`);
      const preparedPortraitId = stableId("prep", input.episodeId, `${stateId}:portrait`);
      const needsTranslation =
        input.sourceLanguage && input.sourceLanguage !== input.targetLanguage;
      const translationStatus = needsTranslation
        ? {
            sourceLanguage: input.sourceLanguage!,
            targetLanguage: input.targetLanguage,
            status:
              candidate.textPreview && candidate.textPreview.length > 80
                ? ("low-confidence" as const)
                : ("translated" as const),
            confidence: candidate.textPreview ? 0.72 : 0.95,
            requiresApproval: Boolean(candidate.textPreview && candidate.textPreview.length > 80),
          }
        : undefined;
      visualStates.push(
        veronicaVisualStateSchema.parse({
          stateId,
          sourceAssetId: asset.assetId,
          sequenceIndex: stateIndex,
          treatment: stateIndex === 0 ? "adapt" : "preserve",
          focusLabel: stateIndex === 0 ? "establishing" : "detail-focus",
          preparedAssetId,
          portraitPreparedAssetId: preparedPortraitId,
          provenanceId,
        }),
      );
      const transformationFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            transformationChain: ["adapt"],
            aspectRatio: "16:9",
            width: 1920,
            height: 1080,
            rendererProfile: "veronica-ffmpeg.v1",
          }),
        )
        .digest("hex");
      const portraitTransformationFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            transformationChain: ["adapt"],
            aspectRatio: "9:16",
            width: 1080,
            height: 1920,
            rendererProfile: "veronica-ffmpeg.v1",
          }),
        )
        .digest("hex");
      preparedAssets.push(
        veronicaPreparedAssetSchema.parse({
          preparedAssetId,
          aspectRatio: "16:9",
          checksum: "0".repeat(64),
          relativePath: `prepared/landscape/${preparedAssetId}.png`,
          width: 1920,
          height: 1080,
          provenanceId,
          sourceChecksum: asset.checksum,
          transformationFingerprint,
          ...(translationStatus ? { translationStatus } : {}),
        }),
        veronicaPreparedAssetSchema.parse({
          preparedAssetId: preparedPortraitId,
          aspectRatio: "9:16",
          checksum: "0".repeat(64),
          relativePath: `prepared/portrait/${preparedPortraitId}.png`,
          width: 1080,
          height: 1920,
          provenanceId,
          sourceChecksum: asset.checksum,
          transformationFingerprint: portraitTransformationFingerprint,
          ...(translationStatus ? { translationStatus } : {}),
        }),
      );
      stateIds.push(stateId);
    }
    const claimId = stableId("claim", input.episodeId, anchor.exactText);
    claims.push({
      claimId,
      text: anchor.exactText,
      sourceReferenceIds: [provenanceId],
      confidence: 0.88,
    });
    const requirement = override?.requirement ?? (anchorIndex === 0 ? "required" : "preferred");
    placements.push(
      veronicaMediaPlacementSchema.parse({
        placementId: stableId("place", input.episodeId, anchor.anchorId),
        anchorId: anchor.anchorId,
        aspectRatio: "16:9",
        visualStateIds: stateIds,
        dwellDurationSeconds: 4,
        fallback: veronicaFallbackPolicySchema.parse({
          requirement,
          fallbackAllowed: requirement !== "required",
          ...(requirement === "optional"
            ? {
                fallbackAssetId: asset.assetId,
                fallbackReason: "Optional placement may defer to narration-only card.",
              }
            : {}),
        }),
        claimIds: [claimId],
      }),
    );
  });

  const landscapePlacements = placements;
  const portraitPlacements = placements.map((placement) =>
    veronicaMediaPlacementSchema.parse({
      ...placement,
      placementId: `${placement.placementId}-portrait`,
      aspectRatio: "9:16",
    }),
  );

  const draftPlan = {
    schemaVersion: "veronica-media-plan.v1" as const,
    plannerVersion: "veronica-media-planner.v1.0" as const,
    promptRevision: "veronica-media-integration-agentic-goal-v2",
    modelRevision: "deterministic-heuristic.v1",
    episodeId: input.episodeId,
    narrationRevisionId: revision.revisionId,
    sourceChecksums: sourceAssets.map((asset) => asset.checksum),
    designSystemRevision: "editorial-documentary.v1",
    rendererProfile: "veronica-ffmpeg.v1",
    approvalState: "review" as const,
    sourceAssets,
    claims,
    narrationAnchors: anchors,
    narrationRevision: revision,
    sceneVisualPlan: {
      schemaVersion: visualPolicy.schemaVersion,
      contentProfileId: visualPolicy.contentProfileId,
      narrationRevisionId: visualPolicy.narrationRevisionId,
      effectiveConfigurationHash: visualPolicy.effectiveConfigurationHash,
      dependencyIdentity: visualPolicy.dependencyIdentity,
      scenes: visualPolicy.selections.map((selection) => ({ ...selection })),
      policyReview: {
        ...visualPolicy.review,
        reasonCodes: [...visualPolicy.review.reasonCodes],
      },
    },
    visualStates,
    preparedAssets,
    placements,
    provenance,
    aspectProfiles: {
      landscape: {
        aspectRatio: "16:9" as const,
        width: 1920,
        height: 1080,
        fps: 30,
        safeAreas: {
          subtitle: { top: 72, right: 96, bottom: 120, left: 96 },
          title: { top: 96, right: 120, bottom: 96, left: 120 },
          lowerThird: { top: 720, right: 120, bottom: 96, left: 120 },
          platformUi: { top: 0, right: 0, bottom: 180, left: 0 },
        },
      },
      portrait: {
        aspectRatio: "9:16" as const,
        width: 1080,
        height: 1920,
        fps: 30,
        safeAreas: {
          subtitle: { top: 120, right: 72, bottom: 180, left: 72 },
          title: { top: 144, right: 96, bottom: 120, left: 96 },
          lowerThird: { top: 1320, right: 96, bottom: 180, left: 96 },
          platformUi: { top: 0, right: 0, bottom: 240, left: 0 },
        },
      },
    },
    landscapePlacements,
    portraitPlacements,
    metrics: computePlannerMetrics({
      assets: input.assets,
      placements,
      preparedAssets,
      cacheHits: 0,
      cacheLookups: placements.length,
    }),
    contentHash: "0".repeat(64),
  };

  const approvalEligibility = evaluateApprovalEligibility({
    plan: { ...draftPlan, approvalEligibility: {
      renderEligible: false,
      contentReviewEligible: false,
      productionEligible: false,
      issues: [],
    } } as VeronicaMediaPlan,
    ingestedAssets: input.assets,
  });
  const scenePolicyIssue = visualPolicy.review.allowed
    ? []
    : [{
        code: "SCENE_VISUAL_POLICY_BLOCKED",
        severity: "blocking-error" as const,
        message: "No display-allowed source media is available for one or more scenes.",
      }];
  const finalApprovalEligibility = {
    ...approvalEligibility,
    renderEligible: approvalEligibility.renderEligible && scenePolicyIssue.length === 0,
    contentReviewEligible: approvalEligibility.contentReviewEligible && scenePolicyIssue.length === 0,
    productionEligible: false,
    issues: [...approvalEligibility.issues, ...scenePolicyIssue],
  };
  const contentHash = hashCanonical({ ...draftPlan, approvalEligibility: finalApprovalEligibility });
  return veronicaMediaPlanSchema.parse({
    ...draftPlan,
    approvalEligibility: finalApprovalEligibility,
    contentHash,
  });
}
