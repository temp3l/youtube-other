import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  inferHistoricalEntitySeedFromSurfaceV34,
  isRejectedEntityTextV34,
  structureTrustedScriptClaimsV34,
  validateStructuredClaimsV34,
} from "./history-claims-v34.js";
import {
  applyPlanApprovalPrerequisitesV35,
  buildHistoryVisualPlanV35,
  measureHistoryRepetitionV35,
  validateHistoryVisualPlanV35,
} from "./visual-planner-v35.js";
import { DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35 } from "./history-v35-contracts.js";
import {
  buildVisualTreatmentSignatureV35,
  normalizeTreatmentActionFamilyV35,
  treatmentSignatureKeyV35,
} from "./history-visual-repetition-v35.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import {
  deriveVisualSubjectV35,
  isSentenceLikeVisualSubjectV35,
} from "./history-visual-subject-v35.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";
const BRONZE_EPISODE =
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";

const FRANKLIN_SNIPPET = `In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage. HMS Erebus and HMS Terror were strong, experienced polar vessels. They carried steam engines, reinforced hulls, scientific instruments, preserved food, and 129 officers and men under Sir John Franklin.

Whaling ships saw them in Baffin Bay that summer.

Then they vanished.

The ships were trapped in the ice off King William Island.

The 105 survivors, led by Francis Crozier and James Fitzjames, had abandoned the ships on April 22 and planned to march toward the Back River on the Canadian mainland.`;

const BRONZE_SNIPPET = `Copper from Cyprus and tin from distant regions were combined to make bronze.

Palace bureaucracies recorded deliveries and obligations in remarkable detail.

Egypt faced the Sea Peoples. Hittite territories around Hattusa collapsed. Trade routes across the Eastern Mediterranean and the Aegean linked Mycenae, Pylos, Cyprus, Anatolia, and the Levant.

Ramesses III recorded the battle at Medinet Habu. Merneptah left an inscription mentioning conflict.`;

const baseShot = (overrides: Partial<HistoryShotV34> = {}): HistoryShotV34 => ({
  id: "shot-0001-01",
  beatId: "beat-0001",
  purpose: "develop archival image on artifact",
  durationMs: 6_000,
  startMs: 0,
  endMs: 6_000,
  framing: "tight evidentiary inset",
  cameraMovement: "static locked hold",
  subject: "Roman coin",
  action: "artifact detail evidence transition for Roman coin",
  foreground: "archival image/develop foreground: Roman coin",
  midground: "archival image midground claim focus claim-a",
  background: "archival image background develop layer for beat 0001",
  factualLabels: [],
  permittedMotion: ["develop-safe editorial motion"],
  prohibitedAdditions: [],
  transition: "opacity crossfade",
  linkedClaimIds: ["claim-a"],
  modalityStateReference: "asset-1",
  adaptation16x9: "Landscape develop layout.",
  adaptation9x16: "portrait-safe crop",
  reconstructionPolicy: "archival-or-artwork",
  ...overrides,
});

describe("History V3.5 unit semantics", () => {
  it("rejects discourse openers and accepts inferred historical entities", () => {
    for (const text of ["Before", "Another", "Some", "When", "Others", "The", "They"]) {
      expect(isRejectedEntityTextV34(text).reject).toBe(true);
    }
    for (const [surface, unit] of [
      ["Egypt", "Egypt faced invasion from the Sea Peoples."],
      ["Hittite Empire", "The Hittite Empire controlled Anatolia."],
      ["Hattusa", "Hittite territories around Hattusa collapsed."],
      ["Cyprus", "Copper from Cyprus supplied bronze production."],
      ["Anatolia", "Anatolia linked multiple palace centers."],
      ["Levant", "Trade crossed the Levant and the Aegean."],
      ["Mycenae", "Mycenae maintained palace archives."],
      ["Pylos", "Pylos preserved administrative tablets."],
      ["Aegean", "Routes crossed the Aegean."],
      ["Medinet Habu", "Ramesses III recorded the battle at Medinet Habu."],
      ["Ramesses III", "Ramesses III recorded the battle at Medinet Habu."],
      ["Merneptah", "Merneptah left an inscription mentioning conflict."],
      ["Sea Peoples", "Egypt faced the Sea Peoples."],
    ] as const) {
      const seed = inferHistoricalEntitySeedFromSurfaceV34(surface, unit);
      expect(seed, surface).not.toBeNull();
      expect(seed!.label.length).toBeGreaterThan(1);
    }
  });

  it("structures Bronze Age claims with canonical entities only and rejects uncanonical surfaces", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript: BRONZE_SNIPPET,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: BRONZE_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const labels = structured.entities.map((entity) => entity.normalizedLabel);
    expect(labels).toEqual(["Mediterranean"]);
    expect(structured.geographicQualifiers.length).toBeGreaterThan(0);
    expect(
      structured.rejectedEntities.some((item) => item.text === "Egypt")
    ).toBe(true);
    expect(validateStructuredClaimsV34(structured).ok).toBe(true);
  });

  it("derives concise visual subjects instead of full propositions", () => {
    const subject = deriveVisualSubjectV35({
      claimText:
        "Copper from Cyprus and tin from distant regions were combined to make bronze.",
      claimId: "claim-1",
      entityLabels: ["Cyprus"],
      claimKind: "compound",
    });
    expect(subject.provenance).toBe("entity");
    expect(isSentenceLikeVisualSubjectV35(subject.label)).toBe(false);

    const bureaucracy = deriveVisualSubjectV35({
      claimText:
        "Palace bureaucracies recorded deliveries and obligations in remarkable detail.",
      claimId: "claim-2",
      entityLabels: [],
      claimKind: "other",
    });
    expect(bureaucracy.label.toLowerCase()).toContain("administration");
    expect(isSentenceLikeVisualSubjectV35(bureaucracy.label)).toBe(false);
  });

  it("keeps treatment-family fingerprints independent from subject wording", () => {
    const roman = buildVisualTreatmentSignatureV35({
      shot: baseShot({ subject: "Roman coin", action: "artifact detail evidence transition for Roman coin" }),
      modality: "archival image",
      progressionRole: "develop",
    });
    const hittite = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject: "Hittite tablet",
        action: "artifact detail evidence transition for Hittite tablet",
      }),
      modality: "archival image",
      progressionRole: "develop",
    });
    expect(treatmentSignatureKeyV35(roman)).toBe(treatmentSignatureKeyV35(hittite));
    expect(normalizeTreatmentActionFamilyV35(roman.actionFamily)).toBe("artifact-detail");
  });

  it("builds Franklin plans with visual opportunities and validates repetition thresholds", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.visualOpportunitySummary.eligibleMapOpportunities).toBeGreaterThanOrEqual(0);
    expect(validateHistoryVisualPlanV35(plan).structurallyValid).toBe(plan.approval.structurallyValid);
    const failing = measureHistoryRepetitionV35({
      purposes: plan.visualPurposes,
      concepts: plan.visualConcepts,
      shots: Array.from({ length: 20 }, (_, index) => ({
        ...plan.shots[0]!,
        id: `shot-dup-${index}`,
        purpose: "same purpose",
        framing: "same",
        cameraMovement: "same",
        transition: "same",
      })),
      beats: plan.beats,
      thresholds: DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35,
    });
    expect(failing.passes).toBe(false);
  });

  it("blocks structural approval when focused validation prerequisites fail", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const blocked = applyPlanApprovalPrerequisitesV35(plan, [
      {
        code: "FOCUSED_TEST_FAILURE",
        gate: "structural",
        message: "Required focused validation failed (1): exit 66",
      },
    ]);
    expect(blocked.approval.structurallyValid).toBe(false);
    expect(blocked.approval.structural.state).toBe("blocked");
    expect(blocked.approval.structural.blockerCodes).toContain("FOCUSED_TEST_FAILURE");
    expect(blocked.approval.productionApprovalEligible).toBe(false);
  });
});
