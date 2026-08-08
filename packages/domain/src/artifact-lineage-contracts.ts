import { z } from "zod";

import {
  productionInputFingerprintSchema,
  productionRevisionIdSchema,
  type ProductionInputFingerprint,
} from "./production-state-contracts.js";
import {
  artifactKindSchema,
  contentLocaleSchema,
  contentVariantSchema,
  workflowRunIdSchema,
} from "./workflow-contracts.js";

export const ARTIFACT_LINEAGE_SCHEMA_VERSION =
  "mediaforge.artifact-lineage.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const PRODUCTION_UNIT_KINDS = [
  "brief_script",
  "narration",
  "visual_plan",
  "scene_visual",
  "map",
  "diagram",
  "tts",
  "subtitles",
  "render",
  "review_readiness",
  "publish_readiness",
] as const;
export const productionUnitKindSchema = z.enum(PRODUCTION_UNIT_KINDS);
export type ProductionUnitKind = z.infer<typeof productionUnitKindSchema>;

export const productionUnitAddressSchema = z
  .object({
    kind: productionUnitKindSchema,
    unitKey: identifierSchema.optional(),
  })
  .strict();
export type ProductionUnitAddress = z.infer<typeof productionUnitAddressSchema>;

export const ARTIFACT_BASELINE_KINDS = [
  "previous",
  "approved",
  "source",
] as const;
export const artifactBaselineKindSchema = z.enum(ARTIFACT_BASELINE_KINDS);
export type ArtifactBaselineKind = z.infer<typeof artifactBaselineKindSchema>;

export const artifactProvenanceSchema = z
  .object({
    generatingRunId: workflowRunIdSchema.optional(),
    sourceProductionRevisionId: productionRevisionIdSchema.optional(),
    dependencyInputHashes: z.array(sha256Schema).default([]),
    locale: contentLocaleSchema.optional(),
    variant: contentVariantSchema.optional(),
  })
  .strict();
export type ArtifactProvenance = z.infer<typeof artifactProvenanceSchema>;

export const artifactRecordSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_LINEAGE_SCHEMA_VERSION),
    artifactRecordId: identifierSchema,
    contentHash: sha256Schema,
    kind: artifactKindSchema,
    unitAddress: productionUnitAddressSchema,
    provenance: artifactProvenanceSchema,
    validationStatus: z.enum(["valid", "invalid", "pending"]).default("valid"),
    reuseOwnerRecordId: identifierSchema.optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;

export const PRODUCTION_UNIT_STATUSES = [
  "missing",
  "valid",
  "stale",
  "invalidated",
] as const;
export const productionUnitStatusSchema = z.enum(PRODUCTION_UNIT_STATUSES);
export type ProductionUnitStatus = z.infer<typeof productionUnitStatusSchema>;

export const productionUnitSnapshotSchema = z
  .object({
    address: productionUnitAddressSchema,
    inputFingerprint: productionInputFingerprintSchema,
    contentHash: sha256Schema.optional(),
    status: productionUnitStatusSchema,
    artifactRecordId: identifierSchema.optional(),
  })
  .strict();
export type ProductionUnitSnapshot = z.infer<typeof productionUnitSnapshotSchema>;

export const productionUnitChangeSchema = z
  .object({
    address: productionUnitAddressSchema,
    nextInputFingerprint: productionInputFingerprintSchema,
    nextContentHash: sha256Schema.optional(),
    reason: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ProductionUnitChange = z.infer<typeof productionUnitChangeSchema>;

export const invalidatedProductionUnitSchema = z
  .object({
    address: productionUnitAddressSchema,
    previousStatus: productionUnitStatusSchema,
    reason: nonEmptyStringSchema,
    preservedUpstream: z.boolean(),
  })
  .strict();
export type InvalidatedProductionUnit = z.infer<
  typeof invalidatedProductionUnitSchema
>;

export const artifactComparisonMetadataSchema = z
  .object({
    baselineKind: artifactBaselineKindSchema,
    baselineContentHash: sha256Schema,
    currentContentHash: sha256Schema.optional(),
    textDiffAvailable: z.boolean().default(false),
    visualDiffAvailable: z.boolean().default(false),
    timestampAwareMediaDiffAvailable: z.boolean().default(false),
  })
  .strict();
export type ArtifactComparisonMetadata = z.infer<
  typeof artifactComparisonMetadataSchema
>;

export const invalidationPreviewSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_LINEAGE_SCHEMA_VERSION),
    changedAddresses: z.array(productionUnitAddressSchema).min(1),
    invalidatedUnits: z.array(invalidatedProductionUnitSchema),
    preservedUnits: z.array(productionUnitAddressSchema),
    regenerationTargets: z.array(productionUnitAddressSchema),
    staleReviewReadiness: z.boolean(),
    stalePublishReadiness: z.boolean(),
    projectedAt: isoDateTimeSchema,
  })
  .strict();
export type InvalidationPreview = z.infer<typeof invalidationPreviewSchema>;

export const gateEvidenceUpdateSchema = z
  .object({
    code: z.enum([
      "validation_stale",
      "approval_stale",
      "render_stale",
      "evidence_changed",
    ]),
    message: nonEmptyStringSchema,
    affectedUnitAddresses: z.array(productionUnitAddressSchema).min(1),
    contentHashes: z.array(sha256Schema).default([]),
  })
  .strict();
export type GateEvidenceUpdate = z.infer<typeof gateEvidenceUpdateSchema>;

export function productionUnitAddressKey(
  address: ProductionUnitAddress
): string {
  return address.unitKey
    ? `${address.kind}:${address.unitKey}`
    : address.kind;
}

export function compareProductionInputFingerprints(
  previous: ProductionInputFingerprint,
  next: ProductionInputFingerprint
): boolean {
  return previous === next;
}
