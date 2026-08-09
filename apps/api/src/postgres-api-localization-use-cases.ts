import crypto from "node:crypto";

import {
  ApplicationError,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  assertContentReadAccess,
  assertContentWriteAccess,
  buildLocalizationComparison,
  classifyReusedAssetLanguageDependency,
  computeSourceContentFingerprint,
  evaluateLocalizationPreflight,
  evaluateLocalizationRetryAdmission,
  localizationDerivativeCreateInputSchema,
  localizationPreflightInputSchema,
  localizationDerivativePartialStateSchema,
  localizationDerivativeReuseLinkSchema,
  localizationDerivativeStatusSchema,
  PLATFORM_PROFILE_CAPABILITY_DEFAULTS,
  projectLocalizationDerivativeRecord,
  type ContentLocale,
  type ContentProfileId,
} from "@mediaforge/domain";
import {
  PostgresLocalizationDerivativeRepository,
  PostgresWorkflowRepository,
  mapLocalizationDerivativeRow,
  type PostgresPool,
} from "@mediaforge/persistence";

import type { ApiRequestContext } from "./http-server.js";

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

function profileKey(profile: string): ContentProfileId | null {
  const normalized = profile.replace(/_/gu, "-");
  if (normalized in PLATFORM_PROFILE_CAPABILITY_DEFAULTS)
    return normalized as ContentProfileId;
  return null;
}

function parseReusedAssets(value: unknown): Array<{
  assetId: string;
  sha256: string;
  languageIndependent: boolean;
  role?: string | undefined;
}> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => localizationDerivativeReuseLinkSchema.parse(entry));
}

function normalizeReusedAssets(
  value: unknown
): Array<{
  assetId: string;
  sha256: string;
  languageIndependent: boolean;
  role?: string;
}> {
  return parseReusedAssets(value).map((asset) => ({
    assetId: asset.assetId,
    sha256: asset.sha256,
    languageIndependent: asset.languageIndependent,
    ...(asset.role !== undefined ? { role: asset.role } : {}),
  }));
}

function toRecord(mapped: ReturnType<typeof mapLocalizationDerivativeRow>) {
  return projectLocalizationDerivativeRecord({
    workspaceId: mapped.workspaceId,
    projectId: mapped.projectId,
    derivativeId: mapped.derivativeId,
    rootEpisodeId: mapped.rootEpisodeId,
    derivativeEpisodeId: mapped.derivativeEpisodeId,
    targetLocale: mapped.targetLocale as ContentLocale,
    contentVariant: mapped.contentVariant,
    sourceEpisodeRevision: mapped.sourceEpisodeRevision,
    sourceContentFingerprint: mapped.sourceContentFingerprint,
    derivativeRevision: mapped.derivativeRevision,
    status: localizationDerivativeStatusSchema.parse(mapped.status),
    localizedSlug: mapped.localizedSlug,
    ...(mapped.localizedTitle ? { localizedTitle: mapped.localizedTitle } : {}),
    reusedAssets: normalizeReusedAssets(mapped.reusedAssetIds),
    ...(mapped.partialState
      ? {
          partialState: localizationDerivativePartialStateSchema.parse(
            mapped.partialState
          ),
        }
      : {}),
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  });
}

export function createApiLocalizationUseCases(input: {
  readonly pool: PostgresPool;
  readonly now?: () => Date;
  readonly createId?: (prefix: string) => string;
}) {
  const localization = new PostgresLocalizationDerivativeRepository(input.pool);
  const workflow = new PostgresWorkflowRepository(input.pool);
  const now = input.now ?? (() => new Date());
  const createId =
    input.createId ??
    ((prefix: string) =>
      `${prefix}-${crypto.randomUUID().replace(/-/gu, "")}`);

  async function ensureSchema(): Promise<void> {
    await localization.ensureSchema();
  }

  async function loadProfileDefaults(workspaceId: string, projectId: string) {
    const project = await workflow.withWorkspaceTransaction(
      workspaceId,
      (transaction) => transaction.getProject(workspaceId, projectId)
    );
    if (!project)
      throw new ApplicationError("not_found", "Project not found.", false);
    const key = profileKey(project.profile);
    if (!key)
      throw new ApplicationError(
        "profile_input_invalid",
        "Project profile is not recognized for localization.",
        false
      );
    return PLATFORM_PROFILE_CAPABILITY_DEFAULTS[key];
  }

  return {
    listLocalizationDerivatives: async (
      rootEpisodeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertRead(context.principal);
      await ensureSchema();
      const rows = await localization.listByRootEpisode({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        rootEpisodeId,
      });
      return { items: rows.map((row) => toRecord(mapLocalizationDerivativeRow(row))) };
    },

    evaluateLocalizationPreflight: async (
      rootEpisodeId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertRead(context.principal);
      const parsed = localizationPreflightInputSchema.parse(body);
      const defaults = await loadProfileDefaults(
        context.workspaceId,
        context.projectId
      );
      const source = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            rootEpisodeId
          )
      );
      if (!source)
        throw new ApplicationError("not_found", "Root episode not found.", false);
      return evaluateLocalizationPreflight({
        supportedLocales: defaults.supportedLocales,
        supportedVariants: defaults.supportedVariants,
        targetLocale: parsed.targetLocale,
        contentVariant: parsed.contentVariant,
        ...(parsed.sourceLocale ? { sourceLocale: parsed.sourceLocale } : {}),
      });
    },

    createLocalizationDerivative: async (
      rootEpisodeId: string,
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "projectId" | "principal" | "requestId" | "idempotencyKey"
        >
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const parsed = localizationDerivativeCreateInputSchema.parse(body);
      const defaults = await loadProfileDefaults(
        context.workspaceId,
        context.projectId
      );
      const preflight = evaluateLocalizationPreflight({
        supportedLocales: defaults.supportedLocales,
        supportedVariants: defaults.supportedVariants,
        targetLocale: parsed.targetLocale,
        contentVariant: parsed.contentVariant,
      });
      if (!preflight.admitted)
        throw new ApplicationError(
          "precondition_failed",
          preflight.rejections[0]?.message ?? "Localization preflight failed.",
          false
        );

      const evaluatedAt = now().toISOString();
      const derivativeId = createId("localization-derivative");
      const derivativeEpisodeId = createId("episode");

      const source = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            rootEpisodeId
          )
      );
      if (!source)
        throw new ApplicationError("not_found", "Root episode not found.", false);

      const fingerprint = computeSourceContentFingerprint({
        episodeId: source.episodeId,
        revision: source.revision,
        content: source.content,
      });

      const assets = parsed.reuseVisualAssets
        ? await workflow.withWorkspaceTransaction(
            context.workspaceId,
            (transaction) =>
              transaction.listAssetDescriptors({
                workspaceId: context.workspaceId,
                projectId: context.projectId,
                size: 200,
              })
          )
        : [];

      const reusedAssets = assets
        .filter(
          (asset) =>
            asset.mimeType.startsWith("image/") ||
            asset.mimeType.startsWith("video/")
        )
        .map((asset) => ({
          assetId: asset.assetId,
          sha256: asset.sha256,
          languageIndependent: classifyReusedAssetLanguageDependency({
            mimeType: asset.mimeType,
            role: asset.provenance,
          }),
          role: asset.provenance,
        }));

      const derivativeContent = {
        ...(source.content as object),
        localizationDerivative: {
          rootEpisodeId,
          targetLocale: parsed.targetLocale,
          contentVariant: parsed.contentVariant,
          localizedSlug: parsed.localizedSlug,
        },
      };

      await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.createEpisode({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            episodeId: derivativeEpisodeId,
            content: derivativeContent,
            now: evaluatedAt,
          })
      );

      const row = await localization.insertDerivative({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        derivativeId,
        rootEpisodeId,
        derivativeEpisodeId,
        targetLocale: parsed.targetLocale,
        contentVariant: parsed.contentVariant,
        sourceEpisodeRevision: source.revision,
        sourceContentFingerprint: fingerprint,
        localizedSlug: parsed.localizedSlug,
        ...(parsed.localizedTitle ? { localizedTitle: parsed.localizedTitle } : {}),
        reusedAssetIds: reusedAssets,
        now: evaluatedAt,
      });

      return toRecord(mapLocalizationDerivativeRow(row));
    },

    compareLocalizationDerivative: async (
      rootEpisodeId: string,
      derivativeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertRead(context.principal);
      await ensureSchema();
      const row = await localization.getById({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        rootEpisodeId,
        derivativeId,
      });
      if (!row)
        throw new ApplicationError("not_found", "Localization derivative not found.", false);
      const mapped = mapLocalizationDerivativeRow(row);
      const source = await workflow.withWorkspaceTransaction(
        context.workspaceId,
        (transaction) =>
          transaction.getEpisode(
            context.workspaceId,
            context.projectId,
            rootEpisodeId
          )
      );
      if (!source)
        throw new ApplicationError("not_found", "Root episode not found.", false);
      const currentFingerprint = computeSourceContentFingerprint({
        episodeId: source.episodeId,
        revision: source.revision,
        content: source.content,
      });
      return buildLocalizationComparison({
        derivativeId: mapped.derivativeId,
        rootEpisodeId: mapped.rootEpisodeId,
        derivativeEpisodeId: mapped.derivativeEpisodeId,
        sourceEpisodeRevision: mapped.sourceEpisodeRevision,
        currentSourceRevision: source.revision,
        sourceContentFingerprint: mapped.sourceContentFingerprint,
        currentSourceFingerprint: currentFingerprint,
        targetLocale: mapped.targetLocale as ContentLocale,
        contentVariant: mapped.contentVariant,
        reusedAssets: normalizeReusedAssets(mapped.reusedAssetIds),
        derivativeStatus: localizationDerivativeStatusSchema.parse(mapped.status),
        derivativeRevision: mapped.derivativeRevision,
      });
    },

    retryLocalizationDerivative: async (
      rootEpisodeId: string,
      derivativeId: string,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId">
      >
    ) => {
      assertWrite(context.principal);
      await ensureSchema();
      const existing = await localization.getById({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        rootEpisodeId,
        derivativeId,
      });
      if (!existing)
        throw new ApplicationError("not_found", "Localization derivative not found.", false);
      const mapped = mapLocalizationDerivativeRow(existing);
      const admission = evaluateLocalizationRetryAdmission({
        status: localizationDerivativeStatusSchema.parse(mapped.status),
        ...(mapped.partialState
          ? {
              partialState: localizationDerivativePartialStateSchema.parse(
                mapped.partialState
              ),
            }
          : {}),
      });
      if (!admission.allowed)
        throw new ApplicationError(
          "precondition_failed",
          admission.message ?? "Retry is not allowed for this derivative.",
          false
        );
      const evaluatedAt = now().toISOString();
      const row = await localization.markRetry({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        rootEpisodeId,
        derivativeId,
        expectedDerivativeRevision: mapped.derivativeRevision,
        now: evaluatedAt,
      });
      if (!row)
        throw new ApplicationError(
          "precondition_failed",
          "Derivative revision changed concurrently.",
          false
        );
      return toRecord(mapLocalizationDerivativeRow(row));
    },
  };
}
