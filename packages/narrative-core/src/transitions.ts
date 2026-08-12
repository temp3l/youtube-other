import type { NarrativeRevisionStatus } from "./revision.js";

const ALLOWED_TRANSITIONS: Readonly<
  Record<NarrativeRevisionStatus, readonly NarrativeRevisionStatus[]>
> = {
  DRAFT: ["VALIDATED", "REJECTED"],
  VALIDATED: ["QA_APPROVED", "REJECTED"],
  QA_APPROVED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["SUPERSEDED"],
  SUPERSEDED: [],
  REJECTED: [],
};

export function canTransitionRevisionStatus(
  from: NarrativeRevisionStatus,
  to: NarrativeRevisionStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertRevisionStatusTransition(
  from: NarrativeRevisionStatus,
  to: NarrativeRevisionStatus
): void {
  if (!canTransitionRevisionStatus(from, to)) {
    throw new Error(
      `Invalid narrative revision transition: ${from} -> ${to}`
    );
  }
}
