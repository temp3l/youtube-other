import { z } from "zod";

import { microdramaAssetTypeSchema } from "./microdrama-budget-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const backlogTaskIdPattern = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const backlogTaskIdSchema = z.string().min(1).max(160).regex(backlogTaskIdPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_ASSET_GENERATION_APPROVAL_SCHEMA_VERSION =
  "mediaforge.microdrama-asset-generation-approval.v1" as const;

export const MICRODRAMA_ASSET_GENERATION_APPROVAL_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const microdramaAssetGenerationApprovalStateSchema = z.enum(
  MICRODRAMA_ASSET_GENERATION_APPROVAL_STATES
);
export type MicrodramaAssetGenerationApprovalState = z.infer<
  typeof microdramaAssetGenerationApprovalStateSchema
>;

export const microdramaAssetGenerationScopeSchema = z
  .object({
    episodeIds: z.array(identifierSchema).min(1),
    locale: nonEmptyStringSchema,
    scriptRevisionIds: z.array(identifierSchema).min(1),
    assetKinds: z.array(microdramaAssetTypeSchema).min(1),
    providers: z.array(identifierSchema).min(1),
    voiceRevision: identifierSchema,
    costLimitMinor: z.number().int().positive(),
  })
  .strict();
export type MicrodramaAssetGenerationScope = z.infer<
  typeof microdramaAssetGenerationScopeSchema
>;

export const microdramaAssetGenerationApprovalSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_ASSET_GENERATION_APPROVAL_SCHEMA_VERSION),
    approvalId: identifierSchema,
    taskId: backlogTaskIdSchema,
    state: microdramaAssetGenerationApprovalStateSchema,
    scope: microdramaAssetGenerationScopeSchema,
    approvedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    operatorId: identifierSchema,
  })
  .strict();
export type MicrodramaAssetGenerationApproval = z.infer<
  typeof microdramaAssetGenerationApprovalSchema
>;
