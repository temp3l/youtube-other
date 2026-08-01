import { z } from "zod";

import { contentLocaleSchema } from "./workflow-contracts.js";

export const STRATEGIC_REINVENTION_IMPORT_SCHEMA_VERSION = "1.0" as const;
export const STRATEGIC_REINVENTION_SCHEMA_VERSION = "1.1" as const;

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,127}$/u);
const nonEmptyStringSchema = z.string().trim().min(1);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const importedLocaleSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u);
const uniqueStrings = <TSchema extends z.ZodType<string>>(schema: TSchema) =>
  z.array(schema).refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });

export const contentTierSchema = z.enum(["public", "lead-generation", "premium", "private"]);
export type ContentTier = z.infer<typeof contentTierSchema>;
const importedContentTierSchema = z.enum(["public", "lead-magnet", "premium", "private", "confidential"]);
const approvalGateSchema = z.enum(["source", "canonical-script", "localization", "voice", "final-render", "publish"]);
const approvalStateSchema = z.enum(["pending", "approved", "rejected", "not-required"]);
const importedApprovalSchema = z.object({
  source: approvalStateSchema,
  canonicalScript: approvalStateSchema,
  localization: approvalStateSchema,
  voice: approvalStateSchema,
  render: approvalStateSchema,
  publish: approvalStateSchema,
}).strict();

export const genreDefinitionSchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), id: identifierSchema, displayName: nonEmptyStringSchema, description: nonEmptyStringSchema, version: nonEmptyStringSchema, canonicalLocale: contentLocaleSchema, episodeModes: uniqueStrings(identifierSchema).min(1), requiredApprovalGates: uniqueStrings(approvalGateSchema).min(1), autoPublish: z.literal(false) }).strict();
export type GenreDefinition = z.infer<typeof genreDefinitionSchema>;
export const creatorProfileSchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), id: identifierSchema, displayName: nonEmptyStringSchema, genreId: identifierSchema, status: z.enum(["discovery", "active", "suspended"]), canonicalLocale: contentLocaleSchema, supportedLocales: uniqueStrings(contentLocaleSchema).min(1), autoPublish: z.literal(false), syntheticNarrationEnabled: z.literal(false), generatedLikenessEnabled: z.literal(false) }).strict().superRefine((value, ctx) => {
  if (!value.supportedLocales.includes(value.canonicalLocale)) ctx.addIssue({ code: "custom", path: ["supportedLocales"], message: "Supported locales must include the canonical locale." });
});
export type CreatorProfile = z.infer<typeof creatorProfileSchema>;
export const effectiveContentPolicySchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), genreId: identifierSchema, creatorProfileId: identifierSchema, canonicalLocale: contentLocaleSchema, supportedLocales: uniqueStrings(contentLocaleSchema).min(1), permittedContentTiers: uniqueStrings(contentTierSchema).min(1), requiredApprovalGates: uniqueStrings(approvalGateSchema).min(1), autoPublish: z.literal(false), syntheticNarrationEnabled: z.literal(false), generatedLikenessEnabled: z.literal(false) }).strict();
export type EffectiveContentPolicy = z.infer<typeof effectiveContentPolicySchema>;

const allowedUseSchema = z.enum(["internal-research", "short-quote", "summarize", "adapt", "translate", "voice", "visualize", "publish", "monetize"]);
const sourceTypeSchema = z.enum(["creator-recording", "creator-written-note", "approved-transcript", "public-essay", "newsletter", "book", "book-excerpt", "course-material", "interview", "audience-question", "research", "third-party-material"]);
const sensitivityTagSchema = z.enum(["health", "relationship", "violence", "legal", "financial-personal", "politics", "identity", "sexuality", "client-confidentiality", "current-crisis", "minor", "none"]);
const sourceRightsSchema = z.object({ status: z.enum(["unknown", "creator-owned", "publisher-owned", "licensed", "permission-required", "blocked"]), rightsHolders: uniqueStrings(nonEmptyStringSchema).optional(), licenseReference: nonEmptyStringSchema.optional(), allowedUses: uniqueStrings(allowedUseSchema), permittedLocales: uniqueStrings(contentLocaleSchema).min(1), commercialUse: z.boolean(), expiresAt: isoDateTimeSchema.optional(), attribution: nonEmptyStringSchema.optional(), notes: z.string().optional() }).strict().superRefine((value, ctx) => {
  if (["unknown", "permission-required", "blocked"].includes(value.status) && value.allowedUses.some((use) => use === "publish" || use === "monetize")) ctx.addIssue({ code: "custom", path: ["allowedUses"], message: "Unclear or blocked rights cannot permit publishing or monetization." });
});
const provenanceSchema = z.object({ kind: z.enum(["file", "url", "recording", "manual-entry"]), location: nonEmptyStringSchema, capturedAt: isoDateTimeSchema.optional(), capturedBy: z.string().optional(), originalLanguage: contentLocaleSchema.optional() }).strict();
const transformationsSchema = z.object({ structure: z.boolean(), summarize: z.boolean(), adapt: z.boolean(), translate: z.boolean(), syntheticVoice: z.boolean(), syntheticLikeness: z.boolean() }).strict();
const sensitivitySchema = z.object({ classification: z.enum(["normal", "sensitive", "high-risk", "blocked"]), tags: uniqueStrings(sensitivityTagSchema), manualReviewRequired: z.boolean(), notes: z.string().optional() }).strict();

export const contentSourceManifestSchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), sourceId: identifierSchema, title: nonEmptyStringSchema, owner: nonEmptyStringSchema, sourceType: sourceTypeSchema, provenance: provenanceSchema, accessLevel: contentTierSchema, rights: sourceRightsSchema, aiTransformations: transformationsSchema, sensitivity: sensitivitySchema, sourceHash: sha256Schema, createdAt: isoDateTimeSchema, approvedAt: isoDateTimeSchema.optional(), approvedBy: nonEmptyStringSchema.optional(), notes: z.string().optional() }).strict().superRefine((value, ctx) => {
  if (["premium", "private"].includes(value.accessLevel) && !value.sensitivity.manualReviewRequired) ctx.addIssue({ code: "custom", path: ["sensitivity", "manualReviewRequired"], message: "Premium and private sources require manual review." });
});
export type ContentSourceManifest = z.infer<typeof contentSourceManifestSchema>;

const episodeModeSchema = z.enum(["story-to-strategy", "tactical-lesson", "position-essay", "myth-reality", "decision-framework", "case-diagnosis", "q-and-a", "guided-exercise"]);
const beatTypeSchema = z.enum(["hook", "situation", "story", "conventional-view", "reframe", "framework", "example", "action", "cta"]);
const blueprintBeatSchema = z.object({ beatId: identifierSchema, type: beatTypeSchema, purpose: nonEmptyStringSchema, sourceIds: uniqueStrings(identifierSchema).min(1), claimIds: uniqueStrings(identifierSchema).optional(), visualIntent: z.string().optional(), sensitivity: z.enum(["normal", "sensitive", "high-risk"]).optional() }).strict();
const ctaSchema = z.object({ kind: z.enum(["newsletter", "free-resource", "course", "membership", "consultation", "book", "none"]), destination: z.string(), campaignId: z.string(), localizedDestinations: z.partialRecord(contentLocaleSchema, z.string()).optional() }).strict();
export const episodeBlueprintSchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), episodeId: identifierSchema, genreId: z.literal("strategic-reinvention"), creatorProfileId: nonEmptyStringSchema, canonicalLocale: contentLocaleSchema, mode: episodeModeSchema, sources: uniqueStrings(identifierSchema).min(1), contentTier: contentTierSchema, thesis: z.string().trim().min(10), viewerProblem: z.string().optional(), forbiddenInferences: uniqueStrings(z.string()).optional(), beats: z.array(blueprintBeatSchema).min(6).max(12), cta: ctaSchema, targetLocales: uniqueStrings(contentLocaleSchema).optional(), requiredApprovalGates: uniqueStrings(approvalGateSchema).min(1) }).strict();
export type EpisodeBlueprint = z.infer<typeof episodeBlueprintSchema>;
export const provenanceReportSchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), episodeId: identifierSchema, locale: contentLocaleSchema, sourceHashes: z.record(identifierSchema, sha256Schema), unsupportedInferenceIds: z.array(identifierSchema), createdAt: isoDateTimeSchema }).strict();
export type ProvenanceReport = z.infer<typeof provenanceReportSchema>;
export const multilingualPackageIdentitySchema = z.object({ schemaVersion: z.literal(STRATEGIC_REINVENTION_SCHEMA_VERSION), episodeId: identifierSchema, canonicalLocale: contentLocaleSchema, locale: contentLocaleSchema, variant: z.enum(["full", "short"]), packageHash: sha256Schema }).strict();
export type MultilingualPackageIdentity = z.infer<typeof multilingualPackageIdentitySchema>;

const importedRightsSchema = z.object({ status: sourceRightsSchema.shape.status, rightsHolders: uniqueStrings(nonEmptyStringSchema).optional(), licenseReference: nonEmptyStringSchema.optional(), allowedUses: uniqueStrings(allowedUseSchema), permittedLocales: uniqueStrings(importedLocaleSchema).min(1), commercialUse: z.boolean(), expiresAt: isoDateTimeSchema.optional(), attribution: nonEmptyStringSchema.optional(), notes: z.string().optional() }).strict();
const importedProvenanceSchema = z.object({ kind: provenanceSchema.shape.kind, location: nonEmptyStringSchema, capturedAt: isoDateTimeSchema.optional(), capturedBy: z.string().optional(), originalLanguage: importedLocaleSchema.optional() }).strict();
export const contentSourceManifestV1ImportSchema = z.object({ sourceId: identifierSchema, title: nonEmptyStringSchema, owner: nonEmptyStringSchema, sourceType: sourceTypeSchema, provenance: importedProvenanceSchema, accessLevel: importedContentTierSchema, rights: importedRightsSchema, aiTransformations: transformationsSchema, sensitivity: sensitivitySchema, sourceHash: sha256Schema, createdAt: isoDateTimeSchema, approvedAt: isoDateTimeSchema.optional(), approvedBy: nonEmptyStringSchema.optional(), notes: z.string().optional() }).strict();
export const episodeBlueprintV1ImportSchema = z.object({ episodeId: identifierSchema, genreId: z.literal("strategic-reinvention"), creatorProfileId: nonEmptyStringSchema, canonicalLocale: importedLocaleSchema, mode: episodeModeSchema, sources: uniqueStrings(identifierSchema).min(1), contentTier: importedContentTierSchema, thesis: z.string().trim().min(10), viewerProblem: z.string().optional(), forbiddenInferences: uniqueStrings(z.string()).optional(), beats: z.array(z.object({ beatId: identifierSchema, type: beatTypeSchema, purpose: nonEmptyStringSchema, sourceIds: uniqueStrings(identifierSchema), claimIds: uniqueStrings(identifierSchema).optional(), visualIntent: z.string().optional(), sensitivity: z.enum(["normal", "sensitive", "high-risk"]).optional() }).strict()).min(6).max(12), cta: z.object({ kind: ctaSchema.shape.kind, destination: z.string(), campaignId: z.string(), localizedDestinations: z.partialRecord(importedLocaleSchema, z.string()).optional() }).strict(), targetLocales: uniqueStrings(importedLocaleSchema).optional(), approvals: importedApprovalSchema }).strict();

function normalizeTier(value: z.infer<typeof importedContentTierSchema>): ContentTier {
  return value === "lead-magnet" ? "lead-generation" : value === "confidential" ? "private" : value;
}

function normalizeImportedLocale(value: string): z.infer<typeof contentLocaleSchema> {
  return contentLocaleSchema.parse(value.split("-", 1)[0]?.toLowerCase());
}

function normalizeImportedLocales(values: readonly string[]): z.infer<typeof contentLocaleSchema>[] {
  const normalized = values.map(normalizeImportedLocale);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Regional locale normalization produced an ambiguous locale list.");
  }
  return normalized;
}

function normalizeLocalizedDestinations(
  destinations: Partial<Record<string, string>> | undefined
): Partial<Record<z.infer<typeof contentLocaleSchema>, string>> | undefined {
  if (!destinations) return undefined;
  const normalized: Partial<Record<z.infer<typeof contentLocaleSchema>, string>> = {};
  for (const [locale, destination] of Object.entries(destinations)) {
    if (destination === undefined) {
      throw new Error("Localized CTA destinations must be strings.");
    }
    const normalizedLocale = normalizeImportedLocale(locale);
    if (normalizedLocale in normalized) {
      throw new Error("Regional locale normalization produced ambiguous CTA destinations.");
    }
    normalized[normalizedLocale] = destination;
  }
  return normalized;
}

export function normalizeContentSourceManifestV1(input: unknown): ContentSourceManifest {
  const value = contentSourceManifestV1ImportSchema.parse(input);
  return contentSourceManifestSchema.parse({ ...value, schemaVersion: STRATEGIC_REINVENTION_SCHEMA_VERSION, accessLevel: normalizeTier(value.accessLevel), provenance: { ...value.provenance, originalLanguage: value.provenance.originalLanguage ? normalizeImportedLocale(value.provenance.originalLanguage) : undefined }, rights: { ...value.rights, permittedLocales: normalizeImportedLocales(value.rights.permittedLocales) } });
}

export function normalizeEpisodeBlueprintV1(input: unknown): EpisodeBlueprint {
  const value = episodeBlueprintV1ImportSchema.parse(input);
  const { approvals: _approvals, ...blueprint } = value;
  return episodeBlueprintSchema.parse({ ...blueprint, schemaVersion: STRATEGIC_REINVENTION_SCHEMA_VERSION, contentTier: normalizeTier(value.contentTier), canonicalLocale: normalizeImportedLocale(value.canonicalLocale), targetLocales: value.targetLocales ? normalizeImportedLocales(value.targetLocales) : undefined, cta: { ...value.cta, localizedDestinations: normalizeLocalizedDestinations(value.cta.localizedDestinations) }, requiredApprovalGates: approvalGateSchema.options });
}
