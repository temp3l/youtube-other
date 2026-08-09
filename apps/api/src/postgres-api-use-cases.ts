import crypto from "node:crypto";

import { z } from "zod";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
  type WorkflowAdmissionHandler,
} from "@mediaforge/application";
import {
  WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
  buildCapabilityRegistry,
  deriveGateEvidenceUpdates,
  previewProductionUnitInvalidation,
  productionUnitAddressSchema,
  productionUnitChangeSchema,
  projectQuotaDimensionStatus,
  projectWorkflowPortfolioPage,
  resolveProviderHealthStatus,
  resolveProductionConfiguration,
  type UsageDimension,
  workflowPortfolioFilterSchema,
} from "@mediaforge/domain";
import {
  PostgresUsageAuditRepository,
  PostgresPublicationIntentRepository,
  PostgresWorkflowRepository,
  WorkflowStateTransitionError,
  mapWorkflowPortfolioRow,
  type PostgresPool,
} from "@mediaforge/persistence";

import type { ApiJobFailure, ApiJobStatus, ApiUseCases } from "./http-server.js";
import {
  parseEpisodeInput,
  workflowAdmissionSchema,
} from "./contract.js";
import { createApiWorkflowAdmissionUseCase } from "./http-server.js";
import { createApiCredentialUseCases } from "./postgres-api-credential-use-cases.js";
import { createApiContentLifecycleUseCases } from "./postgres-api-content-lifecycle-use-cases.js";
import { createApiLocalizationUseCases } from "./postgres-api-localization-use-cases.js";
import { createApiPublicationPreparationUseCases } from "./postgres-api-publication-preparation-use-cases.js";
import { createApiReviewUseCases } from "./postgres-api-review-use-cases.js";
import { createApiContentReuseUseCases } from "./postgres-api-content-reuse-use-cases.js";
import { createApiWebhookUseCases } from "./postgres-api-webhook-use-cases.js";

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

interface ReadCursorValue {
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly collection: "projects" | "episodes" | "assets";
  readonly createdAt?: string;
  readonly id: string;
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function capabilityProfile(profile: string): "dark-truth" | "mathematics-education" | "strategic-reinvention" | "history" {
  const profiles = { dark_truth: "dark-truth", mathematics_education: "mathematics-education", strategic_reinvention: "strategic-reinvention", history: "history" } as const;
  const resolved = profiles[profile as keyof typeof profiles];
  if (!resolved) throw new ApplicationError("state_transition_rejected", "Project profile configuration is invalid.", false);
  return resolved;
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

function encodeReadCursor(value: ReadCursorValue, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function decodeReadCursor(
  value: string | undefined,
  expected: Pick<ReadCursorValue, "workspaceId" | "projectId" | "collection">,
  secret: string
): ReadCursorValue | undefined {
  if (value === undefined) return undefined;
  if (value.length > 4_096) throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature))
    throw new ApplicationError("invalid_request", "The page cursor is invalid.", false);
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ReadCursorValue>;
    if (
      parsed.workspaceId !== expected.workspaceId || parsed.projectId !== expected.projectId ||
      parsed.collection !== expected.collection || typeof parsed.id !== "string" || parsed.id.length < 1 || parsed.id.length > 160 ||
      (parsed.collection !== "assets" && (typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))))
    ) throw new Error("invalid");
    return parsed as ReadCursorValue;
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

/** PostgreSQL-backed application facade used by the HTTP composition root. */
export function createPostgresApiUseCases(input: {
  readonly pool: PostgresPool;
  readonly workflowAdmissionHandler: Pick<WorkflowAdmissionHandler, "execute">;
  readonly cursorSecret: string;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}): ApiUseCases {
  if (Buffer.byteLength(input.cursorSecret, "utf8") < 32)
    throw new Error("API cursor signing secret must contain at least 32 bytes.");
  const repository = new PostgresWorkflowRepository(input.pool);
  const usageAudit = new PostgresUsageAuditRepository(input.pool);
  const publications = new PostgresPublicationIntentRepository(repository);
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? id;
  const admit = createApiWorkflowAdmissionUseCase(input.workflowAdmissionHandler);
  const {
    issueApiCredential,
    listApiCredentials,
    getApiCredential,
    revokeApiCredential,
    rotateApiCredential,
    getDeveloperJourneyExamples,
  } = createApiCredentialUseCases({
    pool: input.pool,
    now,
    createId,
  });
  const webhookUseCases = createApiWebhookUseCases({
    pool: input.pool,
    cursorSecret: input.cursorSecret,
    now,
    createId,
  });
  const contentReuseUseCases = createApiContentReuseUseCases({
    pool: input.pool,
    cursorSecret: input.cursorSecret,
    now,
    createId,
  });
  const contentLifecycleUseCases = createApiContentLifecycleUseCases({
    pool: input.pool,
    evaluationSecret: input.cursorSecret,
    now,
  });
  const reviewUseCases = createApiReviewUseCases({
    pool: input.pool,
    now,
    createId,
  });
  const localizationUseCases = createApiLocalizationUseCases({
    pool: input.pool,
    now,
    createId,
  });
  const publicationPreparationUseCases = createApiPublicationPreparationUseCases({
    pool: input.pool,
    now,
    createId,
  });

  return {
    listProjects: async (after, size, context) => {
      const cursor = decodeReadCursor(after, { workspaceId: context.workspaceId, collection: "projects" }, input.cursorSecret);
      const records = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.listProjects({
        workspaceId: context.workspaceId,
        ...(cursor ? { after: { createdAt: cursor.createdAt!, projectId: cursor.id } } : {}),
        size: size + 1,
      }));
      const page = records.slice(0, size); const last = page.at(-1);
      return {
        items: page.map((record) => ({ id: record.projectId, name: record.name, profile: record.profile, revision: record.revision, createdAt: record.createdAt, updatedAt: record.updatedAt })),
        ...(records.length > size && last ? { nextAfter: encodeReadCursor({ workspaceId: context.workspaceId, collection: "projects", createdAt: last.createdAt, id: last.projectId }, input.cursorSecret) } : {}),
      };
    },
    getQuota: async (context) => {
      const record = await usageAudit.getQuotaStatus(context.workspaceId);
      const dimensions = await usageAudit.listWorkspaceQuotaDimensionSummaries(
        context.workspaceId
      );
      return record ? {
        workspaceId: record.workspaceId,
        budgetLimitMinor: record.budgetLimitMinor.toString(),
        reservedMinor: record.reservedMinor.toString(),
        settledMinor: record.settledMinor.toString(),
        availableMinor: record.availableMinor.toString(),
        revision: record.revision,
        ...(dimensions.length > 0
          ? {
              dimensions: dimensions.map((dimension) =>
                projectQuotaDimensionStatus({
                  dimension: dimension.dimension as UsageDimension,
                  limitUnits: Number(dimension.limitUnits),
                  reservedUnits: Number(dimension.reservedUnits),
                  settledUnits: Number(dimension.settledUnits),
                  enforcement: "hard",
                })
              ),
            }
          : {}),
      } : null;
    },
    listProviderHealth: async (context) => {
      const projectedAt = now().toISOString();
      const catalog = [
        {
          providerId: "openai",
          configured: true,
          supportedInProfile: true,
        },
        {
          providerId: "elevenlabs",
          configured: true,
          supportedInProfile: true,
          probeHealthy: false,
          fallbackProviderId: "provider-free",
        },
        {
          providerId: "provider-free",
          configured: true,
          supportedInProfile: true,
        },
      ];
      return {
        items: catalog.map((entry) =>
          resolveProviderHealthStatus({
            providerId: entry.providerId,
            scope: "speech",
            configured: entry.configured,
            supportedInProfile: entry.supportedInProfile,
            freshness: projectedAt,
            ...(entry.probeHealthy === false ? { probeHealthy: false } : {}),
            ...(entry.fallbackProviderId
              ? { fallbackProviderId: entry.fallbackProviderId }
              : {}),
          })
        ),
        projectedAt,
      };
    },
    listUsageRecords: async (after, size, filters, context) => {
      const cursor = decodeWorkspaceCursor(after, {
        workspaceId: context.workspaceId,
        collection: "usage-records",
      }, input.cursorSecret);
      const records = await usageAudit.listUsage({
        workspaceId: context.workspaceId,
        ...(cursor ? { after: { occurredAt: cursor.occurredAt, usageId: cursor.id } } : {}),
        size: size < 100 ? size + 1 : size,
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.operation ? { operation: filters.operation } : {}),
        ...(filters.unit ? { unit: filters.unit } : {}),
        ...(filters.attemptId ? { attemptId: filters.attemptId } : {}),
        ...(filters.occurredAfter ? { occurredAfter: filters.occurredAfter } : {}),
        ...(filters.occurredBefore ? { occurredBefore: filters.occurredBefore } : {}),
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
    listEpisodes: async (after, size, filters, context) => {
      const cursor = decodeReadCursor(after, { workspaceId: context.workspaceId, projectId: context.projectId, collection: "episodes" }, input.cursorSecret);
      const visibilityFilter = filters.visibility ?? "active";
      const visibilityMap = await contentLifecycleUseCases.listEpisodeVisibilityMap(
        context.workspaceId,
        context.projectId,
        visibilityFilter === "all" ? "all" : visibilityFilter
      );
      const records = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.listEpisodes({
        workspaceId: context.workspaceId, projectId: context.projectId,
        ...(cursor ? { after: { createdAt: cursor.createdAt!, episodeId: cursor.id } } : {}), size: size + 1,
      }));
      const filtered = records.filter((record) => {
        const visibility = visibilityMap[record.episodeId] ?? "active";
        if (visibility === "tombstoned") return false;
        if (visibilityFilter === "archived") return visibility === "archived";
        if (visibilityFilter === "all") return true;
        return visibility === "active";
      });
      const page = filtered.slice(0, size); const last = page.at(-1);
      return {
        items: page.map((record) => ({ id: record.episodeId, revision: record.revision, content: record.content, createdAt: record.createdAt, updatedAt: record.updatedAt })),
        ...(filtered.length > size && last ? { nextAfter: encodeReadCursor({ workspaceId: context.workspaceId, projectId: context.projectId, collection: "episodes", createdAt: last.createdAt, id: last.episodeId }, input.cursorSecret) } : {}),
      };
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
    getEpisodeProductionState: async (episodeId, context) => {
      const record = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisodeProductionState({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            episodeId,
          })
      );
      return record?.state ?? null;
    },
    getWorkspaceCapabilities: async (context) => {
      const tenant = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.getTenantSettings(context.workspaceId));
      return tenant ? buildCapabilityRegistry(tenant, now().toISOString()) : null;
    },
    getEpisodeResolvedConfiguration: async (episodeId, context) => {
      const resolved = await repository.withWorkspaceTransaction(context.workspaceId, async (transaction) => {
        const episode = await transaction.getEpisode(context.workspaceId, context.projectId, episodeId);
        if (!episode) return null;
        const project = await transaction.getProject(context.workspaceId, context.projectId);
        const tenant = await transaction.getTenantSettings(context.workspaceId);
        if (!project || !tenant) return null;
        const profileId = capabilityProfile(project.profile);
        const [genre, episodeOverride] = await Promise.all([
          transaction.getGenreConfiguration(context.workspaceId, profileId),
          transaction.getEpisodeConfigurationOverride({ workspaceId: context.workspaceId, projectId: context.projectId, episodeId }),
        ]);
        return resolveProductionConfiguration({ profileId, tenant, ...(genre ? { genre } : {}), ...(episodeOverride ? { episode: episodeOverride } : {}), resolvedAt: now().toISOString() });
      });
      return resolved;
    },
    listProductionUnitSnapshots: async (episodeId, context) => {
      const episode = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.getEpisode(context.workspaceId, context.projectId, episodeId));
      if (!episode) throw new ApplicationError("not_found", "Resource not found.", false);
      const records = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.listCurrentProductionUnitSnapshots({ workspaceId: context.workspaceId, projectId: context.projectId, episodeId }));
      return { items: records.map((record) => ({ snapshotId: record.snapshotId, snapshot: record.snapshot, createdAt: record.createdAt })) };
    },
    compareProductionUnitSnapshots: async (episodeId, context) => {
      const episode = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.getEpisode(context.workspaceId, context.projectId, episodeId));
      if (!episode) throw new ApplicationError("not_found", "Resource not found.", false);
      const records = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.compareCurrentProductionUnitSnapshots({ workspaceId: context.workspaceId, projectId: context.projectId, episodeId }));
      return { items: records.map((record) => ({ current: { snapshotId: record.current.snapshotId, snapshot: record.current.snapshot, createdAt: record.current.createdAt }, ...(record.previous ? { previous: { snapshotId: record.previous.snapshotId, snapshot: record.previous.snapshot, createdAt: record.previous.createdAt } } : {}), ...(record.comparison ? { comparison: record.comparison } : {}) })) };
    },
    listWorkflowPortfolio: async (query, context) => {
      const filter = workflowPortfolioFilterSchema.parse({
        schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
        workspaceId: context.workspaceId,
        limit: query.size,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.profileId ? { profileId: query.profileId as never } : {}),
        ...(query.locale ? { locale: query.locale as never } : {}),
        ...(query.runStatus ? { runStatus: query.runStatus as never } : {}),
        ...(query.jobStatus ? { jobStatus: query.jobStatus as never } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      const cursorParts = filter.cursor?.split("|", 2);
      const rows = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.listWorkflowPortfolioSources({
            workspaceId: context.workspaceId,
            limit: filter.limit + 25,
            ...(filter.projectId ? { projectId: filter.projectId } : {}),
            ...(cursorParts?.[0] ? { cursorUpdatedAt: cursorParts[0] } : {}),
            ...(cursorParts?.[1] ? { cursorRunId: cursorParts[1] } : {}),
          })
      );
      const page = projectWorkflowPortfolioPage({
        filter,
        sources: rows.map((row) => mapWorkflowPortfolioRow(row)),
        projectedAt: now().toISOString(),
      });
      return {
        items: page.items.map((item) => ({
          projectId: item.projectId,
          episodeId: item.episodeId,
          runId: item.runId,
          runRevision: item.runRevision,
          runStatus: item.runStatus,
          profileId: item.profileId,
          locale: item.locale,
          episodeRevision: item.episodeRevision,
          latestJobId: item.latestJobId,
          latestJobStatus: item.latestJobStatus,
          latestJobAttempts: item.latestJobAttempts,
          latestStageId: item.latestStageId,
          latestStageStatus: item.latestStageStatus,
          preservedArtifactHashes: item.preservedArtifactHashes,
          blockers: item.blockers,
          recovery: item.recovery,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    previewArtifactInvalidation: async (episodeId, input, context) => {
      const episode = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            episodeId
          )
      );
      if (!episode) {
        throw new ApplicationError("not_found", "Resource not found.", false);
      }
      const changes = z.array(productionUnitChangeSchema).min(1).parse(
        input.changes
      );
      const records = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) => transaction.listCurrentProductionUnitSnapshots({ workspaceId: context.workspaceId, projectId: context.projectId, episodeId })
      );
      if (records.length === 0) {
        throw new ApplicationError("state_transition_rejected", "Production-unit snapshots are not available yet.", false);
      }
      const preview = previewProductionUnitInvalidation({
        units: records.map((record) => record.snapshot),
        changes,
        projectedAt: now().toISOString(),
      });
      const gateEvidenceUpdates = deriveGateEvidenceUpdates(preview);
      return {
        changedAddresses: preview.changedAddresses,
        invalidatedUnits: preview.invalidatedUnits,
        preservedUnits: preview.preservedUnits,
        regenerationTargets: preview.regenerationTargets,
        staleReviewReadiness: preview.staleReviewReadiness,
        stalePublishReadiness: preview.stalePublishReadiness,
        gateEvidenceUpdates,
        projectedAt: preview.projectedAt,
      };
    },
    regenerateProductionUnits: async (episodeId, input, context) => {
      const episode = await repository.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            episodeId
          )
      );
      if (!episode) {
        throw new ApplicationError("not_found", "Resource not found.", false);
      }
      const targets = z.array(productionUnitAddressSchema).min(1).parse(
        input.targets
      );
      if (
        targets.some(
          (target) =>
            target.kind === "review_readiness" ||
            target.kind === "publish_readiness"
        )
      ) {
        throw new ApplicationError(
          "profile_input_invalid",
          "Readiness units cannot be regenerated directly.",
          false
        );
      }
      const admission = workflowAdmissionSchema.parse({
        template: "episode-production",
        episodeRevision: episode.revision,
        locales: ["en"],
        variants: ["full"],
        approvalMode: "required",
        publicationMode: "none",
      });
      const admitted = await admit(admission, context);
      return {
        acceptedTargets: targets,
        workflowRunId: admitted.workflowRunId,
        jobId: admitted.jobId,
        revision: admitted.revision,
      };
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
    listAssets: async (after, size, context) => {
      const cursor = decodeReadCursor(after, { workspaceId: context.workspaceId, projectId: context.projectId, collection: "assets" }, input.cursorSecret);
      const records = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.listAssetDescriptors({
        workspaceId: context.workspaceId, projectId: context.projectId, ...(cursor ? { after: cursor.id } : {}), size: size + 1,
      }));
      const page = records.slice(0, size); const last = page.at(-1);
      return {
        items: page.map((record) => ({ id: record.assetId, mimeType: record.mimeType, bytes: record.bytes, sha256: record.sha256, lifecycle: record.lifecycle, provenance: record.provenance })),
        ...(records.length > size && last ? { nextAfter: encodeReadCursor({ workspaceId: context.workspaceId, projectId: context.projectId, collection: "assets", id: last.assetId }, input.cursorSecret) } : {}),
      };
    },
    getApprovalChallenge: async (challengeId, context) => {
      const record = await repository.withWorkspaceTransaction(context.workspaceId, (transaction) => transaction.getApprovalChallenge({ workspaceId: context.workspaceId, projectId: context.projectId, challengeId }));
      return record ? { id: record.challengeId, subjectId: record.subjectId, subjectRevision: record.subjectRevision, artifactHash: record.artifactHash, expiresAt: record.expiresAt, consumedAt: record.consumedAt } : null;
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
    issueApiCredential,
    listApiCredentials,
    getApiCredential,
    revokeApiCredential,
    rotateApiCredential,
    getDeveloperJourneyExamples,
    ...webhookUseCases,
    ...contentReuseUseCases,
    ...contentLifecycleUseCases,
    ...reviewUseCases,
    ...localizationUseCases,
    ...publicationPreparationUseCases,
  };
}
