import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import { type CanonicalStoryFacts, type ParsedSourceStory } from "./story-localization.types.js";

function extractCandidateNames(text: string): string[] {
  const candidates = new Set<string>();
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/gu;
  const leadingStopwords = new Set([
    "The",
    "A",
    "An",
    "And",
    "But",
    "By",
    "Did",
    "Do",
    "Does",
    "For",
    "From",
    "He",
    "Her",
    "His",
    "How",
    "I",
    "If",
    "In",
    "Into",
    "It",
    "Of",
    "On",
    "Or",
    "Our",
    "She",
    "So",
    "That",
    "The",
    "Their",
    "Then",
    "There",
    "These",
    "They",
    "This",
    "Those",
    "To",
    "We",
    "What",
    "When",
    "Where",
    "Which",
    "Who",
    "Why",
    "With",
    "You",
  ]);
  const trailingGenericNouns = new Set([
    "Apartment",
    "Bathroom",
    "Bed",
    "Cabin",
    "Car",
    "Door",
    "Floor",
    "Hall",
    "Hallway",
    "House",
    "Kitchen",
    "Lobby",
    "Motel",
    "Office",
    "Room",
    "Road",
    "Street",
    "Suite",
    "Tent",
    "Vehicle",
    "Window",
  ]);
  for (const match of text.matchAll(pattern)) {
    const candidate = normalizeWhitespace(match[1] ?? "");
    const words = candidate.split(/\s+/u);
    const firstWord = words[0] ?? "";
    const lastWord = words.at(-1) ?? "";
    if (
      candidate.length > 0 &&
      firstWord.length > 0 &&
      lastWord.length > 0 &&
      !leadingStopwords.has(firstWord) &&
      !trailingGenericNouns.has(lastWord) &&
      !/^(Episode|Narration|Episode Metadata)$/u.test(candidate)
    ) {
      candidates.add(candidate);
    }
  }
  return [...candidates];
}

function firstSentence(text: string): string {
  return splitIntoSentences(text)[0] ?? normalizeWhitespace(text);
}

function lastSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return sentences.at(-1) ?? normalizeWhitespace(text);
}

function summarizeSetting(narration: string, parsed: ParsedSourceStory): string {
  const normalized = narration.toLowerCase();
  if (/\bmotel\b/u.test(normalized)) {
    return "An isolated roadside motel on a frozen night";
  }
  if (/\bhotel\b/u.test(normalized)) {
    return "An isolated roadside hotel";
  }
  if (/\bhouse\b|\bhouse\b/u.test(normalized)) {
    return "A secluded haunted house";
  }
  if (/\broad\b|\bmountain\b|\bstorm\b/u.test(normalized)) {
    return "A remote road during dangerous weather";
  }
  return parsed.metadata.visualDirection ?? parsed.sourceTitle ?? parsed.title;
}

function summarizeThreat(narration: string, parsed: ParsedSourceStory, names: readonly string[]): string {
  const normalized = narration.toLowerCase();
  if (/black[- ]eyed children/u.test(normalized) || /\bpermission\b/u.test(normalized)) {
    return "Two black-eyed children seeking permission to enter";
  }
  if (/\bdoll\b/u.test(normalized)) {
    return "A haunted doll";
  }
  if (/\bchildren\b/u.test(normalized) && names.length > 0) {
    return `${names[0]} being drawn into a supernatural trap`;
  }
  return parsed.metadata.soundMotif ?? firstSentence(narration);
}

function pickImportantSentences(text: string, count: number): string[] {
  const sentences = splitIntoSentences(text).map((sentence) => normalizeWhitespace(sentence)).filter(Boolean);
  return sentences.slice(0, Math.min(count, sentences.length));
}

function extractMessages(text: string): string[] {
  const uppercase = [...text.matchAll(/\b([A-Z][A-Z0-9\s'".-]{4,})\b/gu)].map((match) => normalizeWhitespace(match[1] ?? ""));
  return [...new Set(uppercase)].filter((entry) => entry.length > 0 && entry.length <= 80);
}

export function extractCanonicalStoryFacts(parsed: ParsedSourceStory): CanonicalStoryFacts {
  const narration = parsed.narrationParagraphs.join(" ");
  const names = extractCandidateNames(narration);
  const characters = [...new Set(names)].slice(0, 3).map((name, index) => ({
    name,
    role: index === 0 ? "main protagonist" : index === 1 ? "supporting character" : "important figure",
  }));
  const messages = extractMessages(narration);
  const facts: CanonicalStoryFacts = {
    episodeNumber: parsed.episodeNumber,
    primaryTitle: parsed.title,
    ...(parsed.metadata.sourceTitle ? { sourceTitle: parsed.metadata.sourceTitle } : {}),
    characters,
    setting: summarizeSetting(narration, parsed),
    criticalObjects: parsed.metadata.tags.slice(0, 5),
    criticalEvents: pickImportantSentences(narration, 4),
    writtenMessages: messages,
    threat: summarizeThreat(narration, parsed, names),
    primaryReveal: messages[0] ?? lastSentence(narration),
    finalConsequence: lastSentence(narration),
  };
  const unresolvedQuestion = splitIntoSentences(narration).find((sentence) => /\?$/u.test(sentence));
  return unresolvedQuestion ? { ...facts, unresolvedQuestion } : facts;
}
