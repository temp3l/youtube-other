import { countSpokenWords, normalizeWhitespace } from "@mediaforge/shared";
import { estimateNarrationDurationSeconds } from "./narration-constraints.js";
import type { CanonicalStoryBeat, StoryMechanicsContract } from "./story-mechanics.js";
import { type LanguageProfile } from "./story-localization.types.js";

export const LOCALIZATION_FIDELITY_POLICY_VERSION = "localization-fidelity-v2";

export type RepairStrategy =
  | "DETERMINISTIC_FIX"
  | "TARGETED_MODEL_REPAIR"
  | "FULL_STAGE_REGENERATION"
  | "BLOCK_PIPELINE";

export type LocalizationFidelityIssueCode =
  | "LOCALIZATION_SEVERE_ABRIDGEMENT"
  | "LOCALIZATION_DURATION_OUT_OF_RANGE"
  | "LOCALIZATION_SCENE_COVERAGE_LOW"
  | "LOCALIZATION_BEAT_IDS_MISSING"
  | "LOCALIZATION_CHARACTER_MISSING"
  | "LOCALIZATION_MECHANICS_MISSING"
  | "LOCALIZATION_CLIMAX_MECHANICS_MISSING"
  | "LOCALIZATION_FINAL_CONSEQUENCE_MISSING"
  | "LOCALIZATION_ENGLISH_INSTRUCTION_LEAKAGE"
  | "LOCALIZATION_METADATA_MISSING"
  | "LOCALIZATION_METADATA_NOT_LOCALIZED";

export interface LocalizationFidelityIssue {
  readonly code: LocalizationFidelityIssueCode;
  readonly message: string;
}

export interface LocalizationFidelityResult {
  readonly status: "READY" | "READY_WITH_MINOR_EDITS" | "REVISION_REQUIRED" | "REWRITE_REQUIRED";
  readonly repairStrategy: RepairStrategy;
  readonly sourceWordCount: number;
  readonly localizedWordCount: number;
  readonly sourceEstimatedDurationSeconds: number;
  readonly localizedEstimatedDurationSeconds: number;
  readonly durationRatio: number;
  readonly sourceSceneCount: number;
  readonly localizedSceneCount: number;
  readonly sceneCoverageRatio: number;
  readonly preservedSceneIds: readonly string[];
  readonly missingSceneIds: readonly string[];
  readonly missingCharacters: readonly string[];
  readonly emotionalStakePreserved: boolean;
  readonly emotionalCostPreserved: boolean;
  readonly climaxMechanicsPreserved: boolean;
  readonly finalConsequencePreserved: boolean;
  readonly appearsSummarized: boolean;
  readonly englishLeakageRatio: number;
  readonly issues: readonly LocalizationFidelityIssue[];
}

const ENGLISH_INSTRUCTION_PATTERNS = [
  /\b(?:speak|write|read)\s+(?:in\s+)?natural\s+english\b/iu,
  /\benglish\s+(?:narration|voice|language|pronunciation|instructions?)\b/iu,
  /\b(?:do not narrate|do not translate|production directions only)\b/iu,
] as const;

const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "and", "that", "with", "from", "this", "into", "while", "when",
  "where", "their", "there", "then", "than", "because", "would", "could",
]);

function countParagraphs(value: string): number {
  return value.split(/\n{2,}/u).map(normalizeWhitespace).filter(Boolean).length;
}

function englishLeakageRatio(value: string): number {
  const tokens = normalizeWhitespace(value).toLowerCase().split(/[^\p{L}]+/u).filter((token) => token.length >= 2);
  return tokens.length === 0
    ? 0
    : tokens.filter((token) => ENGLISH_FUNCTION_WORDS.has(token)).length / tokens.length;
}

function selectRepairStrategy(issues: readonly LocalizationFidelityIssue[]): RepairStrategy {
  if (issues.length === 0) return "DETERMINISTIC_FIX";
  if (issues.every((issue) => issue.code === "LOCALIZATION_METADATA_MISSING")) return "TARGETED_MODEL_REPAIR";
  if (issues.some((issue) => [
    "LOCALIZATION_SEVERE_ABRIDGEMENT",
    "LOCALIZATION_MECHANICS_MISSING",
    "LOCALIZATION_CLIMAX_MECHANICS_MISSING",
    "LOCALIZATION_FINAL_CONSEQUENCE_MISSING",
  ].includes(issue.code))) return "FULL_STAGE_REGENERATION";
  return "TARGETED_MODEL_REPAIR";
}

export function validateLocalizationFidelity(args: {
  readonly sourceNarration: string;
  readonly localizedNarration: string;
  readonly sourceProfile: LanguageProfile;
  readonly localizedProfile: LanguageProfile;
  readonly requiredCharacterNames: readonly string[];
  readonly canonicalBeats: readonly CanonicalStoryBeat[];
  readonly preservedBeatIds?: readonly string[] | null | undefined;
  readonly mechanicsContract: StoryMechanicsContract;
  readonly localizedMechanics?: {
    readonly supernaturalRule: string;
    readonly emotionalCost: string;
    readonly climaxRuleConnection: string;
    readonly finalConsequence: string;
  } | null | undefined;
  readonly sourceTitle?: string | undefined;
  readonly localizedMetadata?: {
    readonly title: string;
    readonly thumbnailText: string;
    readonly seoDescription: string;
    readonly tags: readonly string[];
    readonly hashtags: readonly string[];
    readonly contentDisclosure: string;
  } | null | undefined;
}): LocalizationFidelityResult {
  const sourceWordCount = countSpokenWords(normalizeWhitespace(args.sourceNarration));
  const localizedWordCount = countSpokenWords(normalizeWhitespace(args.localizedNarration));
  const sourceEstimatedDurationSeconds = estimateNarrationDurationSeconds({
    language: args.sourceProfile.code,
    narrationText: args.sourceNarration,
  });
  const localizedEstimatedDurationSeconds = estimateNarrationDurationSeconds({
    language: args.localizedProfile.code,
    narrationText: args.localizedNarration,
  });
  const durationRatio = sourceEstimatedDurationSeconds > 0 ? localizedEstimatedDurationSeconds / sourceEstimatedDurationSeconds : 0;
  const sourceSceneCount = args.canonicalBeats.length;
  const localizedSceneCount = countParagraphs(args.localizedNarration);
  const expectedIds = new Set(args.canonicalBeats.map((beat) => beat.id));
  const preservedSceneIds = [...new Set(args.preservedBeatIds ?? [])].filter((id) => expectedIds.has(id));
  const missingSceneIds = [...expectedIds].filter((id) => !preservedSceneIds.includes(id));
  const sceneCoverageRatio = sourceSceneCount > 0 ? preservedSceneIds.length / sourceSceneCount : 1;
  const englishLeakage = englishLeakageRatio(args.localizedNarration);
  const issues: LocalizationFidelityIssue[] = [];
  const policy = args.localizedProfile.localizationLengthPolicy;

  if (durationRatio < policy.minDurationRatio * 0.6) {
    issues.push({ code: "LOCALIZATION_SEVERE_ABRIDGEMENT", message: `Localized duration ratio ${durationRatio.toFixed(2)} indicates a summary, not a full adaptation.` });
  } else if (durationRatio < policy.minDurationRatio || durationRatio > policy.maxDurationRatio) {
    issues.push({ code: "LOCALIZATION_DURATION_OUT_OF_RANGE", message: `Localized duration ratio ${durationRatio.toFixed(2)} is outside ${policy.minDurationRatio}-${policy.maxDurationRatio}.` });
  }
  if (!args.preservedBeatIds || args.preservedBeatIds.length === 0) {
    issues.push({ code: "LOCALIZATION_BEAT_IDS_MISSING", message: "Localized structured output does not declare preserved canonical beat IDs." });
  }
  if (sceneCoverageRatio < policy.minSceneCoverageRatio) {
    issues.push({ code: "LOCALIZATION_SCENE_COVERAGE_LOW", message: `Canonical beat coverage ${sceneCoverageRatio.toFixed(2)} is below ${policy.minSceneCoverageRatio}; missing ${missingSceneIds.join(", ") || "unknown"}.` });
  }
  const localizedLower = args.localizedNarration.toLocaleLowerCase();
  const missingCharacters = args.requiredCharacterNames.filter((name) => {
    if (name.length <= 1) return false;
    const escapedName = name
      .toLocaleLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return !new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapedName}(?=$|[^\\p{L}\\p{N}])`,
      "u"
    ).test(localizedLower);
  });
  if (missingCharacters.length > 0) issues.push({ code: "LOCALIZATION_CHARACTER_MISSING", message: `Localized narration omits required characters: ${missingCharacters.join(", ")}.` });
  if (!args.localizedMechanics) {
    issues.push({ code: "LOCALIZATION_MECHANICS_MISSING", message: "Localized structured output does not verify the canonical story mechanics." });
  }
  const emotionalCostPreserved = normalizeWhitespace(args.localizedMechanics?.emotionalCost ?? "").length >= 8;
  const climaxMechanicsPreserved = normalizeWhitespace(args.localizedMechanics?.climaxRuleConnection ?? "").length >= 12;
  const finalConsequencePreserved = normalizeWhitespace(args.localizedMechanics?.finalConsequence ?? "").length >= 8;
  if (!climaxMechanicsPreserved) issues.push({ code: "LOCALIZATION_CLIMAX_MECHANICS_MISSING", message: "Localized output does not preserve the climax-to-rule connection." });
  if (!finalConsequencePreserved) issues.push({ code: "LOCALIZATION_FINAL_CONSEQUENCE_MISSING", message: "Localized output does not preserve the final consequence." });
  if (ENGLISH_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(args.localizedNarration)) || englishLeakage > policy.maxEnglishLeakageRatio) {
    issues.push({ code: "LOCALIZATION_ENGLISH_INSTRUCTION_LEAKAGE", message: "Localized narration contains English production instructions or excessive English leakage." });
  }
  if (!args.localizedMetadata) {
    issues.push({ code: "LOCALIZATION_METADATA_MISSING", message: "Localized metadata is missing from structured output." });
  } else if (args.sourceTitle && args.localizedProfile.code !== "en" && normalizeWhitespace(args.localizedMetadata.title).toLocaleLowerCase() === normalizeWhitespace(args.sourceTitle).toLocaleLowerCase()) {
    issues.push({ code: "LOCALIZATION_METADATA_NOT_LOCALIZED", message: "Localized title is an unchanged copy of the English title." });
  }
  const repairStrategy = selectRepairStrategy(issues);
  const appearsSummarized = durationRatio < policy.minDurationRatio || sceneCoverageRatio < policy.minSceneCoverageRatio;
  return {
    status: issues.length === 0 ? "READY" : repairStrategy === "FULL_STAGE_REGENERATION" ? "REWRITE_REQUIRED" : "REVISION_REQUIRED",
    repairStrategy,
    sourceWordCount,
    localizedWordCount,
    sourceEstimatedDurationSeconds,
    localizedEstimatedDurationSeconds,
    durationRatio,
    sourceSceneCount,
    localizedSceneCount,
    sceneCoverageRatio,
    preservedSceneIds,
    missingSceneIds,
    missingCharacters,
    emotionalStakePreserved: emotionalCostPreserved,
    emotionalCostPreserved,
    climaxMechanicsPreserved,
    finalConsequencePreserved,
    appearsSummarized,
    englishLeakageRatio: englishLeakage,
    issues,
  };
}
