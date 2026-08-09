import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const CONTENT_REUSE_SCHEMA_VERSION =
  "mediaforge.content-reuse.v1" as const;
export const PRODUCTION_TEMPLATE_SCHEMA_VERSION =
  "mediaforge.production-template.v1" as const;
export const PRODUCTION_TEMPLATE_BINDING_SCHEMA_VERSION =
  "mediaforge.production-template-binding.v1" as const;
export const EPISODE_ASSET_REFERENCE_SCHEMA_VERSION =
  "mediaforge.episode-asset-reference.v1" as const;

export const PROJECT_PROFILES = [
  "dark_truth",
  "mathematics_education",
  "dynamic_generic",
  "history",
  "strategic_reinvention",
] as const;
export const projectProfileSchema = z.enum(PROJECT_PROFILES);

export const ASSET_LIFECYCLE_STATES = [
  "active",
  "archived",
  "shared",
  "revoked",
  "prohibited",
] as const;
export const assetLifecycleStateSchema = z.enum(ASSET_LIFECYCLE_STATES);

export const ASSET_SHARING_SCOPES = ["project", "workspace"] as const;
export const assetSharingScopeSchema = z.enum(ASSET_SHARING_SCOPES);

export const CLONE_COPY_POLICIES = [
  "content_and_permitted_assets",
  "content_only",
] as const;
export const cloneCopyPolicySchema = z.enum(CLONE_COPY_POLICIES);
export type CloneCopyPolicy = z.infer<typeof cloneCopyPolicySchema>;

export const ASSET_REFERENCE_MODES = ["reference", "copy_on_write"] as const;
export const assetReferenceModeSchema = z.enum(ASSET_REFERENCE_MODES);

export const productionTemplateSnapshotSchema = z
  .object({
    profile: projectProfileSchema,
    configDefaults: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ProductionTemplateSnapshot = z.infer<
  typeof productionTemplateSnapshotSchema
>;

export const productionTemplateRecordSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_TEMPLATE_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    templateId: identifierSchema,
    name: nonEmptyStringSchema.max(160),
    profile: projectProfileSchema,
    revision: z.number().int().nonnegative(),
    snapshot: productionTemplateSnapshotSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type ProductionTemplateRecord = z.infer<
  typeof productionTemplateRecordSchema
>;

export const productionTemplatePageSchema = z
  .object({
    items: z.array(productionTemplateRecordSchema),
  })
  .strict();

export const productionTemplateCreateInputSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    profile: projectProfileSchema,
    snapshot: productionTemplateSnapshotSchema,
  })
  .strict();
export type ProductionTemplateCreateInput = z.infer<
  typeof productionTemplateCreateInputSchema
>;

export const productionTemplateUpdateInputSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    snapshot: productionTemplateSnapshotSchema,
  })
  .strict();
export type ProductionTemplateUpdateInput = z.infer<
  typeof productionTemplateUpdateInputSchema
>;

export const productionTemplateBindingSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_TEMPLATE_BINDING_SCHEMA_VERSION),
    templateId: identifierSchema,
    pinnedRevision: z.number().int().nonnegative(),
    appliedSnapshot: productionTemplateSnapshotSchema,
    appliedAt: isoDateTimeSchema,
  })
  .strict();
export type ProductionTemplateBinding = z.infer<
  typeof productionTemplateBindingSchema
>;

export const productionTemplateApplyInputSchema = z
  .object({
    templateId: identifierSchema,
    pinnedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ProductionTemplateApplyInput = z.infer<
  typeof productionTemplateApplyInputSchema
>;

export const productionTemplateApplyResultSchema = z
  .object({
    binding: productionTemplateBindingSchema,
    resolvedSnapshot: productionTemplateSnapshotSchema,
  })
  .strict();
export type ProductionTemplateApplyResult = z.infer<
  typeof productionTemplateApplyResultSchema
>;

export const episodeCloneInputSchema = z
  .object({
    sourceRevision: z.number().int().nonnegative().optional(),
    targetProjectId: identifierSchema.optional(),
    copyPolicy: cloneCopyPolicySchema.default("content_and_permitted_assets"),
  })
  .strict();
export type EpisodeCloneInput = z.infer<typeof episodeCloneInputSchema>;

export const omittedCloneAssetSchema = z
  .object({
    assetId: identifierSchema,
    reason: nonEmptyStringSchema.max(160),
  })
  .strict();
export type OmittedCloneAsset = z.infer<typeof omittedCloneAssetSchema>;

export const episodeCloneResultSchema = z
  .object({
    id: identifierSchema,
    revision: z.number().int().nonnegative(),
    omittedAssets: z.array(omittedCloneAssetSchema),
    resetRuntimeIdentity: z.literal(true),
  })
  .strict();
export type EpisodeCloneResult = z.infer<typeof episodeCloneResultSchema>;

export const assetDescriptorSchema = z
  .object({
    assetId: identifierSchema,
    mimeType: nonEmptyStringSchema.max(160),
    bytes: z.number().int().nonnegative(),
    sha256: sha256Schema,
    lifecycle: assetLifecycleStateSchema,
    provenance: z.string().max(8_192),
    ownerProjectId: identifierSchema.optional(),
    sharingScope: assetSharingScopeSchema.optional(),
  })
  .strict();
export type AssetDescriptor = z.infer<typeof assetDescriptorSchema>;

export const assetReuseEligibilitySchema = z
  .object({
    eligible: z.boolean(),
    reason: nonEmptyStringSchema.max(160).optional(),
    mode: assetReferenceModeSchema.optional(),
  })
  .strict();
export type AssetReuseEligibility = z.infer<typeof assetReuseEligibilitySchema>;

export const reusableAssetRecordSchema = z
  .object({
    id: identifierSchema,
    mimeType: nonEmptyStringSchema.max(160),
    bytes: z.number().int().nonnegative(),
    sha256: sha256Schema,
    lifecycle: assetLifecycleStateSchema,
    provenance: z.string().max(8_192),
    eligibility: assetReuseEligibilitySchema,
  })
  .strict();
export type ReusableAssetRecord = z.infer<typeof reusableAssetRecordSchema>;

export const reusableAssetPageSchema = z
  .object({
    items: z.array(reusableAssetRecordSchema),
    nextAfter: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const episodeAssetReferenceRecordSchema = z
  .object({
    schemaVersion: z.literal(EPISODE_ASSET_REFERENCE_SCHEMA_VERSION),
    assetId: identifierSchema,
    sha256: sha256Schema,
    provenance: z.string().max(8_192),
    mode: assetReferenceModeSchema,
    attachmentKey: identifierSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type EpisodeAssetReferenceRecord = z.infer<
  typeof episodeAssetReferenceRecordSchema
>;

export const episodeAssetReferenceAttachInputSchema = z
  .object({
    assetId: identifierSchema,
    mode: assetReferenceModeSchema.optional(),
    attachmentKey: identifierSchema.optional(),
  })
  .strict();
export type EpisodeAssetReferenceAttachInput = z.infer<
  typeof episodeAssetReferenceAttachInputSchema
>;

export const episodeAssetReferenceAttachResultSchema = z
  .object({
    reference: episodeAssetReferenceRecordSchema,
    replayed: z.boolean(),
  })
  .strict();
export type EpisodeAssetReferenceAttachResult = z.infer<
  typeof episodeAssetReferenceAttachResultSchema
>;

export const CONTENT_REUSE_AUDIT_REDACTED_KEYS = [
  "provenance",
  "sha256",
  "secret",
  "token",
] as const;

export function redactContentReuseAuditPayload(
  value: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      CONTENT_REUSE_AUDIT_REDACTED_KEYS.some((candidate) =>
        key.toLowerCase().includes(candidate)
      )
    )
      continue;
    redacted[key] = entry;
  }
  return redacted;
}
