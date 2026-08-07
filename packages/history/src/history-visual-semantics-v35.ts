import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapStateV34,
  HistoryShotV34,
  HistoryVisualModalityV34,
} from "./history-v34-contracts.js";
import type {
  HistoryBeatV35,
  HistoryEffectiveChangeMetricsV35,
  HistoryHistoricalApprovalStateV35,
  HistoryShotVisualChangeV35,
  HistoryTrustApprovalSummaryV35,
  HistoryVisualConceptV35,
  HistoryVisualModalityV35,
} from "./history-v35-contracts.js";
import {
  LONG_STATIC_SOFT_WARNING_MS,
  LONG_STATIC_STRONG_WARNING_MS,
  LONG_TEXT_ONLY_BLOCK_MS,
  buildSemanticJustificationV34,
  claimAuthorizesRouteMovement,
  deriveLongTextOnlyRemediationV34,
  hasTextOnlyEditorialJustification,
  isRouteMapPurpose,
  isSinglePlaceMapPurpose,
  resolveReconstructionPolicyV34,
  shouldSplitLongStaticBeat,
  shotDurationWarnings,
  summarizeVerificationStatusV34,
} from "./history-visual-semantics-v34.js";
import type { TrustedNarrationAttestationV1 } from "./history-trusted-script-v33.js";
import { PORTRAIT_REFRAME_LABEL_V35 } from "./history-v35-contracts.js";

export {
  LONG_STATIC_SOFT_WARNING_MS,
  LONG_STATIC_STRONG_WARNING_MS,
  LONG_TEXT_ONLY_BLOCK_MS,
  claimAuthorizesRouteMovement,
  isRouteMapPurpose,
  isSinglePlaceMapPurpose,
  mapIntentSignature,
  mapStateSignature,
  validateDiagramSemanticsV34,
  validateMapLabelProvenanceV34,
  validateRouteVisualPurposeAlignment,
  selectMapIntentForBeatV34,
  collectPurposePlaces,
  collectPurposeTemporals,
  normalizeMapPurposeForProposal,
  claimHasDiscoveryGeography,
  claimIdsSupportingMapLabelV34,
  deriveLongTextOnlyRemediationV34,
  hasTextOnlyEditorialJustification,
  isLongTextOnlyWithoutJustification,
  normalizeTrustedAttestationTimestampsV34,
  beatAuthorizesRouteMovement,
  countSemanticShotSegments,
  isGenericVisualPurposeText,
  shouldSplitLongStaticBeat,
  shotDurationWarnings,
} from "./history-visual-semantics-v34.js";

export const INTERNAL_DIAGNOSTIC_TIMELINE_DANGLING = "INTERNAL_TIMELINE_DANGLING_REFERENCE" as const;
export const INTERNAL_DIAGNOSTIC_TIMELINE_FALLBACK = "INTERNAL_TIMELINE_FALLBACK_TO_TEXT" as const;

const GENERIC_ARCHIVAL_TEMPLATE =
  /^support .+ with period-appropriate imagery grounded in the narration\.?$/iu;

const NARRATION_INTERPOLATION_PATTERN =
  /support [“"][^”"]+[”"] with period-appropriate imagery grounded in the narration\.?/giu;

export function normalizeVisualConceptFingerprintV35(value: string): string {
  return value
    .replace(NARRATION_INTERPOLATION_PATTERN, "support <narration> with period-appropriate imagery grounded in the narration")
    .replace(/\bbeat[- ]?\d{4}\b/giu, "beat-<n>")
    .replace(/\bclaim-[a-f0-9]+\b/giu, "claim-<id>")
    .replace(/\bunit-[a-f0-9]+\b/giu, "unit-<id>")
    .replace(/[“”"']/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

export function isTemplatedArchivalPurposeV35(visualPurpose: string): boolean {
  return GENERIC_ARCHIVAL_TEMPLATE.test(visualPurpose.replace(/\s+/gu, " ").trim());
}

export { buildVariedVisualConceptV35 as buildConcreteVisualConceptV35 } from "./history-visual-repetition-v35.js";

export function buildConcreteVisualPurposeV35(input: {
  readonly concept: HistoryVisualConceptV35;
  readonly mapPurpose?: string;
  readonly route?: { readonly origin: string; readonly destination: string } | null;
}): string {
  const { concept } = input;
  if (input.mapPurpose && input.route)
    return `Show claim-supported movement from ${input.route.origin} to ${input.route.destination} using ${concept.intendedComposition.toLocaleLowerCase()}.`;
  if (concept.modality === "document")
    return `Present ${concept.historicalSubject} as an identified archival document (${concept.evidenceSourceClass}) with ${concept.intendedComposition.toLocaleLowerCase()}.`;
  if (concept.modality === "quotation")
    return `Display verbatim quotation from ${concept.historicalSubject} with source provenance preserved.`;
  if (concept.modality === "narration-emphasis")
    return `Editorial emphasis card for ${concept.protectedFactualRelation.slice(0, 72)}; not presented as historical document text.`;
  return `${concept.intendedComposition} for ${concept.historicalSubject}${concept.approximatePeriod ? ` (${concept.approximatePeriod})` : ""}, grounded in ${concept.evidenceSourceClass}.`;
}

export function resolveGeographicLabelV35(input: {
  readonly qualifierId: string;
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
}): string | null {
  const qualifier = input.geographicQualifiers.find((item) => item.id === input.qualifierId);
  if (!qualifier) return null;
  return (
    input.entities.find((entity) => entity.id === qualifier.entityMentionId)?.normalizedLabel ??
    null
  );
}

export function mapRepresentsGeographicLabelV35(
  state: HistoryMapStateV34,
  label: string
): boolean {
  const normalized = label.toLocaleLowerCase();
  if (state.labels.some((item) => item.text.toLocaleLowerCase() === normalized)) return true;
  if (state.routes.some((route) => route.origin.label.toLocaleLowerCase() === normalized)) return true;
  if (state.routes.some((route) => route.destination.label.toLocaleLowerCase() === normalized))
    return true;
  if (state.baseGeography.toLocaleLowerCase().includes(normalized)) return true;
  if (state.affectedArea.toLocaleLowerCase().includes(normalized)) return true;
  return false;
}

export function validateRequiredGeographyCoverageV35(input: {
  readonly mapState: HistoryMapStateV34;
  readonly requiredGeographicQualifierIds: readonly string[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
}): readonly string[] {
  const blockers: string[] = [];
  for (const qualifierId of input.requiredGeographicQualifierIds) {
    const label = resolveGeographicLabelV35({
      qualifierId,
      geographicQualifiers: input.geographicQualifiers,
      entities: input.entities,
    });
    if (!label) {
      blockers.push(`REQUIRED_GEOGRAPHY_UNRESOLVED:${qualifierId}`);
      continue;
    }
    if (!mapRepresentsGeographicLabelV35(input.mapState, label))
      blockers.push(`REQUIRED_GEOGRAPHY_MISSING:${label}`);
  }
  return blockers;
}

export function validatePortraitProtectedGeographyV35(input: {
  readonly ratio: "16:9" | "9:16";
  readonly protectedLabels: readonly string[];
  readonly retainedLabels: readonly string[];
  readonly removedLabels: readonly string[];
}): readonly string[] {
  if (input.ratio !== "9:16") return [];
  const failures: string[] = [];
  for (const label of input.protectedLabels) {
    if (input.removedLabels.includes(label) && !input.retainedLabels.includes(label))
      failures.push(`PORTRAIT_PROTECTED_GEOGRAPHY_REMOVED:${label}`);
  }
  return failures;
}

export function routeActorIsClaimSupportedV35(input: {
  readonly movingActor: string;
  readonly claimText: string;
  readonly authorizesMovement: boolean;
}): boolean {
  if (!input.authorizesMovement) return false;
  if (/^narrated expedition$/iu.test(input.movingActor)) return false;
  return input.movingActor.trim().length > 0;
}

export function classifyTextualModalityV35(input: {
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly {
    readonly id: string;
    readonly normalizedProposition: string;
    readonly claimKind?: HistoryClaimV34["claimKind"];
  }[];
}): HistoryVisualModalityV35 | null {
  const quoteMatch = input.text.match(/[“"]([^”"]{8,})[”"]/u);
  const hasDocumentCue = /\b(?:note|message|cairn|law|statute|decree|charter|account|letter)\b/iu.test(
    input.text
  );
  const claims = input.claims.filter((claim) => input.claimIds.includes(claim.id));
  const quotationClaim = claims.some((claim) => claim.claimKind === "quotation");
  if (quoteMatch && quotationClaim)
    return "quotation";
  if (hasDocumentCue && /\b(?:Victory Point|written message|cairn note)\b/iu.test(input.text))
    return "document";
  if (hasDocumentCue) return "narration-emphasis";
  if (quoteMatch) return "narration-emphasis";
  return "narration-emphasis";
}

export function isCinematicCameraMovementV35(cameraMovement: string): boolean {
  return (
    cameraMovement.trim().length > 0 &&
    !/portrait|reframe|vertical reframe|aspect-ratio/i.test(cameraMovement)
  );
}

export { measureEffectiveVisualChangeV35 } from "./history-effective-change-v35.js";

export function resolveHistoricalApprovalStateV35(input: {
  readonly authorityMode: string;
  readonly attestation: TrustedNarrationAttestationV1 | null;
  readonly independentlyVerifiedCount: number;
}): HistoryTrustApprovalSummaryV35 {
  const hasExplicitAttestation = Boolean(
    input.attestation?.assertedAt &&
      input.attestation.authorityName &&
      input.attestation.timestampStatus === "recorded"
  );
  let historicalApprovalState: HistoryHistoricalApprovalStateV35 = "unattested";
  if (input.independentlyVerifiedCount > 0) historicalApprovalState = "independently_verified";
  else if (hasExplicitAttestation) historicalApprovalState = "explicit_human_attestation";
  else if (input.authorityMode === "trusted-script") historicalApprovalState = "trusted_input";

  return {
    sourceAuthorityMode: input.authorityMode as HistoryTrustApprovalSummaryV35["sourceAuthorityMode"],
    historicalApprovalState,
    attestationBound: hasExplicitAttestation,
    attestationActor: input.attestation?.authorityName ?? null,
    attestationTimestamp: input.attestation?.assertedAt ?? null,
    independentlyVerifiedClaimCount: input.independentlyVerifiedCount,
    productionHistoricalApprovalEligible:
      historicalApprovalState === "explicit_human_attestation" ||
      historicalApprovalState === "independently_verified",
  };
}

export function portraitAdaptationNotesV35(modality: HistoryVisualModalityV34 | HistoryVisualModalityV35): string {
  return `${PORTRAIT_REFRAME_LABEL_V35} for ${modality} beat.`;
}

export function splitModalitiesFromLegacyV35(
  modality: HistoryVisualModalityV34 | HistoryVisualModalityV35
): HistoryVisualModalityV35 {
  if (modality === "document-or-quotation") return "narration-emphasis";
  return modality as HistoryVisualModalityV35;
}

export function buildSemanticJustificationV35(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly mapPurpose?: import("./history-v34-contracts.js").HistoryMapPurposeV34;
  readonly materialClaimCount: number;
}): string {
  if (input.modality === "narration-emphasis")
    return "Editorial emphasis card clarifies narration without implying documentary evidence.";
  if (input.modality === "document")
    return "Document modality references an identified historical source when provenance is available.";
  if (input.modality === "quotation")
    return "Quotation modality preserves verbatim attributed wording with source provenance.";
  return buildSemanticJustificationV34({
    modality: input.modality as HistoryVisualModalityV34,
    ...(input.mapPurpose ? { mapPurpose: input.mapPurpose } : {}),
    materialClaimCount: input.materialClaimCount,
  });
}

export function hasTextOnlyEditorialJustificationV35(input: {
  readonly fallback: import("./history-v35-contracts.js").HistoryVisualPurposeV35["fallbackDecision"];
  readonly mediaJustification?: string;
}): boolean {
  return hasTextOnlyEditorialJustification({
    fallback: input.fallback as import("./history-v34-contracts.js").HistoryVisualPurposeV34["fallbackDecision"],
    ...(input.mediaJustification ? { mediaJustification: input.mediaJustification } : {}),
  });
}

export function isLongTextOnlyWithoutJustificationV35(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly durationMs: number;
  readonly fallback: import("./history-v35-contracts.js").HistoryVisualPurposeV35["fallbackDecision"];
  readonly mediaJustification?: string;
}): boolean {
  return (
    input.modality === "text-only transition" &&
    input.durationMs > LONG_TEXT_ONLY_BLOCK_MS &&
    !hasTextOnlyEditorialJustificationV35(input)
  );
}

export function summarizeVerificationStatusV35(
  claims: readonly Pick<HistoryClaimV34, "independentlyVerified" | "authorityMode">[]
): ReturnType<typeof summarizeVerificationStatusV34> {
  return summarizeVerificationStatusV34(claims);
}

export function resolveReconstructionPolicyV35(
  modality: HistoryVisualModalityV35
): import("./history-v34-contracts.js").HistoryReconstructionPolicyV34 {
  switch (modality) {
    case "document":
    case "quotation":
      return "historical-artifact-photo";
    case "narration-emphasis":
      return "map-or-diagram";
    default:
      return resolveReconstructionPolicyV34(
        modality as import("./history-v34-contracts.js").HistoryVisualModalityV34
      );
  }
}

export function shouldSplitLongStaticBeatV35(input: {
  readonly durationMs: number;
  readonly modality: HistoryVisualModalityV35;
  readonly semanticSegments: number;
}): boolean {
  return shouldSplitLongStaticBeat({
    durationMs: input.durationMs,
    modality: input.modality as HistoryVisualModalityV34,
    semanticSegments: input.semanticSegments,
  });
}

export function shotDurationWarningsV35(
  shots: readonly HistoryShotV34[],
  beats: readonly HistoryBeatV35[]
): ReturnType<typeof shotDurationWarnings> {
  return shotDurationWarnings(
    shots,
    beats as unknown as readonly { readonly id: string; readonly modality: HistoryVisualModalityV34 }[]
  );
}

export function deriveLongTextOnlyRemediationV35(
  input: Parameters<typeof deriveLongTextOnlyRemediationV34>[0]
): HistoryVisualModalityV35 | null {
  const remediated = deriveLongTextOnlyRemediationV34({
    ...input,
    excludeModalities: [
      ...(input.excludeModalities ?? []),
      "document-or-quotation" as HistoryVisualModalityV34,
    ],
  });
  if (!remediated) return null;
  if (remediated === "document-or-quotation") {
    const classified = classifyTextualModalityV35({
      text: input.text,
      claimIds: input.claimIds,
      claims: input.claims,
    });
    return classified ?? "archival image";
  }
  return splitModalitiesFromLegacyV35(remediated);
}
