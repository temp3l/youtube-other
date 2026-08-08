import { z } from "zod";

import { contentLocaleSchema, contentProfileIdSchema } from "./workflow-contracts.js";

export const WORKFLOW_PORTFOLIO_SCHEMA_VERSION =
  "mediaforge.workflow-portfolio.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const workflowRunStatusSchema = z.enum(WORKFLOW_RUN_STATUSES);
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;

export const WORKFLOW_PORTFOLIO_JOB_STATUSES = [
  "queued",
  "running",
  "waiting_for_approval",
  "retry_scheduled",
  "cancelling",
  "cancelled",
  "succeeded",
  "succeeded_with_warnings",
  "partially_succeeded",
  "failed",
  "dead_lettered",
] as const;
export const workflowPortfolioJobStatusSchema = z.enum(
  WORKFLOW_PORTFOLIO_JOB_STATUSES
);
export type WorkflowPortfolioJobStatus = z.infer<
  typeof workflowPortfolioJobStatusSchema
>;

export const WORKFLOW_RECOVERY_CLASSIFICATIONS = [
  "none",
  "in_progress",
  "retryable",
  "non_retryable",
  "reconciliation_required",
  "abandoned",
] as const;
export const workflowRecoveryClassificationSchema = z.enum(
  WORKFLOW_RECOVERY_CLASSIFICATIONS
);
export type WorkflowRecoveryClassification = z.infer<
  typeof workflowRecoveryClassificationSchema
>;

export const WORKFLOW_RECOVERY_ACTIONS = [
  "resume",
  "cancel",
  "abandon",
  "view_timeline",
] as const;
export const workflowRecoveryActionSchema = z.enum(WORKFLOW_RECOVERY_ACTIONS);
export type WorkflowRecoveryAction = z.infer<typeof workflowRecoveryActionSchema>;

export const workflowPortfolioFilterSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_PORTFOLIO_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    projectId: identifierSchema.optional(),
    profileId: contentProfileIdSchema.optional(),
    locale: contentLocaleSchema.optional(),
    runStatus: workflowRunStatusSchema.optional(),
    jobStatus: workflowPortfolioJobStatusSchema.optional(),
    updatedAfter: isoDateTimeSchema.optional(),
    updatedBefore: isoDateTimeSchema.optional(),
    cursor: nonEmptyStringSchema.optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export type WorkflowPortfolioFilter = z.infer<
  typeof workflowPortfolioFilterSchema
>;

export const workflowPortfolioBlockerSchema = z
  .object({
    code: nonEmptyStringSchema,
    message: nonEmptyStringSchema,
    severity: z.enum(["blocking", "warning"]),
  })
  .strict();
export type WorkflowPortfolioBlocker = z.infer<
  typeof workflowPortfolioBlockerSchema
>;

export const workflowPortfolioRecoverySchema = z
  .object({
    classification: workflowRecoveryClassificationSchema,
    availableActions: z.array(workflowRecoveryActionSchema).min(1),
    sanitizedFailureCode: nonEmptyStringSchema.optional(),
    message: nonEmptyStringSchema.optional(),
  })
  .strict();
export type WorkflowPortfolioRecovery = z.infer<
  typeof workflowPortfolioRecoverySchema
>;

export const workflowPortfolioEntrySchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_PORTFOLIO_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    projectId: identifierSchema,
    episodeId: identifierSchema,
    runId: identifierSchema,
    runRevision: z.number().int().nonnegative(),
    runStatus: workflowRunStatusSchema,
    profileId: contentProfileIdSchema,
    locale: contentLocaleSchema.optional(),
    episodeRevision: z.number().int().nonnegative().optional(),
    latestJobId: identifierSchema.optional(),
    latestJobRevision: z.number().int().nonnegative().optional(),
    latestJobStatus: workflowPortfolioJobStatusSchema.optional(),
    latestJobAttempts: z.number().int().nonnegative().optional(),
    latestStageId: identifierSchema.optional(),
    latestStageStatus: nonEmptyStringSchema.optional(),
    preservedArtifactHashes: z.array(sha256Schema).default([]),
    blockers: z.array(workflowPortfolioBlockerSchema).default([]),
    recovery: workflowPortfolioRecoverySchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    correlationId: identifierSchema.optional(),
  })
  .strict();
export type WorkflowPortfolioEntry = z.infer<typeof workflowPortfolioEntrySchema>;

export const workflowPortfolioPageSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_PORTFOLIO_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    items: z.array(workflowPortfolioEntrySchema),
    nextCursor: nonEmptyStringSchema.optional(),
    projectedAt: isoDateTimeSchema,
  })
  .strict();
export type WorkflowPortfolioPage = z.infer<typeof workflowPortfolioPageSchema>;

export interface WorkflowPortfolioSource {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly runId: string;
  readonly runRevision: number;
  readonly runStatus: WorkflowRunStatus;
  readonly profileId: string;
  readonly locale?: string;
  readonly episodeRevision?: number;
  readonly latestJobId?: string;
  readonly latestJobRevision?: number;
  readonly latestJobStatus?: WorkflowPortfolioJobStatus;
  readonly latestJobAttempts?: number;
  readonly latestStageId?: string;
  readonly latestStageStatus?: string;
  readonly preservedArtifactHashes?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly correlationId?: string;
}
