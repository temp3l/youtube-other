import { z } from "zod";

export const HISTORY_V36_REVIEW_PROVENANCE_SCHEMA =
  "history-v3.6-relation-ir-review-provenance.v2" as const;
export const HISTORY_V36_REVIEW_ARTIFACT_KIND =
  "history-v3.6-relation-ir-review" as const;

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
  schemaVersion: z.literal(HISTORY_V36_REVIEW_PROVENANCE_SCHEMA),
  artifactKind: z.literal(HISTORY_V36_REVIEW_ARTIFACT_KIND),
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
