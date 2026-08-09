import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertWorkspaceAdminAccess,
  evaluatePublicationIntentPreflight,
  evaluateOAuthSessionTenantBinding,
  evaluateScheduleAdmission,
  publicationPrepareInputSchema,
  publicationPreflightInputSchema,
  publicationScheduleUpdateInputSchema,
  projectPublishingChannelRecord,
  projectPublicationMetadataRevision,
  redactChannelConnectionForApi,
  type ContentLocale,
  type PublishingChannelConnectionStatus,
  type PublicationVisibility,
} from "@mediaforge/domain";
import {
  PostgresPublicationIntentRepository,
  PostgresPublicationPreparationRepository,
  PostgresWorkflowRepository,
  WorkflowStateTransitionError,
  mapPublishingChannelRow,
  type PostgresPool,
  type PublicationIntentRecord,
} from "@mediaforge/persistence";

import type { ApiRequestContext } from "./http-server.js";

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseEtag(value: string | undefined): number {
  const match = value?.match(/^W\/"(\d+)"$/u) ?? value?.match(/^"(\d+)"$/u);
  if (!match)
    throw new ApplicationError(
      "precondition_required",
      "If-Match is required.",
      false
    );
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new ApplicationError(
      "precondition_failed",
      "If-Match revision is invalid.",
      false
    );
  return revision;
}

function assertSchedule(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes("publication.schedule"))
    throw new ApplicationError(
      "authorization_denied",
      "Publication preparation requires publication.schedule.",
      false
    );
}

function assertChannelManage(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes("channel.credentials.manage"))
    throw new ApplicationError(
      "authorization_denied",
      "Channel connection requires channel.credentials.manage.",
      false
    );
}

function assertPublicationRead(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes("publication.read"))
    throw new ApplicationError(
      "authorization_denied",
      "Channel listing requires publication.read.",
      false
    );
}

function assertAdmin(principal: AuthenticatedPrincipal): void {
  try {
    assertWorkspaceAdminAccess(principal.permissions);
  } catch {
    throw new ApplicationError(
      "authorization_denied",
      "Channel administration requires workspace admin access.",
      false
    );
  }
}

function toChannelRecord(
  mapped: ReturnType<typeof mapPublishingChannelRow>
): ReturnType<typeof projectPublishingChannelRecord> {
  return projectPublishingChannelRecord({
    workspaceId: mapped.workspaceId,
    channelId: mapped.channelId,
    displayName: mapped.displayName,
    ...(mapped.providerChannelId
      ? { providerChannelId: mapped.providerChannelId }
      : {}),
    connectionStatus:
      mapped.connectionStatus as PublishingChannelConnectionStatus,
    ...(mapped.credentialVersion
      ? { credentialVersion: mapped.credentialVersion }
      : {}),
    ...(mapped.defaultVisibility
      ? {
          defaultVisibility:
            mapped.defaultVisibility as PublicationVisibility,
        }
      : {}),
    ...(mapped.defaultLocale
      ? { defaultLocale: mapped.defaultLocale as ContentLocale }
      : {}),
  supportedLocales: Array.isArray(mapped.supportedLocales)
      ? (mapped.supportedLocales as ContentLocale[])
      : [],
    revision: mapped.revision,
    ...(mapped.authorizationExpiresAt
      ? { authorizationExpiresAt: mapped.authorizationExpiresAt }
      : {}),
    updatedAt: mapped.updatedAt,
  });
}

async function loadPreparationContext(input: {
  readonly preparation: PostgresPublicationPreparationRepository;
  readonly workflow: PostgresWorkflowRepository;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly channelId: string;
}) {
  const productionState = await input.workflow.withWorkspaceTransaction(
    input.workspaceId,
    (transaction) =>
      transaction.getEpisodeProductionState({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        episodeId: input.episodeId,
      })
  );
  if (!productionState)
    throw new ApplicationError("not_found", "Episode production state not found.", false);

  const channel = await input.preparation.getChannel({
    workspaceId: input.workspaceId,
    channelId: input.channelId,
  });
  if (!channel)
    throw new ApplicationError("not_found", "Publishing channel not found.", false);

  const schedulePolicy = await input.preparation.getSchedulePolicy(
    input.workspaceId
  );

  return { productionState, channel, schedulePolicy };
}

function publicationResponse(record: PublicationIntentRecord) {
  return {
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
  };
}

export function createApiPublicationPreparationUseCases(input: {
  readonly pool: PostgresPool;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  const preparation = new PostgresPublicationPreparationRepository(input.pool);
  const workflow = new PostgresWorkflowRepository(input.pool);
  const publications = new PostgresPublicationIntentRepository(workflow);
  const now = input.now ?? (() => new Date());
  const createId =
    input.createId ??
    ((prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/gu, "")}`);

  async function ensureSchema(): Promise<void> {
    await preparation.ensureSchema();
  }

  return {
    listPublishingChannels: async (
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "requestId">
      >
    ) => {
      assertPublicationRead(context.principal);
      await ensureSchema();
      const items = await preparation.listChannels(context.workspaceId);
      return {
        items: items.map(
          (item: ReturnType<typeof mapPublishingChannelRow>) =>
            redactChannelConnectionForApi(toChannelRecord(item))
        ),
      };
    },

    getPublishingChannel: async (
      channelId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "requestId">
      >
    ) => {
      assertPublicationRead(context.principal);
      await ensureSchema();
      const channel = await preparation.getChannel({
        workspaceId: context.workspaceId,
        channelId,
      });
      if (!channel)
        throw new ApplicationError("not_found", "Publishing channel not found.", false);
      return redactChannelConnectionForApi(toChannelRecord(channel));
    },

    beginChannelConnect: async (
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "requestId">
      >
    ) => {
      assertAdmin(context.principal);
      assertChannelManage(context.principal);
      await ensureSchema();
      const evaluatedAt = now().toISOString();
      const sessionId = createId("oauth-session");
      const nonce = crypto.randomBytes(16).toString("base64url");
      const expiresAt = new Date(Date.parse(evaluatedAt) + 15 * 60 * 1000).toISOString();
      await preparation.beginOAuthSession({
        workspaceId: context.workspaceId,
        sessionId,
        nonce,
        expiresAt,
        now: evaluatedAt,
      });
      const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(
        `${context.workspaceId}:${sessionId}:${nonce}`
      )}&response_type=code&client_id=mediaforge-server`;
      return { sessionId, authorizationUrl, expiresAt };
    },

    disconnectPublishingChannel: async (
      channelId: string,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "principal" | "requestId" | "ifMatch"
        >
      >
    ) => {
      assertAdmin(context.principal);
      assertChannelManage(context.principal);
      await ensureSchema();
      const channel = await preparation.getChannel({
        workspaceId: context.workspaceId,
        channelId,
      });
      if (!channel)
        throw new ApplicationError("not_found", "Publishing channel not found.", false);
      const expectedRevision = parseEtag(context.ifMatch);
      const updated = await preparation.disconnectChannel({
        workspaceId: context.workspaceId,
        channelId,
        expectedRevision,
        now: now().toISOString(),
      });
      if (!updated)
        throw new ApplicationError(
          "precondition_failed",
          "Channel revision is stale.",
          false
        );
      return redactChannelConnectionForApi(toChannelRecord(updated));
    },

    evaluatePublicationPreflight: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "requestId"
        >
      >
    ) => {
      assertSchedule(context.principal);
      await ensureSchema();
      const parsedBody = publicationPreflightInputSchema.parse({
        ...(body as object),
        episodeId,
      });
      const { productionState, channel, schedulePolicy } =
        await loadPreparationContext({
          preparation,
          workflow,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          episodeId,
          channelId: parsedBody.channelId,
        });
      const state = productionState.state;
      const result = evaluatePublicationIntentPreflight({
        ...parsedBody,
        publishReady: state.publication.publishReady,
        renderStatus: state.render.status,
        requiredReviewGates: state.review.requiredGates,
        activeApprovals: state.review.approvals.map((approval) => ({
          approvalId: approval.approvalId,
          ...(approval.gate ? { gate: approval.gate } : {}),
          state: approval.state,
          ...(approval.boundFingerprint
            ? { boundFingerprint: approval.boundFingerprint }
            : {}),
        })),
        validationStatuses: state.validation.items.map((item) => item.status),
        channelConnectionStatus:
          channel.connectionStatus as PublishingChannelConnectionStatus,
        schedulePolicy: schedulePolicy
          ? {
              maxScheduleHorizonHours: schedulePolicy.maxScheduleHorizonHours,
              defaultTimezone: schedulePolicy.defaultTimezone,
            }
          : null,
        currentEpisodeRevision: state.currentProductionRevision.episodeRevision,
        boundEpisodeRevision: parsedBody.boundEpisodeRevision,
      });
      return result;
    },

    preparePublicationIntent: async (
      episodeId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          | "workspaceId"
          | "projectId"
          | "principal"
          | "requestId"
          | "idempotencyKey"
        >
      >
    ) => {
      assertSchedule(context.principal);
      await ensureSchema();
      const parsed = publicationPrepareInputSchema.parse({
        ...(body as object),
        episodeId,
      });
      const evaluatedAt = now().toISOString();
      const { productionState, channel, schedulePolicy } =
        await loadPreparationContext({
          preparation,
          workflow,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          episodeId,
          channelId: parsed.channelId,
        });
      const state = productionState.state;
      const preflight = evaluatePublicationIntentPreflight({
        ...parsed,
        publishReady: state.publication.publishReady,
        renderStatus: state.render.status,
        requiredReviewGates: state.review.requiredGates,
        activeApprovals: state.review.approvals.map((approval) => ({
          approvalId: approval.approvalId,
          ...(approval.gate ? { gate: approval.gate } : {}),
          state: approval.state,
          ...(approval.boundFingerprint
            ? { boundFingerprint: approval.boundFingerprint }
            : {}),
        })),
        validationStatuses: state.validation.items.map((item) => item.status),
        channelConnectionStatus:
          channel.connectionStatus as PublishingChannelConnectionStatus,
        schedulePolicy: schedulePolicy
          ? {
              maxScheduleHorizonHours: schedulePolicy.maxScheduleHorizonHours,
              defaultTimezone: schedulePolicy.defaultTimezone,
            }
          : null,
        currentEpisodeRevision: state.currentProductionRevision.episodeRevision,
        boundEpisodeRevision: parsed.boundEpisodeRevision,
      });
      if (!preflight.admitted)
        throw new ApplicationError(
          "precondition_failed",
          preflight.rejections[0]?.message ?? "Publication preflight failed.",
          false
        );

      const runId = state.workflow.activeRunId;
      if (!runId)
        throw new ApplicationError(
          "precondition_failed",
          "Episode has no workflow run to bind publication intent.",
          false
        );
      if (!channel.credentialVersion)
        throw new ApplicationError(
          "precondition_failed",
          "Publishing channel has no active credential version.",
          false
        );

      const principalRevision = await preparation.getPrincipalRevision({
        workspaceId: context.workspaceId,
        principalId: context.principal.principalId,
      });
      if (principalRevision === null)
        throw new ApplicationError(
          "authorization_denied",
          "Principal is not active in this workspace.",
          false
        );

      const metadataRevisionId = createId("metadata-revision");
      const metadataRecord = projectPublicationMetadataRevision({
        metadataRevisionId,
        revision: 0,
        metadata: parsed.metadata,
        createdAt: evaluatedAt,
      });
      await preparation.insertMetadataRevision({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        episodeId,
        metadataRevisionId,
        contentHash: metadataRecord.contentHash,
        metadata: parsed.metadata,
        createdByPrincipalId: context.principal.principalId,
        now: evaluatedAt,
      });

      const publicationId = createId("publication");
      const commandId = createId("command-publication");
      const idempotencyKey =
        parsed.idempotencyKey ?? context.idempotencyKey ?? commandId;
      const requestFingerprint = digest({
        episodeId,
        ...parsed,
        metadataRevisionId,
      });

      try {
        const admission = await publications.admit({
          workspaceId: context.workspaceId,
          publicationId,
          projectId: context.projectId,
          runId,
          approvalId: parsed.approvalId,
          approvalRevision: parsed.approvalRevision,
          approvalArtifactHash: parsed.approvalArtifactHash,
          approvalPolicy: "scoped-v1",
          actorPrincipalId: context.principal.principalId,
          actorPrincipalRevision: principalRevision,
          credentialVersion: channel.credentialVersion,
          assetHash: parsed.assetHash,
          artifactBindings: parsed.artifactBindings,
          channelId: parsed.channelId,
          visibility: parsed.visibility,
          scheduledAt: parsed.scheduledAt ?? null,
          playlistIds: parsed.playlistIds,
          recoveryIdentity: createId("recovery-publication"),
          effectId: createId("effect-publication"),
          eventId: createId("event-publication"),
          outboxId: createId("outbox-publication"),
          commandId,
          idempotencyKey,
          requestFingerprint,
          now: evaluatedAt,
        });
        const record = await publications.get({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          publicationId,
        });
        if (!record)
          throw new ApplicationError(
            "upstream_unavailable",
            "Publication intent was not persisted.",
            true
          );
        return {
          publication: publicationResponse(record),
          metadataRevision: metadataRecord,
          replayed: admission.kind === "replayed",
        };
      } catch (error) {
        if (error instanceof WorkflowStateTransitionError)
          throw new ApplicationError("conflict", error.message, false);
        throw error;
      }
    },

    cancelPublicationIntent: async (
      publicationId: string,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "requestId" | "ifMatch"
        >
      >
    ) => {
      assertSchedule(context.principal);
      const expectedRevision = parseEtag(context.ifMatch);
      const cancelled = await publications.cancel({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        publicationId,
        expectedRevision,
        now: now().toISOString(),
      });
      if (!cancelled)
        throw new ApplicationError(
          "precondition_failed",
          "Publication is not pending or revision is stale.",
          false
        );
      return publicationResponse(cancelled);
    },

    updatePublicationSchedule: async (
      publicationId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "requestId" | "ifMatch"
        >
      >
    ) => {
      assertSchedule(context.principal);
      const parsed = publicationScheduleUpdateInputSchema.parse(body);
      const evaluatedAt = now().toISOString();
      const existing = await publications.get({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        publicationId,
      });
      if (!existing)
        throw new ApplicationError("not_found", "Publication not found.", false);
      if (existing.status !== "pending")
        throw new ApplicationError(
          "precondition_failed",
          "Only pending publications may change schedule.",
          false
        );

      const schedulePolicy = await preparation.getSchedulePolicy(
        context.workspaceId
      );
      const schedule = evaluateScheduleAdmission({
        scheduledAt: parsed.scheduledAt,
        scheduleTimezone: parsed.scheduleTimezone,
        now: evaluatedAt,
        schedulePolicy: schedulePolicy
          ? {
              maxScheduleHorizonHours: schedulePolicy.maxScheduleHorizonHours,
              defaultTimezone: schedulePolicy.defaultTimezone,
            }
          : null,
      });
      if (!schedule.allowed)
        throw new ApplicationError(
          "precondition_failed",
          schedule.message ?? "Schedule rejected.",
          false
        );

      const expectedRevision = parseEtag(context.ifMatch);
      await publications.cancel({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        publicationId,
        expectedRevision,
        now: evaluatedAt,
      });

      const replacementId = createId("publication");
      const commandId = createId("command-publication");
      const requestFingerprint = digest({
        replacementId,
        scheduledAt: parsed.scheduledAt,
        sourcePublicationId: publicationId,
      });
      const admission = await publications.admit({
        workspaceId: context.workspaceId,
        publicationId: replacementId,
        projectId: existing.projectId,
        runId: existing.runId,
        approvalId: existing.approvalId,
        approvalRevision: existing.approvalRevision,
        approvalArtifactHash: existing.approvalArtifactHash,
        approvalPolicy: existing.approvalPolicy,
        actorPrincipalId: existing.actorPrincipalId,
        actorPrincipalRevision: existing.actorPrincipalRevision,
        credentialVersion: existing.credentialVersion,
        assetHash: existing.assetHash,
        artifactBindings: existing.artifactBindings,
        channelId: existing.channelId,
        visibility: existing.visibility,
        scheduledAt: parsed.scheduledAt,
        playlistIds: existing.playlistIds,
        recoveryIdentity: createId("recovery-publication"),
        effectId: createId("effect-publication"),
        eventId: createId("event-publication"),
        outboxId: createId("outbox-publication"),
        commandId,
        idempotencyKey: commandId,
        requestFingerprint,
        now: evaluatedAt,
      });
      const record = await publications.get({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        publicationId: replacementId,
      });
      if (!record)
        throw new ApplicationError(
          "upstream_unavailable",
          "Replacement publication was not persisted.",
          true
        );
      return {
        publication: publicationResponse(record),
        replacedPublicationId: publicationId,
        replayed: admission.kind === "replayed",
      };
    },

    completeChannelConnectForTests: async (input: {
      readonly workspaceId: string;
      readonly sessionId: string;
      readonly callbackWorkspaceId: string;
      readonly callbackNonce: string;
      readonly channelId: string;
      readonly displayName: string;
      readonly providerChannelId: string;
    }): Promise<ReturnType<typeof redactChannelConnectionForApi>> => {
      const session = await preparation.getOAuthSession({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
      });
      if (!session)
        throw new ApplicationError("not_found", "OAuth session not found.", false);
      const binding = evaluateOAuthSessionTenantBinding({
        sessionWorkspaceId: input.workspaceId,
        callbackWorkspaceId: input.callbackWorkspaceId,
        sessionNonce: session.nonce,
        callbackNonce: input.callbackNonce,
      });
      if (!binding.allowed)
        throw new ApplicationError(
          "authorization_denied",
          binding.message ?? "OAuth binding rejected.",
          false
        );
      const evaluatedAt = now().toISOString();
      const credentialVersion = createId("credential");
      const mapped = await preparation.completeOAuthSession({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        channelId: input.channelId,
        displayName: input.displayName,
        providerChannelId: input.providerChannelId,
        credentialVersion,
        oauthTokenVaultRef: createId("oauth-vault"),
        authorizationExpiresAt: new Date(
          Date.parse(evaluatedAt) + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        now: evaluatedAt,
      });
      return redactChannelConnectionForApi(toChannelRecord(mapped));
    },
  };
}
