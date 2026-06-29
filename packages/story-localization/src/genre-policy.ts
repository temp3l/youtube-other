import { z } from "zod";
import {
  type NarrativeMode,
  type StoryGenre,
  type StoryIR,
  conflictingGenreAndFictionalityIssueSchema,
  fictionalityUnresolvedForEvidenceLedGenreIssueSchema,
  genrePolicyNotFoundIssueSchema,
  genrePolicyVersionUnsupportedIssueSchema,
  narrativeModeIncompatibleWithGenreIssueSchema,
  policyOverrideWeakensSourceBoundaryIssueSchema,
  storyGenreSchema,
  storyValidationIssueSchema,
  supernaturalRuleInHistoricalMysteryIssueSchema,
  type StoryValidationIssue,
  unknownGenreRequiresConservativePolicyIssueSchema,
} from "./story-artifact-model.js";

export const GENRE_POLICY_SCHEMA_VERSION = "genre-policy-schema-v1";
export const GENRE_POLICY_REGISTRY_VERSION = "genre-policy-registry-v1";

export const GENRE_POLICY_IDS = [
  "genre-policy/fictional-supernatural",
  "genre-policy/fictional-psychological",
  "genre-policy/historical-mystery",
  "genre-policy/true-crime",
  "genre-policy/documentary",
  "genre-policy/folklore",
  "genre-policy/unknown",
] as const;
export const genrePolicyIdSchema = z.enum(GENRE_POLICY_IDS);
export type GenrePolicyId = z.infer<typeof genrePolicyIdSchema>;

export const TENSION_SOURCE_IDS = [
  "chronology",
  "evidence",
  "environment",
  "unresolved-contradictions",
  "rule-escalation",
  "perception",
  "observable-consequences",
] as const;
export const tensionSourceIdSchema = z.enum(TENSION_SOURCE_IDS);
export type TensionSourceId = z.infer<typeof tensionSourceIdSchema>;

export const PROHIBITED_TECHNIQUE_IDS = [
  "invented-dialogue",
  "invented-internal-thoughts",
  "unsupported-motive",
  "unsupported-certainty",
  "new-supernatural-mechanics",
  "intelligent-environment",
  "fictional-climax",
  "victim-blaming",
] as const;
export const prohibitedTechniqueIdSchema = z.enum(PROHIBITED_TECHNIQUE_IDS);
export type ProhibitedTechniqueId = z.infer<typeof prohibitedTechniqueIdSchema>;

export const policyConnectiveDetailsSchema = z.enum([
  "allow",
  "qualified-only",
  "forbid",
]);
export type PolicyConnectiveDetails = z.infer<
  typeof policyConnectiveDetailsSchema
>;

export const policyBoundariesSchema = z
  .object({
    dialogue: z.boolean(),
    internalThoughts: z.boolean(),
    connectiveDetails: policyConnectiveDetailsSchema,
    motives: z.boolean(),
    undocumentedActions: z.boolean(),
    qualifiedReconstruction: z.boolean(),
    requireConfidenceAttribution: z.boolean(),
    prohibitUnsupportedCertainty: z.boolean(),
  })
  .strict();
export type PolicyBoundaries = z.infer<typeof policyBoundariesSchema>;

export const genrePolicySchema = z
  .object({
    schemaVersion: z.literal(GENRE_POLICY_SCHEMA_VERSION),
    id: genrePolicyIdSchema,
    version: z.string().trim().min(1),
    genre: storyGenreSchema,
    evidenceLed: z.boolean(),
    allowedNarrativeModes: z
      .array(
        z.enum([
          "character-led",
          "evidence-led",
          "first-person",
          "documentary",
          "unknown",
        ])
      )
      .min(1),
    allowedFictionalities: z
      .array(
        z.enum([
          "fiction",
          "nonfiction",
          "fiction-inspired-by-folklore",
          "unknown",
        ])
      )
      .min(1),
    tensionSources: z.array(tensionSourceIdSchema),
    prohibitedTechniques: z.array(prohibitedTechniqueIdSchema),
    defaultBoundaries: policyBoundariesSchema,
    allowSupernaturalAsFact: z.boolean(),
    allowEnvironmentalThreatIntelligence: z.boolean(),
    unresolvedFictionalitySeverity: z.enum(["none", "warning", "error"]),
  })
  .strict();
export type GenrePolicy = z.infer<typeof genrePolicySchema>;

export const genrePolicyRegistrySchema = z
  .object({
    schemaVersion: z.literal(GENRE_POLICY_SCHEMA_VERSION),
    registryVersion: z.string().trim().min(1),
    policies: z.array(genrePolicySchema).min(1),
  })
  .strict();

export interface GenrePolicyRegistry {
  readonly schemaVersion: typeof GENRE_POLICY_SCHEMA_VERSION;
  readonly registryVersion: string;
  readonly policies: Readonly<Record<GenrePolicyId, GenrePolicy>>;
  readonly byGenre: Readonly<Record<StoryGenre, GenrePolicyId>>;
}

export type GenrePolicyResolution =
  | {
      readonly ok: true;
      readonly normalizedGenre: StoryGenre;
      readonly policy: GenrePolicy;
      readonly issues: readonly StoryValidationIssue[];
    }
  | {
      readonly ok: false;
      readonly normalizedGenre: StoryGenre;
      readonly issues: readonly StoryValidationIssue[];
    };

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return value;
}

export function createGenrePolicyRegistry(input: {
  readonly registryVersion?: string;
  readonly policies: readonly GenrePolicy[];
}): GenrePolicyRegistry {
  const parsed = genrePolicyRegistrySchema.parse({
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    registryVersion: input.registryVersion ?? GENRE_POLICY_REGISTRY_VERSION,
    policies: input.policies,
  });
  const policies: Partial<Record<GenrePolicyId, GenrePolicy>> = {};
  const byGenre: Partial<Record<StoryGenre, GenrePolicyId>> = {};
  for (const policy of parsed.policies) {
    if (policies[policy.id] !== undefined) {
      throw new Error(`Duplicate genre policy id: ${policy.id}`);
    }
    if (byGenre[policy.genre] !== undefined) {
      throw new Error(`Duplicate policy registration for genre: ${policy.genre}`);
    }
    policies[policy.id] = deepFreeze({ ...policy });
    byGenre[policy.genre] = policy.id;
  }
  for (const genre of storyGenreSchema.options) {
    if (byGenre[genre] === undefined) {
      throw new Error(`Missing genre policy for genre: ${genre}`);
    }
  }
  return deepFreeze({
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    registryVersion: parsed.registryVersion,
    policies: policies as Readonly<Record<GenrePolicyId, GenrePolicy>>,
    byGenre: byGenre as Readonly<Record<StoryGenre, GenrePolicyId>>,
  });
}

const defaultPolicies = [
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/fictional-supernatural",
    version: "1.0.0",
    genre: "fictional-supernatural",
    evidenceLed: false,
    allowedNarrativeModes: ["character-led", "first-person", "unknown"],
    allowedFictionalities: ["fiction", "unknown"],
    tensionSources: ["rule-escalation", "environment", "observable-consequences"],
    prohibitedTechniques: ["unsupported-certainty", "victim-blaming"],
    defaultBoundaries: {
      dialogue: true,
      internalThoughts: true,
      connectiveDetails: "allow",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: false,
      requireConfidenceAttribution: false,
      prohibitUnsupportedCertainty: false,
    },
    allowSupernaturalAsFact: true,
    allowEnvironmentalThreatIntelligence: true,
    unresolvedFictionalitySeverity: "none",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/fictional-psychological",
    version: "1.0.0",
    genre: "fictional-psychological",
    evidenceLed: false,
    allowedNarrativeModes: ["character-led", "first-person", "unknown"],
    allowedFictionalities: ["fiction", "unknown"],
    tensionSources: ["perception", "observable-consequences", "chronology"],
    prohibitedTechniques: ["new-supernatural-mechanics", "unsupported-certainty"],
    defaultBoundaries: {
      dialogue: true,
      internalThoughts: true,
      connectiveDetails: "allow",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: false,
      requireConfidenceAttribution: false,
      prohibitUnsupportedCertainty: false,
    },
    allowSupernaturalAsFact: false,
    allowEnvironmentalThreatIntelligence: false,
    unresolvedFictionalitySeverity: "none",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/historical-mystery",
    version: "1.0.0",
    genre: "historical-mystery",
    evidenceLed: true,
    allowedNarrativeModes: ["evidence-led", "documentary", "unknown"],
    allowedFictionalities: ["nonfiction", "unknown"],
    tensionSources: ["evidence", "chronology", "unresolved-contradictions"],
    prohibitedTechniques: [
      "invented-dialogue",
      "invented-internal-thoughts",
      "unsupported-motive",
      "unsupported-certainty",
      "new-supernatural-mechanics",
      "intelligent-environment",
      "fictional-climax",
    ],
    defaultBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: "qualified-only",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: true,
      requireConfidenceAttribution: true,
      prohibitUnsupportedCertainty: true,
    },
    allowSupernaturalAsFact: false,
    allowEnvironmentalThreatIntelligence: false,
    unresolvedFictionalitySeverity: "warning",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/true-crime",
    version: "1.0.0",
    genre: "true-crime",
    evidenceLed: true,
    allowedNarrativeModes: ["evidence-led", "documentary", "unknown"],
    allowedFictionalities: ["nonfiction", "unknown"],
    tensionSources: ["evidence", "chronology", "observable-consequences"],
    prohibitedTechniques: [
      "invented-dialogue",
      "invented-internal-thoughts",
      "unsupported-motive",
      "unsupported-certainty",
      "victim-blaming",
      "fictional-climax",
    ],
    defaultBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: "qualified-only",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: true,
      requireConfidenceAttribution: true,
      prohibitUnsupportedCertainty: true,
    },
    allowSupernaturalAsFact: false,
    allowEnvironmentalThreatIntelligence: false,
    unresolvedFictionalitySeverity: "warning",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/documentary",
    version: "1.0.0",
    genre: "documentary",
    evidenceLed: true,
    allowedNarrativeModes: ["evidence-led", "documentary", "unknown"],
    allowedFictionalities: ["nonfiction", "unknown"],
    tensionSources: ["evidence", "chronology", "observable-consequences"],
    prohibitedTechniques: [
      "invented-dialogue",
      "invented-internal-thoughts",
      "unsupported-motive",
      "unsupported-certainty",
      "fictional-climax",
    ],
    defaultBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: "qualified-only",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: true,
      requireConfidenceAttribution: true,
      prohibitUnsupportedCertainty: true,
    },
    allowSupernaturalAsFact: false,
    allowEnvironmentalThreatIntelligence: false,
    unresolvedFictionalitySeverity: "warning",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/folklore",
    version: "1.0.0",
    genre: "folklore",
    evidenceLed: false,
    allowedNarrativeModes: ["character-led", "unknown"],
    allowedFictionalities: ["fiction-inspired-by-folklore", "unknown"],
    tensionSources: ["rule-escalation", "environment", "perception"],
    prohibitedTechniques: ["unsupported-certainty"],
    defaultBoundaries: {
      dialogue: true,
      internalThoughts: true,
      connectiveDetails: "allow",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: false,
      requireConfidenceAttribution: false,
      prohibitUnsupportedCertainty: true,
    },
    allowSupernaturalAsFact: true,
    allowEnvironmentalThreatIntelligence: true,
    unresolvedFictionalitySeverity: "none",
  },
  {
    schemaVersion: GENRE_POLICY_SCHEMA_VERSION,
    id: "genre-policy/unknown",
    version: "1.0.0",
    genre: "unknown",
    evidenceLed: false,
    allowedNarrativeModes: ["unknown", "character-led", "evidence-led", "documentary"],
    allowedFictionalities: ["fiction", "nonfiction", "fiction-inspired-by-folklore", "unknown"],
    tensionSources: ["chronology", "observable-consequences"],
    prohibitedTechniques: [
      "unsupported-certainty",
      "new-supernatural-mechanics",
      "invented-dialogue",
      "invented-internal-thoughts",
    ],
    defaultBoundaries: {
      dialogue: false,
      internalThoughts: false,
      connectiveDetails: "qualified-only",
      motives: false,
      undocumentedActions: false,
      qualifiedReconstruction: true,
      requireConfidenceAttribution: true,
      prohibitUnsupportedCertainty: true,
    },
    allowSupernaturalAsFact: false,
    allowEnvironmentalThreatIntelligence: false,
    unresolvedFictionalitySeverity: "warning",
  },
] satisfies readonly GenrePolicy[];

export const DEFAULT_GENRE_POLICY_REGISTRY = createGenrePolicyRegistry({
  registryVersion: GENRE_POLICY_REGISTRY_VERSION,
  policies: defaultPolicies,
});

export function getGenrePolicy(
  registry: GenrePolicyRegistry,
  policyId: GenrePolicyId
): GenrePolicy {
  return registry.policies[policyId];
}

function pushIssue(
  issues: StoryValidationIssue[],
  issue: StoryValidationIssue
): void {
  const key = JSON.stringify([
    issue.code,
    issue.severity,
    issue.path,
    issue.message,
  ]);
  if (!issues.some((existing) => JSON.stringify([
    existing.code,
    existing.severity,
    existing.path,
    existing.message,
  ]) === key)) {
    issues.push(issue);
  }
}

export function resolveGenrePolicy(input: {
  readonly genre: StoryGenre;
  readonly registry?: GenrePolicyRegistry;
  readonly requestedPolicyId?: GenrePolicyId;
  readonly requestedPolicyVersion?: string;
}): GenrePolicyResolution {
  const registry = input.registry ?? DEFAULT_GENRE_POLICY_REGISTRY;
  const issues: StoryValidationIssue[] = [];
  const policyId = input.requestedPolicyId ?? registry.byGenre[input.genre];
  if (policyId === undefined) {
    pushIssue(
      issues,
      genrePolicyNotFoundIssueSchema.parse({
        code: "GENRE_POLICY_NOT_FOUND",
        requestedPolicyId: input.requestedPolicyId,
        message: `No genre policy was found for genre "${input.genre}".`,
        path: ["genre"],
        severity: "error",
        repairability: "manual",
      })
    );
    return { ok: false, normalizedGenre: input.genre, issues };
  }
  const policy = registry.policies[policyId];
  if (policy === undefined) {
    pushIssue(
      issues,
      genrePolicyNotFoundIssueSchema.parse({
        code: "GENRE_POLICY_NOT_FOUND",
        requestedPolicyId: policyId,
        message: `Requested genre policy "${policyId}" is not registered.`,
        path: ["genrePolicyId"],
        severity: "error",
        repairability: "manual",
      })
    );
    return { ok: false, normalizedGenre: input.genre, issues };
  }
  if (
    input.requestedPolicyVersion !== undefined &&
    input.requestedPolicyVersion !== policy.version
  ) {
    pushIssue(
      issues,
      genrePolicyVersionUnsupportedIssueSchema.parse({
        code: "GENRE_POLICY_VERSION_UNSUPPORTED",
        requestedPolicyVersion: input.requestedPolicyVersion,
        actualPolicyVersion: policy.version,
        message: `Requested genre policy version "${input.requestedPolicyVersion}" does not match "${policy.version}".`,
        path: ["genrePolicyVersion"],
        severity: "error",
        repairability: "manual",
      })
    );
    return { ok: false, normalizedGenre: input.genre, issues };
  }
  if (input.genre === "unknown") {
    pushIssue(
      issues,
      unknownGenreRequiresConservativePolicyIssueSchema.parse({
        code: "UNKNOWN_GENRE_REQUIRES_CONSERVATIVE_POLICY",
        message: "Unknown genre resolves to the conservative unknown policy.",
        path: ["genre"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }
  return { ok: true, normalizedGenre: input.genre, policy, issues };
}

function modeAllowed(
  allowedModes: readonly NarrativeMode[],
  mode: NarrativeMode
): boolean {
  return allowedModes.includes(mode);
}

function fictionalityAllowed(
  allowed: readonly StoryIR["fictionality"][],
  value: StoryIR["fictionality"]
): boolean {
  return allowed.includes(value);
}

export function validateGenrePolicyCompatibility(input: {
  readonly storyIr: StoryIR;
  readonly policy: GenrePolicy;
}): readonly StoryValidationIssue[] {
  const { storyIr, policy } = input;
  const issues: StoryValidationIssue[] = [];

  if (!fictionalityAllowed(policy.allowedFictionalities, storyIr.fictionality)) {
    pushIssue(
      issues,
      conflictingGenreAndFictionalityIssueSchema.parse({
        code: "CONFLICTING_GENRE_AND_FICTIONALITY",
        genre: storyIr.genre,
        fictionality: storyIr.fictionality,
        message: `Genre "${storyIr.genre}" is incompatible with fictionality "${storyIr.fictionality}".`,
        path: ["fictionality"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (!modeAllowed(policy.allowedNarrativeModes, storyIr.narrativeMode)) {
    pushIssue(
      issues,
      narrativeModeIncompatibleWithGenreIssueSchema.parse({
        code: "NARRATIVE_MODE_INCOMPATIBLE_WITH_GENRE",
        genre: storyIr.genre,
        narrativeMode: storyIr.narrativeMode,
        message: `Narrative mode "${storyIr.narrativeMode}" is incompatible with genre "${storyIr.genre}".`,
        path: ["narrativeMode"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (
    storyIr.genre === "historical-mystery" &&
    (storyIr.centralRuleMechanism.supernatural ||
      storyIr.centralThreat.type === "supernatural")
  ) {
    pushIssue(
      issues,
      supernaturalRuleInHistoricalMysteryIssueSchema.parse({
        code: "SUPERNATURAL_RULE_IN_HISTORICAL_MYSTERY",
        ruleText: storyIr.centralRuleMechanism.description,
        message:
          "Historical mystery cannot treat a supernatural rule or threat as established fact.",
        path: ["centralRuleMechanism"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  if (
    policy.evidenceLed &&
    storyIr.fictionality === "unknown" &&
    policy.unresolvedFictionalitySeverity === "warning"
  ) {
    pushIssue(
      issues,
      fictionalityUnresolvedForEvidenceLedGenreIssueSchema.parse({
        code: "FICTIONALITY_UNRESOLVED_FOR_EVIDENCE_LED_GENRE",
        genre: storyIr.genre,
        message:
          "Evidence-led genres require unresolved fictionality to remain explicitly qualified.",
        path: ["fictionality"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }

  if (policy.defaultBoundaries.dialogue && !storyIr.allowedInventionBoundaries.dialogue) {
    pushIssue(
      issues,
      policyOverrideWeakensSourceBoundaryIssueSchema.parse({
        code: "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY",
        boundary: "dialogue",
        message: "Policy dialogue allowance cannot weaken a stricter StoryIR boundary.",
        path: ["allowedInventionBoundaries", "dialogue"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }
  if (
    policy.defaultBoundaries.internalThoughts &&
    !storyIr.allowedInventionBoundaries.internalThoughts
  ) {
    pushIssue(
      issues,
      policyOverrideWeakensSourceBoundaryIssueSchema.parse({
        code: "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY",
        boundary: "internalThoughts",
        message:
          "Policy internal-thought allowance cannot weaken a stricter StoryIR boundary.",
        path: ["allowedInventionBoundaries", "internalThoughts"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }
  if (policy.defaultBoundaries.motives && !storyIr.allowedInventionBoundaries.motives) {
    pushIssue(
      issues,
      policyOverrideWeakensSourceBoundaryIssueSchema.parse({
        code: "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY",
        boundary: "motives",
        message: "Policy motive allowance cannot weaken a stricter StoryIR boundary.",
        path: ["allowedInventionBoundaries", "motives"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }
  if (
    policy.defaultBoundaries.undocumentedActions &&
    !storyIr.allowedInventionBoundaries.undocumentedActions
  ) {
    pushIssue(
      issues,
      policyOverrideWeakensSourceBoundaryIssueSchema.parse({
        code: "POLICY_OVERRIDE_WEAKENS_SOURCE_BOUNDARY",
        boundary: "undocumentedActions",
        message:
          "Policy undocumented-action allowance cannot weaken a stricter StoryIR boundary.",
        path: ["allowedInventionBoundaries", "undocumentedActions"],
        severity: "warning",
        repairability: "manual",
      })
    );
  }
  return issues;
}
