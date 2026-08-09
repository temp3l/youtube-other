import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertContentReadAccess,
  assertContentWriteAccess,
  assertWorkspaceAdminAccess,
  buildLifecycleTransitionResult,
  buildUnresolvedRetentionPolicy,
  evaluateArchiveAdmission,
  evaluateEpisodeDeletion,
  evaluateRestoreAdmission,
  episodeArchiveInputSchema,
  episodeDeletionInputSchema,
  episodeDeletionResultSchema,
  episodeRestoreInputSchema,
  projectEpisodeContentLifecycleRecord,
  projectRetentionPolicyRecord,
  retentionCategoryPolicySchema,
  verifyDeletionEvaluationToken,
} from "@mediaforge/domain";
import {
  PostgresContentLifecycleRepository,
  PostgresWorkflowRepository,
  mapEpisodeContentLifecycleRow,
  mapWorkspaceRetentionPolicyRow,
  type PostgresPool,
} from "@mediaforge/persistence";

import type { ApiRequestContext } from "./http-server.js";

function digest(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function assertRead(principal: AuthenticatedPrincipal): void {
  try {
    assertContentReadAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Content read requires content.read.",
      false
    );
  }
}

function assertWrite(principal: AuthenticatedPrincipal): void {
  try {
    assertContentWriteAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Content write requires content.write.",
      false
    );
  }
}

function assertAdmin(principal: AuthenticatedPrincipal): void {
  try {
    assertWorkspaceAdminAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Workspace admin requires workspace.admin.",
      false
    );
  }
}

function toLifecycleRecord(
  mapped: ReturnType<typeof mapEpisodeContentLifecycleRow>
) {
  return projectEpisodeContentLifecycleRecord({
    workspaceId: mapped.workspaceId,
    projectId: mapped.projectId,
    episodeId: mapped.episodeId,
    visibility: mapped.visibility,
    revision: mapped.revision,
    ...(mapped.archiveReason ? { archiveReason: mapped.archiveReason } : {}),
    ...(mapped.archivedAt ? { archivedAt: mapped.archivedAt } : {}),
    ...(mapped.tombstonedAt ? { tombstonedAt: mapped.tombstonedAt } : {}),
    updatedAt: mapped.updatedAt,
  });
}

export function createApiContentLifecycleUseCases(input: {
  readonly pool: PostgresPool;
  readonly evaluationSecret: string;
  readonly now?: () => Date;
}) {
  if (Buffer.byteLength(input.evaluationSecret, "utf8") < 32)
    throw new Error("Deletion evaluation secret must contain at least 32 bytes.");
  const lifecycle = new PostgresContentLifecycleRepository(input.pool);
  const workflow = new PostgresWorkflowRepository(input.pool);
  const now = input.now ?? (() => new Date());

  async function ensureSchema(): Promise<void> {
    await lifecycle.ensureSchema();
  }

  async function loadRetentionPolicy(workspaceId: string) {
    await ensureSchema();
    const row = await lifecycle.getRetentionPolicy(workspaceId);
    if (!row) return buildUnresolvedRetentionPolicy(workspaceId);
    const mapped = mapWorkspaceRetentionPolicyRow(row);
    const categories = Array.isArray(mapped.categories)
      ? mapped.categories.map((entry) =>
          retentionCategoryPolicySchema.parse(entry)
        )
      : [];
    return projectRetentionPolicyRecord({
      workspaceId: mapped.workspaceId,
      revision: mapped.revision,
      categories,
      inheritedFromPlatform: mapped.inheritedFromPlatform,
      updatedAt: mapped.updatedAt,
    });
  }

  async function episodeExists(
    workspaceId: string,
    projectId: string,
    episodeId: string
  ): Promise<boolean> {
    const episode = await workflow.withWorkspaceTransaction(
      workspaceId,
      (transaction) =>
        transaction.getEpisode(workspaceId, projectId, episodeId)
    );
    return episode !== null;
  }

  async function loadEpisodeSignals(
    workspaceId: string,
    projectId: string,
    episodeId: string
  ) {
    const activeWorkflowRunCount =
      await lifecycle.countActiveWorkflowRunsForEpisode({
        workspaceId,
        projectId,
        episodeId,
      });
    const terminalPublicationCount =
      await lifecycle.countTerminalPublicationsForEpisode({
        workspaceId,
        projectId,
        episodeId,
      });
    const sharedAssetSurvivorCount =
      await lifecycle.countSharedAssetSurvivorsForEpisode({
        workspaceId,
        projectId,
        episodeId,
      });
    return {
      activeWorkflowRunCount,
      terminalPublicationCount,
      sharedAssetSurvivorCount,
    };
  }

  return {
    getEpisodeContentLifecycle: async (
      episodeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">
      >
    ) => {
      assertRead(context.principal);
      if (!(await episodeExists(context.workspaceId, context.projectId, episodeId)))
        throw new ApplicationError("not_found", "Resource not found.", false);
      const row = await lifecycle.ensureEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        now: now().toISOString(),
      });
      return toLifecycleRecord(mapEpisodeContentLifecycleRow(row));
    },
    getRetentionPolicy: async (
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertAdmin(context.principal);
      return loadRetentionPolicy(context.workspaceId);
    },
    archiveEpisode: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "ifMatch">
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = episodeArchiveInputSchema.parse(body);
      if (!(await episodeExists(context.workspaceId, context.projectId, episodeId)))
        throw new ApplicationError("not_found", "Resource not found.", false);
      const current = await lifecycle.ensureEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        now: now().toISOString(),
      });
      const mapped = mapEpisodeContentLifecycleRow(current);
      const expectedRevision = Number(context.ifMatch);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      if (mapped.revision !== expectedRevision)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      const activeWorkflowRunCount =
        await lifecycle.countActiveWorkflowRunsForEpisode({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          episodeId,
        });
      const admission = evaluateArchiveAdmission({
        visibility: mapped.visibility,
        activeWorkflowRunCount,
      });
      if (!admission.allowed)
        throw new ApplicationError(
          "precondition_failed",
          admission.message ?? "Episode cannot be archived.",
          false
        );
      if (mapped.visibility === "archived") {
        return buildLifecycleTransitionResult({
          lifecycle: toLifecycleRecord(mapped),
          replayed: true,
        });
      }
      const transitioned = await lifecycle.transitionEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        expectedRevision: mapped.revision,
        visibility: "archived",
        archiveReason: parsed.reason ?? null,
        archivedAt: now().toISOString(),
        tombstonedAt: null,
        now: now().toISOString(),
      });
      if (!transitioned)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      return buildLifecycleTransitionResult({
        lifecycle: toLifecycleRecord(
          mapEpisodeContentLifecycleRow(transitioned)
        ),
        replayed: false,
      });
    },
    restoreEpisode: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "ifMatch">
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      episodeRestoreInputSchema.parse(body);
      if (!(await episodeExists(context.workspaceId, context.projectId, episodeId)))
        throw new ApplicationError("not_found", "Resource not found.", false);
      const current = await lifecycle.ensureEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        now: now().toISOString(),
      });
      const mapped = mapEpisodeContentLifecycleRow(current);
      const expectedRevision = Number(context.ifMatch);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      if (mapped.revision !== expectedRevision)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      const admission = evaluateRestoreAdmission({
        visibility: mapped.visibility,
      });
      if (!admission.allowed)
        throw new ApplicationError(
          "precondition_failed",
          admission.message ?? "Episode cannot be restored.",
          false
        );
      if (mapped.visibility === "active") {
        return buildLifecycleTransitionResult({
          lifecycle: toLifecycleRecord(mapped),
          replayed: true,
        });
      }
      const transitioned = await lifecycle.transitionEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        expectedRevision: mapped.revision,
        visibility: "active",
        archiveReason: null,
        archivedAt: null,
        tombstonedAt: null,
        now: now().toISOString(),
      });
      if (!transitioned)
        throw new ApplicationError(
          "precondition_failed",
          "If-Match does not match the current lifecycle revision.",
          false
        );
      return buildLifecycleTransitionResult({
        lifecycle: toLifecycleRecord(
          mapEpisodeContentLifecycleRow(transitioned)
        ),
        replayed: false,
      });
    },
    evaluateEpisodeDeletion: async (
      episodeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal">
      >
    ) => {
      assertAdmin(context.principal);
      await ensureSchema();
      if (!(await episodeExists(context.workspaceId, context.projectId, episodeId)))
        throw new ApplicationError("not_found", "Resource not found.", false);
      const row = await lifecycle.ensureEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        now: now().toISOString(),
      });
      const mapped = mapEpisodeContentLifecycleRow(row);
      const retention = await loadRetentionPolicy(context.workspaceId);
      const legalHoldCategories = retention.categories
        .filter((category) => category.hold === "legal_hold")
        .map((category) => category.category);
      const signals = await loadEpisodeSignals(
        context.workspaceId,
        context.projectId,
        episodeId
      );
      return evaluateEpisodeDeletion({
        visibility: mapped.visibility,
        activeWorkflowRunCount: signals.activeWorkflowRunCount,
        terminalPublicationCount: signals.terminalPublicationCount,
        sharedAssetSurvivorCount: signals.sharedAssetSurvivorCount,
      retentionPolicyStatus: retention.status,
      legalHoldCategories,
      evaluationSecret: input.evaluationSecret,
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      episodeId,
    });
    },
    deleteEpisode: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "idempotencyKey"
        >
      >
    ) => {
      assertAdmin(context.principal);
      if (!context.idempotencyKey)
        throw new ApplicationError(
          "precondition_required",
          "Idempotency-Key is required.",
          false
        );
      await ensureSchema();
      const parsed = episodeDeletionInputSchema.parse(body);
      if (parsed.confirmation !== "DELETE")
        throw new ApplicationError(
          "precondition_failed",
          "Deletion confirmation must match DELETE.",
          false
        );
      if (!(await episodeExists(context.workspaceId, context.projectId, episodeId)))
        throw new ApplicationError("not_found", "Resource not found.", false);
      const fingerprint = digest(
        JSON.stringify({
          episodeId,
          evaluationToken: parsed.evaluationToken,
        })
      );
      const prior = await lifecycle.getDeletionIdempotency(
        context.workspaceId,
        context.idempotencyKey
      );
      if (prior) {
        if (prior.requestFingerprint !== fingerprint)
          throw new ApplicationError(
            "idempotency_key_conflict",
            "Idempotency key is already associated with a different request.",
            false
          );
        return episodeDeletionResultSchema.parse(prior.response);
      }
      const row = await lifecycle.ensureEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        now: now().toISOString(),
      });
      const mapped = mapEpisodeContentLifecycleRow(row);
      const retention = await loadRetentionPolicy(context.workspaceId);
      const legalHoldCategories = retention.categories
        .filter((category) => category.hold === "legal_hold")
        .map((category) => category.category);
      const signals = await loadEpisodeSignals(
        context.workspaceId,
        context.projectId,
        episodeId
      );
      const evaluation = evaluateEpisodeDeletion({
        visibility: mapped.visibility,
        activeWorkflowRunCount: signals.activeWorkflowRunCount,
        terminalPublicationCount: signals.terminalPublicationCount,
        sharedAssetSurvivorCount: signals.sharedAssetSurvivorCount,
      retentionPolicyStatus: retention.status,
      legalHoldCategories,
      evaluationSecret: input.evaluationSecret,
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      episodeId,
    });
      if (
        !verifyDeletionEvaluationToken({
          evaluation,
          evaluationSecret: input.evaluationSecret,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          episodeId,
          visibility: mapped.visibility,
          activeWorkflowRunCount: signals.activeWorkflowRunCount,
          terminalPublicationCount: signals.terminalPublicationCount,
          retentionPolicyStatus: retention.status,
          legalHoldCategories,
        }) ||
        parsed.evaluationToken !== evaluation.evaluationToken
      )
        throw new ApplicationError(
          "precondition_failed",
          "Deletion evaluation is stale or invalid.",
          false
        );
      if (!evaluation.allowed)
        throw new ApplicationError(
          "precondition_failed",
          evaluation.blockers[0]?.message ?? "Episode deletion is blocked.",
          false
        );
      if (mapped.visibility === "tombstoned") {
        const result = episodeDeletionResultSchema.parse({
          lifecycle: toLifecycleRecord(mapped),
          tombstoned: true,
          replayed: true,
        });
        await lifecycle.recordDeletionIdempotency({
          workspaceId: context.workspaceId,
          idempotencyKey: context.idempotencyKey,
          requestFingerprint: fingerprint,
          response: result,
          now: now().toISOString(),
        });
        return result;
      }
      const transitioned = await lifecycle.transitionEpisodeLifecycle({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        expectedRevision: mapped.revision,
        visibility: "tombstoned",
        archiveReason: mapped.archiveReason,
        archivedAt: mapped.archivedAt,
        tombstonedAt: now().toISOString(),
        now: now().toISOString(),
      });
      if (!transitioned)
        throw new ApplicationError(
          "precondition_failed",
          "Lifecycle revision changed during deletion.",
          false
        );
      const result = episodeDeletionResultSchema.parse({
        lifecycle: toLifecycleRecord(
          mapEpisodeContentLifecycleRow(transitioned)
        ),
        tombstoned: true,
        replayed: false,
      });
      await lifecycle.recordDeletionIdempotency({
        workspaceId: context.workspaceId,
        idempotencyKey: context.idempotencyKey,
        requestFingerprint: fingerprint,
        response: result,
        now: now().toISOString(),
      });
      return result;
    },
    listEpisodeVisibilityMap: async (
      workspaceId: string,
      projectId: string,
      filter: "active" | "archived" | "all" | undefined
    ): Promise<Readonly<Record<string, "active" | "archived" | "tombstoned">>> => {
      await ensureSchema();
      const rows = await lifecycle.listEpisodeLifecycles({
        workspaceId,
        projectId,
        ...(filter === "active" || filter === "archived"
          ? { visibility: filter }
          : {}),
      });
      const map: Record<string, "active" | "archived" | "tombstoned"> = {};
      for (const row of rows) {
        map[row.episode_id] = row.visibility;
      }
      return map;
    },
  };
}
