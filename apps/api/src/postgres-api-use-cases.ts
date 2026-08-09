import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
  type WorkflowAdmissionHandler,
} from "@mediaforge/application";
import {
  immutablePlanHash,
  normalizeRevisionAnalyticsObservation,
} from "@mediaforge/domain";
import {
  PostgresUsageAuditRepository,
  PostgresPublicationIntentRepository,
  PostgresWorkflowRepository,
  PostgresRevisionAnalyticsRepository,
  RevisionAnalyticsConflictError,
  WorkflowStateTransitionError,
  type PostgresPool,
} from "@mediaforge/persistence";

import type { ApiJobFailure, ApiJobStatus, ApiUseCases } from "./http-server.js";
import {
  archiveEpisodeInputSchema,
  cloneEpisodeInputSchema,
  forkEpisodeFromPatternInputSchema,
  parseEpisodeInput,
  type ArchiveEpisodeInput,
  type CloneEpisodeInput,
  type ForkEpisodeFromPatternInput,
} from "./contract.js";
import { createApiWorkflowAdmissionUseCase } from "./http-server.js";
import { createRevisionAnalyticsComparisonUseCase } from "./revision-analytics-comparison-use-case.js";

interface CursorValue {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly validationId: string;
}

interface WorkspaceCursorValue {
  readonly workspaceId: string;
  readonly collection: "audit-events" | "usage-records";
  readonly occurredAt: string;
  readonly id: string;
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function encodeCursor(value: CursorValue, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeCursor(
  value: string | undefined,
  expected: Pick<CursorValue, "workspaceId" | "projectId">,
  secret: string
): CursorValue | undefined {
  if (value === undefined) return undefined;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined)
    throw new ApplicationError("invalid_request", "The validation cursor is invalid.", false);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    throw new ApplicationError("invalid_request", "The validation cursor is invalid.", false);
  }
  if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature))
    throw new ApplicationError("invalid_request", "The validation cursor is invalid.", false);
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CursorValue>;
    if (
      parsed.workspaceId !== expected.workspaceId ||
      parsed.projectId !== expected.projectId ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.validationId !== "string"
    ) throw new Error("invalid");
    return parsed as CursorValue;
  } catch {
    throw new ApplicationError("invalid_request", "The validation cursor is invalid.", false);
  }
}

function encodeWorkspaceCursor(value: WorkspaceCursorValue, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeWorkspaceCursor(
  value: string | undefined,
  expected: Pick<WorkspaceCursorValue, "workspaceId" | "collection">,
  secret: string
): WorkspaceCursorValue | undefined {
  if (value === undefined) return undefined;
  if (value.length > 4_096)
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined)
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature))
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<WorkspaceCursorValue>;
    if (
      parsed.workspaceId !== expected.workspaceId ||
      parsed.collection !== expected.collection ||
      typeof parsed.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.occurredAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 160
    ) throw new Error("invalid");
    return parsed as WorkspaceCursorValue;
  } catch {
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  }
}

function parseEtag(value: string): number {
  const match = value.match(/^"(0|[1-9][0-9]*)"$/u);
  if (!match) throw new ApplicationError("precondition_failed", "If-Match must contain one strong numeric ETag.", false);
  return Number(match[1]);
}

function translatePersistence(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof WorkflowStateTransitionError) {
    const conflict = error.message.toLowerCase().includes("already");
    throw new ApplicationError(
      conflict ? "conflict" : "state_transition_rejected",
      error.message,
      false
    );
  }
  throw error;
}

const publicJobStatuses = new Set<string>([
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
]);

function publicJobStatus(status: string): ApiJobStatus {
  if (!publicJobStatuses.has(status))
    throw new ApplicationError("upstream_unavailable", "Stored job status is invalid.", false);
  return status as ApiJobStatus;
}

function publicJobFailure(status: ApiJobStatus): ApiJobFailure | undefined {
  if (status === "failed") return {
    type: "https://mediaforge.invalid/problems/job-failed",
    title: "Job failed",
    detail: "The job did not complete successfully.",
    code: "job_failed",
    retryable: false,
    errors: [],
  };
  if (status === "dead_lettered") return {
    type: "https://mediaforge.invalid/problems/job-dead-lettered",
    title: "Job dead lettered",
    detail: "The job exhausted its retry policy and requires operator review.",
    code: "job_dead_lettered",
    retryable: false,
    errors: [],
  };
  return undefined;
}

export interface EpisodeLifecycleUseCases {
  archiveEpisode(
    episodeId: string,
    input: ArchiveEpisodeInput,
    context: {
      readonly workspaceId: string;
      readonly projectId: string;
      readonly principal: AuthenticatedPrincipal;
      readonly requestId: string;
      readonly ifMatch: string;
      readonly idempotencyKey: string;
    }
  ): Promise<{ readonly id: string; readonly revision: number; readonly lifecycleState: "archived"; readonly replayed: boolean }>;
  cloneEpisode(
    sourceEpisodeId: string,
    input: CloneEpisodeInput,
    context: {
      readonly workspaceId: string;
      readonly projectId: string;
      readonly principal: AuthenticatedPrincipal;
      readonly requestId: string;
      readonly idempotencyKey: string;
    }
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly lifecycleState: "active";
    readonly sourceEpisodeId: string;
    readonly sourceEpisodeRevision: number;
    readonly replayed: boolean;
  }>;
  forkEpisodeFromPattern(
    sourceEpisodeId: string,
    input: ForkEpisodeFromPatternInput,
    context: {
      readonly workspaceId: string;
      readonly projectId: string;
      readonly principal: AuthenticatedPrincipal;
      readonly requestId: string;
      readonly idempotencyKey: string;
    }
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly lifecycleState: "active";
    readonly sourceEpisodeId: string;
    readonly sourceEpisodeRevision: number;
    readonly patternLineage: ForkEpisodeFromPatternInput["patternLineage"];
    readonly replayed: boolean;
  }>;
}

function requireEpisodeLifecycleMutationAuthority(input: {
  readonly workspaceId: string;
  readonly principal: AuthenticatedPrincipal;
  readonly idempotencyKey: string;
}): void {
  if (
    input.principal.workspaceId !== input.workspaceId ||
    !input.principal.permissions.includes("content.write")
  )
    throw new ApplicationError(
      "authorization_denied",
      "Episode lifecycle changes require content.write authorization.",
      false
    );
  if (input.idempotencyKey.trim().length === 0)
    throw new ApplicationError(
      "precondition_required",
      "Idempotency-Key is required for episode lifecycle changes.",
      false
    );
}

/** PostgreSQL-backed application facade used by the HTTP composition root. */
export function createPostgresApiUseCases(input: {
  readonly pool: PostgresPool;
  readonly workflowAdmissionHandler: Pick<WorkflowAdmissionHandler, "execute">;
  readonly cursorSecret: string;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}): ApiUseCases & EpisodeLifecycleUseCases {
  if (Buffer.byteLength(input.cursorSecret, "utf8") < 32)
    throw new Error("API cursor signing secret must contain at least 32 bytes.");
  const repository = new PostgresWorkflowRepository(input.pool);
  const usageAudit = new PostgresUsageAuditRepository(input.pool);
  const publications = new PostgresPublicationIntentRepository(repository);
  const analytics = new PostgresRevisionAnalyticsRepository(input.pool);
  const analyticsComparison = createRevisionAnalyticsComparisonUseCase({ analytics });
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? id;
  const admit = createApiWorkflowAdmissionUseCase(input.workflowAdmissionHandler);

  return {
    compareRevisionAnalytics: async (request, context) => {
      if (
        context.principal.workspaceId !== context.workspaceId ||
        !context.principal.permissions.includes("content.write")
      )
        throw new ApplicationError(
          "authorization_denied",
          "Analytics comparison requires content.write authorization.",
          false,
        );
      const episode = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.getEpisode(
          context.workspaceId,
          context.projectId,
          request.episodeId,
        ),
      );
      if (!episode)
        throw new ApplicationError("not_found", "Episode not found.", false);
      if (
        !episode.content ||
        typeof episode.content !== "object" ||
        Reflect.get(episode.content, "type") !== request.contentProfileId
      )
        throw new ApplicationError(
          "profile_input_invalid",
          "Analytics comparison content profile does not match the episode.",
          false,
        );
      try {
        return await analyticsComparison.compare(request, {
          workspaceId: context.workspaceId,
          principal: context.principal,
          idempotencyKey: `v1:${digest({
            principalId: context.principal.principalId,
            method: "POST",
            route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/analytics-comparisons`,
            key: context.idempotencyKey,
          })}`,
        });
      } catch (error) {
        if (error instanceof RevisionAnalyticsConflictError) {
          if (error.message.includes("observations are missing"))
            throw new ApplicationError("precondition_failed", error.message, false);
          throw new ApplicationError("idempotency_key_conflict", error.message, false);
        }
        if (error instanceof Error && error.message.startsWith("ANALYTICS_COMPARISON_"))
          throw new ApplicationError("invalid_request", "Analytics comparison input is inconsistent.", false);
        throw error;
      }
    },
    ingestRevisionAnalytics: async (observation, context) => {
      if (
        context.principal.workspaceId !== context.workspaceId ||
        !context.principal.permissions.includes("content.write")
      )
        throw new ApplicationError(
          "authorization_denied",
          "Analytics ingestion requires content.write authorization.",
          false,
        );
      const parsed = normalizeRevisionAnalyticsObservation({
        ...observation,
        regenerationRationale: "new-observation",
      });
      const episode = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            parsed.episodeId,
          ),
      );
      if (!episode)
        throw new ApplicationError("not_found", "Episode not found.", false);
      if (
        !episode.content ||
        typeof episode.content !== "object" ||
        Reflect.get(episode.content, "type") !== parsed.contentProfileId
      )
        throw new ApplicationError(
          "profile_input_invalid",
          "Analytics content profile does not match the episode.",
          false,
        );
      const publication = await publications.getForEpisode({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId: parsed.episodeId,
        publicationId: parsed.publicationId,
      });
      if (!publication)
        throw new ApplicationError(
          "not_found",
          "Published revision was not found for the episode.",
          false,
        );
      if (
        publication.revision !== parsed.publicationRevision ||
        publication.status !== "published"
      )
        throw new ApplicationError(
          "precondition_failed",
          "Analytics must reference the current immutable published revision.",
          false,
        );
      try {
        return await analytics.append({
          workspaceId: context.workspaceId,
          idempotencyKey: `v1:${digest({
            principalId: context.principal.principalId,
            method: "POST",
            route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/analytics-observations`,
            key: context.idempotencyKey,
          })}`,
          observation: parsed,
        });
      } catch (error) {
        if (error instanceof RevisionAnalyticsConflictError)
          throw new ApplicationError(
            "idempotency_key_conflict",
            error.message,
            false,
          );
        throw error;
      }
    },
    getQuota: async (context) => {
      const record = await usageAudit.getQuotaStatus(context.workspaceId);
      return record ? {
        workspaceId: record.workspaceId,
        budgetLimitMinor: record.budgetLimitMinor.toString(),
        reservedMinor: record.reservedMinor.toString(),
        settledMinor: record.settledMinor.toString(),
        availableMinor: record.availableMinor.toString(),
        revision: record.revision,
      } : null;
    },
    listUsageRecords: async (after, size, context) => {
      const cursor = decodeWorkspaceCursor(after, {
        workspaceId: context.workspaceId,
        collection: "usage-records",
      }, input.cursorSecret);
      const records = await usageAudit.listUsage({
        workspaceId: context.workspaceId,
        ...(cursor ? { after: { occurredAt: cursor.occurredAt, usageId: cursor.id } } : {}),
        size: size < 100 ? size + 1 : size,
      });
      const page = records.slice(0, size);
      let hasMore = records.length > size;
      if (!hasMore && size === 100 && page.length === 100) {
        const last = page.at(-1)!;
        hasMore = (await usageAudit.listUsage({
          workspaceId: context.workspaceId,
          after: { occurredAt: last.occurredAt, usageId: last.usageId },
          size: 1,
        })).length > 0;
      }
      const last = page.at(-1);
      return {
        items: page.map((record) => ({
          id: record.usageId,
          kind: record.kind,
          subjectId: record.subjectId,
          operation: record.operation,
          unit: record.unit,
          quantityUnits: record.quantityUnits.toString(),
          costMinor: record.costMinor.toString(),
          correctionOfUsageId: record.correctionOfUsageId,
          attemptId: record.attemptId,
          data: record.data,
          occurredAt: record.occurredAt,
        })),
        ...(hasMore && last ? { nextAfter: encodeWorkspaceCursor({
          workspaceId: context.workspaceId,
          collection: "usage-records",
          occurredAt: last.occurredAt,
          id: last.usageId,
        }, input.cursorSecret) } : {}),
      };
    },
    listAuditEvents: async (after, size, context) => {
      const cursor = decodeWorkspaceCursor(after, {
        workspaceId: context.workspaceId,
        collection: "audit-events",
      }, input.cursorSecret);
      const records = await usageAudit.listAuditFacts({
        workspaceId: context.workspaceId,
        ...(cursor ? { after: { occurredAt: cursor.occurredAt, auditId: cursor.id } } : {}),
        size: size < 100 ? size + 1 : size,
      });
      const page = records.slice(0, size);
      let hasMore = records.length > size;
      if (!hasMore && size === 100 && page.length === 100) {
        const last = page.at(-1)!;
        hasMore = (await usageAudit.listAuditFacts({
          workspaceId: context.workspaceId,
          after: { occurredAt: last.occurredAt, auditId: last.auditId },
          size: 1,
        })).length > 0;
      }
      const last = page.at(-1);
      return {
        items: page.map((record) => ({
          id: record.auditId,
          action: record.action,
          subjectId: record.subjectId,
          actorId: record.actorId,
          correlationId: record.correlationId,
          causationId: record.causationId,
          data: record.data,
          occurredAt: record.occurredAt,
        })),
        ...(hasMore && last ? { nextAfter: encodeWorkspaceCursor({
          workspaceId: context.workspaceId,
          collection: "audit-events",
          occurredAt: last.occurredAt,
          id: last.auditId,
        }, input.cursorSecret) } : {}),
      };
    },
    createProject: async (project, context) => {
      try {
        const record = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.createProject({
            workspaceId: context.workspaceId,
            projectId: createId("project"),
            name: project.name,
            profile: project.profile,
            now: now().toISOString(),
          })
        );
        return { id: record.projectId, revision: record.revision };
      } catch (error) {
        return translatePersistence(error);
      }
    },
    createEpisode: async (episode, context) => {
      const canonicalEpisode = parseEpisodeInput(episode);
      try {
        const record = await repository.withWorkspaceTransaction(
          context.workspaceId,
          async (transaction) => {
            const project = await transaction.getProject(context.workspaceId, context.projectId);
            if (!project) return null;
            if (project.profile !== canonicalEpisode.content.type)
              throw new ApplicationError("profile_input_invalid", "Episode content does not match the project profile.", false);
            return transaction.createEpisode({
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              episodeId: createId("episode"),
              content: canonicalEpisode.content,
              now: now().toISOString(),
            });
          }
        );
        if (!record) throw new ApplicationError("not_found", "Resource not found.", false);
        return { id: record.episodeId, revision: record.revision };
      } catch (error) {
        return translatePersistence(error);
      }
    },
    getEpisode: async (episodeId, context) => {
      const record = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.getEpisode(
          context.workspaceId,
          context.projectId,
          episodeId
        )
      );
      return record ? {
        id: record.episodeId,
        revision: record.revision,
        content: record.content,
        lifecycleState: record.lifecycleState,
        sourceEpisodeId: record.sourceEpisodeId,
        sourceEpisodeRevision: record.sourceEpisodeRevision,
      } : null;
    },
    replaceEpisodeContent: async (episodeId, episode, context) => {
      const canonicalEpisode = parseEpisodeInput(episode);
      const expectedRevision = parseEtag(context.ifMatch);
      try {
        const replacement = await repository.withWorkspaceTransaction(
          context.workspaceId,
          async (transaction) => {
            const project = await transaction.getProject(context.workspaceId, context.projectId);
            if (!project) return null;
            const current = await transaction.getEpisode(
              context.workspaceId,
              context.projectId,
              episodeId
            );
            if (!current) return null;
            if (current.revision !== expectedRevision)
              throw new ApplicationError("precondition_failed", "If-Match does not match the current episode revision.", false);
            if (project.profile !== canonicalEpisode.content.type)
              throw new ApplicationError("profile_input_invalid", "Episode content does not match the project profile.", false);
            return transaction.replaceEpisodeContent({
              workspaceId: context.workspaceId,
              projectId: context.projectId,
              episodeId,
              expectedRevision,
              revisionId: createId("episode-revision"),
              content: canonicalEpisode.content,
              evidence: {
                kind: "api.episode_content_replacement",
                requestId: context.requestId,
                actorPrincipalId: context.principal.principalId,
                expectedRevision,
              },
              now: now().toISOString(),
            });
          }
        );
        if (!replacement) throw new ApplicationError("not_found", "Resource not found.", false);
        return {
          id: replacement.episode.episodeId,
          revision: replacement.episode.revision,
          content: canonicalEpisode.content,
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("precondition_failed", "If-Match does not match the current episode revision.", false);
        return translatePersistence(error);
      }
    },
    archiveEpisode: async (episodeId, archive, context) => {
      const parsed = archiveEpisodeInputSchema.parse(archive);
      if (parseEtag(context.ifMatch) !== parsed.expectedRevision)
        throw new ApplicationError("precondition_failed", "If-Match does not match expectedRevision.", false);
      requireEpisodeLifecycleMutationAuthority(context);
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.archiveEpisode({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            episodeId,
            expectedRevision: parsed.expectedRevision,
            actorPrincipalId: context.principal.principalId,
            reason: parsed.reason,
            commandId: createId("command"),
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/episodes/${episodeId}:archive`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({
              contractVersion: "episode-lifecycle.v1",
              projectId: context.projectId,
              episodeId,
              archive: parsed,
            }),
            now: now().toISOString(),
          })
        );
        return {
          id: result.episode.episodeId,
          revision: result.episode.revision,
          lifecycleState: "archived" as const,
          replayed: result.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError) {
          if (error.message.includes("Idempotency key"))
            throw new ApplicationError("idempotency_key_conflict", "Idempotency key is already associated with a different request.", false);
          throw new ApplicationError("precondition_failed", "Episode is missing, no longer active, or its revision changed.", false);
        }
        return translatePersistence(error);
      }
    },
    cloneEpisode: async (sourceEpisodeId, clone, context) => {
      const parsed = cloneEpisodeInputSchema.parse(clone);
      requireEpisodeLifecycleMutationAuthority(context);
      const episodeId = createId("episode");
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.cloneEpisode({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            sourceEpisodeId,
            expectedSourceRevision: parsed.expectedSourceRevision,
            episodeId,
            revisionId: createId("episode-revision"),
            actorPrincipalId: context.principal.principalId,
            commandId: createId("command"),
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/episodes/${sourceEpisodeId}:clone`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({
              contractVersion: "episode-lifecycle.v1",
              projectId: context.projectId,
              sourceEpisodeId,
              clone: parsed,
            }),
            now: now().toISOString(),
          })
        );
        if (
          result.episode.sourceEpisodeId === null ||
          result.episode.sourceEpisodeRevision === null
        ) throw new ApplicationError("upstream_unavailable", "Stored episode clone lineage is invalid.", false);
        return {
          id: result.episode.episodeId,
          revision: result.episode.revision,
          lifecycleState: "active" as const,
          sourceEpisodeId: result.episode.sourceEpisodeId,
          sourceEpisodeRevision: result.episode.sourceEpisodeRevision,
          replayed: result.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError) {
          if (error.message.includes("Idempotency key"))
            throw new ApplicationError("idempotency_key_conflict", "Idempotency key is already associated with a different request.", false);
          throw new ApplicationError("precondition_failed", "Source episode is missing or its revision changed.", false);
        }
        return translatePersistence(error);
      }
    },
    forkEpisodeFromPattern: async (sourceEpisodeId, fork, context) => {
      const parsed = forkEpisodeFromPatternInputSchema.parse(fork);
      requireEpisodeLifecycleMutationAuthority(context);
      const pattern = await analytics.getObservation({
        workspaceId: context.workspaceId,
        contentProfileId: "veronicabenini",
        episodeId: sourceEpisodeId,
        observationId: parsed.patternLineage.patternId,
      });
      if (
        !pattern ||
        pattern.configurationRevision !==
          parsed.patternLineage.configurationRevision ||
        immutablePlanHash(pattern.dependencyIdentity) !==
          parsed.patternLineage.dependencyFingerprint ||
        pattern.provenanceSha256 !== parsed.patternLineage.provenanceHash
      )
        throw new ApplicationError(
          "precondition_failed",
          "Pattern lineage does not match an immutable analytics observation for the source episode.",
          false,
        );
      const episodeId = createId("episode");
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.forkEpisodeFromPattern({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            sourceEpisodeId,
            expectedSourceRevision: parsed.expectedSourceRevision,
            episodeId,
            revisionId: createId("episode-revision"),
            actorPrincipalId: context.principal.principalId,
            commandId: createId("command"),
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/episodes/${sourceEpisodeId}:fork-pattern`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({
              contractVersion: "episode-pattern-fork.v1",
              projectId: context.projectId,
              sourceEpisodeId,
              fork: parsed,
            }),
            patternLineage: parsed.patternLineage,
            now: now().toISOString(),
          })
        );
        if (
          result.episode.sourceEpisodeId === null ||
          result.episode.sourceEpisodeRevision === null
        ) throw new ApplicationError("upstream_unavailable", "Stored episode pattern fork lineage is invalid.", false);
        return {
          id: result.episode.episodeId,
          revision: result.episode.revision,
          lifecycleState: "active" as const,
          sourceEpisodeId: result.episode.sourceEpisodeId,
          sourceEpisodeRevision: result.episode.sourceEpisodeRevision,
          patternLineage: parsed.patternLineage,
          replayed: result.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError) {
          if (error.message.includes("Idempotency key"))
            throw new ApplicationError("idempotency_key_conflict", "Idempotency key is already associated with a different request.", false);
          throw new ApplicationError("precondition_failed", "Source episode is missing, stale, or not a canonical Veronica edition.", false);
        }
        return translatePersistence(error);
      }
    },
    admitWorkflow: async (command, context) => {
      try {
        return await admit(command, context);
      } catch (error) {
        return translatePersistence(error);
      }
    },
    getWorkflow: async (runId, context) => {
      const record = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.getBoundWorkflow({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          runId,
        })
      );
      return record ? { id: record.runId, revision: record.revision, status: record.status } : null;
    },
    listWorkflowSteps: async (runId, context) => {
      const records = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.listBoundWorkflowSteps({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          runId,
        })
      );
      if (!records) throw new ApplicationError("not_found", "Resource not found.", false);
      return {
        items: records.map((record) => ({
          id: record.stepId,
          revision: record.revision,
          status: record.status,
        })),
      };
    },
    cancelWorkflow: async (runId, context) => {
      const expectedRevision = parseEtag(context.ifMatch);
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.cancelBoundWorkflow({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            runId,
            expectedRevision,
            now: now().toISOString(),
          })
        );
        if (!result) throw new ApplicationError("not_found", "Resource not found.", false);
        return {
          workflowRunId: result.run.runId,
          jobId: result.jobId,
          revision: result.run.revision,
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("precondition_failed", error.message, false);
        return translatePersistence(error);
      }
    },
    resumeWorkflow: async (runId, context) => {
      const expectedRevision = parseEtag(context.ifMatch);
      const jobId = createId("job");
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.resumeBoundWorkflow({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            runId,
            expectedRevision,
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/workflow-runs/${runId}:resume`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({ contractVersion: "v1", runId, expectedRevision }),
            commandId: createId("command"),
            jobId,
            outboxId: createId("outbox"),
            now: now().toISOString(),
          })
        );
        if (!result) throw new ApplicationError("not_found", "Resource not found.", false);
        const response = result.response as { readonly workflowRunId?: unknown; readonly jobId?: unknown; readonly revision?: unknown };
        if (typeof response.workflowRunId !== "string" || typeof response.jobId !== "string" || typeof response.revision !== "number")
          throw new ApplicationError("upstream_unavailable", "Stored workflow resume response is invalid.", false);
        return { workflowRunId: response.workflowRunId, jobId: response.jobId, revision: response.revision };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("precondition_failed", error.message, false);
        return translatePersistence(error);
      }
    },
    getJob: async (jobId, context) => {
      const record = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.getBoundJob({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          jobId,
        })
      );
      if (!record) return null;
      const status = publicJobStatus(record.status);
      const failure = publicJobFailure(status);
      // `record.lastError` is diagnostic persistence data and never crosses the API boundary.
      return {
        id: record.jobId,
        revision: record.revision,
        status,
        attempts: record.attemptCount,
        cancellationRequested: record.cancellationRequested,
        ...(failure ? { failure } : {}),
      };
    },
    getAsset: async (assetId, context) => {
      const record = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.getAssetDescriptor({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          assetId,
        })
      );
      return record ? { id: record.assetId, mimeType: record.mimeType, bytes: record.bytes, sha256: record.sha256, lifecycle: record.lifecycle, provenance: record.provenance } : null;
    },
    listValidations: async (after, size, context) => {
      const decoded = decodeCursor(after, context, input.cursorSecret);
      const records = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.listValidations({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          ...(decoded ? { after: decoded } : {}),
          size: size + 1,
        })
      );
      const page = records.slice(0, size);
      const last = page.at(-1);
      return {
        items: page.map((record) => ({ id: record.validationId, ...record.result as object, createdAt: record.createdAt })),
        ...(records.length > size && last ? {
          nextAfter: encodeCursor({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            createdAt: last.createdAt,
            validationId: last.validationId,
          }, input.cursorSecret),
        } : {}),
      };
    },
    getPublication: async (publicationId, context) => {
      const record = await publications.get({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        publicationId,
      });
      return record ? {
        id: record.publicationId,
        revision: record.revision,
        status: record.status,
        workflowRunId: record.runId,
        approvalId: record.approvalId,
        approvalRevision: record.approvalRevision,
        approvalArtifactHash: record.approvalArtifactHash,
        assetHash: record.assetHash,
        artifactBindings: record.artifactBindings,
        channelId: record.channelId,
        visibility: record.visibility,
        scheduledAt: record.scheduledAt,
        playlistIds: record.playlistIds,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      } : null;
    },
    recordApproval: async (approval, context) => {
      const headerRevision = parseEtag(context.ifMatch);
      if (headerRevision !== approval.expectedRevision)
        throw new ApplicationError("precondition_failed", "If-Match does not match expectedRevision.", false);
      const timestamp = now().toISOString();
      const approvalId = createId("approval");
      const jobId = createId("job");
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.recordApproval({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            challengeId: approval.challengeId,
            subjectId: approval.subjectId,
            expectedRevision: approval.expectedRevision,
            decision: approval.decision,
            reason: approval.reason,
            approvalId,
            jobId,
            commandId: createId("command"),
            outboxId: createId("outbox"),
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/approvals`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({ projectId: context.projectId, approval }),
            now: timestamp,
            ...(approval.review
              ? {
                  gate: approval.review.gate,
                  locale: approval.review.locale,
                  variant: approval.review.variant,
                  inputArtifactHashes: approval.review.inputArtifactHashes,
                  outputArtifactHashes: approval.review.outputArtifactHashes,
                  actor: context.principal.principalId,
                  ...(approval.review.reviewerRole
                    ? { reviewerRole: approval.review.reviewerRole }
                    : {}),
                  ...(approval.review.expiresAt
                    ? { expiresAt: approval.review.expiresAt }
                    : {}),
                  ...(approval.review.supersedesApprovalId
                    ? { supersedesApprovalId: approval.review.supersedesApprovalId }
                    : {}),
                  highRisk: approval.review.highRisk,
                  ...(approval.review.requiredDistinctActors !== undefined
                    ? { requiredDistinctActors: approval.review.requiredDistinctActors }
                    : {}),
                }
              : {}),
          })
        );
        const response = result.response as { readonly id?: unknown; readonly jobId?: unknown; readonly revision?: unknown };
        if (typeof response.id !== "string" || typeof response.jobId !== "string" || typeof response.revision !== "number")
          throw new ApplicationError("upstream_unavailable", "Stored approval response is invalid.", false);
        return { id: response.id, jobId: response.jobId, revision: response.revision };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("precondition_failed", error.message, false);
        return translatePersistence(error);
      }
    },
    revokeApproval: async (approvalId, revocation, context) => {
      const expectedRevision = parseEtag(context.ifMatch);
      const timestamp = now().toISOString();
      try {
        const result = await repository.withWorkspaceTransaction(
          context.workspaceId,
          (transaction) => transaction.revokeApproval({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            approvalId,
            expectedRevision,
            actorPrincipalId: context.principal.principalId,
            reason: revocation.reason,
            eventId: createId("event"),
            commandId: createId("command"),
            idempotencyKey: `v1:${digest({
              principalId: context.principal.principalId,
              method: "POST",
              route: `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/approvals/${approvalId}:revoke`,
              key: context.idempotencyKey,
            })}`,
            requestFingerprint: digest({
              contractVersion: "v1",
              projectId: context.projectId,
              approvalId,
              expectedRevision,
              revocation,
            }),
            now: timestamp,
          })
        );
        const response = result.response as { readonly id?: unknown; readonly revision?: unknown; readonly state?: unknown; readonly revokedAt?: unknown };
        if (
          response.id !== approvalId ||
          typeof response.revision !== "number" ||
          !Number.isSafeInteger(response.revision) ||
          response.revision < 0 ||
          response.state !== "revoked" ||
          typeof response.revokedAt !== "string" ||
          !Number.isFinite(Date.parse(response.revokedAt))
        ) throw new ApplicationError("upstream_unavailable", "Stored approval revocation response is invalid.", false);
        return {
          id: response.id,
          revision: response.revision,
          state: response.state,
          revokedAt: response.revokedAt,
          replayed: result.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError) {
          if (error.message.includes("Idempotency key"))
            throw new ApplicationError("idempotency_key_conflict", "Idempotency key is already associated with a different request.", false);
          throw new ApplicationError("precondition_failed", "Approval is missing, stale, rejected, already revoked, or outside the project.", false);
        }
        return translatePersistence(error);
      }
    },
  };
}
