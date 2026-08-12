import { z } from "zod";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";
import {
  localizedScriptImportSchema,
  packProvenanceSchema,
  seriesImportSchema,
} from "./v5-pack-contracts.js";

const sha256Pattern = /^[a-f0-9]{64}$/u;

export const IMPORTED_SCRIPT_STATUSES = [
  "IMPORTED_APPROVED_LOCALIZED_SCRIPT",
] as const;
export const importedScriptStatusSchema = z.enum(IMPORTED_SCRIPT_STATUSES);
export type ImportedScriptStatus = z.infer<typeof importedScriptStatusSchema>;

export const episodeBoundaryContractSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    episodeId: z.string().regex(/^E\d{3}$/u),
    episodeNumber: z.number().int().min(1).max(100),
    arcId: z.string(),
    arcName: z.string(),
    title: z.string(),
    newInformation: nonEmptyString(),
    openLoop: nonEmptyString(),
    hook: nonEmptyString(),
    cliffhangerBeat: nonEmptyString(),
    characters: z.array(z.string().min(1)),
    location: z.string().min(1),
    nextOpeningObligation: z.string().min(1).optional(),
    provenance: packProvenanceSchema,
  })
  .strict();
export type EpisodeBoundaryContract = z.infer<typeof episodeBoundaryContractSchema>;

function nonEmptyString() {
  return z.string().trim().min(1);
}

export const admittedLocalizedScriptSchema = localizedScriptImportSchema.extend({
  importStatus: z.literal("IMPORTED_APPROVED_LOCALIZED_SCRIPT"),
  scriptRevisionId: z.string().min(1).max(160),
});
export type AdmittedLocalizedScript = z.infer<typeof admittedLocalizedScriptSchema>;

export const episodeIdentityRecordSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    locales: z.array(z.enum(["en-US", "de-DE", "es-ES", "pt-BR"])).length(4),
    scriptRevisionIds: z.array(z.string()).length(4),
    contentHashes: z.array(z.string().regex(sha256Pattern)).length(4),
  })
  .strict();
export type EpisodeIdentityRecord = z.infer<typeof episodeIdentityRecordSchema>;

export const v5CanonAdmissionBundleSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    importId: z.string().regex(sha256Pattern),
    seriesImport: seriesImportSchema,
    seriesBibleRevisionId: z.string().min(1).max(160),
    episodeBoundaries: z.array(episodeBoundaryContractSchema).length(100),
    admittedScripts: z.array(admittedLocalizedScriptSchema).length(400),
    episodeIdentities: z.array(episodeIdentityRecordSchema).length(100),
    admittedAt: z.string(),
  })
  .strict();
export type V5CanonAdmissionBundle = z.infer<typeof v5CanonAdmissionBundleSchema>;

export const v5CanonAdmissionProjectionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    importId: z.string().regex(sha256Pattern),
    seriesBibleRevisionId: z.string(),
    episodeBoundaryRevisionIds: z.array(z.string()).length(100),
    scriptRevisionIds: z.array(z.string()).length(400),
    episodeIdentities: z.array(episodeIdentityRecordSchema).length(100),
    manifestHash: z.string().regex(sha256Pattern),
    hashManifestDigest: z.string().regex(sha256Pattern),
    admittedAt: z.string(),
  })
  .strict();
export type V5CanonAdmissionProjection = z.infer<
  typeof v5CanonAdmissionProjectionSchema
>;

export type V5CanonAdmissionIssueCode =
  | "pack_invalid"
  | "episode_state_invalid"
  | "series_state_invalid"
  | "episode_identity_mismatch"
  | "boundary_manifest_mismatch"
  | "continuity_audit_missing";

export type V5CanonAdmissionIssue = {
  code: V5CanonAdmissionIssueCode;
  message: string;
  path?: string;
};

export type V5CanonAdmissionResult =
  | { ok: true; bundle: V5CanonAdmissionBundle }
  | { ok: false; issues: V5CanonAdmissionIssue[] };

export function validateV5CanonAdmissionBundle(
  bundle: unknown
): V5CanonAdmissionBundle {
  return v5CanonAdmissionBundleSchema.parse(bundle);
}

export function validateV5CanonAdmissionProjection(
  projection: unknown
): V5CanonAdmissionProjection {
  return v5CanonAdmissionProjectionSchema.parse(projection);
}
