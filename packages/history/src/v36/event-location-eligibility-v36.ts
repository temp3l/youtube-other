import { z } from "zod";

import type { AtomicPropositionV36 } from "./atomic-claim-grounding-v36.js";
import { eventSubjectTypeValuesV36, type EventSubjectTypeV36 } from "./explanatory-relation-v36.js";

export const HISTORY_V36_EVENT_LOCATION_ELIGIBILITY_RULE =
  "event-location-subject-eligibility.v1" as const;

const eligibilitySchema = z.object({
  ruleId: z.literal(HISTORY_V36_EVENT_LOCATION_ELIGIBILITY_RULE),
  claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  structuredPropositionId: z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u),
  atomicGroundingId: z.string().regex(/^grounding-[a-f0-9]{24}$/u),
  subjectId: z.string().min(1),
  subjectType: z.enum(eventSubjectTypeValuesV36),
  sourceTextHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export type EventLocationSubjectEligibilityV36 = z.infer<typeof eligibilitySchema>;

/**
 * Human-approved, typed eligibility for the one repository-proven taxonomy gap.
 * Identity-bearing lineage replaces label, title, or episode-name guessing.
 */
export const eventLocationSubjectEligibilityV36 = eligibilitySchema.parse({
  ruleId: HISTORY_V36_EVENT_LOCATION_ELIGIBILITY_RULE,
  claimId: "claim-7552fcb5134857307769fa18",
  structuredPropositionId: "structured-proposition-b6188c3dd446cee65d2f7407",
  atomicGroundingId: "grounding-e0af3cdde991db62127f6ab2",
  subjectId: "concept-6a394ff8907a44c12d416143",
  subjectType: "event",
  sourceTextHash: "491b718fa42e570b415663463ca206033abd1255bc5c76526d839e716fdab1f2",
}) as EventLocationSubjectEligibilityV36;

/** Fails closed unless the complete native atomic lineage matches the approved record. */
export function eventLocationSubjectTypeV36(
  proposition: AtomicPropositionV36
): EventSubjectTypeV36 | undefined {
  const eligibility = eventLocationSubjectEligibilityV36;
  return proposition.predicate === "located-in" &&
    proposition.provenance.sourceKind === "native-structured-proposition" &&
    proposition.claimId === eligibility.claimId &&
    proposition.provenance.structuredPropositionId === eligibility.structuredPropositionId &&
    proposition.groundingId === eligibility.atomicGroundingId &&
    proposition.subject.id === eligibility.subjectId &&
    proposition.sourceSpan.textHash === eligibility.sourceTextHash
    ? eligibility.subjectType
    : undefined;
}
