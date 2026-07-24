import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  artifactManifestSchema,
  artifactRefSchema,
  type ArtifactManifest,
  type ArtifactRef,
} from "@mediaforge/domain";
import {
  ARTIFACT_PATH_RESOLVER_VERSION,
  artifactManifestPath,
  assertContainedRegularFile,
  assertContainedWritablePath,
  assertLexicallyContained,
  hashFile,
  resolveArtifactPathSet,
  type ArtifactLayoutAdapter,
  type ArtifactPathSet,
} from "@mediaforge/shared";
import { z } from "zod";

export const ARTIFACT_REPOSITORY_VERSION =
  "mediaforge.artifact-repository.v1" as const;
export const ARTIFACT_MIGRATION_SCHEMA_VERSION =
  "mediaforge.artifact-migration.v1" as const;

export type ArtifactRepositoryErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_INVALID"
  | "ARTIFACT_AMBIGUOUS"
  | "ARTIFACT_CONFLICT"
  | "ARTIFACT_PATH_UNSAFE"
  | "MIGRATION_PLAN_STALE"
  | "MIGRATION_CONFIRMATION_REQUIRED"
  | "ROLLBACK_UNSAFE";

interface ArtifactMigrationHooks {
  readonly afterPromotion?: (args: {
    readonly plan: ArtifactMigrationPlan;
    readonly rollbackManifestPath: string;
  }) => void | Promise<void>;
}

export class ArtifactRepositoryError extends Error {
  public constructor(
    public readonly code: ArtifactRepositoryErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "ArtifactRepositoryError";
  }
}

export interface ArtifactProvenance {
  readonly repositoryVersion: typeof ARTIFACT_REPOSITORY_VERSION;
  readonly resolverVersion: typeof ARTIFACT_PATH_RESOLVER_VERSION;
  readonly source: "canonical" | "legacy";
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly manifestPath: string;
  readonly checksumSha256: string;
  readonly validation: "passed";
}

export interface VerifiedArtifact {
  readonly ref: ArtifactRef;
  readonly manifest: ArtifactManifest;
  readonly provenance: ArtifactProvenance;
  readonly equivalentCandidates: readonly string[];
}

export interface VerifyArtifactOptions {
  readonly dependencyFingerprints?: readonly string[];
}

export interface PromoteArtifactRequest {
  readonly ref: ArtifactRef;
  readonly content: Buffer | string;
  readonly mediaType: string;
  readonly producerTaskId: string;
  readonly producerTaskVersion: string;
  readonly producerAttemptId: string;
  readonly validatorId: string;
  readonly validatorVersion: string;
  readonly dependencyFingerprints: readonly string[];
  readonly validate: (content: Buffer) => void | Promise<void>;
  readonly replaceInvalidDestination?: boolean;
  readonly refreshManifestOnReuse?: boolean;
  readonly dryRun?: boolean;
}

export interface PlannedArtifactWrite {
  readonly operation: "write";
  readonly dryRun: true;
  readonly artifactPath: string;
  readonly manifestPath: string;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
}

export interface PromotedArtifactWrite {
  readonly operation: "write" | "reuse";
  readonly dryRun: false;
  readonly artifact: VerifiedArtifact;
}

const migrationPathSchema = z
  .object({
    absolutePath: z.string().min(1),
    relativePath: z.string().min(1),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    artifactSchemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
    provenance: z.enum(["canonical", "legacy"]),
    validation: z.literal("passed"),
  })
  .strict();

export const artifactMigrationPlanSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_MIGRATION_SCHEMA_VERSION),
    id: z.string().regex(/^migration-[a-f0-9]{24}$/u),
    ref: artifactRefSchema,
    source: migrationPathSchema.nullable(),
    destination: z
      .object({
        absolutePath: z.string().min(1),
        relativePath: z.string().min(1),
        expectedState: z.enum([
          "absent",
          "valid-same",
          "invalid",
          "ambiguous",
          "unknown",
        ]),
      })
      .strict(),
    operation: z.enum(["copy", "skip", "block"]),
    conflict: z.enum([
      "none",
      "not-found",
      "invalid",
      "ambiguous",
      "canonical-conflict",
    ]),
    rollbackOperation: z.enum(["delete-canonical", "none"]),
    downstreamInvalidations: z.array(z.string()),
    requiredApprovals: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();
export type ArtifactMigrationPlan = z.infer<typeof artifactMigrationPlanSchema>;

export const artifactRollbackManifestSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_MIGRATION_SCHEMA_VERSION),
    plan: artifactMigrationPlanSchema,
    appliedAt: z.iso.datetime({ offset: true }),
    canonicalManifestPath: z.string().min(1),
  })
  .strict();
export type ArtifactRollbackManifest = z.infer<
  typeof artifactRollbackManifestSchema
>;

interface Candidate {
  readonly source: "canonical" | "legacy";
  readonly absolutePath: string;
  readonly relativePath: string;
}

interface ValidCandidate extends Candidate {
  readonly manifestPath: string;
  readonly manifest: ArtifactManifest;
}

function sha256(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function refsEqual(left: ArtifactRef, right: ArtifactRef): boolean {
  return stableJson(left) === stableJson(right);
}

function sameFingerprints(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  return [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeFileDurably(
  filePath: string,
  content: Buffer
): Promise<void> {
  const handle = await fs.open(filePath, "wx");
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class ArtifactRepository {
  private readonly workspaceRoot: string;
  private readonly adapters: readonly ArtifactLayoutAdapter[] | undefined;
  private readonly now: () => Date;
  private readonly migrationHooks: ArtifactMigrationHooks;

  public constructor(args: {
    readonly workspaceRoot: string;
    readonly adapters?: readonly ArtifactLayoutAdapter[];
    readonly now?: () => Date;
    readonly migrationHooks?: ArtifactMigrationHooks;
  }) {
    this.workspaceRoot = path.resolve(args.workspaceRoot);
    this.adapters = args.adapters;
    this.now = args.now ?? (() => new Date());
    this.migrationHooks = args.migrationHooks ?? {};
  }

  public resolve(ref: ArtifactRef): ArtifactPathSet {
    try {
      return resolveArtifactPathSet({
        workspaceRoot: this.workspaceRoot,
        ref,
        ...(this.adapters ? { adapters: this.adapters } : {}),
      });
    } catch (error) {
      throw new ArtifactRepositoryError(
        "ARTIFACT_PATH_UNSAFE",
        error instanceof Error
          ? error.message
          : "Artifact path resolution failed.",
        {},
        error
      );
    }
  }

  public async verify(
    refInput: ArtifactRef,
    options: VerifyArtifactOptions = {}
  ): Promise<VerifiedArtifact> {
    const ref = artifactRefSchema.parse(refInput);
    const paths = this.resolve(ref);
    const candidates: Candidate[] = [
      {
        source: "canonical",
        absolutePath: paths.canonical,
        relativePath: paths.canonicalRelativePath,
      },
      ...paths.legacy.map((absolutePath, index) => ({
        source: "legacy" as const,
        absolutePath,
        relativePath: paths.legacyRelativePaths[index] as string,
      })),
    ];
    const valid: ValidCandidate[] = [];
    const invalid: Array<{ path: string; message: string }> = [];

    for (const candidate of candidates) {
      if (!(await pathExists(candidate.absolutePath))) {
        continue;
      }
      try {
        valid.push(
          await this.verifyCandidate(paths.unitRoot, ref, candidate, options)
        );
      } catch (error) {
        invalid.push({
          path: candidate.absolutePath,
          message: error instanceof Error ? error.message : String(error),
        });
        if (candidate.source === "canonical") {
          throw new ArtifactRepositoryError(
            "ARTIFACT_INVALID",
            `Canonical artifact is invalid: ${candidate.relativePath}`,
            { invalid },
            error
          );
        }
      }
    }

    if (valid.length === 0) {
      if (invalid.length > 0) {
        throw new ArtifactRepositoryError(
          "ARTIFACT_INVALID",
          "No valid artifact candidate was found.",
          { invalid }
        );
      }
      throw new ArtifactRepositoryError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${ref.kind} was not found for ${ref.unitId}.`,
        { candidates: candidates.map((candidate) => candidate.relativePath) }
      );
    }

    const checksums = new Set(
      valid.map((candidate) => candidate.manifest.checksumSha256)
    );
    if (checksums.size > 1) {
      throw new ArtifactRepositoryError(
        "ARTIFACT_AMBIGUOUS",
        "Multiple valid artifact candidates have different content.",
        {
          candidates: valid.map((candidate) => ({
            path: candidate.relativePath,
            checksumSha256: candidate.manifest.checksumSha256,
          })),
        }
      );
    }

    const selected =
      valid.find((candidate) => candidate.source === "canonical") ?? valid[0];
    if (!selected) {
      throw new ArtifactRepositoryError(
        "ARTIFACT_NOT_FOUND",
        "No artifact candidate could be selected."
      );
    }
    return {
      ref,
      manifest: selected.manifest,
      provenance: {
        repositoryVersion: ARTIFACT_REPOSITORY_VERSION,
        resolverVersion: ARTIFACT_PATH_RESOLVER_VERSION,
        source: selected.source,
        absolutePath: selected.absolutePath,
        relativePath: selected.relativePath,
        manifestPath: selected.manifestPath,
        checksumSha256: selected.manifest.checksumSha256,
        validation: "passed",
      },
      equivalentCandidates: valid
        .filter((candidate) => candidate !== selected)
        .map((candidate) => candidate.absolutePath),
    };
  }

  public async promote(
    request: PromoteArtifactRequest
  ): Promise<PlannedArtifactWrite | PromotedArtifactWrite> {
    const ref = artifactRefSchema.parse(request.ref);
    const paths = this.resolve(ref);
    const content = Buffer.isBuffer(request.content)
      ? request.content
      : Buffer.from(request.content, "utf8");
    await request.validate(content);
    const checksumSha256 = sha256(content);
    if (request.dryRun === true) {
      return {
        operation: "write",
        dryRun: true,
        artifactPath: paths.canonical,
        manifestPath: paths.canonicalManifest,
        checksumSha256,
        sizeBytes: content.byteLength,
      };
    }

    let replaceInvalidDestination = false;
    let refreshCanonicalManifest = false;
    const canonicalExists = await pathExists(paths.canonical);
    const canonicalManifestExists = await pathExists(paths.canonicalManifest);
    if (canonicalExists) {
      let existing: VerifiedArtifact | undefined;
      try {
        existing = await this.verify(ref);
      } catch (error) {
        if (
          request.replaceInvalidDestination === true &&
          error instanceof ArtifactRepositoryError &&
          error.code === "ARTIFACT_INVALID"
        ) {
          replaceInvalidDestination = true;
        } else {
          throw new ArtifactRepositoryError(
            "ARTIFACT_CONFLICT",
            "The canonical destination exists but is not a reusable valid artifact.",
            { destination: paths.canonicalRelativePath },
            error
          );
        }
      }
      if (existing && existing.manifest.checksumSha256 !== checksumSha256) {
        throw new ArtifactRepositoryError(
          "ARTIFACT_CONFLICT",
          "The canonical destination contains different valid content.",
          {
            destination: paths.canonicalRelativePath,
            existingChecksum: existing.manifest.checksumSha256,
            proposedChecksum: checksumSha256,
          }
        );
      }
      if (existing) {
        const lineageMatches =
          existing.manifest.mediaType === request.mediaType &&
          existing.manifest.producerTaskId === request.producerTaskId &&
          existing.manifest.producerTaskVersion ===
            request.producerTaskVersion &&
          existing.manifest.producerAttemptId === request.producerAttemptId &&
          existing.manifest.validation.validatorId === request.validatorId &&
          existing.manifest.validation.validatorVersion ===
            request.validatorVersion &&
          sameFingerprints(
            existing.manifest.dependencyFingerprints,
            request.dependencyFingerprints
          );
        if (request.refreshManifestOnReuse === true && !lineageMatches) {
          refreshCanonicalManifest = true;
        } else {
          return { operation: "reuse", dryRun: false, artifact: existing };
        }
      }
    } else if (canonicalManifestExists) {
      if (request.replaceInvalidDestination !== true) {
        throw new ArtifactRepositoryError(
          "ARTIFACT_CONFLICT",
          "The canonical manifest exists without a reusable artifact.",
          { destination: paths.canonicalManifestRelativePath }
        );
      }
      replaceInvalidDestination = true;
    }

    try {
      await assertContainedWritablePath(this.workspaceRoot, paths.canonical);
      await assertContainedWritablePath(
        this.workspaceRoot,
        paths.canonicalManifest
      );
    } catch (error) {
      throw new ArtifactRepositoryError(
        "ARTIFACT_PATH_UNSAFE",
        "Canonical artifact path failed containment or symlink validation.",
        { destination: paths.canonicalRelativePath },
        error
      );
    }
    await fs.mkdir(path.dirname(paths.canonical), { recursive: true });
    const unique = `${process.pid}.${crypto.randomUUID()}`;
    const temporaryArtifact = path.join(
      path.dirname(paths.canonical),
      `.${path.basename(paths.canonical)}.${unique}.tmp`
    );
    const temporaryManifest = path.join(
      path.dirname(paths.canonicalManifest),
      `.${path.basename(paths.canonicalManifest)}.${unique}.tmp`
    );
    const displacedArtifact = `${temporaryArtifact}.invalid`;
    const displacedManifest = `${temporaryManifest}.invalid`;
    const timestamp = this.now().toISOString();
    const manifest = artifactManifestSchema.parse({
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      id: `manifest-${sha256(`${stableJson(ref)}\u0000${checksumSha256}`).slice(0, 24)}`,
      ref,
      relativePath: paths.canonicalRelativePath,
      checksumSha256,
      sizeBytes: content.byteLength,
      mediaType: request.mediaType,
      producerTaskId: request.producerTaskId,
      producerTaskVersion: request.producerTaskVersion,
      producerAttemptId: request.producerAttemptId,
      producerSucceeded: true,
      validation: {
        status: "passed",
        validatorId: request.validatorId,
        validatorVersion: request.validatorVersion,
        validatedAt: timestamp,
      },
      dependencyFingerprints: request.dependencyFingerprints,
      createdAt: timestamp,
    });
    let artifactPromoted = false;
    let manifestPromoted = false;
    let artifactDisplaced = false;
    let manifestDisplaced = false;
    let replacementCommitted = false;
    try {
      await writeFileDurably(temporaryArtifact, content);
      await writeFileDurably(
        temporaryManifest,
        Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
      );
      if (refreshCanonicalManifest) {
        const current = await this.verify(ref);
        if (current.manifest.checksumSha256 !== checksumSha256) {
          throw new ArtifactRepositoryError(
            "ARTIFACT_CONFLICT",
            "The canonical destination changed during lineage refresh.",
            {
              destination: paths.canonicalRelativePath,
              existingChecksum: current.manifest.checksumSha256,
              proposedChecksum: checksumSha256,
            }
          );
        }
        await fs.rename(paths.canonicalManifest, displacedManifest);
        manifestDisplaced = true;
        await fs.rename(temporaryManifest, paths.canonicalManifest);
        manifestPromoted = true;
        replacementCommitted = true;
      } else if (replaceInvalidDestination) {
        if (await pathExists(paths.canonical)) {
          try {
            const current = await this.verify(ref);
            throw new ArtifactRepositoryError(
              "ARTIFACT_CONFLICT",
              "The canonical destination became valid during replacement.",
              {
                destination: paths.canonicalRelativePath,
                existingChecksum: current.manifest.checksumSha256,
                proposedChecksum: checksumSha256,
              }
            );
          } catch (error) {
            if (
              !(
                error instanceof ArtifactRepositoryError &&
                error.code === "ARTIFACT_INVALID"
              )
            ) {
              throw error;
            }
          }
          await fs.rename(paths.canonical, displacedArtifact);
          artifactDisplaced = true;
        }
        if (await pathExists(paths.canonicalManifest)) {
          await fs.rename(paths.canonicalManifest, displacedManifest);
          manifestDisplaced = true;
        }
      } else if (
        (await pathExists(paths.canonical)) ||
        (await pathExists(paths.canonicalManifest))
      ) {
        throw new ArtifactRepositoryError(
          "ARTIFACT_CONFLICT",
          "The canonical destination changed during promotion."
        );
      }
      if (!refreshCanonicalManifest) {
        await fs.rename(temporaryArtifact, paths.canonical);
        artifactPromoted = true;
        await fs.rename(temporaryManifest, paths.canonicalManifest);
        manifestPromoted = true;
        replacementCommitted = true;
      }
    } catch (error) {
      if (manifestPromoted) {
        await fs.unlink(paths.canonicalManifest).catch(() => undefined);
      }
      if (artifactPromoted) {
        await fs.unlink(paths.canonical).catch(() => undefined);
      }
      if (manifestDisplaced && !(await pathExists(paths.canonicalManifest))) {
        await fs
          .rename(displacedManifest, paths.canonicalManifest)
          .catch(() => undefined);
      }
      if (artifactDisplaced && !(await pathExists(paths.canonical))) {
        await fs
          .rename(displacedArtifact, paths.canonical)
          .catch(() => undefined);
      }
      throw error;
    } finally {
      await Promise.all([
        fs.unlink(temporaryArtifact).catch(() => undefined),
        fs.unlink(temporaryManifest).catch(() => undefined),
        ...(replacementCommitted
          ? [
              fs.unlink(displacedArtifact).catch(() => undefined),
              fs.unlink(displacedManifest).catch(() => undefined),
            ]
          : []),
      ]);
    }
    const artifact = await this.verify(ref, {
      dependencyFingerprints: request.dependencyFingerprints,
    });
    return { operation: "write", dryRun: false, artifact };
  }

  public async planMigration(
    refInput: ArtifactRef
  ): Promise<ArtifactMigrationPlan> {
    const ref = artifactRefSchema.parse(refInput);
    const paths = this.resolve(ref);
    let artifact: VerifiedArtifact;
    try {
      artifact = await this.verify(ref);
    } catch (error) {
      if (!(error instanceof ArtifactRepositoryError)) {
        throw error;
      }
      const conflict =
        error.code === "ARTIFACT_NOT_FOUND"
          ? "not-found"
          : error.code === "ARTIFACT_AMBIGUOUS"
            ? "ambiguous"
            : error.code === "ARTIFACT_INVALID"
              ? "invalid"
              : "canonical-conflict";
      const expectedState =
        conflict === "ambiguous"
          ? "ambiguous"
          : conflict === "invalid"
            ? "invalid"
            : "unknown";
      const identity = sha256(
        stableJson({
          ref,
          destination: paths.canonicalRelativePath,
          operation: "block",
          conflict,
          details: error.details,
        })
      ).slice(0, 24);
      return artifactMigrationPlanSchema.parse({
        schemaVersion: ARTIFACT_MIGRATION_SCHEMA_VERSION,
        id: `migration-${identity}`,
        ref,
        source: null,
        destination: {
          absolutePath: paths.canonical,
          relativePath: paths.canonicalRelativePath,
          expectedState,
        },
        operation: "block",
        conflict,
        rollbackOperation: "none",
        downstreamInvalidations: [],
        requiredApprovals: ["operator-conflict-resolution"],
        warnings: [error.message],
      });
    }
    const operation = artifact.provenance.source === "legacy" ? "copy" : "skip";
    const source = {
      absolutePath: artifact.provenance.absolutePath,
      relativePath: artifact.provenance.relativePath,
      checksumSha256: artifact.provenance.checksumSha256,
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      provenance: artifact.provenance.source,
      validation: "passed" as const,
    };
    const identity = sha256(
      stableJson({
        ref,
        source,
        destination: paths.canonicalRelativePath,
        operation,
      })
    ).slice(0, 24);
    return artifactMigrationPlanSchema.parse({
      schemaVersion: ARTIFACT_MIGRATION_SCHEMA_VERSION,
      id: `migration-${identity}`,
      ref,
      source,
      destination: {
        absolutePath: paths.canonical,
        relativePath: paths.canonicalRelativePath,
        expectedState: operation === "copy" ? "absent" : "valid-same",
      },
      operation,
      conflict: "none",
      rollbackOperation: operation === "copy" ? "delete-canonical" : "none",
      downstreamInvalidations: [],
      requiredApprovals: [],
      warnings:
        operation === "copy"
          ? ["The legacy source remains in place after migration."]
          : [],
    });
  }

  public async applyMigration(args: {
    readonly plan: ArtifactMigrationPlan;
    readonly confirmationPlanId: string;
    readonly validate?: (content: Buffer) => void | Promise<void>;
  }): Promise<{
    readonly operation: "copy" | "skip";
    readonly artifact: VerifiedArtifact;
    readonly rollbackManifestPath?: string;
  }> {
    const plan = artifactMigrationPlanSchema.parse(args.plan);
    if (args.confirmationPlanId !== plan.id) {
      throw new ArtifactRepositoryError(
        "MIGRATION_CONFIRMATION_REQUIRED",
        "Migration requires the exact current plan ID."
      );
    }
    if (plan.operation === "block") {
      throw new ArtifactRepositoryError(
        "ARTIFACT_CONFLICT",
        `Migration plan is blocked: ${plan.conflict}.`,
        { warnings: plan.warnings }
      );
    }
    const currentPlan = await this.planMigration(plan.ref);
    if (stableJson(currentPlan) !== stableJson(plan)) {
      throw new ArtifactRepositoryError(
        "MIGRATION_PLAN_STALE",
        "Artifact migration inputs changed after planning.",
        { expectedPlanId: plan.id, currentPlanId: currentPlan.id }
      );
    }
    if (plan.operation === "skip") {
      const artifact = await this.verify(plan.ref);
      await this.appendMigrationEvent(plan, "migration-skipped", {
        checksumSha256: artifact.manifest.checksumSha256,
      });
      return { operation: "skip", artifact };
    }
    if (!plan.source) {
      throw new ArtifactRepositoryError(
        "MIGRATION_PLAN_STALE",
        "Copy migration is missing its verified source."
      );
    }
    const sourceArtifact = await this.verify(plan.ref);
    if (sourceArtifact.provenance.source !== "legacy") {
      throw new ArtifactRepositoryError(
        "MIGRATION_PLAN_STALE",
        "The migration source is no longer the selected legacy artifact."
      );
    }
    const content = await fs.readFile(
      await assertContainedRegularFile(
        this.resolve(plan.ref).unitRoot,
        sourceArtifact.provenance.absolutePath
      )
    );
    if (sha256(content) !== plan.source.checksumSha256) {
      throw new ArtifactRepositoryError(
        "MIGRATION_PLAN_STALE",
        "Migration source hash changed immediately before promotion."
      );
    }
    const paths = this.resolve(plan.ref);
    const rollbackManifestPath = path.join(
      paths.unitRoot,
      "state",
      "artifact-migrations",
      `${plan.id}.rollback.json`
    );
    await assertContainedWritablePath(this.workspaceRoot, rollbackManifestPath);
    await fs.mkdir(path.dirname(rollbackManifestPath), { recursive: true });
    const rollbackManifest = artifactRollbackManifestSchema.parse({
      schemaVersion: ARTIFACT_MIGRATION_SCHEMA_VERSION,
      plan,
      appliedAt: this.now().toISOString(),
      canonicalManifestPath: paths.canonicalManifest,
    });
    const temporaryRollback = `${rollbackManifestPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFileDurably(
        temporaryRollback,
        Buffer.from(`${JSON.stringify(rollbackManifest, null, 2)}\n`, "utf8")
      );
      await fs.rename(temporaryRollback, rollbackManifestPath);
    } finally {
      await fs.unlink(temporaryRollback).catch(() => undefined);
    }
    let promoted: PromotedArtifactWrite;
    try {
      const promotion = await this.promote({
        ref: plan.ref,
        content,
        mediaType: sourceArtifact.manifest.mediaType,
        producerTaskId: sourceArtifact.manifest.producerTaskId,
        producerTaskVersion: sourceArtifact.manifest.producerTaskVersion,
        producerAttemptId: sourceArtifact.manifest.producerAttemptId,
        validatorId: sourceArtifact.manifest.validation.validatorId,
        validatorVersion: sourceArtifact.manifest.validation.validatorVersion,
        dependencyFingerprints: sourceArtifact.manifest.dependencyFingerprints,
        validate: args.validate ?? (() => undefined),
      });
      if (promotion.dryRun) {
        throw new ArtifactRepositoryError(
          "MIGRATION_PLAN_STALE",
          "Migration unexpectedly produced a dry-run result."
        );
      }
      promoted = promotion;
      await this.migrationHooks.afterPromotion?.({
        plan,
        rollbackManifestPath,
      });
    } catch (error) {
      const destinationExists = await pathExists(paths.canonical);
      if (destinationExists) {
        await this.appendMigrationEvent(plan, "migration-interrupted", {
          rollbackManifestPath,
          message: error instanceof Error ? error.message : String(error),
        });
        throw new ArtifactRepositoryError(
          "MIGRATION_PLAN_STALE",
          "Migration was interrupted after promotion; rollback evidence was preserved.",
          { rollbackManifestPath },
          error
        );
      }
      await fs.unlink(rollbackManifestPath).catch(() => undefined);
      throw error;
    }
    await this.appendMigrationEvent(plan, "migration-applied", {
      rollbackManifestPath,
      checksumSha256: promoted.artifact.manifest.checksumSha256,
    });
    return {
      operation: "copy",
      artifact: promoted.artifact,
      rollbackManifestPath,
    };
  }

  public async rollbackMigration(rollbackManifestPath: string): Promise<void> {
    const containedManifest = await assertContainedRegularFile(
      this.workspaceRoot,
      assertLexicallyContained(this.workspaceRoot, rollbackManifestPath)
    );
    const rollback = artifactRollbackManifestSchema.parse(
      JSON.parse(await fs.readFile(containedManifest, "utf8")) as unknown
    );
    if (rollback.plan.rollbackOperation !== "delete-canonical") {
      return;
    }
    const paths = this.resolve(rollback.plan.ref);
    const source = rollback.plan.source;
    if (
      !source ||
      paths.canonical !== rollback.plan.destination.absolutePath ||
      paths.canonicalManifest !== rollback.canonicalManifestPath
    ) {
      throw new ArtifactRepositoryError(
        "ROLLBACK_UNSAFE",
        "Rollback paths no longer match the canonical resolver."
      );
    }
    const [canonicalHash, sourceHash] = await Promise.all([
      hashFile(
        await assertContainedRegularFile(paths.unitRoot, paths.canonical)
      ),
      hashFile(
        await assertContainedRegularFile(paths.unitRoot, source.absolutePath)
      ),
    ]);
    if (
      canonicalHash !== source.checksumSha256 ||
      sourceHash !== source.checksumSha256
    ) {
      throw new ArtifactRepositoryError(
        "ROLLBACK_UNSAFE",
        "Rollback hashes changed; refusing to remove the canonical artifact."
      );
    }
    const verified = await this.verify(rollback.plan.ref);
    if (
      verified.provenance.source !== "canonical" ||
      verified.manifest.checksumSha256 !== source.checksumSha256
    ) {
      throw new ArtifactRepositoryError(
        "ROLLBACK_UNSAFE",
        "Rollback manifest does not match the current canonical artifact manifest."
      );
    }
    await fs.unlink(paths.canonicalManifest);
    await fs.unlink(paths.canonical);
    await this.appendMigrationEvent(rollback.plan, "migration-rolled-back", {
      rollbackManifestPath: containedManifest,
      checksumSha256: source.checksumSha256,
    });
  }

  private async appendMigrationEvent(
    plan: ArtifactMigrationPlan,
    eventType:
      | "migration-applied"
      | "migration-interrupted"
      | "migration-rolled-back"
      | "migration-skipped",
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    const paths = this.resolve(plan.ref);
    const eventsPath = path.join(
      paths.unitRoot,
      "state",
      "artifact-migrations",
      "events.jsonl"
    );
    await assertContainedWritablePath(this.workspaceRoot, eventsPath);
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    const handle = await fs.open(eventsPath, "a");
    try {
      await handle.writeFile(
        `${JSON.stringify({
          schemaVersion: ARTIFACT_MIGRATION_SCHEMA_VERSION,
          eventId: `migration-event-${sha256(
            stableJson({
              planId: plan.id,
              eventType,
              occurredAt: this.now().toISOString(),
              details,
            })
          ).slice(0, 24)}`,
          planId: plan.id,
          eventType,
          occurredAt: this.now().toISOString(),
          details,
        })}\n`,
        "utf8"
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async verifyCandidate(
    unitRoot: string,
    ref: ArtifactRef,
    candidate: Candidate,
    options: VerifyArtifactOptions
  ): Promise<ValidCandidate> {
    await assertContainedRegularFile(unitRoot, candidate.absolutePath);
    const manifestPath = artifactManifestPath(candidate.absolutePath);
    await assertContainedRegularFile(unitRoot, manifestPath);
    const manifest = artifactManifestSchema.parse(
      JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
    );
    if (!refsEqual(manifest.ref, ref)) {
      throw new Error(
        "Artifact manifest reference does not match the request."
      );
    }
    if (manifest.relativePath !== candidate.relativePath) {
      throw new Error(
        "Artifact manifest path does not match its candidate path."
      );
    }
    const stat = await fs.stat(candidate.absolutePath);
    if (stat.size !== manifest.sizeBytes) {
      throw new Error("Artifact size does not match its manifest.");
    }
    const checksum = await hashFile(candidate.absolutePath);
    if (checksum !== manifest.checksumSha256) {
      throw new Error("Artifact checksum does not match its manifest.");
    }
    if (
      options.dependencyFingerprints &&
      !sameFingerprints(
        manifest.dependencyFingerprints,
        options.dependencyFingerprints
      )
    ) {
      throw new Error("Artifact dependencies are stale.");
    }
    return { ...candidate, manifestPath, manifest };
  }
}
