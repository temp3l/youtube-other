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

export interface SemanticPlannerInput {
  readonly episodeId: string;
  readonly originalNarration: string;
  readonly revisedNarration?: string;
  readonly assets: readonly VeronicaIngestedAsset[];
  readonly targetLanguage: string;
  readonly sourceLanguage?: string;
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

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function chooseCandidates(asset: VeronicaIngestedAsset) {
  return asset.extractedCandidates.slice(0, 3);
}

export function buildSemanticMediaPlan(input: SemanticPlannerInput): VeronicaMediaPlan {
  const revision = buildNarrationRevision({
    revisionId: `revision-${input.episodeId}`,
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
  }));
  const visualStates: VeronicaMediaPlan["visualStates"] = [];
  const preparedAssets: VeronicaMediaPlan["preparedAssets"] = [];
  const provenance: VeronicaMediaPlan["provenance"] = [];
  const placements: VeronicaMediaPlan["placements"] = [];
  const claims: VeronicaMediaPlan["claims"] = [];

  anchors.forEach((anchor, anchorIndex) => {
    const asset = input.assets[anchorIndex % Math.max(input.assets.length, 1)];
    if (!asset) return;
    const override = input.overrides?.[asset.assetId];
    const candidates = chooseCandidates(asset);
    const candidate =
      candidates.find((entry) => entry.candidateId === override?.candidateId) ??
      candidates[0];
    if (!candidate) return;
    const provenanceId = stableId("prov", `${asset.assetId}:${candidate.candidateId}`);
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
        language: input.targetLanguage,
        attributionMode: "on-screen",
        confidence: 0.9,
        warningCodes: [],
      }),
    );
    const stateIds: string[] = [];
    const stateCount = asset.mediaKind === "pptx" || asset.mediaKind === "pdf" ? 2 : 1;
    for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
      const stateId = stableId("state", `${anchor.anchorId}:${stateIndex}`);
      const preparedAssetId = stableId("prep", `${stateId}:landscape`);
      const preparedPortraitId = stableId("prep", `${stateId}:portrait`);
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
          provenanceId,
        }),
      );
      preparedAssets.push(
        veronicaPreparedAssetSchema.parse({
          preparedAssetId,
          aspectRatio: "16:9",
          checksum: candidate.checksum,
          relativePath: `prepared/landscape/${preparedAssetId}.png`,
          width: 1920,
          height: 1080,
          provenanceId,
          ...(translationStatus ? { translationStatus } : {}),
        }),
        veronicaPreparedAssetSchema.parse({
          preparedAssetId: preparedPortraitId,
          aspectRatio: "9:16",
          checksum: createHash("sha256")
            .update(`${candidate.checksum}:portrait`)
            .digest("hex"),
          relativePath: `prepared/portrait/${preparedPortraitId}.png`,
          width: 1080,
          height: 1920,
          provenanceId,
          ...(translationStatus ? { translationStatus } : {}),
        }),
      );
      stateIds.push(stateId);
    }
    const claimId = stableId("claim", anchor.exactText);
    claims.push({
      claimId,
      text: anchor.exactText,
      sourceReferenceIds: [provenanceId],
      confidence: 0.88,
    });
    const requirement = override?.requirement ?? (anchorIndex === 0 ? "required" : "preferred");
    placements.push(
      veronicaMediaPlacementSchema.parse({
        placementId: stableId("place", anchor.anchorId),
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
  const contentHash = hashCanonical({ ...draftPlan, approvalEligibility });
  return veronicaMediaPlanSchema.parse({
    ...draftPlan,
    approvalEligibility,
    contentHash,
  });
}
