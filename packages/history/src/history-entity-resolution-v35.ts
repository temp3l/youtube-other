import type { HistoryEntityTypeV34 } from "./history-v34-contracts.js";

export type EntityKindV35 =
  | "place"
  | "person"
  | "organization"
  | "event"
  | "military-unit"
  | "ship"
  | "institution"
  | "artifact"
  | "other";

export type ResolutionExpectationV35 =
  | "required"
  | "preferred"
  | "optional"
  | "not-applicable";

export type AliasStrengthV35 = "exact" | "strong" | "weak";

export type EntityCandidateV35 = {
  readonly surface: string;
  readonly normalizedSurface: string;
  readonly kind: EntityKindV35;
  readonly confidence: number;
  readonly sourceBeatIds: readonly string[];
  readonly geographicRelevance: boolean;
  readonly resolutionExpectation: ResolutionExpectationV35;
};

export type ResolutionMethodV35 =
  | "exact-canonical"
  | "exact-strong-alias"
  | "normalized-strong-alias"
  | "contextual-weak-alias"
  | "adjudicated";

export type EntityResolutionV35 =
  | {
      readonly status: "resolved";
      readonly entityId: string;
      readonly canonicalLabel: string;
      readonly confidence: number;
      readonly method: ResolutionMethodV35;
    }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly string[];
      readonly reason: string;
    }
  | {
      readonly status: "unresolved";
      readonly reason: string;
    };

export type ResolutionAdjudicationInputV35 = {
  readonly surface: string;
  readonly surroundingContext: string;
  readonly expectedKinds: readonly EntityKindV35[];
  readonly candidateEntityIds: readonly string[];
};

export type ResolutionAdjudicationResultV35 =
  | { readonly decision: "select"; readonly entityId: string; readonly confidence: number }
  | { readonly decision: "none"; readonly confidence: number }
  | { readonly decision: "ambiguous"; readonly confidence: number };

export type CanonicalEntitySeedV35 = {
  readonly label: string;
  readonly entityType: HistoryEntityTypeV34;
  readonly aliases?: readonly string[];
  readonly defaultRole?: import("./history-v34-contracts.js").HistoryEntitySemanticRoleV34;
  readonly episodeAffinity?: readonly RegExp[];
};

const GEOGRAPHIC_ENTITY_TYPES = new Set<HistoryEntityTypeV34>([
  "place",
  "region",
  "water-body",
  "state",
  "island",
]);

const ORGANIZATION_SURFACE_PATTERN =
  /\b(?:Assembly|Convention|Project|Triumvirate|Courts?|Committee|Council|Senate|Navy|Empire)\b/u;
const MILITARY_UNIT_SURFACE_PATTERN =
  /\b(?:Army|Legion|Corps|Fleet|Division|Brigade|Battalion)\b/u;
const GEOGRAPHIC_SURFACE_PATTERN =
  /\b(?:Island|Islands|Bay|Sea|Ocean|Gulf|Strait|Channel|Lake|River|Horn|Harbor|Harbour|Africa|Minor|City|Wat|Peninsula|Plateau|Valley|Desert|Passage|Sound|Coast)\b/u;
const EVENT_SURFACE_PATTERN =
  /\b(?:Reign of Terror|Great Terror|Terror Period)\b/iu;
const PERSON_GIVEN_NAME_PATTERN =
  /^(?:Marie|Georges|Maximilien|Louis|Charles|Elizabeth|Catherine|Joseph|Napoleon|Alexander|William|John|James|Henry|Edward|George)\s+[A-Z]/u;

export function mapEntityTypeToKindV35(entityType: HistoryEntityTypeV34): EntityKindV35 {
  switch (entityType) {
    case "place":
    case "region":
    case "water-body":
    case "state":
    case "island":
      return "place";
    case "person":
      return "person";
    case "organization":
      return "institution";
    case "ship":
      return "ship";
    case "military-unit":
      return "military-unit";
    case "event":
      return "event";
    case "document":
    case "object":
    case "disease":
      return "artifact";
    default:
      return "other";
  }
}

export function classifyEntityCandidateV35(input: {
  readonly surface: string;
  readonly unitText?: string;
  readonly seed?: Pick<CanonicalEntitySeedV35, "label" | "entityType"> | null;
}): Pick<
  EntityCandidateV35,
  "kind" | "confidence" | "geographicRelevance" | "resolutionExpectation"
> {
  const normalizedSurface = normalizeEntityCandidateSpanV35(input.surface.trim()).normalizedText;
  const trimmed = normalizedSurface.trim();
  if (!trimmed) {
    return {
      kind: "other",
      confidence: 0,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }

  const canonical = input.seed ?? null;
  if (canonical) {
    const kind = mapEntityTypeToKindV35(canonical.entityType);
    const geographic = GEOGRAPHIC_ENTITY_TYPES.has(canonical.entityType);
    return {
      kind,
      confidence: 0.95,
      geographicRelevance: geographic,
      resolutionExpectation: geographic ? "preferred" : "not-applicable",
    };
  }

  if (EVENT_SURFACE_PATTERN.test(trimmed)) {
    return {
      kind: "event",
      confidence: 0.9,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }
  if (/^(?:The\s+)?Republic$/iu.test(trimmed)) {
    return {
      kind: "organization",
      confidence: 0.85,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }
  if (MILITARY_UNIT_SURFACE_PATTERN.test(trimmed)) {
    return {
      kind: "military-unit",
      confidence: 0.85,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }
  if (ORGANIZATION_SURFACE_PATTERN.test(trimmed)) {
    return {
      kind: "organization",
      confidence: 0.85,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }
  if (PERSON_GIVEN_NAME_PATTERN.test(trimmed)) {
    return {
      kind: "person",
      confidence: 0.8,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }
  if (GEOGRAPHIC_SURFACE_PATTERN.test(trimmed)) {
    return {
      kind: "place",
      confidence: 0.75,
      geographicRelevance: true,
      resolutionExpectation: "preferred",
    };
  }

  const tokens = trimmed.split(/\s+/u);
  if (tokens.length === 1 && /^[A-Z][\p{L}'-]+$/u.test(trimmed)) {
    const unitText = input.unitText ?? trimmed;
    if (
      /\b(?:from|in|to|across|near|into|within|throughout|around|along)\s+(?:the\s+)?/iu.test(
        unitText
      ) &&
      new RegExp(
        `\\b(?:from|in|to|across|near|into|within|throughout|around|along)\\s+(?:the\\s+)?${trimmed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`,
        "iu"
      ).test(unitText)
    ) {
      return {
        kind: "place",
        confidence: 0.65,
        geographicRelevance: true,
        resolutionExpectation: "optional",
      };
    }
  }

  if (tokens.length >= 2 && /^[A-Z]/u.test(trimmed) && !GEOGRAPHIC_SURFACE_PATTERN.test(trimmed)) {
    return {
      kind: "person",
      confidence: 0.55,
      geographicRelevance: false,
      resolutionExpectation: "not-applicable",
    };
  }

  return {
    kind: "other",
    confidence: 0.4,
    geographicRelevance: false,
    resolutionExpectation: "not-applicable",
  };
}

export function isEligibleGeographicResolutionCandidateV35(input: {
  readonly text: string;
  readonly seed?: Pick<CanonicalEntitySeedV35, "label" | "entityType"> | null;
  readonly entityType?: string;
  readonly unitText?: string;
}): boolean {
  if (input.seed && GEOGRAPHIC_ENTITY_TYPES.has(input.seed.entityType)) return true;
  if (input.entityType && GEOGRAPHIC_ENTITY_TYPES.has(input.entityType as HistoryEntityTypeV34))
    return true;

  const classification = classifyEntityCandidateV35({
    surface: input.text,
    ...(input.unitText !== undefined ? { unitText: input.unitText } : {}),
    seed: input.seed ?? null,
  });
  return (
    classification.kind === "place" &&
    classification.geographicRelevance &&
    classification.resolutionExpectation !== "not-applicable"
  );
}

export function isHistoricalEventTerrorContextV35(unitText: string): boolean {
  return (
    /\bReign of Terror\b/iu.test(unitText) ||
    /\bGreat Terror\b/iu.test(unitText) ||
    (/\bthe Terror\b/iu.test(unitText) && !/\bHMS\s+Terror\b/iu.test(unitText))
  );
}

export function resolveCanonicalEntityV35(input: {
  readonly surface: string;
  readonly unitText: string;
  readonly episodeId: string;
  readonly seed?: CanonicalEntitySeedV35 | null;
}): EntityResolutionV35 {
  const span = normalizeEntityCandidateSpanV35(input.surface.trim());
  const normalized = span.normalizedText.trim();
  if (!normalized) return { status: "unresolved", reason: "empty-surface" };

  const canonical = input.seed ?? null;
  if (!canonical) {
    const classification = classifyEntityCandidateV35({
      surface: normalized,
      unitText: input.unitText,
      seed: null,
    });
    if (classification.geographicRelevance) {
      return { status: "unresolved", reason: "uncanonical-geographic-surface" };
    }
    return { status: "unresolved", reason: "uncanonical-surface" };
  }

  const aliasKey = normalized.toLocaleLowerCase();
  const labelKey = canonical.label.toLocaleLowerCase();
  const isExactCanonical = aliasKey === labelKey;
  const isStrongAlias = (canonical.aliases ?? []).some(
    (alias) => alias.toLocaleLowerCase() === aliasKey
  );

  if (
    !isSafeCanonicalEntityAliasMatchV35({
      surface: normalized,
      aliasKey,
      seed: canonical,
      unitText: input.unitText,
      episodeId: input.episodeId,
    })
  ) {
    if (canonical.label === "HMS Terror" && isHistoricalEventTerrorContextV35(input.unitText)) {
      return { status: "unresolved", reason: "historical-event-terror-context" };
    }
    return { status: "ambiguous", candidates: [canonical.label], reason: "unsafe-alias-match" };
  }

  let method: ResolutionMethodV35 = "exact-canonical";
  if (!isExactCanonical && isStrongAlias) method = "exact-strong-alias";
  else if (!isExactCanonical) method = "normalized-strong-alias";

  return {
    status: "resolved",
    entityId: canonical.label,
    canonicalLabel: canonical.label,
    confidence: isExactCanonical ? 1 : isStrongAlias ? 0.95 : 0.85,
    method,
  };
}

export function adjudicateEntityResolutionV35(
  input: ResolutionAdjudicationInputV35,
  adjudicator?: (
    payload: ResolutionAdjudicationInputV35
  ) => ResolutionAdjudicationResultV35 | null | undefined
): EntityResolutionV35 {
  if (!adjudicator || input.candidateEntityIds.length === 0) {
    return {
      status: "ambiguous",
      candidates: input.candidateEntityIds,
      reason: "adjudication-unavailable",
    };
  }
  const result = adjudicator(input);
  if (!result) {
    return {
      status: "ambiguous",
      candidates: input.candidateEntityIds,
      reason: "adjudication-unavailable",
    };
  }
  if (result.decision === "select") {
    if (!input.candidateEntityIds.includes(result.entityId)) {
      return { status: "unresolved", reason: "adjudication-invalid-entity-id" };
    }
    return {
      status: "resolved",
      entityId: result.entityId,
      canonicalLabel: result.entityId,
      confidence: result.confidence,
      method: "adjudicated",
    };
  }
  if (result.decision === "none") {
    return { status: "unresolved", reason: "adjudication-rejected" };
  }
  return {
    status: "ambiguous",
    candidates: input.candidateEntityIds,
    reason: "adjudication-ambiguous",
  };
}

const DISCOURSE_PREFIX_TOKENS = new Set([
  "at",
  "in",
  "on",
  "but",
  "perhaps",
  "as",
  "earlier",
  "maybe",
  "then",
  "thus",
  "also",
  "even",
  "yet",
  "so",
  "now",
  "still",
  "once",
  "near",
  "under",
  "after",
]);

const AMERICA_REGION_QUALIFIERS = new Set([
  "central",
  "south",
  "north",
  "latin",
  "meso",
  "anglo",
]);

export type NormalizedEntityCandidateSpanV35 = {
  readonly originalText: string;
  readonly normalizedText: string;
  readonly hadDiscoursePrefix: boolean;
};

/**
 * Strip sentence/discourse prefixes from malformed entity candidate spans while
 * preserving legitimate names whose first token merely resembles a prefix.
 */
export function normalizeEntityCandidateSpanV35(text: string): NormalizedEntityCandidateSpanV35 {
  const originalText = text.trim();
  if (!originalText) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const tokens = originalText.split(/\s+/u);
  if (tokens.length < 2) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const firstToken = tokens[0]!.toLocaleLowerCase();
  const remainder = tokens.slice(1).join(" ");
  if (!DISCOURSE_PREFIX_TOKENS.has(firstToken)) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  if (!/^[A-Z]/.test(tokens[1]!)) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const normalizedText = remainder.replace(/^[,.:;]+/u, "").trim();
  if (!normalizedText || normalizedText.split(/\s+/u).length === 0) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  return { originalText, normalizedText, hadDiscoursePrefix: true };
}

const AMBIGUOUS_ALIAS_KEYS = new Set([
  "terror",
  "plague",
  "erebus",
  "death",
  "fear",
]);

const EPISODE_AFFINITY_BY_LABEL = new Map<string, readonly RegExp[]>([
  ["HMS Terror", [/franklin/i, /northwest passage/i]],
  ["HMS Erebus", [/franklin/i, /northwest passage/i]],
  ["Black Death", [/black-death/i, /black death/i]],
  ["RMS Titanic", [/titanic/i]],
  ["RMS Carpathia", [/titanic/i, /carpathia/i]],
  ["Alexander the Great", [/alexander/i, /persia/i]],
  ["Julius Caesar", [/caesar/i]],
  ["Cleopatra", [/cleopatra/i]],
  ["Spartacus", [/spartacus/i]],
  ["Hannibal Barca", [/hannibal/i, /cannae/i]],
]);

export function isAmbiguousCanonicalAliasV35(aliasKey: string): boolean {
  return AMBIGUOUS_ALIAS_KEYS.has(aliasKey.toLocaleLowerCase());
}

export function episodeAffinityMatchesV35(
  episodeId: string,
  seed: Pick<CanonicalEntitySeedV35, "label" | "episodeAffinity">
): boolean {
  const patterns = seed.episodeAffinity ?? EPISODE_AFFINITY_BY_LABEL.get(seed.label) ?? [];
  return patterns.length === 0 || patterns.some((pattern) => pattern.test(episodeId));
}

function isQualifiedAmericaSubspanV35(input: {
  readonly surface: string;
  readonly unitText: string;
  readonly spanStart?: number;
}): boolean {
  if (input.spanStart !== undefined) {
    if (input.spanStart <= 0) return false;
    const before = input.unitText.slice(0, input.spanStart).trimEnd();
    const lastWord = before.match(/([\p{L}]+)\s*$/u)?.[1]?.toLocaleLowerCase();
    return lastWord !== undefined && AMERICA_REGION_QUALIFIERS.has(lastWord);
  }
  const surfacePattern = input.surface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const qualifiedPattern = new RegExp(
    `\\b(?:Central|South|North|Latin|Meso|Anglo)\\s+(${surfacePattern})\\b`,
    "iu"
  );
  if (!qualifiedPattern.test(input.unitText)) return false;
  const standalonePattern = new RegExp(
    `(?<!\\p{L})(?:${surfacePattern})(?!\\p{L})`,
    "iu"
  );
  const withoutQualified = input.unitText.replace(
    /\b(?:Central|South|North|Latin|Meso|Anglo)\s+America\b/giu,
    ""
  );
  return !standalonePattern.test(withoutQualified);
}

export function isSafeCanonicalEntityAliasMatchV35(input: {
  readonly surface: string;
  readonly aliasKey: string;
  readonly seed: Pick<CanonicalEntitySeedV35, "label" | "entityType" | "episodeAffinity">;
  readonly unitText: string;
  readonly episodeId: string;
  readonly spanStart?: number;
}): boolean {
  const aliasLower = input.aliasKey.toLocaleLowerCase();
  const surfaceLower = input.surface.toLocaleLowerCase();
  const labelLower = input.seed.label.toLocaleLowerCase();

  if (surfaceLower === labelLower || input.surface === input.seed.label) return true;

  if (input.seed.label === "United States") {
    if (aliasLower === "us") return input.surface === "US";
    if (aliasLower === "u.s.") return input.surface === "U.S.";
    if (aliasLower === "america" && isQualifiedAmericaSubspanV35(input)) return false;
  }

  if (input.seed.label === "HMS Terror") {
    if (isHistoricalEventTerrorContextV35(input.unitText)) return false;
    if (surfaceLower === "terror" && input.surface !== "Terror") return false;
    if (/\bHMS\s+Terror\b/iu.test(input.unitText)) return true;
    if (
      input.surface === "Terror" &&
      /\b(?:ship|vessel|Franklin|Erebus|expedition|Arctic|Royal Navy)\b/iu.test(input.unitText) &&
      episodeAffinityMatchesV35(input.episodeId, input.seed)
    )
      return true;
    return false;
  }

  if (input.seed.label === "HMS Erebus") {
    if (surfaceLower === "erebus" && input.surface !== "Erebus") return false;
    if (/\bHMS\s+Erebus\b/iu.test(input.unitText)) return true;
    if (input.surface === "Erebus" && episodeAffinityMatchesV35(input.episodeId, input.seed))
      return true;
    return false;
  }

  if (input.seed.label === "Black Death" && aliasLower === "plague") {
    if (/roman-empire|fall-of-the-roman/i.test(input.episodeId)) return false;
    if (/\bBlack Death\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (input.seed.label === "RMS Titanic" && aliasLower === "titanic") {
    return (
      /\bRMS\s+Titanic\b/iu.test(input.unitText) ||
      episodeAffinityMatchesV35(input.episodeId, input.seed)
    );
  }

  if (input.seed.label === "RMS Carpathia" && aliasLower === "carpathia") {
    return (
      /\bRMS\s+Carpathia\b/iu.test(input.unitText) ||
      episodeAffinityMatchesV35(input.episodeId, input.seed)
    );
  }

  if (input.seed.label === "Alexander the Great" && aliasLower === "alexander") {
    if (/napoleon|kutuzov|tsar-alexander/i.test(input.episodeId)) return false;
    if (/\bAlexander the Great\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (input.seed.label === "Julius Caesar" && aliasLower === "caesar") {
    if (/\bJulius Caesar\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (isAmbiguousCanonicalAliasV35(aliasLower)) {
    if (surfaceLower !== aliasLower) return false;
    if (!episodeAffinityMatchesV35(input.episodeId, input.seed)) return false;
  }

  if (
    input.seed.entityType === "ship" &&
    surfaceLower.length <= 12 &&
    !/\b(?:HMS|RMS|SS|USS|MV)\b/iu.test(input.unitText) &&
    !episodeAffinityMatchesV35(input.episodeId, input.seed)
  ) {
    return false;
  }

  if (
    input.seed.entityType === "disease" &&
    aliasLower !== labelLower &&
    !/\bBlack Death\b/iu.test(input.unitText) &&
    !episodeAffinityMatchesV35(input.episodeId, input.seed)
  ) {
    return false;
  }

  return true;
}

export function isEntityTypeCompatibleWithSurfaceV35(input: {
  readonly surface: string;
  readonly entityType: HistoryEntityTypeV34;
}): boolean {
  const surfaceLower = input.surface.toLocaleLowerCase();
  if (input.entityType === "ship") {
    return (
      /\b(?:HMS|RMS|SS|USS|MV)\b/iu.test(input.surface) ||
      /^[A-Z][\p{L}'-]+$/u.test(input.surface)
    );
  }
  if (input.entityType === "disease") {
    return (
      !["terror", "fear", "death", "war", "plague"].includes(surfaceLower) ||
      /\bBlack Death\b/iu.test(input.surface)
    );
  }
  return true;
}
