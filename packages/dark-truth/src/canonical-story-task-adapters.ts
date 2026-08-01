import fs from "node:fs/promises";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  artifactRefSchema,
  type ArtifactKind,
  type ArtifactManifest,
} from "@mediaforge/domain";
import {
  ArtifactRepository,
  WorkflowInterruptedError,
  type TaskExecutionContext,
  type TaskExecutionResult,
  type TaskImplementation,
  type WorkflowStore,
} from "@mediaforge/workflow-engine";
import type { ArtifactLayoutAdapter } from "@mediaforge/shared";
import { z } from "zod";

import { DARK_TRUTH_TASK_REGISTRY_VERSION } from "./task-registry.js";

export const DARK_TRUTH_CANONICAL_STORY_ADAPTER_VERSION =
  "darktruth.canonical-story-adapters.v1" as const;
export const DARK_TRUTH_CANONICAL_STORY_ARTIFACT_VERSION =
  "darktruth.canonical-story-task-artifact.v1" as const;

/** Keeps intermediate task evidence distinct from the public episode artifacts. */
export const darkTruthCanonicalStoryArtifactLayoutAdapter: ArtifactLayoutAdapter =
  {
    profileId: "dark-truth",
    canonicalRelativePath: (ref) => {
      if (!ref.artifactKey) {
        throw new Error(
          "Canonical story task artifacts require an artifact key."
        );
      }
      return path.posix.join(
        "state",
        "canonical-story-tasks",
        ref.locale,
        ref.variant,
        `${ref.artifactKey}.${ref.format ?? "json"}`
      );
    },
    legacyRelativePaths: () => [],
  };

export function createDarkTruthCanonicalStoryArtifactRepository(
  workspaceRoot: string
): ArtifactRepository {
  return new ArtifactRepository({
    workspaceRoot,
    adapters: [darkTruthCanonicalStoryArtifactLayoutAdapter],
  });
}

export const DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS = [
  "darktruth.concept-select",
  "darktruth.episode-bible",
  "darktruth.story-outline",
  "darktruth.rewrite-full",
  "darktruth.quality-structure",
  "darktruth.quality-horror",
  "darktruth.quality-repetition",
  "darktruth.quality-continuity",
  "darktruth.quality-emotional-cost",
  "darktruth.quality-supernatural-rule",
  "darktruth.quality-opening",
  "darktruth.quality-ending",
  "darktruth.localize",
  "darktruth.quality-localization",
  "darktruth.shorts-derive",
  "darktruth.quality-shorts",
] as const;

export type DarkTruthStoryExecutableTaskId =
  (typeof DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS)[number];

const qualityTaskIds = [
  "darktruth.quality-structure",
  "darktruth.quality-horror",
  "darktruth.quality-repetition",
  "darktruth.quality-continuity",
  "darktruth.quality-emotional-cost",
  "darktruth.quality-supernatural-rule",
  "darktruth.quality-opening",
  "darktruth.quality-ending",
] as const;

const modelAssistedTaskIds = new Set<DarkTruthStoryExecutableTaskId>([
  "darktruth.concept-select",
  "darktruth.episode-bible",
  "darktruth.story-outline",
  "darktruth.rewrite-full",
  "darktruth.quality-horror",
  "darktruth.quality-emotional-cost",
  "darktruth.quality-supernatural-rule",
  "darktruth.quality-opening",
  "darktruth.quality-ending",
  "darktruth.localize",
  "darktruth.shorts-derive",
]);

const ownerByTask = Object.fromEntries(
  DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS.map((taskId) => [
    taskId,
    "@mediaforge/story-localization" as const,
  ])
) as Record<DarkTruthStoryExecutableTaskId, "@mediaforge/story-localization">;

const outputKindByTask = {
  "darktruth.concept-select": "story-bible",
  "darktruth.episode-bible": "story-bible",
  "darktruth.story-outline": "story-bible",
  "darktruth.rewrite-full": "full-script",
  "darktruth.quality-structure": "quality-assessment",
  "darktruth.quality-horror": "quality-assessment",
  "darktruth.quality-repetition": "quality-assessment",
  "darktruth.quality-continuity": "quality-assessment",
  "darktruth.quality-emotional-cost": "quality-assessment",
  "darktruth.quality-supernatural-rule": "quality-assessment",
  "darktruth.quality-opening": "quality-assessment",
  "darktruth.quality-ending": "quality-assessment",
  "darktruth.localize": "full-script",
  "darktruth.quality-localization": "quality-assessment",
  "darktruth.shorts-derive": "short-script",
  "darktruth.quality-shorts": "quality-assessment",
} as const satisfies Record<DarkTruthStoryExecutableTaskId, ArtifactKind>;

const dependencyPayloadTaskIds = {
  "darktruth.concept-select": [],
  "darktruth.episode-bible": ["darktruth.concept-select"],
  "darktruth.story-outline": ["darktruth.episode-bible"],
  "darktruth.rewrite-full": ["darktruth.story-outline"],
  "darktruth.quality-structure": ["darktruth.rewrite-full"],
  "darktruth.quality-horror": ["darktruth.rewrite-full"],
  "darktruth.quality-repetition": ["darktruth.rewrite-full"],
  "darktruth.quality-continuity": [
    "darktruth.rewrite-full",
    "darktruth.episode-bible",
  ],
  "darktruth.quality-emotional-cost": ["darktruth.rewrite-full"],
  "darktruth.quality-supernatural-rule": ["darktruth.rewrite-full"],
  "darktruth.quality-opening": ["darktruth.rewrite-full"],
  "darktruth.quality-ending": ["darktruth.rewrite-full"],
  "darktruth.localize": ["darktruth.rewrite-full", ...qualityTaskIds],
  "darktruth.quality-localization": ["darktruth.localize"],
  "darktruth.shorts-derive": [
    "darktruth.rewrite-full",
    "darktruth.localize",
    "darktruth.quality-localization",
  ],
  "darktruth.quality-shorts": ["darktruth.shorts-derive"],
} as const satisfies Record<
  DarkTruthStoryExecutableTaskId,
  readonly DarkTruthStoryExecutableTaskId[]
>;

export const canonicalDarkTruthStoryArtifactSchema = z
  .object({
    schemaVersion: z.literal(DARK_TRUTH_CANONICAL_STORY_ARTIFACT_VERSION),
    adapterVersion: z.literal(DARK_TRUTH_CANONICAL_STORY_ADAPTER_VERSION),
    taskId: z.enum(DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS),
    owner: z.literal("@mediaforge/story-localization"),
    identity: z
      .object({
        unitId: z.string().min(1),
        locale: z.string().min(2),
        variant: z.string().min(1),
      })
      .strict(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    dependencyFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
    validation: z
      .object({
        validatorId: z.string().min(1).max(160),
        validatorVersion: z.string().min(1).max(80),
        status: z.literal("passed"),
      })
      .strict(),
    payload: z.json(),
  })
  .strict();

export type CanonicalDarkTruthStoryArtifact = z.infer<
  typeof canonicalDarkTruthStoryArtifactSchema
>;

export interface DarkTruthProviderAuthorization {
  readonly configured: boolean;
  readonly operatorAuthorized: boolean;
  readonly configurationFingerprint: string;
}

export interface DarkTruthCanonicalStoryServiceInput {
  readonly taskId: DarkTruthStoryExecutableTaskId;
  readonly unitId: string;
  readonly locale: string;
  readonly variant: string;
  readonly dependencies: Readonly<
    Partial<Record<DarkTruthStoryExecutableTaskId, unknown>>
  >;
  readonly signal: AbortSignal;
}

export interface DarkTruthCanonicalStoryServiceResult {
  readonly payload: unknown;
  readonly validation: {
    readonly validatorId: string;
    readonly validatorVersion: string;
    readonly status: "passed";
  };
  readonly warnings?: readonly string[];
  readonly providerEvidence?: {
    readonly provider: string;
    readonly model?: string;
    readonly providerRequestId?: string;
  };
}

export interface DarkTruthCanonicalStoryService {
  /** `external` may dispatch only with explicit provider authorization. */
  readonly providerMode: "none" | "fake" | "external";
  execute(
    input: DarkTruthCanonicalStoryServiceInput
  ): Promise<DarkTruthCanonicalStoryServiceResult>;
}

export interface DarkTruthCanonicalStoryAdapterOptions {
  readonly workspaceRoot: string;
  readonly unitRoot: string;
  readonly unitId: string;
  readonly policyRevision: string;
  readonly store: WorkflowStore;
  readonly repository: ArtifactRepository;
  readonly services: Readonly<
    Record<DarkTruthStoryExecutableTaskId, DarkTruthCanonicalStoryService>
  >;
  readonly providerAuthorization?: DarkTruthProviderAuthorization;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

function assertActive(context: TaskExecutionContext): void {
  if (context.control.signal.aborted) {
    throw new WorkflowInterruptedError(
      "Dark Truth canonical story execution was cancelled."
    );
  }
  if (
    context.control.deadlineAt !== null &&
    Date.now() >= new Date(context.control.deadlineAt).getTime()
  ) {
    throw new WorkflowInterruptedError(
      "Dark Truth canonical story execution exceeded its deadline."
    );
  }
}

async function verifiedTaskArtifact(
  options: DarkTruthCanonicalStoryAdapterOptions,
  taskId: DarkTruthStoryExecutableTaskId
): Promise<CanonicalDarkTruthStoryArtifact> {
  const state = await options.store.readState();
  const task = state.tasks.find((candidate) => candidate.taskId === taskId);
  if (task?.status !== "succeeded" || !task.attemptId) {
    throw new Error(
      `Canonical dependency ${taskId} has no successful attempt.`
    );
  }
  const attempt = await options.store.readAttempt(task.attemptId);
  if (
    attempt.status !== "completed" ||
    attempt.result.status !== "succeeded" ||
    attempt.result.outputs.length !== 1
  ) {
    throw new Error(
      `Canonical dependency ${taskId} has ambiguous output evidence.`
    );
  }
  const manifest = attempt.result.outputs[0]!;
  const verified = await options.repository.verify(manifest.ref, {
    dependencyFingerprints: manifest.dependencyFingerprints,
  });
  if (
    verified.manifest.id !== manifest.id ||
    verified.manifest.checksumSha256 !== manifest.checksumSha256 ||
    manifest.producerTaskId !== taskId ||
    manifest.producerAttemptId !== task.attemptId
  ) {
    throw new Error(
      `Canonical dependency ${taskId} has forged artifact lineage.`
    );
  }
  const artifact = canonicalDarkTruthStoryArtifactSchema.parse(
    JSON.parse(
      await fs.readFile(verified.provenance.absolutePath, "utf8")
    ) as unknown
  );
  if (
    artifact.taskId !== taskId ||
    artifact.fingerprint !== attempt.fingerprint ||
    artifact.identity.unitId !== options.unitId
  ) {
    throw new Error(
      `Canonical dependency ${taskId} identity is stale or mismatched.`
    );
  }
  return artifact;
}

async function promote(
  options: DarkTruthCanonicalStoryAdapterOptions,
  context: TaskExecutionContext,
  taskId: DarkTruthStoryExecutableTaskId,
  serviceResult: DarkTruthCanonicalStoryServiceResult
): Promise<TaskExecutionResult> {
  const artifact = canonicalDarkTruthStoryArtifactSchema.parse({
    schemaVersion: DARK_TRUTH_CANONICAL_STORY_ARTIFACT_VERSION,
    adapterVersion: DARK_TRUTH_CANONICAL_STORY_ADAPTER_VERSION,
    taskId,
    owner: ownerByTask[taskId],
    identity: {
      unitId: context.unitId,
      locale: context.locale,
      variant: context.variant,
    },
    fingerprint: context.fingerprint,
    dependencyFingerprints: context.dependencyFingerprints,
    validation: serviceResult.validation,
    payload: serviceResult.payload,
  });
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  const ref = artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: context.unitId,
    profileId: context.profileId,
    locale: context.locale,
    variant: context.variant,
    kind: outputKindByTask[taskId],
    artifactKey: `${taskId.slice("darktruth.".length)}-${context.fingerprint.slice(0, 16)}`,
    format: "json",
    artifactRevision: context.fingerprint,
    workflowRevision: DARK_TRUTH_TASK_REGISTRY_VERSION,
    policyRevision: options.policyRevision,
  });
  const result = await options.repository.promote({
    ref,
    content,
    mediaType: "application/json",
    producerTaskId: taskId,
    producerTaskVersion: DARK_TRUTH_TASK_REGISTRY_VERSION,
    producerAttemptId: context.attemptId,
    validatorId: serviceResult.validation.validatorId,
    validatorVersion: serviceResult.validation.validatorVersion,
    dependencyFingerprints: context.dependencyFingerprints,
    replaceInvalidDestination: true,
    refreshManifestOnReuse: true,
    validate: (buffer) => {
      const parsed = canonicalDarkTruthStoryArtifactSchema.parse(
        JSON.parse(buffer.toString("utf8")) as unknown
      );
      if (
        parsed.taskId !== taskId ||
        parsed.fingerprint !== context.fingerprint ||
        !sameStrings(
          parsed.dependencyFingerprints,
          context.dependencyFingerprints
        )
      ) {
        throw new Error(`Canonical ${taskId} artifact validation failed.`);
      }
    },
  });
  if (result.dryRun) {
    throw new Error(
      `Canonical ${taskId} unexpectedly planned a dry-run write.`
    );
  }
  return {
    outputArtifacts: [result.artifact.manifest],
    warnings: [...(serviceResult.warnings ?? [])],
    telemetry: {
      cacheStatus: "miss",
      ...(serviceResult.providerEvidence?.provider
        ? { provider: serviceResult.providerEvidence.provider }
        : {}),
      ...(serviceResult.providerEvidence?.model
        ? { model: serviceResult.providerEvidence.model }
        : {}),
      ...(serviceResult.providerEvidence?.providerRequestId
        ? {
            providerRequestId: serviceResult.providerEvidence.providerRequestId,
          }
        : {}),
      revisions: {
        adapter: DARK_TRUTH_CANONICAL_STORY_ADAPTER_VERSION,
        policy: options.policyRevision,
        ...(options.providerAuthorization
          ? {
              providerConfiguration:
                options.providerAuthorization.configurationFingerprint,
            }
          : {}),
      },
    },
  };
}

export function createDarkTruthStoryTaskImplementations(
  options: DarkTruthCanonicalStoryAdapterOptions
): Readonly<Record<DarkTruthStoryExecutableTaskId, TaskImplementation>> {
  const expectedUnitRoot = path.resolve(options.workspaceRoot, options.unitId);
  if (path.resolve(options.unitRoot) !== expectedUnitRoot) {
    throw new Error(
      `Canonical Dark Truth unit root must be ${expectedUnitRoot}; received ${path.resolve(options.unitRoot)}.`
    );
  }
  const implementations = {} as Record<
    DarkTruthStoryExecutableTaskId,
    TaskImplementation
  >;
  for (const taskId of DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS) {
    const service = options.services[taskId];
    if (!service) {
      throw new Error(`Missing source-authoritative service for ${taskId}.`);
    }
    if (service.providerMode === "external") {
      if (!modelAssistedTaskIds.has(taskId)) {
        throw new Error(
          `Deterministic task ${taskId} cannot bind an external provider.`
        );
      }
      if (
        options.providerAuthorization?.configured !== true ||
        options.providerAuthorization.operatorAuthorized !== true
      ) {
        throw new Error(
          `External provider execution for ${taskId} requires explicit operator authorization.`
        );
      }
    }
    implementations[taskId] = async (context) => {
      assertActive(context);
      const dependencies: Partial<
        Record<DarkTruthStoryExecutableTaskId, unknown>
      > = {};
      for (const dependencyTaskId of dependencyPayloadTaskIds[taskId]) {
        dependencies[dependencyTaskId] = (
          await verifiedTaskArtifact(options, dependencyTaskId)
        ).payload;
      }
      const serviceResult = await service.execute({
        taskId,
        unitId: context.unitId,
        locale: context.locale,
        variant: context.variant,
        dependencies,
        signal: context.control.signal,
      });
      assertActive(context);
      if (
        service.providerMode === "external" &&
        !serviceResult.providerEvidence?.provider
      ) {
        throw new Error(
          `External provider service ${taskId} omitted provider evidence.`
        );
      }
      return promote(options, context, taskId, serviceResult);
    };
  }
  return implementations;
}

export async function verifyCanonicalDarkTruthStoryArtifact(
  repository: ArtifactRepository,
  manifest: ArtifactManifest
): Promise<CanonicalDarkTruthStoryArtifact> {
  const verified = await repository.verify(manifest.ref, {
    dependencyFingerprints: manifest.dependencyFingerprints,
  });
  if (
    verified.manifest.id !== manifest.id ||
    verified.manifest.checksumSha256 !== manifest.checksumSha256
  ) {
    throw new Error("Canonical Dark Truth artifact manifest is stale.");
  }
  return canonicalDarkTruthStoryArtifactSchema.parse(
    JSON.parse(
      await fs.readFile(verified.provenance.absolutePath, "utf8")
    ) as unknown
  );
}
