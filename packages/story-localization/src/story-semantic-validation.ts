import { normalizeWhitespace } from "@mediaforge/shared";
import type { CanonicalStoryFacts } from "./story-localization.types.js";

const ACTION = /\b(?:move|moves|moved|moving|change|changes|changed|appear|appears|appeared|show|shows|showed|showing|hear|heard|ring|rings|rang|shake|shakes|shook|open|opens|opened|close|closes|closed|turn|turns|turned|watch|watches|watched|record|records|recorded|look|looks|looked|rise|rises|rose|sink|sinks|sank|ripple|ripples|rippled|blink|blinks|blinked|glow|glows|glowed|klingel|beweg|zeig|erschien|öffn|veränder|hör|oy|oí|escuch|cambi|ouvi|mud|entend|chang)\w*\b/iu;
const IMPOSSIBLE = /\b(?:impossible|without|despite|dead|severed|empty|no one|nobody|wrong face|different face|face in|reflection|under the water|beneath the water|inside the screen|moved on its own|rang anyway|unmöglich|tot|durchtrennt|niemand|falsches gesicht|unter dem wasser)\b/iu;

function terms(value: string): readonly string[] {
  return normalizeWhitespace(value).toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 3);
}

function stem(value: string): string {
  return value.replace(/(?:ing|ed|es|s|en|ern|er)$/iu, "");
}

export function semanticEntityMatch(text: string, entities: readonly string[]): boolean {
  const textTerms = new Set(terms(text).map(stem));
  return entities.some((entity) => terms(entity).some((term) => textTerms.has(stem(term))));
}

export function validateSemanticOpeningHook(args: {
  readonly opening: string;
  readonly entities: readonly string[];
}): { readonly valid: boolean; readonly hasEntity: boolean; readonly hasAction: boolean; readonly hasImpossibleDetail: boolean } {
  const openingTerms = new Set(terms(args.opening).map(stem));
  const matchedEntityCount = args.entities.filter((entity) =>
    terms(entity).some((term) => openingTerms.has(stem(term)))
  ).length;
  const hasEntity = matchedEntityCount > 0;
  const hasAction = ACTION.test(args.opening);
  const hasImpossibleDetail =
    IMPOSSIBLE.test(args.opening) ||
    (hasAction && matchedEntityCount >= 2) ||
    (hasEntity && /\b(?:face|camera|screen|phone|water|lake|reflection|recording|booth|photograph)\b/iu.test(args.opening));
  return { valid: hasEntity && hasAction && hasImpossibleDetail, hasEntity, hasAction, hasImpossibleDetail };
}

export function canonicalHookEntities(facts: CanonicalStoryFacts): readonly string[] {
  return [...new Set([
    ...facts.criticalObjects,
    ...(facts.keyObjects ?? []),
    ...(facts.concreteLocations ?? []),
    ...(facts.locationAnchors ?? []),
    facts.threat,
    ...(facts.threatMotifs ?? []),
  ].filter(Boolean))];
}
