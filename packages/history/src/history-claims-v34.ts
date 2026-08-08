import { createHash } from "node:crypto";
import type { CanonicalNarrationV3_3, CanonicalNarrationUnitV3_3 } from "./history-narration-v33.js";
import { hashCanonicalV33 } from "./history-research-v33.js";
import type { HistorySourceAuthorityMode } from "./history-trusted-script-v33.js";
import {
  isEntityTypeCompatibleWithSurfaceV35,
  isSafeCanonicalEntityAliasMatchV35,
  normalizeEntityCandidateSpanV35,
} from "./history-entity-resolution-v35.js";
import {
  HISTORY_CLAIM_SCHEMA_V34,
  type HistoryClaimKindV34,
  type HistoryClaimV34,
  type HistoryEntityMentionV34,
  type HistoryEntitySemanticRoleV34,
  type HistoryEntityTypeV34,
  type HistoryGeographicQualifierV34,
  type HistoryQuantitativeQualifierV34,
  type HistoryRejectedEntityV34,
  type HistoryTemporalQualifierV34,
  type TextSpanV34,
} from "./history-v34-contracts.js";

export const HISTORY_ENTITY_STOPWORDS_V34 = new Set(
  [
    "the",
    "a",
    "an",
    "but",
    "by",
    "for",
    "from",
    "in",
    "it",
    "its",
    "later",
    "no",
    "on",
    "some",
    "that",
    "their",
    "then",
    "there",
    "they",
    "this",
    "those",
    "whaling",
    "why",
    "yet",
    "before",
    "another",
    "when",
    "others",
    "after",
    "during",
    "while",
    "although",
    "because",
    "and",
    "or",
    "of",
    "to",
    "with",
    "as",
    "at",
    "into",
    "over",
    "under",
    "all",
    "one",
    "two",
    "three",
  ].map((value) => value.toLocaleLowerCase())
);

export const HISTORY_TEMPORAL_PREFIX_PHRASES_V34 = new Set(
  [
    "in may",
    "on june",
    "in june",
    "in july",
    "in august",
    "in september",
    "in october",
    "in november",
    "in december",
    "in january",
    "in february",
    "in march",
    "in april",
    "on april",
    "on may",
  ].map((value) => value.toLocaleLowerCase())
);

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

const RHETORICAL =
  /^(?:but|however|so what|and yet|still|meanwhile|now|then|again|instead|why|yet)\b/iu;

const PRONOUNS = new Set(
  ["he", "she", "they", "it", "his", "her", "their", "its", "them", "this", "that", "these", "those"].map(
    (value) => value.toLocaleLowerCase()
  )
);

type CanonicalEntitySeed = {
  readonly label: string;
  readonly entityType: HistoryEntityTypeV34;
  readonly aliases?: readonly string[];
  readonly defaultRole?: HistoryEntitySemanticRoleV34;
  readonly episodeAffinity?: readonly RegExp[];
};

const CANONICAL_ENTITY_SEEDS: readonly CanonicalEntitySeed[] = [
  { label: "Sir John Franklin", entityType: "person", aliases: ["Franklin", "John Franklin"], defaultRole: "leader" },
  { label: "Francis Crozier", entityType: "person", aliases: ["Crozier"], defaultRole: "leader" },
  { label: "James Fitzjames", entityType: "person", aliases: ["Fitzjames"], defaultRole: "leader" },
  { label: "James Clark Ross", entityType: "person", aliases: ["Ross"] },
  { label: "John Torrington", entityType: "person" },
  { label: "John Hartnell", entityType: "person" },
  { label: "William Braine", entityType: "person" },
  { label: "Royal Navy", entityType: "organization", defaultRole: "institution" },
  { label: "HMS Erebus", entityType: "ship", aliases: ["Erebus"], defaultRole: "vehicle" },
  { label: "HMS Terror", entityType: "ship", aliases: ["Terror"], defaultRole: "vehicle" },
  { label: "Britain", entityType: "state", aliases: ["British", "Victorian Britain"], defaultRole: "origin" },
  { label: "Northwest Passage", entityType: "region", defaultRole: "destination" },
  { label: "Atlantic", entityType: "water-body", aliases: ["Atlantic Ocean"] },
  { label: "Pacific", entityType: "water-body", aliases: ["Pacific Ocean"] },
  { label: "Arctic", entityType: "region", aliases: ["Arctic Ocean"] },
  { label: "Baffin Bay", entityType: "water-body" },
  { label: "Beechey Island", entityType: "place" },
  { label: "Peel Sound", entityType: "water-body" },
  { label: "King William Island", entityType: "place", aliases: ["King William"] },
  { label: "Back River", entityType: "water-body", defaultRole: "destination" },
  { label: "Terror Bay", entityType: "water-body" },
  { label: "Victory Point note", entityType: "document", aliases: ["Victory Point"] },
  { label: "Inuit", entityType: "ethnic-or-cultural-group", aliases: ["Inuit witnesses", "Inuit communities"], defaultRole: "observer" },
  { label: "Napoleon Bonaparte", entityType: "person", aliases: ["Napoleon"], defaultRole: "leader" },
  { label: "Tsar Alexander the First", entityType: "person", aliases: ["Tsar Alexander", "Alexander the First"] },
  { label: "Mikhail Kutuzov", entityType: "person", aliases: ["Kutuzov"] },
  { label: "Grande Armée", entityType: "military-unit", aliases: ["The Grande Armée", "Grande Armee"] },
  { label: "Russia", entityType: "state", aliases: ["Russian Empire", "Russian"] },
  { label: "Poland", entityType: "state" },
  { label: "Moscow", entityType: "place", defaultRole: "destination" },
  { label: "Smolensk", entityType: "place" },
  { label: "Berezina River", entityType: "water-body", aliases: ["Berezina"] },
  { label: "Niemen River", entityType: "water-body", aliases: ["Niemen"] },
  { label: "Borodino", entityType: "place" },
  { label: "Rome", entityType: "place" },
  { label: "Roman Empire", entityType: "state", aliases: ["The Roman Empire", "Western Roman Empire"] },
  { label: "Eastern Roman Empire", entityType: "state", aliases: ["The Eastern Roman Empire", "Byzantine Empire"] },
  { label: "Roman Senate", entityType: "organization", aliases: ["The Roman Senate", "Senate"], defaultRole: "institution" },
  { label: "Church", entityType: "organization", aliases: ["The Church"], defaultRole: "institution" },
  { label: "Constantinople", entityType: "place" },
  { label: "Odoacer", entityType: "person" },
  { label: "Romulus Augustulus", entityType: "person" },
  { label: "Black Death", entityType: "disease", aliases: ["plague"] },
  { label: "Yersinia pestis", entityType: "disease" },
  { label: "Europe", entityType: "region" },
  { label: "Genoa", entityType: "place" },
  { label: "Crimea", entityType: "region" },
  { label: "Mediterranean", entityType: "water-body", aliases: ["Eastern Mediterranean"] },
  { label: "Black Sea", entityType: "water-body" },
  { label: "Messina", entityType: "place" },
  { label: "Egypt", entityType: "state" },
  { label: "Hittite Empire", entityType: "state", aliases: ["Hittite", "The Hittite Empire"] },
  { label: "Hattusa", entityType: "place" },
  { label: "Cyprus", entityType: "place" },
  { label: "Anatolia", entityType: "region" },
  { label: "Aegean", entityType: "water-body", aliases: ["the Aegean"] },
  { label: "Levant", entityType: "region", aliases: ["the Levant"] },
  { label: "Mycenae", entityType: "place" },
  { label: "Pylos", entityType: "place" },
  { label: "Ramesses III", entityType: "person", aliases: ["Pharaoh Ramesses III"] },
  { label: "Merneptah", entityType: "person" },
  { label: "Sea Peoples", entityType: "ethnic-or-cultural-group", aliases: ["the Sea Peoples"] },
  { label: "Medinet Habu", entityType: "place" },
  { label: "Austria", entityType: "state" },
  { label: "France", entityType: "state" },
  { label: "Carthage", entityType: "place" },
  { label: "Gaul", entityType: "region" },
  { label: "Danube", entityType: "water-body" },
  { label: "Friedland", entityType: "place" },
  { label: "Maloyaroslavets", entityType: "place" },
  { label: "Eastern Europe", entityType: "region" },
  { label: "North America", entityType: "region" },
  { label: "Genghis Khan", entityType: "person", aliases: ["Temüjin", "Temujin", "Chinggis Khan"], defaultRole: "leader" },
  { label: "Khwarazmian Empire", entityType: "state", aliases: ["Khwarazm"] },
  { label: "Mamluk Egypt", entityType: "state", aliases: ["Mamluks", "Mamluk"] },
  { label: "Middle East", entityType: "region" },
  { label: "Fidel Castro", entityType: "person", aliases: ["Castro"], defaultRole: "leader" },
  { label: "Nikita Khrushchev", entityType: "person", aliases: ["Khrushchev"], defaultRole: "leader" },
  { label: "John F. Kennedy", entityType: "person", aliases: ["Kennedy", "President John F. Kennedy"], defaultRole: "leader" },
  { label: "Soviet Union", entityType: "state", aliases: ["USSR", "Soviets"] },
  { label: "United States", entityType: "state", aliases: ["U.S.", "US", "America"] },
  { label: "Cuba", entityType: "state" },
  { label: "National Security Council", entityType: "organization", aliases: ["ExComm"] },
  { label: "Limited Nuclear Test Ban Treaty", entityType: "document" },
  { label: "Valentin Savitsky", entityType: "person", aliases: ["Savitsky"] },
  { label: "Rudolf Anderson", entityType: "person", aliases: ["Major Rudolf Anderson"] },
  { label: "RMS Titanic", entityType: "ship", aliases: ["Titanic"], episodeAffinity: [/titanic/i] },
  { label: "RMS Carpathia", entityType: "ship", aliases: ["Carpathia"], episodeAffinity: [/titanic/i] },
  { label: "Captain Edward Smith", entityType: "person", aliases: ["Edward Smith", "Captain Smith"] },
  { label: "William Murdoch", entityType: "person", aliases: ["First Officer William Murdoch", "Murdoch"] },
  { label: "Frederick Fleet", entityType: "person" },
  { label: "Thomas Andrews", entityType: "person" },
  { label: "North Atlantic", entityType: "water-body" },
  { label: "International Ice Patrol", entityType: "organization" },
  { label: "Cleopatra", entityType: "person", aliases: ["Cleopatra VII"], defaultRole: "leader", episodeAffinity: [/cleopatra/i] },
  { label: "Mark Antony", entityType: "person", aliases: ["Antony", "Marcus Antonius"], defaultRole: "leader" },
  { label: "Julius Caesar", entityType: "person", aliases: ["Caesar"], defaultRole: "leader", episodeAffinity: [/caesar/i] },
  { label: "Alexandria", entityType: "place" },
  { label: "Ptolemaic Egypt", entityType: "state", aliases: ["Ptolemaic"] },
  { label: "Spartacus", entityType: "person", defaultRole: "leader", episodeAffinity: [/spartacus/i] },
  { label: "Marcus Licinius Crassus", entityType: "person", aliases: ["Crassus", "Licinius Crassus"], defaultRole: "leader" },
  { label: "Hannibal Barca", entityType: "person", aliases: ["Hannibal"], defaultRole: "leader", episodeAffinity: [/hannibal/i, /cannae/i] },
  { label: "Cannae", entityType: "place" },
  { label: "Fabius Maximus", entityType: "person", aliases: ["Fabius", "Quintus Fabius Maximus"] },
  { label: "Gaius Terentius Varro", entityType: "person", aliases: ["Varro", "Terentius Varro"] },
  { label: "Lucius Aemilius Paullus", entityType: "person", aliases: ["Paullus", "Aemilius Paullus"] },
  { label: "Lake Trasimene", entityType: "place", aliases: ["Trasimene"] },
  { label: "Trebia River", entityType: "water-body", aliases: ["Trebia"] },
  { label: "Alexander the Great", entityType: "person", aliases: ["Alexander"], defaultRole: "leader", episodeAffinity: [/alexander/i, /persia/i] },
  { label: "Darius III", entityType: "person", aliases: ["Darius"] },
  { label: "Gaugamela", entityType: "place" },
  { label: "Babylon", entityType: "place" },
  { label: "Sparta", entityType: "place" },
  { label: "Thucydides", entityType: "person" },
  { label: "East Anglia", entityType: "region" },
  { label: "Wessex", entityType: "region" },
  { label: "Harald Hardrada", entityType: "person", aliases: ["Hardrada"], episodeAffinity: [/1066/i, /hardrada/i, /stamford/i] },
  { label: "Harold Godwinson", entityType: "person", aliases: ["Harold Godwinson", "King Harold"], episodeAffinity: [/1066/i, /godwinson/i, /bayeux/i] },
  { label: "Normandy", entityType: "region" },
  { label: "Stamford Bridge", entityType: "place" },
  { label: "York", entityType: "place" },
  { label: "Bayeux Tapestry", entityType: "document" },
  { label: "Mount Vesuvius", entityType: "place", aliases: ["Vesuvius"] },
  { label: "Pompeii", entityType: "place", episodeAffinity: [/pompeii/i] },
  { label: "Stabiae", entityType: "place" },
  { label: "Adrianople", entityType: "place" },
  { label: "Halicarnassus", entityType: "place" },
  { label: "Mytilene", entityType: "place" },
  { label: "Plataea", entityType: "place" },
];

const ORDINARY_NOUN_REJECT = new Set(
  [
    "exact",
    "taxes",
    "people",
    "trade",
    "disease",
    "fleas",
    "survivors",
    "army",
    "armies",
    "men",
    "ships",
    "food",
    "ice",
    "war",
    "peace",
    "death",
    "life",
    "history",
    "mystery",
    "evidence",
    "searchers",
    "officers",
    "crews",
    "bodies",
    "graves",
    "equipment",
    "message",
    "account",
    "preparation",
    "uncertainty",
    "decision",
    "leadership",
    "reinforcements",
    "tensions",
    "alexander",
    "archaeology",
    "bells",
    "climate",
    "communities",
    "conflict",
    "copper",
    "drought",
    "fear",
    "lead",
    "malnutrition",
    "modern",
    "and",
  ].map((value) => value.toLocaleLowerCase())
);

const ENTITY_BY_ALIAS = (() => {
  const map = new Map<string, CanonicalEntitySeed>();
  for (const seed of CANONICAL_ENTITY_SEEDS) {
    map.set(seed.label.toLocaleLowerCase(), seed);
    for (const alias of seed.aliases ?? []) map.set(alias.toLocaleLowerCase(), seed);
  }
  return map;
})();

const shaShort = (value: string, length = 24): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

export function hashCanonicalV34(value: unknown): string {
  return hashCanonicalV33(value);
}

export function stableClaimIdV34(input: {
  readonly episodeId: string;
  readonly normalizedProposition: string;
  readonly claimKind: HistoryClaimKindV34;
  readonly narrationUnitIds: readonly string[];
}): string {
  return `claim-${shaShort(
    hashCanonicalV34({
      episodeId: input.episodeId,
      normalizedProposition: input.normalizedProposition.trim().toLocaleLowerCase(),
      claimKind: input.claimKind,
      narrationUnitIds: [...input.narrationUnitIds].sort(),
      namespace: "history-claim.v3.4",
    })
  )}`;
}

export function isRejectedEntityTextV34(text: string): { readonly reject: boolean; readonly reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { reject: true, reason: "empty-entity" };
  const lower = trimmed.toLocaleLowerCase();
  const withoutArticle = lower.replace(/^(?:the|a|an)\s+/u, "");
  if (HISTORY_ENTITY_STOPWORDS_V34.has(lower) || HISTORY_ENTITY_STOPWORDS_V34.has(withoutArticle))
    return { reject: true, reason: "stopword" };
  if (HISTORY_TEMPORAL_PREFIX_PHRASES_V34.has(lower))
    return { reject: true, reason: "temporal-prefix-phrase" };
  if (PRONOUNS.has(lower)) return { reject: true, reason: "unresolved-pronoun" };
  if (/^each\s+/iu.test(trimmed)) return { reject: true, reason: "discourse-quantifier" };
  if (ORDINARY_NOUN_REJECT.has(lower) || ORDINARY_NOUN_REJECT.has(withoutArticle))
    return { reject: true, reason: "ordinary-noun-concept" };
  if (/^(?:in|on|by|from|to)\s+[a-z]+$/iu.test(trimmed) && !ENTITY_BY_ALIAS.has(lower) && !ENTITY_BY_ALIAS.has(withoutArticle))
    return { reject: true, reason: "prepositional-fragment" };
  if (/^\d{1,4}$/u.test(trimmed)) return { reject: true, reason: "bare-quantity-or-year" };
  if (/^(?:april|may|june|july|august|september|october|november|december|january|february|march)$/iu.test(trimmed))
    return { reject: true, reason: "bare-month" };
  // Single capitalized ordinary word at sentence start without gazetteer hit.
  if (
    /^[A-Z][a-z]+$/u.test(trimmed) &&
    !ENTITY_BY_ALIAS.has(lower) &&
    ORDINARY_NOUN_REJECT.has(lower)
  )
    return { reject: true, reason: "sentence-start-fragment" };
  return { reject: false, reason: "" };
}

const DISCOURSE_OPENER_PATTERN =
  /^(?:before|another|some|when|others|after|during|while|although|because|yet|so|but|however|each)\b/iu;

const PROPER_NOUN_SURFACE_PATTERN =
  /^[A-Z][\p{L}'-]+(?:\s+(?:[A-Z][\p{L}'-]+|III|II|IV|I|of|the|and))+|[A-Z][\p{L}'-]+(?:\s+(?:III|II|IV|I))?$/u;

function hasGeographicContextInUnitV34(unitText: string, surface: string): boolean {
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    new RegExp(
      `\\b(?:from|in|to|toward|towards|across|near|into|within|throughout|around|along)\\s+(?:the\\s+)?${escaped}\\b`,
      "iu"
    ).test(unitText) ||
    new RegExp(
      `\\b${escaped}\\s+(?:region|empire|kingdom|island|river|sea|coast|city|territory|passage|strait)\\b`,
      "iu"
    ).test(unitText)
  );
}

export function shouldSurfaceEntityCandidateV35(input: {
  readonly text: string;
  readonly unitText: string;
  readonly seed?: CanonicalEntitySeed | null;
}): boolean {
  if (input.seed) return true;
  const trimmed = normalizeEntityCandidateSpanV35(input.text.trim()).normalizedText;
  if (!trimmed) return false;
  const rejection = isRejectedEntityTextV34(trimmed);
  if (
    rejection.reject &&
    [
      "stopword",
      "ordinary-noun-concept",
      "discourse-quantifier",
      "unresolved-pronoun",
      "bare-month",
      "bare-quantity-or-year",
      "prepositional-fragment",
      "empty-entity",
      "temporal-prefix-phrase",
    ].includes(rejection.reason)
  )
    return false;
  if (isCredibleGeographicCandidateV35({ text: trimmed, seed: null, unitText: input.unitText }))
    return true;
  const inferred = inferHistoricalEntitySeedFromSurfaceV34(trimmed, input.unitText);
  return Boolean(inferred && inferred.entityType !== "place");
}

export function inferHistoricalEntitySeedFromSurfaceV34(
  text: string,
  unitText: string
): CanonicalEntitySeed | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (DISCOURSE_OPENER_PATTERN.test(trimmed) && !/\s+[A-Z]/u.test(trimmed))
    return null;

  const stripped = trimmed
    .replace(
      /^(?:The|A|An|In|On|By|For|From|Its|They|Their|This|That|Those|Later|Some|No|Why|Yet|Before|Another|When|Others|After|During|While|Although|Because|Each)\s+/u,
      ""
    )
    .trim();
  const candidate = stripped || trimmed;
  const rejection = isRejectedEntityTextV34(candidate);
  if (rejection.reject) return null;
  if (!PROPER_NOUN_SURFACE_PATTERN.test(candidate)) return null;
  if (/\b(?:were|was|are|is|had|have|became|began|collapsed|destroyed|believe|recorded|relied)\b/iu.test(candidate))
    return null;

  const tokens = candidate.split(/\s+/u);
  const aliasHit =
    ENTITY_BY_ALIAS.get(candidate.toLocaleLowerCase()) ??
    ENTITY_BY_ALIAS.get(candidate.replace(/^The\s+/u, "").toLocaleLowerCase());
  if (aliasHit) return aliasHit;
  let entityType: HistoryEntityTypeV34 = "other";
  if (/\b(?:Empire|Kingdom|Republic|Dynasty|Confederacy|Union|Civilization)\b/u.test(candidate))
    entityType = "state";
  else if (/\bPeoples?\b/u.test(candidate)) entityType = "ethnic-or-cultural-group";
  else if (/\b(?:III|II|IV|I)\b/u.test(candidate) ||
    /\b(?:Ramesses|Pharaoh|Emperor|Empress|King|Queen|Caesar|Merneptah|Tsar)\b/u.test(candidate))
    entityType = "person";
  else if (/^Russian$/iu.test(candidate)) return ENTITY_BY_ALIAS.get("russian") ?? null;
  else if (/\b(?:Sea|Ocean|Gulf|Bay|Strait|Aegean|Mediterranean)\b/u.test(candidate))
    entityType = "water-body";
  else if (/\bLevant\b/u.test(candidate)) entityType = "region";
  else if (/\b(?:tablet|inscription|relief|archive|chronicle|document|stele)\b/iu.test(unitText))
    entityType = "document";
  else if (tokens.length === 1) {
    if (!hasGeographicContextInUnitV34(unitText, candidate)) return null;
    entityType = "place";
  } else if (
    /\b(?:Sea|Ocean|Gulf|Bay|Strait|River|Aegean|Mediterranean|Danube)\b/u.test(candidate)
  )
    entityType = "water-body";
  else if (/\b(?:region|empire|kingdom|Gaul|Europe|Anatolia|Levant)\b/u.test(candidate))
    entityType = "region";
  else if (tokens.length >= 2) entityType = "place";
  else return null;

  const label = candidate.replace(/^The\s+/u, "");
  return {
    label,
    entityType,
    aliases: [...new Set([candidate, label])],
  };
}

function detectClaimKind(text: string): HistoryClaimKindV34 {
  if (/[“"][^”"]+[”"]/u.test(text) || /\b(?:wrote|note|message|account)\b/iu.test(text))
    return "quotation";
  if (/\b(?:because|led to|caused|resulted|due to)\b/iu.test(text)) return "causal";
  if (/\b(?:more than|less than|compared|rather than)\b/iu.test(text)) return "comparative";
  if (/\b(?:uncertain|debated|may have|possibly|unknown|mystery)\b/iu.test(text))
    return "uncertainty";
  if (/\b(?:perhaps|suggests|interpreted|framed as)\b/iu.test(text)) return "interpretation";
  if (/\b(?:\d{1,3}(?:,\d{3})*|\d+)\s+(?:officers|men|survivors|ships|graves|bodies)\b/iu.test(text))
    return "quantity";
  if (new RegExp(`\\b(?:${MONTHS})\\b.*\\b\\d{3,4}\\b|\\b\\d{3,4}\\b`, "iu").test(text))
    return "date";
  if (/\b(?:Sir |Captain |Commander )?[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}\b/u.test(text) &&
    /\b(?:led|commanded|died|sailed)\b/iu.test(text))
    return "person";
  if (/\b(?:Empire|Navy|Kingdom|Republic)\b/u.test(text)) return "institution";
  if (/\b(?:island|river|bay|passage|ocean|sound|coast|city|empire)\b/iu.test(text))
    return "place";
  if (/\b(?:expedition|battle|invasion|outbreak|siege|march|abandon)\b/iu.test(text))
    return "event";
  if ((text.match(/\b(?:and|then|;)\b/giu) ?? []).length >= 2) return "compound";
  return "other";
}

function isRhetoricalUnit(text: string): boolean {
  const trimmed = text.trim();
  if (RHETORICAL.test(trimmed)) return true;
  if (/^(?:why did|what happened|so what)\b/iu.test(trimmed)) return true;
  if (trimmed.length < 28 && /[.!?]$/u.test(trimmed) && !/\d{3,4}/u.test(trimmed))
    return /^(?:then they vanished|why did everyone die)\b/iu.test(trimmed);
  return false;
}

function findSpan(haystack: string, needle: string, from = 0): TextSpanV34 | null {
  const index = haystack.indexOf(needle, from);
  if (index < 0) return null;
  return { startUtf16: index, endUtf16Exclusive: index + needle.length };
}

function roleForEntity(
  seed: CanonicalEntitySeed,
  text: string
): HistoryEntitySemanticRoleV34 {
  if (seed.defaultRole) {
    // Prefer narration cues over static defaults when they contradict.
    if (
      (seed.defaultRole === "origin" || seed.defaultRole === "destination") &&
      /\bfrom\b/iu.test(text) &&
      new RegExp(`\\bfrom\\s+${seed.label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "iu").test(text)
    )
      return "origin";
    if (
      (seed.defaultRole === "origin" || seed.defaultRole === "destination") &&
      /\b(?:to|toward|towards)\b/iu.test(text) &&
      new RegExp(
        `\\b(?:to|toward|towards)\\s+(?:the\\s+)?${seed.label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
        "iu"
      ).test(text)
    )
      return "destination";
    return seed.defaultRole;
  }
  if (seed.entityType === "person") return "subject";
  if (seed.entityType === "ship") return "vehicle";
  if (seed.entityType === "organization") return "institution";
  if (seed.entityType === "place" || seed.entityType === "region" || seed.entityType === "water-body" || seed.entityType === "state")
    return /\bfrom\b/iu.test(text) ? "origin" : /\bto|toward|towards\b/iu.test(text) ? "destination" : "location";
  return "other";
}

type OccupiedSpan = { readonly start: number; readonly end: number };

function overlaps(span: OccupiedSpan, occupied: readonly OccupiedSpan[]): boolean {
  return occupied.some((item) => span.start < item.end && span.end > item.start);
}

function markOccupied(span: OccupiedSpan, occupied: OccupiedSpan[]): void {
  occupied.push(span);
}

function extractTemporalAndQuantitative(
  claimId: string,
  unit: CanonicalNarrationUnitV3_3
): {
  readonly temporal: HistoryTemporalQualifierV34[];
  readonly quantitative: HistoryQuantitativeQualifierV34[];
} {
  const temporal: HistoryTemporalQualifierV34[] = [];
  const quantitative: HistoryQuantitativeQualifierV34[] = [];
  const occupied: OccupiedSpan[] = [];
  const text = unit.text;

  const pushTemporal = (
    verbatim: string,
    kind: HistoryTemporalQualifierV34["kind"],
    localStart: number
  ): void => {
    const local = { start: localStart, end: localStart + verbatim.length };
    if (overlaps(local, occupied)) return;
    markOccupied(local, occupied);
    temporal.push({
      id: `temporal-${shaShort(`${claimId}:${verbatim.toLocaleLowerCase()}:${kind}`)}`,
      claimId,
      kind,
      normalizedValue: verbatim.replace(/\s+/gu, " ").trim(),
      verbatimText: verbatim,
      span: {
        startUtf16: unit.startUtf16 + local.start,
        endUtf16Exclusive: unit.startUtf16 + local.end,
      },
    });
  };

  // Order: full date → month/year → year range → standalone year → period phrases
  const temporalPatterns: Array<{
    readonly re: RegExp;
    readonly kind: HistoryTemporalQualifierV34["kind"];
  }> = [
    { re: new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{3,4}\\b`, "giu"), kind: "date" },
    { re: new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, "giu"), kind: "date" },
    { re: new RegExp(`\\bbetween\\s+(\\d{3,4})\\s+and\\s+(\\d{3,4})\\b`, "giu"), kind: "period" },
    { re: new RegExp(`\\b(?:${MONTHS})\\s+\\d{3,4}\\b`, "giu"), kind: "month-year" },
    { re: /\b\d{3,4}\s*(?:–|-|to)\s*\d{3,4}\b/giu, kind: "period" },
    { re: /\b(?:[1-5]\d{2}|1[6-9]\d{2}|20\d{2})\b/giu, kind: "year" },
    { re: /\b\d{1,2}(?:st|nd|rd|th)\s+century\b/giu, kind: "period" },
    { re: /\b(?:late|early|mid)\s+(?:the\s+)?\d{3,4}s\b/giu, kind: "period" },
  ];

  for (const pattern of temporalPatterns) {
    for (const match of text.matchAll(pattern.re)) {
      const verbatim = match[0]!;
      const localStart = match.index ?? text.indexOf(verbatim);
      if (localStart < 0) continue;
      if (pattern.kind === "year") {
        const after = text.slice(localStart + verbatim.length, localStart + verbatim.length + 24);
        if (
          /^\s+(officers and men|officers and crew|survivors|men|crew|ships|graves|bodies|years|miles|kilometres|kilometers|percent|%)\b/iu.test(
            after
          )
        )
          continue;
        const before = text.slice(Math.max(0, localStart - 12), localStart);
        if (/\bremaining\s+$/iu.test(before)) continue;
        const nested = occupied.some(
          (span) => localStart >= span.start && localStart + verbatim.length <= span.end
        );
        if (nested) continue;
      }
      pushTemporal(verbatim, pattern.kind, localStart);
    }
  }

  // Nested month-year inside fuller date already occupied; also drop year-only nested under month-year same event.
  const deduped: HistoryTemporalQualifierV34[] = [];
  for (const item of temporal) {
    const covered = deduped.some(
      (prior) =>
        item.span.startUtf16 >= prior.span.startUtf16 &&
        item.span.endUtf16Exclusive <= prior.span.endUtf16Exclusive &&
        item.id !== prior.id
    );
    if (!covered) deduped.push(item);
  }
  temporal.length = 0;
  temporal.push(...deduped);

  const quantityRe =
    /\b(\d{1,3}(?:,\d{3})*|\d+)\s+(officers and men|officers and crew|survivors|men|crew|ships|graves|bodies|years|miles|kilometres|kilometers|percent|%)\b/giu;
  for (const match of text.matchAll(quantityRe)) {
    const number = match[1]!;
    const unitLabel = match[2] ?? null;
    const verbatim = match[0]!;
    const localStart = match.index ?? -1;
    if (localStart < 0) continue;
    const local = { start: localStart, end: localStart + verbatim.length };
    if (overlaps(local, occupied)) continue;
    // Bare historical years without unit already handled temporally.
    if (!unitLabel) continue;
    markOccupied(local, occupied);
    quantitative.push({
      id: `quantity-${shaShort(`${claimId}:${verbatim.toLocaleLowerCase()}`)}`,
      claimId,
      kind:
        unitLabel && /year/iu.test(unitLabel)
          ? "duration"
          : unitLabel && /percent|%/iu.test(unitLabel)
            ? "percentage"
            : "count",
      normalizedValue: number.replace(/,/gu, ""),
      unit: unitLabel,
      verbatimText: verbatim,
      span: {
        startUtf16: unit.startUtf16 + local.start,
        endUtf16Exclusive: unit.startUtf16 + local.end,
      },
    });
  }

  const remainingCountRe = /\bremaining\s+(\d{1,3}(?:,\d{3})*|\d+)\b/giu;
  for (const match of text.matchAll(remainingCountRe)) {
    const number = match[1]!;
    const verbatim = match[0]!;
    const localStart = match.index ?? -1;
    if (localStart < 0) continue;
    const local = { start: localStart, end: localStart + verbatim.length };
    if (overlaps(local, occupied)) continue;
    markOccupied(local, occupied);
    quantitative.push({
      id: `quantity-${shaShort(`${claimId}:${verbatim.toLocaleLowerCase()}`)}`,
      claimId,
      kind: "count",
      normalizedValue: number.replace(/,/gu, ""),
      unit: "remaining crew",
      verbatimText: verbatim,
      span: {
        startUtf16: unit.startUtf16 + local.start,
        endUtf16Exclusive: unit.startUtf16 + local.end,
      },
    });
  }

  return { temporal, quantitative };
}

function extractTemporal(claimId: string, unit: CanonicalNarrationUnitV3_3): HistoryTemporalQualifierV34[] {
  return extractTemporalAndQuantitative(claimId, unit).temporal;
}

function extractQuantitative(
  claimId: string,
  unit: CanonicalNarrationUnitV3_3
): HistoryQuantitativeQualifierV34[] {
  return extractTemporalAndQuantitative(claimId, unit).quantitative;
}

function resolveContextualTemporalsV34(input: {
  readonly narration: CanonicalNarrationV3_3;
  readonly claims: readonly HistoryClaimV34[];
  readonly temporalQualifiers: readonly HistoryTemporalQualifierV34[];
}): HistoryTemporalQualifierV34[] {
  const unitById = new Map(input.narration.units.map((unit) => [unit.id, unit] as const));
  const monthDayPattern = new RegExp(`^(?:${MONTHS})\\s+\\d{1,2}$`, "iu");
  const monthYearPattern = new RegExp(`\\b(?:${MONTHS})\\s+(\\d{3,4})\\b`, "iu");
  const yearPattern = /\b(1[6-9]\d{2}|20\d{2})\b/u;

  return input.temporalQualifiers.map((item) => {
    if (!monthDayPattern.test(item.normalizedValue)) return item;
    const claim = input.claims.find((candidate) => candidate.id === item.claimId);
    const unit = claim ? unitById.get(claim.narrationUnitIds[0] ?? "") : undefined;
    if (!unit) return item;

    const inlineYear = new RegExp(
      `${item.normalizedValue.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:,?\\s+)(\\d{3,4})`,
      "iu"
    ).exec(unit.text);
    if (inlineYear?.[1])
      return { ...item, normalizedValue: `${item.normalizedValue}, ${inlineYear[1]}` };

    const unitIndex = input.narration.units.findIndex((candidate) => candidate.id === unit.id);
    if (/\bof that year\b/iu.test(unit.text) && unitIndex > 0) {
      for (let back = unitIndex - 1; back >= Math.max(0, unitIndex - 3); back -= 1) {
        const yearMatch = input.narration.units[back]!.text.match(yearPattern);
        if (yearMatch?.[1])
          return { ...item, normalizedValue: `${item.normalizedValue}, ${yearMatch[1]}` };
      }
    }

    if (unitIndex > 0) {
      const [month] = item.normalizedValue.split(/\s+/u);
      for (let back = unitIndex - 1; back >= Math.max(0, unitIndex - 6); back -= 1) {
        const monthYear = input.narration.units[back]!.text.match(monthYearPattern);
        if (
          monthYear?.[1] &&
          monthYear[0].toLocaleLowerCase().startsWith(month!.toLocaleLowerCase())
        )
          return { ...item, normalizedValue: `${item.normalizedValue}, ${monthYear[1]}` };
      }
    }

    return item;
  });
}

function extractEntitiesForUnit(input: {
  readonly episodeId: string;
  readonly claimId: string;
  readonly unit: CanonicalNarrationUnitV3_3;
  readonly knownEntities?: readonly string[];
}): {
  readonly entities: HistoryEntityMentionV34[];
  readonly rejected: HistoryRejectedEntityV34[];
} {
  const entities: HistoryEntityMentionV34[] = [];
  const rejected: HistoryRejectedEntityV34[] = [];
  const seen = new Set<string>();
  const candidates: Array<{ text: string; seed: CanonicalEntitySeed | null }> = [];

  const sortedAliases = [...ENTITY_BY_ALIAS.keys()].sort((a, b) => b.length - a.length);
  const lowerText = input.unit.text.toLocaleLowerCase();
  for (const alias of sortedAliases) {
    let from = 0;
    while (true) {
      const index = lowerText.indexOf(alias, from);
      if (index < 0) break;
      const before = index === 0 ? " " : input.unit.text[index - 1]!;
      const after =
        index + alias.length >= input.unit.text.length
          ? " "
          : input.unit.text[index + alias.length]!;
      if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) {
        from = index + alias.length;
        continue;
      }
      const surface = input.unit.text.slice(index, index + alias.length);
      const seed = ENTITY_BY_ALIAS.get(alias)!;
      if (
        !isSafeCanonicalEntityAliasMatchV35({
          surface,
          aliasKey: alias,
          seed,
          unitText: input.unit.text,
          episodeId: input.episodeId,
        })
      ) {
        from = index + alias.length;
        continue;
      }
      candidates.push({ text: surface, seed });
      from = index + alias.length;
    }
  }

  for (const known of input.knownEntities ?? []) {
    if (lowerText.includes(known.toLocaleLowerCase()))
      candidates.push({
        text: known,
        seed: ENTITY_BY_ALIAS.get(known.toLocaleLowerCase()) ?? {
          label: known,
          entityType: "other",
        },
      });
  }

  // Capture title-case phrases not already canonicalized, then reject stopwords.
  for (const match of input.unit.text.matchAll(
    /\b(?:(?:The|A|An|In|On|By|For|From|Its|They|Their|This|That|Those|Later|Some|No|Why|Yet)\s+)?[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,4}\b/gu
  )) {
    const surface = match[0]!;
    if (
      !shouldSurfaceEntityCandidateV35({
        text: surface,
        unitText: input.unit.text,
        seed: null,
      })
    )
      continue;
    candidates.push({ text: surface, seed: null });
  }

  for (const candidate of candidates) {
    const span = normalizeEntityCandidateSpanV35(candidate.text.trim());
    const surfaceText = span.originalText;
    const text = span.normalizedText;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rejection = isRejectedEntityTextV34(text);
    if (rejection.reject && !candidate.seed) {
      if (
        isCredibleGeographicCandidateV35({
          text,
          seed: null,
          unitText: input.unit.text,
        })
      ) {
        rejected.push({
          text: surfaceText,
          reason: rejection.reason,
          claimId: input.claimId,
          narrationUnitId: input.unit.id,
        });
      }
      continue;
    }
    if (rejection.reject && candidate.seed && HISTORY_TEMPORAL_PREFIX_PHRASES_V34.has(key)) {
      rejected.push({
        text: surfaceText,
        reason: rejection.reason,
        claimId: input.claimId,
        narrationUnitId: input.unit.id,
      });
      continue;
    }
    const seed =
      candidate.seed ??
      ENTITY_BY_ALIAS.get(key) ??
      ENTITY_BY_ALIAS.get(key.replace(/^(?:the|a|an)\s+/u, "")) ??
      null;
    if (
      seed &&
      !isSafeCanonicalEntityAliasMatchV35({
        surface: text,
        aliasKey: key,
        seed,
        unitText: input.unit.text,
        episodeId: input.episodeId,
      })
    ) {
      continue;
    }
    if (
      seed &&
      !isEntityTypeCompatibleWithSurfaceV35({ surface: text, entityType: seed.entityType })
    ) {
      continue;
    }
    if (!seed) {
      const rejection = isRejectedEntityTextV34(text);
      if (
        isCredibleGeographicCandidateV35({
          text,
          seed: null,
          unitText: input.unit.text,
        })
      ) {
        rejected.push({
          text: surfaceText,
          reason: rejection.reject ? rejection.reason : "uncanonical-surface",
          claimId: input.claimId,
          narrationUnitId: input.unit.id,
        });
      }
      continue;
    }
    // Prefer canonical seed label when alias matched.
    const normalizedLabel = seed.label;
    const local = findSpan(input.unit.text, surfaceText) ?? findSpan(input.unit.text, text);
    if (!local) continue;
    const mentionKey = `${normalizedLabel.toLocaleLowerCase()}|${seed.entityType}`;
    if (entities.some((item) => `${item.normalizedLabel.toLocaleLowerCase()}|${item.entityType}` === mentionKey))
      continue;
    entities.push({
      id: `entity-${shaShort(`${input.claimId}:${mentionKey}`)}`,
      claimId: input.claimId,
      text: surfaceText,
      normalizedLabel,
      entityType: seed.entityType,
      semanticRole: roleForEntity(seed, input.unit.text),
      narrationSpan: {
        startUtf16: input.unit.startUtf16 + local.startUtf16,
        endUtf16Exclusive: input.unit.startUtf16 + local.endUtf16Exclusive,
      },
      confidenceSource:
        candidate.seed || ENTITY_BY_ALIAS.has(key)
          ? "deterministic"
          : "deterministic-inferred",
    });
  }
  return { entities, rejected };
}

function geographicFromEntities(
  claimId: string,
  entities: readonly HistoryEntityMentionV34[],
  unitText: string
): HistoryGeographicQualifierV34[] {
  const out: HistoryGeographicQualifierV34[] = [];
  for (const entity of entities) {
    if (
      !["place", "region", "water-body", "state"].includes(entity.entityType)
    )
      continue;
    if (entity.entityType === "person" || entity.entityType === "organization") continue;
    let role: HistoryGeographicQualifierV34["role"] = "location";
    if (entity.semanticRole === "origin") role = "origin";
    else if (entity.semanticRole === "destination") role = "destination";
    else if (entity.entityType === "region") role = "region";
    else if (
      new RegExp(
        `\\bfrom\\s+(?:the\\s+)?${entity.normalizedLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
        "iu"
      ).test(unitText)
    )
      role = "origin";
    else if (
      new RegExp(
        `\\b(?:to|toward|towards)\\s+(?:the\\s+)?${entity.normalizedLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
        "iu"
      ).test(unitText)
    )
      role = "destination";
    // Never contradict entity semantic origin/destination roles.
    if (
      (entity.semanticRole === "origin" || entity.semanticRole === "destination") &&
      role !== entity.semanticRole &&
      (role === "origin" || role === "destination")
    )
      role = entity.semanticRole;
    if (entity.semanticRole === "origin") role = "origin";
    if (entity.semanticRole === "destination") role = "destination";
    out.push({
      id: `geo-${shaShort(`${claimId}:${entity.id}:${role}`)}`,
      claimId,
      entityMentionId: entity.id,
      role,
    });
  }
  return out;
}

function uncertaintyMarkers(text: string): string[] {
  const markers: string[] = [];
  for (const match of text.matchAll(
    /\b(?:uncertain|debated|may have|possibly|unknown|mystery|suggested|remains debated|no single confirmed)\b/giu
  ))
    markers.push(match[0]!);
  return [...new Set(markers)];
}

export interface HistoryStructuredClaimsV34 {
  readonly claims: HistoryClaimV34[];
  readonly entities: HistoryEntityMentionV34[];
  readonly rejectedEntities: HistoryRejectedEntityV34[];
  readonly temporalQualifiers: HistoryTemporalQualifierV34[];
  readonly geographicQualifiers: HistoryGeographicQualifierV34[];
  readonly quantitativeQualifiers: HistoryQuantitativeQualifierV34[];
}

/**
 * Offline trusted-script claim structurer.
 * Optional semantic proposals may be supplied; application code remains authoritative for IDs/spans.
 */
export function structureTrustedScriptClaimsV34(input: {
  readonly episodeId: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly authorityMode?: HistorySourceAuthorityMode;
  readonly trustAttestationId?: string | null;
  readonly knownEntities?: readonly string[];
  readonly semanticProposals?: readonly {
    readonly narrationUnitId: string;
    readonly normalizedProposition?: string;
    readonly claimKind?: HistoryClaimKindV34;
    readonly materialityRecommendation?: "material" | "non_material";
    readonly entityTexts?: readonly string[];
  }[];
}): HistoryStructuredClaimsV34 {
  const authorityMode = input.authorityMode ?? "trusted-script";
  const claims: HistoryClaimV34[] = [];
  const entities: HistoryEntityMentionV34[] = [];
  const rejectedEntities: HistoryRejectedEntityV34[] = [];
  const temporalQualifiers: HistoryTemporalQualifierV34[] = [];
  const geographicQualifiers: HistoryGeographicQualifierV34[] = [];
  const quantitativeQualifiers: HistoryQuantitativeQualifierV34[] = [];
  const proposalByUnit = new Map(
    (input.semanticProposals ?? []).map((item) => [item.narrationUnitId, item] as const)
  );

  for (const unit of input.narration.units) {
    const rhetorical = isRhetoricalUnit(unit.text);
    const proposal = proposalByUnit.get(unit.id);
    const claimKind = proposal?.claimKind ?? detectClaimKind(unit.text);
    const materiality =
      proposal?.materialityRecommendation ??
      (rhetorical ? "non_material" : "material");
    // Skip emitting a materiality-only empty claim for pure rhetorical beats? Still emit non_material.
    const normalizedProposition =
      proposal?.normalizedProposition?.trim() || unit.text.trim();
    const claimId = stableClaimIdV34({
      episodeId: input.episodeId,
      normalizedProposition,
      claimKind,
      narrationUnitIds: [unit.id],
    });
    const extracted = extractEntitiesForUnit({
      episodeId: input.episodeId,
      claimId,
      unit,
      ...(input.knownEntities ? { knownEntities: input.knownEntities } : {}),
    });
    // Semantic proposals may suggest entities, but stopwords still reject.
    for (const text of proposal?.entityTexts ?? []) {
      const rejection = isRejectedEntityTextV34(text);
      if (rejection.reject)
        rejectedEntities.push({
          text,
          reason: `semantic-proposal-${rejection.reason}`,
          claimId,
          narrationUnitId: unit.id,
        });
    }
    const temporals = extractTemporal(claimId, unit);
    const quantities = extractQuantitative(claimId, unit);
    const geos = geographicFromEntities(claimId, extracted.entities, unit.text);
    entities.push(...extracted.entities);
    rejectedEntities.push(...extracted.rejected);
    temporalQualifiers.push(...temporals);
    quantitativeQualifiers.push(...quantities);
    geographicQualifiers.push(...geos);
    claims.push({
      id: claimId,
      episodeId: input.episodeId,
      narrationUnitIds: [unit.id],
      narrationSpans: [
        { startUtf16: unit.startUtf16, endUtf16Exclusive: unit.endUtf16Exclusive },
      ],
      verbatimTexts: [unit.text],
      normalizedProposition,
      claimKind,
      materiality,
      entityMentionIds: extracted.entities.map((item) => item.id),
      temporalQualifierIds: temporals.map((item) => item.id),
      geographicQualifierIds: geos.map((item) => item.id),
      quantitativeQualifierIds: quantities.map((item) => item.id),
      uncertaintyMarkers: uncertaintyMarkers(unit.text),
      authorityMode,
      provenanceStatus:
        materiality === "material" ? "trusted_input" : "not_required",
      trustAttestationId: input.trustAttestationId ?? null,
      independentlyVerified: false,
      schemaVersion: HISTORY_CLAIM_SCHEMA_V34,
    });
  }

  const resolvedTemporalQualifiers = resolveContextualTemporalsV34({
    narration: input.narration,
    claims,
    temporalQualifiers,
  });

  return {
    claims,
    entities,
    rejectedEntities: rejectedEntities.sort((a, b) =>
      a.text.localeCompare(b.text) || (a.claimId ?? "").localeCompare(b.claimId ?? "")
    ),
    temporalQualifiers: resolvedTemporalQualifiers,
    geographicQualifiers,
    quantitativeQualifiers,
  };
}

export function validateStructuredClaimsV34(
  structured: HistoryStructuredClaimsV34
): { readonly ok: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const claimIds = new Set(structured.claims.map((claim) => claim.id));
  if (claimIds.size !== structured.claims.length)
    errors.push("Duplicate claim IDs in canonical namespace.");
  if (structured.claims.some((claim) => claim.id.startsWith("trusted-claim-")))
    errors.push("trusted-claim-* namespace is prohibited in V3.4.");
  for (const entity of structured.entities) {
    if (!claimIds.has(entity.claimId)) errors.push(`Entity ${entity.id} references missing claim.`);
    const rejection = isRejectedEntityTextV34(entity.text);
    if (rejection.reject && !ENTITY_BY_ALIAS.has(entity.text.toLocaleLowerCase()))
      errors.push(`Canonical entity '${entity.text}' should have been rejected (${rejection.reason}).`);
    if (entity.entityType === "person" && entity.semanticRole === "origin")
      errors.push(`Person ${entity.normalizedLabel} cannot be a geographic origin.`);
  }
  for (const geo of structured.geographicQualifiers) {
    const entity = structured.entities.find((item) => item.id === geo.entityMentionId);
    if (!entity) errors.push(`Geographic qualifier ${geo.id} missing entity.`);
    else if (entity.entityType === "person")
      errors.push(`Person ${entity.normalizedLabel} cannot be a geographic qualifier.`);
    else if (entity.entityType === "organization")
      errors.push(
        `Organization ${entity.normalizedLabel} cannot be a geographic qualifier without location confirmation.`
      );
  }
  for (const quantity of structured.quantitativeQualifiers) {
    if (/^(?:1[6-9]\d{2}|20\d{2})$/u.test(quantity.normalizedValue) && quantity.kind === "count" && !quantity.unit)
      errors.push(`Quantity ${quantity.id} looks like a year without unit.`);
  }
  for (const temporal of structured.temporalQualifiers) {
    if (/\b(?:uncertain|maybe)\b/iu.test(temporal.verbatimText))
      errors.push(`Temporal qualifier ${temporal.id} misclassified as uncertainty text.`);
  }
  return { ok: errors.length === 0, errors };
}

const GEOGRAPHIC_ENTITY_TYPES = new Set([
  "place",
  "region",
  "water-body",
  "state",
  "island",
]);

export function isCredibleGeographicCandidateV35(input: {
  readonly text: string;
  readonly seed?: CanonicalEntitySeed | null;
  readonly entityType?: string;
  readonly unitText?: string;
}): boolean {
  const trimmed = input.text.trim();
  if (!trimmed) return false;
  const rejection = isRejectedEntityTextV34(trimmed);
  if (
    rejection.reject &&
    ["ordinary-noun-concept", "stopword", "discourse-quantifier", "unresolved-pronoun"].includes(
      rejection.reason
    )
  )
    return false;
  if (input.seed && GEOGRAPHIC_ENTITY_TYPES.has(input.seed.entityType)) return true;
  if (input.entityType && GEOGRAPHIC_ENTITY_TYPES.has(input.entityType)) return true;
  const canonical = ENTITY_BY_ALIAS.get(trimmed.toLocaleLowerCase());
  if (canonical && GEOGRAPHIC_ENTITY_TYPES.has(canonical.entityType)) return true;
  const inferred = inferHistoricalEntitySeedFromSurfaceV34(
    trimmed,
    input.unitText ?? trimmed
  );
  return Boolean(inferred && GEOGRAPHIC_ENTITY_TYPES.has(inferred.entityType));
}

export function lookupCanonicalEntitySeedV34(
  text: string
): CanonicalEntitySeed | null {
  const lower = text.trim().toLocaleLowerCase();
  return (
    ENTITY_BY_ALIAS.get(lower) ??
    ENTITY_BY_ALIAS.get(lower.replace(/^(?:the|a|an)\s+/u, "")) ??
    inferHistoricalEntitySeedFromSurfaceV34(text, text) ??
    null
  );
}

export function validateGeographicRolesV34(input: {
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
}): { readonly ok: boolean; readonly errors: readonly string[] } {
  const entityById = new Map(input.entities.map((item) => [item.id, item] as const));
  const errors: string[] = [];
  for (const geo of input.geographicQualifiers) {
    const entity = entityById.get(geo.entityMentionId);
    if (!entity) {
      errors.push(`GEOGRAPHIC_ROLE_MISMATCH missing entity for ${geo.id}`);
      continue;
    }
    if (
      (entity.semanticRole === "origin" || entity.semanticRole === "destination") &&
      geo.role !== entity.semanticRole &&
      (geo.role === "origin" || geo.role === "destination")
    )
      errors.push(
        `GEOGRAPHIC_ROLE_MISMATCH ${entity.normalizedLabel}: entity=${entity.semanticRole} geo=${geo.role}`
      );
  }
  return { ok: errors.length === 0, errors };
}
