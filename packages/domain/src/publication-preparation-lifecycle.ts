import crypto from "node:crypto";

import {
  PUBLICATION_PREPARATION_SCHEMA_VERSION,
  publicationMetadataRevisionSchema,
  publicationPreflightResultSchema,
  publishingChannelRecordSchema,
  type PublicationMetadataInput,
  type PublicationPreflightInput,
  type PublishingChannelConnectionStatus,
  type PublishingChannelRecord,
} from "./publication-preparation-contracts.js";

const FORBIDDEN_CHANNEL_RESPONSE_FIELDS = [
  "accessToken",
  "refreshToken",
  "oauthTokenVaultRef",
  "token",
  "secret",
] as const;

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computePublicationMetadataContentHash(
  metadata: PublicationMetadataInput
): string {
  return digest({
    title: metadata.title.trim(),
    description: metadata.description.trim(),
    tags: [...metadata.tags].sort(),
    defaultAudioLanguage: metadata.defaultAudioLanguage,
    thumbnailAssetId: metadata.thumbnailAssetId,
    thumbnailHash: metadata.thumbnailHash,
    captionAssetId: metadata.captionAssetId ?? null,
    captionHash: metadata.captionHash ?? null,
  });
}

export function redactChannelConnectionForApi(
  record: PublishingChannelRecord
): PublishingChannelRecord {
  const parsed = publishingChannelRecordSchema.parse(record);
  for (const field of FORBIDDEN_CHANNEL_RESPONSE_FIELDS) {
    if ((parsed as Record<string, unknown>)[field] !== undefined)
      throw new Error(`Channel projection leaked forbidden field: ${field}`);
  }
  return parsed;
}

export function evaluateOAuthSessionTenantBinding(input: {
  readonly sessionWorkspaceId: string;
  readonly callbackWorkspaceId: string;
  readonly sessionNonce: string;
  readonly callbackNonce: string;
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.sessionWorkspaceId !== input.callbackWorkspaceId)
    return {
      allowed: false,
      code: "oauth_workspace_mismatch",
      message: "OAuth callback workspace does not match the initiating tenant.",
    };
  if (input.sessionNonce !== input.callbackNonce)
    return {
      allowed: false,
      code: "oauth_nonce_mismatch",
      message: "OAuth callback nonce does not match the initiating session.",
    };
  return { allowed: true };
}

export function evaluateScheduleAdmission(input: {
  readonly scheduledAt: string | null | undefined;
  readonly scheduleTimezone?: string | undefined;
  readonly now: string;
  readonly schedulePolicy: PublicationPreflightInput["schedulePolicy"];
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.scheduledAt === null || input.scheduledAt === undefined)
    return { allowed: true };
  if (!input.schedulePolicy)
    return {
      allowed: false,
      code: "schedule_policy_missing",
      message:
        "Workspace schedule policy is not configured; scheduled publication fails closed.",
    };
  const scheduledMs = Date.parse(input.scheduledAt);
  if (!Number.isFinite(scheduledMs))
    return {
      allowed: false,
      code: "schedule_invalid",
      message: "Scheduled publication time must be a valid timestamp.",
    };
  const nowMs = Date.parse(input.now);
  if (scheduledMs <= nowMs)
    return {
      allowed: false,
      code: "schedule_in_past",
      message: "Scheduled publication must be in the future.",
    };
  const horizonMs = input.schedulePolicy.maxScheduleHorizonHours * 60 * 60 * 1000;
  if (scheduledMs - nowMs > horizonMs)
    return {
      allowed: false,
      code: "schedule_horizon_exceeded",
      message: `Scheduled publication exceeds the ${input.schedulePolicy.maxScheduleHorizonHours} hour horizon.`,
    };
  if (
    input.scheduleTimezone &&
    input.scheduleTimezone !== input.schedulePolicy.defaultTimezone
  ) {
    const timezoneAllowed =
      input.scheduleTimezone === input.schedulePolicy.defaultTimezone;
    if (!timezoneAllowed)
      return {
        allowed: false,
        code: "schedule_timezone_not_allowed",
        message: "Requested schedule timezone is not permitted for this workspace.",
      };
  }
  return { allowed: true };
}

export function evaluateCaptionPolicy(input: {
  readonly captionsRequired: boolean;
  readonly metadata: PublicationMetadataInput;
}): {
  readonly allowed: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly field?: string;
} {
  if (!input.captionsRequired) return { allowed: true };
  if (!input.metadata.captionAssetId || !input.metadata.captionHash)
    return {
      allowed: false,
      code: "caption_required",
      message: "Caption asset and hash are required for this channel policy.",
      field: "metadata.captionAssetId",
    };
  return { allowed: true };
}

export function evaluateMetadataAdmission(input: {
  readonly metadata: PublicationMetadataInput;
  readonly assetHash: string;
  readonly artifactBindings: PublicationPreflightInput["artifactBindings"];
}): {
  readonly allowed: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly field?: string;
} {
  const thumbnailBinding = input.artifactBindings.find(
    (binding) => binding.role === "thumbnail"
  );
  if (!thumbnailBinding)
    return {
      allowed: false,
      code: "thumbnail_binding_missing",
      message: "Publication requires a thumbnail artifact binding.",
      field: "artifactBindings",
    };
  if (thumbnailBinding.assetId !== input.metadata.thumbnailAssetId)
    return {
      allowed: false,
      code: "thumbnail_asset_mismatch",
      message: "Metadata thumbnail asset must match the thumbnail binding.",
      field: "metadata.thumbnailAssetId",
    };
  if (thumbnailBinding.contentHash !== input.metadata.thumbnailHash)
    return {
      allowed: false,
      code: "thumbnail_hash_mismatch",
      message: "Metadata thumbnail hash must match the thumbnail binding.",
      field: "metadata.thumbnailHash",
    };
  const videoBinding = input.artifactBindings.find(
    (binding) => binding.role === "video"
  );
  if (!videoBinding)
    return {
      allowed: false,
      code: "video_binding_missing",
      message: "Publication requires a video artifact binding.",
      field: "artifactBindings",
    };
  if (videoBinding.contentHash !== input.assetHash)
    return {
      allowed: false,
      code: "asset_hash_mismatch",
      message: "Primary asset hash must match the video binding.",
      field: "assetHash",
    };
  return { allowed: true };
}

export function evaluatePublishReadyGate(input: {
  readonly publishReady: boolean;
  readonly renderStatus: PublicationPreflightInput["renderStatus"];
  readonly validationStatuses: readonly PublicationPreflightInput["validationStatuses"][number][];
  readonly requiredReviewGates: readonly string[];
  readonly activeApprovals: PublicationPreflightInput["activeApprovals"];
  readonly channelConnectionStatus: PublishingChannelConnectionStatus;
}): Array<{ code: string; message: string }> {
  const rejections: Array<{ code: string; message: string }> = [];
  if (!input.publishReady)
    rejections.push({
      code: "publish_not_ready",
      message: "Episode production state is not publish-ready.",
    });
  if (input.renderStatus !== "succeeded")
    rejections.push({
      code: "render_not_succeeded",
      message: "Required render evidence is not successful.",
    });
  if (input.validationStatuses.includes("failed"))
    rejections.push({
      code: "validation_failed",
      message: "Blocking validation evidence failed.",
    });
  if (input.validationStatuses.length === 0)
    rejections.push({
      code: "validation_missing",
      message: "Validation evidence is required before publication.",
    });
  for (const gate of input.requiredReviewGates) {
    const approval = input.activeApprovals.find(
      (item) => item.gate === gate && item.state === "active"
    );
    if (!approval)
      rejections.push({
        code: "approval_missing",
        message: `Required review gate ${gate} is not approved.`,
      });
  }
  if (
    input.channelConnectionStatus !== "connected" &&
    input.channelConnectionStatus !== "degraded"
  )
    rejections.push({
      code: "channel_not_connected",
      message: "Publishing channel is not connected.",
    });
  return rejections;
}

export function evaluatePublicationIntentPreflight(
  input: PublicationPreflightInput
): ReturnType<typeof publicationPreflightResultSchema.parse> {
  const rejections: Array<{
    code: string;
    message: string;
    field?: string;
  }> = [];

  for (const check of evaluatePublishReadyGate({
    publishReady: input.publishReady,
    renderStatus: input.renderStatus,
    validationStatuses: input.validationStatuses,
    requiredReviewGates: input.requiredReviewGates,
    activeApprovals: input.activeApprovals,
    channelConnectionStatus: input.channelConnectionStatus,
  })) {
    rejections.push(check);
  }

  const schedule = evaluateScheduleAdmission({
    scheduledAt: input.scheduledAt,
    scheduleTimezone: input.scheduleTimezone,
    now: new Date().toISOString(),
    schedulePolicy: input.schedulePolicy,
  });
  if (!schedule.allowed)
    rejections.push({
      code: schedule.code ?? "schedule_rejected",
      message: schedule.message ?? "Schedule rejected.",
      field: "scheduledAt",
    });

  const captions = evaluateCaptionPolicy({
    captionsRequired: input.captionsRequired,
    metadata: input.metadata,
  });
  if (!captions.allowed)
    rejections.push({
      code: captions.code ?? "caption_rejected",
      message: captions.message ?? "Caption policy rejected.",
      ...(captions.field !== undefined ? { field: captions.field } : {}),
    });

  const metadata = evaluateMetadataAdmission({
    metadata: input.metadata,
    assetHash: input.assetHash,
    artifactBindings: input.artifactBindings,
  });
  if (!metadata.allowed)
    rejections.push({
      code: metadata.code ?? "metadata_rejected",
      message: metadata.message ?? "Metadata rejected.",
      ...(metadata.field !== undefined ? { field: metadata.field } : {}),
    });

  const approval = input.activeApprovals.find(
    (item) =>
      item.approvalId === input.approvalId &&
      item.state === "active" &&
      item.boundFingerprint === input.approvalArtifactHash
  );
  if (!approval)
    rejections.push({
      code: "approval_stale",
      message: "Approval revision or artifact hash is stale.",
      field: "approvalArtifactHash",
    });

  if (
    input.boundEpisodeRevision !== undefined &&
    input.currentEpisodeRevision !== undefined &&
    input.boundEpisodeRevision !== input.currentEpisodeRevision
  )
    rejections.push({
      code: "episode_revision_stale",
      message: "Episode revision changed since preparation started.",
      field: "episodeId",
    });

  const metadataContentHash = computePublicationMetadataContentHash(
    input.metadata
  );

  return publicationPreflightResultSchema.parse({
    admitted: rejections.length === 0,
    rejections,
    ...(rejections.length === 0 ? { metadataContentHash } : {}),
  });
}

export function projectPublishingChannelRecord(input: {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly displayName: string;
  readonly providerChannelId?: string | undefined;
  readonly connectionStatus: PublishingChannelConnectionStatus;
  readonly credentialVersion?: string | undefined;
  readonly defaultVisibility?: PublishingChannelRecord["defaultVisibility"];
  readonly defaultLocale?: PublishingChannelRecord["defaultLocale"];
  readonly supportedLocales?: readonly PublishingChannelRecord["supportedLocales"][number][];
  readonly revision: number;
  readonly authorizationExpiresAt?: string | undefined;
  readonly updatedAt: string;
}): PublishingChannelRecord {
  return publishingChannelRecordSchema.parse({
    schemaVersion: PUBLICATION_PREPARATION_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    displayName: input.displayName,
    ...(input.providerChannelId !== undefined
      ? { providerChannelId: input.providerChannelId }
      : {}),
    connectionStatus: input.connectionStatus,
    ...(input.credentialVersion !== undefined
      ? { credentialVersion: input.credentialVersion }
      : {}),
    ...(input.defaultVisibility !== undefined
      ? { defaultVisibility: input.defaultVisibility }
      : {}),
    ...(input.defaultLocale !== undefined
      ? { defaultLocale: input.defaultLocale }
      : {}),
    supportedLocales: input.supportedLocales ?? [],
    revision: input.revision,
    ...(input.authorizationExpiresAt !== undefined
      ? { authorizationExpiresAt: input.authorizationExpiresAt }
      : {}),
    updatedAt: input.updatedAt,
  });
}

export function projectPublicationMetadataRevision(input: {
  readonly metadataRevisionId: string;
  readonly revision: number;
  readonly metadata: PublicationMetadataInput;
  readonly createdAt: string;
}): ReturnType<typeof publicationMetadataRevisionSchema.parse> {
  return publicationMetadataRevisionSchema.parse({
    schemaVersion: PUBLICATION_PREPARATION_SCHEMA_VERSION,
    metadataRevisionId: input.metadataRevisionId,
    revision: input.revision,
    contentHash: computePublicationMetadataContentHash(input.metadata),
    metadata: input.metadata,
    createdAt: input.createdAt,
  });
}
