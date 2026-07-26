export type StoryArtifactKind =
  | "canonical-english-full"
  | "localized-full"
  | "short";

export interface StoryGenerationBudget {
  readonly artifactKind: StoryArtifactKind;
  readonly language: string;
  readonly model: string;
  readonly reasoningEffort?: string;
  readonly maxOutputTokens?: number;
  readonly targetWordRange?: {
    readonly min: number;
    readonly max: number;
  };
  readonly approximateInputTokens?: number;
  readonly approximateOutputTokens?: number;
  readonly inputMode?: "full-source" | "facts+excerpts";
  readonly warnings?: readonly string[];
}

export interface StoryQualityFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly language?: string;
  readonly paragraphIndex?: number;
  readonly excerpt?: string;
  readonly explanation?: string;
  readonly suggestedRepairAction?: string;
  readonly category?:
    | "missing-character"
    | "missing-object"
    | "missing-event"
    | "missing-ending"
    | "rule-contradiction"
    | "causal-break"
    | "abstract-language"
    | "template-leakage"
    | "length-mismatch"
    | "language-mismatch"
    | "metadata-mismatch";
  readonly evidence?: readonly string[];
  readonly repairable?: boolean;
  readonly repairScope?: RepairScope;
  readonly deterministicFix?: string;
}

export interface StoryQualityScore {
  readonly hook: number;
  readonly concreteImagery: number;
  readonly supernaturalRuleConsistency: number;
  readonly escalation: number;
  readonly characterMotivation: number;
  readonly emotionalCost: number;
  readonly climaxClarity: number;
  readonly endingStrength: number;
  readonly narrationNaturalness: number;
  readonly localizationFidelity?: number;
  readonly visualProducibility: number;
  readonly templateLanguageAbsence: number;
}

export type StoryGenerationFormat = "full" | "short";

export const STORY_AFFECT_REPAIR_ROUTING_VERSION =
  "story-affect-repair-routing-v1";
export const STORY_AFFECT_REPAIR_PROMPT_VERSION =
  "story-affect-repair-prompt-v1";
export const STORY_AFFECT_REPAIR_HISTORY_SCHEMA_VERSION =
  "story-affect-repair-history-v1";

export const STORY_AFFECT_ISSUE_CODES = {
  LOCAL_RESPONSE_STEP_MISSING: "LOCAL_RESPONSE_STEP_MISSING",
  LOCAL_COST_WEAKENED: "LOCAL_COST_WEAKENED",
  LOCAL_BEAT_CONTRADICTION: "LOCAL_BEAT_CONTRADICTION",
  MISSING_CENTRAL_QUESTION: "MISSING_CENTRAL_QUESTION",
  UNSUPPORTED_RULE: "UNSUPPORTED_RULE",
  ARBITRARY_CLIMAX: "ARBITRARY_CLIMAX",
  CROSS_STORY_CAUSAL_FAILURE: "CROSS_STORY_CAUSAL_FAILURE",
  INCOMPATIBLE_PAYOFF: "INCOMPATIBLE_PAYOFF",
} as const;

export type StoryAffectIssueCode =
  (typeof STORY_AFFECT_ISSUE_CODES)[keyof typeof STORY_AFFECT_ISSUE_CODES];

export const STORY_LOCAL_AFFECT_ISSUE_CODES = [
  STORY_AFFECT_ISSUE_CODES.LOCAL_RESPONSE_STEP_MISSING,
  STORY_AFFECT_ISSUE_CODES.LOCAL_COST_WEAKENED,
  STORY_AFFECT_ISSUE_CODES.LOCAL_BEAT_CONTRADICTION,
] as const;

export const STORY_ARCHITECTURE_AFFECT_ISSUE_CODES = [
  STORY_AFFECT_ISSUE_CODES.MISSING_CENTRAL_QUESTION,
  STORY_AFFECT_ISSUE_CODES.UNSUPPORTED_RULE,
  STORY_AFFECT_ISSUE_CODES.ARBITRARY_CLIMAX,
  STORY_AFFECT_ISSUE_CODES.CROSS_STORY_CAUSAL_FAILURE,
  STORY_AFFECT_ISSUE_CODES.INCOMPATIBLE_PAYOFF,
] as const;

export type StoryAffectRepairScope = "beat" | "beat-range";

export interface StoryAffectProtectedFact {
  readonly id: string;
  readonly statement: string;
}

export interface StoryAffectRepairHistoryEntry {
  readonly schemaVersion: typeof STORY_AFFECT_REPAIR_HISTORY_SCHEMA_VERSION;
  readonly attemptNumber: number;
  readonly issueIds: readonly string[];
  readonly issueCodes: readonly StoryAffectIssueCode[];
  readonly repairScope: StoryAffectRepairScope;
  readonly affectedBeatIds: readonly string[];
  readonly parentHashes: Readonly<Record<string, string>>;
  readonly routingFingerprint: string;
  readonly promptFingerprint: string;
  readonly outcome: "accepted" | "rejected" | "blocked";
  readonly validationIssues: readonly string[];
}

export interface StoryGenerationProfile {
  readonly format: StoryGenerationFormat;
  readonly sourcePath: string;
  readonly targetWordRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly validationProfile: string;
}

export type RepairScope =
  | "metadata-deduplication"
  | "generated-marker-replacement"
  | "german-compound-repair"
  | "canonical-name-repair"
  | "final-sting-repair"
  | "targeted-short-repair";

export interface StoryQualityGateResult {
  readonly status: "PASS" | "REPAIRABLE" | "FAIL";
  readonly findings: readonly StoryQualityFinding[];
  readonly warnings: readonly string[];
  readonly repairScopes: readonly RepairScope[];
  readonly deterministicFixes: readonly string[];
}
