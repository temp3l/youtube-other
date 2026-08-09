import crypto from "node:crypto";

import {
  CONTENT_LIFECYCLE_SCHEMA_VERSION,
  RETENTION_POLICY_SCHEMA_VERSION,
  episodeContentLifecycleRecordSchema,
  episodeDeletionEvaluationSchema,
  lifecycleTransitionResultSchema,
  retentionPolicyRecordSchema,
  type DeletionBlocker,
  type DeletionImpact,
  type EpisodeContentLifecycleRecord,
  type EpisodeDeletionEvaluation,
  type EpisodeVisibilityState,
  type RetentionCategory,
  type RetentionPolicyRecord,
} from "./content-lifecycle-contracts.js";

export const ACTIVE_WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
] as const;

export const TERMINAL_PUBLICATION_STATUSES = [
  "succeeded",
  "published",
  "completed",
] as const;

export function projectEpisodeContentLifecycleRecord(input: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly visibility: EpisodeVisibilityState;
  readonly revision: number;
  readonly archiveReason?: string;
  readonly archivedAt?: string;
  readonly tombstonedAt?: string;
  readonly updatedAt: string;
}): EpisodeContentLifecycleRecord {
  return episodeContentLifecycleRecordSchema.parse({
    schemaVersion: CONTENT_LIFECYCLE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    visibility: input.visibility,
    revision: input.revision,
    ...(input.archiveReason ? { archiveReason: input.archiveReason } : {}),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
    ...(input.tombstonedAt ? { tombstonedAt: input.tombstonedAt } : {}),
    updatedAt: input.updatedAt,
  });
}

export function evaluateArchiveAdmission(input: {
  readonly visibility: EpisodeVisibilityState;
  readonly activeWorkflowRunCount: number;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.visibility === "archived")
    return { allowed: true };
  if (input.visibility === "tombstoned")
    return {
      allowed: false,
      code: "episode_tombstoned",
      message: "Tombstoned episodes cannot be archived.",
    };
  if (input.activeWorkflowRunCount > 0)
    return {
      allowed: false,
      code: "active_workflow",
      message: "Archive is blocked while a workflow run is active.",
    };
  return { allowed: true };
}

export function evaluateRestoreAdmission(input: {
  readonly visibility: EpisodeVisibilityState;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.visibility === "archived") return { allowed: true };
  if (input.visibility === "active")
    return { allowed: true };
  return {
    allowed: false,
    code: "episode_not_restorable",
    message: "Only archived episodes can be restored.",
  };
}

export function evaluateEpisodeDeletion(input: {
  readonly visibility: EpisodeVisibilityState;
  readonly activeWorkflowRunCount: number;
  readonly terminalPublicationCount: number;
  readonly sharedAssetSurvivorCount: number;
  readonly retentionPolicyStatus: RetentionPolicyRecord["status"];
  readonly legalHoldCategories: readonly RetentionCategory[];
  readonly evaluationSecret: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
}): EpisodeDeletionEvaluation {
  const blockers: DeletionBlocker[] = [];
  const impacts: DeletionImpact[] = [];
  if (input.visibility === "tombstoned") {
    blockers.push({
      code: "already_tombstoned",
      message: "Episode is already tombstoned.",
    });
  }
  if (input.activeWorkflowRunCount > 0) {
    blockers.push({
      code: "active_workflow",
      message: "Deletion is blocked while a workflow run is active.",
    });
  }
  if (input.terminalPublicationCount > 0) {
    blockers.push({
      code: "published_episode",
      message: "Published episodes cannot be deleted without publication review.",
    });
  }
  if (input.retentionPolicyStatus === "unresolved") {
    blockers.push({
      code: "retention_unresolved",
      message: "Retention policy is unresolved; destructive actions are blocked.",
    });
  }
  if (input.legalHoldCategories.length > 0) {
    blockers.push({
      code: "legal_hold",
      message: `Retention legal hold applies to: ${input.legalHoldCategories.join(", ")}.`,
    });
  }
  if (input.sharedAssetSurvivorCount > 0) {
    impacts.push({
      code: "shared_assets_survive",
      message:
        "Shared assets referenced by this episode will survive until all permitted references are released.",
    });
  }
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        episodeId: input.episodeId,
        visibility: input.visibility,
        activeWorkflowRunCount: input.activeWorkflowRunCount,
        terminalPublicationCount: input.terminalPublicationCount,
        retentionPolicyStatus: input.retentionPolicyStatus,
        legalHoldCategories: input.legalHoldCategories,
      }),
      "utf8"
    )
    .digest("hex");
  const evaluationToken = crypto
    .createHmac("sha256", input.evaluationSecret)
    .update(fingerprint, "utf8")
    .digest("base64url");
  return episodeDeletionEvaluationSchema.parse({
    allowed: blockers.length === 0,
    blockers,
    impacts,
    evaluationToken,
  });
}

export function verifyDeletionEvaluationToken(input: {
  readonly evaluation: EpisodeDeletionEvaluation;
  readonly evaluationSecret: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly visibility: EpisodeVisibilityState;
  readonly activeWorkflowRunCount: number;
  readonly terminalPublicationCount: number;
  readonly retentionPolicyStatus: RetentionPolicyRecord["status"];
  readonly legalHoldCategories: readonly RetentionCategory[];
}): boolean {
  const expected = evaluateEpisodeDeletion({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    visibility: input.visibility,
    activeWorkflowRunCount: input.activeWorkflowRunCount,
    terminalPublicationCount: input.terminalPublicationCount,
    retentionPolicyStatus: input.retentionPolicyStatus,
    legalHoldCategories: input.legalHoldCategories,
    sharedAssetSurvivorCount: 0,
    evaluationSecret: input.evaluationSecret,
  });
  return expected.evaluationToken === input.evaluation.evaluationToken;
}

export function buildLifecycleTransitionResult(input: {
  readonly lifecycle: EpisodeContentLifecycleRecord;
  readonly replayed: boolean;
}): ReturnType<typeof lifecycleTransitionResultSchema.parse> {
  return lifecycleTransitionResultSchema.parse({
    lifecycle: input.lifecycle,
    replayed: input.replayed,
    startedWorkflow: false,
  });
}

export function buildUnresolvedRetentionPolicy(
  workspaceId: string
): RetentionPolicyRecord {
  return retentionPolicyRecordSchema.parse({
    schemaVersion: RETENTION_POLICY_SCHEMA_VERSION,
    workspaceId,
    status: "unresolved",
    revision: 0,
    categories: [],
    inheritedFromPlatform: false,
  });
}

export function projectRetentionPolicyRecord(input: {
  readonly workspaceId: string;
  readonly revision: number;
  readonly categories: RetentionPolicyRecord["categories"];
  readonly inheritedFromPlatform: boolean;
  readonly updatedAt: string;
}): RetentionPolicyRecord {
  return retentionPolicyRecordSchema.parse({
    schemaVersion: RETENTION_POLICY_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    status: "configured",
    revision: input.revision,
    categories: input.categories,
    inheritedFromPlatform: input.inheritedFromPlatform,
    updatedAt: input.updatedAt,
  });
}

export function assertWorkspaceAdminAccess(permissions: readonly string[]): void {
  if (!permissions.includes("workspace.admin"))
    throw new Error("Workspace admin requires workspace.admin.");
}

export function matchesEpisodeVisibilityFilter(
  visibility: EpisodeVisibilityState,
  filter: "active" | "archived" | "all" | undefined
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "active") return visibility === "active";
  return visibility === "archived";
}
