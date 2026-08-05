import crypto from "node:crypto";

import { z } from "zod";

/**
 * Opt-in, provider-neutral contracts for genre-specific production policies.
 * These contracts intentionally do not activate behaviour for an existing
 * profile; an orchestrator must explicitly attach a validated profile.
 */
export const GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION =
  "mediaforge.genre-production-intelligence.v1" as const;

const id = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const text = z.string().trim().min(1).max(2_000);
const version = z.string().trim().min(1).max(160);
const unit = z.number().finite().min(0).max(1);
const score = z.number().finite().min(0).max(100);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const uniqueIds = (schema: z.ZodType<string>, min = 0, max = 100) =>
  z.array(schema).min(min).max(max).refine((values) => new Set(values).size === values.length, "Values must be unique.");

export const productionEvidenceSourceSchema = z.enum([
  "MEASURED",
  "DERIVED",
  "MODEL_INFERENCE",
  "EDITORIAL",
]);
export type ProductionEvidenceSource = z.infer<typeof productionEvidenceSourceSchema>;

export const productionEvidenceSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.optional(),
    source: productionEvidenceSourceSchema,
    confidence: unit,
    references: z.array(text).max(40),
  }).strict();
export type ProductionEvidence<TValue> = {
  readonly value?: TValue;
  readonly source: ProductionEvidenceSource;
  readonly confidence: number;
  readonly references: readonly string[];
};

const factorPolicySchema = z.object({
  id,
  weight: z.number().finite().positive().max(10_000),
  required: z.boolean().default(false),
  label: text.optional(),
}).strict();

export const topicOpportunityPolicySchema = z.object({
  factors: z.array(factorPolicySchema).min(1).max(40)
    .refine((values) => new Set(values.map((value) => value.id)).size === values.length, "Topic factor IDs must be unique."),
  minimumConfidence: unit.default(0),
}).strict();
export type TopicOpportunityPolicy = z.infer<typeof topicOpportunityPolicySchema>;

export const retentionBeatKindSchema = z.enum([
  "opening-hook",
  "promise",
  "unresolved-question",
  "escalation-reset",
  "conclusion-payoff",
  "next-content-bridge",
]);
export type RetentionBeatKind = z.infer<typeof retentionBeatKindSchema>;

export const scriptAnalysisPolicySchema = z.object({
  requiredBeats: uniqueIds(retentionBeatKindSchema, 1, 6),
  timingRangesSeconds: z.partialRecord(retentionBeatKindSchema, z.object({
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative(),
  }).strict().refine((range) => range.min <= range.max, "Minimum timing must not exceed maximum timing.")).optional(),
}).strict();
export type ScriptAnalysisPolicy = z.infer<typeof scriptAnalysisPolicySchema>;

export const packagingPolicySchema = z.object({
  titleCandidateCount: z.literal(3).default(3),
  thumbnailCandidateCount: z.literal(3).default(3),
  approvalRequired: z.boolean().default(true),
}).strict();
export type PackagingPolicy = z.infer<typeof packagingPolicySchema>;

export const audioQualityPolicySchema = z.object({
  maximumRepairAttempts: z.number().int().min(0).max(5).default(2),
  requireClippingCheck: z.boolean().default(true),
  requireSilenceCheck: z.boolean().default(true),
  requireMissingSpeechCheck: z.boolean().default(true),
  requireRepetitionCheck: z.boolean().default(true),
  requireLoudnessCheck: z.boolean().default(true),
  requireDurationCheck: z.boolean().default(true),
}).strict();
export type AudioQualityPolicy = z.infer<typeof audioQualityPolicySchema>;

export const originalityPolicySchema = z.object({
  maximumSimilarity: unit,
  requireReviewAbove: unit,
}).strict().refine((value) => value.requireReviewAbove <= value.maximumSimilarity, "Review threshold must not exceed the permitted similarity.");
export type OriginalityPolicy = z.infer<typeof originalityPolicySchema>;

export const analyticsLearningPolicySchema = z.object({
  checkpoints: uniqueIds(id, 1, 12),
  minimumSampleSize: z.number().int().positive().max(1_000_000),
  requireProposalApproval: z.literal(true).default(true),
}).strict();
export type AnalyticsLearningPolicy = z.infer<typeof analyticsLearningPolicySchema>;

export const localizationPolicySchema = z.object({
  minimumEligibilityScore: score,
  requireCostApproval: z.literal(true).default(true),
  requirePronunciationQa: z.boolean().default(true),
}).strict();
export type LocalizationPolicy = z.infer<typeof localizationPolicySchema>;

const extensionPointSchema = z.object({
  schemas: z.array(z.object({ id, version }).strict()).max(30).default([]),
  promptFragments: z.array(z.object({ id, version, contentHash: sha256 }).strict()).max(60).default([]),
  validators: z.array(z.object({ id, version }).strict()).max(30).default([]),
  artifactNames: z.array(z.object({ id, version }).strict()).max(30).default([]),
  providerConstraints: z.array(z.object({ id, version }).strict()).max(30).default([]),
}).strict().default({
  schemas: [],
  promptFragments: [],
  validators: [],
  artifactNames: [],
  providerConstraints: [],
});

export const genreProductionProfileSchema = z.object({
  schemaVersion: z.literal(GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION),
  genreId: id,
  profileVersion: version,
  topicPolicy: topicOpportunityPolicySchema.optional(),
  scriptPolicy: scriptAnalysisPolicySchema.optional(),
  packagingPolicy: packagingPolicySchema.optional(),
  audioPolicy: audioQualityPolicySchema.optional(),
  originalityPolicy: originalityPolicySchema.optional(),
  analyticsPolicy: analyticsLearningPolicySchema.optional(),
  localizationPolicy: localizationPolicySchema.optional(),
  extensions: extensionPointSchema,
}).strict();
export type GenreProductionProfile = z.infer<typeof genreProductionProfileSchema>;

export type GenreProductionCapability = "topic" | "script" | "packaging" | "audio" | "originality" | "analytics" | "localization";
export function isGenreProductionCapabilityEnabled(profile: GenreProductionProfile, capability: GenreProductionCapability): boolean {
  const fields: Readonly<Record<GenreProductionCapability, keyof GenreProductionProfile>> = {
    topic: "topicPolicy", script: "scriptPolicy", packaging: "packagingPolicy", audio: "audioPolicy", originality: "originalityPolicy", analytics: "analyticsPolicy", localization: "localizationPolicy",
  };
  return profile[fields[capability]] !== undefined;
}

export const topicOpportunityFactorSchema = z.object({
  factorId: id,
  normalizedScore: score.optional(),
  evidence: productionEvidenceSchema(score),
  rationale: text,
}).strict();
export const topicOpportunityInputSchema = z.object({
  profile: genreProductionProfileSchema,
  topicId: id,
  factors: z.array(topicOpportunityFactorSchema).max(100),
}).strict();
export type TopicOpportunityInput = z.infer<typeof topicOpportunityInputSchema>;

export function scoreTopicOpportunity(input: TopicOpportunityInput) {
  const parsed = topicOpportunityInputSchema.parse(input);
  if (!parsed.profile.topicPolicy) throw new Error("Topic opportunity scoring is not enabled for this genre profile.");
  const byId = new Map(parsed.factors.map((factor) => [factor.factorId, factor]));
  const scored = parsed.profile.topicPolicy.factors.map((policy) => {
    const factor = byId.get(policy.id);
    const usable = factor?.normalizedScore !== undefined && factor.evidence.confidence >= parsed.profile.topicPolicy!.minimumConfidence;
    return { factorId: policy.id, weight: policy.weight, required: policy.required, status: usable ? "included" as const : "missing" as const, score: usable ? factor!.normalizedScore! : undefined, evidence: factor?.evidence, rationale: factor?.rationale ?? "No qualifying evidence was supplied." };
  });
  const included = scored.filter((factor) => factor.status === "included");
  const weight = included.reduce((sum, factor) => sum + factor.weight, 0);
  return {
    schemaVersion: GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION,
    topicId: parsed.topicId,
    profileVersion: parsed.profile.profileVersion,
    score: weight === 0 ? undefined : included.reduce((sum, factor) => sum + (factor.score! * factor.weight), 0) / weight,
    missingRequiredFactorIds: scored.filter((factor) => factor.required && factor.status === "missing").map((factor) => factor.factorId),
    factors: scored,
  } as const;
}

export const retentionBeatSchema = z.object({
  kind: retentionBeatKindSchema,
  atSeconds: z.number().finite().nonnegative(),
  evidence: productionEvidenceSchema(text),
}).strict();
export function analyzeRetentionStructure(input: { readonly profile: GenreProductionProfile; readonly beats: readonly z.infer<typeof retentionBeatSchema>[] }) {
  const profile = genreProductionProfileSchema.parse(input.profile);
  if (!profile.scriptPolicy) throw new Error("Retention analysis is not enabled for this genre profile.");
  const beats = z.array(retentionBeatSchema).parse(input.beats);
  const kinds = new Set(beats.map((beat) => beat.kind));
  const timingFindings = beats.flatMap((beat) => {
    const range = profile.scriptPolicy!.timingRangesSeconds?.[beat.kind];
    return range && (beat.atSeconds < range.min || beat.atSeconds > range.max) ? [{ kind: beat.kind, atSeconds: beat.atSeconds, expectedRange: range }] : [];
  });
  return { profileVersion: profile.profileVersion, missingBeats: profile.scriptPolicy.requiredBeats.filter((kind) => !kinds.has(kind as RetentionBeatKind)), timingFindings, beats } as const;
}

const packagingCandidateSchema = z.object({ id, meaning: text, promiseClaims: uniqueIds(id, 1, 20), contentSupportClaims: uniqueIds(id, 0, 100) }).strict();
export const packagingHypothesesSchema = z.object({
  profileVersion: version,
  titles: z.array(packagingCandidateSchema).length(3),
  thumbnails: z.array(packagingCandidateSchema).length(3),
}).strict();
export type PackagingHypotheses = z.infer<typeof packagingHypothesesSchema>;
export function validatePackagingHypotheses(input: { readonly profile: GenreProductionProfile; readonly hypotheses: PackagingHypotheses }) {
  const profile = genreProductionProfileSchema.parse(input.profile);
  if (!profile.packagingPolicy) throw new Error("Packaging experiments are not enabled for this genre profile.");
  const hypotheses = packagingHypothesesSchema.parse(input.hypotheses);
  const validate = (candidates: readonly z.infer<typeof packagingCandidateSchema>[]) => candidates.map((candidate) => ({
    candidateId: candidate.id,
    supported: candidate.promiseClaims.every((claim) => candidate.contentSupportClaims.includes(claim)),
  }));
  const duplicateMeanings = [...hypotheses.titles, ...hypotheses.thumbnails].filter((candidate, index, all) => all.findIndex((other) => other.meaning === candidate.meaning) !== index).map((candidate) => candidate.id);
  return { profileVersion: profile.profileVersion, approvalRequired: profile.packagingPolicy.approvalRequired, duplicateMeaningCandidateIds: duplicateMeanings, titleValidation: validate(hypotheses.titles), thumbnailValidation: validate(hypotheses.thumbnails) } as const;
}

export const canonicalNarrationSchema = z.object({ language: z.string().trim().min(2).max(35), text: z.string().trim().min(1), contentHash: sha256 }).strict();
export const speechPreparationPlanSchema = z.object({
  profileVersion: version,
  narration: canonicalNarrationSchema,
  pronunciationAdapterId: id.optional(),
  providerAdapterId: id.optional(),
  providerVersion: version.optional(),
}).strict();
export const audioQualityResultSchema = z.object({
  profileVersion: version,
  checks: z.array(z.object({ id, passed: z.boolean(), evidence: productionEvidenceSchema(z.union([z.string(), z.number(), z.boolean()])) }).strict()).min(1),
  repairAttempt: z.number().int().nonnegative(),
}).strict();

export const assetOriginSchema = z.enum(["generated", "archival", "licensed", "public-domain", "transformed", "composited", "user-supplied"]);
export const assetLineageSchema = z.object({
  assetId: id,
  origin: assetOriginSchema,
  provider: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  providerVersion: version.optional(),
  promptHash: sha256.optional(),
  sourceIdentifier: text.optional(),
  license: text.optional(),
  parentAssetIds: uniqueIds(id, 0, 100),
  transformations: z.array(z.object({ id, version, inputHash: sha256, outputHash: sha256 }).strict()).max(100),
  bindings: z.array(z.object({ kind: z.enum(["rendered-shot", "audio-segment"]), id }).strict()).max(500),
  disclosure: z.object({ required: z.boolean(), text: z.string().trim().max(2_000).optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  if (["archival", "licensed", "public-domain", "user-supplied"].includes(value.origin) && !value.sourceIdentifier) ctx.addIssue({ code: "custom", path: ["sourceIdentifier"], message: "Source provenance is required for non-generated assets." });
  if (value.origin === "licensed" && !value.license) ctx.addIssue({ code: "custom", path: ["license"], message: "Licensed assets require licence metadata." });
  if (value.disclosure.required && !value.disclosure.text) ctx.addIssue({ code: "custom", path: ["disclosure", "text"], message: "Required disclosure must be supplied." });
});
export type AssetLineage = z.infer<typeof assetLineageSchema>;
export function validateAssetLineage(lineage: readonly AssetLineage[]): void {
  const parsed = z.array(assetLineageSchema).parse(lineage);
  const ids = new Set(parsed.map((asset) => asset.assetId));
  for (const asset of parsed) for (const parentId of asset.parentAssetIds) if (!ids.has(parentId)) throw new Error(`Asset ${asset.assetId} references unknown parent ${parentId}.`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function immutablePlanHash(payload: unknown): string { return crypto.createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex"); }
export const immutablePlanSchema = z.object({ profileVersion: version, planHash: sha256, payload: z.unknown() }).strict().superRefine((value, ctx) => {
  if (immutablePlanHash(value.payload) !== value.planHash) ctx.addIssue({ code: "custom", path: ["planHash"], message: "Plan hash does not bind the payload." });
});
export function createImmutablePlan(profile: GenreProductionProfile, payload: unknown) { const parsed = genreProductionProfileSchema.parse(profile); return immutablePlanSchema.parse({ profileVersion: parsed.profileVersion, planHash: immutablePlanHash(payload), payload }); }
export function isImmutablePlanCurrent(plan: z.infer<typeof immutablePlanSchema>, payload: unknown): boolean { return immutablePlanSchema.safeParse(plan).success && plan.planHash === immutablePlanHash(payload); }

export const analyticsCheckpointSchema = z.object({ id, observedAt: z.string().datetime(), sampleSize: z.number().int().nonnegative(), metrics: z.record(id, productionEvidenceSchema(z.number().finite())) }).strict();
export const analyticsProposalSchema = z.object({ profileVersion: version, proposalId: id, diagnostics: z.array(text).min(1), evidence: z.array(productionEvidenceSchema(z.number().finite())).min(1), proposedChanges: z.array(text).min(1), approvalState: z.enum(["pending", "approved", "rejected"]), rollbackPlan: text }).strict();
export function evaluateAnalyticsProposal(input: { readonly profile: GenreProductionProfile; readonly checkpoint: z.infer<typeof analyticsCheckpointSchema>; readonly proposal: z.infer<typeof analyticsProposalSchema> }) {
  const profile = genreProductionProfileSchema.parse(input.profile);
  if (!profile.analyticsPolicy) throw new Error("Analytics learning is not enabled for this genre profile.");
  const checkpoint = analyticsCheckpointSchema.parse(input.checkpoint);
  const proposal = analyticsProposalSchema.parse(input.proposal);
  return { eligible: profile.analyticsPolicy.checkpoints.includes(checkpoint.id) && checkpoint.sampleSize >= profile.analyticsPolicy.minimumSampleSize, requiresApproval: profile.analyticsPolicy.requireProposalApproval, mayMutateProfile: false, profileVersionMatches: proposal.profileVersion === profile.profileVersion } as const;
}

export const localizationPlanSchema = z.object({ profileVersion: version, sourceLocale: z.string().trim().min(2).max(35), targetLanguages: uniqueIds(z.string().trim().min(2).max(35), 1, 30), eligibility: productionEvidenceSchema(score), metadataTranslationRequired: z.boolean(), dubbingPlan: z.object({ required: z.boolean(), pronunciationQaRequired: z.boolean() }).strict(), estimatedCost: z.object({ currency: z.string().length(3), amount: z.number().finite().nonnegative(), operations: z.number().int().nonnegative() }).strict(), approvalRequired: z.boolean() }).strict();
export function planLocalization(input: { readonly profile: GenreProductionProfile; readonly plan: z.infer<typeof localizationPlanSchema> }) {
  const profile = genreProductionProfileSchema.parse(input.profile);
  if (!profile.localizationPolicy) throw new Error("Localization planning is not enabled for this genre profile.");
  const plan = localizationPlanSchema.parse(input.plan);
  return { eligible: (plan.eligibility.value ?? 0) >= profile.localizationPolicy.minimumEligibilityScore, requiresApproval: profile.localizationPolicy.requireCostApproval, pronunciationQaRequired: profile.localizationPolicy.requirePronunciationQa || plan.dubbingPlan.pronunciationQaRequired, estimatedCost: plan.estimatedCost } as const;
}

export const originalityCheckSchema = z.object({ profileVersion: version, similarity: unit, evidence: productionEvidenceSchema(score), references: z.array(text).max(100) }).strict();
export function evaluateOriginality(input: { readonly profile: GenreProductionProfile; readonly check: z.infer<typeof originalityCheckSchema> }) {
  const profile = genreProductionProfileSchema.parse(input.profile);
  if (!profile.originalityPolicy) throw new Error("Originality checking is not enabled for this genre profile.");
  const check = originalityCheckSchema.parse(input.check);
  return { permitted: check.similarity <= profile.originalityPolicy.maximumSimilarity, requiresReview: check.similarity >= profile.originalityPolicy.requireReviewAbove } as const;
}

export const productionOperatorOverrideSchema = z.object({ id, actor: text, reason: text, requestedAt: z.string().datetime(), field: id, before: z.unknown(), after: z.unknown(), evidence: productionEvidenceSchema(z.unknown()) }).strict();
export type ProductionOperatorOverride = z.infer<typeof productionOperatorOverrideSchema>;
export function cacheIdentityForGenreProduction(profile: GenreProductionProfile, operation: string, inputHash: string): string {
  const parsed = genreProductionProfileSchema.parse(profile);
  return immutablePlanHash({ schemaVersion: GENRE_PRODUCTION_INTELLIGENCE_SCHEMA_VERSION, genreId: parsed.genreId, profileVersion: parsed.profileVersion, operation, inputHash });
}
