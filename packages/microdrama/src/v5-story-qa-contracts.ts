import { z } from "zod";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

export const STORY_QA_SCHEMA_VERSION =
  "mediaforge.microdrama.story-qa.v1" as const;

export const STORY_QA_ISSUE_CODES = [
  "boundary_production_mismatch",
  "boundary_chain_break",
  "hook_cliffhanger_missing",
  "locale_parity_mismatch",
  "locale_timing_gate_failed",
  "season_boundary_violation",
  "forbidden_event_present",
  "craft_score_invalid",
  "semantic_qa_failed",
  "approval_revision_mismatch",
  "approval_force_bypass_forbidden",
] as const;
export const storyQaIssueCodeSchema = z.enum(STORY_QA_ISSUE_CODES);
export type StoryQaIssueCode = z.infer<typeof storyQaIssueCodeSchema>;

export const SEMANTIC_STORY_QA_STATUSES = [
  "PASS",
  "BLOCK",
  "UNAVAILABLE",
  "ADVISORY",
] as const;
export const semanticStoryQaStatusSchema = z.enum(SEMANTIC_STORY_QA_STATUSES);
export type SemanticStoryQaStatus = z.infer<typeof semanticStoryQaStatusSchema>;

export const storyQaIssueSchema = z
  .object({
    code: storyQaIssueCodeSchema,
    message: z.string().min(1).max(2_000),
    episodeId: z.string().regex(/^E\d{3}$/u).optional(),
    locale: z.string().optional(),
    path: z.string().optional(),
    blocking: z.boolean(),
  })
  .strict();
export type StoryQaIssue = z.infer<typeof storyQaIssueSchema>;

export const craftEditorialEvidenceSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    locale: z.string(),
    editorialScore: z.number(),
    editorialGate: z.enum(["PASS", "FAIL"]),
    timingGate: z.enum(["PASS", "FAIL"]),
  })
  .strict();
export type CraftEditorialEvidence = z.infer<typeof craftEditorialEvidenceSchema>;

export const storyApprovedEvidenceSchema = z
  .object({
    schemaVersion: z.literal(STORY_QA_SCHEMA_VERSION),
    approvalId: z.string().min(1).max(160),
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    scriptRevisionId: z.string().min(1).max(160),
    boundaryRevisionId: z.string().min(1).max(160),
    importId: z.string().regex(/^[a-f0-9]{64}$/u),
    locale: z.string(),
    episodeId: z.string().regex(/^E\d{3}$/u),
    approvedAt: z.string(),
    deterministicQaPassed: z.literal(true),
  })
  .strict();
export type StoryApprovedEvidence = z.infer<typeof storyApprovedEvidenceSchema>;

export type V5StoryDeterministicQaResult =
  | {
      ok: true;
      craftEvidence: CraftEditorialEvidence[];
      issues: StoryQaIssue[];
    }
  | { ok: false; craftEvidence: CraftEditorialEvidence[]; issues: StoryQaIssue[] };

export type SemanticStoryQaAdapterResult = {
  status: SemanticStoryQaStatus;
  message: string;
  episodeId?: string;
  locale?: string;
};

export type SemanticStoryQaAdapter = (
  input: {
    episodeId: string;
    locale: string;
    hookSemanticId: string;
    cliffhangerSemanticId: string;
  }
) => SemanticStoryQaAdapterResult | Promise<SemanticStoryQaAdapterResult>;

export function validateStoryApprovedEvidence(
  evidence: unknown
): StoryApprovedEvidence {
  return storyApprovedEvidenceSchema.parse(evidence);
}
