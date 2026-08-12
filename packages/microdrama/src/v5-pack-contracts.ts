import { z } from "zod";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const v5LocaleManifestEntrySchema = z
  .object({
    episode: z.string().regex(/^\d+$/u),
    id: z.string().regex(/^E\d{3}$/u),
    arc: z.string(),
    arc_name: z.string(),
    title: z.string(),
    hook: z.string(),
    cliffhanger_beat: z.string(),
    characters: z.string(),
    location: z.string(),
    locale: z.enum(["en-US", "de-DE", "es-ES", "pt-BR"]),
    wpm: z.number().int().positive(),
    word_count: z.number().int().nonnegative(),
    estimated_seconds: z.number().nonnegative(),
    timing_gate: z.enum(["PASS", "FAIL"]),
    editorial_score: z.number(),
    editorial_gate: z.enum(["PASS", "FAIL"]),
    source_authority: z.string(),
  })
  .strict();
export type V5LocaleManifestEntry = z.infer<typeof v5LocaleManifestEntrySchema>;

export const v5LocaleManifestSchema = z.array(v5LocaleManifestEntrySchema).length(100);

export const packProvenanceSchema = z
  .object({
    sourceKind: z.literal("import"),
    sourcePackVersion: z.string(),
    sourceRelativePath: z.string(),
    sourceArtifactHash: z.string().regex(sha256Pattern),
    importedAt: isoDateTimeSchema,
  })
  .strict();

export const seriesImportSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    seriesId: z.literal("seven-minutes-ahead"),
    packVersion: z.literal("v5-remediated"),
    sourceRoot: z.string().min(1),
    manifestHash: z.string().regex(sha256Pattern),
    hashManifestPath: z.string(),
    hashManifestDigest: z.string().regex(sha256Pattern),
    locales: z.array(z.enum(["en-US", "de-DE", "es-ES", "pt-BR"])),
    episodeCount: z.literal(100),
    localeVariantCount: z.literal(400),
    fileCount: z.literal(434),
    validationStatus: z.enum(["PASS", "FAIL"]),
    provenance: packProvenanceSchema,
  })
  .strict();
export type SeriesImport = z.infer<typeof seriesImportSchema>;

export const episodeImportSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    episodeId: z.string().regex(/^E\d{3}$/u),
    episodeNumber: z.number().int().min(1).max(100),
    arcId: z.string(),
    arcName: z.string(),
    title: z.string(),
    provenance: packProvenanceSchema,
  })
  .strict();
export type EpisodeImport = z.infer<typeof episodeImportSchema>;

export const localizedScriptImportSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: z.enum(["en-US", "de-DE", "es-ES", "pt-BR"]),
    sourceLocaleAlias: z.enum(["en", "de", "es", "pt-BR"]),
    scriptRelativePath: z.string(),
    contentHash: z.string().regex(sha256Pattern),
    manifestEntry: v5LocaleManifestEntrySchema,
    provenance: packProvenanceSchema,
  })
  .strict();
export type LocalizedScriptImport = z.infer<typeof localizedScriptImportSchema>;

export const v5PackImportResultSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    seriesImport: seriesImportSchema,
    episodeImports: z.array(episodeImportSchema).length(100),
    localizedScriptImports: z.array(localizedScriptImportSchema).length(400),
    hashCoverageCount: z.literal(433),
    fileCount: z.literal(434),
  })
  .strict();
export type V5PackImportResult = z.infer<typeof v5PackImportResultSchema>;

export type V5PackValidationIssueCode =
  | "unsafe_path"
  | "path_escape"
  | "symlink"
  | "unexpected_root_entry"
  | "missing_file"
  | "unexpected_file"
  | "hash_mismatch"
  | "manifest_hash_mismatch"
  | "invalid_manifest"
  | "locale_mismatch"
  | "episode_id_conflict"
  | "authority_conflict"
  | "file_count_mismatch";

export type V5PackValidationIssue = {
  code: V5PackValidationIssueCode;
  message: string;
  path?: string;
};

export type V5PackValidationResult =
  | { ok: true; result: V5PackImportResult }
  | { ok: false; issues: V5PackValidationIssue[] };
