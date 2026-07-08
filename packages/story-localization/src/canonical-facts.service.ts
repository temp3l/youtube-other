import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import { type CanonicalStoryFacts, type ParsedSourceStory } from "./story-localization.types.js";

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((entry) => normalizeWhitespace(entry)).filter(Boolean))];
}

function firstSentence(text: string): string {
  return normalizeWhitespace(splitIntoSentences(text)[0] ?? text);
}

function lastSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return normalizeWhitespace(sentences.at(-1) ?? text);
}

function extractCandidateNames(text: string): string[] {
  const matches = [...text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/gu)].map(
    (match) => normalizeWhitespace(match[1] ?? "")
  );
  return unique(
    matches.filter(
      (candidate) =>
        candidate.length > 0 &&
        !/^(Episode|Narration|Episode Metadata|Audio Generation Instructions)$/u.test(
          candidate
        )
    )
  );
}

function extractMessages(text: string): string[] {
  return unique(
    [...text.matchAll(/["“]([^"”]{3,120})["”]/gu)].map((match) =>
      normalizeWhitespace(match[1] ?? "")
    )
  );
}

function extractLocationAnchors(text: string): string[] {
  const lower = text.toLowerCase();
  const anchors: string[] = [];
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
  return unique(anchors);
}

function extractThreatMotifs(text: string): string[] {
  const lower = text.toLowerCase();
  const motifs: string[] = [];
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

function extractForbiddenInventions(text: string): string[] {
  const inventions: string[] = [];
  if (!/\bAdrian\b/u.test(text)) {
    inventions.push("Adrian");
  }
  if (!/\bAdrian Cole\b/u.test(text)) {
    inventions.push("Adrian Cole");
  }
  if (!/\bFunkger[aä]t\b/u.test(text)) {
    inventions.push("Funkgerät");
  }
  return inventions;
}

function summarizeSetting(narration: string, parsed: ParsedSourceStory, locationAnchors: readonly string[]): string {
  if (locationAnchors.length > 0) {
    return locationAnchors.join(", ");
  }
  return parsed.metadata.visualDirection ?? parsed.sourceTitle ?? parsed.title;
}

function summarizeThreat(narration: string, parsed: ParsedSourceStory, names: readonly string[]): string {
  const normalized = narration.toLowerCase();
  if (/\bbackrooms\b/u.test(normalized)) {
    return `${names[0] ?? "The protagonist"} is trapped by a predatory maze hidden behind service corridors.`;
  }
  if (/\bdoll\b/u.test(normalized)) {
    return "A haunted doll";
  }
  return parsed.metadata.soundMotif ?? firstSentence(narration);
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
      .find((sentence) =>
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
    locationAnchors,
    threatMotifs,
    keyRules,
    forbiddenInventions,
    requiredFinalReveal:
      normalizeWhitespace(input.requiredFinalReveal ?? input.primaryReveal) ||
      input.primaryReveal,
    requiredFinalLine:
      normalizeWhitespace(input.requiredFinalLine ?? input.finalConsequence) ||
      input.finalConsequence,
  };
}

export function extractCanonicalStoryFacts(parsed: ParsedSourceStory): CanonicalStoryFacts {
  const narration = parsed.narrationParagraphs.join(" ");
  const names = extractCandidateNames(narration);
  const messages = extractMessages(narration);
  const locationAnchors = extractLocationAnchors(narration);
  const threatMotifs = extractThreatMotifs(narration);
  const keyRules = extractKeyRules(narration);
  const requiredFinalReveal = extractRequiredFinalReveal(narration);
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
    criticalObjects: unique(
      [
        ...parsed.metadata.tags,
        ...threatMotifs.filter((entry) => /phone|door|carpet/iu.test(entry)),
      ].slice(0, 6)
    ),
    criticalEvents: pickImportantSentences(narration, 5),
    writtenMessages: messages,
    threat: summarizeThreat(narration, parsed, names),
    primaryReveal: messages[0] ?? requiredFinalReveal,
    finalConsequence: lastSentence(narration),
    protagonistNames: unique(names).slice(0, 2),
    locationAnchors,
    threatMotifs,
    keyRules,
    forbiddenInventions: extractForbiddenInventions(narration),
    requiredFinalReveal,
    requiredFinalLine: lastSentence(narration),
  };
  const unresolvedQuestion = splitIntoSentences(narration).find((sentence) => /\?$/u.test(sentence));
  return normalizeCanonicalStoryFacts(
    unresolvedQuestion ? { ...facts, unresolvedQuestion } : facts
  );
}
