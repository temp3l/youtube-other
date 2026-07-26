import { countSpokenWords, normalizeWhitespace } from "@mediaforge/shared";
import { estimateNarrationDurationSeconds } from "./narration-constraints.js";
import type {
  CanonicalStoryBeat,
  StoryMechanicsContract,
} from "./story-mechanics.js";
import { type LanguageProfile } from "./story-localization.types.js";
import type {
  LocalizationAffectEvidence,
  LocalizationAffectTransitionKind,
  LocalizationHorrorAffectProjection,
} from "./localization-horror-affect-projection.js";

export const LOCALIZATION_FIDELITY_POLICY_VERSION = "localization-fidelity-v2";
export const LOCALIZATION_AFFECT_FIDELITY_POLICY_VERSION =
  "localization-affect-fidelity-v1";

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
  | "LOCALIZATION_METADATA_NOT_LOCALIZED"
  | "LOCALIZATION_AFFECT_LINEAGE_MISSING"
  | "LOCALIZATION_AFFECT_LINEAGE_MISMATCH"
  | "LOCALIZATION_AFFECT_TRANSITION_MISSING"
  | "LOCALIZATION_AFFECT_TRANSITION_CONTRADICTED"
  | "LOCALIZATION_AFFECT_EVIDENCE_MISSING"
  | "LOCALIZATION_AFFECT_RESPONSE_MISSING"
  | "LOCALIZATION_AFFECT_RULE_CHANGED"
  | "LOCALIZATION_AFFECT_PAYOFF_ALTERED"
  | "LOCALIZATION_AFFECT_NEW_THREAT_RULE"
  | "LOCALIZATION_AFFECT_UNEARNED_SURPRISE"
  | "LOCALIZATION_AFFECT_NEW_IMMUTABLE_FACT";

export interface LocalizationFidelityIssue {
  readonly code: LocalizationFidelityIssueCode;
  readonly message: string;
  readonly domain?: "lineage" | "source-fidelity" | "affect-causality";
  readonly semanticIds?: readonly string[];
  readonly evidenceRefs?: readonly string[];
}

export interface LocalizationFidelityResult {
  readonly status:
    | "READY"
    | "READY_WITH_MINOR_EDITS"
    | "REVISION_REQUIRED"
    | "REWRITE_REQUIRED";
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
  readonly affectCausalityPreserved: boolean;
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
  "the",
  "and",
  "that",
  "with",
  "from",
  "this",
  "into",
  "while",
  "when",
  "where",
  "their",
  "there",
  "then",
  "than",
  "because",
  "would",
  "could",
]);

function countParagraphs(value: string): number {
  return value
    .split(/\n{2,}/u)
    .map(normalizeWhitespace)
    .filter(Boolean).length;
}

function englishLeakageRatio(value: string): number {
  const tokens = normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length >= 2);
  return tokens.length === 0
    ? 0
    : tokens.filter((token) => ENGLISH_FUNCTION_WORDS.has(token)).length /
        tokens.length;
}

function selectRepairStrategy(
  issues: readonly LocalizationFidelityIssue[]
): RepairStrategy {
  if (issues.length === 0) return "DETERMINISTIC_FIX";
  if (issues.some((issue) => issue.domain === "lineage"))
    return "BLOCK_PIPELINE";
  if (issues.every((issue) => issue.code === "LOCALIZATION_METADATA_MISSING"))
    return "TARGETED_MODEL_REPAIR";
  if (
    issues.some((issue) =>
      [
        "LOCALIZATION_SEVERE_ABRIDGEMENT",
        "LOCALIZATION_MECHANICS_MISSING",
        "LOCALIZATION_CLIMAX_MECHANICS_MISSING",
        "LOCALIZATION_FINAL_CONSEQUENCE_MISSING",
        "LOCALIZATION_AFFECT_TRANSITION_MISSING",
        "LOCALIZATION_AFFECT_TRANSITION_CONTRADICTED",
        "LOCALIZATION_AFFECT_RESPONSE_MISSING",
        "LOCALIZATION_AFFECT_RULE_CHANGED",
        "LOCALIZATION_AFFECT_PAYOFF_ALTERED",
        "LOCALIZATION_AFFECT_NEW_THREAT_RULE",
        "LOCALIZATION_AFFECT_UNEARNED_SURPRISE",
        "LOCALIZATION_AFFECT_NEW_IMMUTABLE_FACT",
      ].includes(issue.code)
    )
  )
    return "FULL_STAGE_REGENERATION";
  return "TARGETED_MODEL_REPAIR";
}

function affectIssueCode(
  kind: LocalizationAffectTransitionKind,
  state: "missing" | "contradicted"
): LocalizationFidelityIssueCode {
  if (kind === "response" && state === "missing") {
    return "LOCALIZATION_AFFECT_RESPONSE_MISSING";
  }
  if (kind === "rule" && state === "contradicted") {
    return "LOCALIZATION_AFFECT_RULE_CHANGED";
  }
  if (kind === "payoff" && state === "contradicted") {
    return "LOCALIZATION_AFFECT_PAYOFF_ALTERED";
  }
  return state === "missing"
    ? "LOCALIZATION_AFFECT_TRANSITION_MISSING"
    : "LOCALIZATION_AFFECT_TRANSITION_CONTRADICTED";
}

function validateAffectCausality(args: {
  readonly projection?: LocalizationHorrorAffectProjection;
  readonly evidence?: LocalizationAffectEvidence | null;
}): readonly LocalizationFidelityIssue[] {
  if (!args.projection) {
    return [];
  }
  if (!args.evidence) {
    return [
      {
        code: "LOCALIZATION_AFFECT_LINEAGE_MISSING",
        message:
          "Enforced localization output does not report its affect projection lineage.",
        domain: "lineage",
        semanticIds: args.projection.transitions.map(
          (transition) => transition.semanticId
        ),
        evidenceRefs: [],
      },
    ];
  }
  const issues: LocalizationFidelityIssue[] = [];
  if (
    args.evidence.projectionVersion !== args.projection.projectionVersion ||
    args.evidence.projectionHash !== args.projection.projectionHash ||
    args.evidence.parentPlanHash !== args.projection.parent.planHash
  ) {
    issues.push({
      code: "LOCALIZATION_AFFECT_LINEAGE_MISMATCH",
      message: `Localized affect evidence lineage does not match projection ${args.projection.projectionHash} and parent plan ${args.projection.parent.planHash}.`,
      domain: "lineage",
      semanticIds: args.projection.transitions.map(
        (transition) => transition.semanticId
      ),
      evidenceRefs: [],
    });
  }
  const evidenceById = new Map(
    args.evidence.transitions.map((transition) => [
      transition.semanticId,
      transition,
    ])
  );
  for (const expected of args.projection.transitions) {
    const actual = evidenceById.get(expected.semanticId);
    if (!actual || actual.state === "missing") {
      issues.push({
        code: affectIssueCode(expected.kind, "missing"),
        message: `Localized affect transition ${expected.semanticId} (${expected.kind}) is missing; expected source evidence ${expected.sourceRefs.join(", ")}.`,
        domain: "affect-causality",
        semanticIds: [expected.semanticId],
        evidenceRefs: actual?.evidenceRefs ?? expected.sourceRefs,
      });
      continue;
    }
    if (actual.state === "contradicted") {
      issues.push({
        code: affectIssueCode(expected.kind, "contradicted"),
        message: `Localized affect transition ${expected.semanticId} (${expected.kind}) contradicts its accepted invariant ${expected.invariant}.`,
        domain: "affect-causality",
        semanticIds: [expected.semanticId],
        evidenceRefs: actual.evidenceRefs,
      });
    } else if (actual.evidenceRefs.length === 0) {
      issues.push({
        code: "LOCALIZATION_AFFECT_EVIDENCE_MISSING",
        message: `Localized affect transition ${expected.semanticId} claims preservation without a paragraph or sentence evidence reference.`,
        domain: "affect-causality",
        semanticIds: [expected.semanticId],
        evidenceRefs: [],
      });
    }
  }
  if (args.evidence.introducedThreatRuleIds.length > 0) {
    issues.push({
      code: "LOCALIZATION_AFFECT_NEW_THREAT_RULE",
      message: `Localized narration introduces threat-rule IDs not present in the accepted projection: ${args.evidence.introducedThreatRuleIds.join(", ")}.`,
      domain: "source-fidelity",
      semanticIds: args.evidence.introducedThreatRuleIds,
      evidenceRefs: [],
    });
  }
  if (args.evidence.introducedSurpriseIds.length > 0) {
    issues.push({
      code: "LOCALIZATION_AFFECT_UNEARNED_SURPRISE",
      message: `Localized narration introduces surprise IDs without accepted setup: ${args.evidence.introducedSurpriseIds.join(", ")}.`,
      domain: "source-fidelity",
      semanticIds: args.evidence.introducedSurpriseIds,
      evidenceRefs: [],
    });
  }
  if (args.evidence.introducedImmutableFactIds.length > 0) {
    issues.push({
      code: "LOCALIZATION_AFFECT_NEW_IMMUTABLE_FACT",
      message: `Localized narration introduces immutable-fact IDs not present in the accepted source: ${args.evidence.introducedImmutableFactIds.join(", ")}.`,
      domain: "source-fidelity",
      semanticIds: args.evidence.introducedImmutableFactIds,
      evidenceRefs: [],
    });
  }
  return issues;
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
  readonly localizedMechanics?:
    | {
        readonly supernaturalRule: string;
        readonly emotionalCost: string;
        readonly climaxRuleConnection: string;
        readonly finalConsequence: string;
      }
    | null
    | undefined;
  readonly sourceTitle?: string | undefined;
  readonly localizedMetadata?:
    | {
        readonly title: string;
        readonly thumbnailText: string;
        readonly seoDescription: string;
        readonly tags: readonly string[];
        readonly hashtags: readonly string[];
        readonly contentDisclosure: string;
      }
    | null
    | undefined;
  readonly affectProjection?: LocalizationHorrorAffectProjection;
  readonly affectEvidence?: LocalizationAffectEvidence | null;
}): LocalizationFidelityResult {
  const sourceWordCount = countSpokenWords(
    normalizeWhitespace(args.sourceNarration)
  );
  const localizedWordCount = countSpokenWords(
    normalizeWhitespace(args.localizedNarration)
  );
  const sourceEstimatedDurationSeconds = estimateNarrationDurationSeconds({
    language: args.sourceProfile.code,
    narrationText: args.sourceNarration,
  });
  const localizedEstimatedDurationSeconds = estimateNarrationDurationSeconds({
    language: args.localizedProfile.code,
    narrationText: args.localizedNarration,
  });
  const durationRatio =
    sourceEstimatedDurationSeconds > 0
      ? localizedEstimatedDurationSeconds / sourceEstimatedDurationSeconds
      : 0;
  const sourceSceneCount = args.canonicalBeats.length;
  const localizedSceneCount = countParagraphs(args.localizedNarration);
  const expectedIds = new Set(args.canonicalBeats.map((beat) => beat.id));
  const preservedSceneIds = [...new Set(args.preservedBeatIds ?? [])].filter(
    (id) => expectedIds.has(id)
  );
  const missingSceneIds = [...expectedIds].filter(
    (id) => !preservedSceneIds.includes(id)
  );
  const sceneCoverageRatio =
    sourceSceneCount > 0 ? preservedSceneIds.length / sourceSceneCount : 1;
  const englishLeakage = englishLeakageRatio(args.localizedNarration);
  const issues: LocalizationFidelityIssue[] = [];
  const policy = args.localizedProfile.localizationLengthPolicy;

  if (durationRatio < policy.minDurationRatio * 0.6) {
    issues.push({
      code: "LOCALIZATION_SEVERE_ABRIDGEMENT",
      message: `Localized duration ratio ${durationRatio.toFixed(2)} indicates a summary, not a full adaptation.`,
    });
  } else if (
    durationRatio < policy.minDurationRatio ||
    durationRatio > policy.maxDurationRatio
  ) {
    issues.push({
      code: "LOCALIZATION_DURATION_OUT_OF_RANGE",
      message: `Localized duration ratio ${durationRatio.toFixed(2)} is outside ${policy.minDurationRatio}-${policy.maxDurationRatio}.`,
    });
  }
  if (!args.preservedBeatIds || args.preservedBeatIds.length === 0) {
    issues.push({
      code: "LOCALIZATION_BEAT_IDS_MISSING",
      message:
        "Localized structured output does not declare preserved canonical beat IDs.",
    });
  }
  if (sceneCoverageRatio < policy.minSceneCoverageRatio) {
    issues.push({
      code: "LOCALIZATION_SCENE_COVERAGE_LOW",
      message: `Canonical beat coverage ${sceneCoverageRatio.toFixed(2)} is below ${policy.minSceneCoverageRatio}; missing ${missingSceneIds.join(", ") || "unknown"}.`,
    });
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
  if (missingCharacters.length > 0)
    issues.push({
      code: "LOCALIZATION_CHARACTER_MISSING",
      message: `Localized narration omits required characters: ${missingCharacters.join(", ")}.`,
    });
  if (!args.localizedMechanics) {
    issues.push({
      code: "LOCALIZATION_MECHANICS_MISSING",
      message:
        "Localized structured output does not verify the canonical story mechanics.",
    });
  }
  const emotionalCostPreserved =
    normalizeWhitespace(args.localizedMechanics?.emotionalCost ?? "").length >=
    8;
  const climaxMechanicsPreserved =
    normalizeWhitespace(args.localizedMechanics?.climaxRuleConnection ?? "")
      .length >= 12;
  const finalConsequencePreserved =
    normalizeWhitespace(args.localizedMechanics?.finalConsequence ?? "")
      .length >= 8;
  if (!climaxMechanicsPreserved)
    issues.push({
      code: "LOCALIZATION_CLIMAX_MECHANICS_MISSING",
      message:
        "Localized output does not preserve the climax-to-rule connection.",
    });
  if (!finalConsequencePreserved)
    issues.push({
      code: "LOCALIZATION_FINAL_CONSEQUENCE_MISSING",
      message: "Localized output does not preserve the final consequence.",
    });
  if (
    ENGLISH_INSTRUCTION_PATTERNS.some((pattern) =>
      pattern.test(args.localizedNarration)
    ) ||
    englishLeakage > policy.maxEnglishLeakageRatio
  ) {
    issues.push({
      code: "LOCALIZATION_ENGLISH_INSTRUCTION_LEAKAGE",
      message:
        "Localized narration contains English production instructions or excessive English leakage.",
    });
  }
  if (!args.localizedMetadata) {
    issues.push({
      code: "LOCALIZATION_METADATA_MISSING",
      message: "Localized metadata is missing from structured output.",
    });
  } else if (
    args.sourceTitle &&
    args.localizedProfile.code !== "en" &&
    normalizeWhitespace(args.localizedMetadata.title).toLocaleLowerCase() ===
      normalizeWhitespace(args.sourceTitle).toLocaleLowerCase()
  ) {
    issues.push({
      code: "LOCALIZATION_METADATA_NOT_LOCALIZED",
      message: "Localized title is an unchanged copy of the English title.",
    });
  }
  issues.push(
    ...validateAffectCausality({
      ...(args.affectProjection ? { projection: args.affectProjection } : {}),
      ...(args.affectEvidence !== undefined
        ? { evidence: args.affectEvidence }
        : {}),
    })
  );
  const domainRank = {
    lineage: 0,
    "source-fidelity": 1,
    "affect-causality": 2,
  } as const;
  const orderedIssues = issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (left, right) =>
        domainRank[left.issue.domain ?? "source-fidelity"] -
          domainRank[right.issue.domain ?? "source-fidelity"] ||
        left.index - right.index
    )
    .map(({ issue }) => issue);
  const repairStrategy = selectRepairStrategy(orderedIssues);
  const appearsSummarized =
    durationRatio < policy.minDurationRatio ||
    sceneCoverageRatio < policy.minSceneCoverageRatio;
  const affectCausalityPreserved = !orderedIssues.some((issue) =>
    issue.code.startsWith("LOCALIZATION_AFFECT_")
  );
  return {
    status:
      orderedIssues.length === 0
        ? "READY"
        : repairStrategy === "FULL_STAGE_REGENERATION" ||
            repairStrategy === "BLOCK_PIPELINE"
          ? "REWRITE_REQUIRED"
          : "REVISION_REQUIRED",
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
    affectCausalityPreserved,
    appearsSummarized,
    englishLeakageRatio: englishLeakage,
    issues: orderedIssues,
  };
}
