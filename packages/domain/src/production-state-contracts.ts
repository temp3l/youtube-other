import { z } from "zod";

import {
  approvalGateSchema,
  contentLocaleSchema,
  contentVariantSchema,
  workflowRunIdSchema,
} from "./workflow-contracts.js";

export const PRODUCTION_STATE_SCHEMA_VERSION =
  "mediaforge.production.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

function brandedIdentifier<TBrand extends string>(brand: TBrand) {
  return identifierSchema.brand<TBrand>();
}

export const productionRevisionIdSchema =
  brandedIdentifier("ProductionRevisionId");
export type ProductionRevisionId = z.infer<typeof productionRevisionIdSchema>;

export const resolvedConfigFingerprintSchema = sha256Schema.brand<
  "ResolvedConfigFingerprint"
>();
export type ResolvedConfigFingerprint = z.infer<
  typeof resolvedConfigFingerprintSchema
>;

export const productionInputFingerprintSchema = sha256Schema.brand<
  "ProductionInputFingerprint"
>();
export type ProductionInputFingerprint = z.infer<
  typeof productionInputFingerprintSchema
>;

export const PRODUCTION_LIFECYCLE_STAGES = [
  "draft",
  "producing",
  "validating",
  "reviewing",
  "rendering",
  "publish_ready",
  "published",
  "blocked",
  "archived",
] as const;
export const productionLifecycleStageSchema = z.enum(
  PRODUCTION_LIFECYCLE_STAGES
);
export type ProductionLifecycleStage = z.infer<
  typeof productionLifecycleStageSchema
>;

export const PRODUCTION_GATE_SEVERITIES = ["blocking", "warning"] as const;
export const productionGateSeveritySchema = z.enum(PRODUCTION_GATE_SEVERITIES);
export type ProductionGateSeverity = z.infer<
  typeof productionGateSeveritySchema
>;

export const PRODUCTION_GATE_CODES = [
  "validation_failed",
  "validation_missing",
  "approval_missing",
  "approval_stale",
  "approval_rejected",
  "render_missing",
  "render_failed",
  "publication_blocked",
  "publication_unavailable",
  "workflow_failed",
  "workflow_blocked",
  "localization_incomplete",
  "configuration_stale",
  "evidence_unavailable",
] as const;
export const productionGateCodeSchema = z.enum(PRODUCTION_GATE_CODES);
export type ProductionGateCode = z.infer<typeof productionGateCodeSchema>;

export const productionEvidenceRefSchema = z
  .object({
    kind: z.enum([
      "validation",
      "approval",
      "asset",
      "workflow_run",
      "publication",
      "production_revision",
    ]),
    id: identifierSchema,
    contentHash: sha256Schema.optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ProductionEvidenceRef = z.infer<typeof productionEvidenceRefSchema>;

export const productionGateEvaluationSchema = z
  .object({
    gate: approvalGateSchema.optional(),
    severity: productionGateSeveritySchema,
    code: productionGateCodeSchema,
    message: nonEmptyStringSchema,
    evidence: z.array(productionEvidenceRefSchema).min(1),
    affectedProductionRevisionId: productionRevisionIdSchema.optional(),
  })
  .strict();
export type ProductionGateEvaluation = z.infer<
  typeof productionGateEvaluationSchema
>;

export const PRODUCTION_ACTION_KINDS = [
  "edit_brief",
  "start_workflow",
  "retry_workflow",
  "cancel_workflow",
  "submit_review",
  "decide_review",
  "regenerate_unit",
  "prepare_publication",
  "execute_publication",
  "view_artifacts",
  "view_validation",
] as const;
export const productionActionKindSchema = z.enum(PRODUCTION_ACTION_KINDS);
export type ProductionActionKind = z.infer<typeof productionActionKindSchema>;

export const productionActionSchema = z
  .object({
    actionId: identifierSchema,
    kind: productionActionKindSchema,
    label: nonEmptyStringSchema,
    enabled: z.boolean(),
    reason: nonEmptyStringSchema.optional(),
    requiresProductionRevisionId: productionRevisionIdSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Disabled production actions must include a reason.",
      });
    }
  });
export type ProductionAction = z.infer<typeof productionActionSchema>;

export const productionRevisionSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_STATE_SCHEMA_VERSION),
    id: productionRevisionIdSchema,
    projectId: identifierSchema,
    episodeId: identifierSchema,
    episodeRevision: z.number().int().nonnegative(),
    episodeRevisionId: identifierSchema.optional(),
    resolvedConfigFingerprint: resolvedConfigFingerprintSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    workflowRunId: workflowRunIdSchema.optional(),
    supersedesProductionRevisionId: productionRevisionIdSchema.optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ProductionRevision = z.infer<typeof productionRevisionSchema>;

export const workflowProductionSliceSchema = z
  .object({
    activeRunId: workflowRunIdSchema.optional(),
    runStatus: z
      .enum([
        "queued",
        "running",
        "awaiting_approval",
        "succeeded",
        "failed",
        "cancelled",
        "none",
      ])
      .optional(),
    runRevision: z.number().int().nonnegative().optional(),
    jobId: identifierSchema.optional(),
    jobStatus: z.string().min(1).optional(),
    jobRevision: z.number().int().nonnegative().optional(),
    sanitizedFailureCode: z.string().min(1).optional(),
  })
  .strict();
export type WorkflowProductionSlice = z.infer<
  typeof workflowProductionSliceSchema
>;

export const validationProductionSliceSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            validationId: identifierSchema,
            status: z.enum(["passed", "failed", "pending", "unknown"]),
            resultFingerprint: sha256Schema.optional(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();
export type ValidationProductionSlice = z.infer<
  typeof validationProductionSliceSchema
>;

export const reviewProductionSliceSchema = z
  .object({
    requiredGates: z.array(approvalGateSchema).default([]),
    approvals: z
      .array(
        z
          .object({
            approvalId: identifierSchema,
            gate: approvalGateSchema.optional(),
            decision: z.enum(["approved", "rejected", "revoked"]),
            state: z.enum(["active", "rejected", "revoked"]),
            boundFingerprint: sha256Schema.optional(),
            stale: z.boolean().default(false),
          })
          .strict()
      )
      .default([]),
  })
  .strict();
export type ReviewProductionSlice = z.infer<typeof reviewProductionSliceSchema>;

export const renderProductionSliceSchema = z
  .object({
    status: z.enum(["none", "pending", "succeeded", "failed"]),
    renderArtifactHashes: z.array(sha256Schema).default([]),
  })
  .strict();
export type RenderProductionSlice = z.infer<typeof renderProductionSliceSchema>;

export const localizationProductionSliceSchema = z
  .object({
    variants: z
      .array(
        z
          .object({
            locale: contentLocaleSchema,
            variant: contentVariantSchema,
            productionRevisionId: productionRevisionIdSchema.optional(),
            status: z.enum(["none", "in_progress", "ready", "blocked"]),
          })
          .strict()
      )
      .default([]),
  })
  .strict();
export type LocalizationProductionSlice = z.infer<
  typeof localizationProductionSliceSchema
>;

export const publicationProductionSliceSchema = z
  .object({
    readiness: z.enum(["not_ready", "ready", "disabled"]),
    activePublicationId: identifierSchema.optional(),
    publicationStatus: z
      .enum([
        "none",
        "pending",
        "executing",
        "published",
        "failed",
        "cancelled",
        "reconciliation_required",
      ])
      .optional(),
    publishReady: z.boolean(),
  })
  .strict();
export type PublicationProductionSlice = z.infer<
  typeof publicationProductionSliceSchema
>;

export const episodeProductionStateSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_STATE_SCHEMA_VERSION),
    projectId: identifierSchema,
    episodeId: identifierSchema,
    currentProductionRevision: productionRevisionSchema,
    lifecycleStage: productionLifecycleStageSchema,
    workflow: workflowProductionSliceSchema,
    validation: validationProductionSliceSchema,
    review: reviewProductionSliceSchema,
    render: renderProductionSliceSchema,
    localization: localizationProductionSliceSchema,
    publication: publicationProductionSliceSchema,
    blockers: z.array(productionGateEvaluationSchema),
    warnings: z.array(productionGateEvaluationSchema),
    actions: z.array(productionActionSchema),
    projectedAt: isoDateTimeSchema,
    projectionInputFingerprint: productionInputFingerprintSchema,
  })
  .strict();
export type EpisodeProductionState = z.infer<
  typeof episodeProductionStateSchema
>;
