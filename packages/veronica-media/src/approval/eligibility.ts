import {
  veronicaApprovalEligibilitySchema,
  veronicaApprovalIssueSchema,
  type VeronicaApprovalEligibility,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";
import type { VeronicaIngestedAsset } from "../ingestion/secure-ingest.js";

export type VeronicaApprovalEvaluatorInput = {
  readonly plan: VeronicaMediaPlan;
  readonly ingestedAssets?: readonly VeronicaIngestedAsset[];
  readonly preparedAssetPaths?: Readonly<Record<string, string>>;
};

function issue(
  code: string,
  severity: VeronicaApprovalEligibility["issues"][number]["severity"],
  message: string,
  refs?: { placementId?: string; assetId?: string },
) {
  return veronicaApprovalIssueSchema.parse({
    code,
    severity,
    message,
    ...refs,
  });
}

export function evaluateApprovalEligibility(
  input: VeronicaApprovalEvaluatorInput,
): VeronicaApprovalEligibility {
  const issues: VeronicaApprovalEligibility["issues"] = [];
  const ingestedById = new Map(
    (input.ingestedAssets ?? []).map((asset) => [asset.assetId, asset]),
  );
  const preparedById = new Map(
    input.plan.preparedAssets.map((asset) => [asset.preparedAssetId, asset]),
  );

  for (const sourceAsset of input.plan.sourceAssets) {
    const ingested = ingestedById.get(sourceAsset.assetId);
    if (ingested && ingested.checksum !== sourceAsset.checksum) {
      issues.push(
        issue(
          "SOURCE_CHECKSUM_MISMATCH",
          "blocking-error",
          `Source asset ${sourceAsset.assetId} checksum mismatch.`,
          { assetId: sourceAsset.assetId },
        ),
      );
    }
  }

  for (const placement of input.plan.placements) {
    if (
      placement.fallback.requirement === "required" &&
      placement.fallback.fallbackAllowed &&
      !placement.fallback.fallbackAssetId
    ) {
      issues.push(
        issue(
          "REQUIRED_FALLBACK_MISSING",
          "blocking-error",
          `Placement ${placement.placementId} requires explicit fallback asset.`,
          { placementId: placement.placementId },
        ),
      );
    }
    for (const stateId of placement.visualStateIds) {
      const state = input.plan.visualStates.find((candidate) => candidate.stateId === stateId);
      if (!state) {
        issues.push(
          issue(
            "VISUAL_STATE_MISSING",
            "blocking-error",
            `Placement ${placement.placementId} references missing visual state ${stateId}.`,
            { placementId: placement.placementId },
          ),
        );
        continue;
      }
      if (state.preparedAssetId && !preparedById.has(state.preparedAssetId)) {
        issues.push(
          issue(
            "PREPARED_ASSET_MISSING",
            "blocking-error",
            `Visual state ${state.stateId} references missing prepared asset.`,
            { placementId: placement.placementId, assetId: state.preparedAssetId },
          ),
        );
      }
      const provenance = input.plan.provenance.find(
        (record) => record.provenanceId === state.provenanceId,
      );
      if (!provenance) {
        issues.push(
          issue(
            "PROVENANCE_MISSING",
            "blocking-error",
            `Visual state ${state.stateId} lacks provenance.`,
            { placementId: placement.placementId },
          ),
        );
      }
    }
  }

  for (const prepared of input.plan.preparedAssets) {
    const translation = prepared.translationStatus;
    if (translation?.requiresApproval) {
      issues.push(
        issue(
          "TRANSLATION_APPROVAL_REQUIRED",
          "approval-required",
          `Prepared asset ${prepared.preparedAssetId} requires translation approval.`,
          { assetId: prepared.preparedAssetId },
        ),
      );
    }
    if (translation?.status === "pending" || translation?.status === "overflow") {
      issues.push(
        issue(
          "UNTRANSLATED_VISIBLE_TEXT",
          "blocking-error",
          `Prepared asset ${prepared.preparedAssetId} has unresolved visible text.`,
          { assetId: prepared.preparedAssetId },
        ),
      );
    }
    if (input.preparedAssetPaths && !input.preparedAssetPaths[prepared.preparedAssetId]) {
      issues.push(
        issue(
          "PREPARED_ASSET_PATH_MISSING",
          "blocking-error",
          `Prepared asset ${prepared.preparedAssetId} is not materialized.`,
          { assetId: prepared.preparedAssetId },
        ),
      );
    }
  }

  for (const anchor of input.plan.narrationAnchors) {
    if (
      anchor.resolvedStartSeconds === undefined ||
      anchor.resolvedEndSeconds === undefined
    ) {
      issues.push(
        issue(
          "ANCHOR_TIMING_UNRESOLVED",
          "non-blocking-warning",
          `Anchor ${anchor.anchorId} timing is unresolved until TTS alignment.`,
        ),
      );
    }
  }

  const hasBlocking = issues.some((entry) => entry.severity === "blocking-error");
  const hasApprovalRequired = issues.some(
    (entry) => entry.severity === "approval-required",
  );
  const renderEligible = !hasBlocking && !hasApprovalRequired;
  return veronicaApprovalEligibilitySchema.parse({
    renderEligible,
    contentReviewEligible: !hasBlocking,
    productionEligible: renderEligible && input.plan.approvalState === "approved",
    issues,
  });
}
