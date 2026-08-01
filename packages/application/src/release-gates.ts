export interface ReleaseGateEvidence {
  readonly educationProviderFree: boolean;
  readonly controlledProviderSmoke: boolean;
  readonly tenantIsolation: boolean;
  readonly objectStorage: boolean;
  readonly webhooks: boolean;
  readonly quotasAndAudit: boolean;
  readonly publicationReconciliation: boolean;
  readonly operationalRunbooks: boolean;
}

export const PILOT_RELEASE_GATES = [
  "educationProviderFree",
  "controlledProviderSmoke",
  "tenantIsolation",
  "objectStorage",
  "webhooks",
  "quotasAndAudit",
  "publicationReconciliation",
  "operationalRunbooks",
] as const satisfies readonly (keyof ReleaseGateEvidence)[];

export type PilotReleaseGate = (typeof PILOT_RELEASE_GATES)[number];

export interface ReleaseGateEvidenceRecord {
  readonly evidenceId: string;
  readonly gate: PilotReleaseGate;
  readonly outcome: "passed" | "failed";
  readonly verifiedAt: string;
  readonly expiresAt: string;
  readonly provenanceSha256: string;
}

export interface CapabilityEvidenceCell {
  readonly profile: "dark_truth" | "mathematics_education";
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly preset: string;
  readonly evidenceIds: readonly string[];
}

export interface ReleaseGateEvidenceAssessment {
  readonly eligible: boolean;
  readonly missing: readonly PilotReleaseGate[];
  readonly expired: readonly PilotReleaseGate[];
  readonly invalidEvidenceIds: readonly string[];
}

export function assessPilotGate(evidence: ReleaseGateEvidence): { readonly eligible: boolean; readonly missing: readonly (keyof ReleaseGateEvidence)[] } {
  const missing = PILOT_RELEASE_GATES.filter((key) => !evidence[key]);
  return { eligible: missing.length === 0, missing };
}

const evidenceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function timestamp(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function validEvidenceRecord(record: ReleaseGateEvidenceRecord): boolean {
  const verifiedAt = timestamp(record.verifiedAt);
  const expiresAt = timestamp(record.expiresAt);
  return (
    evidenceIdPattern.test(record.evidenceId) &&
    sha256Pattern.test(record.provenanceSha256) &&
    verifiedAt !== null &&
    expiresAt !== null &&
    expiresAt > verifiedAt
  );
}

/**
 * Evaluates immutable evidence references rather than operator-supplied booleans.
 * A later failure overrides an earlier pass; expired passes keep the gate closed.
 */
export function assessPilotGateEvidence(input: {
  readonly records: readonly ReleaseGateEvidenceRecord[];
  readonly now: Date;
}): ReleaseGateEvidenceAssessment {
  const invalidEvidenceIds = input.records
    .filter((record) => !validEvidenceRecord(record))
    .map((record) => record.evidenceId)
    .sort();
  const valid = input.records.filter(validEvidenceRecord);
  const missing: PilotReleaseGate[] = [];
  const expired: PilotReleaseGate[] = [];
  for (const gate of PILOT_RELEASE_GATES) {
    const latest = valid
      .filter((record) => record.gate === gate)
      .sort((left, right) =>
        new Date(right.verifiedAt).getTime() -
        new Date(left.verifiedAt).getTime()
      )[0];
    if (!latest || latest.outcome !== "passed") {
      missing.push(gate);
    } else if (new Date(latest.expiresAt) <= input.now) {
      expired.push(gate);
    }
  }
  return {
    eligible:
      missing.length === 0 &&
      expired.length === 0 &&
      invalidEvidenceIds.length === 0,
    missing,
    expired,
    invalidEvidenceIds,
  };
}

/** Returns only matrix cells whose exact evidence references are current passes. */
export function advertisedCapabilityCells(input: {
  readonly cells: readonly CapabilityEvidenceCell[];
  readonly records: readonly ReleaseGateEvidenceRecord[];
  readonly now: Date;
}): readonly CapabilityEvidenceCell[] {
  const currentPasses = new Set(
    input.records
      .filter(
        (record) =>
          validEvidenceRecord(record) &&
          record.outcome === "passed" &&
          new Date(record.expiresAt) > input.now
      )
      .map((record) => record.evidenceId)
  );
  return input.cells.filter(
    (cell) =>
      cell.evidenceIds.length > 0 &&
      cell.evidenceIds.every((evidenceId) => currentPasses.has(evidenceId))
  );
}
