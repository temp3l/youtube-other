import { createHash } from "node:crypto";

import {
  HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE,
  extractCandidateGapInventoryV36,
  type CandidateGapInventoryRecordV36,
} from "./candidate-gap-inventory-v36.js";
import type { RepresentativeNativeExperimentRunV36 } from "./native-structured-claim-experiment-v36.js";

export const phase211GapOutcomeValuesV36 = [
  "DIRECT_PROJECTION_READY",
  "STILL_NEEDS_NATIVE_STRUCTURE",
  "PARTICIPANT_RESOLUTION_REQUIRED",
  "ASSERTION_OR_MODALITY_BLOCK",
  "CROSS_CLAIM_PROOF_REQUIRED",
  "TAXONOMY_CHANGE_REQUIRED",
  "INTENTIONALLY_NON_RELATIONAL",
] as const;

export type Phase211GapOutcomeV36 = (typeof phase211GapOutcomeValuesV36)[number];
export type Phase211MissingSemanticCategoryV36 =
  | "MISSING_PREDICATE"
  | "MISSING_ROLE"
  | "MISSING_PARTICIPANT"
  | "MISSING_DIRECTION"
  | "MISSING_ORDER"
  | "MISSING_LOCATION_ROLE"
  | "MISSING_OBJECTIVE_ROLE"
  | "MISSING_QUALIFIER"
  | "MISSING_ASSERTION_DETAIL"
  | "MISSING_GROUPING_STRUCTURE";

interface Phase211BaselineGapV36 {
  readonly gapId: string;
  readonly episodeId: string;
  readonly claimId: string;
  readonly sourceSpan: {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
    readonly text: string;
    readonly textHash: string;
  };
  readonly structured: {
    readonly propositionIds: readonly string[];
    readonly predicate: string;
    readonly subject: string;
    readonly object: string;
  };
  readonly atomic: {
    readonly groundingIds: readonly string[];
    readonly predicate: string;
    readonly subject: string;
    readonly object: string;
  };
  readonly missingCategories: readonly Phase211MissingSemanticCategoryV36[];
  readonly missingSemanticInformation: string;
  readonly unsafeProjectionReason: string;
  readonly minimumChange: string;
  readonly outcome: Phase211GapOutcomeV36;
}

const span = (startUtf16: number, text: string, textHash: string) => ({
  startUtf16,
  endUtf16Exclusive: startUtf16 + text.length,
  text,
  textHash,
});

/** Exact Phase 2.9 persisted-inventory inputs; only these four are in scope. */
export const phase211BaselineGapsV36: readonly Phase211BaselineGapV36[] = [
  {
    gapId: "candidate-gap-claim-256740d7c97e87c2fd1ff4cd",
    episodeId: "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
    claimId: "claim-256740d7c97e87c2fd1ff4cd",
    sourceSpan: span(2337, "Reliefs at Medinet Habu show ships, warriors, families, and battle scenes.", "42ad404f53598fbabd0b5d777e4db7066290cad34764aa4a22bc8379795072d2"),
    structured: {
      propositionIds: ["structured-proposition-d8aac2d774023468d212e994"],
      predicate: "contains-evidence-of",
      subject: "Reliefs at Medinet Habu",
      object: "ships, warriors, families, and battle scenes",
    },
    atomic: {
      groundingIds: ["grounding-e20845dcf5f591b5e1208b72"],
      predicate: "contains-evidence-of",
      subject: "Reliefs at Medinet Habu",
      object: "ships, warriors, families, and battle scenes",
    },
    missingCategories: ["MISSING_GROUPING_STRUCTURE"],
    missingSemanticInformation: "The four source-explicit evidence members were collapsed into one aggregate participant.",
    unsafeProjectionReason: "An evidence-set needs at least two typed members; splitting the aggregate at projection time would parse prose.",
    minimumChange: "Emit one native contains-evidence-of proposition per explicit list member at the canonical claim boundary.",
    outcome: "DIRECT_PROJECTION_READY",
  },
  {
    gapId: "candidate-gap-claim-318504248e85a04faa5519d6",
    episodeId: "history-youtube-history-10-video-story-pack-05-franklin-expedition",
    claimId: "claim-318504248e85a04faa5519d6",
    sourceSpan: span(1732, "Searchers found the remains of the expedition’s winter camp from 1845 to 1846 and the graves of three sailors: John Torrington, John Hartnell, and William Braine.", "aee2366e26c5c8df1a532bd278d7a404801cb2578236e157e02b8775355d32fe"),
    structured: {
      propositionIds: ["structured-proposition-84ca3483d6e730e47a165e29"],
      predicate: "contains-evidence-of",
      subject: "search findings",
      object: "graves of John Torrington, John Hartnell, and William Braine",
    },
    atomic: {
      groundingIds: ["grounding-0d229a068a866213fc5b3608"],
      predicate: "contains-evidence-of",
      subject: "search findings",
      object: "graves of John Torrington, John Hartnell, and William Braine",
    },
    missingCategories: ["MISSING_PARTICIPANT"],
    missingSemanticInformation: "The source-explicit winter-camp remains were absent as a typed companion evidence participant.",
    unsafeProjectionReason: "The one existing atom could not satisfy evidence-set cardinality without recovering the camp member from prose.",
    minimumChange: "Add the winter-camp remains as a native claim-concept proposition while preserving the grouped graves and nested names.",
    outcome: "DIRECT_PROJECTION_READY",
  },
  {
    gapId: "candidate-gap-claim-6102997fabdd9aa3492eccb4",
    episodeId: "history-youtube-history-10-video-story-pack-05-franklin-expedition",
    claimId: "claim-6102997fabdd9aa3492eccb4",
    sourceSpan: span(0, "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.", "02726f49f46f21e6ead2c4c9120136905f13eb9cb9c1f9bece3abbcb0e00e295"),
    structured: {
      propositionIds: ["structured-proposition-3d1755431cd077a8e5209187", "structured-proposition-67f0fd582b2508903494bfc1"],
      predicate: "moves-from + search-object",
      subject: "two Royal Navy ships",
      object: "Britain + Northwest Passage objective",
    },
    atomic: {
      groundingIds: ["grounding-c9ea5a3cd61ecb3aa0d7b912", "grounding-e87dd470170af8b192cde257"],
      predicate: "moves-from + search-object",
      subject: "two Royal Navy ships",
      object: "Britain + Northwest Passage objective",
    },
    missingCategories: ["MISSING_PARTICIPANT", "MISSING_LOCATION_ROLE"],
    missingSemanticInformation: "A completed movement destination participant/role is absent; the Northwest Passage is explicitly the search objective.",
    unsafeProjectionReason: "Objective is not destination, and the existing movement relation requires distinct canonical origin and destination places.",
    minimumChange: "None is source-supported in this claim; leave the native origin and intended objective semantics unchanged.",
    outcome: "STILL_NEEDS_NATIVE_STRUCTURE",
  },
  {
    gapId: "candidate-gap-claim-a6f0630762f216aee3e63456",
    episodeId: "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed",
    claimId: "claim-a6f0630762f216aee3e63456",
    sourceSpan: span(0, "In May 1588, a vast Spanish fleet sailed from Lisbon.", "1d700f580840e19a087ad9d54d3b38dd4981001b432330bc52a0c8720b61f497"),
    structured: {
      propositionIds: ["structured-proposition-18eebf6103f83724654dba91"],
      predicate: "moves-from",
      subject: "Spanish fleet",
      object: "Lisbon",
    },
    atomic: {
      groundingIds: ["grounding-7f867635db64b987ea9facde"],
      predicate: "moves-from",
      subject: "Spanish fleet",
      object: "Lisbon",
    },
    missingCategories: ["MISSING_PARTICIPANT", "MISSING_LOCATION_ROLE"],
    missingSemanticInformation: "A completed movement destination participant/role is absent from the claim.",
    unsafeProjectionReason: "The adjacent intended mission route is not a completed destination and cross-claim inference is prohibited.",
    minimumChange: "None is source-supported in this claim; retain the asserted origin-only movement atom unchanged.",
    outcome: "STILL_NEEDS_NATIVE_STRUCTURE",
  },
] as const;

export const phase211FrozenSevenV36 = {
  "candidate-gap-claim-095a61f563fa2980b636c6cc": "NEEDS_CROSS_CLAIM_PROOF",
  "candidate-gap-claim-27a228830af8714543142658": "INTENTIONALLY_NON_RELATIONAL",
  "candidate-gap-claim-7552fcb5134857307769fa18": "TAXONOMY_MISMATCH",
  "candidate-gap-claim-d97c2dd1d2ef4a18aeb04406": "ASSERTION_OR_MODALITY_BLOCK",
  "candidate-gap-claim-db26077e95258cfa59dfab83": "ASSERTION_OR_MODALITY_BLOCK",
  "candidate-gap-claim-dc974d4bfc009c22c481bf02": "ASSERTION_OR_MODALITY_BLOCK",
  "candidate-gap-claim-ee76bea77004b9d801b6630b": "INTENTIONALLY_NON_RELATIONAL",
} as const;

function countOutcomes(values: readonly Phase211GapOutcomeV36[]) {
  return Object.fromEntries(phase211GapOutcomeValuesV36.map((outcome) => [
    outcome,
    values.filter((value) => value === outcome).length,
  ]));
}

export function buildNativeStructureGapEnrichmentReviewV36(input: {
  readonly runs: readonly RepresentativeNativeExperimentRunV36[];
  readonly episodeTitles: ReadonlyMap<string, string>;
}) {
  if (phase211BaselineGapsV36.length !== 4) throw new Error("Phase 2.11 requires exactly four persisted baseline gaps.");
  const inventory = extractCandidateGapInventoryV36(input);
  const inScopeIds = new Set(phase211BaselineGapsV36.map((gap) => gap.gapId));
  const inScope = inventory.filter((record) => inScopeIds.has(record.gapId));
  if (inScope.length !== 4) throw new Error(`Phase 2.11 inventory mismatch: expected 4, received ${inScope.length}.`);
  const frozenSeven = inventory.filter((record) => !inScopeIds.has(record.gapId));
  if (frozenSeven.length !== 7 || frozenSeven.some((record) =>
    phase211FrozenSevenV36[record.gapId as keyof typeof phase211FrozenSevenV36] !== record.classification
  )) throw new Error("The seven out-of-scope candidate gaps changed classification or identity.");

  const cases = phase211BaselineGapsV36.map((baseline) => {
    const current = inScope.find((record) => record.gapId === baseline.gapId)!;
    const run = input.runs.find((item) => item.episodeId === baseline.episodeId)!;
    const envelope = run.native.structuredClaims.envelopes.find((item) => item.claimId === baseline.claimId)!;
    const atoms = run.native.grounding.propositions.filter((item) => item.claimId === baseline.claimId);
    const sourceLineage = atoms.map((atom) => ({
      atomicGroundingId: atom.groundingId,
      structuredPropositionId: atom.provenance.structuredPropositionId,
      sourceSpan: atom.sourceSpan,
      sourceKind: atom.provenance.sourceKind,
    }));
    return {
      ...baseline,
      episodeTitle: current.episodeTitle,
      before: { structured: baseline.structured, atomic: baseline.atomic, missingSemantics: baseline.missingSemanticInformation },
      after: {
        structuredPropositions: envelope.propositions.map((proposition) => ({
          propositionId: proposition.propositionId,
          predicate: proposition.predicate,
          subject: proposition.subject,
          object: proposition.object ?? null,
          roles: proposition.roles,
          qualifiers: proposition.qualifiers ?? [],
          assertionStatus: proposition.assertionStatus,
          sourceSpan: proposition.sourceSpan,
          provenance: proposition.provenance,
        })),
        atomicGrounding: atoms,
      },
      postEnrichmentClassification: baseline.outcome,
      candidateProjectionReady: baseline.outcome === "DIRECT_PROJECTION_READY",
      proposedTargetRelationKind: baseline.outcome === "DIRECT_PROJECTION_READY" ? "evidence-set" : null,
      proposedDirectMapping: baseline.outcome === "DIRECT_PROJECTION_READY"
        ? { subject: "shared atomic.subject", evidence: "distinct unordered atomic.object set" }
        : null,
      sourceLineage,
    };
  });

  const readiness = cases.filter((item) => item.candidateProjectionReady).map((item) => ({
    gapId: item.gapId,
    atomicPredicateShape: "two-or-more asserted contains-evidence-of atoms with one shared resolved subject and distinct resolved objects",
    targetExistingRelationKind: "evidence-set",
    participantMapping: { subject: "shared atomic.subject", evidence: "canonical unordered atomic.object set" },
    directionOrderRule: "subject is the evidence target; evidence objects are unordered",
    assertionRule: "every atom is asserted",
    cardinalityRule: "one shared subject and at least two distinct objects",
    sourceLineage: item.sourceLineage,
    negativeControls: [
      "no prose parsing or aggregate-list splitting",
      "no cross-claim composition",
      "nested proper names remain grouped under their source-backed evidence member",
      "no non-asserted promotion",
    ],
    proposedFutureProjectorRuleName: HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE,
  }));

  const outcomeCounts = countOutcomes(cases.map((item) => item.postEnrichmentClassification));
  return {
    inventory,
    cases,
    readiness,
    outcomeCounts,
    frozenSeven: frozenSeven.map((record) => ({ gapId: record.gapId, classification: record.classification })),
    deterministicHash: createHash("sha256").update(JSON.stringify({ cases, readiness, outcomeCounts })).digest("hex"),
  };
}

export function phase211InventoryRecordV36(
  records: readonly CandidateGapInventoryRecordV36[],
  gapId: string
): CandidateGapInventoryRecordV36 {
  const record = records.find((item) => item.gapId === gapId);
  if (!record) throw new Error(`Missing Phase 2.11 inventory record ${gapId}.`);
  return record;
}
