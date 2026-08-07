import type { VeronicaMediaPlan } from "../contracts/media-plan.v1.js";

export interface VeronicaTranslationRequest {
  readonly sourceText: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly glossary?: Readonly<Record<string, string>>;
  readonly protectedTerms?: readonly string[];
}

export function translateEmbeddedText(input: VeronicaTranslationRequest) {
  const protectedHits = (input.protectedTerms ?? []).filter((term) =>
    input.sourceText.toLowerCase().includes(term.toLowerCase()),
  );
  if (protectedHits.length > 0) {
    return {
      translatedText: input.sourceText,
      status: "protected-term" as const,
      confidence: 1,
      requiresApproval: true,
    };
  }
  const glossaryEntry = Object.entries(input.glossary ?? {}).find(([term]) =>
    input.sourceText.includes(term),
  );
  const translatedText = glossaryEntry
    ? input.sourceText.replace(glossaryEntry[0], glossaryEntry[1])
    : input.sourceText;
  const longText = translatedText.length > 120;
  return {
    translatedText,
    status: longText ? ("low-confidence" as const) : ("translated" as const),
    confidence: longText ? 0.7 : 0.95,
    requiresApproval: longText,
  };
}

export function validatePortraitReadiness(plan: VeronicaMediaPlan): number {
  const portraitPrepared = plan.preparedAssets.filter(
    (asset) => asset.aspectRatio === "9:16",
  );
  const portraitPlacements = plan.portraitPlacements.length;
  if (portraitPlacements === 0) return 0;
  return portraitPrepared.length / portraitPlacements;
}
