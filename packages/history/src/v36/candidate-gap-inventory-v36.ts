import { createHash } from "node:crypto";

import { z } from "zod";

import type { RepresentativeNativeExperimentRunV36 } from "./native-structured-claim-experiment-v36.js";

export const candidateGapClassificationValuesV36 = [
  "DIRECT_PROJECTION_ELIGIBLE",
  "NEEDS_ADDITIONAL_NATIVE_STRUCTURE",
  "NEEDS_CROSS_CLAIM_PROOF",
  "PARTICIPANT_RESOLUTION_GAP",
  "ASSERTION_OR_MODALITY_BLOCK",
  "TAXONOMY_MISMATCH",
  "INTENTIONALLY_NON_RELATIONAL",
  "VALIDATOR_CONTRACT_MISMATCH",
] as const;

export type CandidateGapClassificationV36 =
  (typeof candidateGapClassificationValuesV36)[number];

export const HISTORY_V36_TRANSFORMS_CAUSAL_CANDIDATE_RULE =
  "atomic-transforms-causal-candidate.v1" as const;
export const HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE =
  "atomic-contains-evidence-of-evidence-set-candidate.v1" as const;

interface GapDispositionV36 {
  readonly claimId: string;
  readonly primaryAtomicGroundingId: string;
  readonly primaryStructuredPropositionId: string;
  readonly classification: CandidateGapClassificationV36;
  readonly expectedRelationFamily: string | null;
  readonly reason: string;
  readonly proposedFutureProjectorRule:
    | typeof HISTORY_V36_TRANSFORMS_CAUSAL_CANDIDATE_RULE
    | typeof HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE
    | null;
  readonly manualReviewRequired: boolean;
  readonly secondaryNote?: string;
  readonly currentRejectionMeaning: string;
}

/**
 * The Phase 2.8 metric is deliberately claim-scoped. These frozen dispositions
 * are matched only to remaining gaps in the recreated same-eight run; no prose
 * classification occurs.
 */
const frozenDispositionsV36: readonly GapDispositionV36[] = [
  {
    claimId: "claim-256740d7c97e87c2fd1ff4cd",
    primaryAtomicGroundingId: "grounding-dc5bf14670d6ce62aca1395c",
    primaryStructuredPropositionId: "structured-proposition-962c8f67f82aede2f13baf6e",
    classification: "DIRECT_PROJECTION_ELIGIBLE",
    expectedRelationFamily: "evidence-set",
    reason: "Four asserted source-explicit evidence members now share one evidence target and can lower directly as one evidence-set without prose parsing.",
    proposedFutureProjectorRule: HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE,
    manualReviewRequired: true,
    currentRejectionMeaning: "No candidate exists because Phase 2.11 deliberately stops before adding the now-mechanical evidence-set projector.",
  },
  {
    claimId: "claim-095a61f563fa2980b636c6cc",
    primaryAtomicGroundingId: "grounding-708cc4b83201d0b8ca6971d0",
    primaryStructuredPropositionId: "structured-proposition-535f3073a6991e6b2dd28f3c",
    classification: "NEEDS_CROSS_CLAIM_PROOF",
    expectedRelationFamily: "policy-response",
    reason: "The atom supplies an attempted response but no explicit condition. The required labor-pressure condition is in another claim.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    secondaryNote: "The attempted assertion status must remain preserved if composition is ever considered.",
    currentRejectionMeaning: "The current single-claim policy-response candidate is rejected as ambiguous; a direct projector would only move this case to rejection.",
  },
  {
    claimId: "claim-445b50b1c542e5143f87efe0",
    primaryAtomicGroundingId: "grounding-9b108be90c3ba4812c0c5a57",
    primaryStructuredPropositionId: "structured-proposition-c94a284dea3fd38027179971",
    classification: "DIRECT_PROJECTION_ELIGIBLE",
    expectedRelationFamily: "causal",
    reason: "The asserted transforms atom has complete directed subject-to-object semantics and can lower one-to-one to causal without additional interpretation.",
    proposedFutureProjectorRule: HISTORY_V36_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
    manualReviewRequired: false,
    currentRejectionMeaning: "No candidate currently exists. The existing validator accepts causal propositions with the same directed concept shape, so this is not a reject-only projector.",
  },
  {
    claimId: "claim-ee76bea77004b9d801b6630b",
    primaryAtomicGroundingId: "grounding-c4182f8b9ed22ee176e88e92",
    primaryStructuredPropositionId: "structured-proposition-1df667e0e11400eb4dfe13fe",
    classification: "INTENTIONALLY_NON_RELATIONAL",
    expectedRelationFamily: null,
    reason: "A contingent demand is a single action/objective, not an explanatory relation represented by the accepted taxonomy.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    secondaryNote: "Assertion status is uncertain, reinforcing the decision not to promote it.",
    currentRejectionMeaning: "No direct candidate should be created.",
  },
  {
    claimId: "claim-318504248e85a04faa5519d6",
    primaryAtomicGroundingId: "grounding-0d229a068a866213fc5b3608",
    primaryStructuredPropositionId: "structured-proposition-84ca3483d6e730e47a165e29",
    classification: "DIRECT_PROJECTION_ELIGIBLE",
    expectedRelationFamily: "evidence-set",
    reason: "The camp remains and grouped graves are now two asserted source-explicit evidence atoms with a shared target and complete source lineage.",
    proposedFutureProjectorRule: HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE,
    manualReviewRequired: true,
    currentRejectionMeaning: "The complete atoms remain a candidate-projection gap because Phase 2.11 adds no projector.",
  },
  {
    claimId: "claim-6102997fabdd9aa3492eccb4",
    primaryAtomicGroundingId: "grounding-e87dd470170af8b192cde257",
    primaryStructuredPropositionId: "structured-proposition-3d1755431cd077a8e5209187",
    classification: "NEEDS_ADDITIONAL_NATIVE_STRUCTURE",
    expectedRelationFamily: "movement",
    reason: "The asserted atom has only an origin. Its companion search-object is an intended objective, explicitly not a movement destination.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    secondaryNote: "The same claim also contains intended search-object grounding-evidence, retained as non-destination control evidence.",
    currentRejectionMeaning: "The existing movement candidate is ambiguous; a movement projector without a canonical destination would only create a cardinality/proposition reject.",
  },
  {
    claimId: "claim-a6f0630762f216aee3e63456",
    primaryAtomicGroundingId: "grounding-7f867635db64b987ea9facde",
    primaryStructuredPropositionId: "structured-proposition-18eebf6103f83724654dba91",
    classification: "NEEDS_ADDITIONAL_NATIVE_STRUCTURE",
    expectedRelationFamily: "movement",
    reason: "The asserted moves-from atom has a canonical origin but no destination or via-to-destination route shape.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "The current movement candidate is rejected for insufficient cardinality; the adjacent mission is purpose, not destination.",
  },
  {
    claimId: "claim-dc974d4bfc009c22c481bf02",
    primaryAtomicGroundingId: "grounding-a99f1a9a0cb49201b3659d1a",
    primaryStructuredPropositionId: "structured-proposition-e0c21c025ad65a9accc4575a",
    classification: "ASSERTION_OR_MODALITY_BLOCK",
    expectedRelationFamily: "movement",
    reason: "The route is explicitly intended, not completed. The relation contract has no asserted movement representation that preserves this modality.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "No direct candidate should promote an intended route to completed movement.",
  },
  {
    claimId: "claim-7552fcb5134857307769fa18",
    primaryAtomicGroundingId: "grounding-e0af3cdde991db62127f6ab2",
    primaryStructuredPropositionId: "structured-proposition-b6188c3dd446cee65d2f7407",
    classification: "TAXONOMY_MISMATCH",
    expectedRelationFamily: null,
    reason: "An intended invasion-location assertion cannot be represented exactly by spatial-area (which has no event subject) and must not be reinterpreted as movement or comparison.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "No exact accepted relation kind admits this semantic shape.",
  },
  {
    claimId: "claim-27a228830af8714543142658",
    primaryAtomicGroundingId: "grounding-76a97bbd768e806696a57986",
    primaryStructuredPropositionId: "structured-proposition-fc18dce4a64d228f5a96ae53",
    classification: "INTENTIONALLY_NON_RELATIONAL",
    expectedRelationFamily: null,
    reason: "This reported locator fact does not establish the unsupported Europe-to-England-to-King-Edward movement chain or any other explanatory relation.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "No direct candidate should be created from an isolated locator.",
  },
  {
    claimId: "claim-db26077e95258cfa59dfab83",
    primaryAtomicGroundingId: "grounding-2c03d1203b276ab1345327da",
    primaryStructuredPropositionId: "structured-proposition-dd1896c9e4cd86c1bec5fb01",
    classification: "ASSERTION_OR_MODALITY_BLOCK",
    expectedRelationFamily: "causal",
    reason: "The causal atom is reported speech. The asserted causal relation contract cannot retain that evidentiary modality.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "A projector that ignored reported status could validate a falsely asserted causal relation, so it is prohibited.",
  },
  {
    claimId: "claim-d97c2dd1d2ef4a18aeb04406",
    primaryAtomicGroundingId: "grounding-cfe00499adea25485906eb45",
    primaryStructuredPropositionId: "structured-proposition-bc3dba1a8ee93e7f275c4004",
    classification: "ASSERTION_OR_MODALITY_BLOCK",
    expectedRelationFamily: "causal",
    reason: "The contribution is uncertain. A causal relation would erase the uncertainty and must not be projected as asserted.",
    proposedFutureProjectorRule: null,
    manualReviewRequired: true,
    currentRejectionMeaning: "No direct candidate should promote uncertain contribution to asserted causality.",
  },
] as const;

export const candidateGapInventoryRecordSchemaV36 = z.object({
  gapId: z.string().regex(/^candidate-gap-claim-[a-f0-9]{24}$/u),
  episodeId: z.string().min(1),
  episodeTitle: z.string().min(1),
  claimId: z.string().regex(/^claim-[a-f0-9]{24}$/u),
  structuredPropositionId: z.string().regex(/^structured-proposition-[a-f0-9]{24}$/u),
  atomicGroundingId: z.string().regex(/^grounding-[a-f0-9]{24}$/u),
  structuredPropositionIds: z.array(z.string()).min(1),
  atomicGroundingIds: z.array(z.string()).min(1),
  structuredPredicate: z.string().min(1),
  atomicPredicate: z.string().min(1),
  classification: z.enum(candidateGapClassificationValuesV36),
  assertionStatus: z.string().min(1),
  sourceTextHash: z.string().regex(/^[a-f0-9]{64}$/u),
  manualReviewRequired: z.boolean(),
}).passthrough();

export type CandidateGapInventoryRecordV36 = z.infer<typeof candidateGapInventoryRecordSchemaV36>;

function stableId(claimId: string): string {
  return `candidate-gap-${claimId}`;
}

function ordered<T extends { readonly groundingId?: string; readonly propositionId?: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) =>
    (left.groundingId ?? left.propositionId ?? "").localeCompare(right.groundingId ?? right.propositionId ?? ""));
}

export function extractCandidateGapInventoryV36(input: {
  readonly runs: readonly RepresentativeNativeExperimentRunV36[];
  readonly episodeTitles: ReadonlyMap<string, string>;
}): readonly CandidateGapInventoryRecordV36[] {
  const records: CandidateGapInventoryRecordV36[] = [];
  const found = new Set<string>();
  const currentGapClaimIds = new Set<string>();
  for (const run of input.runs) {
    const nativeClaimIds = new Set(run.native.structuredClaims.envelopes
      .filter((envelope) => envelope.source.kind === "existing-structured-claim")
      .map((envelope) => String(envelope.claimId)));
    const atomicCandidateClaimIds = new Set(run.native.candidates
      .filter((candidate) => ["atomic-claim-grounding", "atomic-process-projection", "atomic-temporal-projection", "atomic-transforms-causal-projection", "atomic-evidence-set-projection", "atomic-approved-modal-causal-projection", "atomic-event-location-projection", "proof-aware-relation-evidence"].includes(candidate.source))
      .map((candidate) => candidate.claimId));
    for (const claimId of nativeClaimIds) {
      const grounding = run.native.grounding.claims.find((claim) => claim.claimId === claimId);
      if (grounding?.propositions.length && !atomicCandidateClaimIds.has(claimId)) currentGapClaimIds.add(claimId);
    }
    for (const disposition of frozenDispositionsV36) {
      if (!nativeClaimIds.has(disposition.claimId) || atomicCandidateClaimIds.has(disposition.claimId)) continue;
      const claim = run.native.claims.find((item) => item.id === disposition.claimId);
      const atoms = ordered(run.native.grounding.propositions.filter((item) => item.claimId === disposition.claimId));
      const propositions = ordered(run.native.structuredClaims.envelopes
        .filter((envelope) => envelope.claimId === disposition.claimId)
        .flatMap((envelope) => envelope.propositions));
      const primaryAtom = atoms.find((item) => item.groundingId === disposition.primaryAtomicGroundingId);
      const primaryProposition = propositions.find((item) => item.propositionId === disposition.primaryStructuredPropositionId);
      if (!claim || !primaryAtom || !primaryProposition) {
        throw new Error(`Frozen Phase 2.8 provenance is incomplete for ${disposition.claimId}.`);
      }
      const rejections = run.native.candidates.filter((candidate) => candidate.claimId === disposition.claimId && candidate.status === "rejected");
      records.push(candidateGapInventoryRecordSchemaV36.parse({
        gapId: stableId(disposition.claimId),
        gapScope: "claim",
        episodeId: run.episodeId,
        episodeTitle: input.episodeTitles.get(run.episodeId) ?? run.episodeId,
        claimId: disposition.claimId,
        structuredPropositionId: primaryProposition.propositionId,
        atomicGroundingId: primaryAtom.groundingId,
        structuredPropositionIds: propositions.map((item) => item.propositionId),
        atomicGroundingIds: atoms.map((item) => item.groundingId),
        structuredPredicate: primaryProposition.predicate,
        atomicPredicate: primaryAtom.predicate,
        semanticParticipants: {
          subject: primaryAtom.subject,
          object: primaryAtom.object ?? null,
          semanticRoles: primaryProposition.roles,
          allAtomicParticipants: atoms.map((atom) => ({
            groundingId: atom.groundingId,
            predicate: atom.predicate,
            subject: atom.subject,
            object: atom.object ?? null,
          })),
        },
        assertionStatus: primaryAtom.assertionStatus,
        sourceSpan: primaryAtom.sourceSpan,
        sourceTextHash: primaryAtom.sourceSpan.textHash,
        sourceClaimExcerpt: claim.normalizedProposition.slice(0, 260),
        currentCandidateSource: rejections.map((candidate) => candidate.source),
        currentProjectionState: rejections.length
          ? "no direct atomic candidate; related candidate rejection recorded"
          : "no direct atomic candidate",
        currentCandidateRejections: rejections.map((candidate) => ({
          source: candidate.source,
          extractionRule: candidate.extractionRule,
          diagnostics: candidate.diagnostics.map((diagnostic) => diagnostic.code),
        })),
        expectedRelationFamily: disposition.expectedRelationFamily,
        classification: disposition.classification,
        reason: disposition.reason,
        secondaryNote: disposition.secondaryNote ?? null,
        proposedFutureProjectorRule: disposition.proposedFutureProjectorRule,
        manualReviewRequired: disposition.manualReviewRequired,
        candidateRejectionAnalysis: disposition.currentRejectionMeaning,
      }));
      found.add(disposition.claimId);
    }
  }
  if (records.length !== currentGapClaimIds.size || [...currentGapClaimIds].some((claimId) => !found.has(claimId))) {
    throw new Error(`Current candidate gap inventory does not reconcile: metric=${currentGapClaimIds.size}, records=${records.length}.`);
  }
  return records.sort((left, right) => left.gapId.localeCompare(right.gapId));
}

export function candidateGapInventoryHashV36(records: readonly CandidateGapInventoryRecordV36[]): string {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export const candidateGapProjectorRuleProposalsV36 = [
  {
    ruleId: HISTORY_V36_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
    targetRelationKind: "causal",
    atomicShape: { predicate: "transforms", assertionStatus: "asserted", objectRequired: true },
    participantMapping: { cause: "atomic.subject", effect: "atomic.object" },
    directionOrderRule: "subject is cause; object is effect; reversal is prohibited",
    assertionStatusRule: "asserted only",
    cardinalityRule: "exactly one distinct subject and one distinct object",
    semanticIdExpectation: "existing causal semantic identity from ordered cause/effect only",
    evidenceLineageExpectation: "one support claim, exact atomic grounding ID, exact structured proposition ID, and exact source span",
    negativeControls: [
      "co-occurrence is not relation: predicate must equal transforms",
      "purpose is not destination: no movement lowering",
      "chronology is not causality: no precedes/process-sequence lowering",
      "dependency is not causality: no depends-on lowering",
      "comparison is not movement: no compares-with lowering",
      "synthetic grouping metadata is not fact: no grouping metadata accepted",
      "assertion/intention is not completion: asserted only",
      "proper-name fragmentation: preserve canonical bindings without token splitting",
      "insufficient cardinality: distinct subject/object required",
      "direction reversal: subject-to-object order is identity-bearing",
    ],
    validatorCompatibility: {
      schemaPath: "packages/history/src/v36/explanatory-relation-v36.ts",
      validatorPath: "packages/history/src/v36/explanatory-relation-validator-v36.ts",
      result: "existing causal kind accepts two concept participants, exact grounded proposition support, deterministic semantic ID, and canonical evidence fingerprint",
    },
    recommendation: "SAFE_FOR_PHASE_2_10",
  },
  {
    ruleId: HISTORY_V36_EVIDENCE_SET_CANDIDATE_RULE,
    targetRelationKind: "evidence-set",
    atomicShape: { predicate: "contains-evidence-of", assertionStatus: "asserted", sharedSubjectRequired: true },
    participantMapping: { subject: "shared atomic.subject", evidence: "unordered distinct atomic.object set" },
    directionOrderRule: "shared subject remains the evidence target; evidence members are an unordered semantic set",
    assertionStatusRule: "asserted only; every admitted atom must be asserted",
    cardinalityRule: "one shared resolved subject and at least two distinct resolved objects in one claim",
    semanticIdExpectation: "existing evidence-set semantic identity from optional subject and canonical unordered evidence set",
    evidenceLineageExpectation: "one support claim, every contributing atomic grounding/structured proposition ID, and exact claim-local spans",
    negativeControls: [
      "aggregate prose is not decomposed by the projector",
      "grouping labels are not admitted as historical evidence members",
      "nested proper names remain metadata on their source-backed grouped evidence member",
      "different evidence targets are never combined",
      "non-asserted atoms are never promoted",
      "fewer than two distinct evidence members fail cardinality",
    ],
    validatorCompatibility: {
      schemaPath: "packages/history/src/v36/explanatory-relation-v36.ts",
      validatorPath: "packages/history/src/v36/explanatory-relation-validator-v36.ts",
      result: "the existing evidence-set kind accepts an optional concept subject and at least two distinct concept evidence members",
    },
    recommendation: "PROPOSED_FOR_PHASE_2_12",
  },
] as const;

export function summarizeCandidateGapInventoryV36(records: readonly CandidateGapInventoryRecordV36[]) {
  const classificationCounts = Object.fromEntries(candidateGapClassificationValuesV36.map((classification) => [
    classification,
    records.filter((record) => record.classification === classification).length,
  ]));
  const eligible = records.filter((record) => record.classification === "DIRECT_PROJECTION_ELIGIBLE");
  const projectorRules = candidateGapProjectorRuleProposalsV36.map((rule) => ({
    ...rule,
    eligibleGapIds: eligible
      .filter((record) => record["proposedFutureProjectorRule"] === rule.ruleId)
      .map((record) => record.gapId),
  }));
  const activeProjectorRules = projectorRules.filter((rule) => rule.eligibleGapIds.length > 0);
  return {
    remainingGaps: records.length,
    classificationCounts,
    directProjectionEligibleGapCount: eligible.length,
    uniqueProposedProjectorRuleCount: activeProjectorRules.length,
    safeForPhase210ProjectorCount: activeProjectorRules.filter((rule) => rule.recommendation === "SAFE_FOR_PHASE_2_10").length,
    notReadyProjectorCount: 0,
    projectorRules: activeProjectorRules,
    decision: eligible.length
      ? "Direct projection gaps remain and require an explicitly approved projector."
      : "No direct-projection-eligible candidate gaps remain after Phase 2.12.",
  };
}
