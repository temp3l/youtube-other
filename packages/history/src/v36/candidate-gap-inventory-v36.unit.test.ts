import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  candidateGapClassificationValuesV36,
  candidateGapInventoryHashV36,
  candidateGapInventoryRecordSchemaV36,
  extractCandidateGapInventoryV36,
  summarizeCandidateGapInventoryV36,
} from "./candidate-gap-inventory-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "./native-structured-claim-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";

async function loadRepresentative(fragment: string) {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return {
    title: String(plan.title ?? episodeId),
    source: {
      shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
      native: { episodeId, claims: structured.claims, entities: structured.entities },
    },
  };
}

describe("History V3.6 candidate gap inventory after Phase 2.12 evidence-set projection", () => {
  it("reconciles the remaining same-eight claim-scoped gaps after the approved projection", async () => {
    const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadRepresentative));
    const experiment = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
    const records = extractCandidateGapInventoryV36({
      runs: experiment.runs,
      episodeTitles: new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title])),
    });
    expect(experiment.missClassification.atomicGroundingPresentCandidateProjectionGap).toBe(9);
    expect(records).toHaveLength(9);
    expect(records.map((record) => record.gapId)).toEqual([
      "candidate-gap-claim-095a61f563fa2980b636c6cc",
      "candidate-gap-claim-27a228830af8714543142658",
      "candidate-gap-claim-6102997fabdd9aa3492eccb4",
      "candidate-gap-claim-7552fcb5134857307769fa18",
      "candidate-gap-claim-a6f0630762f216aee3e63456",
      "candidate-gap-claim-d97c2dd1d2ef4a18aeb04406",
      "candidate-gap-claim-db26077e95258cfa59dfab83",
      "candidate-gap-claim-dc974d4bfc009c22c481bf02",
      "candidate-gap-claim-ee76bea77004b9d801b6630b",
    ]);
    for (const record of records) expect(candidateGapInventoryRecordSchemaV36.parse(record)).toEqual(record);
  });

  it("has exhaustive primary classifications and a deterministic eligible-rule summary", async () => {
    const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadRepresentative));
    const first = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
    const second = runRepresentativeNativeStructuredClaimExperimentV36(loaded.map((item) => item.source));
    const titles = new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title]));
    const records = extractCandidateGapInventoryV36({ runs: first.runs, episodeTitles: titles });
    expect(candidateGapInventoryHashV36(records)).toBe(candidateGapInventoryHashV36(extractCandidateGapInventoryV36({ runs: second.runs, episodeTitles: titles })));
    const summary = summarizeCandidateGapInventoryV36(records);
    expect(Object.keys(summary.classificationCounts)).toEqual(candidateGapClassificationValuesV36);
    expect(summary.classificationCounts).toEqual({
      DIRECT_PROJECTION_ELIGIBLE: 0,
      NEEDS_ADDITIONAL_NATIVE_STRUCTURE: 2,
      NEEDS_CROSS_CLAIM_PROOF: 1,
      PARTICIPANT_RESOLUTION_GAP: 0,
      ASSERTION_OR_MODALITY_BLOCK: 3,
      TAXONOMY_MISMATCH: 1,
      INTENTIONALLY_NON_RELATIONAL: 2,
      VALIDATOR_CONTRACT_MISMATCH: 0,
    });
    expect(summary.projectorRules).toEqual([]);
  });
});
