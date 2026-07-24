import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  APPROVAL_SCHEMA_VERSION,
  ARTIFACT_SCHEMA_VERSION,
  ERROR_SCHEMA_VERSION,
  OVERRIDE_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  approvalRecordSchema,
  artifactManifestSchema,
  normalizedWorkflowErrorSchema,
  operatorOverrideSchema,
  taskDefinitionSchema,
  workflowDefinitionSchema,
  type WorkflowTaskStatus,
} from "@mediaforge/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTaskRegistry, type TaskRegistration } from "./task-registry.js";
import { ArtifactRepository } from "./artifact-repository.js";
import {
  WORKFLOW_STORE_VERSION,
  WorkflowStore,
  WorkflowStoreError,
  isWorkflowTransitionAllowed,
} from "./workflow-store.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function registration(args: {
  id: `${string}.${string}`;
  dependencies?: readonly `${string}.${string}`[];
  approval?: boolean;
}): TaskRegistration {
  const definition = taskDefinitionSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id: args.id,
    implementationVersion: "1.0.0",
    displayName: args.id,
    description: `Execute ${args.id}.`,
    applicableProfiles: ["dark-truth"],
    dependencies: (args.dependencies ?? []).map((taskId) => ({
      taskId,
      optional: false,
    })),
    inputs: [],
    outputs: [],
    executionKind: args.approval ? "manual-approval" : "deterministic",
    policies: {
      cache: "fingerprint",
      retryLimit: 1,
      timeoutMs: 1_000,
      lockScope: "task",
      approvalRequired: args.approval ?? false,
      batchable: false,
      provider: "none",
      estimatedCostClass: "none",
    },
    cli: { resource: "task", command: args.id, examples: [args.id] },
    observability: { operationName: args.id, redactedFields: [] },
  });
  return { definition, implementation: { owner: "@mediaforge/testing" } };
}

const prepareTask = registration({ id: "test.prepare" });
const publishTask = registration({
  id: "test.publish",
  dependencies: ["test.prepare"],
  approval: true,
});
const registry = createTaskRegistry([prepareTask, publishTask]);

const workflow = workflowDefinitionSchema.parse({
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  id: "test.workflow",
  revision: "revision-1",
  profileId: "dark-truth",
  taskIds: [prepareTask.definition.id, publishTask.definition.id],
});

function successManifest(attemptId = "attempt-001") {
  return artifactManifestSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    id: "manifest-001",
    ref: {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      unitId: "episode-001",
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      kind: "full-script",
      artifactRevision: "revision-1",
      workflowRevision: "revision-1",
      policyRevision: "policy-1",
    },
    relativePath: "languages/script-en.md",
    checksumSha256: hashA,
    sizeBytes: 42,
    mediaType: "text/markdown",
    producerTaskId: "test.prepare",
    producerTaskVersion: "1.0.0",
    producerAttemptId: attemptId,
    producerSucceeded: true,
    validation: {
      status: "passed",
      validatorId: "test.validator",
      validatorVersion: "1.0.0",
      validatedAt: "2026-07-14T12:00:00.000Z",
    },
    dependencyFingerprints: [],
    createdAt: "2026-07-14T12:00:00.000Z",
  });
}

describe("workflow state, events, locks, and reconciliation", () => {
  let temporaryRoot: string;
  let currentTime: Date;
  let failAfterEventAppend: boolean;
  let store: WorkflowStore;

  beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-workflow-store-")
    );
    currentTime = new Date("2026-07-14T12:00:00.000Z");
    failAfterEventAppend = false;
    store = new WorkflowStore({
      unitRoot: temporaryRoot,
      workflow,
      identity: {
        instanceId: "instance-001",
        unitId: "episode-001",
        locale: "en",
        variant: "full",
      },
      staleAfterMs: 1_000,
      now: () => new Date(currentTime),
      hooks: {
        afterEventAppend: () => {
          if (failAfterEventAppend) throw new Error("simulated state crash");
        },
      },
    });
  });

  afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it("materializes the canonical layout and rebuilds corrupt or interrupted state from events", async () => {
    const initial = await store.initialize();
    expect(initial.tasks.map((task) => task.status)).toEqual([
      "pending",
      "pending",
    ]);
    await expect(fs.stat(store.eventsPath)).resolves.toBeDefined();
    await expect(fs.stat(store.approvalsPath)).resolves.toBeDefined();
    await expect(fs.stat(store.overridesPath)).resolves.toBeDefined();

    await store.transition({ taskId: "test.prepare", to: "ready" });
    failAfterEventAppend = true;
    await expect(
      store.transition({
        taskId: "test.prepare",
        to: "blocked",
        reason: "Input is temporarily unavailable.",
      })
    ).rejects.toThrow("simulated state crash");
    failAfterEventAppend = false;

    const rebuilt = await store.readState();
    expect(rebuilt.tasks[0]).toMatchObject({
      taskId: "test.prepare",
      status: "blocked",
    });
    expect((await store.readEvents()).map((event) => event.eventType)).toEqual([
      "workflow-created",
      "task-state-changed",
      "task-state-changed",
    ]);

    await fs.writeFile(store.statePath, "{corrupt", "utf8");
    expect((await store.readState()).tasks[0]?.status).toBe("blocked");
  });

  it("defines every allowed transition and fails closed on impossible transitions", async () => {
    const expected: Record<WorkflowTaskStatus, readonly WorkflowTaskStatus[]> =
      {
        pending: [
          "ready",
          "blocked",
          "awaiting-approval",
          "skipped",
          "invalidated",
        ],
        ready: [
          "running",
          "blocked",
          "awaiting-approval",
          "skipped",
          "invalidated",
        ],
        blocked: [
          "pending",
          "ready",
          "awaiting-approval",
          "skipped",
          "invalidated",
        ],
        "awaiting-approval": [
          "pending",
          "ready",
          "blocked",
          "skipped",
          "invalidated",
        ],
        running: ["succeeded", "failed", "interrupted", "skipped"],
        succeeded: ["invalidated"],
        failed: ["pending", "ready", "invalidated"],
        interrupted: ["pending", "ready", "invalidated"],
        skipped: ["pending", "ready", "invalidated"],
        invalidated: [
          "pending",
          "ready",
          "blocked",
          "awaiting-approval",
          "skipped",
        ],
      };
    const statuses = Object.keys(expected) as WorkflowTaskStatus[];
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isWorkflowTransitionAllowed(from, to), `${from} -> ${to}`).toBe(
          expected[from].includes(to)
        );
      }
    }

    await store.initialize();
    await expect(
      store.transition({ taskId: "test.prepare", to: "succeeded" })
    ).rejects.toMatchObject<Partial<WorkflowStoreError>>({
      code: "INVALID_TRANSITION",
    });
  });

  it("writes attempts by run and preserves complete normalized failure payloads", async () => {
    await store.initialize();
    await store.transition({ taskId: "test.prepare", to: "ready" });
    await store.beginAttempt({
      id: "attempt-001",
      runId: "run-001",
      taskId: "test.prepare",
      fingerprint: hashA,
      attemptNumber: 1,
    });
    const error = normalizedWorkflowErrorSchema.parse({
      schemaVersion: ERROR_SCHEMA_VERSION,
      code: "ARTIFACT_VALIDATION_FAILED",
      message: "The output checksum changed.",
      retryable: false,
      remediation: "Regenerate the output.",
      taskId: "test.prepare",
      attemptId: "attempt-001",
      causeName: "ChecksumMismatch",
    });
    await store.completeAttempt({
      id: "attempt-001",
      result: { schemaVersion: TASK_SCHEMA_VERSION, status: "failed", error },
    });

    const attempt = await store.readAttempt("attempt-001");
    expect(attempt).toMatchObject({
      status: "completed",
      result: { status: "failed", error },
    });
    expect((await store.readState()).tasks[0]).toMatchObject({
      status: "failed",
      errorCode: "ARTIFACT_VALIDATION_FAILED",
    });
  });

  it("validates revision-bound approvals and reasoned manual success overrides", async () => {
    await store.initialize();
    const staleApproval = approvalRecordSchema.parse({
      schemaVersion: APPROVAL_SCHEMA_VERSION,
      id: "approval-stale",
      workflowInstanceId: "instance-001",
      taskId: "test.publish",
      profileId: "dark-truth",
      unitId: "episode-001",
      locale: "en",
      variant: "full",
      decision: "approved",
      actor: "operator@example.invalid",
      reason: "Reviewed an earlier workflow revision.",
      boundRevision: "revision-0",
      artifactHashes: [hashA],
      createdAt: currentTime.toISOString(),
    });
    await store.recordApproval(staleApproval);
    expect(
      await store.currentApproval("test.publish", { artifactHashes: [hashA] })
    ).toBeNull();

    currentTime = new Date(currentTime.getTime() + 1_000);
    const approval = approvalRecordSchema.parse({
      ...staleApproval,
      id: "approval-current",
      reason: "Reviewed the current outputs.",
      boundRevision: "revision-1",
      createdAt: currentTime.toISOString(),
    });
    await store.recordApproval(approval);
    expect(
      await store.currentApproval("test.publish", { artifactHashes: [hashA] })
    ).toEqual(approval);
    expect(
      await store.currentApproval("test.publish", { artifactHashes: [hashB] })
    ).toBeNull();

    const override = operatorOverrideSchema.parse({
      schemaVersion: OVERRIDE_SCHEMA_VERSION,
      id: "override-001",
      workflowInstanceId: "instance-001",
      taskId: "test.prepare",
      actor: "operator@example.invalid",
      reason: "An existing validated manual artifact satisfies this task.",
      scope: "task-success",
      outputManifestIds: ["manifest-001"],
      createdAt: currentTime.toISOString(),
      boundRevision: "revision-1",
    });
    await store.applyManualSuccess(override);
    expect((await store.readState()).tasks[0]).toMatchObject({
      status: "succeeded",
      overrideId: "override-001",
      outputManifestIds: ["manifest-001"],
    });

    const forbidden = operatorOverrideSchema.parse({
      ...override,
      id: "override-publish",
      taskId: "test.publish",
    });
    await expect(store.applyManualSuccess(forbidden)).rejects.toMatchObject<
      Partial<WorkflowStoreError>
    >({ code: "OVERRIDE_FORBIDDEN" });
  });

  it("detects active locks and recovers stale locks and interrupted runs", async () => {
    await store.initialize();
    const lock = await store.acquireLock({
      scope: "task",
      key: "test.prepare",
      owner: "worker-a",
      runId: "run-001",
    });
    await expect(
      store.acquireLock({
        scope: "task",
        key: "test.prepare",
        owner: "worker-b",
      })
    ).rejects.toMatchObject<Partial<WorkflowStoreError>>({
      code: "LOCK_ACTIVE",
    });

    await store.transition({ taskId: "test.prepare", to: "ready" });
    await store.beginAttempt({
      id: "attempt-001",
      runId: "run-001",
      taskId: "test.prepare",
      fingerprint: hashA,
      attemptNumber: 1,
    });
    currentTime = new Date(currentTime.getTime() + 2_000);
    expect(await store.detectStaleRecords()).toMatchObject({
      locks: [{ token: lock.token }],
      attempts: [{ id: "attempt-001", status: "running" }],
    });
    await store.recoverStaleRecords();
    expect((await store.readState()).tasks[0]).toMatchObject({
      status: "interrupted",
      errorCode: "INTERRUPTED",
    });
    expect(
      (await store.readEvents()).filter(
        (event) => event.eventType === "lock-recovered"
      )
    ).toHaveLength(1);
  });

  it("recovers a running attempt immediately when its operator process is gone", async () => {
    await store.initialize();
    await store.transition({ taskId: "test.prepare", to: "ready" });
    await store.beginAttempt({
      id: "attempt-dead-owner",
      runId: "run-dead-owner",
      taskId: "test.prepare",
      fingerprint: hashA,
      attemptNumber: 1,
    });
    await store.acquireLock({
      scope: "task",
      key: "test.prepare",
      owner: "workflow-operator-2147483647",
      runId: "run-dead-owner",
      attemptId: "attempt-dead-owner",
    });

    expect(await store.detectStaleRecords()).toMatchObject({
      attempts: [{ id: "attempt-dead-owner" }],
      locks: [{ owner: "workflow-operator-2147483647" }],
    });
    await store.recoverStaleRecords();
    expect((await store.readState()).tasks[0]).toMatchObject({
      status: "interrupted",
      errorCode: "INTERRUPTED",
    });
  });

  it("recovers invalid output and refreshes reusable descendant lineage", async () => {
    const repository = new ArtifactRepository({
      workspaceRoot: temporaryRoot,
      now: () => new Date(currentTime),
    });
    const artifactRef = successManifest().ref;
    const request = {
      ref: artifactRef,
      content: "first valid result",
      mediaType: "text/plain",
      producerTaskId: "test.prepare",
      producerTaskVersion: "1.0.0",
      producerAttemptId: "attempt-001",
      validatorId: "test.validator",
      validatorVersion: "1.0.0",
      dependencyFingerprints: [],
      validate: (content: Buffer) => {
        if (content.byteLength === 0) throw new Error("empty artifact");
      },
    } as const;
    const first = await repository.promote(request);
    if (first.dryRun) throw new Error("unexpected dry run");
    await fs.writeFile(
      first.artifact.provenance.absolutePath,
      "corrupt",
      "utf8"
    );

    await expect(
      repository.promote({ ...request, content: "recomputed result" })
    ).rejects.toMatchObject({ code: "ARTIFACT_CONFLICT" });
    const recovered = await repository.promote({
      ...request,
      content: "recomputed result",
      producerAttemptId: "attempt-002",
      replaceInvalidDestination: true,
    });
    if (recovered.dryRun) throw new Error("unexpected dry run");
    expect(recovered.operation).toBe("write");
    await expect(
      fs.readFile(recovered.artifact.provenance.absolutePath, "utf8")
    ).resolves.toBe("recomputed result");
    await expect(repository.verify(artifactRef)).resolves.toMatchObject({
      manifest: { producerAttemptId: "attempt-002" },
    });

    const beforeRefresh = await fs.stat(
      recovered.artifact.provenance.absolutePath
    );
    const refreshed = await repository.promote({
      ...request,
      content: "recomputed result",
      producerAttemptId: "attempt-003",
      refreshManifestOnReuse: true,
    });
    if (refreshed.dryRun) throw new Error("unexpected dry run");
    expect(refreshed.operation).toBe("write");
    const afterRefresh = await fs.stat(
      refreshed.artifact.provenance.absolutePath
    );
    expect({
      inode: afterRefresh.ino,
      modifiedAt: afterRefresh.mtimeMs,
      size: afterRefresh.size,
    }).toEqual({
      inode: beforeRefresh.ino,
      modifiedAt: beforeRefresh.mtimeMs,
      size: beforeRefresh.size,
    });
    expect(refreshed.artifact.manifest.producerAttemptId).toBe("attempt-003");
  });

  it("uses subsystem manifests as evidence only and reconciles validated artifact crash windows", async () => {
    await store.initialize();
    await store.transition({ taskId: "test.prepare", to: "ready" });
    await store.beginAttempt({
      id: "attempt-001",
      runId: "run-001",
      taskId: "test.prepare",
      fingerprint: hashA,
      attemptNumber: 1,
    });
    const manifest = successManifest();

    const subsystemOnly = await store.reconcile({
      subsystemEvidence: [
        {
          taskId: "test.prepare",
          path: "state/legacy/subsystem.json",
          validated: true,
          reason: "Legacy subsystem manifest parsed successfully.",
        },
      ],
    });
    expect(subsystemOnly.evidenceOnlyTaskIds).toEqual(["test.prepare"]);
    expect((await store.readState()).tasks[0]?.status).toBe("running");

    const unverified = await store.reconcile({ artifactManifests: [manifest] });
    expect(unverified.evidenceOnlyTaskIds).toEqual(["test.prepare"]);
    expect((await store.readState()).tasks[0]?.status).toBe("running");

    const reconciled = await store.reconcile({
      artifactManifests: [manifest],
      verifyArtifact: () => true,
    });
    expect(reconciled.importedSuccessTaskIds).toEqual(["test.prepare"]);
    expect((await store.readState()).tasks[0]).toMatchObject({
      status: "succeeded",
      outputManifestIds: ["manifest-001"],
    });

    const invalidated = await store.reconcile({ verifyArtifact: () => false });
    expect(invalidated.invalidatedTaskIds).toEqual(["test.prepare"]);
    expect((await store.readState()).tasks[0]?.status).toBe("invalidated");
  });

  it("derives next entirely from graph, state, artifacts, and current approvals", async () => {
    await store.initialize();
    const qualityBlockedRegistry = createTaskRegistry([
      {
        ...prepareTask,
        readiness: () => ["The quality gate requires an operator decision."],
      },
      publishTask,
    ]);
    expect(
      (
        await store.deriveNext(qualityBlockedRegistry, {
          availableArtifacts: [],
        })
      ).nextTaskId
    ).toBeNull();
    await store.recordOverride(
      operatorOverrideSchema.parse({
        schemaVersion: OVERRIDE_SCHEMA_VERSION,
        id: "override-quality",
        workflowInstanceId: "instance-001",
        taskId: "test.prepare",
        actor: "operator@example.invalid",
        reason: "The documented bounded quality exception is accepted.",
        scope: "quality",
        createdAt: currentTime.toISOString(),
        boundRevision: "revision-1",
      })
    );
    expect(
      (
        await store.deriveNext(qualityBlockedRegistry, {
          availableArtifacts: [],
        })
      ).nextTaskId
    ).toBe("test.prepare");

    await store.transition({ taskId: "test.prepare", to: "ready" });
    await store.beginAttempt({
      id: "attempt-001",
      runId: "run-001",
      taskId: "test.prepare",
      fingerprint: hashA,
      attemptNumber: 1,
    });
    await store.completeAttempt({
      id: "attempt-001",
      result: {
        schemaVersion: TASK_SCHEMA_VERSION,
        status: "succeeded",
        outputs: [],
        warnings: [],
      },
    });
    expect(
      (await store.deriveNext(registry, { availableArtifacts: [] })).nextTaskId
    ).toBeNull();

    const approval = approvalRecordSchema.parse({
      schemaVersion: APPROVAL_SCHEMA_VERSION,
      id: "approval-001",
      workflowInstanceId: "instance-001",
      taskId: "test.publish",
      profileId: "dark-truth",
      unitId: "episode-001",
      locale: "en",
      variant: "full",
      decision: "approved",
      actor: "operator@example.invalid",
      reason: "Current publish inputs reviewed.",
      boundRevision: "revision-1",
      artifactHashes: [hashA],
      createdAt: currentTime.toISOString(),
    });
    await store.recordApproval(approval);
    const derived = await store.deriveNext(registry, {
      availableArtifacts: [],
      approvalArtifactHashes: { "test.publish": [hashA] },
    });
    expect(derived.nextTaskId).toBe("test.publish");
    expect(derived.tasks.map((task) => task.readiness.status)).toEqual([
      "not-applicable",
      "ready",
    ]);
  });

  it("rejects corrupt manual files during rebuild", async () => {
    await store.initialize();
    await fs.writeFile(
      store.overridesPath,
      JSON.stringify({
        schemaVersion: WORKFLOW_STORE_VERSION,
        records: [{ nope: true }],
      }),
      "utf8"
    );
    await expect(store.rebuildState()).rejects.toMatchObject<
      Partial<WorkflowStoreError>
    >({ code: "OPERATOR_RECORD_INVALID" });
  });
});
