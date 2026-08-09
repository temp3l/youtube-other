import crypto from "node:crypto";

import {
  LOCALIZATION_DERIVATIVE_SCHEMA_VERSION,
  localizationComparisonSchema,
  localizationDerivativeRecordSchema,
  localizationPreflightResultSchema,
  type LocalizationDerivativeStatus,
} from "./localization-derivative-contracts.js";
import type { ContentLocale, ContentVariant } from "./workflow-contracts.js";

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeSourceContentFingerprint(input: {
  readonly episodeId: string;
  readonly revision: number;
  readonly content: unknown;
}): string {
  return digest({
    episodeId: input.episodeId,
    revision: input.revision,
    content: input.content,
  });
}

export function evaluateLocalizationPreflight(input: {
  readonly supportedLocales: readonly ContentLocale[];
  readonly supportedVariants: readonly ContentVariant[];
  readonly targetLocale: ContentLocale;
  readonly contentVariant: ContentVariant;
  readonly sourceLocale?: ContentLocale;
}): ReturnType<typeof localizationPreflightResultSchema.parse> {
  const rejections: Array<{
    code: string;
    message: string;
    field?: string;
  }> = [];
  if (!input.supportedLocales.includes(input.targetLocale)) {
    rejections.push({
      code: "locale_not_supported",
      message: `Locale ${input.targetLocale} is not supported for this profile.`,
      field: "targetLocale",
    });
  }
  if (!input.supportedVariants.includes(input.contentVariant)) {
    rejections.push({
      code: "variant_not_supported",
      message: `Variant ${input.contentVariant} is not supported for this profile.`,
      field: "contentVariant",
    });
  }
  if (
    input.sourceLocale &&
    input.sourceLocale === input.targetLocale
  ) {
    rejections.push({
      code: "source_target_locale_match",
      message: "Target locale must differ from the source locale.",
      field: "targetLocale",
    });
  }
  return localizationPreflightResultSchema.parse({
    admitted: rejections.length === 0,
    rejections,
  });
}

export function evaluateSourceLinkageStale(input: {
  readonly boundSourceRevision: number;
  readonly currentSourceRevision: number;
  readonly boundFingerprint: string;
  readonly currentFingerprint: string;
}): boolean {
  return (
    input.boundSourceRevision !== input.currentSourceRevision ||
    input.boundFingerprint !== input.currentFingerprint
  );
}

export function classifyReusedAssetLanguageDependency(input: {
  readonly mimeType: string;
  readonly role?: string;
}): boolean {
  const role = input.role?.toLowerCase() ?? "";
  if (role.includes("caption") || role.includes("narration") || role.includes("script"))
    return false;
  if (input.mimeType.startsWith("image/") || input.mimeType.startsWith("video/"))
    return true;
  return false;
}

export function projectLocalizationDerivativeRecord(input: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly derivativeId: string;
  readonly rootEpisodeId: string;
  readonly derivativeEpisodeId: string;
  readonly targetLocale: ContentLocale;
  readonly contentVariant: ContentVariant;
  readonly sourceEpisodeRevision: number;
  readonly sourceContentFingerprint: string;
  readonly derivativeRevision: number;
  readonly status: LocalizationDerivativeStatus;
  readonly localizedSlug: string;
  readonly localizedTitle?: string;
  readonly reusedAssets?: ReadonlyArray<{
    readonly assetId: string;
    readonly sha256: string;
    readonly languageIndependent: boolean;
    readonly role?: string;
  }>;
  readonly partialState?: {
    readonly stage: string;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}): ReturnType<typeof localizationDerivativeRecordSchema.parse> {
  return localizationDerivativeRecordSchema.parse({
    schemaVersion: LOCALIZATION_DERIVATIVE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    derivativeId: input.derivativeId,
    rootEpisodeId: input.rootEpisodeId,
    derivativeEpisodeId: input.derivativeEpisodeId,
    targetLocale: input.targetLocale,
    contentVariant: input.contentVariant,
    sourceEpisodeRevision: input.sourceEpisodeRevision,
    sourceContentFingerprint: input.sourceContentFingerprint,
    derivativeRevision: input.derivativeRevision,
    status: input.status,
    localizedSlug: input.localizedSlug,
    ...(input.localizedTitle ? { localizedTitle: input.localizedTitle } : {}),
    reusedAssets: input.reusedAssets ?? [],
    ...(input.partialState ? { partialState: input.partialState } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function buildLocalizationComparison(input: {
  readonly derivativeId: string;
  readonly rootEpisodeId: string;
  readonly derivativeEpisodeId: string;
  readonly sourceEpisodeRevision: number;
  readonly currentSourceRevision: number;
  readonly sourceContentFingerprint: string;
  readonly currentSourceFingerprint: string;
  readonly targetLocale: ContentLocale;
  readonly contentVariant: ContentVariant;
  readonly reusedAssets: ReadonlyArray<{
    readonly assetId: string;
    readonly sha256: string;
    readonly languageIndependent: boolean;
    readonly role?: string;
  }>;
  readonly derivativeStatus: LocalizationDerivativeStatus;
  readonly derivativeRevision: number;
}): ReturnType<typeof localizationComparisonSchema.parse> {
  return localizationComparisonSchema.parse({
    schemaVersion: LOCALIZATION_DERIVATIVE_SCHEMA_VERSION,
    derivativeId: input.derivativeId,
    rootEpisodeId: input.rootEpisodeId,
    derivativeEpisodeId: input.derivativeEpisodeId,
    sourceEpisodeRevision: input.sourceEpisodeRevision,
    currentSourceRevision: input.currentSourceRevision,
    sourceStale: evaluateSourceLinkageStale({
      boundSourceRevision: input.sourceEpisodeRevision,
      currentSourceRevision: input.currentSourceRevision,
      boundFingerprint: input.sourceContentFingerprint,
      currentFingerprint: input.currentSourceFingerprint,
    }),
    targetLocale: input.targetLocale,
    contentVariant: input.contentVariant,
    reusedAssets: input.reusedAssets,
    derivativeStatus: input.derivativeStatus,
    derivativeRevision: input.derivativeRevision,
  });
}

export function evaluateLocalizationRetryAdmission(input: {
  readonly status: LocalizationDerivativeStatus;
  readonly partialState?: { readonly retryable: boolean };
}): { readonly allowed: boolean; readonly code?: string; readonly message?: string } {
  if (input.status === "failed" || input.status === "blocked")
    return { allowed: true };
  if (input.partialState?.retryable)
    return { allowed: true };
  return {
    allowed: false,
    code: "retry_not_allowed",
    message: "Only failed or blocked derivatives with retryable partial state can be retried.",
  };
}
