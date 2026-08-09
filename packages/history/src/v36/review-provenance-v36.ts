import { z } from "zod";

export const HISTORY_V36_REVIEW_PROVENANCE_SCHEMA =
  "history-v3.6-relation-ir-review-provenance.v3" as const;
export const HISTORY_V36_REVIEW_ARTIFACT_KIND =
  "history-v3.6-shadow-relations-review" as const;

const gitShaSchema = z.string().regex(/^[a-fA-F0-9]{40}$/u);
const utcTimestampSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
);

/** Authoritative runtime validator for V3.6 review-artifact provenance. */
export const reviewArtifactProvenanceSchemaV36 = z.object({
  generatedAt: utcTimestampSchema,
  gitCommitSha: gitShaSchema,
  gitBranch: z.string(),
  v36ImplementationCommitSha: gitShaSchema,
  frozenV35ProductionCommitSha: gitShaSchema,
  frozenV35ProductionTag: z.literal("history-v3.5-frozen-before-v36"),
  acceptedV35SemanticBaselineCommitSha: gitShaSchema,
  acceptedV35SemanticBaselineTag: z.literal("history-v3.5-semantic-baseline"),
  contractBaselineCommitSha: gitShaSchema,
  schemaVersion: z.literal(HISTORY_V36_REVIEW_PROVENANCE_SCHEMA),
  artifactKind: z.literal(HISTORY_V36_REVIEW_ARTIFACT_KIND),
  /** Ordered, explicit corpus identity; never infer this from artifact contents. */
  episodeSet: z.array(z.string().trim().min(1)).min(1),
}).strict();

/** Machine-enforcing Draft 2020-12 schema generated from the runtime validator. */
export const reviewArtifactProvenanceJsonSchemaV36 = {
  ...z.toJSONSchema(reviewArtifactProvenanceSchemaV36),
  $id: "https://mediaforge.local/schemas/history/v3.6/review-provenance-schema.json",
  title: "History V3.6 relation-IR review artifact provenance",
};

export type ReviewArtifactProvenanceV36 = z.infer<
  typeof reviewArtifactProvenanceSchemaV36
>;

export const HISTORY_V36_BOUNDED_LLM_REVIEW_PROVENANCE_SCHEMA =
  "history-v3.6-bounded-llm-shadow-review-provenance.v1" as const;
export const HISTORY_V36_BOUNDED_LLM_REVIEW_ARTIFACT_KIND =
  "history-v3.6-bounded-llm-shadow-review" as const;

/** Dedicated provenance keeps the earlier V3.6 relation-review contract immutable. */
export const boundedLlmReviewArtifactProvenanceSchemaV36 = z.object({
  generatedAt: utcTimestampSchema,
  gitCommitSha: gitShaSchema,
  gitBranch: z.string(),
  v36ImplementationCommitSha: gitShaSchema,
  representativeV2BaselineCommitSha: gitShaSchema,
  representativeV2BaselineTag: z.literal("history-v3.6-representative-shadow-v2-baseline"),
  contractBaselineCommitSha: gitShaSchema,
  contractBaselineTag: z.literal("history-v3.6-contract-preflight-baseline"),
  frozenV35ProductionCommitSha: gitShaSchema,
  frozenV35ProductionTag: z.literal("history-v3.5-frozen-before-v36"),
  acceptedV35SemanticBaselineCommitSha: gitShaSchema,
  acceptedV35SemanticBaselineTag: z.literal("history-v3.5-semantic-baseline"),
  promptVersion: z.literal("history-v36-relation-proposer-v1"),
  providerIdentity: z.string().nullable(),
  model: z.string().nullable(),
  liveExperimentStatus: z.enum(["run", "not-run"]),
  schemaVersion: z.literal(HISTORY_V36_BOUNDED_LLM_REVIEW_PROVENANCE_SCHEMA),
  artifactKind: z.literal(HISTORY_V36_BOUNDED_LLM_REVIEW_ARTIFACT_KIND),
  episodeSet: z.array(z.string().trim().min(1)).length(8),
}).strict();

export type BoundedLlmReviewArtifactProvenanceV36 = z.infer<
  typeof boundedLlmReviewArtifactProvenanceSchemaV36
>;

export const HISTORY_V36_ATOMIC_GROUNDING_REVIEW_PROVENANCE_SCHEMA =
  "history-v3.6-atomic-grounding-review-provenance.v1" as const;
export const HISTORY_V36_ATOMIC_GROUNDING_REVIEW_ARTIFACT_KIND =
  "history-v3.6-atomic-grounding-review" as const;

/** Dedicated Phase 2.3 provenance; older V3.6 review contracts stay immutable. */
export const atomicGroundingReviewArtifactProvenanceSchemaV36 = z.object({
  generatedAt: utcTimestampSchema,
  v36ImplementationCommitSha: gitShaSchema,
  phase22BaselineCommitSha: gitShaSchema,
  phase22BaselineTag: z.literal("history-v3.6-bounded-llm-shadow-baseline"),
  contractBaselineCommitSha: gitShaSchema,
  contractBaselineTag: z.literal("history-v3.6-contract-preflight-baseline"),
  frozenV35ProductionCommitSha: gitShaSchema,
  frozenV35ProductionTag: z.literal("history-v3.5-frozen-before-v36"),
  acceptedV35SemanticBaselineCommitSha: gitShaSchema,
  acceptedV35SemanticBaselineTag: z.literal("history-v3.5-semantic-baseline"),
  groundingSchemaVersion: z.literal("history-atomic-claim-grounding.v1"),
  schemaVersion: z.literal(HISTORY_V36_ATOMIC_GROUNDING_REVIEW_PROVENANCE_SCHEMA),
  artifactKind: z.literal(HISTORY_V36_ATOMIC_GROUNDING_REVIEW_ARTIFACT_KIND),
  episodeSet: z.array(z.string().trim().min(1)).length(8),
  liveLlmCalls: z.literal(false),
}).strict();

export type AtomicGroundingReviewArtifactProvenanceV36 = z.infer<
  typeof atomicGroundingReviewArtifactProvenanceSchemaV36
>;
