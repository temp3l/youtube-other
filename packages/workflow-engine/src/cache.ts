import crypto from "node:crypto";

import {
  artifactManifestSchema,
  taskFingerprintSchema,
  taskIdSchema,
  type ArtifactManifest,
  type TaskFingerprint,
  type TaskId,
} from "@mediaforge/domain";
import { z } from "zod";

import type { WorkflowAttemptRecord } from "./workflow-store.js";

export const CACHE_ENGINE_VERSION = "mediaforge.cache.v1" as const;
export const CACHE_DECISION_SCHEMA_VERSION =
  "mediaforge.cache-decision.v1" as const;

export type CacheFamily =
  | "prompt"
  | "narration"
  | "story"
  | "image"
  | "render"
  | "mathematics";

/** Versions proved by the current subsystem cache/manifest schemas. */
export const LEGACY_CACHE_IDENTITY_VERSIONS = {
  prompt: ["prompt-cache-key-parts.v1"],
  narration: ["narration-chunk-cache-v1"],
  story: ["story-localization-cache-entry-v3"],
  image: ["image-result-cache-v1"],
  render: ["derived-shot-cache-v1", "educational-renderer-cache-v1"],
  mathematics: ["math-workflow.v2"],
} as const satisfies Record<CacheFamily, readonly string[]>;

export type FingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly FingerprintValue[]
  | { readonly [key: string]: FingerprintValue };

export interface TaskFingerprintMaterial {
  readonly configuration?: unknown;
  readonly inputArtifacts?: readonly ArtifactManifest[];
  readonly prompt?: unknown;
  readonly schemas?: unknown;
  readonly profile?: unknown;
  readonly provider?: unknown;
  readonly model?: unknown;
  readonly parameters?: unknown;
  readonly tools?: unknown;
  readonly renderer?: unknown;
  readonly bibleRevision?: string;
  readonly referenceSetRevision?: string;
  readonly curriculumRevision?: string;
  readonly visualStyleRevision?: string;
  readonly additional?: unknown;
}

export interface BuildTaskFingerprintInput {
  readonly workflowId: string;
  readonly workflowRevision: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly unitId: string;
  readonly profileId: string;
  readonly locale: string;
  readonly variant: string;
  readonly dependencyFingerprints?: readonly string[];
  readonly material?: TaskFingerprintMaterial;
}

export type CacheMissReason =
  | "cache-disabled"
  | "explicitly-invalidated"
  | "no-successful-attempt"
  | "fingerprint-mismatch"
  | "output-manifest-missing"
  | "output-manifest-invalid"
  | "dependency-fingerprint-mismatch"
  | "legacy-identity-unknown"
  | "legacy-fingerprint-mismatch";

export interface CacheDecision {
  readonly schemaVersion: typeof CACHE_DECISION_SCHEMA_VERSION;
  readonly taskId: TaskId;
  readonly fingerprint: TaskFingerprint;
  readonly status: "hit" | "miss" | "disabled";
  readonly reason: "validated-attempt" | "validated-legacy" | CacheMissReason;
  readonly matchedAttemptId?: string | undefined;
  readonly outputManifestIds: readonly string[];
  readonly dependencyFingerprints: readonly string[];
  readonly evidence: readonly string[];
}

export interface LegacyCacheCandidate {
  readonly identityVersion?: string;
  readonly fingerprint?: string;
  readonly successful: boolean;
  readonly outputManifests: readonly unknown[];
  readonly evidence: string;
}

export interface LegacyCacheAdapter {
  readonly family: CacheFamily;
  readonly supportedIdentityVersions: ReadonlySet<string>;
  readonly inspect: (input: {
    readonly taskId: TaskId;
    readonly fingerprint: TaskFingerprint;
  }) =>
    | readonly LegacyCacheCandidate[]
    | Promise<readonly LegacyCacheCandidate[]>;
}

export interface CachePruneEntry {
  readonly family: "canonical-attempt" | CacheFamily;
  readonly key: string;
  readonly status: "hit" | "miss" | "stale" | "invalid" | "unknown";
  readonly locked?: boolean;
}

export interface CachePrunePlan {
  readonly dryRun: true;
  readonly removable: readonly CachePruneEntry[];
  readonly protected: readonly {
    readonly entry: CachePruneEntry;
    readonly reason: string;
  }[];
}

const sha256Pattern = /^[a-f0-9]{64}$/u;

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      "Fingerprint inputs cannot contain non-finite numbers."
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

/** Normalize JSON-like fingerprint input and fail closed on lossy values. */
export function normalizeFingerprintValue(
  value: unknown,
  seen = new Set<object>()
): FingerprintValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return normalizeNumber(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFingerprintValue(item, seen));
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `Fingerprint inputs cannot contain values of type ${typeof value}.`
    );
  }
  if (seen.has(value)) {
    throw new TypeError("Fingerprint inputs cannot contain cycles.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Fingerprint inputs must contain plain JSON objects.");
  }
  seen.add(value);
  try {
    const normalized: Record<string, FingerprintValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) {
        throw new TypeError(
          `Fingerprint input ${key} is undefined; use null or omit the key.`
        );
      }
      normalized[key] = normalizeFingerprintValue(item, seen);
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function stableFingerprintJson(value: unknown): string {
  return JSON.stringify(normalizeFingerprintValue(value));
}

function normalizedArtifact(manifest: ArtifactManifest): FingerprintValue {
  return normalizeFingerprintValue({
    id: manifest.id,
    ref: manifest.ref,
    checksumSha256: manifest.checksumSha256,
    producerTaskId: manifest.producerTaskId,
    producerTaskVersion: manifest.producerTaskVersion,
    dependencyFingerprints: [...manifest.dependencyFingerprints].sort(),
    validation: {
      status: manifest.validation.status,
      validatorId: manifest.validation.validatorId,
      validatorVersion: manifest.validation.validatorVersion,
    },
  });
}

export function buildTaskFingerprint(
  input: BuildTaskFingerprintInput
): TaskFingerprint {
  const material = input.material ?? {};
  const inputArtifacts = (material.inputArtifacts ?? [])
    .map((item) => artifactManifestSchema.parse(item))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(normalizedArtifact);
  const normalized = normalizeFingerprintValue({
    cacheVersion: CACHE_ENGINE_VERSION,
    workflow: {
      id: input.workflowId,
      revision: input.workflowRevision,
    },
    task: { id: taskIdSchema.parse(input.taskId), version: input.taskVersion },
    identity: {
      unitId: input.unitId,
      profileId: input.profileId,
      locale: input.locale,
      variant: input.variant,
    },
    dependencyFingerprints: [...(input.dependencyFingerprints ?? [])].sort(),
    configuration: material.configuration ?? null,
    inputArtifacts,
    prompt: material.prompt ?? null,
    schemas: material.schemas ?? null,
    profile: material.profile ?? null,
    provider: material.provider ?? null,
    model: material.model ?? null,
    parameters: material.parameters ?? null,
    tools: material.tools ?? null,
    renderer: material.renderer ?? null,
    revisions: {
      bible: material.bibleRevision ?? null,
      referenceSet: material.referenceSetRevision ?? null,
      curriculum: material.curriculumRevision ?? null,
      visualStyle: material.visualStyleRevision ?? null,
    },
    additional: material.additional ?? null,
  });
  return taskFingerprintSchema.parse(
    crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

function miss(
  taskId: TaskId,
  fingerprint: TaskFingerprint,
  reason: CacheMissReason,
  dependencyFingerprints: readonly string[],
  evidence: readonly string[]
): CacheDecision {
  return {
    schemaVersion: CACHE_DECISION_SCHEMA_VERSION,
    taskId,
    fingerprint,
    status: reason === "cache-disabled" ? "disabled" : "miss",
    reason,
    outputManifestIds: [],
    dependencyFingerprints: [...dependencyFingerprints].sort(),
    evidence,
  };
}

async function validateManifests(input: {
  readonly manifests: readonly unknown[];
  readonly taskId: TaskId;
  readonly taskVersion: string;
  readonly attemptId?: string;
  readonly outputsRequired: boolean;
  readonly expectedDependencyFingerprints: readonly string[];
  readonly verifyManifest: (
    manifest: ArtifactManifest
  ) => boolean | Promise<boolean>;
}): Promise<
  | { readonly valid: true; readonly manifests: readonly ArtifactManifest[] }
  | {
      readonly valid: false;
      readonly reason: CacheMissReason;
      readonly evidence: string;
    }
> {
  if (input.outputsRequired && input.manifests.length === 0) {
    return {
      valid: false,
      reason: "output-manifest-missing",
      evidence: "The successful record has no output manifests.",
    };
  }
  const manifests: ArtifactManifest[] = [];
  for (const raw of input.manifests) {
    const parsed = artifactManifestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        valid: false,
        reason: "output-manifest-invalid",
        evidence: "An output manifest failed schema validation.",
      };
    }
    const manifest = parsed.data;
    if (
      manifest.producerTaskId !== input.taskId ||
      manifest.producerTaskVersion !== input.taskVersion ||
      (input.attemptId !== undefined &&
        manifest.producerAttemptId !== input.attemptId)
    ) {
      return {
        valid: false,
        reason: "output-manifest-invalid",
        evidence:
          "An output manifest does not belong to the matching task attempt.",
      };
    }
    if (
      !sameStrings(
        manifest.dependencyFingerprints,
        input.expectedDependencyFingerprints
      )
    ) {
      return {
        valid: false,
        reason: "dependency-fingerprint-mismatch",
        evidence: "An output manifest names stale dependency fingerprints.",
      };
    }
    if (!(await input.verifyManifest(manifest))) {
      return {
        valid: false,
        reason: "output-manifest-invalid",
        evidence: `Output manifest ${manifest.id} did not verify against its artifact.`,
      };
    }
    manifests.push(manifest);
  }
  return { valid: true, manifests };
}

export async function evaluateTaskCache(input: {
  readonly taskId: string;
  readonly taskVersion: string;
  readonly policy: "disabled" | "fingerprint";
  readonly fingerprint: string;
  readonly attempts: readonly WorkflowAttemptRecord[];
  readonly outputsRequired: boolean;
  readonly expectedDependencyFingerprints?: readonly string[];
  readonly explicitlyInvalidated?: boolean;
  readonly verifyManifest: (
    manifest: ArtifactManifest
  ) => boolean | Promise<boolean>;
  readonly legacyAdapters?: readonly LegacyCacheAdapter[];
}): Promise<CacheDecision> {
  const taskId = taskIdSchema.parse(input.taskId);
  const fingerprint = taskFingerprintSchema.parse(input.fingerprint);
  const dependencies = input.expectedDependencyFingerprints ?? [];
  if (input.policy === "disabled") {
    return miss(taskId, fingerprint, "cache-disabled", dependencies, [
      "The task policy disables cache reuse.",
    ]);
  }
  if (input.explicitlyInvalidated) {
    return miss(taskId, fingerprint, "explicitly-invalidated", dependencies, [
      "The task has an explicit invalidation event after its prior success.",
    ]);
  }
  const successful = input.attempts
    .filter(
      (attempt) =>
        attempt.status === "completed" && attempt.result.status === "succeeded"
    )
    .reverse();
  const matching = successful.find(
    (attempt) => attempt.fingerprint === fingerprint
  );
  if (
    matching?.status === "completed" &&
    matching.result.status === "succeeded"
  ) {
    const checked = await validateManifests({
      manifests: matching.result.outputs,
      taskId,
      taskVersion: input.taskVersion,
      attemptId: matching.id,
      outputsRequired: input.outputsRequired,
      expectedDependencyFingerprints: dependencies,
      verifyManifest: input.verifyManifest,
    });
    if (checked.valid) {
      return {
        schemaVersion: CACHE_DECISION_SCHEMA_VERSION,
        taskId,
        fingerprint,
        status: "hit",
        reason: "validated-attempt",
        matchedAttemptId: matching.id,
        outputManifestIds: checked.manifests.map((manifest) => manifest.id),
        dependencyFingerprints: [...dependencies].sort(),
        evidence: [
          `Successful attempt ${matching.id} matched the fingerprint.`,
          "Every output manifest and artifact passed validation.",
        ],
      };
    }
    return miss(taskId, fingerprint, checked.reason, dependencies, [
      checked.evidence,
    ]);
  }

  let unknownLegacyIdentity = false;
  let legacyFingerprintMismatch = false;
  for (const adapter of input.legacyAdapters ?? []) {
    const candidates = await adapter.inspect({ taskId, fingerprint });
    for (const candidate of candidates) {
      if (
        !candidate.identityVersion ||
        !adapter.supportedIdentityVersions.has(candidate.identityVersion)
      ) {
        unknownLegacyIdentity = true;
        continue;
      }
      if (
        !candidate.fingerprint ||
        !sha256Pattern.test(candidate.fingerprint)
      ) {
        unknownLegacyIdentity = true;
        continue;
      }
      if (candidate.fingerprint !== fingerprint) {
        legacyFingerprintMismatch = true;
        continue;
      }
      if (!candidate.successful) continue;
      const checked = await validateManifests({
        manifests: candidate.outputManifests,
        taskId,
        taskVersion: input.taskVersion,
        outputsRequired: input.outputsRequired,
        expectedDependencyFingerprints: dependencies,
        verifyManifest: input.verifyManifest,
      });
      if (!checked.valid) {
        return miss(taskId, fingerprint, checked.reason, dependencies, [
          `${adapter.family} legacy candidate: ${checked.evidence}`,
        ]);
      }
      return {
        schemaVersion: CACHE_DECISION_SCHEMA_VERSION,
        taskId,
        fingerprint,
        status: "hit",
        reason: "validated-legacy",
        outputManifestIds: checked.manifests.map((manifest) => manifest.id),
        dependencyFingerprints: [...dependencies].sort(),
        evidence: [
          candidate.evidence,
          "The versioned legacy identity is known.",
        ],
      };
    }
  }
  if (unknownLegacyIdentity) {
    return miss(taskId, fingerprint, "legacy-identity-unknown", dependencies, [
      "A legacy record lacked a supported, versioned identity.",
    ]);
  }
  if (successful.length > 0 || legacyFingerprintMismatch) {
    return miss(taskId, fingerprint, "fingerprint-mismatch", dependencies, [
      "Prior successful evidence used a different material-input fingerprint.",
    ]);
  }
  return miss(taskId, fingerprint, "no-successful-attempt", dependencies, [
    "No successful record exists for this task.",
  ]);
}

export function createVersionedLegacyCacheAdapter(input: {
  readonly family: CacheFamily;
  readonly supportedIdentityVersions: readonly string[];
  readonly inspect: LegacyCacheAdapter["inspect"];
}): LegacyCacheAdapter {
  if (input.supportedIdentityVersions.length === 0) {
    throw new TypeError(
      "A legacy cache adapter must name a supported identity version."
    );
  }
  return {
    family: input.family,
    supportedIdentityVersions: new Set(input.supportedIdentityVersions),
    inspect: input.inspect,
  };
}

export function createSubsystemLegacyCacheAdapter(input: {
  readonly family: CacheFamily;
  readonly inspect: LegacyCacheAdapter["inspect"];
}): LegacyCacheAdapter {
  return createVersionedLegacyCacheAdapter({
    family: input.family,
    supportedIdentityVersions: LEGACY_CACHE_IDENTITY_VERSIONS[input.family],
    inspect: input.inspect,
  });
}

/** Canonical attempt history is immutable; only unlocked stale/invalid adapters prune. */
export function planCachePrune(
  entries: readonly CachePruneEntry[]
): CachePrunePlan {
  const removable: CachePruneEntry[] = [];
  const protectedEntries: CachePrunePlan["protected"][number][] = [];
  for (const entry of [...entries].sort((left, right) =>
    `${left.family}:${left.key}`.localeCompare(`${right.family}:${right.key}`)
  )) {
    let reason: string | null = null;
    if (entry.family === "canonical-attempt") {
      reason = "Canonical attempt history is append-only evidence.";
    } else if (entry.locked) {
      reason = "The cache entry has an active lock.";
    } else if (entry.status !== "stale" && entry.status !== "invalid") {
      reason = "Only stale or invalid legacy entries are eligible.";
    }
    if (reason) protectedEntries.push({ entry, reason });
    else removable.push(entry);
  }
  return { dryRun: true, removable, protected: protectedEntries };
}

export const cacheDecisionSchema = z
  .object({
    schemaVersion: z.literal(CACHE_DECISION_SCHEMA_VERSION),
    taskId: taskIdSchema,
    fingerprint: taskFingerprintSchema,
    status: z.enum(["hit", "miss", "disabled"]),
    reason: z.enum([
      "validated-attempt",
      "validated-legacy",
      "cache-disabled",
      "explicitly-invalidated",
      "no-successful-attempt",
      "fingerprint-mismatch",
      "output-manifest-missing",
      "output-manifest-invalid",
      "dependency-fingerprint-mismatch",
      "legacy-identity-unknown",
      "legacy-fingerprint-mismatch",
    ]),
    matchedAttemptId: z.string().min(1).optional(),
    outputManifestIds: z.array(z.string().min(1)),
    dependencyFingerprints: z.array(z.string().regex(sha256Pattern)),
    evidence: z.array(z.string().min(1)),
  })
  .strict();
