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
  readonly repairScope?: RepairScope;
  readonly deterministicFix?: string;
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
