import path from "node:path";
import { normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import {
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { countWords, estimateDurationSeconds, writeJsonAtomicIfChanged } from "./story-localization.utils.js";

export interface StorySourceIssue {
  code:
    | "WEAK_HOOK"
    | "SYNOPSIS_LANGUAGE"
    | "UNRESOLVED_PLACEHOLDER"
    | "AMBIGUOUS_ALTERNATIVE"
    | "MISSING_CONCRETE_ACTION"
    | "CONTINUITY_CONFLICT"
    | "TERMINOLOGY_CONFLICT"
    | "INCOMPLETE_DIALOGUE"
    | "INCOMPLETE_MESSAGE"
    | "WEAK_ESCALATION"
    | "WEAK_CLIMAX"
    | "WEAK_ENDING"
    | "INSUFFICIENT_LENGTH"
    | "EXCESSIVE_LENGTH"
    | "REPETITIVE_EXPOSITION"
    | "ORIGINALITY_RISK";
  severity: "warning" | "error";
  excerpt: string;
  message: string;
  recommendation?: string;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  role: string;
  relationships: readonly string[];
  traits: readonly string[];
  requiredFacts: readonly string[];
}

export interface LocationDefinition {
  id: string;
  name: string;
  description: string;
  requiredFacts: readonly string[];
}

export interface ThreatDefinition {
  identity?: string;
  knownCapabilities: readonly string[];
  limitations: readonly string[];
  rules: readonly string[];
  unknowns: readonly string[];
}

export interface TimelineEvent {
  id: string;
  sequenceNumber: number;
  description: string;
  requiredFacts: readonly string[];
  consequence: string;
}

export interface StoryBible {
  title: string;
  premise: string;
  protagonist: CharacterDefinition;
  supportingCharacters: readonly CharacterDefinition[];
  threat: ThreatDefinition;
  locations: readonly LocationDefinition[];
  timeline: readonly TimelineEvent[];
  immutableFacts: readonly string[];
  recurringMotifs: readonly string[];
  supernaturalRules: readonly string[];
  requiredReveals: readonly string[];
  immutableStrings: readonly string[];
  endingMeaning: string;
}

export interface ProtectedStoryElement {
  id: string;
  type: "fact" | "relationship" | "rule" | "reveal" | "motif" | "ending";
  value: string;
  mayRephrase: boolean;
}

export interface OriginalityReview {
  risk: "low" | "medium" | "high";
  tropeOverlaps: string[];
  distinctiveElements: string[];
  potentiallyDerivativeElements: string[];
  recommendedChanges: string[];
}

export interface StoryScene {
  id: string;
  sequenceNumber: number;
  purpose:
    | "hook"
    | "setup"
    | "first-anomaly"
    | "investigation"
    | "escalation"
    | "personal-connection"
    | "discovery"
    | "confrontation"
    | "aftermath"
    | "final-sting";
  summary: string;
  requiredFacts: string[];
  immutableStrings: string[];
  targetWordShare?: number;
}

export interface RetentionBeat {
  approximateSecond: number;
  type:
    | "hook"
    | "question"
    | "new-evidence"
    | "contradiction"
    | "escalation"
    | "failed-response"
    | "reveal"
    | "climax"
    | "final-sting";
  description: string;
}

export interface StorySourceAnalysis {
  readonly sourceHash: string;
  readonly episodeNumber: string;
  readonly title: string;
  readonly wordCount: number;
  readonly sentenceCount: number;
  readonly paragraphCount: number;
  readonly issueSummary: readonly StorySourceIssue[];
  readonly synopsisSignals: readonly string[];
  readonly unresolvedPlaceholders: readonly string[];
  readonly ambiguousAlternatives: readonly string[];
  readonly recommendedFocus: readonly string[];
}

export interface LocaleNarrationProfile {
  locale: string;
  preferredWpm: number;
  pauseFactor: number;
  shortCompressionFactor: number;
  longFormExpansionFactor: number;
}

export interface StoryProductionConfig {
  targetWpm: number;
  pauseFactor: number;
  longForm: {
    targetMinutes: 6 | 7 | 8 | 9 | 10 | 11;
    preferredMinWords: number;
    preferredMaxWords: number;
    hardMinWords: number;
    hardMaxWords: number;
  };
  short: {
    targetSeconds: 30 | 45 | 60;
    preferredMinWords: number;
    preferredMaxWords: number;
    hardMinWords: number;
    hardMaxWords: number;
  };
  optimization: {
    optimizeEnglishMaster: boolean;
    generateEnglishShort: boolean;
    allowSafeSceneExpansion: boolean;
    performOriginalityReview: boolean;
    generateStoryBible: boolean;
    generateRetentionPlan: boolean;
  };
  correction: {
    maxEnglishMasterAttempts: number;
    maxEnglishShortAttempts: number;
    maxTranslationAttempts: number;
    maxApiRetryAttempts: number;
  };
  validation: {
    validateSceneParity: boolean;
    validateTerminology: boolean;
  };
}

export type TranslationVideoFormat = "long-form" | "short" | "both";

export type StoryProductionStage =
  | "raw-source"
  | "source-analysis"
  | "story-bible"
  | "originality-review"
  | "retention-plan"
  | "english-master-generation"
  | "english-master-validation"
  | "english-master-correction"
  | "english-short-generation"
  | "english-short-validation"
  | "english-short-correction"
  | "localized-long-form-generation"
  | "localized-long-form-validation"
  | "localized-short-generation"
  | "localized-short-validation"
  | "tts-generation"
  | "audio-duration-validation"
  | "completed"
  | "failed";

export interface StoryProductionState {
  readonly sourceHash: string;
  readonly episodeNumber: string;
  readonly slug: string;
  readonly stage: StoryProductionStage;
  readonly updatedAt: string;
}

export interface ProductionArtifactLocation {
  readonly productionDirectory: string;
  readonly episodeProductionDirectory: string;
  readonly productionStatePath: string;
}

function sanitizeSnippet(value: string, maxLength = 120): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function resolveStoryProductionDirectory(cacheDir: string): string {
  return path.join(cacheDir, "production");
}

export function resolveEpisodeStoryProductionDirectory(
  cacheDir: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">
): string {
  return path.join(
    resolveStoryProductionDirectory(cacheDir),
    parsed.episodeNumber,
    parsed.slug
  );
}

export function resolveStoryProductionStatePath(
  cacheDir: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">
): string {
  return path.join(
    resolveEpisodeStoryProductionDirectory(cacheDir, parsed),
    "production-state.json"
  );
}

export async function persistStoryProductionStage(
  cacheDir: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug" | "sourceHash">,
  stage: StoryProductionStage
): Promise<void> {
  const state: StoryProductionState = {
    sourceHash: parsed.sourceHash,
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    stage,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomicIfChanged(
    resolveStoryProductionStatePath(cacheDir, parsed),
    state,
    true
  );
}

export async function persistStoryProductionArtifact<T>(
  cacheDir: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">,
  filename: string,
  value: T
): Promise<void> {
  await writeJsonAtomicIfChanged(
    path.join(resolveEpisodeStoryProductionDirectory(cacheDir, parsed), filename),
    value,
    true
  );
}

function extractSignals(text: string): {
  readonly placeholders: string[];
  readonly alternates: string[];
  readonly synopsisSignals: string[];
} {
  const normalized = normalizeWhitespace(text);
  const placeholders = [
    ...normalized.matchAll(/\[(?:[^\]]+)\]/gu),
    ...normalized.matchAll(/\b(?:TBD|TODO|XXX|___|\{\{[^}]+\}\}|\?\?)\b/gu),
  ].map((match) => sanitizeSnippet(match[0] ?? ""));
  const alternates = [
    ...normalized.matchAll(/\b(?:or|either)\b[^.?!]{0,60}/giu),
  ].map((match) => sanitizeSnippet(match[0] ?? ""));
  const synopsisSignals = [
    "something happened",
    "things got worse",
    "became more disturbing",
    "the story begins",
    "the situation escalated",
    "the official account",
    "a contradiction appeared",
    "someone or something",
  ].filter((phrase) => normalized.toLowerCase().includes(phrase));
  return {
    placeholders: [...new Set(placeholders)],
    alternates: [...new Set(alternates)],
    synopsisSignals,
  };
}

function buildIssue(
  code: StorySourceIssue["code"],
  severity: StorySourceIssue["severity"],
  excerpt: string,
  message: string,
  recommendation?: string
): StorySourceIssue {
  return {
    code,
    severity,
    excerpt,
    message,
    ...(recommendation ? { recommendation } : {}),
  };
}

export function analyzeStorySource(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts
): StorySourceAnalysis {
  const narration = parsed.narrationParagraphs.join(" ");
  const sentences = splitIntoSentences(narration).map((sentence) =>
    normalizeWhitespace(sentence)
  );
  const wordCount = countWords(narration);
  const signals = extractSignals(narration);
  const issues: StorySourceIssue[] = [];

  if (sentences.length > 0) {
    const firstSentence = sentences[0] ?? "";
    if (countWords(firstSentence) < 10 || /^(?:it|there|something|someone)\b/iu.test(firstSentence)) {
      issues.push(
        buildIssue(
          "WEAK_HOOK",
          "warning",
          sanitizeSnippet(firstSentence),
          "The opening does not immediately ground the viewer in a concrete impossible detail or contradiction.",
          "Strengthen the first sentence with a specific action, message, or anomaly."
        )
      );
    }
    if (/(something happened|things got worse|became more disturbing|the story begins|the situation escalated)/iu.test(firstSentence)) {
      issues.push(
        buildIssue(
          "SYNOPSIS_LANGUAGE",
          "warning",
          sanitizeSnippet(firstSentence),
          "The opening leans on synopsis-style language instead of concrete scene detail.",
          "Rewrite the setup as a scene the viewer can picture immediately."
        )
      );
    }
  }

  if (signals.placeholders.length > 0) {
    issues.push(
      buildIssue(
        "UNRESOLVED_PLACEHOLDER",
        "error",
        signals.placeholders[0] ?? "",
        "The source contains unresolved placeholder text.",
        "Resolve the placeholder before translation."
      )
    );
  }

  if (signals.alternates.length > 0) {
    issues.push(
      buildIssue(
        "AMBIGUOUS_ALTERNATIVE",
        "warning",
        signals.alternates[0] ?? "",
        "The source contains ambiguous alternatives that can weaken localization fidelity.",
        "Choose the source-explicit option or preserve the ambiguity only if it is intentional."
      )
    );
  }

  if (wordCount < 600) {
    issues.push(
      buildIssue(
        "INSUFFICIENT_LENGTH",
        "warning",
        `${wordCount} words`,
        "The source is shorter than a typical long-form episode.",
        "Expand by adding concrete detail only when it remains faithful to the source."
      )
    );
  }
  if (wordCount > 2200) {
    issues.push(
      buildIssue(
        "EXCESSIVE_LENGTH",
        "warning",
        `${wordCount} words`,
        "The source is longer than the usual long-form target.",
        "Trim repetition and keep the decisive scenes."
      )
    );
  }

  const endingSentence = sentences.at(-1) ?? "";
  if (endingSentence.length > 0 && /(?:and then|something happened|the end|that was it)/iu.test(endingSentence)) {
    issues.push(
      buildIssue(
        "WEAK_ENDING",
        "warning",
        sanitizeSnippet(endingSentence),
        "The ending reads like a summary instead of a final sting.",
        "Preserve the ending meaning but sharpen the final implication."
      )
    );
  }

  if (/(\bthe protagonist\b|\bthe central rule\b|\bthis one became more precise\b)/iu.test(narration)) {
    issues.push(
      buildIssue(
        "REPETITIVE_EXPOSITION",
        "warning",
        "repeated generic phrasing",
        "The source uses generic exposition that should be made concrete in the optimized English master.",
        "Replace abstract narration with specific actions and outcomes."
      )
    );
  }

  return {
    sourceHash: parsed.sourceHash,
    episodeNumber: parsed.episodeNumber,
    title: parsed.title,
    wordCount,
    sentenceCount: sentences.length,
    paragraphCount: parsed.narrationParagraphs.length,
    issueSummary: issues,
    synopsisSignals: signals.synopsisSignals,
    unresolvedPlaceholders: signals.placeholders,
    ambiguousAlternatives: signals.alternates,
    recommendedFocus: [
      "Preserve character identities and plot chronology.",
      "Rewrite abstract narration into concrete scenes.",
      "Keep the final reveal and emotional meaning intact.",
    ],
  };
}

export function buildStoryBible(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts,
  analysis: StorySourceAnalysis
): StoryBible {
  const protagonist = facts.characters[0] ?? {
    name: parsed.title,
    role: "main protagonist",
  };
  const supportingCharacters = facts.characters.slice(1).map((character, index) => ({
    id: `support-${index + 1}`,
    name: character.name,
    role: character.role,
    relationships: character.relationship ? [character.relationship] : [],
    traits: [],
    requiredFacts: [character.name, character.role, ...(character.relationship ? [character.relationship] : [])],
  }));
  return {
    title: parsed.title,
    premise: sanitizeSnippet(parsed.narrationParagraphs[0] ?? parsed.title, 220),
    protagonist: {
      id: "protagonist",
      name: protagonist.name,
      role: protagonist.role,
      relationships: protagonist.relationship ? [protagonist.relationship] : [],
      traits: [],
      requiredFacts: [protagonist.name, protagonist.role, ...(protagonist.relationship ? [protagonist.relationship] : [])],
    },
    supportingCharacters,
    threat: {
      ...(facts.threat ? { identity: facts.threat } : {}),
      knownCapabilities: analysis.synopsisSignals.length > 0 ? ["Creates tension through scene-level contradictions."] : ["Imposes a persistent supernatural or narrative threat."],
      limitations: [],
      rules: facts.criticalEvents.slice(0, 2),
      unknowns: analysis.unresolvedPlaceholders,
    },
    locations: [
      {
        id: "setting",
        name: parsed.metadata.visualDirection ? "Primary setting" : "Primary location",
        description: parsed.metadata.visualDirection ?? facts.setting ?? "Primary location from the source story.",
        requiredFacts: [parsed.metadata.visualDirection ?? facts.setting ?? parsed.title],
      },
    ],
    timeline: facts.criticalEvents.slice(0, 8).map((event, index) => ({
      id: `event-${index + 1}`,
      sequenceNumber: index + 1,
      description: event,
      requiredFacts: [event],
      consequence: index === facts.criticalEvents.length - 1 ? facts.finalConsequence : event,
    })),
    immutableFacts: [
      facts.primaryReveal,
      facts.finalConsequence,
      ...(facts.writtenMessages.length > 0 ? facts.writtenMessages : []),
    ],
    recurringMotifs: facts.criticalObjects.slice(0, 5),
    supernaturalRules: facts.criticalEvents.slice(0, 3),
    requiredReveals: facts.writtenMessages.slice(0, 3),
    immutableStrings: facts.writtenMessages.slice(0, 5),
    endingMeaning: facts.finalConsequence,
  };
}

export function buildProtectedStoryElements(
  bible: StoryBible
): ProtectedStoryElement[] {
  return [
    ...bible.immutableFacts.map((value, index) => ({
      id: `fact-${index + 1}`,
      type: "fact" as const,
      value,
      mayRephrase: false,
    })),
    ...bible.supernaturalRules.map((value, index) => ({
      id: `rule-${index + 1}`,
      type: "rule" as const,
      value,
      mayRephrase: true,
    })),
    ...bible.requiredReveals.map((value, index) => ({
      id: `reveal-${index + 1}`,
      type: "reveal" as const,
      value,
      mayRephrase: false,
    })),
    {
      id: "ending",
      type: "ending",
      value: bible.endingMeaning,
      mayRephrase: false,
    },
  ];
}

export function buildOriginalityReview(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts,
  analysis: StorySourceAnalysis
): OriginalityReview {
  const lowerText = `${parsed.title} ${parsed.content}`.toLowerCase();
  const tropeOverlaps = [
    "haunted object",
    "forbidden message",
    "wrong-name reveal",
  ];
  const potentiallyDerivativeElements = [
    ...facts.writtenMessages.slice(0, 3),
    ...(analysis.synopsisSignals.length > 0 ? analysis.synopsisSignals : []),
  ];
  const distinctiveElements = [
    facts.primaryTitle,
    ...(facts.characters[0] ? [facts.characters[0].name] : []),
    ...(facts.setting ? [facts.setting] : []),
  ];
  const risk =
    /(ben|slender|fnaf|mario|pokemon|zelda|creepypasta)/iu.test(lowerText) ||
    potentiallyDerivativeElements.length > 3
      ? "medium"
      : "low";
  return {
    risk,
    tropeOverlaps,
    distinctiveElements,
    potentiallyDerivativeElements,
    recommendedChanges:
      risk === "low"
        ? ["Preserve the current wording and focus on fidelity."]
        : ["Review distinctive names and recurring messages for exact preservation."],
  };
}

export function buildRetentionPlan(
  parsed: ParsedSourceStory,
  bible: StoryBible
): ReadonlyArray<RetentionBeat> {
  const words = countWords(parsed.narrationParagraphs.join(" "));
  const approximateWordStep = Math.max(1, Math.floor(words / 5));
  const approxSecondsStep = Math.max(10, Math.round(estimateDurationSeconds(approximateWordStep, parsed.metadata.narrationWpm ?? 175)));
  const beats: RetentionBeat[] = [
    {
      approximateSecond: 0,
      type: "hook",
      description: sanitizeSnippet(parsed.narrationParagraphs[0] ?? parsed.title),
    },
    {
      approximateSecond: approxSecondsStep,
      type: "question",
      description: bible.requiredReveals[0] ?? "What is the first impossible clue?",
    },
    {
      approximateSecond: approxSecondsStep * 2,
      type: "new-evidence",
      description: bible.timeline[1]?.description ?? bible.timeline[0]?.description ?? "New evidence appears.",
    },
    {
      approximateSecond: approxSecondsStep * 3,
      type: "escalation",
      description: bible.timeline[2]?.description ?? "The threat reacts directly.",
    },
    {
      approximateSecond: approxSecondsStep * 4,
      type: "reveal",
      description: bible.requiredReveals[0] ?? bible.endingMeaning,
    },
    {
      approximateSecond: approxSecondsStep * 5,
      type: "final-sting",
      description: bible.endingMeaning,
    },
  ];
  return beats;
}

export function buildLocaleNarrationProfile(
  locale: string,
  preferredWpm: number,
  shortCompressionFactor: number,
  longFormExpansionFactor: number,
  pauseFactor = 1
): LocaleNarrationProfile {
  return {
    locale,
    preferredWpm,
    pauseFactor,
    shortCompressionFactor,
    longFormExpansionFactor,
  };
}
