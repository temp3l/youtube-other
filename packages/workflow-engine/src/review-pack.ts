import {
  contentLocaleSchema,
  contentProfileIdSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  taskIdSchema,
  workflowInstanceIdSchema,
  type ContentProfileId,
  type TaskId,
} from "@mediaforge/domain";
import { z } from "zod";

import { redactStructuredMetadata } from "./attempt-observability.js";

export const REVIEW_PACK_SCHEMA_VERSION =
  "mediaforge.workflow-review-pack.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmptyStringSchema = z.string().trim().min(1);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const reviewPackIdSchema = z.string().regex(/^review-pack-[a-z0-9-]+$/u);

/**
 * Immutable evidence for one reviewable workflow revision. It intentionally
 * carries fingerprints rather than mutable configuration or source payloads.
 */
export const workflowReviewPackSchema = z
  .object({
    schemaVersion: z.literal(REVIEW_PACK_SCHEMA_VERSION),
    id: reviewPackIdSchema,
    workflowInstanceId: workflowInstanceIdSchema,
    taskId: taskIdSchema,
    profileId: contentProfileIdSchema,
    unitId: productionUnitIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    boundRevision: nonEmptyStringSchema,
    artifactHashes: z.array(sha256Schema).min(1),
    inputArtifactHashes: z.array(sha256Schema).min(1),
    configurationFingerprint: sha256Schema,
    dependencyFingerprint: sha256Schema,
    provenance: z.array(
      z
        .object({
          artifactHash: sha256Schema,
          producer: nonEmptyStringSchema,
          sourceRevision: nonEmptyStringSchema,
        })
        .strict()
    ),
    reuseRationale: z.enum([
      "new-content",
      "content-hash-match",
      "language-independent-visual",
      "regenerated-after-remediation",
    ]),
    remediation: z
      .object({
        action: z.enum([
          "none",
          "re-plan",
          "re-prepare-assets",
          "re-translate",
          "re-align-narration",
          "re-render",
          "full-regeneration",
        ]),
        reason: nonEmptyStringSchema,
      })
      .strict(),
    failureEvidence: z
      .object({
        code: nonEmptyStringSchema,
        message: nonEmptyStringSchema,
        remediation: nonEmptyStringSchema,
        details: z.unknown().optional(),
      })
      .strict()
      .optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type WorkflowReviewPack = z.infer<typeof workflowReviewPackSchema>;

export interface ReviewPackDelta {
  readonly schemaVersion: typeof REVIEW_PACK_SCHEMA_VERSION;
  readonly profileId: ContentProfileId;
  readonly taskId: TaskId;
  readonly previousPackId: string | null;
  readonly changedArtifactHashes: readonly string[];
  readonly preservedArtifactHashes: readonly string[];
  readonly configurationChanged: boolean;
  readonly dependenciesChanged: boolean;
  readonly requiresRegeneration: boolean;
  readonly remediation: WorkflowReviewPack["remediation"];
  readonly failureEvidence?: WorkflowReviewPack["failureEvidence"];
}

function sortedDifference(
  left: readonly string[],
  right: readonly string[]
): readonly string[] {
  const rightValues = new Set(right);
  return [...new Set(left)].filter((value) => !rightValues.has(value)).sort();
}

/** Build a portable, delta-focused view without exposing raw failure payloads. */
export function buildReviewPackDelta(input: {
  readonly current: WorkflowReviewPack;
  readonly previous?: WorkflowReviewPack;
}): ReviewPackDelta {
  const current = workflowReviewPackSchema.parse(input.current);
  const previous = input.previous
    ? workflowReviewPackSchema.parse(input.previous)
    : undefined;
  if (
    previous &&
    (previous.workflowInstanceId !== current.workflowInstanceId ||
      previous.taskId !== current.taskId ||
      previous.profileId !== current.profileId ||
      previous.locale !== current.locale ||
      previous.variant !== current.variant)
  ) {
    throw new Error("A review-pack delta requires the same workflow task scope.");
  }
  const changedArtifactHashes = previous
    ? sortedDifference(current.artifactHashes, previous.artifactHashes)
    : [...current.artifactHashes].sort();
  const preservedArtifactHashes = previous
    ? current.artifactHashes.filter((hash) => previous.artifactHashes.includes(hash)).sort()
    : [];
  const configurationChanged =
    previous?.configurationFingerprint !== undefined &&
    previous.configurationFingerprint !== current.configurationFingerprint;
  const dependenciesChanged =
    previous?.dependencyFingerprint !== undefined &&
    previous.dependencyFingerprint !== current.dependencyFingerprint;
  const failureEvidence = current.failureEvidence
    ? {
        ...current.failureEvidence,
        details: redactStructuredMetadata(current.failureEvidence.details),
      }
    : undefined;
  return {
    schemaVersion: REVIEW_PACK_SCHEMA_VERSION,
    profileId: current.profileId,
    taskId: current.taskId,
    previousPackId: previous?.id ?? null,
    changedArtifactHashes,
    preservedArtifactHashes,
    configurationChanged,
    dependenciesChanged,
    requiresRegeneration:
      changedArtifactHashes.length > 0 || configurationChanged || dependenciesChanged,
    remediation: current.remediation,
    ...(failureEvidence ? { failureEvidence } : {}),
  };
}
