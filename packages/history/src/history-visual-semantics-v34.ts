import type {
  HistoryClaimV34,
  HistoryDiagramStateV34,
  HistoryMapIntentProposalV34,
  HistoryMapPurposeV34,
  HistoryMapStateV34,
  HistoryReconstructionPolicyV34,
  HistoryShotV34,
  HistoryVisualModalityV34,
  HistoryVisualPurposeV34,
} from "./history-v34-contracts.js";

export const LONG_STATIC_SOFT_WARNING_MS = 8_000;
export const LONG_STATIC_STRONG_WARNING_MS = 12_000;
export const LONG_TEXT_ONLY_BLOCK_MS = 12_000;

const MOVEMENT_NARRATION_PATTERN =
  /\b(?:sailed|sail|marched|march(?:ed|ing)?|departed|arrived|crossed|crossing|advanced|advancing|advance|captured|retreat(?:ed|ing)?|entered|reached|invaded|invading|pursued|harassed|traveled|travelled|journey|toward|towards|headed|bound for|planned to march|from .+ to )\b/iu;
const LOCATION_SIGHTING_PATTERN =
  /\b(?:saw|seen|spotted|observed|located in|wintered at|trapped in|off the|off King|in the ice|anchored at|stationed at|in .+ Bay\b)\b/iu;

const SINGLE_PLACE_MAP_PURPOSES = new Set<HistoryMapPurposeV34>([
  "location",
  "area",
  "orientation",
  "discovery-location",
]);

const ROUTE_MAP_PURPOSES = new Set<HistoryMapPurposeV34>([
  "journey",
  "expedition-route",
  "campaign",
  "migration",
  "trade",
  "territorial-change",
  "hypothetical-route",
]);

const GENERIC_VISUAL_PURPOSE_PATTERNS = [
  /\bclarifying beat \d{4}\b/iu,
  /\buse \w[\w-]* only for facts explicitly present in trusted narration\b/iu,
  /\brhetorical or non-material narration uses a non-factual visual treatment\b/iu,
  /^archival image clarifying\b/iu,
  /^map clarifying\b/iu,
  /^diagram clarifying\b/iu,
  /^timeline clarifying\b/iu,
] as const;

const CAUSAL_NARRATION_PATTERN =
  /\b(?:because|led to|caused|resulted|therefore|compelled|forced|triggered|combined|contribut(?:e|ed|ing)?|interdepend|disrupt(?:ed|ion)?|unless|collapse|pressure|failure|depended?|fragmented)\b/iu;
const SEQUENCE_NARRATION_PATTERN =
  /\b(?:then|after|before|subsequently|first|next|finally|in turn|week later|chose|preserve|continue|abandon)\b/iu;
const ENUMERATION_NARRATION_PATTERN =
  /\b(?:including|such as|among|graves?|equipment|remains|message|testimony|evidence)\b/iu;

export function isSinglePlaceMapPurpose(mapPurpose: HistoryMapPurposeV34): boolean {
  return SINGLE_PLACE_MAP_PURPOSES.has(mapPurpose);
}

export function isRouteMapPurpose(mapPurpose: HistoryMapPurposeV34): boolean {
  return ROUTE_MAP_PURPOSES.has(mapPurpose);
}

export function normalizeMapPurposeForProposal(
  proposal: Pick<
    HistoryMapIntentProposalV34,
    "mapPurpose" | "originPlaceMentionIds" | "destinationPlaceMentionIds"
  >
): HistoryMapPurposeV34 {
  const samePlace =
    proposal.originPlaceMentionIds.length === 1 &&
    proposal.destinationPlaceMentionIds.length === 1 &&
    proposal.originPlaceMentionIds[0] === proposal.destinationPlaceMentionIds[0];
  if (samePlace && proposal.mapPurpose === "orientation") return "location";
  if (samePlace && proposal.mapPurpose === "search-area") return "area";
  if (samePlace && isRouteMapPurpose(proposal.mapPurpose)) return "location";
  return proposal.mapPurpose;
}

export function mapIntentSignature(
  proposal: Pick<
    HistoryMapIntentProposalV34,
    | "mapPurpose"
    | "routeType"
    | "originPlaceMentionIds"
    | "destinationPlaceMentionIds"
    | "waypointPlaceMentionIds"
    | "claimIds"
  >
): string {
  return [
    proposal.mapPurpose,
    proposal.routeType,
    proposal.originPlaceMentionIds.join(","),
    proposal.destinationPlaceMentionIds.join(","),
    proposal.waypointPlaceMentionIds.join(","),
    [...proposal.claimIds].sort().join(","),
  ].join("|");
}

export function mapStateSignature(state: HistoryMapStateV34): string {
  const routeSig = state.routes
    .map(
      (route) =>
        `${route.routeType}:${route.originPlaceId}->${route.destinationPlaceId}:${route.movingActor}`
    )
    .sort()
    .join(";");
  return [
    state.mapPurpose,
    state.baseGeography,
    state.timePeriod,
    routeSig,
    [...state.labels.map((label) => label.text)].sort().join(","),
  ].join("|");
}

function wordSafeSlice(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  return (boundary > 20 ? slice.slice(0, boundary) : slice).trim();
}

function primaryPlace(places: readonly string[]): string {
  return places[0] ?? "the narrated region";
}

function temporalPhrase(temporals: readonly string[]): string {
  const value = temporals.find((item) => item && item !== "as narrated");
  return value ? ` during ${value}` : "";
}

export function claimAuthorizesRouteMovement(text: string): boolean {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (LOCATION_SIGHTING_PATTERN.test(normalized) && !MOVEMENT_NARRATION_PATTERN.test(normalized))
    return false;
  if (/\b(?:captured|occupied|besieged|defeated|held|seized|took)\b/iu.test(normalized)) {
    return (
      /\bfrom\b.+\bto\b/iu.test(normalized) ||
      /\b(?:cross(?:ing|ed)|into|toward|towards|entered|reached|marched|advanced|retreat(?:ed|ing)?|sailed|departed)\b/iu.test(
        normalized
      )
    );
  }
  return MOVEMENT_NARRATION_PATTERN.test(normalized) || /\bfrom\b.+\bto\b/iu.test(normalized);
}

export function claimHasDiscoveryGeography(input: {
  readonly claim: HistoryClaimV34;
  readonly entities: readonly {
    readonly claimId: string;
    readonly normalizedLabel: string;
    readonly entityType: string;
  }[];
  readonly geographicQualifiers: readonly {
    readonly claimId: string;
    readonly role: string;
  }[];
}): boolean {
  const geoRoles = new Set([
    "location",
    "region",
    "origin",
    "destination",
    "affected-area",
    "route-waypoint",
  ]);
  if (
    input.geographicQualifiers.some(
      (item) => item.claimId === input.claim.id && geoRoles.has(item.role)
    )
  )
    return true;
  return input.entities
    .filter((entity) => entity.claimId === input.claim.id)
    .some((entity) =>
      ["place", "region", "water-body", "island"].includes(entity.entityType)
    );
}

export function buildVisualPurposeV34(input: {
  readonly modality: HistoryVisualModalityV34;
  readonly narrationExcerpt: string;
  readonly places: readonly string[];
  readonly temporals: readonly string[];
  readonly mapPurpose?: HistoryMapPurposeV34;
  readonly route?: { readonly origin: string; readonly destination: string } | null;
  readonly beatAuthorizesMovement?: boolean;
}): string {
  const excerpt = wordSafeSlice(input.narrationExcerpt, 96);
  const place = primaryPlace(input.places);
  const when = temporalPhrase(input.temporals);
  switch (input.modality) {
    case "map":
      if (input.mapPurpose === "discovery-location")
        return input.route || place !== "the narrated region"
          ? `Mark where the narration places the ${place} discovery${when} so viewers can situate the find.`
          : `Hold the narrated ${when.trim() || "discovery"} without asserting a geography absent from the script.`;
      if (
        input.route &&
        input.beatAuthorizesMovement !== false &&
        (input.mapPurpose === "journey" ||
          input.mapPurpose === "expedition-route" ||
          (input.mapPurpose && isRouteMapPurpose(input.mapPurpose)))
      )
        return `Show narrated movement from ${input.route.origin} to ${input.route.destination}${when}.`;
      if (input.mapPurpose === "hypothetical-route")
        return `Present the narrated hypothetical route${when} without implying certainty beyond the script.`;
      if (input.mapPurpose === "area" || input.mapPurpose === "search-area")
        return `Frame the narrated search or affected area around ${place}${when}.`;
      if (input.mapPurpose === "comparison")
        return `Compare the narrated geographic contexts around ${place}${when}.`;
      return `Orient the viewer to ${place}${when} before the narration advances.`;
    case "diagram":
      return `Group the narrated evidence categories in “${excerpt}” without inventing unsupported relationships.`;
    case "timeline":
      return `Sequence the dated events in “${excerpt}” so the viewer can track chronology.`;
    case "document-or-quotation":
      return `Display the narrated document or quotation from “${excerpt}” as primary evidence.`;
    case "date-card":
      return `Hold the key date from “${excerpt}” while surrounding context is explained.`;
    case "archival image":
    case "historical artwork":
      return `Support “${excerpt}” with period-appropriate imagery grounded in the narration.`;
    case "restrained atmospheric reconstruction":
      return `Constrain reconstruction to what “${excerpt}” explicitly supports${when}.`;
    case "text-only transition":
      return `Carry the rhetorical turn in “${excerpt}” without adding unsupported factual imagery.`;
    default:
      return `Clarify “${excerpt}” using a narration-safe ${input.modality} treatment.`;
  }
}

export function buildSemanticJustificationV34(input: {
  readonly modality: HistoryVisualModalityV34;
  readonly mapPurpose?: HistoryMapPurposeV34;
  readonly materialClaimCount: number;
}): string {
  if (input.materialClaimCount === 0)
    return "Non-material narration uses a non-factual visual treatment.";
  switch (input.modality) {
    case "map":
      if (input.mapPurpose && isSinglePlaceMapPurpose(input.mapPurpose))
        return "A single-place map is appropriate because the narration anchors one geographic context without narrated movement.";
      if (input.mapPurpose && isRouteMapPurpose(input.mapPurpose))
        return "A route map is appropriate because the narration describes movement between distinct places.";
      return "Map modality matches explicit geographic references in trusted narration.";
    case "diagram":
      return "Diagram modality lists narrated evidence categories without implying sequence or causation unless explicitly stated.";
    case "timeline":
      return "Timeline modality is appropriate because the narration cites multiple ordered dates or periods.";
    case "document-or-quotation":
      return "Document modality preserves verbatim or attributed wording from the narration.";
    case "text-only transition":
      return "Text-only treatment avoids inventing visuals where the narration is rhetorical or underspecified.";
    default:
      return `${input.modality} is the least misleading modality for the narrated facts in this beat.`;
  }
}

export function isGenericVisualPurposeText(value: string): boolean {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return GENERIC_VISUAL_PURPOSE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveReconstructionPolicyV34(
  modality: HistoryVisualModalityV34
): HistoryReconstructionPolicyV34 {
  switch (modality) {
    case "archival image":
    case "historical artwork":
      return "documented-archival";
    case "document-or-quotation":
      return "historical-artifact-photo";
    case "map":
    case "diagram":
    case "timeline":
    case "date-card":
    case "comparison card":
      return "map-or-diagram";
    case "restrained atmospheric reconstruction":
      return "historically-constrained-reconstruction";
    case "text-only transition":
    case "no generated visual":
      return "not-applicable";
    default:
      return "unknown";
  }
}

export function countSemanticShotSegments(input: {
  readonly text: string;
  readonly claimCount: number;
}): number {
  const clauses = input.text.split(/[.;!?]+/u).filter((part) => part.trim().length > 8);
  const visualConcepts = [
    /\b(?:route|sailed|march|crossed|island|bay|passage)\b/iu.test(input.text),
    /\b(?:graves?|equipment|remains|message|testimony|evidence|discovered)\b/iu.test(
      input.text
    ),
    /\b(?:\d{3,4}|april|june|may|184[5-8]|2014|2016)\b/iu.test(input.text),
    /\b(?:because|led to|resulted|decision)\b/iu.test(input.text),
  ].filter(Boolean).length;
  return Math.max(1, Math.min(3, Math.max(input.claimCount >= 2 ? 2 : 1, clauses.length >= 2 ? 2 : 1, visualConcepts)));
}

export function shouldSplitLongStaticBeat(input: {
  readonly durationMs: number;
  readonly modality: HistoryVisualModalityV34;
  readonly semanticSegments: number;
}): boolean {
  const staticModality = [
    "archival image",
    "historical artwork",
    "text-only transition",
    "document-or-quotation",
    "comparison card",
  ].includes(input.modality);
  if (!staticModality) return input.semanticSegments > 1;
  return (
    input.durationMs > LONG_STATIC_SOFT_WARNING_MS &&
    (input.semanticSegments > 1 || input.durationMs > LONG_STATIC_STRONG_WARNING_MS)
  );
}

export function shotDurationWarnings(
  shots: readonly HistoryShotV34[],
  beats: readonly { readonly id: string; readonly modality: HistoryVisualModalityV34 }[]
): Array<{ readonly code: string; readonly severity: "warning"; readonly shotId: string; readonly message: string }> {
  const beatModality = new Map(beats.map((beat) => [beat.id, beat.modality] as const));
  const warnings: Array<{
    readonly code: string;
    readonly severity: "warning";
    readonly shotId: string;
    readonly message: string;
  }> = [];
  for (const shot of shots) {
    const modality = beatModality.get(shot.beatId) ?? "archival image";
    const staticModality = [
      "archival image",
      "historical artwork",
      "text-only transition",
      "document-or-quotation",
    ].includes(modality);
    if (!staticModality) continue;
    if (shot.durationMs > LONG_STATIC_STRONG_WARNING_MS)
      warnings.push({
        code: "LONG_STATIC_SHOT_STRONG",
        severity: "warning",
        shotId: shot.id,
        message: `Static/text shot exceeds ${LONG_STATIC_STRONG_WARNING_MS / 1000}s; consider semantic split or justification.`,
      });
    else if (shot.durationMs > LONG_STATIC_SOFT_WARNING_MS)
      warnings.push({
        code: "LONG_STATIC_SHOT_SOFT",
        severity: "warning",
        shotId: shot.id,
        message: `Static/text shot exceeds ${LONG_STATIC_SOFT_WARNING_MS / 1000}s.`,
      });
  }
  return warnings;
}

export function validateDiagramSemanticsV34(input: {
  readonly state: HistoryDiagramStateV34;
  readonly linkedClaimText: string;
}): string[] {
  const blockers: string[] = [];
  if (input.state.diagramType === "evidence-set") {
    if (input.state.edges.length)
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
    return blockers;
  }
  for (const edge of input.state.edges) {
    if (edge.relationship === "sequence" && ENUMERATION_NARRATION_PATTERN.test(input.linkedClaimText)) {
      if (!SEQUENCE_NARRATION_PATTERN.test(input.linkedClaimText))
        blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
    }
    if (
      ["causes", "leads-to", "contributes-to", "depends-on"].includes(edge.relationship) &&
      !CAUSAL_NARRATION_PATTERN.test(input.linkedClaimText)
    )
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
    if (edge.relationship === "associated-with")
      blockers.push("DIAGRAM_UNSUPPORTED_EDGE");
  }
  return [...new Set(blockers)];
}

export function summarizeVerificationStatusV34(
  claims: readonly Pick<HistoryClaimV34, "independentlyVerified" | "authorityMode">[]
): {
  readonly trustedNarrationAccepted: boolean;
  readonly independentlyVerifiedCount: number;
  readonly productionApprovalNote: string;
} {
  const independentlyVerifiedCount = claims.filter((claim) => claim.independentlyVerified).length;
  return {
    trustedNarrationAccepted: claims.every((claim) => claim.authorityMode === "trusted-script"),
    independentlyVerifiedCount,
    productionApprovalNote:
      independentlyVerifiedCount === 0
        ? "Claims are trusted-script accepted only; independent historical verification has not been performed."
        : `${independentlyVerifiedCount} claim(s) marked independently verified.`,
  };
}

export function collectPurposePlaces(input: {
  readonly entities: readonly { readonly claimId: string; readonly normalizedLabel: string; readonly entityType: string }[];
  readonly claimIds: readonly string[];
}): string[] {
  return [
    ...new Set(
      input.entities
        .filter(
          (entity) =>
            input.claimIds.includes(entity.claimId) &&
            ["place", "region", "water-body", "state", "island"].includes(entity.entityType)
        )
        .map((entity) => entity.normalizedLabel)
    ),
  ];
}

export function collectPurposeTemporals(input: {
  readonly temporals: readonly { readonly claimId: string; readonly normalizedValue: string }[];
  readonly claimIds: readonly string[];
}): string[] {
  return [
    ...new Set(
      input.temporals
        .filter((item) => input.claimIds.includes(item.claimId))
        .map((item) => item.normalizedValue)
    ),
  ];
}

export function selectMapIntentForBeatV34(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly intentsByClaim: ReadonlyMap<string, HistoryMapIntentProposalV34>;
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
}): HistoryMapIntentProposalV34 | undefined {
  const authorizesMovement = claimAuthorizesRouteMovement(input.clusterText);
  const candidates = input.claimIds
    .map((claimId) => input.intentsByClaim.get(claimId))
    .filter((item): item is HistoryMapIntentProposalV34 => Boolean(item));
  const claimSpecific = input.mapIntents.filter(
    (intent) =>
      intent.claimIds.length === 1 && intent.claimIds.some((claimId) => input.claimIds.includes(claimId))
  );
  if (!authorizesMovement) {
    return (
      claimSpecific.find((intent) => isSinglePlaceMapPurpose(intent.mapPurpose)) ??
      candidates.find((intent) => isSinglePlaceMapPurpose(intent.mapPurpose))
    );
  }
  return (
    claimSpecific.find((intent) => isRouteMapPurpose(intent.mapPurpose)) ??
    candidates.find((intent) => isRouteMapPurpose(intent.mapPurpose)) ??
    candidates[0]
  );
}

export function beatAuthorizesRouteMovement(input: {
  readonly claimIds: readonly string[];
  readonly clusterText: string;
  readonly claims: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
}): boolean {
  if (claimAuthorizesRouteMovement(input.clusterText)) return true;
  return input.claimIds.some((claimId) => {
    const claim = input.claims.find((item) => item.id === claimId);
    return claim ? claimAuthorizesRouteMovement(claim.normalizedProposition) : false;
  });
}
export function deriveLongTextOnlyRemediationV34(input: {
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly Pick<HistoryClaimV34, "id" | "materiality" | "normalizedProposition">[];
  readonly entities: readonly {
    readonly claimId: string;
    readonly normalizedLabel: string;
    readonly entityType: string;
  }[];
  readonly durationMs: number;
  readonly mapIntents: readonly HistoryMapIntentProposalV34[];
  readonly hasEditorialOverride: boolean;
  readonly excludeModalities?: readonly HistoryVisualModalityV34[];
}): HistoryVisualModalityV34 | null {
  if (input.hasEditorialOverride || input.durationMs <= LONG_TEXT_ONLY_BLOCK_MS) return null;
  const excluded = new Set(input.excludeModalities ?? []);
  const materialClaimIds = input.claimIds.filter(
    (claimId) =>
      input.claims.find((claim) => claim.id === claimId)?.materiality === "material"
  );
  const activeClaimIds = materialClaimIds.length ? materialClaimIds : input.claimIds;
  if (!activeClaimIds.length) return null;
  const text = input.text;
  if (
    !excluded.has("diagram") &&
    /\b(?:graves?|equipment|remains|message|testimony|evidence)\b/iu.test(text) &&
    /\b(?:found|record|discovered|including|such as)\b/iu.test(text)
  )
    return "diagram";
  const placeInBeat = input.entities.some(
    (entity) =>
      materialClaimIds.includes(entity.claimId) &&
      ["place", "water-body", "region", "island", "state"].includes(entity.entityType)
  );
  if (
    !excluded.has("map") &&
    (placeInBeat ||
      (/\b(?:island|bay|river|passage|arctic|britain|territory)\b/iu.test(text) &&
        input.mapIntents.some((intent) =>
          intent.claimIds.some((claimId) => materialClaimIds.includes(claimId))
        )))
  )
    return "map";
  if (
    !excluded.has("timeline") &&
    /\b(?:\d{4}|april|june|september|year|month)\b/iu.test(text) &&
    !/\bmay\s+(?:have|not|be|well|also)\b/iu.test(text)
  )
    return "timeline";
  if (
    !excluded.has("document-or-quotation") &&
    /\b(?:note|message|wrote|account|quotation|testimony)\b/iu.test(text)
  )
    return "document-or-quotation";
  if (activeClaimIds.length > 0) return "archival image";
  return null;
}

export function claimIdsSupportingMapLabelV34(input: {
  readonly placeLabel: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
  readonly entities: readonly {
    readonly claimId: string;
    readonly normalizedLabel: string;
  }[];
}): string[] {
  const pattern = new RegExp(
    `\\b${input.placeLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`,
    "iu"
  );
  return input.claimIds.filter((claimId) => {
    const claim = input.claims.find((item) => item.id === claimId);
    if (!claim) return false;
    if (pattern.test(claim.normalizedProposition)) return true;
    return input.entities.some(
      (entity) => entity.claimId === claimId && entity.normalizedLabel === input.placeLabel
    );
  });
}

export function validateMapLabelProvenanceV34(input: {
  readonly state: HistoryMapStateV34;
  readonly claims: readonly Pick<HistoryClaimV34, "id" | "normalizedProposition">[];
  readonly entities: readonly { readonly claimId: string; readonly normalizedLabel: string }[];
}): string[] {
  const blockers: string[] = [];
  for (const label of input.state.labels) {
    const provenance = label.provenance ?? "narration-claim";
    const supported = claimIdsSupportingMapLabelV34({
      placeLabel: label.text,
      claimIds: label.linkedClaimIds,
      claims: input.claims,
      entities: input.entities,
    });
    if (provenance === "episode-context") {
      if (label.linkedClaimIds.length)
        blockers.push("MAP_LABEL_CONTEXT_CLAIM_LEAK");
      continue;
    }
    if (
      label.linkedClaimIds.length &&
      supported.length !== label.linkedClaimIds.length
    )
      blockers.push("MAP_LABEL_CLAIM_MISMATCH");
    if (!label.linkedClaimIds.length && provenance === "narration-claim")
      blockers.push("MAP_LABEL_CLAIM_MISSING");
  }
  return [...new Set(blockers)];
}

export function validateRouteVisualPurposeAlignment(input: {
  readonly visualPurpose: string;
  readonly route: { readonly origin: string; readonly destination: string };
}): string[] {
  const pattern = new RegExp(
    `from\\s+${input.route.origin.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s+to\\s+${input.route.destination.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
    "iu"
  );
  return pattern.test(input.visualPurpose) ? [] : ["ROUTE_PURPOSE_DIRECTION_MISMATCH"];
}

export function hasTextOnlyEditorialJustification(input: {
  readonly fallback: HistoryVisualPurposeV34["fallbackDecision"];
  readonly mediaJustification?: string;
}): boolean {
  const marker = /\b(?:editorial override|explicit justification)\b/iu;
  return Boolean(
    input.fallback?.semanticJustification && marker.test(input.fallback.semanticJustification)
  ) || Boolean(input.mediaJustification && marker.test(input.mediaJustification));
}

export function isLongTextOnlyWithoutJustification(input: {
  readonly modality: HistoryVisualModalityV34;
  readonly durationMs: number;
  readonly fallback: HistoryVisualPurposeV34["fallbackDecision"];
  readonly mediaJustification?: string;
}): boolean {
  return (
    input.modality === "text-only transition" &&
    input.durationMs > LONG_TEXT_ONLY_BLOCK_MS &&
    !hasTextOnlyEditorialJustification(input)
  );
}

export const FIXED_AUDIT_PLACEHOLDER_ISO = "1980-01-01T00:00:00.000Z" as const;

export function normalizeTrustedAttestationTimestampsV34<T extends {
  readonly assertedAt: string | null;
  readonly timestampStatus?: "recorded" | "not-recorded";
}>(attestation: T): T {
  if (attestation.assertedAt === FIXED_AUDIT_PLACEHOLDER_ISO) {
    return {
      ...attestation,
      assertedAt: null,
      timestampStatus: "not-recorded",
    };
  }
  return {
    ...attestation,
    timestampStatus: attestation.timestampStatus ?? (attestation.assertedAt ? "recorded" : "not-recorded"),
  };
}
