import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureWorkspacePath,
  hashText,
  normalizeEpisodeId,
  writeTextAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import {
  computeHorrorAffectPlanHash,
  HORROR_AFFECT_PLAN_SCHEMA_VERSION,
  HORROR_AFFECT_STRATEGY_VERSION,
  horrorAffectPlanIssueSchema,
  horrorAffectPlanSchema,
  type HorrorAffectPlan,
} from "./horror-affect-plan.js";
import { STABLE_JSON_SERIALIZER_VERSION, stableSerialize } from "./stable-json.js";
import type { HorrorAffectRolloutMode } from "./story-localization.types.js";

export const HORROR_AFFECT_PLAN_ARTIFACT_SCHEMA_VERSION =
  "horror-affect-plan-artifact-v1";
export const HORROR_AFFECT_PLAN_ARTIFACT_PRODUCER_VERSION =
  "story-localization-horror-affect-persistence-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const horrorAffectEligibilityReasonSchema = z.enum([
  "canonical-english-fiction",
  "localized-language",
  "nonfiction",
  "unsupported-fictionality",
  "unsupported-genre",
]);
export type PersistedHorrorAffectEligibilityReason = z.infer<
  typeof horrorAffectEligibilityReasonSchema
>;

export const horrorAffectPlanAbsenceReasonSchema = z.enum([
  "rollout-off",
  "localized-language",
  "nonfiction",
  "unsupported-fictionality",
  "unsupported-genre",
]);
export type HorrorAffectPlanAbsenceReason = z.infer<
  typeof horrorAffectPlanAbsenceReasonSchema
>;

export const persistedHorrorAffectPlanArtifactSchema = z
  .object({
    schemaVersion: z.literal(HORROR_AFFECT_PLAN_ARTIFACT_SCHEMA_VERSION),
    strategyVersion: z.literal(HORROR_AFFECT_STRATEGY_VERSION),
    source: z
      .object({
        episodeNumber: z.string().min(1),
        episodeSlug: z.string().min(1),
        sourceHash: hashSchema,
        storyIrHash: hashSchema,
        canonicalContractHash: hashSchema.nullable(),
        mechanicsHash: hashSchema.nullable(),
        canonicalBeatsHash: hashSchema.nullable(),
      })
      .strict(),
    eligibility: z
      .object({
        eligible: z.boolean(),
        reason: horrorAffectEligibilityReasonSchema,
      })
      .strict(),
    rolloutMode: z.enum(["off", "shadow", "enforce"]),
    plan: horrorAffectPlanSchema.nullable(),
    ineligibilityReason: horrorAffectPlanAbsenceReasonSchema.nullable(),
    validationIssues: z.array(horrorAffectPlanIssueSchema),
    planHash: hashSchema.nullable(),
    creation: z
      .object({
        producerVersion: z.literal(
          HORROR_AFFECT_PLAN_ARTIFACT_PRODUCER_VERSION
        ),
        serializerVersion: z.literal(STABLE_JSON_SERIALIZER_VERSION),
        deterministic: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.plan) {
      if (artifact.ineligibilityReason !== null) {
        context.addIssue({
          code: "custom",
          path: ["ineligibilityReason"],
          message: "A persisted plan cannot have an ineligibility reason.",
        });
      }
      if (artifact.planHash !== artifact.plan.planHash) {
        context.addIssue({
          code: "custom",
          path: ["planHash"],
          message: "The envelope plan hash must match the persisted plan.",
        });
      }
      if (
        artifact.source.storyIrHash !== artifact.plan.parents.storyIrHash ||
        artifact.source.canonicalContractHash !==
          artifact.plan.parents.canonicalContractHash ||
        artifact.source.mechanicsHash !== artifact.plan.parents.mechanicsHash ||
        artifact.source.canonicalBeatsHash !==
          artifact.plan.parents.canonicalBeatsHash
      ) {
        context.addIssue({
          code: "custom",
          path: ["source"],
          message: "The persisted plan lineage must match the envelope lineage.",
        });
      }
      return;
    }
    if (artifact.ineligibilityReason === null) {
      context.addIssue({
        code: "custom",
        path: ["ineligibilityReason"],
        message: "An artifact without a plan requires a typed absence reason.",
      });
    }
    if (artifact.planHash !== null || artifact.validationIssues.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["planHash"],
        message: "An artifact without a plan cannot carry plan output.",
      });
    }
  });

export type PersistedHorrorAffectPlanArtifact = z.infer<
  typeof persistedHorrorAffectPlanArtifactSchema
>;

export interface HorrorAffectPlanArtifactPaths {
  readonly episodeDir: string;
  readonly canonicalFullDir: string;
  readonly artifactPath: string;
}

export function resolveHorrorAffectPlanArtifactPaths(args: {
  readonly outputDirectory: string;
  readonly episodeSlug: string;
}): HorrorAffectPlanArtifactPaths {
  const episodeSlug = normalizeEpisodeId(args.episodeSlug);
  const outputDirectory = path.resolve(args.outputDirectory);
  const episodeDir = ensureWorkspacePath(
    outputDirectory,
    path.join(outputDirectory, episodeSlug)
  );
  const canonicalFullDir = ensureWorkspacePath(
    episodeDir,
    path.join(episodeDir, "en", "full")
  );
  return {
    episodeDir,
    canonicalFullDir,
    artifactPath: ensureWorkspacePath(
      canonicalFullDir,
      path.join(canonicalFullDir, "horror-affect-plan.json")
    ),
  };
}

export function buildPersistedHorrorAffectPlanArtifact(args: {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly sourceHash: string;
  readonly storyIrHash: string;
  readonly rolloutMode: HorrorAffectRolloutMode;
  readonly eligibility: {
    readonly eligible: boolean;
    readonly reason: PersistedHorrorAffectEligibilityReason;
  };
  readonly plan?: HorrorAffectPlan;
}): PersistedHorrorAffectPlanArtifact {
  const plan = args.plan ?? null;
  const ineligibilityReason: HorrorAffectPlanAbsenceReason | null = plan
    ? null
    : args.eligibility.eligible
      ? "rollout-off"
      : (args.eligibility.reason as HorrorAffectPlanAbsenceReason);
  return persistedHorrorAffectPlanArtifactSchema.parse({
    schemaVersion: HORROR_AFFECT_PLAN_ARTIFACT_SCHEMA_VERSION,
    strategyVersion: HORROR_AFFECT_STRATEGY_VERSION,
    source: {
      episodeNumber: args.episodeNumber,
      episodeSlug: normalizeEpisodeId(args.episodeSlug),
      sourceHash: args.sourceHash,
      storyIrHash: plan?.parents.storyIrHash ?? args.storyIrHash,
      canonicalContractHash: plan?.parents.canonicalContractHash ?? null,
      mechanicsHash: plan?.parents.mechanicsHash ?? null,
      canonicalBeatsHash: plan?.parents.canonicalBeatsHash ?? null,
    },
    eligibility: args.eligibility,
    rolloutMode: args.rolloutMode,
    plan,
    ineligibilityReason,
    validationIssues: plan?.validation.issues ?? [],
    planHash: plan?.planHash ?? null,
    creation: {
      producerVersion: HORROR_AFFECT_PLAN_ARTIFACT_PRODUCER_VERSION,
      serializerVersion: STABLE_JSON_SERIALIZER_VERSION,
      deterministic: true,
    },
  });
}

export function serializePersistedHorrorAffectPlanArtifact(
  artifact: PersistedHorrorAffectPlanArtifact
): string {
  return `${stableSerialize(
    persistedHorrorAffectPlanArtifactSchema.parse(artifact)
  )}\n`;
}

export const horrorAffectPlanArtifactStateSchema = z.enum([
  "missing",
  "current",
  "stale",
  "invalid",
]);
export type HorrorAffectPlanArtifactState = z.infer<
  typeof horrorAffectPlanArtifactStateSchema
>;

export const horrorAffectPlanArtifactReasonCodeSchema = z.enum([
  "artifact-missing",
  "malformed-json",
  "schema-invalid",
  "episode-identity-mismatch",
  "plan-hash-mismatch",
  "artifact-schema-version-changed",
  "strategy-version-changed",
  "source-hash-changed",
  "story-ir-hash-changed",
  "canonical-contract-hash-changed",
  "mechanics-hash-changed",
  "canonical-beats-hash-changed",
  "eligibility-changed",
  "rollout-mode-changed",
  "plan-content-changed",
]);
export type HorrorAffectPlanArtifactReasonCode = z.infer<
  typeof horrorAffectPlanArtifactReasonCodeSchema
>;

export interface HorrorAffectPlanArtifactReason {
  readonly code: HorrorAffectPlanArtifactReasonCode;
  readonly dependency: string;
  readonly message: string;
  readonly persisted?: string | boolean | null;
  readonly expected?: string | boolean | null;
}

export interface HorrorAffectPlanArtifactStatus {
  readonly state: HorrorAffectPlanArtifactState;
  readonly artifactPath: string;
  readonly artifactPresent: boolean;
  readonly reasons: readonly HorrorAffectPlanArtifactReason[];
  readonly rolloutMode?: HorrorAffectRolloutMode;
  readonly eligible?: boolean;
  readonly planHash?: string | null;
  readonly validationIssueCount?: number;
  readonly artifactHash?: string;
}

function statusForArtifact(args: {
  readonly artifactPath: string;
  readonly state: HorrorAffectPlanArtifactState;
  readonly reasons: readonly HorrorAffectPlanArtifactReason[];
  readonly artifact?: PersistedHorrorAffectPlanArtifact;
}): HorrorAffectPlanArtifactStatus {
  return {
    state: args.state,
    artifactPath: args.artifactPath,
    artifactPresent: args.state !== "missing",
    reasons: args.reasons,
    ...(args.artifact
      ? {
          rolloutMode: args.artifact.rolloutMode,
          eligible: args.artifact.eligibility.eligible,
          planHash: args.artifact.planHash,
          validationIssueCount: args.artifact.validationIssues.length,
          artifactHash: hashText(
            serializePersistedHorrorAffectPlanArtifact(args.artifact)
          ),
        }
      : {}),
  };
}

function staleReason(args: {
  readonly code: HorrorAffectPlanArtifactReasonCode;
  readonly dependency: string;
  readonly persisted: string | boolean | null;
  readonly expected: string | boolean | null;
}): HorrorAffectPlanArtifactReason {
  return {
    ...args,
    message: `${args.dependency} changed from ${String(
      args.persisted
    )} to ${String(args.expected)}.`,
  };
}

function planHashIsValid(plan: HorrorAffectPlan): boolean {
  const { planHash, ...body } = plan;
  return planHash === computeHorrorAffectPlanHash(body);
}

export async function inspectHorrorAffectPlanArtifact(args: {
  readonly paths: HorrorAffectPlanArtifactPaths;
  readonly expectedArtifact?: PersistedHorrorAffectPlanArtifact;
}): Promise<{
  readonly status: HorrorAffectPlanArtifactStatus;
  readonly artifact?: PersistedHorrorAffectPlanArtifact;
}> {
  let raw: string;
  try {
    raw = await fs.readFile(args.paths.artifactPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: statusForArtifact({
          artifactPath: args.paths.artifactPath,
          state: "missing",
          reasons: [
            {
              code: "artifact-missing",
              dependency: "artifact",
              message: "No persisted horror affect plan artifact exists.",
            },
          ],
        }),
      };
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return {
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "invalid",
        reasons: [
          {
            code: "malformed-json",
            dependency: "artifact",
            message: "The persisted horror affect plan is not valid JSON.",
          },
        ],
      }),
    };
  }
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  if (
    record &&
    typeof record["schemaVersion"] === "string" &&
    record["schemaVersion"] !== HORROR_AFFECT_PLAN_ARTIFACT_SCHEMA_VERSION
  ) {
    return {
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "stale",
        reasons: [
          staleReason({
            code: "artifact-schema-version-changed",
            dependency: "artifact schema version",
            persisted: record["schemaVersion"],
            expected: HORROR_AFFECT_PLAN_ARTIFACT_SCHEMA_VERSION,
          }),
        ],
      }),
    };
  }
  if (
    record &&
    typeof record["strategyVersion"] === "string" &&
    record["strategyVersion"] !== HORROR_AFFECT_STRATEGY_VERSION
  ) {
    return {
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "stale",
        reasons: [
          staleReason({
            code: "strategy-version-changed",
            dependency: "strategy version",
            persisted: record["strategyVersion"],
            expected: HORROR_AFFECT_STRATEGY_VERSION,
          }),
        ],
      }),
    };
  }

  const parsed = persistedHorrorAffectPlanArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "invalid",
        reasons: [
          {
            code: "schema-invalid",
            dependency: "artifact schema",
            message: parsed.error.issues[0]?.message ?? "Artifact schema is invalid.",
          },
        ],
      }),
    };
  }
  const artifact = parsed.data;
  const expectedEpisodeSlug =
    args.expectedArtifact?.source.episodeSlug ??
    path.basename(args.paths.episodeDir);
  if (
    artifact.source.episodeSlug !== expectedEpisodeSlug ||
    (args.expectedArtifact &&
      artifact.source.episodeNumber !==
        args.expectedArtifact.source.episodeNumber)
  ) {
    return {
      artifact,
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "invalid",
        artifact,
        reasons: [
          {
            code: "episode-identity-mismatch",
            dependency: "episode identity",
            message: "The persisted artifact belongs to a different episode.",
            persisted: `${artifact.source.episodeNumber}:${artifact.source.episodeSlug}`,
            expected: args.expectedArtifact
              ? `${args.expectedArtifact.source.episodeNumber}:${expectedEpisodeSlug}`
              : expectedEpisodeSlug,
          },
        ],
      }),
    };
  }
  if (artifact.plan && !planHashIsValid(artifact.plan)) {
    return {
      artifact,
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "invalid",
        artifact,
        reasons: [
          {
            code: "plan-hash-mismatch",
            dependency: "plan hash",
            message: "The persisted plan hash does not match its canonical content.",
          },
        ],
      }),
    };
  }

  const expected = args.expectedArtifact;
  if (!expected) {
    return {
      artifact,
      status: statusForArtifact({
        artifactPath: args.paths.artifactPath,
        state: "current",
        artifact,
        reasons: [],
      }),
    };
  }
  const reasons: HorrorAffectPlanArtifactReason[] = [];
  const compare = (
    code: HorrorAffectPlanArtifactReasonCode,
    dependency: string,
    persisted: string | boolean | null,
    expectedValue: string | boolean | null
  ) => {
    if (persisted !== expectedValue) {
      reasons.push(
        staleReason({
          code,
          dependency,
          persisted,
          expected: expectedValue,
        })
      );
    }
  };
  compare(
    "source-hash-changed",
    "source hash",
    artifact.source.sourceHash,
    expected.source.sourceHash
  );
  compare(
    "story-ir-hash-changed",
    "StoryIR hash",
    artifact.source.storyIrHash,
    expected.source.storyIrHash
  );
  compare(
    "canonical-contract-hash-changed",
    "canonical contract hash",
    artifact.source.canonicalContractHash,
    expected.source.canonicalContractHash
  );
  compare(
    "mechanics-hash-changed",
    "mechanics hash",
    artifact.source.mechanicsHash,
    expected.source.mechanicsHash
  );
  compare(
    "canonical-beats-hash-changed",
    "canonical beats hash",
    artifact.source.canonicalBeatsHash,
    expected.source.canonicalBeatsHash
  );
  compare(
    "eligibility-changed",
    "eligibility",
    `${artifact.eligibility.eligible}:${artifact.eligibility.reason}`,
    `${expected.eligibility.eligible}:${expected.eligibility.reason}`
  );
  compare(
    "rollout-mode-changed",
    "rollout mode",
    artifact.rolloutMode,
    expected.rolloutMode
  );
  if (
    stableSerialize({
      plan: artifact.plan,
      ineligibilityReason: artifact.ineligibilityReason,
      validationIssues: artifact.validationIssues,
      planHash: artifact.planHash,
    }) !==
    stableSerialize({
      plan: expected.plan,
      ineligibilityReason: expected.ineligibilityReason,
      validationIssues: expected.validationIssues,
      planHash: expected.planHash,
    })
  ) {
    reasons.push({
      code: "plan-content-changed",
      dependency: "plan content",
      message: "The deterministic plan content changed.",
      persisted: artifact.planHash,
      expected: expected.planHash,
    });
  }
  return {
    artifact,
    status: statusForArtifact({
      artifactPath: args.paths.artifactPath,
      state: reasons.length > 0 ? "stale" : "current",
      artifact,
      reasons,
    }),
  };
}

export async function persistHorrorAffectPlanArtifact(args: {
  readonly paths: HorrorAffectPlanArtifactPaths;
  readonly artifact: PersistedHorrorAffectPlanArtifact;
}): Promise<void> {
  if (
    normalizeEpisodeId(args.artifact.source.episodeSlug) !==
    path.basename(args.paths.episodeDir)
  ) {
    throw new Error(
      "Cannot persist a horror affect plan for a mismatched episode identity."
    );
  }
  await writeTextAtomic(
    args.paths.artifactPath,
    serializePersistedHorrorAffectPlanArtifact(args.artifact)
  );
}

export async function resolveAndPersistHorrorAffectPlanArtifact(args: {
  readonly paths: HorrorAffectPlanArtifactPaths;
  readonly expectedArtifact: PersistedHorrorAffectPlanArtifact;
}): Promise<{
  readonly artifact: PersistedHorrorAffectPlanArtifact;
  readonly status: HorrorAffectPlanArtifactStatus;
  readonly previousState: HorrorAffectPlanArtifactState;
  readonly reused: boolean;
  readonly refreshed: boolean;
}> {
  const inspected = await inspectHorrorAffectPlanArtifact({
    paths: args.paths,
    expectedArtifact: args.expectedArtifact,
  });
  if (inspected.status.state === "current" && inspected.artifact) {
    return {
      artifact: inspected.artifact,
      status: inspected.status,
      previousState: "current",
      reused: true,
      refreshed: false,
    };
  }
  await persistHorrorAffectPlanArtifact({
    paths: args.paths,
    artifact: args.expectedArtifact,
  });
  const refreshed = await inspectHorrorAffectPlanArtifact({
    paths: args.paths,
    expectedArtifact: args.expectedArtifact,
  });
  return {
    artifact: args.expectedArtifact,
    status: refreshed.status,
    previousState: inspected.status.state,
    reused: false,
    refreshed: true,
  };
}
