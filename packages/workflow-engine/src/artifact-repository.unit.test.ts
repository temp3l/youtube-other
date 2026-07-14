import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  artifactManifestSchema,
  artifactRefSchema,
  type ArtifactRef,
} from "@mediaforge/domain";
import { artifactManifestPath } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";

import {
  ArtifactRepository,
  ArtifactRepositoryError,
} from "./artifact-repository.js";

const fixedNow = "2026-07-14T12:00:00.000Z";

function ref(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: "episode-001",
    profileId: "dark-truth",
    locale: "en",
    variant: "full",
    kind: "full-script",
    artifactRevision: "revision-1",
    workflowRevision: "workflow-1",
    policyRevision: "bible-1",
    ...overrides,
  });
}

function hash(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function tempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "artifact-repository-"));
}

async function writeCandidate(args: {
  workspace: string;
  ref: ArtifactRef;
  absolutePath: string;
  relativePath: string;
  content: string;
  checksumOverride?: string;
}): Promise<void> {
  const content = Buffer.from(args.content, "utf8");
  await fs.mkdir(path.dirname(args.absolutePath), { recursive: true });
  await fs.writeFile(args.absolutePath, content);
  const manifest = artifactManifestSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    id: `manifest-${hash(`${args.relativePath}:${args.content}`).slice(0, 24)}`,
    ref: args.ref,
    relativePath: args.relativePath,
    checksumSha256: args.checksumOverride ?? hash(content),
    sizeBytes: content.byteLength,
    mediaType: "text/markdown",
    producerTaskId: "story.rewrite",
    producerTaskVersion: "1.0.0",
    producerAttemptId: "attempt-001",
    producerSucceeded: true,
    validation: {
      status: "passed",
      validatorId: "story.validator",
      validatorVersion: "1.0.0",
      validatedAt: fixedNow,
    },
    dependencyFingerprints: ["d".repeat(64)],
    createdAt: fixedNow,
  });
  await fs.writeFile(
    artifactManifestPath(args.absolutePath),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function promoteRequest(artifactRef: ArtifactRef, content = "canonical story") {
  return {
    ref: artifactRef,
    content,
    mediaType: "text/markdown",
    producerTaskId: "story.rewrite",
    producerTaskVersion: "1.0.0",
    producerAttemptId: "attempt-001",
    validatorId: "story.validator",
    validatorVersion: "1.0.0",
    dependencyFingerprints: ["d".repeat(64)],
    validate: (value: Buffer) => {
      if (value.byteLength === 0) throw new Error("empty artifact");
    },
  } as const;
}

describe("canonical artifact repository", () => {
  it("promotes atomically and verifies manifest, checksum, and dependencies", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({
      workspaceRoot: workspace,
      now: () => new Date(fixedNow),
    });
    const artifactRef = ref();

    const promoted = await repository.promote(promoteRequest(artifactRef));
    expect(promoted.dryRun).toBe(false);
    if (promoted.dryRun) throw new Error("unexpected dry-run");
    expect(promoted.operation).toBe("write");
    expect(promoted.artifact.provenance.source).toBe("canonical");
    await expect(
      repository.verify(artifactRef, {
        dependencyFingerprints: ["e".repeat(64)],
      })
    ).rejects.toMatchObject({ code: "ARTIFACT_INVALID" });

    await fs.writeFile(
      promoted.artifact.provenance.absolutePath,
      "tampered",
      "utf8"
    );
    await expect(repository.verify(artifactRef)).rejects.toMatchObject({
      code: "ARTIFACT_INVALID",
    });
  });

  it("keeps dry-run and failed validation free of filesystem writes", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({ workspaceRoot: workspace });
    const artifactRef = ref();
    const paths = repository.resolve(artifactRef);

    const planned = await repository.promote({
      ...promoteRequest(artifactRef),
      dryRun: true,
    });
    expect(planned.dryRun).toBe(true);
    await expect(fs.access(paths.unitRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      repository.promote({
        ...promoteRequest(artifactRef, "invalid"),
        validate: () => {
          throw new Error("schema rejected");
        },
      })
    ).rejects.toThrow("schema rejected");
    await expect(fs.access(paths.unitRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses canonical precedence for equivalent candidates and rejects ambiguity", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({ workspaceRoot: workspace });
    const artifactRef = ref();
    const paths = repository.resolve(artifactRef);
    const legacyPath = paths.legacy[0];
    const legacyRelativePath = paths.legacyRelativePaths[0];
    if (!legacyPath || !legacyRelativePath)
      throw new Error("legacy path missing");

    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: paths.canonical,
      relativePath: paths.canonicalRelativePath,
      content: "same",
    });
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "same",
    });
    const selected = await repository.verify(artifactRef);
    expect(selected.provenance.source).toBe("canonical");
    expect(selected.equivalentCandidates).toEqual([legacyPath]);

    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "different",
    });
    await expect(repository.verify(artifactRef)).rejects.toMatchObject({
      code: "ARTIFACT_AMBIGUOUS",
    });
    await expect(repository.planMigration(artifactRef)).resolves.toMatchObject({
      operation: "block",
      conflict: "ambiguous",
      source: null,
      requiredApprovals: ["operator-conflict-resolution"],
    });
  });

  it("fails closed for invalid canonical artifacts and symlink escapes", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({ workspaceRoot: workspace });
    const artifactRef = ref();
    const paths = repository.resolve(artifactRef);
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: paths.canonical,
      relativePath: paths.canonicalRelativePath,
      content: "content",
      checksumOverride: "a".repeat(64),
    });
    await expect(repository.verify(artifactRef)).rejects.toMatchObject({
      code: "ARTIFACT_INVALID",
    });

    const symlinkRef = ref({ unitId: "episode-002" as ArtifactRef["unitId"] });
    const symlinkPaths = repository.resolve(symlinkRef);
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "artifact-external-")
    );
    await fs.writeFile(path.join(outside, "script.md"), "outside", "utf8");
    await fs.mkdir(symlinkPaths.unitRoot, { recursive: true });
    await fs.symlink(outside, path.join(symlinkPaths.unitRoot, "languages"));
    await expect(
      repository.promote(promoteRequest(symlinkRef))
    ).rejects.toBeInstanceOf(ArtifactRepositoryError);
  });

  it("plans migration without writes, then copies and rolls back with hash checks", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({
      workspaceRoot: workspace,
      now: () => new Date(fixedNow),
    });
    const artifactRef = ref();
    const paths = repository.resolve(artifactRef);
    const legacyPath = paths.legacy[0];
    const legacyRelativePath = paths.legacyRelativePaths[0];
    if (!legacyPath || !legacyRelativePath)
      throw new Error("legacy path missing");
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "legacy story",
    });

    const plan = await repository.planMigration(artifactRef);
    expect(await repository.planMigration(artifactRef)).toEqual(plan);
    expect(plan.operation).toBe("copy");
    await expect(
      fs.access(path.join(paths.unitRoot, "state", "artifact-migrations"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      repository.applyMigration({ plan, confirmationPlanId: "wrong-plan" })
    ).rejects.toMatchObject({ code: "MIGRATION_CONFIRMATION_REQUIRED" });

    const applied = await repository.applyMigration({
      plan,
      confirmationPlanId: plan.id,
    });
    expect(applied.operation).toBe("copy");
    expect(applied.rollbackManifestPath).toBeDefined();
    expect((await repository.verify(artifactRef)).provenance.source).toBe(
      "canonical"
    );
    await repository.rollbackMigration(applied.rollbackManifestPath as string);
    expect((await repository.verify(artifactRef)).provenance.source).toBe(
      "legacy"
    );
    await expect(fs.access(paths.canonical)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const events = await fs.readFile(
      path.join(paths.unitRoot, "state", "artifact-migrations", "events.jsonl"),
      "utf8"
    );
    expect(events).toContain("migration-applied");
    expect(events).toContain("migration-rolled-back");
  });

  it("preserves rollback evidence when migration is interrupted after promotion", async () => {
    const workspace = await tempWorkspace();
    const artifactRef = ref();
    const repository = new ArtifactRepository({
      workspaceRoot: workspace,
      now: () => new Date(fixedNow),
      migrationHooks: {
        afterPromotion: () => {
          throw new Error("simulated interruption");
        },
      },
    });
    const paths = repository.resolve(artifactRef);
    const legacyPath = paths.legacy[0];
    const legacyRelativePath = paths.legacyRelativePaths[0];
    if (!legacyPath || !legacyRelativePath)
      throw new Error("legacy path missing");
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "legacy story",
    });
    const plan = await repository.planMigration(artifactRef);
    await expect(
      repository.applyMigration({ plan, confirmationPlanId: plan.id })
    ).rejects.toMatchObject({
      code: "MIGRATION_PLAN_STALE",
      details: { rollbackManifestPath: expect.any(String) },
    });
    const rollbackPath = path.join(
      paths.unitRoot,
      "state",
      "artifact-migrations",
      `${plan.id}.rollback.json`
    );
    await expect(fs.access(rollbackPath)).resolves.toBeUndefined();
    await repository.rollbackMigration(rollbackPath);
    await expect(fs.access(paths.canonical)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails closed when source or destination changes after planning", async () => {
    const workspace = await tempWorkspace();
    const repository = new ArtifactRepository({ workspaceRoot: workspace });
    const artifactRef = ref();
    const paths = repository.resolve(artifactRef);
    const legacyPath = paths.legacy[0];
    const legacyRelativePath = paths.legacyRelativePaths[0];
    if (!legacyPath || !legacyRelativePath)
      throw new Error("legacy path missing");
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "legacy story",
    });
    const staleSourcePlan = await repository.planMigration(artifactRef);
    await fs.writeFile(legacyPath, "changed source");
    await expect(
      repository.applyMigration({
        plan: staleSourcePlan,
        confirmationPlanId: staleSourcePlan.id,
      })
    ).rejects.toMatchObject({ code: "MIGRATION_PLAN_STALE" });

    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: legacyPath,
      relativePath: legacyRelativePath,
      content: "legacy story",
    });
    const conflictPlan = await repository.planMigration(artifactRef);
    await writeCandidate({
      workspace,
      ref: artifactRef,
      absolutePath: paths.canonical,
      relativePath: paths.canonicalRelativePath,
      content: "different canonical",
    });
    await expect(
      repository.applyMigration({
        plan: conflictPlan,
        confirmationPlanId: conflictPlan.id,
      })
    ).rejects.toMatchObject({ code: "MIGRATION_PLAN_STALE" });
  });
});
