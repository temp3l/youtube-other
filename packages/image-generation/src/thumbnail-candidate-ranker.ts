import { normalizeWhitespace } from "@mediaforge/shared";

const WEAK = new Set(["story", "horror", "scary", "night", "dark", "thing", "something"]);
const CURIOSITY = /\b(don't|never|why|what|who|it|this|that|you|your|not|no|kein|nicht|nie|du|dein|es|das|wer|was|warum)\b/iu;
const THREAT = /\b(found|follow|inside|behind|watch|call|open|moving|returned|trapped|look|fand|folgt|drinnen|hinter|sieht|ruft|öffnen|bewegt|zurück|gefangen|schau)\w*/iu;

export interface RankedThumbnailText {
  readonly text: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export function rankThumbnailTexts(texts: readonly string[]): RankedThumbnailText[] {
  return [...new Set(texts.map(normalizeWhitespace).filter(Boolean))]
    .map((text) => {
      const words = text.split(/\s+/u);
      const reasons: string[] = [];
      let score = 50;
      if (words.length >= 2 && words.length <= 4) { score += 20; reasons.push("mobile-length"); }
      else if (words.length === 5) score += 8;
      else { score -= 25; reasons.push("poor-length"); }
      if (CURIOSITY.test(text)) { score += 14; reasons.push("curiosity-gap"); }
      if (THREAT.test(text)) { score += 14; reasons.push("specific-threat"); }
      const weakCount = words.filter((word) => WEAK.has(word.toLowerCase())).length;
      if (weakCount > 0) { score -= weakCount * 10; reasons.push("generic-wording"); }
      if (text.length > 32) { score -= 12; reasons.push("wide-at-mobile-size"); }
      return { text, score: Math.max(0, Math.min(100, score)), reasons };
    })
    .sort((left, right) => right.score - left.score);
}
