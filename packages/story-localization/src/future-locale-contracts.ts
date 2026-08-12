import { z } from "zod";

export const FUTURE_LOCALE_SCHEMA_VERSION =
  "mediaforge.story-localization.future-locale.v1" as const;

const sha256Pattern = /^[a-f0-9]{64}$/u;

export const IMPORTED_V5_LOCALES = [
  "en-US",
  "de-DE",
  "es-ES",
  "pt-BR",
] as const;
export const importedV5LocaleSchema = z.enum(IMPORTED_V5_LOCALES);
export type ImportedV5Locale = z.infer<typeof importedV5LocaleSchema>;

export const GLOSSARY_TERM_KINDS = [
  "DO_NOT_TRANSLATE",
  "FIXED_LOCALIZATION",
  "CONTEXTUAL_LOCALIZATION",
] as const;
export const glossaryTermKindSchema = z.enum(GLOSSARY_TERM_KINDS);
export type GlossaryTermKind = z.infer<typeof glossaryTermKindSchema>;

export const futureLocaleGlossaryTermSchema = z
  .object({
    termId: z.string().min(1).max(160),
    sourceText: z.string().min(1).max(2_000),
    localizedText: z.string().min(1).max(2_000),
    kind: glossaryTermKindSchema,
  })
  .strict();
export type FutureLocaleGlossaryTerm = z.infer<typeof futureLocaleGlossaryTermSchema>;

export const futureLocaleGlossaryBindingSchema = z
  .object({
    schemaVersion: z.literal(FUTURE_LOCALE_SCHEMA_VERSION),
    glossaryId: z.string().min(1).max(160),
    revisionId: z.string().min(1).max(160),
    targetLocale: z.string().min(2).max(32),
    sourceLocale: z.literal("en-US"),
    terms: z.array(futureLocaleGlossaryTermSchema).min(1),
  })
  .strict();
export type FutureLocaleGlossaryBinding = z.infer<
  typeof futureLocaleGlossaryBindingSchema
>;

export const futureLocaleDraftRequestSchema = z
  .object({
    schemaVersion: z.literal(FUTURE_LOCALE_SCHEMA_VERSION),
    requestId: z.string().min(1).max(160),
    episodeId: z.string().regex(/^E\d{3}$/u),
    targetLocale: z.string().min(2).max(32),
    sourceScriptRevisionId: z.string().min(1).max(160),
    glossaryBinding: futureLocaleGlossaryBindingSchema,
    canonicalImportId: z.string().regex(sha256Pattern),
  })
  .strict();
export type FutureLocaleDraftRequest = z.infer<typeof futureLocaleDraftRequestSchema>;

export const futureLocaleDraftScriptSchema = z
  .object({
    schemaVersion: z.literal(FUTURE_LOCALE_SCHEMA_VERSION),
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: z.string().min(2).max(32),
    scriptRevisionId: z.string().min(1).max(160),
    sourceScriptRevisionId: z.string().min(1).max(160),
    glossaryRevisionId: z.string().min(1).max(160),
    contentHash: z.string().regex(sha256Pattern),
    hook: z.string().min(1),
    cliffhangerBeat: z.string().min(1),
    prose: z.string().min(1),
    draftGeneratedAt: z.string(),
  })
  .strict();
export type FutureLocaleDraftScript = z.infer<typeof futureLocaleDraftScriptSchema>;

export const FUTURE_LOCALE_ADMISSION_ISSUE_CODES = [
  "imported_locale_forbidden",
  "imported_revision_immutable",
  "glossary_binding_mismatch",
  "source_revision_not_found",
  "source_revision_mismatch",
  "deterministic_qa_failed",
  "semantic_parity_failed",
  "hook_cliffhanger_missing",
  "glossary_term_missing",
  "revision_collision",
] as const;
export const futureLocaleAdmissionIssueCodeSchema = z.enum(
  FUTURE_LOCALE_ADMISSION_ISSUE_CODES
);
export type FutureLocaleAdmissionIssueCode = z.infer<
  typeof futureLocaleAdmissionIssueCodeSchema
>;

export const futureLocaleAdmissionIssueSchema = z
  .object({
    code: futureLocaleAdmissionIssueCodeSchema,
    message: z.string().min(1).max(2_000),
    episodeId: z.string().regex(/^E\d{3}$/u).optional(),
    locale: z.string().optional(),
    path: z.string().optional(),
    blocking: z.boolean(),
  })
  .strict();
export type FutureLocaleAdmissionIssue = z.infer<
  typeof futureLocaleAdmissionIssueSchema
>;

export const futureLocaleAdmittedScriptSchema = z
  .object({
    schemaVersion: z.literal(FUTURE_LOCALE_SCHEMA_VERSION),
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: z.string().min(2).max(32),
    scriptRevisionId: z.string().min(1).max(160),
    sourceScriptRevisionId: z.string().min(1).max(160),
    glossaryRevisionId: z.string().min(1).max(160),
    contentHash: z.string().regex(sha256Pattern),
    hook: z.string().min(1),
    cliffhangerBeat: z.string().min(1),
    admissionStatus: z.literal("FUTURE_LOCALE_ADMITTED_SCRIPT"),
    admittedAt: z.string(),
  })
  .strict();
export type FutureLocaleAdmittedScript = z.infer<
  typeof futureLocaleAdmittedScriptSchema
>;

export const futureLocaleAdmissionResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      admittedScript: futureLocaleAdmittedScriptSchema,
      importedScriptsUnchanged: z.literal(true),
      deterministicQaPassed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      issues: z.array(futureLocaleAdmissionIssueSchema).min(1),
    })
    .strict(),
]);
export type FutureLocaleAdmissionResult = z.infer<
  typeof futureLocaleAdmissionResultSchema
>;

export function validateFutureLocaleDraftRequest(
  request: unknown
): FutureLocaleDraftRequest {
  return futureLocaleDraftRequestSchema.parse(request);
}

export function validateFutureLocaleAdmittedScript(
  script: unknown
): FutureLocaleAdmittedScript {
  return futureLocaleAdmittedScriptSchema.parse(script);
}
