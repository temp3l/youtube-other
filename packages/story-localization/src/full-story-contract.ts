import { contentHash, hashText } from "@mediaforge/shared";
import { z } from "zod";
import {
  characterRenameMapSchema,
  type CharacterRenameMap,
} from "./character-rename.service.js";
import {
  DEFAULT_GENRE_POLICY_REGISTRY,
  type GenrePolicy,
  type GenrePolicyId,
  type GenrePolicyRegistry,
  type GenrePolicyResolution,
  GENRE_POLICY_REGISTRY_VERSION,
  resolveGenrePolicy,
  validateGenrePolicyCompatibility,
} from "./genre-policy.js";
import { STABLE_JSON_SERIALIZER_VERSION, stableSerialize } from "./stable-json.js";
import {
  contractSourceIrInvalidIssueSchema,
  conflictingFactStatementsIssueSchema,
  fullStoryOutputConstraintsSchema,
  getBlockingIssues,
  hasBlockingIssues,
  missingNarrativeCulminationIssueSchema,
  missingRequiredEndingIssueSchema,
  normalizeStoryIRCompatibility,
  storyArtifactIdentitySchema,
  storyFactSchema,
  storyIrEntitySchema,
  storyIrSchema,
  type FullStoryOutputConstraints,
  type StoryArtifactIdentity,
  type StoryIR,
  type StoryValidationIssue,
  validateStoryIR,
  writtenMessageSchema,
} from "./story-artifact-model.js";

export const FULL_STORY_CONTRACT_SCHEMA_VERSION = "full-story-contract-schema-v1";
export const FULL_STORY_CONTRACT_VERSION = "full-story-contract-v1";
export const FULL_STORY_CONTRACT_BUILDER_VERSION = "full-story-contract-builder-v1";
export const FULL_STORY_CONTRACT_ENVELOPE_VERSION = "full-story-contract-envelope-v1";

const fullStoryArtifactIdentitySchema = storyArtifactIdentitySchema
  .extend({
    variant: z.literal("full"),
  })
  .strict();
export type FullStoryArtifactIdentity = z.infer<
  typeof fullStoryArtifactIdentitySchema
>;

export const effectiveGenerationBoundariesSchema = z
  .object({
    dialogue: z.boolean(),
    internalThoughts: z.boolean(),
    connectiveDetails: z.enum(["allow", "qualified-only", "forbid"]),
    motives: z.boolean(),
    undocumentedActions: z.boolean(),
    qualifiedReconstruction: z.boolean(),
    requireConfidenceAttribution: z.boolean(),
    prohibitUnsupportedCertainty: z.boolean(),
  })
  .strict();
export type EffectiveGenerationBoundaries = z.infer<
  typeof effectiveGenerationBoundariesSchema
>;

const contractEntitySchema = storyIrEntitySchema;
const contractFactSchema = storyFactSchema;
const contractEventSchema = z.string().trim().min(1);
const contractThreatSchema = storyIrSchema.shape.centralThreat;
const contractRuleSchema = storyIrSchema.shape.centralRuleMechanism;
const contractObjectSchema = storyIrSchema.shape.criticalObjects.element;
const contractWrittenMessageSchema = writtenMessageSchema;

const sourceSummarySchema = z
  .object({
    hasDisputedFacts: z.boolean(),
    hasUnknownConfidenceFacts: z.boolean(),
  })
  .strict();

export const fullStoryContractSchema = z
  .object({
    schemaVersion: z.literal(FULL_STORY_CONTRACT_SCHEMA_VERSION),
    contractVersion: z.literal(FULL_STORY_CONTRACT_VERSION),
    identity: fullStoryArtifactIdentitySchema,
    classification: z
      .object({
        genre: storyIrSchema.shape.genre,
        fictionality: storyIrSchema.shape.fictionality,
        narrativeMode: storyIrSchema.shape.narrativeMode,
        genrePolicyId: z.string().trim().min(1),
        genrePolicyVersion: z.string().trim().min(1),
      })
      .strict(),
    sourceTruth: z
      .object({
        entities: z.array(contractEntitySchema),
        immutableFacts: z.array(contractFactSchema),
        chronology: z.array(contractEventSchema),
        centralThreat: contractThreatSchema,
        centralRuleOrMechanism: contractRuleSchema.optional(),
        criticalObjects: z.array(contractObjectSchema),
        writtenMessages: z.array(contractWrittenMessageSchema),
        narrativeCulmination: z.string().trim().min(1),
        endingConsequence: z.string().trim().min(1),
      })
      .strict(),
    generationBoundaries: effectiveGenerationBoundariesSchema,
    sourceSummary: sourceSummarySchema.optional(),
    fullOutputConstraints: fullStoryOutputConstraintsSchema,
    characterRenameMap: characterRenameMapSchema,
  })
  .strict();
export type FullStoryContract = z.infer<typeof fullStoryContractSchema>;

export const fullStoryContractLineageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cleaned-source"),
      originalSourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
      cleanedSourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
      cleanerVersion: z.string().trim().min(1),
      cleaningReportVersion: z.string().trim().min(1),
      storyIrHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
  z
    .object({
      kind: z.literal("story-ir-only"),
      storyIrHash: z.string().regex(/^[a-f0-9]{64}$/u),
      reason: z.enum(["legacy-adapter", "test-fixture", "lineage-unavailable"]),
    })
    .strict(),
]);
export type FullStoryContractLineage = z.infer<
  typeof fullStoryContractLineageSchema
>;

export const fullStoryContractEnvelopeSchema = z
  .object({
    envelopeVersion: z.literal(FULL_STORY_CONTRACT_ENVELOPE_VERSION),
    schemaVersion: z.literal(FULL_STORY_CONTRACT_SCHEMA_VERSION),
    contractVersion: z.literal(FULL_STORY_CONTRACT_VERSION),
    builderVersion: z.literal(FULL_STORY_CONTRACT_BUILDER_VERSION),
    serializerVersion: z.literal(STABLE_JSON_SERIALIZER_VERSION),
    policyRegistryVersion: z.string().trim().min(1),
    genrePolicyId: z.string().trim().min(1),
    genrePolicyVersion: z.string().trim().min(1),
    storyIrHash: z.string().regex(/^[a-f0-9]{64}$/u),
    contractHash: z.string().regex(/^[a-f0-9]{64}$/u),
    buildFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    lineage: fullStoryContractLineageSchema,
  })
  .strict();
export type FullStoryContractEnvelope = z.infer<
  typeof fullStoryContractEnvelopeSchema
>;

export const fullStoryContractBuildMetricsSchema = z
  .object({
    entityCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    chronologyCount: z.number().int().nonnegative(),
    criticalObjectCount: z.number().int().nonnegative(),
    writtenMessageCount: z.number().int().nonnegative(),
    serializedCharacterCount: z.number().int().nonnegative(),
  })
  .strict();
export type FullStoryContractBuildMetrics = z.infer<
  typeof fullStoryContractBuildMetricsSchema
>;

export type FullStoryContractBuildResult =
  | {
      readonly ok: true;
      readonly contract: FullStoryContract;
      readonly envelope: FullStoryContractEnvelope;
      readonly policyResolution: GenrePolicyResolution & { readonly ok: true };
      readonly issues: readonly StoryValidationIssue[];
      readonly metrics: FullStoryContractBuildMetrics;
    }
  | {
      readonly ok: false;
      readonly issues: readonly StoryValidationIssue[];
      readonly policyResolution?: GenrePolicyResolution;
    };

function issueFromSchemaFailure(path: readonly (string | number)[], message: string) {
  return contractSourceIrInvalidIssueSchema.parse({
    code: "CONTRACT_SOURCE_IR_INVALID",
    detail: message,
    message,
    path,
    severity: "error",
    repairability: "manual",
  });
}

function dedupeIssues(
  issues: readonly StoryValidationIssue[]
): readonly StoryValidationIssue[] {
  const seen = new Set<string>();
  const deduped: StoryValidationIssue[] = [];
  for (const issue of issues) {
    const key = stableSerialize({
      code: issue.code,
      severity: issue.severity,
      path: issue.path,
      message: issue.message,
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(issue);
  }
  return deduped;
}

function dedupeEntities(entities: StoryIR["entities"]): StoryIR["entities"] {
  const seen = new Set<string>();
  const deduped: StoryIR["entities"] = [];
  for (const entity of entities) {
    const key = stableSerialize(entity);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entity);
  }
  return deduped;
}

function dedupeChronology(chronology: StoryIR["chronology"]): StoryIR["chronology"] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const event of chronology) {
    const key = event.normalize("NFC");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}

function dedupeFacts(
  facts: StoryIR["immutableFacts"]
): {
  readonly facts: StoryIR["immutableFacts"];
  readonly issues: readonly StoryValidationIssue[];
} {
  const seen = new Set<string>();
  const byStatement = new Map<
    string,
    { readonly confidence: StoryIR["immutableFacts"][number]["confidence"]; readonly immutable: boolean }
  >();
  const deduped: StoryIR["immutableFacts"] = [];
  const issues: StoryValidationIssue[] = [];
  for (const fact of facts) {
    const statementKey = fact.statement.normalize("NFC");
    const exactKey = stableSerialize(fact);
    if (seen.has(exactKey)) {
      continue;
    }
    seen.add(exactKey);
    const existing = byStatement.get(statementKey);
    if (
      existing !== undefined &&
      (existing.confidence !== fact.confidence || existing.immutable !== fact.immutable)
    ) {
      issues.push(
        conflictingFactStatementsIssueSchema.parse({
          code: "CONFLICTING_FACT_STATEMENTS",
          statement: fact.statement,
          message: `Fact "${fact.statement}" appears with conflicting confidence or immutability.`,
          path: ["immutableFacts"],
          severity: "warning",
          repairability: "manual",
        })
      );
    } else if (existing === undefined) {
      byStatement.set(statementKey, {
        confidence: fact.confidence,
        immutable: fact.immutable,
      });
    }
    deduped.push(fact);
  }
  return { facts: deduped, issues };
}

function dedupeWrittenMessages(
  writtenMessages: StoryIR["writtenMessages"]
): StoryIR["writtenMessages"] {
  const seen = new Set<string>();
  const deduped: StoryIR["writtenMessages"] = [];
  for (const writtenMessage of writtenMessages) {
    const key = stableSerialize(writtenMessage);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(writtenMessage);
  }
  return deduped;
}

function buildEffectiveGenerationBoundaries(
  storyIr: StoryIR,
  policy: GenrePolicy
): EffectiveGenerationBoundaries {
  return effectiveGenerationBoundariesSchema.parse({
    dialogue:
      storyIr.allowedInventionBoundaries.dialogue && policy.defaultBoundaries.dialogue,
    internalThoughts:
      storyIr.allowedInventionBoundaries.internalThoughts &&
      policy.defaultBoundaries.internalThoughts,
    connectiveDetails: storyIr.allowedInventionBoundaries.connectiveDetails
      ? policy.defaultBoundaries.connectiveDetails
      : "forbid",
    motives:
      storyIr.allowedInventionBoundaries.motives && policy.defaultBoundaries.motives,
    undocumentedActions:
      storyIr.allowedInventionBoundaries.undocumentedActions &&
      policy.defaultBoundaries.undocumentedActions,
    qualifiedReconstruction: policy.defaultBoundaries.qualifiedReconstruction,
    requireConfidenceAttribution:
      policy.defaultBoundaries.requireConfidenceAttribution,
    prohibitUnsupportedCertainty:
      policy.defaultBoundaries.prohibitUnsupportedCertainty,
  });
}

function buildSourceSummary(storyIr: StoryIR) {
  const confidenceValues = storyIr.immutableFacts.map((fact) => fact.confidence);
  return {
    hasDisputedFacts: confidenceValues.includes("disputed"),
    hasUnknownConfidenceFacts: confidenceValues.includes("unknown"),
  };
}

export function computeStoryIrContentHash(storyIr: StoryIR): string {
  return hashText(stableSerialize(storyIrSchema.parse(storyIr)));
}

export function computeFullStoryContractContentHash(
  contract: FullStoryContract
): string {
  return hashText(stableSerialize(fullStoryContractSchema.parse(contract)));
}

export function computeFullStoryContractBuildFingerprint(input: {
  readonly storyIrHash: string;
  readonly contractHash: string;
  readonly policy: GenrePolicy;
  readonly registryVersion: string;
  readonly lineage: FullStoryContractLineage;
}): string {
  const parts = [
    input.storyIrHash,
    input.contractHash,
    FULL_STORY_CONTRACT_SCHEMA_VERSION,
    FULL_STORY_CONTRACT_VERSION,
    FULL_STORY_CONTRACT_BUILDER_VERSION,
    input.registryVersion,
    input.policy.id,
    input.policy.version,
    input.lineage.kind,
    STABLE_JSON_SERIALIZER_VERSION,
  ];
  if (input.lineage.kind === "cleaned-source") {
    parts.push(
      input.lineage.cleanedSourceHash,
      input.lineage.cleanerVersion,
      input.lineage.cleaningReportVersion
    );
  }
  return contentHash(parts);
}

export function buildFullStoryContract(input: {
  readonly storyIr: StoryIR;
  readonly artifactIdentity: StoryArtifactIdentity;
  readonly outputConstraints: FullStoryOutputConstraints;
  readonly characterRenameMap?: CharacterRenameMap;
  readonly policyRegistry?: GenrePolicyRegistry;
  readonly lineage: FullStoryContractLineage;
}): FullStoryContractBuildResult {
  const issues: StoryValidationIssue[] = [];
  let nativeStoryIr: StoryIR;
  try {
    nativeStoryIr = storyIrSchema.parse(input.storyIr);
  } catch {
    try {
      nativeStoryIr = normalizeStoryIRCompatibility(input.storyIr);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "StoryIR schema validation failed.";
      return {
        ok: false,
        issues: [
          issueFromSchemaFailure(["storyIr"], message),
        ],
      };
    }
  }

  issues.push(...validateStoryIR(nativeStoryIr));

  const identityResult = fullStoryArtifactIdentitySchema.safeParse(input.artifactIdentity);
  if (!identityResult.success) {
    issues.push(issueFromSchemaFailure(["artifactIdentity"], identityResult.error.message));
  }
  const artifactIdentity = identityResult.success
    ? identityResult.data
    : fullStoryArtifactIdentitySchema.parse(input.artifactIdentity);

  const constraintsResult = fullStoryOutputConstraintsSchema.safeParse(
    input.outputConstraints
  );
  if (!constraintsResult.success) {
    issues.push(
      issueFromSchemaFailure(["outputConstraints"], constraintsResult.error.message)
    );
  }

  const resolution = resolveGenrePolicy({
    genre: nativeStoryIr.genre,
    registry: input.policyRegistry ?? DEFAULT_GENRE_POLICY_REGISTRY,
  });
  issues.push(...resolution.issues);
  if (!resolution.ok) {
    return {
      ok: false,
      issues: dedupeIssues(issues),
      policyResolution: resolution,
    };
  }

  issues.push(
    ...validateGenrePolicyCompatibility({
      storyIr: nativeStoryIr,
      policy: resolution.policy,
    })
  );

  if (nativeStoryIr.climax.trim().length === 0) {
    issues.push(
      missingNarrativeCulminationIssueSchema.parse({
        code: "MISSING_NARRATIVE_CULMINATION",
        message: "StoryIR climax is required for the full-story contract.",
        path: ["climax"],
        severity: "error",
        repairability: "manual",
      })
    );
  }
  if (nativeStoryIr.endingConsequence.trim().length === 0) {
    issues.push(
      missingRequiredEndingIssueSchema.parse({
        code: "MISSING_REQUIRED_ENDING",
        message: "StoryIR ending consequence is required for the full-story contract.",
        path: ["endingConsequence"],
        severity: "error",
        repairability: "manual",
      })
    );
  }

  const dedupedEntities = dedupeEntities(nativeStoryIr.entities);
  const dedupedChronology = dedupeChronology(nativeStoryIr.chronology);
  const dedupedWrittenMessages = dedupeWrittenMessages(nativeStoryIr.writtenMessages);
  const dedupedFactsResult = dedupeFacts(nativeStoryIr.immutableFacts);
  issues.push(...dedupedFactsResult.issues);

  const effectiveBoundaries = buildEffectiveGenerationBoundaries(
    nativeStoryIr,
    resolution.policy
  );

  const dedupedIssues = dedupeIssues(issues);
  if (hasBlockingIssues(dedupedIssues)) {
    return {
      ok: false,
      issues: dedupedIssues,
      policyResolution: resolution,
    };
  }
  const storyIrHash = computeStoryIrContentHash(nativeStoryIr);

  const contract = fullStoryContractSchema.parse({
    schemaVersion: FULL_STORY_CONTRACT_SCHEMA_VERSION,
    contractVersion: FULL_STORY_CONTRACT_VERSION,
    identity: artifactIdentity,
    classification: {
      genre: nativeStoryIr.genre,
      fictionality: nativeStoryIr.fictionality,
      narrativeMode: nativeStoryIr.narrativeMode,
      genrePolicyId: resolution.policy.id,
      genrePolicyVersion: resolution.policy.version,
    },
    sourceTruth: {
      entities: dedupedEntities,
      immutableFacts: dedupedFactsResult.facts,
      chronology: dedupedChronology,
      centralThreat: nativeStoryIr.centralThreat,
      ...(nativeStoryIr.centralRuleMechanism.description.trim().length > 0
        ? { centralRuleOrMechanism: nativeStoryIr.centralRuleMechanism }
        : {}),
      criticalObjects: nativeStoryIr.criticalObjects,
      writtenMessages: dedupedWrittenMessages,
      narrativeCulmination: nativeStoryIr.climax,
      endingConsequence: nativeStoryIr.endingConsequence,
    },
    generationBoundaries: effectiveBoundaries,
    sourceSummary: buildSourceSummary(nativeStoryIr),
    fullOutputConstraints: constraintsResult.data,
    characterRenameMap:
      input.characterRenameMap ??
      characterRenameMapSchema.parse({
        version: 1,
        episodeId: artifactIdentity.episodeNumber,
        sourceHash: storyIrHash,
        poolId: "contract-fallback",
        entries: [],
        hash: hashText(`${artifactIdentity.episodeNumber}\u0000${storyIrHash}`),
      }),
  });

  const lineage = fullStoryContractLineageSchema.parse(
    input.lineage.kind === "cleaned-source"
      ? { ...input.lineage, storyIrHash }
      : { ...input.lineage, storyIrHash }
  );
  const contractHash = computeFullStoryContractContentHash(contract);
  const buildFingerprint = computeFullStoryContractBuildFingerprint({
    storyIrHash,
    contractHash,
    policy: resolution.policy,
    registryVersion:
      (input.policyRegistry ?? DEFAULT_GENRE_POLICY_REGISTRY).registryVersion,
    lineage,
  });
  const envelope = fullStoryContractEnvelopeSchema.parse({
    envelopeVersion: FULL_STORY_CONTRACT_ENVELOPE_VERSION,
    schemaVersion: FULL_STORY_CONTRACT_SCHEMA_VERSION,
    contractVersion: FULL_STORY_CONTRACT_VERSION,
    builderVersion: FULL_STORY_CONTRACT_BUILDER_VERSION,
    serializerVersion: STABLE_JSON_SERIALIZER_VERSION,
    policyRegistryVersion:
      (input.policyRegistry ?? DEFAULT_GENRE_POLICY_REGISTRY).registryVersion,
    genrePolicyId: resolution.policy.id,
    genrePolicyVersion: resolution.policy.version,
    storyIrHash,
    contractHash,
    buildFingerprint,
    lineage,
  });
  const metrics = fullStoryContractBuildMetricsSchema.parse({
    entityCount: contract.sourceTruth.entities.length,
    factCount: contract.sourceTruth.immutableFacts.length,
    chronologyCount: contract.sourceTruth.chronology.length,
    criticalObjectCount: contract.sourceTruth.criticalObjects.length,
    writtenMessageCount: contract.sourceTruth.writtenMessages.length,
    serializedCharacterCount: stableSerialize(contract).length,
  });

  return {
    ok: true,
    contract,
    envelope,
    policyResolution: resolution,
    issues: dedupedIssues,
    metrics,
  };
}

export function getContractBuildBlockingIssues(
  result: FullStoryContractBuildResult
): readonly StoryValidationIssue[] {
  return getBlockingIssues(result.issues);
}
