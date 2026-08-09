import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  type ConceptRefV36,
  type ExplanatoryRelationDraftV36,
  type ExplanatoryRelationV36,
  type GroundedRelationPropositionV36,
  type PlaceRefV36,
} from "./explanatory-relation-v36.js";
import { explanatoryRelationValidatorV36 } from "./explanatory-relation-validator-v36.js";
import {
  allowedRelationKindsV36,
  callBoundedLlmRelationProposerV36,
  HISTORY_V36_LLM_MAX_WINDOW_SIZE,
  HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
  type BoundedLlmCallBudgetV36,
  type BoundedLlmCallDiagnosticV36,
  type BoundedLlmParticipantBindingV36,
  type BoundedLlmRelationPacketV36,
  type BoundedLlmRelationProposalV36,
  type BoundedLlmRelationProviderV36,
  type BoundedLlmRelationProposerOutputV36,
  type BoundedLlmUsageV36,
} from "./bounded-llm-relation-proposer-v36.js";
import type { RelationProposalCacheV36 } from "./relation-proposer-cache-v36.js";
import {
  runRepresentativeShadowExtractionV36,
  type RepresentativeShadowExtractionResultV36,
  type RepresentativeShadowSourceV36,
  type ShadowCandidateRecordV36,
  type ShadowExtractionDiagnosticV36,
  type StructuredClaimSourceV36,
  type StructuredEntitySourceV36,
} from "./representative-shadow-extraction-v36.js";

export const HISTORY_V36_REPRESENTATIVE_EPISODE_SET = [
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
  "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed",
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion",
  "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
  "history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded",
] as const;

const knownRecallWindows: Readonly<Record<string, readonly (readonly string[])[]>> = {
  "history-youtube-history-10-video-story-pack-04-black-death": [
    ["claim-3b3f5f2d628d9410657dcfe8", "claim-ee76bea77004b9d801b6630b"],
    ["claim-ee76bea77004b9d801b6630b", "claim-095a61f563fa2980b636c6cc"],
  ],
};

const geographicTypes = new Set(["state", "place", "region", "water-body", "island"]);
const zeroUsage: BoundedLlmUsageV36 = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export interface BoundedLlmWindowV36 {
  readonly id: string;
  readonly eligibility: "rejected-deterministic-candidate" | "known-representative-recall-control";
  readonly supportClaimIds: readonly string[];
  readonly packet: BoundedLlmRelationPacketV36;
}

export interface BoundedLlmAttributionV36 {
  readonly semanticRelationId: string;
  readonly attribution: "deterministic only" | "LLM only" | "both";
}

export interface BoundedLlmEpisodeMetricsV36 {
  readonly claimsInspected: number;
  readonly deterministicCandidates: number;
  readonly deterministicValid: number;
  readonly llmWindowsRequested: number;
  readonly providerCalls: number;
  readonly cacheHits: number;
  readonly llmProposals: number;
  readonly llmPreValidationRejects: number;
  readonly llmValidatorRejects: number;
  readonly llmValidated: number;
  readonly combinedUniqueValidated: number;
  readonly deterministicOnlySemanticIds: readonly string[];
  readonly llmOnlySemanticIds: readonly string[];
  readonly bothSemanticIds: readonly string[];
  readonly manualReviewItems: number;
}

export interface BoundedLlmEpisodeResultV36 {
  readonly mode: "deterministic-only" | "deterministic-plus-llm";
  readonly episodeId: string;
  readonly deterministic: RepresentativeShadowExtractionResultV36;
  readonly windows: readonly BoundedLlmWindowV36[];
  readonly llmCandidates: readonly ShadowCandidateRecordV36[];
  readonly callDiagnostics: readonly BoundedLlmCallDiagnosticV36[];
  readonly combinedRelations: readonly ExplanatoryRelationV36[];
  readonly attribution: readonly BoundedLlmAttributionV36[];
  readonly usage: BoundedLlmUsageV36;
  readonly metrics: BoundedLlmEpisodeMetricsV36;
}

export function deduplicateBoundedLlmRelationsV36(
  deterministicRelations: readonly ExplanatoryRelationV36[],
  llmRelations: readonly ExplanatoryRelationV36[]
): { readonly relations: readonly ExplanatoryRelationV36[]; readonly attribution: readonly BoundedLlmAttributionV36[] } {
  const deterministicIds = new Set(deterministicRelations.map((relation) => relation.id));
  const llmIds = new Set(llmRelations.map((relation) => relation.id));
  const combined = new Map(deterministicRelations.map((relation) => [relation.id, relation]));
  for (const relation of llmRelations) if (!combined.has(relation.id)) combined.set(relation.id, relation);
  const attribution = [...new Set([...deterministicIds, ...llmIds])].sort().map((semanticRelationId) => ({
    semanticRelationId,
    attribution: deterministicIds.has(semanticRelationId) && llmIds.has(semanticRelationId) ? "both" as const : deterministicIds.has(semanticRelationId) ? "deterministic only" as const : "LLM only" as const,
  }));
  return { relations: [...combined.values()].sort((left, right) => left.id.localeCompare(right.id)), attribution };
}

function sourceEntities(source: RepresentativeShadowSourceV36, claims: readonly StructuredClaimSourceV36[]): readonly StructuredEntitySourceV36[] {
  const ids = new Set(claims.flatMap((claim) => claim.entityMentionIds));
  return source.entities.filter((entity) => ids.has(entity.id));
}

function participantBindings(source: RepresentativeShadowSourceV36, claims: readonly StructuredClaimSourceV36[]): readonly BoundedLlmParticipantBindingV36[] {
  const bindings: BoundedLlmParticipantBindingV36[] = claims.map((claim) => ({
    id: `claim-concept:${claim.id}`,
    type: "concept",
    canonicalLabel: claim.normalizedProposition,
  }));
  for (const entity of sourceEntities(source, claims)) {
    const place = geographicTypes.has(entity.entityType);
    bindings.push({ id: entity.id, type: place ? "place" : "concept", canonicalLabel: entity.normalizedLabel, entityId: entity.id });
  }
  return bindings.sort((left, right) => left.id.localeCompare(right.id));
}

function createWindow(
  source: RepresentativeShadowSourceV36,
  supportClaimIds: readonly string[],
  eligibility: BoundedLlmWindowV36["eligibility"]
): BoundedLlmWindowV36 | null {
  const ordered = source.claims.filter((claim) => supportClaimIds.includes(claim.id));
  if (ordered.length !== supportClaimIds.length || ordered.length < 1 || ordered.length > HISTORY_V36_LLM_MAX_WINDOW_SIZE) return null;
  const packet: BoundedLlmRelationPacketV36 = {
    episodeId: source.episodeId,
    claims: ordered.map((claim) => ({
      claimId: claim.id,
      normalizedProposition: claim.normalizedProposition,
      kind: claim.claimKind,
      resolvedEntityIds: sourceEntities(source, [claim]).map((entity) => entity.id).sort(),
      resolvedPlaceIds: sourceEntities(source, [claim]).filter((entity) => geographicTypes.has(entity.entityType)).map((entity) => entity.id).sort(),
    })),
    participantBindings: participantBindings(source, ordered),
    allowedRelationKinds: allowedRelationKindsV36,
    relationSchemaVersion: "history-explanatory-relations.v2",
    promptVersion: HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
  };
  return { id: `llm-window-${ordered.map((claim) => claim.id).join("--")}`, eligibility, supportClaimIds: ordered.map((claim) => claim.id), packet };
}

/** Eligibility changes LLM cost only; it cannot project or admit a relation. */
export function selectBoundedLlmWindowsV36(
  source: RepresentativeShadowSourceV36,
  deterministic: RepresentativeShadowExtractionResultV36
): readonly BoundedLlmWindowV36[] {
  const windows = new Map<string, BoundedLlmWindowV36>();
  for (const candidate of deterministic.candidates.filter((item) => item.status === "rejected")) {
    const window = createWindow(source, candidate.supportClaimIds, "rejected-deterministic-candidate");
    if (window) windows.set(window.id, window);
  }
  for (const claimIds of knownRecallWindows[source.episodeId] ?? []) {
    const window = createWindow(source, claimIds, "known-representative-recall-control");
    if (window) windows.set(window.id, window);
  }
  return [...windows.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function proposalParticipantIds(proposal: BoundedLlmRelationProposalV36): readonly string[] {
  switch (proposal.kind) {
    case "movement": return [proposal.fromParticipantId, proposal.toParticipantId, ...proposal.viaParticipantIds];
    case "spatial-comparison": return proposal.placeParticipantIds;
    case "spatial-area": return [proposal.placeParticipantId];
    case "causal": return [proposal.causeParticipantId, proposal.effectParticipantId];
    case "dependency": return [proposal.dependencyParticipantId, proposal.dependentParticipantId];
    case "process":
    case "temporal-sequence": return proposal.stepParticipantIds;
    case "policy-response": return [proposal.conditionParticipantId, proposal.responseParticipantId];
    case "evidence-set": return [...(proposal.subjectParticipantId ? [proposal.subjectParticipantId] : []), ...proposal.evidenceParticipantIds];
  }
}

function placeRef(binding: BoundedLlmParticipantBindingV36): PlaceRefV36 {
  return { entityId: entityIdV36(binding.entityId ?? binding.id), canonicalLabel: binding.canonicalLabel };
}

function conceptRef(binding: BoundedLlmParticipantBindingV36): ConceptRefV36 {
  return { canonicalLabel: binding.canonicalLabel, ...(binding.entityId ? { entityId: entityIdV36(binding.entityId) } : {}) };
}

function purposeTargetPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\bto\\s+(?:search\\s+for|look\\s+for|find|investigate|explore|attack|rescue|study|locate)\\s+(?:the\\s+)?${escaped}\\b`, "iu");
}

function preValidateProposal(
  proposal: BoundedLlmRelationProposalV36,
  window: BoundedLlmWindowV36
): readonly ShadowExtractionDiagnosticV36[] {
  const windowClaimIds = new Set(window.supportClaimIds);
  const outOfWindow = proposal.supportClaimIds.filter((claimId) => !windowClaimIds.has(claimId));
  if (outOfWindow.length) return [{ code: "SHADOW_LLM_SUPPORT_CLAIM_OUT_OF_WINDOW", message: "LLM proposal referenced support outside its bounded claim window.", affectedIds: outOfWindow }];
  const bindings = new Map(window.packet.participantBindings.map((binding) => [binding.id, binding]));
  const unknown = proposalParticipantIds(proposal).filter((id) => !bindings.has(id));
  if (unknown.length) return [{ code: "SHADOW_LLM_UNKNOWN_PARTICIPANT", message: "LLM proposal referenced a participant ID not supplied in the bounded packet.", affectedIds: [...new Set(unknown)].sort() }];
  const placeIds = proposal.kind === "movement"
    ? [proposal.fromParticipantId, proposal.toParticipantId, ...proposal.viaParticipantIds]
    : proposal.kind === "spatial-comparison" ? proposal.placeParticipantIds
      : proposal.kind === "spatial-area" ? [proposal.placeParticipantId] : [];
  const wrongType = placeIds.filter((id) => bindings.get(id)?.type !== "place");
  if (wrongType.length) return [{ code: "SHADOW_LLM_UNKNOWN_PARTICIPANT", message: "LLM proposal used a non-place binding in a place role.", affectedIds: [...new Set(wrongType)].sort() }];
  if (proposal.kind === "movement") {
    const target = bindings.get(proposal.toParticipantId)!;
    if (window.packet.claims.some((claim) => purposeTargetPattern(target.canonicalLabel).test(claim.normalizedProposition))) {
      return [{ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS", message: "Purpose-infinitive object is not an established movement destination.", affectedIds: [proposal.toParticipantId] }];
    }
  }
  return [];
}

function propositionFromProposal(
  proposal: BoundedLlmRelationProposalV36,
  window: BoundedLlmWindowV36
): GroundedRelationPropositionV36 {
  const bindings = new Map(window.packet.participantBindings.map((binding) => [binding.id, binding]));
  const place = (id: string) => placeRef(bindings.get(id)!);
  const concept = (id: string) => conceptRef(bindings.get(id)!);
  switch (proposal.kind) {
    case "movement": return { kind: "movement", from: place(proposal.fromParticipantId), to: place(proposal.toParticipantId), via: proposal.viaParticipantIds.map(place) };
    case "spatial-comparison": return { kind: "spatial-comparison", places: proposal.placeParticipantIds.map(place) as [PlaceRefV36, PlaceRefV36, ...PlaceRefV36[]] };
    case "spatial-area": return { kind: "spatial-area", place: place(proposal.placeParticipantId) };
    case "causal": return { kind: "causal", cause: concept(proposal.causeParticipantId), effect: concept(proposal.effectParticipantId) };
    case "dependency": return { kind: "dependency", dependency: concept(proposal.dependencyParticipantId), dependent: concept(proposal.dependentParticipantId) };
    case "process": return { kind: "process", steps: proposal.stepParticipantIds.map(concept) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]] };
    case "temporal-sequence": return { kind: "temporal-sequence", steps: proposal.stepParticipantIds.map(concept) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]] };
    case "policy-response": return { kind: "policy-response", condition: concept(proposal.conditionParticipantId), response: concept(proposal.responseParticipantId) };
    case "evidence-set": return { kind: "evidence-set", ...(proposal.subjectParticipantId ? { subject: concept(proposal.subjectParticipantId) } : {}), evidence: proposal.evidenceParticipantIds.map(concept) as [ConceptRefV36, ConceptRefV36, ...ConceptRefV36[]] };
  }
}

function candidateRecord(input: {
  readonly source: RepresentativeShadowSourceV36;
  readonly deterministic: RepresentativeShadowExtractionResultV36;
  readonly window: BoundedLlmWindowV36;
  readonly proposal: BoundedLlmRelationProposalV36;
  readonly proposalIndex: number;
}): { readonly record: ShadowCandidateRecordV36; readonly relation?: ExplanatoryRelationV36 } {
  const claims = input.source.claims.filter((claim) => input.window.supportClaimIds.includes(claim.id));
  const base = {
    id: `shadow-llm-${input.window.supportClaimIds.join("--")}-${input.proposalIndex}`,
    episodeId: input.source.episodeId,
    claimId: input.window.supportClaimIds[0]!,
    supportClaimIds: input.proposal.supportClaimIds,
    windowSize: input.window.supportClaimIds.length as 1 | 2,
    source: "bounded-llm-claim-projection" as const,
    extractionRule: HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
    normalizedProposition: claims.map((claim) => claim.normalizedProposition).join(" "),
    sourceSpans: claims.flatMap((claim) => claim.narrationSpans),
    resolvedParticipantIds: proposalParticipantIds(input.proposal),
  };
  const preValidationDiagnostics = preValidateProposal(input.proposal, input.window);
  if (preValidationDiagnostics.length) return { record: { ...base, status: "rejected", diagnostics: preValidationDiagnostics } };
  let relation: ExplanatoryRelationV36;
  try {
    const supportClaimIds = input.proposal.supportClaimIds.map(claimIdV36) as [ReturnType<typeof claimIdV36>, ...ReturnType<typeof claimIdV36>[]];
    relation = createExplanatoryRelationV36({
      ...propositionFromProposal(input.proposal, input.window),
      episodeId: episodeIdV36(input.source.episodeId),
      supportClaimIds,
    } as ExplanatoryRelationDraftV36);
  } catch (error) {
    return { record: { ...base, status: "rejected", diagnostics: [{ code: "SHADOW_RELATION_INSUFFICIENT_CARDINALITY", message: error instanceof Error ? error.message : "LLM candidate could not be constructed.", affectedIds: proposalParticipantIds(input.proposal) }] } };
  }
  const validation = explanatoryRelationValidatorV36.validate(relation, {
    episodeId: input.deterministic.episodeId,
    claims: input.deterministic.claims,
    entities: input.deterministic.entities,
  });
  if (validation.status === "invalid") return { record: { ...base, status: "rejected", semanticRelationId: relation.id, evidenceFingerprint: relation.evidenceFingerprint, diagnostics: validation.diagnostics } };
  return { record: { ...base, status: "valid", semanticRelationId: relation.id, evidenceFingerprint: relation.evidenceFingerprint, diagnostics: [] }, relation };
}

function mergeUsage(left: BoundedLlmUsageV36, right: BoundedLlmUsageV36): BoundedLlmUsageV36 {
  return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens, totalTokens: left.totalTokens + right.totalTokens };
}

export async function runBoundedLlmShadowEpisodeV36(input: {
  readonly mode: "deterministic-only" | "deterministic-plus-llm";
  readonly source: RepresentativeShadowSourceV36;
  readonly provider?: BoundedLlmRelationProviderV36;
  readonly cache?: RelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>;
  readonly budget?: BoundedLlmCallBudgetV36;
}): Promise<BoundedLlmEpisodeResultV36> {
  const deterministic = runRepresentativeShadowExtractionV36(input.source);
  const windows = input.mode === "deterministic-plus-llm" ? selectBoundedLlmWindowsV36(input.source, deterministic) : [];
  const llmCandidates: ShadowCandidateRecordV36[] = [];
  const llmRelations: ExplanatoryRelationV36[] = [];
  const callDiagnostics: BoundedLlmCallDiagnosticV36[] = [];
  let providerCalls = 0;
  let cacheHits = 0;
  let proposals = 0;
  let usage = zeroUsage;
  if (input.mode === "deterministic-plus-llm") {
    if (!input.provider || !input.cache || !input.budget) throw new Error("LLM shadow mode requires an explicit provider, cache, and call budget.");
    for (const window of windows) {
      const call = await callBoundedLlmRelationProposerV36({ packet: window.packet, provider: input.provider, cache: input.cache, budget: input.budget });
      providerCalls += Number(call.providerCall);
      cacheHits += Number(call.cacheHit);
      usage = mergeUsage(usage, call.usage);
      callDiagnostics.push(...call.diagnostics);
      proposals += call.output?.proposals.length ?? 0;
      for (const [proposalIndex, proposal] of (call.output?.proposals ?? []).entries()) {
        const candidate = candidateRecord({ source: input.source, deterministic, window, proposal, proposalIndex });
        llmCandidates.push(candidate.record);
        if (candidate.relation) llmRelations.push(candidate.relation);
      }
    }
  }
  const combined = deduplicateBoundedLlmRelationsV36(deterministic.extraction.relations, llmRelations);
  const attribution = combined.attribution;
  const preValidationRejects = llmCandidates.filter((candidate) => candidate.status === "rejected" && candidate.diagnostics.some((diagnostic) => diagnostic.code.startsWith("SHADOW_"))).length;
  const validatorRejects = llmCandidates.filter((candidate) => candidate.status === "rejected" && candidate.diagnostics.some((diagnostic) => diagnostic.code.startsWith("RELATION_"))).length;
  const llmOnlySemanticIds = attribution.filter((item) => item.attribution === "LLM only").map((item) => item.semanticRelationId);
  const bothSemanticIds = attribution.filter((item) => item.attribution === "both").map((item) => item.semanticRelationId);
  const deterministicOnlySemanticIds = attribution.filter((item) => item.attribution === "deterministic only").map((item) => item.semanticRelationId);
  const manualReviewItems = llmCandidates.filter((candidate) => candidate.status === "valid" || candidate.status === "rejected").length + callDiagnostics.length;
  return {
    mode: input.mode,
    episodeId: input.source.episodeId,
    deterministic,
    windows,
    llmCandidates,
    callDiagnostics,
    combinedRelations: combined.relations,
    attribution,
    usage,
    metrics: {
      claimsInspected: deterministic.claims.length,
      deterministicCandidates: deterministic.candidates.length,
      deterministicValid: deterministic.extraction.relations.length,
      llmWindowsRequested: windows.length,
      providerCalls,
      cacheHits,
      llmProposals: proposals,
      llmPreValidationRejects: preValidationRejects,
      llmValidatorRejects: validatorRejects,
      llmValidated: llmRelations.length,
      combinedUniqueValidated: combined.relations.length,
      deterministicOnlySemanticIds,
      llmOnlySemanticIds,
      bothSemanticIds,
      manualReviewItems,
    },
  };
}
