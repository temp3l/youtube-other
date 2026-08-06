import { z } from "zod";
import type { ClaimEvidenceAssessmentV3_3 } from "./history-research-v33.js";

export const compactClaimEvidenceAssessmentV33Schema = z
  .object({
    claimId: z.string().min(1),
    evidenceFragmentId: z.string().min(1),
    result: z.enum([
      "supports",
      "partially_supports",
      "contradicts",
      "irrelevant",
      "ambiguous",
    ]),
    unsupportedAspects: z.array(z.string()),
    contradictionAspects: z.array(z.string()),
    temporalAlignment: z.enum([
      "aligned",
      "misaligned",
      "unclear",
      "not_applicable",
    ]),
    geographicAlignment: z.enum([
      "aligned",
      "misaligned",
      "unclear",
      "not_applicable",
    ]),
    entityAlignment: z.enum([
      "aligned",
      "misaligned",
      "unclear",
      "not_applicable",
    ]),
    confidenceBand: z.enum(["low", "medium", "high"]),
    detailedRationale: z.string().optional(),
  })
  .strict();

export type CompactClaimEvidenceAssessmentV3_3 = z.infer<
  typeof compactClaimEvidenceAssessmentV33Schema
>;

const confidenceFromBand = (
  band: CompactClaimEvidenceAssessmentV3_3["confidenceBand"]
): number => {
  switch (band) {
    case "high":
      return 0.85;
    case "medium":
      return 0.6;
    case "low":
      return 0.3;
  }
};

export function requiresDetailedRationaleV33(
  assessment: Pick<
    CompactClaimEvidenceAssessmentV3_3,
    "result" | "confidenceBand"
  > & { readonly contested?: boolean }
): boolean {
  return (
    assessment.result === "partially_supports" ||
    assessment.result === "contradicts" ||
    assessment.result === "ambiguous" ||
    assessment.confidenceBand === "low" ||
    assessment.contested === true
  );
}

/** Expand compact model output into the persisted assessment record. */
export function expandCompactAssessmentV33(
  compact: CompactClaimEvidenceAssessmentV3_3
): ClaimEvidenceAssessmentV3_3 {
  const needsDetail = requiresDetailedRationaleV33(compact);
  const rationale =
    needsDetail && compact.detailedRationale?.trim()
      ? compact.detailedRationale.trim()
      : compact.result === "supports"
        ? "clear_support"
        : compact.result === "irrelevant"
          ? "not_applicable_to_claim"
          : compact.detailedRationale?.trim() || compact.result;
  return {
    claimId: compact.claimId,
    evidenceFragmentId: compact.evidenceFragmentId,
    assessment: compact.result,
    supportedAspects:
      compact.result === "supports" || compact.result === "partially_supports"
        ? ["compact_support"]
        : [],
    unsupportedAspects: compact.unsupportedAspects,
    contradictionAspects: compact.contradictionAspects,
    temporalAlignment: compact.temporalAlignment,
    geographicAlignment: compact.geographicAlignment,
    entityAlignment: compact.entityAlignment,
    rationale,
    confidence: confidenceFromBand(compact.confidenceBand),
  };
}

export const HISTORY_PROMPT_CACHE_KEYS_V33 = {
  claimExtraction: (promptVersion: string, schemaVersion: string) =>
    `history-v33-claim-extraction-${promptVersion}-${schemaVersion}`,
  evidenceAssessment: (promptVersion: string, schemaVersion: string) =>
    `history-v33-evidence-assessment-${promptVersion}-${schemaVersion}`,
  visualSemantics: (promptVersion: string, schemaVersion: string) =>
    `history-v33-visual-semantics-${promptVersion}-${schemaVersion}`,
} as const;

export const CLAIM_EXTRACTION_STABLE_PREFIX_V33 = [
  "Extract atomic historical claim proposals from the canonical units.",
  "Never return IDs other than the supplied narrationUnitId. Never return offsets, URLs, citations, or approval fields.",
  "verbatimText must be copied exactly from one supplied unit. Separate rhetoric from factual claims.",
  "Return compact structured proposals only.",
].join("\n");

export const EVIDENCE_ASSESSMENT_STABLE_PREFIX_V33 = [
  "Assess claims only against the exact supplied fragments.",
  "Do not use outside knowledge, add IDs, sources, URLs, final statuses, or approvals.",
  "Do not repeat full claim or evidence text in the output.",
  "For clear supports, omit detailedRationale. Provide detailedRationale only for partial support, contradiction, contested, ambiguity, or low confidence.",
  "Use confidenceBand low|medium|high instead of numeric confidence.",
].join("\n");

export const VISUAL_SEMANTICS_STABLE_PREFIX_V33 = [
  "Propose one semantically defensible, beat-specific visual purpose per supplied narration unit.",
  "Do not output application IDs, claim IDs, source/evidence IDs, URLs, offsets, approval states, or unsupported factual precision.",
  "Prefer no generated visual when evidence is inadequate.",
].join("\n");
