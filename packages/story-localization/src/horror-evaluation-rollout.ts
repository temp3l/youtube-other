import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureWorkspacePath,
  hashText,
  writeTextAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION,
  HORROR_EDITORIAL_RUBRIC_VERSION,
  horrorBlindReviewAnswerKeySchema,
  horrorBlindReviewPacketSchema,
  horrorCalibrationCorpusSchema,
  horrorEditorialStrataSchema,
  horrorEditorialRatingSchema,
  prepareBlindHorrorEditorialCandidates,
  prepareBlindHorrorEditorialReview,
  type HorrorBlindReviewAnswerKey,
  type HorrorBlindReviewPacket,
  type HorrorEditorialStrata,
} from "./horror-editorial-calibration.js";
import {
  STABLE_JSON_SERIALIZER_VERSION,
  stableSerialize,
} from "./stable-json.js";

export const HORROR_EVALUATION_MANIFEST_SCHEMA_VERSION =
  "horror-controlled-evaluation-manifest-v1";
export const HORROR_AUDIENCE_METRICS_IMPORT_SCHEMA_VERSION =
  "horror-authorized-audience-metrics-import-v1";
export const HORROR_ROLLOUT_DECISION_SCHEMA_VERSION =
  "horror-rollout-decision-v1";
export const HORROR_PRODUCTION_EDITORIAL_CANDIDATE_SET_SCHEMA_VERSION =
  "horror-production-editorial-candidate-set-v1";
export const HORROR_CANDIDATE_GENERATION_PREFLIGHT_SCHEMA_VERSION =
  "horror-candidate-generation-preflight-v1";
export const HORROR_CANDIDATE_EXECUTION_LEDGER_SCHEMA_VERSION =
  "horror-candidate-execution-ledger-v1";
export const HORROR_EVALUATION_PRODUCER_VERSION =
  "story-localization-controlled-evaluation-v1";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmptyTextSchema = z.string().trim().min(1).max(2_000);
const finiteRatioSchema = z.number().finite().min(0).max(1);
const timestampSchema = z.string().datetime({ offset: true });
const workspaceRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine(
    (value) =>
      !path.isAbsolute(value) &&
      !value.split(/[\\/]/u).some((segment) => segment === ".."),
    "Artifact paths must be workspace-relative and may not traverse upward."
  );

export const horrorEvaluationFormatSchema = z.enum(["full", "short"]);
export type HorrorEvaluationFormat = z.infer<
  typeof horrorEvaluationFormatSchema
>;

export const horrorEvaluationMetricSchema = z.enum([
  "comprehension",
  "suspense",
  "curiosity",
  "earnedSurprise",
  "presence",
  "emotionalCost",
  "payoff",
  "normalizedRetention",
  "earlyRetention",
  "averagePercentageViewed",
  "endingRetention",
  "ctr",
]);
export type HorrorEvaluationMetric = z.infer<
  typeof horrorEvaluationMetricSchema
>;

function resolvedDecisionSchema<T extends z.ZodTypeAny>(value: T) {
  return z
    .object({
      status: z.literal("resolved"),
      value,
      decisionReference: identifierSchema,
    })
    .strict();
}

const unresolvedDecisionSchema = z
  .object({
    status: z.literal("unresolved"),
    reason: nonEmptyTextSchema,
  })
  .strict();

const primaryMetricDecisionSchema = z.discriminatedUnion("status", [
  unresolvedDecisionSchema,
  resolvedDecisionSchema(horrorEvaluationMetricSchema),
]);
const practicalThresholdDecisionSchema = z.discriminatedUnion("status", [
  unresolvedDecisionSchema,
  resolvedDecisionSchema(z.number().finite().positive()),
]);
const authorityDecisionSchema = z.discriminatedUnion("status", [
  unresolvedDecisionSchema,
  resolvedDecisionSchema(
    z
      .object({
        authorityId: identifierSchema,
        scopeReference: identifierSchema,
      })
      .strict()
  ),
]);

const evaluationSampleUnitSchema = z
  .object({
    sampleUnitId: identifierSchema,
    locale: z.string().trim().min(2).max(40),
    genrePolicyId: identifierSchema,
    durationBand: z.enum(["under-60s", "60-180s", "over-180s"]),
    audienceType: z.enum(["new", "returning", "mixed", "not-applicable"]),
  })
  .strict();

const evaluationSampleDecisionSchema = z.discriminatedUnion("status", [
  unresolvedDecisionSchema,
  resolvedDecisionSchema(
    z
      .object({
        full: z.array(evaluationSampleUnitSchema).min(1),
        short: z.array(evaluationSampleUnitSchema).min(1),
      })
      .strict()
  ),
]);

const costBudgetDecisionSchema = z.discriminatedUnion("status", [
  unresolvedDecisionSchema,
  resolvedDecisionSchema(
    z
      .object({
        maxIncrementalProviderCalls: z.number().int().nonnegative(),
        maxIncrementalCostUsd: z.number().finite().nonnegative(),
        budgetReference: identifierSchema,
      })
      .strict()
  ),
]);

export const horrorEvaluationManifestSchema = z
  .object({
    schemaVersion: z.literal(HORROR_EVALUATION_MANIFEST_SCHEMA_VERSION),
    evaluationId: identifierSchema,
    preregisteredAt: timestampSchema,
    preregisteredBy: z
      .object({
        actorId: identifierSchema,
        role: z.enum(["operator", "editorial-lead", "repository-owner"]),
        containsPersonalSecrets: z.literal(false),
      })
      .strict(),
    outcomeInspectionStatus: z.literal("not-started"),
    primaryMetric: primaryMetricDecisionSchema,
    practicalImprovementThreshold: practicalThresholdDecisionSchema,
    sample: evaluationSampleDecisionSchema,
    exclusions: z.array(
      z
        .object({
          exclusionId: identifierSchema,
          rule: nonEmptyTextSchema,
          decidedBeforeOutcomes: z.literal(true),
        })
        .strict()
    ),
    stratification: z
      .object({
        dimensions: z
          .array(
            z.enum(["locale", "genrePolicyId", "durationBand", "audienceType"])
          )
          .min(1),
        minimumSamplePerArm: z.number().int().min(2),
        insufficientSamplesAreExploratory: z.literal(true),
      })
      .strict(),
    strategyVersions: z
      .object({
        baseline: identifierSchema,
        strategy: identifierSchema,
      })
      .strict(),
    costBudget: costBudgetDecisionSchema,
    productDecisions: z
      .object({
        productionAnalyticsAuthority: authorityDecisionSchema,
        defaultRolloutChangeAuthority: authorityDecisionSchema,
      })
      .strict(),
    decisionRule: z
      .object({
        promotionRequiresAllSourcePlanGates: z.literal(true),
        missingDecisionOutcome: z.literal("remain-shadow"),
        fullAndShortEvaluatedSeparately: z.literal(true),
        ctrRequiresControlledTitleAndThumbnail: z.literal(true),
        rollbackIsConfigurationOnly: z.literal(true),
      })
      .strict(),
    creation: z
      .object({
        producerVersion: z.literal(HORROR_EVALUATION_PRODUCER_VERSION),
        serializerVersion: z.literal(STABLE_JSON_SERIALIZER_VERSION),
        deterministic: z.literal(true),
      })
      .strict(),
    manifestHash: hashSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const { manifestHash: _manifestHash, ...body } = manifest;
    if (hashText(stableSerialize(body)) !== manifest.manifestHash) {
      context.addIssue({
        code: "custom",
        path: ["manifestHash"],
        message: "Evaluation manifest hash does not match its contents.",
      });
    }
    if (manifest.sample.status === "resolved") {
      const ids = [
        ...manifest.sample.value.full,
        ...manifest.sample.value.short,
      ].map((unit) => unit.sampleUnitId);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          path: ["sample"],
          message: "Evaluation sample unit IDs must be unique across tracks.",
        });
      }
    }
    const dimensions = manifest.stratification.dimensions;
    if (new Set(dimensions).size !== dimensions.length) {
      context.addIssue({
        code: "custom",
        path: ["stratification", "dimensions"],
        message: "Stratification dimensions must be unique.",
      });
    }
  });
export type HorrorEvaluationManifest = z.infer<
  typeof horrorEvaluationManifestSchema
>;

export function buildHorrorEvaluationManifest(
  input: Omit<
    z.input<typeof horrorEvaluationManifestSchema>,
    "schemaVersion" | "creation" | "manifestHash"
  >
): HorrorEvaluationManifest {
  const body = {
    ...input,
    schemaVersion: HORROR_EVALUATION_MANIFEST_SCHEMA_VERSION,
    creation: {
      producerVersion: HORROR_EVALUATION_PRODUCER_VERSION,
      serializerVersion: STABLE_JSON_SERIALIZER_VERSION,
      deterministic: true as const,
    },
  };
  return horrorEvaluationManifestSchema.parse({
    ...body,
    manifestHash: hashText(stableSerialize(body)),
  });
}

export interface HorrorEvaluationArtifactPaths {
  readonly evaluationDirectory: string;
  readonly manifestPath: string;
  readonly candidateGenerationPreflightPath: string;
  readonly candidateExecutionLedgerPath: string;
  readonly productionCandidateSetPath: string;
  readonly fullBlindReviewPacketPath: string;
  readonly fullBlindReviewAnswerKeyPath: string;
  readonly shortBlindReviewPacketPath: string;
  readonly shortBlindReviewAnswerKeyPath: string;
  readonly audienceMetricsImportPath: string;
  readonly decisionPath: string;
}

export function resolveHorrorEvaluationArtifactPaths(args: {
  readonly outputDirectory: string;
  readonly evaluationId: string;
}): HorrorEvaluationArtifactPaths {
  const outputDirectory = path.resolve(args.outputDirectory);
  const evaluationId = identifierSchema.parse(args.evaluationId);
  const evaluationDirectory = ensureWorkspacePath(
    outputDirectory,
    path.join(outputDirectory, "horror-evaluations", evaluationId)
  );
  return {
    evaluationDirectory,
    manifestPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "evaluation-manifest.json")
    ),
    candidateGenerationPreflightPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "candidate-generation-preflight.json")
    ),
    candidateExecutionLedgerPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "candidate-execution-ledger.json")
    ),
    productionCandidateSetPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "production-editorial-candidates.json")
    ),
    fullBlindReviewPacketPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "blind-review-full.json")
    ),
    fullBlindReviewAnswerKeyPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "blind-review-full-answer-key.json")
    ),
    shortBlindReviewPacketPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "blind-review-short.json")
    ),
    shortBlindReviewAnswerKeyPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "blind-review-short-answer-key.json")
    ),
    audienceMetricsImportPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "audience-metrics-import.json")
    ),
    decisionPath: ensureWorkspacePath(
      evaluationDirectory,
      path.join(evaluationDirectory, "rollout-decision.json")
    ),
  };
}

async function readJsonIfPresent(
  filePath: string
): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function persistHorrorEvaluationManifest(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
}): Promise<{ readonly persisted: boolean; readonly reused: boolean }> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  if (path.basename(args.paths.evaluationDirectory) !== manifest.evaluationId) {
    throw new Error(
      "Evaluation manifest path does not match its evaluation ID."
    );
  }
  const existing = await readJsonIfPresent(args.paths.manifestPath);
  if (existing !== undefined) {
    const parsed = horrorEvaluationManifestSchema.parse(existing);
    if (parsed.manifestHash !== manifest.manifestHash) {
      throw new Error(
        "A persisted evaluation manifest is immutable after preregistration."
      );
    }
    return { persisted: false, reused: true };
  }
  await writeTextAtomic(
    args.paths.manifestPath,
    `${stableSerialize(manifest)}\n`
  );
  return { persisted: true, reused: false };
}

const candidateGenerationServiceSchema = z.enum([
  "story-localization-full-rewrite",
  "story-localization-short-rewrite",
]);
const canonicalEvaluationLineageSchema = z
  .object({
    episodeSlug: identifierSchema,
    locale: z.string().trim().min(2).max(40),
    lineage: z
      .object({
        cleanedSourceHash: hashSchema,
      })
      .passthrough(),
    validation: z
      .object({
        status: z.literal("passed"),
      })
      .passthrough(),
    status: z.literal("completed"),
  })
  .passthrough();

const horrorCandidateGenerationPreflightItemSchema = z
  .object({
    sampleUnitId: identifierSchema,
    episodeSlug: identifierSchema,
    format: horrorEvaluationFormatSchema,
    locale: z.string().trim().min(2).max(40),
    service: candidateGenerationServiceSchema,
    sourceArtifactPath: workspaceRelativePathSchema,
    sourceArtifactHash: hashSchema,
    canonicalFullArtifactPath: workspaceRelativePathSchema,
    canonicalFullArtifactHash: hashSchema,
    baselineArtifactPath: workspaceRelativePathSchema,
    baselineArtifactHash: hashSchema,
    strategyInputPath: workspaceRelativePathSchema,
    strategyOutputPath: workspaceRelativePathSchema,
    dependsOnSampleUnitId: identifierSchema.nullable(),
    rolloutMode: z.literal("enforce"),
    maxRetries: z.literal(0),
    plannedProviderCalls: z.literal(1),
    costCeilingUsd: z.number().finite().positive(),
    status: z.literal("ready"),
    blockingReasons: z.array(z.never()).length(0),
  })
  .strict();

export const horrorCandidateGenerationPreflightSchema = z
  .object({
    schemaVersion: z.literal(
      HORROR_CANDIDATE_GENERATION_PREFLIGHT_SCHEMA_VERSION
    ),
    preflightVersion: identifierSchema,
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    createdAt: timestampSchema,
    createdBy: z
      .object({
        actorId: identifierSchema,
        containsPersonalSecrets: z.literal(false),
      })
      .strict(),
    execution: z
      .object({
        preflightOnly: z.literal(true),
        dryRun: z.literal(true),
        rolloutMode: z.literal("enforce"),
        maxRetries: z.literal(0),
        providerCallsDispatched: z.literal(0),
      })
      .strict(),
    budget: z
      .object({
        budgetReference: identifierSchema,
        maxProviderCalls: z.number().int().nonnegative(),
        plannedProviderCalls: z.number().int().nonnegative(),
        maxCostUsd: z.number().finite().nonnegative(),
        perUnitCostCeilingUsd: z.number().finite().positive(),
      })
      .strict(),
    items: z.array(horrorCandidateGenerationPreflightItemSchema).min(2),
    status: z.literal("ready"),
    blockingReasons: z.array(z.never()).length(0),
    preflightHash: hashSchema,
  })
  .strict()
  .superRefine((preflight, context) => {
    const ids = preflight.items.map((item) => item.sampleUnitId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Candidate-generation sample unit IDs must be unique.",
      });
    }
    const plannedCalls = preflight.items.reduce(
      (sum, item) => sum + item.plannedProviderCalls,
      0
    );
    if (
      plannedCalls !== preflight.budget.plannedProviderCalls ||
      plannedCalls > preflight.budget.maxProviderCalls
    ) {
      context.addIssue({
        code: "custom",
        path: ["budget", "plannedProviderCalls"],
        message:
          "Candidate-generation planned calls must match the items and remain within budget.",
      });
    }
    if (
      preflight.items.reduce(
        (sum, item) => sum + item.costCeilingUsd,
        0
      ) > preflight.budget.maxCostUsd
    ) {
      context.addIssue({
        code: "custom",
        path: ["budget", "maxCostUsd"],
        message:
          "Candidate-generation per-unit cost ceilings exceed the aggregate budget.",
      });
    }
    const itemById = new Map(
      preflight.items.map((item) => [item.sampleUnitId, item])
    );
    for (const [index, item] of preflight.items.entries()) {
      if (item.format === "full" && item.dependsOnSampleUnitId !== null) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "dependsOnSampleUnitId"],
          message: "Full candidates may not depend on another sample unit.",
        });
      }
      if (item.format === "short") {
        const dependency = item.dependsOnSampleUnitId
          ? itemById.get(item.dependsOnSampleUnitId)
          : undefined;
        if (
          !dependency ||
          dependency.format !== "full" ||
          dependency.episodeSlug !== item.episodeSlug ||
          item.strategyInputPath !== dependency.strategyOutputPath
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "dependsOnSampleUnitId"],
            message:
              "Each Short candidate must consume the paired strategy Full output.",
          });
        }
      }
    }
    const { preflightHash: _preflightHash, ...body } = preflight;
    if (hashText(stableSerialize(body)) !== preflight.preflightHash) {
      context.addIssue({
        code: "custom",
        path: ["preflightHash"],
        message: "Candidate-generation preflight hash does not match.",
      });
    }
  });
export type HorrorCandidateGenerationPreflight = z.infer<
  typeof horrorCandidateGenerationPreflightSchema
>;

export interface HorrorCandidateGenerationInventoryEntry {
  readonly episodeSlug: string;
  readonly fullSampleUnitId: string;
  readonly shortSampleUnitId: string;
  readonly sourceArtifactPath: string;
  readonly canonicalFullArtifactPath: string;
  readonly baselineFullArtifactPath: string;
  readonly baselineShortArtifactPath: string;
}

function resolveWorkspaceArtifactPath(
  workspaceRoot: string,
  artifactPath: string
): { readonly absolute: string; readonly relative: string } {
  const absolute = ensureWorkspacePath(
    workspaceRoot,
    path.resolve(workspaceRoot, artifactPath)
  );
  return {
    absolute,
    relative: path.relative(workspaceRoot, absolute).split(path.sep).join("/"),
  };
}

export async function prepareHorrorCandidateGenerationPreflight(args: {
  readonly workspaceRoot: string;
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly preflightVersion: string;
  readonly createdAt: string;
  readonly createdBy: {
    readonly actorId: string;
    readonly containsPersonalSecrets: false;
  };
  readonly inventory: readonly HorrorCandidateGenerationInventoryEntry[];
}): Promise<HorrorCandidateGenerationPreflight> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  if (
    manifest.sample.status !== "resolved" ||
    manifest.costBudget.status !== "resolved"
  ) {
    throw new Error(
      "Candidate generation requires resolved sample and cost-budget decisions."
    );
  }
  if (path.basename(args.paths.evaluationDirectory) !== manifest.evaluationId) {
    throw new Error(
      "Candidate-generation preflight path does not match its evaluation ID."
    );
  }
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const expectedSamples = new Map(
    (["full", "short"] as const).flatMap((format) =>
      manifest.sample.status === "resolved"
        ? manifest.sample.value[format].map((sample) => [
            sample.sampleUnitId,
            { format, sample },
          ] as const)
        : []
    )
  );
  const suppliedIds = args.inventory.flatMap((entry) => [
    entry.fullSampleUnitId,
    entry.shortSampleUnitId,
  ]);
  if (
    suppliedIds.length !== expectedSamples.size ||
    new Set(suppliedIds).size !== suppliedIds.length ||
    suppliedIds.some((sampleUnitId) => !expectedSamples.has(sampleUnitId))
  ) {
    throw new Error(
      "Candidate-generation inventory must cover the exact preregistered sample."
    );
  }
  const plannedProviderCalls = expectedSamples.size;
  const budget = manifest.costBudget.value;
  if (
    budget.maxIncrementalProviderCalls < plannedProviderCalls ||
    budget.maxIncrementalCostUsd <= 0
  ) {
    throw new Error(
      "Candidate-generation inventory exceeds the preregistered call or cost budget."
    );
  }
  const perUnitCostCeilingUsd =
    budget.maxIncrementalCostUsd / plannedProviderCalls;
  const items: z.input<
    typeof horrorCandidateGenerationPreflightItemSchema
  >[] = [];
  for (const entry of args.inventory) {
    const episodeSlug = identifierSchema.parse(entry.episodeSlug);
    const fullExpected = expectedSamples.get(entry.fullSampleUnitId);
    const shortExpected = expectedSamples.get(entry.shortSampleUnitId);
    if (
      fullExpected?.format !== "full" ||
      shortExpected?.format !== "short" ||
      fullExpected.sample.locale !== shortExpected.sample.locale
    ) {
      throw new Error(
        `Candidate-generation inventory for "${episodeSlug}" does not match paired Full/Short samples.`
      );
    }
    const source = resolveWorkspaceArtifactPath(
      workspaceRoot,
      entry.sourceArtifactPath
    );
    const canonical = resolveWorkspaceArtifactPath(
      workspaceRoot,
      entry.canonicalFullArtifactPath
    );
    const baselineFull = resolveWorkspaceArtifactPath(
      workspaceRoot,
      entry.baselineFullArtifactPath
    );
    const baselineShort = resolveWorkspaceArtifactPath(
      workspaceRoot,
      entry.baselineShortArtifactPath
    );
    const [
      sourceText,
      canonicalText,
      baselineFullText,
      baselineShortText,
    ] = await Promise.all([
      fs.readFile(source.absolute, "utf8"),
      fs.readFile(canonical.absolute, "utf8"),
      fs.readFile(baselineFull.absolute, "utf8"),
      fs.readFile(baselineShort.absolute, "utf8"),
    ]);
    const canonicalArtifact = canonicalEvaluationLineageSchema.parse(
      JSON.parse(canonicalText) as unknown
    );
    if (
      canonicalArtifact.episodeSlug !== episodeSlug ||
      canonicalArtifact.locale !== fullExpected.sample.locale ||
      canonicalArtifact.lineage.cleanedSourceHash !== hashText(sourceText)
    ) {
      throw new Error(
        `Candidate-generation canonical lineage is not ready for "${episodeSlug}".`
      );
    }
    const fullOutput = path.posix.join(
      "strategy-candidates",
      episodeSlug,
      "full",
      "script-en.md"
    );
    const shortOutput = path.posix.join(
      "strategy-candidates",
      episodeSlug,
      "short",
      "script-en.md"
    );
    items.push(
      {
        sampleUnitId: entry.fullSampleUnitId,
        episodeSlug,
        format: "full",
        locale: fullExpected.sample.locale,
        service: "story-localization-full-rewrite",
        sourceArtifactPath: source.relative,
        sourceArtifactHash: canonicalArtifact.lineage.cleanedSourceHash,
        canonicalFullArtifactPath: canonical.relative,
        canonicalFullArtifactHash: hashText(canonicalText),
        baselineArtifactPath: baselineFull.relative,
        baselineArtifactHash: hashText(baselineFullText),
        strategyInputPath: source.relative,
        strategyOutputPath: fullOutput,
        dependsOnSampleUnitId: null,
        rolloutMode: "enforce",
        maxRetries: 0,
        plannedProviderCalls: 1,
        costCeilingUsd: perUnitCostCeilingUsd,
        status: "ready",
        blockingReasons: [],
      },
      {
        sampleUnitId: entry.shortSampleUnitId,
        episodeSlug,
        format: "short",
        locale: shortExpected.sample.locale,
        service: "story-localization-short-rewrite",
        sourceArtifactPath: source.relative,
        sourceArtifactHash: canonicalArtifact.lineage.cleanedSourceHash,
        canonicalFullArtifactPath: canonical.relative,
        canonicalFullArtifactHash: hashText(canonicalText),
        baselineArtifactPath: baselineShort.relative,
        baselineArtifactHash: hashText(baselineShortText),
        strategyInputPath: fullOutput,
        strategyOutputPath: shortOutput,
        dependsOnSampleUnitId: entry.fullSampleUnitId,
        rolloutMode: "enforce",
        maxRetries: 0,
        plannedProviderCalls: 1,
        costCeilingUsd: perUnitCostCeilingUsd,
        status: "ready",
        blockingReasons: [],
      }
    );
  }
  const body = {
    schemaVersion: HORROR_CANDIDATE_GENERATION_PREFLIGHT_SCHEMA_VERSION,
    preflightVersion: args.preflightVersion,
    evaluationId: manifest.evaluationId,
    manifestHash: manifest.manifestHash,
    createdAt: args.createdAt,
    createdBy: args.createdBy,
    execution: {
      preflightOnly: true as const,
      dryRun: true as const,
      rolloutMode: "enforce" as const,
      maxRetries: 0 as const,
      providerCallsDispatched: 0 as const,
    },
    budget: {
      budgetReference: budget.budgetReference,
      maxProviderCalls: budget.maxIncrementalProviderCalls,
      plannedProviderCalls,
      maxCostUsd: budget.maxIncrementalCostUsd,
      perUnitCostCeilingUsd,
    },
    items,
    status: "ready" as const,
    blockingReasons: [],
  };
  return horrorCandidateGenerationPreflightSchema.parse({
    ...body,
    preflightHash: hashText(stableSerialize(body)),
  });
}

export async function persistHorrorCandidateGenerationPreflight(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly preflight: HorrorCandidateGenerationPreflight;
}): Promise<{ readonly persisted: boolean; readonly reused: boolean }> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const preflight = horrorCandidateGenerationPreflightSchema.parse(
    args.preflight
  );
  if (
    preflight.evaluationId !== manifest.evaluationId ||
    preflight.manifestHash !== manifest.manifestHash
  ) {
    throw new Error(
      "Candidate-generation preflight does not match the evaluation manifest."
    );
  }
  await assertPersistedManifest(args.paths, manifest);
  const existing = await readJsonIfPresent(
    args.paths.candidateGenerationPreflightPath
  );
  if (existing !== undefined) {
    const persisted =
      horrorCandidateGenerationPreflightSchema.parse(existing);
    if (persisted.preflightHash !== preflight.preflightHash) {
      throw new Error(
        "A persisted candidate-generation preflight is immutable."
      );
    }
    return { persisted: false, reused: true };
  }
  await writeTextAtomic(
    args.paths.candidateGenerationPreflightPath,
    `${stableSerialize(preflight)}\n`
  );
  return { persisted: true, reused: false };
}

const candidateExecutionItemIdentityShape = {
  sampleUnitId: identifierSchema,
  episodeSlug: identifierSchema,
  format: horrorEvaluationFormatSchema,
  service: candidateGenerationServiceSchema,
  strategyInputPath: workspaceRelativePathSchema,
  strategyOutputPath: workspaceRelativePathSchema,
  dependsOnSampleUnitId: identifierSchema.nullable(),
  strategyVersion: identifierSchema,
  costCeilingUsd: z.number().finite().positive().max(1),
  requestFingerprint: hashSchema,
  idempotencyKey: z
    .string()
    .regex(/^horror-candidate-[a-f0-9]{64}$/u),
};

const plannedExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("planned"),
    attemptCount: z.literal(0),
    reservedCostUsd: z.literal(0),
    chargedCostUsd: z.literal(0),
  })
  .strict();
const reservedExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("reserved"),
    attemptCount: z.literal(1),
    reservedCostUsd: z.number().finite().positive().max(1),
    chargedCostUsd: z.literal(0),
    reservedAt: timestampSchema,
  })
  .strict();
const completedExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("completed"),
    attemptCount: z.literal(1),
    reservedCostUsd: z.number().finite().positive().max(1),
    chargedCostUsd: z.number().finite().nonnegative().max(1),
    reservedAt: timestampSchema,
    completedAt: timestampSchema,
    result: z
      .object({
        candidateHash: hashSchema,
        acceptedFinalLine: nonEmptyTextSchema,
        acceptedFinalLineHash: hashSchema,
      })
      .strict(),
  })
  .strict();
const failedExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("failed"),
    attemptCount: z.literal(1),
    reservedCostUsd: z.number().finite().positive().max(1),
    chargedCostUsd: z.number().finite().nonnegative().max(1),
    reservedAt: timestampSchema,
    failedAt: timestampSchema,
    failureCode: identifierSchema,
  })
  .strict();
const uncertainExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("uncertain"),
    attemptCount: z.literal(1),
    reservedCostUsd: z.number().finite().positive().max(1),
    chargedCostUsd: z.literal(0),
    reservedAt: timestampSchema,
    uncertainAt: timestampSchema,
    uncertaintyReason: z.literal("provider-call-outcome-unknown"),
  })
  .strict();
const blockedExecutionItemSchema = z
  .object({
    ...candidateExecutionItemIdentityShape,
    state: z.literal("blocked"),
    attemptCount: z.literal(0),
    reservedCostUsd: z.literal(0),
    chargedCostUsd: z.literal(0),
    blockedAt: timestampSchema,
    blockedBySampleUnitId: identifierSchema,
    blockingReason: z.literal("dependency-not-completed"),
  })
  .strict();

const horrorCandidateExecutionLedgerItemSchema = z.discriminatedUnion("state", [
  plannedExecutionItemSchema,
  reservedExecutionItemSchema,
  completedExecutionItemSchema,
  failedExecutionItemSchema,
  uncertainExecutionItemSchema,
  blockedExecutionItemSchema,
]);

type HorrorCandidateExecutionLedgerItem = z.infer<
  typeof horrorCandidateExecutionLedgerItemSchema
>;

function executionLedgerBindingProjection(value: {
  readonly schemaVersion: string;
  readonly ledgerVersion: string;
  readonly evaluationId: string;
  readonly manifestHash: string;
  readonly preflightHash: string;
  readonly preflightVersion: string;
  readonly strategyVersions: {
    readonly baseline: string;
    readonly strategy: string;
  };
  readonly budget: {
    readonly budgetReference: string;
    readonly maxProviderCalls: number;
    readonly maxCostUsd: number;
    readonly perUnitCostCeilingUsd: number;
  };
  readonly items: readonly HorrorCandidateExecutionLedgerItem[];
}): unknown {
  return {
    schemaVersion: value.schemaVersion,
    ledgerVersion: value.ledgerVersion,
    evaluationId: value.evaluationId,
    manifestHash: value.manifestHash,
    preflightHash: value.preflightHash,
    preflightVersion: value.preflightVersion,
    strategyVersions: value.strategyVersions,
    budget: value.budget,
    items: value.items.map((item) => ({
      sampleUnitId: item.sampleUnitId,
      episodeSlug: item.episodeSlug,
      format: item.format,
      service: item.service,
      strategyInputPath: item.strategyInputPath,
      strategyOutputPath: item.strategyOutputPath,
      dependsOnSampleUnitId: item.dependsOnSampleUnitId,
      strategyVersion: item.strategyVersion,
      costCeilingUsd: item.costCeilingUsd,
      requestFingerprint: item.requestFingerprint,
      idempotencyKey: item.idempotencyKey,
    })),
  };
}

function executionLedgerAccounting(
  items: readonly HorrorCandidateExecutionLedgerItem[]
): {
  readonly providerCallsReserved: number;
  readonly reservedCostUsd: number;
  readonly chargedCostUsd: number;
} {
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    providerCallsReserved: items.reduce(
      (sum, item) => sum + item.attemptCount,
      0
    ),
    reservedCostUsd: round(
      items.reduce((sum, item) => sum + item.reservedCostUsd, 0)
    ),
    chargedCostUsd: round(
      items.reduce((sum, item) => sum + item.chargedCostUsd, 0)
    ),
  };
}

export const horrorCandidateExecutionLedgerSchema = z
  .object({
    schemaVersion: z.literal(
      HORROR_CANDIDATE_EXECUTION_LEDGER_SCHEMA_VERSION
    ),
    ledgerVersion: identifierSchema,
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    preflightHash: hashSchema,
    preflightVersion: identifierSchema,
    strategyVersions: z
      .object({
        baseline: identifierSchema,
        strategy: identifierSchema,
      })
      .strict(),
    budget: z
      .object({
        budgetReference: identifierSchema,
        maxProviderCalls: z.number().int().nonnegative().max(8),
        maxCostUsd: z.number().finite().nonnegative().max(8),
        perUnitCostCeilingUsd: z.number().finite().positive().max(1),
      })
      .strict(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    items: z.array(horrorCandidateExecutionLedgerItemSchema).min(2).max(8),
    accounting: z
      .object({
        providerCallsReserved: z.number().int().nonnegative().max(8),
        reservedCostUsd: z.number().finite().nonnegative().max(8),
        chargedCostUsd: z.number().finite().nonnegative().max(8),
      })
      .strict(),
    bindingHash: hashSchema,
    ledgerHash: hashSchema,
  })
  .strict()
  .superRefine((ledger, context) => {
    const ids = ledger.items.map((item) => item.sampleUnitId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Execution-ledger sample unit IDs must be unique.",
      });
    }
    const expectedAccounting = executionLedgerAccounting(ledger.items);
    if (stableSerialize(expectedAccounting) !== stableSerialize(ledger.accounting)) {
      context.addIssue({
        code: "custom",
        path: ["accounting"],
        message: "Execution-ledger accounting does not match its units.",
      });
    }
    if (
      ledger.accounting.providerCallsReserved > ledger.budget.maxProviderCalls ||
      ledger.accounting.reservedCostUsd > ledger.budget.maxCostUsd ||
      ledger.accounting.chargedCostUsd > ledger.budget.maxCostUsd
    ) {
      context.addIssue({
        code: "custom",
        path: ["accounting"],
        message: "Execution-ledger accounting exceeds its budget.",
      });
    }
    const itemById = new Map(
      ledger.items.map((item, index) => [item.sampleUnitId, { item, index }])
    );
    for (const [index, item] of ledger.items.entries()) {
      if (
        item.reservedCostUsd > item.costCeilingUsd ||
        item.chargedCostUsd > item.costCeilingUsd
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Execution-ledger unit accounting exceeds its ceiling.",
        });
      }
      if (item.format === "full" && item.dependsOnSampleUnitId !== null) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "dependsOnSampleUnitId"],
          message: "Execution-ledger Full units cannot have dependencies.",
        });
      }
      if (item.format === "short") {
        const dependency = item.dependsOnSampleUnitId
          ? itemById.get(item.dependsOnSampleUnitId)
          : undefined;
        if (
          !dependency ||
          dependency.index >= index ||
          dependency.item.format !== "full" ||
          dependency.item.episodeSlug !== item.episodeSlug
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "dependsOnSampleUnitId"],
            message:
              "Execution-ledger Short units require an earlier paired Full.",
          });
        } else if (
          ["reserved", "completed", "failed", "uncertain"].includes(
            item.state
          ) &&
          dependency.item.state !== "completed"
        ) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "state"],
            message:
              "Execution-ledger Short dispatch requires a completed paired Full.",
          });
        }
      }
      if (
        item.state === "completed" &&
        item.result.acceptedFinalLineHash !==
          hashText(item.result.acceptedFinalLine)
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "result", "acceptedFinalLineHash"],
          message: "Accepted final-line hash does not match its evidence.",
        });
      }
    }
    if (
      hashText(stableSerialize(executionLedgerBindingProjection(ledger))) !==
      ledger.bindingHash
    ) {
      context.addIssue({
        code: "custom",
        path: ["bindingHash"],
        message: "Execution-ledger binding hash does not match.",
      });
    }
    const { ledgerHash: _ledgerHash, ...body } = ledger;
    if (hashText(stableSerialize(body)) !== ledger.ledgerHash) {
      context.addIssue({
        code: "custom",
        path: ["ledgerHash"],
        message: "Execution-ledger hash does not match.",
      });
    }
  });
export type HorrorCandidateExecutionLedger = z.infer<
  typeof horrorCandidateExecutionLedgerSchema
>;

export interface MockHorrorCandidateExecutionRequest {
  readonly evaluationId: string;
  readonly manifestHash: string;
  readonly preflightHash: string;
  readonly sampleUnitId: string;
  readonly episodeSlug: string;
  readonly format: HorrorEvaluationFormat;
  readonly service: z.infer<typeof candidateGenerationServiceSchema>;
  readonly strategyVersion: string;
  readonly strategyInputPath: string;
  readonly strategyOutputPath: string;
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly maxRetries: 0;
  readonly costCeilingUsd: number;
}

export type MockHorrorCandidateExecutionResult =
  | {
      readonly status: "completed";
      readonly candidateText: string;
      readonly acceptedFinalLine: string;
      readonly chargedCostUsd: number;
    }
  | {
      readonly status: "failed";
      readonly failureCode: string;
      readonly chargedCostUsd: number;
    };

export interface MockHorrorCandidateExecutionAdapter {
  readonly kind: "mock";
  generate(
    request: MockHorrorCandidateExecutionRequest
  ): Promise<MockHorrorCandidateExecutionResult>;
}

export type HorrorCandidateExecutionLedgerWriter = (
  ledgerPath: string,
  ledger: HorrorCandidateExecutionLedger
) => Promise<void>;

const defaultExecutionLedgerWriter: HorrorCandidateExecutionLedgerWriter =
  async (ledgerPath, ledger) => {
    await writeTextAtomic(ledgerPath, `${stableSerialize(ledger)}\n`);
  };

function timestampFromClock(clock: () => string): string {
  return timestampSchema.parse(clock());
}

function requestFingerprintForItem(args: {
  readonly manifest: HorrorEvaluationManifest;
  readonly preflight: HorrorCandidateGenerationPreflight;
  readonly item: HorrorCandidateGenerationPreflight["items"][number];
}): string {
  return hashText(
    stableSerialize({
      schemaVersion: HORROR_CANDIDATE_EXECUTION_LEDGER_SCHEMA_VERSION,
      evaluationId: args.manifest.evaluationId,
      manifestHash: args.manifest.manifestHash,
      preflightVersion: args.preflight.preflightVersion,
      preflightHash: args.preflight.preflightHash,
      strategyVersions: args.manifest.strategyVersions,
      item: args.item,
    })
  );
}

function buildExecutionLedger(
  body: Omit<HorrorCandidateExecutionLedger, "ledgerHash">
): HorrorCandidateExecutionLedger {
  return horrorCandidateExecutionLedgerSchema.parse({
    ...body,
    ledgerHash: hashText(stableSerialize(body)),
  });
}

function updateExecutionLedger(args: {
  readonly ledger: HorrorCandidateExecutionLedger;
  readonly items: readonly HorrorCandidateExecutionLedgerItem[];
  readonly updatedAt: string;
}): HorrorCandidateExecutionLedger {
  const { ledgerHash: _ledgerHash, ...previous } = args.ledger;
  return buildExecutionLedger({
    ...previous,
    updatedAt: args.updatedAt,
    items: [...args.items],
    accounting: executionLedgerAccounting(args.items),
  });
}

async function assertPersistedPreflight(
  paths: HorrorEvaluationArtifactPaths,
  expected: HorrorCandidateGenerationPreflight
): Promise<void> {
  const raw = await readJsonIfPresent(paths.candidateGenerationPreflightPath);
  if (raw === undefined) {
    throw new Error(
      "The candidate-generation preflight must be persisted before ledger initialization."
    );
  }
  const persisted = horrorCandidateGenerationPreflightSchema.parse(raw);
  if (persisted.preflightHash !== expected.preflightHash) {
    throw new Error(
      "Execution-ledger input does not match the persisted preflight."
    );
  }
}

function assertExecutionInputs(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly preflight: HorrorCandidateGenerationPreflight;
}): void {
  const { manifest, preflight } = args;
  if (
    preflight.evaluationId !== manifest.evaluationId ||
    preflight.manifestHash !== manifest.manifestHash ||
    path.basename(args.paths.evaluationDirectory) !== manifest.evaluationId
  ) {
    throw new Error(
      "Execution-ledger inputs do not match the evaluation identity."
    );
  }
  if (
    manifest.sample.status !== "resolved" ||
    manifest.costBudget.status !== "resolved"
  ) {
    throw new Error(
      "Execution-ledger initialization requires resolved sample and budget decisions."
    );
  }
  const expectedSamples = [
    ...manifest.sample.value.full.map((sample) => ({
      ...sample,
      format: "full" as const,
    })),
    ...manifest.sample.value.short.map((sample) => ({
      ...sample,
      format: "short" as const,
    })),
  ];
  const expectedById = new Map(
    expectedSamples.map((sample) => [sample.sampleUnitId, sample])
  );
  if (
    preflight.items.length !== expectedSamples.length ||
    preflight.items.some((item) => {
      const expected = expectedById.get(item.sampleUnitId);
      return (
        !expected ||
        expected.format !== item.format ||
        expected.locale !== item.locale
      );
    })
  ) {
    throw new Error(
      "Execution-ledger preflight must cover the exact evaluation sample."
    );
  }
  const budget = manifest.costBudget.value;
  if (
    preflight.budget.budgetReference !== budget.budgetReference ||
    preflight.budget.maxProviderCalls !==
      budget.maxIncrementalProviderCalls ||
    preflight.budget.maxCostUsd !== budget.maxIncrementalCostUsd ||
    preflight.budget.maxProviderCalls > 8 ||
    preflight.budget.maxCostUsd > 8 ||
    preflight.budget.perUnitCostCeilingUsd > 1 ||
    preflight.items.some(
      (item) =>
        item.costCeilingUsd > 1 ||
        item.plannedProviderCalls !== 1 ||
        item.maxRetries !== 0
    )
  ) {
    throw new Error(
      "Execution-ledger preflight exceeds or changes the approved call/cost budget."
    );
  }
}

export async function initializeHorrorCandidateExecutionLedger(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly preflight: HorrorCandidateGenerationPreflight;
  readonly ledgerVersion: string;
  readonly clock: () => string;
  readonly writeLedgerAtomic?: HorrorCandidateExecutionLedgerWriter;
}): Promise<{
  readonly ledger: HorrorCandidateExecutionLedger;
  readonly persisted: boolean;
  readonly reused: boolean;
}> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const preflight = horrorCandidateGenerationPreflightSchema.parse(
    args.preflight
  );
  assertExecutionInputs({ paths: args.paths, manifest, preflight });
  await assertPersistedManifest(args.paths, manifest);
  await assertPersistedPreflight(args.paths, preflight);
  const createdAt = timestampFromClock(args.clock);
  const items: HorrorCandidateExecutionLedgerItem[] = preflight.items.map(
    (item) => {
      const requestFingerprint = requestFingerprintForItem({
        manifest,
        preflight,
        item,
      });
      return {
        sampleUnitId: item.sampleUnitId,
        episodeSlug: item.episodeSlug,
        format: item.format,
        service: item.service,
        strategyInputPath: item.strategyInputPath,
        strategyOutputPath: item.strategyOutputPath,
        dependsOnSampleUnitId: item.dependsOnSampleUnitId,
        strategyVersion: manifest.strategyVersions.strategy,
        costCeilingUsd: item.costCeilingUsd,
        requestFingerprint,
        idempotencyKey: `horror-candidate-${requestFingerprint}`,
        state: "planned",
        attemptCount: 0,
        reservedCostUsd: 0,
        chargedCostUsd: 0,
      };
    }
  );
  const identity = {
    schemaVersion:
      HORROR_CANDIDATE_EXECUTION_LEDGER_SCHEMA_VERSION as typeof HORROR_CANDIDATE_EXECUTION_LEDGER_SCHEMA_VERSION,
    ledgerVersion: identifierSchema.parse(args.ledgerVersion),
    evaluationId: manifest.evaluationId,
    manifestHash: manifest.manifestHash,
    preflightHash: preflight.preflightHash,
    preflightVersion: preflight.preflightVersion,
    strategyVersions: manifest.strategyVersions,
    budget: {
      budgetReference: preflight.budget.budgetReference,
      maxProviderCalls: preflight.budget.maxProviderCalls,
      maxCostUsd: preflight.budget.maxCostUsd,
      perUnitCostCeilingUsd: preflight.budget.perUnitCostCeilingUsd,
    },
    items,
  };
  const bindingHash = hashText(
    stableSerialize(executionLedgerBindingProjection(identity))
  );
  const existing = await readJsonIfPresent(
    args.paths.candidateExecutionLedgerPath
  );
  if (existing !== undefined) {
    const ledger = horrorCandidateExecutionLedgerSchema.parse(existing);
    if (ledger.bindingHash !== bindingHash) {
      throw new Error(
        "A persisted execution ledger rejects changed, stale, partial, reordered, or extra inputs."
      );
    }
    return { ledger, persisted: false, reused: true };
  }
  const ledger = buildExecutionLedger({
    ...identity,
    createdAt,
    updatedAt: createdAt,
    accounting: executionLedgerAccounting(items),
    bindingHash,
  });
  await (args.writeLedgerAtomic ?? defaultExecutionLedgerWriter)(
    args.paths.candidateExecutionLedgerPath,
    ledger
  );
  return { ledger, persisted: true, reused: false };
}

const mockExecutionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      candidateText: z.string().trim().min(1).max(200_000),
      acceptedFinalLine: nonEmptyTextSchema,
      chargedCostUsd: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failureCode: identifierSchema,
      chargedCostUsd: z.number().finite().nonnegative(),
    })
    .strict(),
]);

function blockFailedDependencies(
  items: readonly HorrorCandidateExecutionLedgerItem[],
  blockedAt: string
): HorrorCandidateExecutionLedgerItem[] {
  const byId = new Map(items.map((item) => [item.sampleUnitId, item]));
  return items.map((item) => {
    if (item.state !== "planned" || item.dependsOnSampleUnitId === null) {
      return item;
    }
    const dependency = byId.get(item.dependsOnSampleUnitId);
    if (
      dependency &&
      ["failed", "blocked", "uncertain"].includes(dependency.state)
    ) {
      return {
        ...item,
        state: "blocked",
        blockedAt,
        blockedBySampleUnitId: dependency.sampleUnitId,
        blockingReason: "dependency-not-completed",
      };
    }
    return item;
  });
}

export async function executeNextHorrorCandidateWithMockAdapter(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly preflight: HorrorCandidateGenerationPreflight;
  readonly ledgerVersion: string;
  readonly clock: () => string;
  readonly adapter: MockHorrorCandidateExecutionAdapter;
  readonly writeLedgerAtomic?: HorrorCandidateExecutionLedgerWriter;
}): Promise<{
  readonly status: "completed" | "failed" | "uncertain" | "idle";
  readonly sampleUnitId: string | null;
  readonly providerInvoked: boolean;
  readonly ledger: HorrorCandidateExecutionLedger;
}> {
  if (args.adapter.kind !== "mock") {
    throw new Error(
      "Candidate execution remains mock-only until paid dispatch is explicitly authorized."
    );
  }
  const writer = args.writeLedgerAtomic ?? defaultExecutionLedgerWriter;
  let { ledger } = await initializeHorrorCandidateExecutionLedger(args);
  const resumedAt = timestampFromClock(args.clock);
  let resumedItems: HorrorCandidateExecutionLedgerItem[] = ledger.items.map(
    (item) =>
      item.state === "reserved"
        ? {
            ...item,
            state: "uncertain" as const,
            uncertainAt: resumedAt,
            uncertaintyReason: "provider-call-outcome-unknown" as const,
          }
        : item
  );
  resumedItems = blockFailedDependencies(resumedItems, resumedAt);
  if (stableSerialize(resumedItems) !== stableSerialize(ledger.items)) {
    ledger = updateExecutionLedger({
      ledger,
      items: resumedItems,
      updatedAt: resumedAt,
    });
    await writer(args.paths.candidateExecutionLedgerPath, ledger);
  }
  const byId = new Map(
    ledger.items.map((item) => [item.sampleUnitId, item])
  );
  const nextIndex = ledger.items.findIndex((item) => {
    if (item.state !== "planned") {
      return false;
    }
    return (
      item.dependsOnSampleUnitId === null ||
      byId.get(item.dependsOnSampleUnitId)?.state === "completed"
    );
  });
  if (nextIndex < 0) {
    return {
      status: "idle",
      sampleUnitId: null,
      providerInvoked: false,
      ledger,
    };
  }
  const next = ledger.items[nextIndex];
  if (!next || next.state !== "planned") {
    throw new Error("Execution-ledger selected an illegal state transition.");
  }
  if (
    ledger.accounting.providerCallsReserved + 1 >
      ledger.budget.maxProviderCalls ||
    ledger.accounting.reservedCostUsd + next.costCeilingUsd >
      ledger.budget.maxCostUsd
  ) {
    throw new Error("Execution-ledger reservation would exceed its budget.");
  }
  const reservedAt = timestampFromClock(args.clock);
  const reserved: HorrorCandidateExecutionLedgerItem = {
    ...next,
    state: "reserved",
    attemptCount: 1,
    reservedCostUsd: next.costCeilingUsd,
    chargedCostUsd: 0,
    reservedAt,
  };
  const reservedItems = [...ledger.items];
  reservedItems[nextIndex] = reserved;
  ledger = updateExecutionLedger({
    ledger,
    items: reservedItems,
    updatedAt: reservedAt,
  });
  await writer(args.paths.candidateExecutionLedgerPath, ledger);
  const request: MockHorrorCandidateExecutionRequest = {
    evaluationId: ledger.evaluationId,
    manifestHash: ledger.manifestHash,
    preflightHash: ledger.preflightHash,
    sampleUnitId: reserved.sampleUnitId,
    episodeSlug: reserved.episodeSlug,
    format: reserved.format,
    service: reserved.service,
    strategyVersion: reserved.strategyVersion,
    strategyInputPath: reserved.strategyInputPath,
    strategyOutputPath: reserved.strategyOutputPath,
    requestFingerprint: reserved.requestFingerprint,
    idempotencyKey: reserved.idempotencyKey,
    maxRetries: 0,
    costCeilingUsd: reserved.costCeilingUsd,
  };
  let result: z.infer<typeof mockExecutionResultSchema>;
  try {
    result = mockExecutionResultSchema.parse(
      await args.adapter.generate(request)
    );
    if (result.chargedCostUsd > reserved.costCeilingUsd) {
      throw new Error("Mock adapter result exceeds the reserved unit cost.");
    }
  } catch {
    const uncertainAt = timestampFromClock(args.clock);
    const uncertain: HorrorCandidateExecutionLedgerItem = {
      ...reserved,
      state: "uncertain",
      uncertainAt,
      uncertaintyReason: "provider-call-outcome-unknown",
    };
    const uncertainItems = [...ledger.items];
    uncertainItems[nextIndex] = uncertain;
    uncertainItems.splice(
      0,
      uncertainItems.length,
      ...blockFailedDependencies(uncertainItems, uncertainAt)
    );
    ledger = updateExecutionLedger({
      ledger,
      items: uncertainItems,
      updatedAt: uncertainAt,
    });
    await writer(args.paths.candidateExecutionLedgerPath, ledger);
    return {
      status: "uncertain",
      sampleUnitId: reserved.sampleUnitId,
      providerInvoked: true,
      ledger,
    };
  }
  const finishedAt = timestampFromClock(args.clock);
  let finished: HorrorCandidateExecutionLedgerItem;
  if (result.status === "failed") {
    finished = {
      ...reserved,
      state: "failed",
      chargedCostUsd: result.chargedCostUsd,
      failedAt: finishedAt,
      failureCode: result.failureCode,
    };
  } else {
    const candidateText = result.candidateText.trim();
    const acceptedFinalLine = result.acceptedFinalLine.trim();
    if (!candidateText.endsWith(acceptedFinalLine)) {
      const uncertain: HorrorCandidateExecutionLedgerItem = {
        ...reserved,
        state: "uncertain",
        uncertainAt: finishedAt,
        uncertaintyReason: "provider-call-outcome-unknown",
      };
      const uncertainItems = [...ledger.items];
      uncertainItems[nextIndex] = uncertain;
      ledger = updateExecutionLedger({
        ledger,
        items: blockFailedDependencies(uncertainItems, finishedAt),
        updatedAt: finishedAt,
      });
      await writer(args.paths.candidateExecutionLedgerPath, ledger);
      return {
        status: "uncertain",
        sampleUnitId: reserved.sampleUnitId,
        providerInvoked: true,
        ledger,
      };
    }
    finished = {
      ...reserved,
      state: "completed",
      chargedCostUsd: result.chargedCostUsd,
      completedAt: finishedAt,
      result: {
        candidateHash: hashText(candidateText),
        acceptedFinalLine,
        acceptedFinalLineHash: hashText(acceptedFinalLine),
      },
    };
  }
  const finishedItems = [...ledger.items];
  finishedItems[nextIndex] = finished;
  ledger = updateExecutionLedger({
    ledger,
    items: blockFailedDependencies(finishedItems, finishedAt),
    updatedAt: finishedAt,
  });
  await writer(args.paths.candidateExecutionLedgerPath, ledger);
  return {
    status: result.status,
    sampleUnitId: reserved.sampleUnitId,
    providerInvoked: true,
    ledger,
  };
}

const productionCandidateTextSchema = z.string().trim().min(1).max(200_000);
const productionEditorialCandidateSchema = z
  .object({
    text: productionCandidateTextSchema,
    artifactHash: hashSchema,
    strategyVersion: identifierSchema,
  })
  .strict();

export const horrorProductionEditorialCandidateSetSchema = z
  .object({
    schemaVersion: z.literal(
      HORROR_PRODUCTION_EDITORIAL_CANDIDATE_SET_SCHEMA_VERSION
    ),
    candidateSetVersion: identifierSchema,
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    createdAt: timestampSchema,
    createdBy: z
      .object({
        actorId: identifierSchema,
        containsPersonalSecrets: z.literal(false),
      })
      .strict(),
    cases: z
      .array(
        z
          .object({
            sampleUnitId: identifierSchema,
            title: nonEmptyTextSchema,
            sourceArtifactHash: hashSchema,
            acceptedFinalLine: nonEmptyTextSchema,
            strata: horrorEditorialStrataSchema,
            candidates: z
              .object({
                baseline: productionEditorialCandidateSchema,
                strategy: productionEditorialCandidateSchema,
              })
              .strict(),
          })
          .strict()
      )
      .min(2),
    candidateSetHash: hashSchema,
  })
  .strict()
  .superRefine((candidateSet, context) => {
    const ids = candidateSet.cases.map((entry) => entry.sampleUnitId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["cases"],
        message: "Production editorial sample unit IDs must be unique.",
      });
    }
    for (const [caseIndex, entry] of candidateSet.cases.entries()) {
      const finalLine = entry.acceptedFinalLine.trim();
      for (const candidateName of ["baseline", "strategy"] as const) {
        const candidate = entry.candidates[candidateName];
        if (hashText(candidate.text) !== candidate.artifactHash) {
          context.addIssue({
            code: "custom",
            path: [
              "cases",
              caseIndex,
              "candidates",
              candidateName,
              "artifactHash",
            ],
            message: "Production editorial candidate hash does not match text.",
          });
        }
        if (!candidate.text.trim().endsWith(finalLine)) {
          context.addIssue({
            code: "custom",
            path: ["cases", caseIndex, "candidates", candidateName, "text"],
            message:
              "Production editorial candidate must preserve the accepted final line.",
          });
        }
      }
    }
    const { candidateSetHash: _candidateSetHash, ...body } = candidateSet;
    if (hashText(stableSerialize(body)) !== candidateSet.candidateSetHash) {
      context.addIssue({
        code: "custom",
        path: ["candidateSetHash"],
        message: "Production editorial candidate-set hash does not match.",
      });
    }
  });
export type HorrorProductionEditorialCandidateSet = z.infer<
  typeof horrorProductionEditorialCandidateSetSchema
>;

export interface HorrorProductionEditorialCandidateInput {
  readonly sampleUnitId: string;
  readonly title: string;
  readonly sourceArtifactHash: string;
  readonly acceptedFinalLine: string;
  readonly strata: HorrorEditorialStrata;
  readonly candidates: {
    readonly baseline: {
      readonly text: string;
      readonly strategyVersion: string;
    };
    readonly strategy: {
      readonly text: string;
      readonly strategyVersion: string;
    };
  };
}

export function buildHorrorProductionEditorialCandidateSet(input: {
  readonly candidateSetVersion: string;
  readonly evaluationId: string;
  readonly manifestHash: string;
  readonly createdAt: string;
  readonly createdBy: {
    readonly actorId: string;
    readonly containsPersonalSecrets: false;
  };
  readonly cases: readonly HorrorProductionEditorialCandidateInput[];
}): HorrorProductionEditorialCandidateSet {
  const body = {
    schemaVersion:
      HORROR_PRODUCTION_EDITORIAL_CANDIDATE_SET_SCHEMA_VERSION,
    candidateSetVersion: input.candidateSetVersion,
    evaluationId: input.evaluationId,
    manifestHash: input.manifestHash,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    cases: input.cases.map((entry) => ({
      ...entry,
      candidates: {
        baseline: {
          ...entry.candidates.baseline,
          artifactHash: hashText(entry.candidates.baseline.text),
        },
        strategy: {
          ...entry.candidates.strategy,
          artifactHash: hashText(entry.candidates.strategy.text),
        },
      },
    })),
  };
  return horrorProductionEditorialCandidateSetSchema.parse({
    ...body,
    candidateSetHash: hashText(stableSerialize(body)),
  });
}

export type SeparatedBlindHorrorEditorialReviews = Readonly<
  Record<
    HorrorEvaluationFormat,
    {
      readonly reviewPacket: HorrorBlindReviewPacket;
      readonly answerKey: HorrorBlindReviewAnswerKey;
    }
  >
>;

function separateBlindHorrorEditorialReviews(args: {
  readonly prepared: {
    readonly reviewPacket: HorrorBlindReviewPacket;
    readonly answerKey: HorrorBlindReviewAnswerKey;
  };
  readonly caseFormat: ReadonlyMap<string, HorrorEvaluationFormat>;
  readonly seed: string;
}): SeparatedBlindHorrorEditorialReviews {
  const sourcePacket = horrorBlindReviewPacketSchema.parse(
    args.prepared.reviewPacket
  );
  const sourceAnswerKey = horrorBlindReviewAnswerKeySchema.parse(
    args.prepared.answerKey
  );
  const assignmentByItem = new Map(
    sourceAnswerKey.assignments.map((entry) => [entry.reviewItemId, entry])
  );
  const buildTrack = (format: HorrorEvaluationFormat) => {
    const items = sourcePacket.items.filter((item) => {
      const assignment = assignmentByItem.get(item.reviewItemId);
      return assignment
        ? args.caseFormat.get(assignment.corpusCaseId) === format
        : false;
    });
    if (items.length === 0) {
      throw new Error(`Blind review track "${format}" has no items.`);
    }
    const packetId = `packet-${hashText(
      stableSerialize({
        sourcePacketHash: sourcePacket.packetHash,
        format,
        seed: args.seed,
        schemaVersion: HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION,
      })
    ).slice(0, 16)}`;
    const packetBody = {
      schemaVersion: HORROR_BLIND_REVIEW_PACKET_SCHEMA_VERSION,
      rubricVersion: HORROR_EDITORIAL_RUBRIC_VERSION,
      corpusVersion: sourcePacket.corpusVersion,
      packetId,
      items,
    };
    const reviewPacket = horrorBlindReviewPacketSchema.parse({
      ...packetBody,
      packetHash: hashText(stableSerialize(packetBody)),
    });
    const answerKey = horrorBlindReviewAnswerKeySchema.parse({
      packetId,
      seed: args.seed,
      assignments: sourceAnswerKey.assignments.filter((assignment) =>
        items.some((item) => item.reviewItemId === assignment.reviewItemId)
      ),
    });
    return { reviewPacket, answerKey };
  };
  return {
    full: buildTrack("full"),
    short: buildTrack("short"),
  };
}

export function prepareSeparatedBlindHorrorEditorialReviews(input: {
  readonly corpus: unknown;
  readonly seed: string;
}): SeparatedBlindHorrorEditorialReviews {
  const corpus = horrorCalibrationCorpusSchema.parse(input.corpus);
  const prepared = prepareBlindHorrorEditorialReview({
    corpus,
    seed: input.seed,
  });
  return separateBlindHorrorEditorialReviews({
    prepared,
    caseFormat: new Map(
      corpus.cases.map((entry) => [entry.id, entry.strata.format])
    ),
    seed: input.seed,
  });
}

function assertHorrorProductionEditorialCandidateSetMatchesManifest(input: {
  readonly manifest: HorrorEvaluationManifest;
  readonly candidateSet: unknown;
}): {
  readonly manifest: HorrorEvaluationManifest;
  readonly candidateSet: HorrorProductionEditorialCandidateSet;
} {
  const manifest = horrorEvaluationManifestSchema.parse(input.manifest);
  const candidateSet = horrorProductionEditorialCandidateSetSchema.parse(
    input.candidateSet
  );
  if (
    candidateSet.evaluationId !== manifest.evaluationId ||
    candidateSet.manifestHash !== manifest.manifestHash
  ) {
    throw new Error(
      "Production editorial candidates do not match the evaluation manifest."
    );
  }
  if (manifest.sample.status !== "resolved") {
    throw new Error("The production evaluation sample is unresolved.");
  }
  const expectedSamples = new Map(
    (["full", "short"] as const).flatMap((format) =>
      manifest.sample.status === "resolved"
        ? manifest.sample.value[format].map(
            (sample) => [
              sample.sampleUnitId,
              { format, sample },
            ] as const
          )
        : []
    )
  );
  const candidateIds = new Set(
    candidateSet.cases.map((entry) => entry.sampleUnitId)
  );
  if (
    candidateSet.cases.length !== expectedSamples.size ||
    [...expectedSamples.keys()].some((sampleUnitId) => !candidateIds.has(sampleUnitId))
  ) {
    throw new Error(
      "Production editorial candidates must cover the exact preregistered sample."
    );
  }
  for (const entry of candidateSet.cases) {
    const expected = expectedSamples.get(entry.sampleUnitId);
    if (!expected) {
      throw new Error(
        `Production editorial candidate "${entry.sampleUnitId}" is outside the preregistered sample.`
      );
    }
    if (
      entry.strata.format !== expected.format ||
      entry.strata.locale !== expected.sample.locale ||
      entry.strata.durationBand !== expected.sample.durationBand ||
      entry.strata.policy.storyPolicyId !== expected.sample.genrePolicyId
    ) {
      throw new Error(
        `Production editorial candidate "${entry.sampleUnitId}" does not match its preregistered strata.`
      );
    }
    if (
      entry.candidates.baseline.strategyVersion !==
        manifest.strategyVersions.baseline ||
      entry.candidates.strategy.strategyVersion !==
        manifest.strategyVersions.strategy
    ) {
      throw new Error(
        `Production editorial candidate "${entry.sampleUnitId}" has stale strategy lineage.`
      );
    }
  }
  return { manifest, candidateSet };
}

export function prepareSeparatedBlindHorrorProductionEditorialReviews(input: {
  readonly manifest: HorrorEvaluationManifest;
  readonly candidateSet: unknown;
  readonly seed: string;
}): SeparatedBlindHorrorEditorialReviews {
  const { candidateSet } =
    assertHorrorProductionEditorialCandidateSetMatchesManifest(input);
  const prepared = prepareBlindHorrorEditorialCandidates({
    corpusVersion: candidateSet.candidateSetVersion,
    corpusHash: candidateSet.candidateSetHash,
    cases: candidateSet.cases.map((entry) => ({
      id: entry.sampleUnitId,
      strata: entry.strata,
      candidates: {
        baseline: entry.candidates.baseline.text,
        strategy: entry.candidates.strategy.text,
      },
    })),
    seed: input.seed,
  });
  return separateBlindHorrorEditorialReviews({
    prepared,
    caseFormat: new Map(
      candidateSet.cases.map((entry) => [
        entry.sampleUnitId,
        entry.strata.format,
      ])
    ),
    seed: input.seed,
  });
}

export async function persistHorrorProductionEditorialCandidateSet(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly candidateSet: HorrorProductionEditorialCandidateSet;
}): Promise<{ readonly persisted: boolean; readonly reused: boolean }> {
  const { manifest, candidateSet } =
    assertHorrorProductionEditorialCandidateSetMatchesManifest(args);
  await assertPersistedManifest(args.paths, manifest);
  const existing = await readJsonIfPresent(
    args.paths.productionCandidateSetPath
  );
  if (existing !== undefined) {
    const persisted =
      horrorProductionEditorialCandidateSetSchema.parse(existing);
    if (persisted.candidateSetHash !== candidateSet.candidateSetHash) {
      throw new Error(
        "A persisted production editorial candidate set is immutable."
      );
    }
    return { persisted: false, reused: true };
  }
  await writeTextAtomic(
    args.paths.productionCandidateSetPath,
    `${stableSerialize(candidateSet)}\n`
  );
  return { persisted: true, reused: false };
}

export async function persistSeparatedBlindHorrorProductionEditorialReviews(
  args: {
    readonly paths: HorrorEvaluationArtifactPaths;
    readonly manifest: HorrorEvaluationManifest;
    readonly candidateSet: HorrorProductionEditorialCandidateSet;
    readonly seed: string;
  }
): Promise<{
  readonly persisted: boolean;
  readonly reused: boolean;
  readonly reviews: SeparatedBlindHorrorEditorialReviews;
}> {
  const { manifest, candidateSet } =
    assertHorrorProductionEditorialCandidateSetMatchesManifest(args);
  await assertPersistedManifest(args.paths, manifest);
  const persistedCandidateSet = await readJsonIfPresent(
    args.paths.productionCandidateSetPath
  );
  if (persistedCandidateSet === undefined) {
    throw new Error(
      "The production editorial candidate set must be persisted before blind packets."
    );
  }
  const parsedCandidateSet =
    horrorProductionEditorialCandidateSetSchema.parse(persistedCandidateSet);
  if (parsedCandidateSet.candidateSetHash !== candidateSet.candidateSetHash) {
    throw new Error(
      "Blind review packets do not match the persisted production candidate set."
    );
  }
  const reviews = prepareSeparatedBlindHorrorProductionEditorialReviews({
    manifest,
    candidateSet,
    seed: args.seed,
  });
  const targets = [
    {
      path: args.paths.fullBlindReviewPacketPath,
      value: reviews.full.reviewPacket,
      schema: horrorBlindReviewPacketSchema,
    },
    {
      path: args.paths.fullBlindReviewAnswerKeyPath,
      value: reviews.full.answerKey,
      schema: horrorBlindReviewAnswerKeySchema,
    },
    {
      path: args.paths.shortBlindReviewPacketPath,
      value: reviews.short.reviewPacket,
      schema: horrorBlindReviewPacketSchema,
    },
    {
      path: args.paths.shortBlindReviewAnswerKeyPath,
      value: reviews.short.answerKey,
      schema: horrorBlindReviewAnswerKeySchema,
    },
  ] as const;
  const existing = await Promise.all(
    targets.map((target) => readJsonIfPresent(target.path))
  );
  const existingCount = existing.filter(
    (entry) => entry !== undefined
  ).length;
  if (existingCount > 0) {
    if (existingCount !== targets.length) {
      throw new Error(
        "Persisted production blind-review artifacts are incomplete."
      );
    }
    for (const [index, target] of targets.entries()) {
      const parsed = target.schema.parse(existing[index]);
      if (stableSerialize(parsed) !== stableSerialize(target.value)) {
        throw new Error(
          "Persisted production blind-review artifacts are immutable."
        );
      }
    }
    return { persisted: false, reused: true, reviews };
  }
  for (const target of targets) {
    await writeTextAtomic(target.path, `${stableSerialize(target.value)}\n`);
  }
  return { persisted: true, reused: false, reviews };
}

export const horrorEditorialRaterProvenanceSchema = z
  .object({
    reviewerId: identifierSchema,
    role: z.enum(["editorial-reviewer", "story-editor", "research-observer"]),
    organizationAlias: identifierSchema.optional(),
    provenanceReference: identifierSchema,
    containsPersonalSecrets: z.literal(false),
  })
  .strict();

export const horrorEditorialReviewImportSchema = z
  .object({
    format: horrorEvaluationFormatSchema,
    reviewPacket: horrorBlindReviewPacketSchema,
    ratings: z.array(horrorEditorialRatingSchema),
    raters: z.array(horrorEditorialRaterProvenanceSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.reviewPacket.items.some(
        (item) => item.strata.format !== value.format
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewPacket", "items"],
        message: "A blind editorial import cannot mix full and Short items.",
      });
    }
    const raterIds = value.raters.map((rater) => rater.reviewerId);
    if (new Set(raterIds).size !== raterIds.length) {
      context.addIssue({
        code: "custom",
        path: ["raters"],
        message: "Rater provenance IDs must be unique.",
      });
    }
    for (const rating of value.ratings) {
      if (!raterIds.includes(rating.reviewerId)) {
        context.addIssue({
          code: "custom",
          path: ["ratings"],
          message: `Rating reviewer "${rating.reviewerId}" lacks provenance.`,
        });
      }
    }
  });

const normalizedRetentionCurveSchema = z
  .array(
    z
      .object({
        positionRatio: finiteRatioSchema,
        retentionRatio: finiteRatioSchema,
      })
      .strict()
  )
  .min(2)
  .superRefine((points, context) => {
    if (points[0]?.positionRatio !== 0 || points.at(-1)?.positionRatio !== 1) {
      context.addIssue({
        code: "custom",
        message: "Normalized retention curves must span positions 0 through 1.",
      });
    }
    for (let index = 1; index < points.length; index += 1) {
      if (
        (points[index]?.positionRatio ?? 0) <=
        (points[index - 1]?.positionRatio ?? 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Retention curve positions must increase strictly.",
        });
      }
    }
  });

export const horrorAudienceMetricsImportSchema = z
  .object({
    schemaVersion: z.literal(HORROR_AUDIENCE_METRICS_IMPORT_SCHEMA_VERSION),
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    importedAt: timestampSchema,
    source: z
      .object({
        kind: z.literal("authorized-aggregate-export"),
        platform: z.literal("youtube"),
        aggregationLevel: z.literal("episode-arm"),
        fetchPerformedByMediaforge: z.literal(false),
        authorization: z
          .object({
            status: z.literal("approved"),
            authorityId: identifierSchema,
            scopeReference: identifierSchema,
            grantedAt: timestampSchema,
          })
          .strict(),
      })
      .strict(),
    observations: z.array(
      z
        .object({
          observationId: identifierSchema,
          sampleUnitId: identifierSchema,
          format: horrorEvaluationFormatSchema,
          arm: z.enum(["baseline", "strategy"]),
          strata: z
            .object({
              locale: z.string().trim().min(2).max(40),
              genrePolicyId: identifierSchema,
              durationBand: z.enum(["under-60s", "60-180s", "over-180s"]),
              audienceType: z.enum(["new", "returning", "mixed"]),
            })
            .strict(),
          metrics: z
            .object({
              normalizedRetention: normalizedRetentionCurveSchema.optional(),
              earlyRetention: finiteRatioSchema.optional(),
              averagePercentageViewed: finiteRatioSchema.optional(),
              endingRetention: finiteRatioSchema.optional(),
              ctr: finiteRatioSchema.optional(),
              titleAndThumbnailControlled: z.boolean(),
            })
            .strict(),
        })
        .strict()
    ),
    importHash: hashSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    const { importHash: _importHash, ...body } = artifact;
    if (hashText(stableSerialize(body)) !== artifact.importHash) {
      context.addIssue({
        code: "custom",
        path: ["importHash"],
        message: "Audience metrics import hash does not match its contents.",
      });
    }
    const ids = artifact.observations.map((entry) => entry.observationId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Audience metric observation IDs must be unique.",
      });
    }
  });
export type HorrorAudienceMetricsImport = z.infer<
  typeof horrorAudienceMetricsImportSchema
>;

export function buildHorrorAudienceMetricsImport(
  input: Omit<
    z.input<typeof horrorAudienceMetricsImportSchema>,
    "schemaVersion" | "importHash"
  >
): HorrorAudienceMetricsImport {
  const body = {
    ...input,
    schemaVersion: HORROR_AUDIENCE_METRICS_IMPORT_SCHEMA_VERSION,
  };
  return horrorAudienceMetricsImportSchema.parse({
    ...body,
    importHash: hashText(stableSerialize(body)),
  });
}

async function assertPersistedManifest(
  paths: HorrorEvaluationArtifactPaths,
  expected: HorrorEvaluationManifest
): Promise<void> {
  const raw = await readJsonIfPresent(paths.manifestPath);
  if (raw === undefined) {
    throw new Error(
      "The evaluation manifest must be persisted before outcome inspection."
    );
  }
  const persisted = horrorEvaluationManifestSchema.parse(raw);
  if (persisted.manifestHash !== expected.manifestHash) {
    throw new Error("Outcome import does not match the persisted manifest.");
  }
}

function assertAuthorizedImportMatchesManifest(
  manifest: HorrorEvaluationManifest,
  artifact: HorrorAudienceMetricsImport
): void {
  if (
    artifact.evaluationId !== manifest.evaluationId ||
    artifact.manifestHash !== manifest.manifestHash
  ) {
    throw new Error("Audience metrics import does not match its manifest.");
  }
  if (
    manifest.productDecisions.productionAnalyticsAuthority.status !== "resolved"
  ) {
    throw new Error("Production analytics authority is unresolved.");
  }
  const authority =
    manifest.productDecisions.productionAnalyticsAuthority.value;
  if (
    artifact.source.authorization.authorityId !== authority.authorityId ||
    artifact.source.authorization.scopeReference !== authority.scopeReference
  ) {
    throw new Error("Audience metrics import exceeds its authorized scope.");
  }
  if (manifest.sample.status !== "resolved") {
    throw new Error("The production evaluation sample is unresolved.");
  }
  const sample = new Map(
    (["full", "short"] as const).flatMap((format) =>
      manifest.sample.status === "resolved"
        ? manifest.sample.value[format].map(
            (unit) => [unit.sampleUnitId, { format, unit }] as const
          )
        : []
    )
  );
  for (const observation of artifact.observations) {
    const expected = sample.get(observation.sampleUnitId);
    if (!expected || expected.format !== observation.format) {
      throw new Error(
        `Observation "${observation.observationId}" is outside the preregistered sample.`
      );
    }
  }
}

export async function persistAuthorizedHorrorAudienceMetricsImport(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly artifact: HorrorAudienceMetricsImport;
}): Promise<void> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const artifact = horrorAudienceMetricsImportSchema.parse(args.artifact);
  await assertPersistedManifest(args.paths, manifest);
  assertAuthorizedImportMatchesManifest(manifest, artifact);
  const existing = await readJsonIfPresent(
    args.paths.audienceMetricsImportPath
  );
  if (existing !== undefined) {
    const persisted = horrorAudienceMetricsImportSchema.parse(existing);
    if (persisted.importHash !== artifact.importHash) {
      throw new Error("An imported audience metrics artifact is immutable.");
    }
    return;
  }
  await writeTextAtomic(
    args.paths.audienceMetricsImportPath,
    `${stableSerialize(artifact)}\n`
  );
}

type AudienceMetricName =
  | "normalizedRetention"
  | "earlyRetention"
  | "averagePercentageViewed"
  | "endingRetention"
  | "ctr";

export interface HorrorAudienceMetricSummary {
  readonly metric: AudienceMetricName;
  readonly classification: "story-outcome" | "title-thumbnail-evidence";
  readonly status: "confirmatory" | "exploratory" | "missing";
  readonly baseline: { readonly count: number; readonly mean: number | null };
  readonly strategy: { readonly count: number; readonly mean: number | null };
  readonly strategyMinusBaseline: number | null;
  readonly missingObservationCount: number;
}

export interface HorrorAudienceAnalysis {
  readonly format: HorrorEvaluationFormat;
  readonly overall: readonly HorrorAudienceMetricSummary[];
  readonly strata: readonly {
    readonly dimension: string;
    readonly value: string;
    readonly metrics: readonly HorrorAudienceMetricSummary[];
  }[];
}

function retentionArea(
  points: z.infer<typeof normalizedRetentionCurveSchema>
): number {
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) {
      area +=
        (current.positionRatio - previous.positionRatio) *
        ((previous.retentionRatio + current.retentionRatio) / 2);
    }
  }
  return area;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10_000
    ) / 10_000
  );
}

function metricValue(
  observation: HorrorAudienceMetricsImport["observations"][number],
  metric: AudienceMetricName
): number | undefined {
  if (metric === "normalizedRetention") {
    return observation.metrics.normalizedRetention
      ? retentionArea(observation.metrics.normalizedRetention)
      : undefined;
  }
  return observation.metrics[metric];
}

function summarizeAudienceMetric(
  observations: HorrorAudienceMetricsImport["observations"],
  metric: AudienceMetricName,
  minimumSamplePerArm: number
): HorrorAudienceMetricSummary {
  const baseline = observations
    .filter((entry) => entry.arm === "baseline")
    .map((entry) => metricValue(entry, metric))
    .filter((value): value is number => value !== undefined);
  const strategy = observations
    .filter((entry) => entry.arm === "strategy")
    .map((entry) => metricValue(entry, metric))
    .filter((value): value is number => value !== undefined);
  const baselineMean = mean(baseline);
  const strategyMean = mean(strategy);
  const missingObservationCount =
    observations.length - baseline.length - strategy.length;
  const missing = baselineMean === null || strategyMean === null;
  const controlledCtr =
    metric !== "ctr" ||
    observations.every(
      (entry) =>
        entry.metrics.ctr === undefined ||
        entry.metrics.titleAndThumbnailControlled
    );
  return {
    metric,
    classification:
      metric === "ctr" && !controlledCtr
        ? "title-thumbnail-evidence"
        : "story-outcome",
    status: missing
      ? "missing"
      : baseline.length < minimumSamplePerArm ||
          strategy.length < minimumSamplePerArm
        ? "exploratory"
        : "confirmatory",
    baseline: { count: baseline.length, mean: baselineMean },
    strategy: { count: strategy.length, mean: strategyMean },
    strategyMinusBaseline:
      baselineMean === null || strategyMean === null
        ? null
        : Math.round((strategyMean - baselineMean) * 10_000) / 10_000,
    missingObservationCount,
  };
}

const audienceMetricNames = [
  "normalizedRetention",
  "earlyRetention",
  "averagePercentageViewed",
  "endingRetention",
  "ctr",
] as const;

export function evaluateHorrorAudienceMetrics(args: {
  readonly manifest: HorrorEvaluationManifest;
  readonly artifact: HorrorAudienceMetricsImport;
}): Readonly<Record<HorrorEvaluationFormat, HorrorAudienceAnalysis>> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const artifact = horrorAudienceMetricsImportSchema.parse(args.artifact);
  assertAuthorizedImportMatchesManifest(manifest, artifact);
  const buildTrack = (
    format: HorrorEvaluationFormat
  ): HorrorAudienceAnalysis => {
    const observations = artifact.observations.filter(
      (entry) => entry.format === format
    );
    const summarize = (selected: HorrorAudienceMetricsImport["observations"]) =>
      audienceMetricNames.map((metric) =>
        summarizeAudienceMetric(
          selected,
          metric,
          manifest.stratification.minimumSamplePerArm
        )
      );
    const strata = manifest.stratification.dimensions.flatMap((dimension) => {
      const values = [
        ...new Set(
          observations.map((entry) => String(entry.strata[dimension]))
        ),
      ].sort();
      return values.map((value) => ({
        dimension,
        value,
        metrics: summarize(
          observations.filter(
            (entry) => String(entry.strata[dimension]) === value
          )
        ),
      }));
    });
    return { format, overall: summarize(observations), strata };
  };
  return { full: buildTrack("full"), short: buildTrack("short") };
}

export const horrorSourcePlanRolloutGateIds = [
  "immutable-fact-rule-ending-regression-free",
  "no-extra-generation-call",
  "cost-within-budget",
  "blind-editorial-primary-improved",
  "production-retention-not-harmed",
  "failure-behavior-understood",
  "stale-cache-behavior-understood",
  "product-decisions-resolved",
  "explicit-human-approval",
] as const;

const rolloutScopeSchema = z
  .object({
    formats: z.array(horrorEvaluationFormatSchema).min(1),
    locales: z.array(z.string().trim().min(2).max(40)).min(1),
    strategyVersion: identifierSchema,
  })
  .strict()
  .superRefine((scope, context) => {
    if (new Set(scope.formats).size !== scope.formats.length) {
      context.addIssue({
        code: "custom",
        path: ["formats"],
        message: "Rollout scope formats must be unique.",
      });
    }
  });
export type HorrorRolloutScope = z.infer<typeof rolloutScopeSchema>;

function computeRolloutScopeHash(scope: HorrorRolloutScope): string {
  return hashText(stableSerialize(rolloutScopeSchema.parse(scope)));
}

export const horrorRolloutApprovalSchema = z
  .object({
    approvalVersion: z.literal("horror-rollout-human-approval-v1"),
    decision: z.enum(["promote-to-enforce", "return-to-off"]),
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    scopeHash: hashSchema,
    approvedBy: identifierSchema,
    approvalReference: identifierSchema,
    approvedAt: timestampSchema,
    containsPersonalSecrets: z.literal(false),
  })
  .strict();
export type HorrorRolloutApproval = z.infer<typeof horrorRolloutApprovalSchema>;

export function buildHorrorRolloutApproval(input: {
  readonly decision: "promote-to-enforce" | "return-to-off";
  readonly evaluationId: string;
  readonly manifestHash: string;
  readonly scope: HorrorRolloutScope;
  readonly approvedBy: string;
  readonly approvalReference: string;
  readonly approvedAt: string;
}): HorrorRolloutApproval {
  return horrorRolloutApprovalSchema.parse({
    approvalVersion: "horror-rollout-human-approval-v1",
    decision: input.decision,
    evaluationId: input.evaluationId,
    manifestHash: input.manifestHash,
    scopeHash: computeRolloutScopeHash(input.scope),
    approvedBy: input.approvedBy,
    approvalReference: input.approvalReference,
    approvedAt: input.approvedAt,
    containsPersonalSecrets: false,
  });
}

const decisionGateSchema = z
  .object({
    gateId: z.enum(horrorSourcePlanRolloutGateIds),
    passed: z.boolean(),
    evidence: nonEmptyTextSchema,
  })
  .strict();

export const horrorRolloutDecisionArtifactSchema = z
  .object({
    schemaVersion: z.literal(HORROR_ROLLOUT_DECISION_SCHEMA_VERSION),
    evaluationId: identifierSchema,
    manifestHash: hashSchema,
    generatedAt: timestampSchema,
    requestedDecision: z.enum([
      "remain-shadow",
      "promote-to-enforce",
      "return-to-off",
    ]),
    decision: z.enum(["remain-shadow", "promote-to-enforce", "return-to-off"]),
    scope: rolloutScopeSchema,
    confidence: z.enum(["insufficient", "low", "moderate", "high"]),
    gates: z
      .array(decisionGateSchema)
      .length(horrorSourcePlanRolloutGateIds.length),
    regressions: z.array(nonEmptyTextSchema),
    cost: z
      .object({
        incrementalProviderCalls: z.number().int().nonnegative(),
        incrementalCostUsd: z.number().finite().nonnegative(),
        withinBudget: z.boolean(),
      })
      .strict(),
    failures: z.array(nonEmptyTextSchema),
    staleCacheBehavior: z
      .object({
        understood: z.boolean(),
        evidence: nonEmptyTextSchema,
      })
      .strict(),
    dissentingEvidence: z.array(nonEmptyTextSchema),
    humanApproval: horrorRolloutApprovalSchema.nullable(),
    failClosedReasons: z.array(nonEmptyTextSchema),
    artifactHash: hashSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    const { artifactHash: _artifactHash, ...body } = artifact;
    if (hashText(stableSerialize(body)) !== artifact.artifactHash) {
      context.addIssue({
        code: "custom",
        path: ["artifactHash"],
        message: "Rollout decision artifact hash does not match its contents.",
      });
    }
    const gateIds = artifact.gates.map((gate) => gate.gateId);
    if (
      new Set(gateIds).size !== horrorSourcePlanRolloutGateIds.length ||
      horrorSourcePlanRolloutGateIds.some((gateId) => !gateIds.includes(gateId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["gates"],
        message: "Decision artifact must contain every source-plan gate once.",
      });
    }
    if (
      artifact.decision === "promote-to-enforce" &&
      artifact.gates.some((gate) => !gate.passed)
    ) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "Promotion cannot bypass a source-plan gate.",
      });
    }
  });
export type HorrorRolloutDecisionArtifact = z.infer<
  typeof horrorRolloutDecisionArtifactSchema
>;

export interface HorrorRolloutEvidence {
  readonly immutableFactRuleEndingRegressionFree: boolean;
  readonly noExtraGenerationCall: boolean;
  readonly costWithinBudget: boolean;
  readonly blindEditorialPrimaryImproved: boolean;
  readonly productionRetentionNotHarmed: boolean;
  readonly failureBehaviorUnderstood: boolean;
  readonly staleCacheBehaviorUnderstood: boolean;
  readonly regressions: readonly string[];
  readonly incrementalProviderCalls: number;
  readonly incrementalCostUsd: number;
  readonly failures: readonly string[];
  readonly staleCacheEvidence: string;
  readonly dissentingEvidence: readonly string[];
  readonly confidence: "insufficient" | "low" | "moderate" | "high";
}

function manifestProductDecisionsResolved(
  manifest: HorrorEvaluationManifest
): boolean {
  return (
    manifest.primaryMetric.status === "resolved" &&
    manifest.practicalImprovementThreshold.status === "resolved" &&
    manifest.sample.status === "resolved" &&
    manifest.costBudget.status === "resolved" &&
    manifest.productDecisions.productionAnalyticsAuthority.status ===
      "resolved" &&
    manifest.productDecisions.defaultRolloutChangeAuthority.status ===
      "resolved"
  );
}

function approvalMatches(args: {
  readonly approval: HorrorRolloutApproval | undefined;
  readonly requestedDecision: "promote-to-enforce" | "return-to-off";
  readonly manifest: HorrorEvaluationManifest;
  readonly scope: HorrorRolloutScope;
}): boolean {
  const approval = args.approval;
  return Boolean(
    approval &&
    approval.decision === args.requestedDecision &&
    approval.evaluationId === args.manifest.evaluationId &&
    approval.manifestHash === args.manifest.manifestHash &&
    approval.scopeHash === computeRolloutScopeHash(args.scope)
  );
}

export function buildHorrorRolloutDecisionArtifact(args: {
  readonly manifest: HorrorEvaluationManifest;
  readonly generatedAt: string;
  readonly requestedDecision:
    | "remain-shadow"
    | "promote-to-enforce"
    | "return-to-off";
  readonly scope: HorrorRolloutScope;
  readonly evidence: HorrorRolloutEvidence;
  readonly humanApproval?: HorrorRolloutApproval;
}): HorrorRolloutDecisionArtifact {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const scope = rolloutScopeSchema.parse(args.scope);
  const productDecisionsResolved = manifestProductDecisionsResolved(manifest);
  const hasApproval =
    args.requestedDecision === "remain-shadow"
      ? false
      : approvalMatches({
          approval: args.humanApproval,
          requestedDecision: args.requestedDecision,
          manifest,
          scope,
        });
  const gateValues: Readonly<
    Record<(typeof horrorSourcePlanRolloutGateIds)[number], boolean>
  > = {
    "immutable-fact-rule-ending-regression-free":
      args.evidence.immutableFactRuleEndingRegressionFree,
    "no-extra-generation-call": args.evidence.noExtraGenerationCall,
    "cost-within-budget": args.evidence.costWithinBudget,
    "blind-editorial-primary-improved":
      args.evidence.blindEditorialPrimaryImproved,
    "production-retention-not-harmed":
      args.evidence.productionRetentionNotHarmed,
    "failure-behavior-understood": args.evidence.failureBehaviorUnderstood,
    "stale-cache-behavior-understood":
      args.evidence.staleCacheBehaviorUnderstood,
    "product-decisions-resolved": productDecisionsResolved,
    "explicit-human-approval": hasApproval,
  };
  const gates = horrorSourcePlanRolloutGateIds.map((gateId) => ({
    gateId,
    passed: gateValues[gateId],
    evidence:
      gateId === "product-decisions-resolved"
        ? productDecisionsResolved
          ? "Every required product decision is resolved in the preregistered manifest."
          : "One or more required product decisions remain unresolved."
        : gateId === "explicit-human-approval"
          ? hasApproval
            ? "Approval is explicitly bound to the manifest, decision, and scope."
            : "No matching explicit human approval is present."
          : `Recorded evaluation evidence for ${gateId}: ${String(
              gateValues[gateId]
            )}.`,
  }));
  const failClosedReasons = gates
    .filter((gate) => !gate.passed)
    .map((gate) => gate.evidence);
  const decision =
    args.requestedDecision === "return-to-off"
      ? "return-to-off"
      : args.requestedDecision === "promote-to-enforce" &&
          failClosedReasons.length === 0
        ? "promote-to-enforce"
        : "remain-shadow";
  const body = {
    schemaVersion: HORROR_ROLLOUT_DECISION_SCHEMA_VERSION,
    evaluationId: manifest.evaluationId,
    manifestHash: manifest.manifestHash,
    generatedAt: timestampSchema.parse(args.generatedAt),
    requestedDecision: args.requestedDecision,
    decision,
    scope,
    confidence: args.evidence.confidence,
    gates,
    regressions: [...args.evidence.regressions],
    cost: {
      incrementalProviderCalls: args.evidence.incrementalProviderCalls,
      incrementalCostUsd: args.evidence.incrementalCostUsd,
      withinBudget: args.evidence.costWithinBudget,
    },
    failures: [...args.evidence.failures],
    staleCacheBehavior: {
      understood: args.evidence.staleCacheBehaviorUnderstood,
      evidence: args.evidence.staleCacheEvidence,
    },
    dissentingEvidence: [...args.evidence.dissentingEvidence],
    humanApproval: hasApproval ? (args.humanApproval ?? null) : null,
    failClosedReasons,
  };
  return horrorRolloutDecisionArtifactSchema.parse({
    ...body,
    artifactHash: hashText(stableSerialize(body)),
  });
}

export async function persistHorrorRolloutDecisionArtifact(args: {
  readonly paths: HorrorEvaluationArtifactPaths;
  readonly manifest: HorrorEvaluationManifest;
  readonly artifact: HorrorRolloutDecisionArtifact;
}): Promise<void> {
  const manifest = horrorEvaluationManifestSchema.parse(args.manifest);
  const artifact = horrorRolloutDecisionArtifactSchema.parse(args.artifact);
  await assertPersistedManifest(args.paths, manifest);
  if (
    artifact.evaluationId !== manifest.evaluationId ||
    artifact.manifestHash !== manifest.manifestHash
  ) {
    throw new Error("Rollout decision does not match its persisted manifest.");
  }
  await writeTextAtomic(
    args.paths.decisionPath,
    `${stableSerialize(artifact)}\n`
  );
}

export interface HorrorRolloutConfigurationTransition {
  readonly configurationKey: "MEDIAFORGE_HORROR_AFFECT_ROLLOUT_MODE";
  readonly from: "off" | "shadow" | "enforce";
  readonly to: "off" | "enforce";
  readonly evidenceArtifactsRetained: readonly string[];
  readonly acceptedStoriesRewritten: false;
  readonly providerCalls: 0;
}

export function planHorrorRolloutConfigurationTransition(args: {
  readonly currentMode: "off" | "shadow" | "enforce";
  readonly decisionArtifact: HorrorRolloutDecisionArtifact;
  readonly approval: HorrorRolloutApproval;
  readonly paths: HorrorEvaluationArtifactPaths;
}): HorrorRolloutConfigurationTransition {
  const artifact = horrorRolloutDecisionArtifactSchema.parse(
    args.decisionArtifact
  );
  const approval = horrorRolloutApprovalSchema.parse(args.approval);
  if (artifact.decision === "remain-shadow") {
    throw new Error(
      "Remain-shadow decisions cannot change rollout configuration."
    );
  }
  if (
    approval.decision !== artifact.decision ||
    approval.evaluationId !== artifact.evaluationId ||
    approval.manifestHash !== artifact.manifestHash ||
    approval.scopeHash !== computeRolloutScopeHash(artifact.scope)
  ) {
    throw new Error(
      "Rollout configuration transition requires matching explicit approval."
    );
  }
  return {
    configurationKey: "MEDIAFORGE_HORROR_AFFECT_ROLLOUT_MODE",
    from: args.currentMode,
    to: artifact.decision === "promote-to-enforce" ? "enforce" : "off",
    evidenceArtifactsRetained: [
      args.paths.manifestPath,
      args.paths.audienceMetricsImportPath,
      args.paths.decisionPath,
    ],
    acceptedStoriesRewritten: false,
    providerCalls: 0,
  };
}
