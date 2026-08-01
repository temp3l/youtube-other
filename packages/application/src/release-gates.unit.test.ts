import { describe, expect, it } from "vitest";

import {
  PILOT_RELEASE_GATES,
  advertisedCapabilityCells,
  assessPilotGateEvidence,
  type ReleaseGateEvidenceRecord,
} from "./release-gates.js";

const digest = "a".repeat(64);

function evidence(
  gate: (typeof PILOT_RELEASE_GATES)[number],
  overrides: Partial<ReleaseGateEvidenceRecord> = {}
): ReleaseGateEvidenceRecord {
  return {
    evidenceId: `evidence-${gate}`,
    gate,
    outcome: "passed",
    verifiedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    provenanceSha256: digest,
    ...overrides,
  };
}

describe("evidence-backed API release gates", () => {
  it("requires a current provenance-bound pass for every pilot gate", () => {
    const records = PILOT_RELEASE_GATES.map((gate) => evidence(gate));
    expect(
      assessPilotGateEvidence({
        records,
        now: new Date("2026-08-15T00:00:00.000Z"),
      })
    ).toEqual({
      eligible: true,
      missing: [],
      expired: [],
      invalidEvidenceIds: [],
    });

    const failed = records.map((record) =>
      record.gate === "objectStorage"
        ? evidence("objectStorage", {
            evidenceId: "evidence-object-storage-failure",
            outcome: "failed",
            verifiedAt: "2026-08-10T00:00:00.000Z",
          })
        : record
    );
    expect(
      assessPilotGateEvidence({
        records: failed,
        now: new Date("2026-08-15T00:00:00.000Z"),
      })
    ).toMatchObject({ eligible: false, missing: ["objectStorage"] });
  });

  it("keeps expired or malformed evidence closed and filters advertised cells", () => {
    const current = evidence("educationProviderFree", {
      evidenceId: "evidence-current",
    });
    const expired = evidence("controlledProviderSmoke", {
      evidenceId: "evidence-expired",
      expiresAt: "2026-08-02T00:00:00.000Z",
    });
    const malformed = evidence("tenantIsolation", {
      evidenceId: "evidence-malformed",
      provenanceSha256: "not-a-digest",
    });
    expect(
      assessPilotGateEvidence({
        records: [current, expired, malformed],
        now: new Date("2026-08-15T00:00:00.000Z"),
      })
    ).toMatchObject({
      eligible: false,
      expired: ["controlledProviderSmoke"],
      invalidEvidenceIds: ["evidence-malformed"],
    });
    expect(
      advertisedCapabilityCells({
        records: [current, expired],
        now: new Date("2026-08-15T00:00:00.000Z"),
        cells: [
          {
            profile: "mathematics_education",
            locale: "en",
            variant: "full",
            preset: "standard",
            evidenceIds: ["evidence-current"],
          },
          {
            profile: "mathematics_education",
            locale: "de",
            variant: "full",
            preset: "standard",
            evidenceIds: ["evidence-expired"],
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({ locale: "en", variant: "full" }),
    ]);
  });
});
