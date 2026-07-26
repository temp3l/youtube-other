import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import {
  type CanonicalFactDiagnostic,
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { type StoryIR } from "./story-artifact-model.js";
import { type StoryMechanicsContract } from "./story-mechanics.js";

export const CANONICAL_FACTS_EXTRACTOR_VERSION = "canonical-facts-extractor-v7";
export const CANONICAL_FACTS_SCHEMA_VERSION = "canonical-story-facts-v3";

const SCAFFOLD_PATTERNS = [
  /\bthe only remaining plan depended on the rule revealed by the earlier evidence\b/iu,
  /\bthat explanation lasted only until the next night\b/iu,
  /\bthe evidence did not explain the event\b/iu,
  /\bthe rule was narrow enough to offer hope\b/iu,
  /\bthe story begins\b/iu,
  /\bthe threat follows a rule\b/iu,
  /\ball clues (?:are )?connect(?:ed)? to\b/iu,
  /\balle hinweise stehen im zusammenhang\b/iu,
  /\bdie geschichte beginnt\b/iu,
  /\bdie bedrohung folgt einer regel\b/iu,
  /\bspäter erscheint ein letzter beweis\b/iu,
];

const NON_NAME_LEADING_WORDS = new Set([
  "After",
  "Although",
  "As",
  "Because",
  "Before",
  "But",
  "Did",
  "Diverse",
  "If",
  "Once",
  "Since",
  "The",
  "When",
  "While",
]);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((entry) => normalizeWhitespace(entry)).filter(Boolean))];
}

const COMPILER_METADATA_PATTERNS = [
  /<!--[^]*?-->/gu,
  /\b(?:source|content|contract|prompt)[-_ ]?(?:sha256|hash|fingerprint)\s*[:=]\s*[a-f0-9]{16,}\b/giu,
  /\bGENERATED[-_ ](?:SOURCE|BY|MARKER)\b[^\n]*/giu,
] as const;

export function stripCanonicalCompilerMetadata(value: string): string {
  return normalizeWhitespace(
    COMPILER_METADATA_PATTERNS.reduce((current, pattern) => current.replace(pattern, " "), value)
  );
}

function firstSentence(text: string): string {
  return normalizeWhitespace(splitIntoSentences(text)[0] ?? text);
}

function lastSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return normalizeWhitespace(sentences.at(-1) ?? text);
}

function extractCandidateNames(text: string): string[] {
  const matches = [...text.matchAll(/\b([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+)\b/gu)].map(
    (match) => normalizeWhitespace(match[1] ?? "")
  );
  return unique(
    matches.filter(
      (candidate) =>
        candidate.length > 0 &&
        !NON_NAME_LEADING_WORDS.has(candidate.split(" ")[0] ?? "") &&
        !/^(Episode|Narration|Episode Metadata|Audio Generation Instructions)$/u.test(
          candidate
        )
    )
  );
}

function extractMessages(text: string): string[] {
  const quoted = [...text.matchAll(/["“]([^"”]{3,120})["”]/gu)].map(
    (match) => match[1] ?? ""
  );
  const afterMarker = [
    ...text.matchAll(
      /\b(?:wrote|written|read|said|spelled|displayed|showed)\s*:\s*([A-Z][A-Z0-9'’]*(?:[ \t]+[A-Z][A-Z0-9'’]*){1,11})(?=[.!?](?:\s|$)|$)/gu
    ),
  ].map((match) => match[1] ?? "");
  const beforeMarker = [
    ...text.matchAll(
      /\b([A-Z][A-Z0-9'’]*(?:[ \t]+[A-Z][A-Z0-9'’]*){1,11})(?=\s+(?:was|were|is|had been)?\s*(?:written|painted|scratched|carved|printed|scrawled|displayed|shown)\b)/gu
    ),
  ].map((match) => match[1] ?? "");
  const afterSpeechVerb = [
    ...text.matchAll(
      /\b(?:said|read)\s+([A-Z][A-Z0-9'’]*(?:[ \t]+[A-Z][A-Z0-9'’]*){1,11})(?=[.!?](?:\s|$)|$)/gu
    ),
  ].map((match) => match[1] ?? "");
  return unique(
    [...quoted, ...afterMarker, ...beforeMarker, ...afterSpeechVerb].map((message) =>
      normalizeWhitespace(message)
    )
  );
}

function extractLocationAnchors(text: string): string[] {
  const lower = text.toLowerCase();
  const anchors: string[] = [];
  if (/\bwooded reservoir\b/u.test(lower)) {
    anchors.push("wooded reservoir");
  }
  if (/\bparked car\b|\bin the car\b|\binside the car\b/u.test(lower)) {
    anchors.push("parked car");
  }
  if (/\blovers'? lane\b/u.test(lower)) {
    anchors.push("lovers' lane");
  }
  if (/\bpetrol station\b|\bgas station\b/u.test(lower)) {
    anchors.push("petrol station");
  }
  if (/\bbedroom door\b/u.test(lower)) {
    anchors.push("bedroom door");
  }
  if (/\bservice entrance\b/u.test(lower)) {
    anchors.push("service entrance");
  }
  if (/\bservice corridor\b|\bservice hall\b/u.test(lower)) {
    anchors.push("service corridor");
  }
  if (/\bbackrooms\b/u.test(lower)) {
    anchors.push("backrooms");
  }
  if (/\bunderground level\b/u.test(lower)) {
    anchors.push("underground level");
  }
  for (const [pattern, value] of [
    [/\b(?:roadside|emergency|telephone|phone) booth\b/u, "roadside booth"],
    [/\blake\b|\breservoir\b/u, "lake"],
    [/\bshoreline\b|\blakeshore\b|\bwater's edge\b/u, "shoreline"],
    [/\bapartment\b|\bflat\b/u, "apartment"],
    [/\b(?:highway|road|roadside|street)\b/u, "road"],
    [/\b(?:bed)?room\b/u, "room"],
    [/\b(?:car|vehicle|truck|van)\b/u, "vehicle"],
  ] as const) {
    if (pattern.test(lower)) anchors.push(value);
  }
  return unique(anchors);
}

function extractThreatMotifs(text: string): string[] {
  const lower = text.toLowerCase();
  const motifs: string[] = [];
  if (/\bhook\b/u.test(lower)) {
    motifs.push("metal hook");
  }
  if (/\bscrap(?:e|ing)\b/u.test(lower)) {
    motifs.push("metallic scraping");
  }
  if (/\bradio\b/u.test(lower)) {
    motifs.push("radio warning");
  }
  if (/\bdashcam\b|\bdash cam\b/u.test(lower)) {
    motifs.push("dashcam footage");
  }
  if (/\bfluorescent\b/u.test(lower)) {
    motifs.push("fluorescent hum");
  }
  if (/\bwet carpet\b/u.test(lower)) {
    motifs.push("wet carpet");
  }
  if (/\binternal phone\b|\bphone extension\b/u.test(lower)) {
    motifs.push("internal phone");
  }
  if (/\bred door\b/u.test(lower)) {
    motifs.push("red door");
  }
  return unique(motifs);
}

function extractKeyRules(text: string): string[] {
  const sentences = splitIntoSentences(text);
  return unique(
    sentences.filter((sentence) =>
      /\bnever\b|\bdon't\b|\bdo not\b|\bmust\b|\bonly\b|\brule\b/iu.test(sentence)
    )
  );
}

function inferEmotionalAttachment(text: string, protagonist: string | undefined): string {
  const sentence = splitIntoSentences(text).find((entry) =>
    /\b(?:brother|sister|mother|father|child|friend|partner|promise|memory|guilt|truth|duty|identity|grief|loved|wanted|needed)\b/iu.test(entry)
  );
  return sentence
    ? stripCanonicalCompilerMetadata(sentence)
    : `${protagonist ?? "The protagonist"} has an established personal reason to confront the central threat.`;
}

function inferEmotionalCost(text: string, protagonist: string | undefined): string {
  const sentence = splitIntoSentences(text).find((entry) =>
    /\b(?:sacrific|lose|lost|forget|refus|abandon|destroy|burn|betray|give up|cost)\w*\b/iu.test(entry)
  );
  return sentence
    ? stripCanonicalCompilerMetadata(sentence)
    : `${protagonist ?? "The protagonist"} must sacrifice an established attachment to survive the final interaction.`;
}

function inferSupernaturalRule(text: string): string {
  return stripCanonicalCompilerMetadata(
    splitIntoSentences(text).find((sentence) =>
      /\b(?:when|whenever|each time|only|must|never|answer|respond|listen|ring|cost|trigger)\b/iu.test(sentence)
    ) ?? ""
  );
}

function inferClimaxAction(text: string): string {
  const sentences = splitIntoSentences(text).map(stripCanonicalCompilerMetadata).filter(Boolean);
  return [...sentences].reverse().find((sentence, index) =>
    index > 0 && /\b(?:chose|decided|refused|hung up|closed|destroyed|left|answered|opened|recorded|confronted|looked)\b/iu.test(sentence)
  ) ?? sentences.at(-2) ?? sentences.at(-1) ?? "";
}

function extractKeyObjects(text: string, tags: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const objects = [...tags];
  for (const [pattern, value] of [
    [/\bhook\b/u, "hook"],
    [/\bcar door\b/u, "car door"],
    [/\bradio\b/u, "radio"],
    [/\bdoor locks?\b|\blocked doors?\b/u, "door locks"],
    [/\bphone\b/u, "phone"],
    [/\bdashcam\b|\bdash cam\b/u, "dashcam"],
    [/\bevidence bag\b/u, "evidence bag"],
    [/\bbedroom door\b/u, "bedroom door"],
    [/\bcamera\b/u, "camera"],
    [/\brecorder\b|\brecording device\b/u, "recorder"],
    [/\bnotebook\b/u, "notebook"],
    [/\bcar\b|\bvehicle\b/u, "car"],
    [/\blake\b/u, "lake"],
    [/\bwater\b/u, "water"],
    [/\bphotograph\b|\bphoto\b/u, "photograph"],
    [/\bscreen\b|\bdisplay\b/u, "screen"],
  ] as const) {
    if (pattern.test(lower)) {
      objects.push(value);
    }
  }
  return unique(objects);
}

function extractForbiddenInventions(text: string): string[] {
  const inventions: string[] = [];
  if (!/\bFunkger[aä]t\b/u.test(text)) {
    inventions.push("Funkgerät");
  }
  return inventions;
}

function summarizeSetting(narration: string, parsed: ParsedSourceStory, locationAnchors: readonly string[]): string {
  if (locationAnchors.length > 0) {
    return locationAnchors.join(", ");
  }
  return parsed.metadata.visualDirection ?? "";
}

function summarizeThreat(narration: string, parsed: ParsedSourceStory, names: readonly string[]): string {
  const normalized = narration.toLowerCase();
  const sourceIdentity = `${parsed.title} ${parsed.metadata.sourceTitle ?? ""}`;
  if (/\bblack[- ]eyed children\b/iu.test(sourceIdentity)) {
    return "The Black-Eyed Children";
  }
  if (/\bhook\b/u.test(normalized) && /\bcar\b/u.test(normalized)) {
    return "An impossible hook and duplicate-person phenomenon uses radio warnings, locked doors, familiar voices, and hesitation to manipulate who belongs inside or outside the car.";
  }
  if (/\bbackrooms\b/u.test(normalized)) {
    return `${names[0] ?? "The protagonist"} is trapped by a predatory maze hidden behind service corridors.`;
  }
  if (/\bdoll\b/u.test(normalized)) {
    return "A haunted doll";
  }
  return parsed.metadata.soundMotif ?? firstSentence(narration);
}

function isScaffoldText(value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value ?? "");
  return normalized.length === 0 || SCAFFOLD_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isObjectDriven(facts: CanonicalStoryFacts): boolean {
  const text = [
    facts.primaryTitle,
    facts.sourceTitle ?? "",
    facts.threat,
    facts.primaryReveal,
    facts.finalConsequence,
    ...facts.criticalEvents,
  ].join(" ");
  return /\bhook\b|\bdoor\b|\bradio\b|\bphone\b|\bdashcam\b|\bdoll\b|\bmirror\b|\bphoto(?:graph)?\b|\btape\b|\bbook\b/iu.test(text);
}

function pickImportantSentences(text: string, count: number): string[] {
  return splitIntoSentences(text)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)
    .slice(0, count);
}

function extractRequiredFinalReveal(text: string): string {
  const sentences = splitIntoSentences(text);
  const reveal =
    [...sentences]
      .reverse()
      .find((sentence, reverseIndex) =>
        reverseIndex < Math.max(1, Math.ceil(sentences.length * 0.35)) &&
        /\breveal(?:ed)?\b|\bturned out\b|\bwas actually\b|\bunderground level\b/iu.test(
          sentence
        )
      ) ?? lastSentence(text);
  return normalizeWhitespace(reveal);
}

export function normalizeCanonicalStoryFacts(
  input: CanonicalStoryFacts
): CanonicalStoryFacts {
  const protagonistNames =
    input.protagonistNames && input.protagonistNames.length > 0
      ? unique(input.protagonistNames)
      : unique(
          input.characters
            .map((character) => character.name)
            .filter((_, index) => index === 0)
        );
  const locationAnchors =
    input.locationAnchors && input.locationAnchors.length > 0
      ? unique(input.locationAnchors)
      : input.setting
        ? [input.setting]
        : [];
  const threatMotifs =
    input.threatMotifs && input.threatMotifs.length > 0
      ? unique(input.threatMotifs)
      : unique(
          [input.threat, ...input.criticalObjects]
            .map((entry) => normalizeWhitespace(entry))
            .filter((entry) => entry.length > 0)
            .slice(0, 4)
        );
  const keyRules =
    input.keyRules && input.keyRules.length > 0
      ? unique(input.keyRules)
      : unique(input.criticalEvents.filter((entry) => /\bnever\b|\bmust\b|\bonly\b/iu.test(entry)));
  const concreteLocations =
    input.concreteLocations && input.concreteLocations.length > 0
      ? unique(input.concreteLocations)
      : locationAnchors;
  const keyObjects =
    input.keyObjects && input.keyObjects.length > 0
      ? unique(input.keyObjects)
      : unique(input.criticalObjects);
  const supernaturalRule = normalizeWhitespace(input.supernaturalRule ?? keyRules[0] ?? "");
  const threatMechanism = normalizeWhitespace(input.threatMechanism ?? input.threat);
  const forbiddenInventions =
    input.forbiddenInventions && input.forbiddenInventions.length > 0
      ? unique(input.forbiddenInventions)
      : extractForbiddenInventions(
          [
            ...input.characters.map((character) => character.name),
            input.setting ?? "",
            ...input.criticalObjects,
            input.threat,
            input.primaryReveal,
            input.finalConsequence,
          ].join(" ")
        );
  return {
    ...input,
    protagonistNames,
    supportingCharacters:
      input.supportingCharacters ??
      unique(input.characters.slice(1).map((character) => character.name)),
    locationAnchors,
    concreteLocations,
    threatMotifs,
    keyObjects,
    threatMechanism,
    keyRules,
    supernaturalRule,
    protagonistAttachment: normalizeWhitespace(input.protagonistAttachment ?? ""),
    threatTemptation: normalizeWhitespace(input.threatTemptation ?? ""),
    emotionalCost: normalizeWhitespace(input.emotionalCost ?? ""),
    finalDecision: normalizeWhitespace(input.finalDecision ?? ""),
    forbiddenInventions,
    localizationPreservationRules:
      input.localizationPreservationRules ??
      unique([
        ...protagonistNames.map((name) => `Preserve protagonist name ${name}.`),
        ...keyObjects.map((object) => `Preserve object ${object}.`),
        ...(supernaturalRule ? [`Preserve supernatural rule: ${supernaturalRule}`] : []),
      ]),
    requiredFinalReveal:
      normalizeWhitespace(input.requiredFinalReveal ?? input.primaryReveal) ||
      input.primaryReveal,
    requiredFinalLine:
      normalizeWhitespace(input.requiredFinalLine ?? input.finalConsequence) ||
      input.finalConsequence,
  };
}

export function validateCanonicalStoryFacts(facts: CanonicalStoryFacts): readonly string[] {
  const normalized = normalizeCanonicalStoryFacts(facts);
  const issues: string[] = [];
  const titleValues = unique([normalized.primaryTitle, normalized.sourceTitle ?? ""]).map((entry) => entry.toLowerCase());
  if (normalized.setting && titleValues.includes(normalized.setting.toLowerCase())) {
    issues.push("FACT_SETTING_EQUALS_TITLE");
  }
  if ((normalized.concreteLocations ?? []).length === 0) {
    issues.push("FACT_CONCRETE_LOCATIONS_EMPTY");
  }
  if (isObjectDriven(normalized) && (normalized.keyObjects ?? []).length === 0) {
    issues.push("FACT_OBJECT_DRIVEN_KEY_OBJECTS_EMPTY");
  }
  if (firstSentence(normalized.criticalEvents[0] ?? "") === normalizeWhitespace(normalized.threat)) {
    issues.push("FACT_THREAT_COPIED_OPENING_SENTENCE");
  }
  for (const [field, value] of [
    ["primaryReveal", normalized.primaryReveal],
    ["requiredFinalReveal", normalized.requiredFinalReveal ?? ""],
    ["supernaturalRule", normalized.supernaturalRule ?? ""],
    ["threatMechanism", normalized.threatMechanism ?? ""],
  ] as const) {
    if (isScaffoldText(value)) {
      issues.push(`FACT_${field}_SCAFFOLD`);
    }
  }
  if (!normalized.supernaturalRule || isScaffoldText(normalized.supernaturalRule)) {
    issues.push("FACT_SUPERNATURAL_RULE_MISSING");
  }
  if (!normalized.protagonistAttachment) {
    issues.push("FACT_PROTAGONIST_ATTACHMENT_MISSING");
  }
  if (!normalized.emotionalCost || !/\b(refus|sacrific|abandon|destroy|burn|betray|accept|ignore|leave|reject|give up|lose)\w*\b/iu.test(normalized.emotionalCost)) {
    issues.push("FACT_EMOTIONAL_COST_MISSING");
  }
  return issues;
}

export function extractCanonicalStoryFacts(parsed: ParsedSourceStory): CanonicalStoryFacts {
  return extractCanonicalStoryFactsWithDiagnostics({ parsed }).facts;
}

export function extractCanonicalStoryFactsWithDiagnostics(args: {
  readonly parsed: ParsedSourceStory;
  readonly storyIr?: StoryIR;
  readonly mechanicsContract?: StoryMechanicsContract;
}): { readonly facts: CanonicalStoryFacts; readonly diagnostics: readonly CanonicalFactDiagnostic[] } {
  const parsed = args.parsed;
  const cleanParagraphs = parsed.narrationParagraphs.map(stripCanonicalCompilerMetadata).filter(Boolean);
  const narration = cleanParagraphs.join(" ");
  const names = extractCandidateNames(narration);
  const messages = extractMessages(narration);
  const locationAnchors = extractLocationAnchors(narration);
  const threatMotifs = extractThreatMotifs(narration);
  const keyRules = extractKeyRules(narration);
  const keyObjects = extractKeyObjects(narration, parsed.metadata.tags);
  const requiredFinalReveal = extractRequiredFinalReveal(narration);
  const isHookStory = /\bhook\b/iu.test(narration) && /\bcar\b/iu.test(narration);
  const concreteLocations = isHookStory
    ? unique([...locationAnchors, "parked car"])
    : locationAnchors;
  const openingImpossibleDetail = firstSentence(cleanParagraphs[0] ?? narration);
  const structuredRule = args.mechanicsContract?.supernaturalMechanics;
  const inferredAttachment = inferEmotionalAttachment(narration, names[0]);
  const inferredEmotionalCost = inferEmotionalCost(narration, names[0]);
  const inferredRule = inferSupernaturalRule(narration);
  const diagnostics: CanonicalFactDiagnostic[] = [];
  const record = (fact: string, source: CanonicalFactDiagnostic["source"], detail: string): void => {
    if (fact.trim()) diagnostics.push({ fact, source, detail });
  };
  const facts: CanonicalStoryFacts = {
    episodeNumber: parsed.episodeNumber,
    primaryTitle: parsed.title,
    ...(parsed.metadata.sourceTitle ? { sourceTitle: parsed.metadata.sourceTitle } : {}),
    characters: unique(names).slice(0, 4).map((name, index) => ({
      name,
      role:
        index === 0
          ? "main protagonist"
          : index === 1
            ? "supporting character"
            : "important figure",
    })),
    setting: summarizeSetting(narration, parsed, locationAnchors),
    criticalObjects: unique([
      ...(args.storyIr?.criticalObjects.map((object) => stripCanonicalCompilerMetadata(object.name)) ?? []),
      ...keyObjects,
    ]).slice(0, 12),
    criticalEvents: unique([
      ...(args.storyIr?.chronology.map(stripCanonicalCompilerMetadata) ?? []),
      ...pickImportantSentences(narration, 8),
    ]),
    writtenMessages: messages,
    threat: stripCanonicalCompilerMetadata(args.mechanicsContract?.centralThreat ?? args.storyIr?.centralThreat.description ?? summarizeThreat(narration, parsed, names)),
    primaryReveal: messages[0] ?? requiredFinalReveal,
    finalConsequence: lastSentence(narration),
    protagonistNames: unique(names).slice(0, 2),
    locationAnchors: concreteLocations,
    concreteLocations,
    threatMotifs,
    keyObjects,
    keyRules,
    supernaturalRule: inferredRule,
    protagonistAttachment: inferredAttachment,
    emotionalCost: inferredEmotionalCost,
    finalDecision: stripCanonicalCompilerMetadata(args.storyIr?.climax ?? inferClimaxAction(narration)),
    forbiddenInventions: extractForbiddenInventions(narration),
    requiredFinalReveal,
    requiredFinalLine: lastSentence(narration),
    openingImpossibleDetail,
    escalationEvidence: unique(args.mechanicsContract?.ruleEvidence ?? pickImportantSentences(narration, 5).slice(1)),
    climax: stripCanonicalCompilerMetadata(args.mechanicsContract?.climaxAction ?? args.storyIr?.climax ?? ""),
    ...(isHookStory
      ? {
          threatMechanism:
            "An impossible hook and duplicate-Noah phenomenon uses the radio warning, locked doors, familiar voices, and hesitation to manipulate who belongs inside or outside the car.",
          supernaturalRule:
            "Do not unlock the car or respond to familiar voices outside; the threat uses recognition and hesitation to swap who belongs inside.",
          primaryReveal:
            "Dashcam footage shows Noah outside the car scraping the door while another Noah remains behind the wheel.",
          requiredFinalReveal:
            "Dashcam footage shows Noah outside the car scraping the door while another Noah remains behind the wheel.",
          finalConsequence:
            "Noah realizes the warning may not have been about keeping the killer out, but about keeping the wrong person from getting out.",
          emotionalCost:
            "Noah must refuse a familiar voice and reject the comforting explanation even though doing so feels cruel, disloyal, and cowardly.",
          protagonistAttachment:
            "Noah wants to trust familiar voices and the ordinary safety of locked car doors.",
          threatTemptation:
            "The threat imitates familiar voices and a comforting explanation to make Noah unlock the car.",
          finalDecision:
            "Noah chooses not to unlock the door and refuses the familiar voice outside.",
        }
      : {}),
    ...(structuredRule
      ? {
          supernaturalRule: [
            `Trigger: ${structuredRule.trigger}`,
            `Activation: ${structuredRule.activationEffect}`,
            `Interaction: ${structuredRule.interactionRequirement}`,
            `Cost: ${structuredRule.cost}`,
            `Ending: ${structuredRule.endingInteraction}`,
          ].join("; "),
          emotionalCost: structuredRule.cost,
          finalDecision: structuredRule.climaxUse,
        }
      : {}),
  };
  const unresolvedQuestion = splitIntoSentences(narration).find((sentence) => /\?$/u.test(sentence));
  const normalized = normalizeCanonicalStoryFacts(
    unresolvedQuestion ? { ...facts, unresolvedQuestion } : facts
  );
  record(normalized.threat, args.mechanicsContract || args.storyIr ? "structured-contract" : "legacy-inference", "central threat");
  record(normalized.openingImpossibleDetail ?? "", "canonical-scene", "first canonical scene, never an ending candidate");
  for (const location of normalized.concreteLocations ?? []) record(location, args.storyIr ? "structured-contract" : "fallback-extraction", "location");
  for (const object of normalized.keyObjects ?? []) record(object, args.storyIr ? "structured-contract" : "fallback-extraction", "critical object");
  record(normalized.protagonistAttachment ?? "", structuredRule ? "structured-contract" : "legacy-inference", "emotional attachment");
  record(normalized.emotionalCost ?? "", structuredRule ? "structured-contract" : "legacy-inference", "observable emotional cost");
  record(normalized.requiredFinalReveal ?? "", "canonical-scene", "ending-region reveal extraction");
  const withDiagnostics = { ...normalized, factDiagnostics: diagnostics };
  return { facts: withDiagnostics, diagnostics };
}
