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
