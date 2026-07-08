import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import { type CanonicalStoryFacts } from "./story-localization.types.js";

export function dedupeGeneratedMetadata(text: string): string {
  return text.replace(
    /(?:<!--\s*mediaforge:generated-full-story\s*-->\s*){2,}/gu,
    "<!-- mediaforge:generated-full-story -->\n"
  );
}

export function repairGermanServiceCompounds(text: string): string {
  return text
    .replace(/\bServic Eingang\b/gu, "Serviceingang")
    .replace(/\bServic eflur\b/gu, "Serviceflur")
    .replace(/\bFunkgerät\b/gu, "internes Telefon");
}

export function repairShortBodyCanonicalNames(text: string, facts: CanonicalStoryFacts): string {
  let repaired = text;
  const preferredName = facts.protagonistNames?.[0];
  if (preferredName) {
    repaired = repaired
      .replace(/\bAdrian Cole\b/gu, preferredName)
      .replace(/\bAdrian\b/gu, preferredName);
  }
  return repaired;
}

export function repairFinalSting(text: string, facts: CanonicalStoryFacts): string {
  if (!facts.requiredFinalLine) {
    return text;
  }
  const sentences = splitIntoSentences(normalizeWhitespace(text));
  if (sentences.length === 0) {
    return facts.requiredFinalLine;
  }
  sentences[sentences.length - 1] = facts.requiredFinalLine;
  return sentences.join(" ");
}
