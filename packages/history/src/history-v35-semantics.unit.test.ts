import { describe, expect, it } from "vitest";
import {
  compareTemporalBoundsV35,
  isChronologicallyOrderedV35,
  normalizeTemporalBoundsV35,
} from "./history-temporal-v35.js";
import {
  isCinematicCameraMovementV35,
  isTemplatedArchivalPurposeV35,
  normalizeVisualConceptFingerprintV35,
  portraitAdaptationNotesV35,
  resolveHistoricalApprovalStateV35,
  validatePortraitProtectedGeographyV35,
} from "./history-visual-semantics-v35.js";
import { FIXED_AUDIT_PLACEHOLDER_ISO, normalizeTrustedAttestationTimestampsV34 } from "./history-visual-semantics-v34.js";
import { createTrustedNarrationAttestationV1 } from "./history-trusted-script-v33.js";
import { PORTRAIT_REFRAME_LABEL_V35 } from "./history-v35-contracts.js";

describe("History V3.5 semantics", () => {
  it("orders temporals chronologically using normalized bounds", () => {
    const oct1347 = normalizeTemporalBoundsV35({ normalizedValue: "October 1347" });
    const early1350s = normalizeTemporalBoundsV35({ normalizedValue: "early 1350s" });
    const between235284 = normalizeTemporalBoundsV35({
      normalizedValue: "Between 235 and 284",
    });
    const year476 = normalizeTemporalBoundsV35({ normalizedValue: "476" });
    const may1845 = normalizeTemporalBoundsV35({ normalizedValue: "May 1845" });
    const april1848 = normalizeTemporalBoundsV35({ normalizedValue: "April 1848" });
    expect(compareTemporalBoundsV35(oct1347, early1350s)).toBeLessThan(0);
    expect(compareTemporalBoundsV35(year476, between235284)).toBeGreaterThan(0);
    expect(isChronologicallyOrderedV35([may1845, april1848]).status).toBe("valid");
    expect(isChronologicallyOrderedV35([april1848, may1845]).status).toBe("invalid");
    expect(isChronologicallyOrderedV35([oct1347, early1350s]).status).toBe("ambiguous");
  });

  it("detects templated archival purposes despite different narration", () => {
    const left =
      'Support "HMS Erebus sailed north" with period-appropriate imagery grounded in the narration.';
    const right =
      'Support "Napoleon crossed the Niemen" with period-appropriate imagery grounded in the narration.';
    expect(isTemplatedArchivalPurposeV35(left)).toBe(true);
    expect(isTemplatedArchivalPurposeV35(right)).toBe(true);
    expect(normalizeVisualConceptFingerprintV35(left)).toBe(
      normalizeVisualConceptFingerprintV35(right)
    );
  });

  it("excludes portrait reframing from cinematic camera movement", () => {
    expect(isCinematicCameraMovementV35("gentle lateral drift")).toBe(true);
    expect(isCinematicCameraMovementV35("vertical reframe for portrait continuity")).toBe(
      false
    );
    expect(portraitAdaptationNotesV35("map")).toContain(PORTRAIT_REFRAME_LABEL_V35);
  });

  it("blocks portrait plans that remove protected geography", () => {
    const failures = validatePortraitProtectedGeographyV35({
      ratio: "9:16",
      protectedLabels: ["Moscow", "Northwest Passage"],
      retainedLabels: ["Britain"],
      removedLabels: ["Moscow", "Northwest Passage"],
    });
    expect(failures).toContain("PORTRAIT_PROTECTED_GEOGRAPHY_REMOVED:Moscow");
    expect(failures).toContain("PORTRAIT_PROTECTED_GEOGRAPHY_REMOVED:Northwest Passage");
  });

  it("historical approval false blocks production approval for non-trusted authority", () => {
    const unresolved = resolveHistoricalApprovalStateV35({
      authorityMode: "research-backed",
      attestation: null,
      independentlyVerifiedCount: 0,
    });
    expect(unresolved.productionHistoricalApprovalEligible).toBe(false);
    expect(unresolved.historicalApprovalState).toBe("unattested");
    expect(unresolved.humanHistoricalAttestationRequired).toBe(false);
  });

  it("trusted-script without human attestation does not require named historical approval", () => {
    const state = resolveHistoricalApprovalStateV35({
      authorityMode: "trusted-script",
      attestation: null,
      independentlyVerifiedCount: 0,
    });
    expect(state.productionHistoricalApprovalEligible).toBe(true);
    expect(state.historicalApprovalState).toBe("trusted_input");
    expect(state.attestationBound).toBe(false);
    expect(state.attestationActor).toBeNull();
    expect(state.attestationTimestamp).toBeNull();
    expect(state.humanHistoricalAttestationRequired).toBe(false);
  });

  it("valid explicit attestation enables trusted production historical approval", () => {
    const attestation = createTrustedNarrationAttestationV1({
      episodeId: "episode-1",
      narrationHash: "abc".repeat(22).slice(0, 64),
      authorityName: "Editor Name",
      assertedAt: "2026-08-07T12:00:00.000Z",
    });
    const state = resolveHistoricalApprovalStateV35({
      authorityMode: "trusted-script",
      attestation,
      independentlyVerifiedCount: 0,
    });
    expect(state.productionHistoricalApprovalEligible).toBe(true);
    expect(state.historicalApprovalState).toBe("explicit_human_attestation");
  });

  it("sentinel timestamp deserializes as absence", () => {
    const normalized = normalizeTrustedAttestationTimestampsV34({
      assertedAt: FIXED_AUDIT_PLACEHOLDER_ISO,
      timestampStatus: "recorded",
    });
    expect(normalized.assertedAt).toBeNull();
    expect(normalized.timestampStatus).toBe("not-recorded");
  });
});
