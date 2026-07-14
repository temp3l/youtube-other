import { describe, expect, it } from "vitest";

import {
  APPROVAL_SCHEMA_VERSION,
  ARTIFACT_SCHEMA_VERSION,
  BATCH_SCHEMA_VERSION,
  DOMAIN_CONTRACT_VERSION,
  ERROR_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  QUALITY_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  approvalRecordSchema,
  artifactManifestSchema,
  artifactRefSchema,
  batchManifestSchema,
  contentProfileSchema,
  convertLegacyArtifactReference,
  convertLegacyQualityStatus,
  qualityAssessmentSchema,
  taskDefinitionSchema,
  taskAttemptSchema,
  taskInputSchema,
  workflowEventSchema,
  workflowDefinitionSchema,
  workflowInstanceSchema,
} from "./workflow-contracts.js";

const now = "2026-07-14T12:00:00.000Z";
const hash = "a".repeat(64);

const policy = (id: string) => ({ id, version: "1.0.0" });

const profileBase = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  contractVersion: DOMAIN_CONTRACT_VERSION,
  audience: {
    ageMinimum: 16,
    ageMaximum: 80,
    description: "Documentary viewers",
    priorKnowledge: [],
    accessibilityNeeds: [],
  },
  objective: "Create a coherent production artifact.",
  engagementStrategies: ["curiosity"],
  qualityPolicies: [policy("quality.default")],
  visualPolicy: policy("visual.default"),
  narrationPolicy: policy("narration.default"),
  localizationPolicy: policy("localization.default"),
  approvalPolicy: policy("approval.default"),
  artifactRequirements: [],
  referencePolicy: policy("reference.default"),
};

const artifactRef = {
  schemaVersion: ARTIFACT_SCHEMA_VERSION,
  unitId: "episode-001",
  profileId: "dark-truth",
  locale: "en",
  variant: "full",
  kind: "full-script",
  artifactRevision: "revision-1",
  workflowRevision: "revision-1",
  policyRevision: "bible-1",
};

describe("shared workflow contracts", () => {
  it("parses only the two closed content profile variants", () => {
    expect(
      contentProfileSchema.parse({
        ...profileBase,
        id: "dark-truth",
        narrativeMode: "dark-documentary",
        supernaturalRuleRequired: true,
        referenceImagesRequired: true,
      }).id
    ).toBe("dark-truth");

    expect(
      contentProfileSchema.parse({
        ...profileBase,
        id: "mathematics-education",
        curriculumJurisdiction: "DE-BE",
        curriculumRevision: "2026.1",
        grade: 8,
        deterministicVerificationRequired: true,
      }).id
    ).toBe("mathematics-education");

    expect(() =>
      contentProfileSchema.parse({ ...profileBase, id: "unknown" })
    ).toThrow();
  });

  it("rejects unknown fields at top-level and nested boundaries", () => {
    expect(() =>
      artifactRefSchema.parse({ ...artifactRef, invented: true })
    ).toThrow();
    expect(() =>
      contentProfileSchema.parse({
        ...profileBase,
        audience: { ...profileBase.audience, invented: true },
        id: "dark-truth",
        narrativeMode: "dark-documentary",
        supernaturalRuleRequired: true,
        referenceImagesRequired: true,
      })
    ).toThrow();
    expect(() =>
      artifactRefSchema.parse({ ...artifactRef, format: "exe" })
    ).toThrow();
  });

  it("round-trips a strict artifact manifest", () => {
    const manifest = artifactManifestSchema.parse({
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      id: "manifest-001",
      ref: artifactRef,
      relativePath: "languages/script-en.md",
      checksumSha256: hash,
      sizeBytes: 42,
      mediaType: "text/markdown",
      producerTaskId: "story.rewrite",
      producerTaskVersion: "1.0.0",
      producerAttemptId: "attempt-001",
      producerSucceeded: true,
      validation: {
        status: "passed",
        validatorId: "story.validator",
        validatorVersion: "1.0.0",
        validatedAt: now,
      },
      dependencyFingerprints: [hash],
      createdAt: now,
    });

    expect(
      artifactManifestSchema.parse(JSON.parse(JSON.stringify(manifest)))
    ).toEqual(manifest);
  });

  it("validates task policy invariants and workflow uniqueness", () => {
    const task = {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: "publish.youtube",
      implementationVersion: "1.0.0",
      displayName: "Publish to YouTube",
      description: "Publish an approved production artifact.",
      applicableProfiles: ["dark-truth"],
      dependencies: [{ taskId: "render.video", optional: false }],
      inputs: [
        {
          kind: "render",
          required: true,
          schemaId: "render.video",
          schemaVersion: "1.0.0",
        },
      ],
      outputs: [
        {
          kind: "publish-report",
          required: true,
          schemaId: "publish.report",
          schemaVersion: "1.0.0",
        },
      ],
      executionKind: "irreversible",
      policies: {
        cache: "disabled",
        retryLimit: 0,
        timeoutMs: 10_000,
        lockScope: "unit",
        approvalRequired: true,
        batchable: false,
        provider: "required",
        estimatedCostClass: "none",
      },
      cli: {
        resource: "task",
        command: "publish youtube",
        examples: ["mediaforge task run publish.youtube"],
      },
      observability: {
        operationName: "publish.youtube",
        redactedFields: ["accessToken"],
      },
    };

    expect(taskDefinitionSchema.parse(task).id).toBe("publish.youtube");
    expect(() =>
      taskDefinitionSchema.parse({
        ...task,
        policies: { ...task.policies, approvalRequired: false },
      })
    ).toThrow();
    expect(() =>
      taskDefinitionSchema.parse({
        ...task,
        dependencies: [...task.dependencies, ...task.dependencies],
      })
    ).toThrow();

    const workflow = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "darktruth.production",
      revision: "1.0.0",
      profileId: "dark-truth",
      taskIds: ["story.rewrite", "publish.youtube"],
    };
    expect(workflowDefinitionSchema.parse(workflow).taskIds).toHaveLength(2);
    expect(() =>
      workflowDefinitionSchema.parse({
        ...workflow,
        taskIds: ["story.rewrite", "story.rewrite"],
      })
    ).toThrow();
  });

  it("validates the workflow state discriminated union", () => {
    const instance = workflowInstanceSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "workflow-instance-001",
      workflowId: "darktruth.production",
      workflowRevision: "1.0.0",
      unitId: "episode-001",
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      tasks: [
        {
          taskId: "story.rewrite",
          status: "ready",
          reasons: [],
          updatedAt: now,
        },
        {
          taskId: "publish.youtube",
          status: "awaiting-approval",
          reasons: ["Approval missing"],
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    expect(instance.tasks.map((task) => task.status)).toEqual([
      "ready",
      "awaiting-approval",
    ]);
  });

  it("round-trips task inputs, attempts, results, and workflow events", () => {
    const input = taskInputSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      taskId: "story.rewrite",
      taskVersion: "1.0.0",
      workflowInstanceId: "workflow-instance-001",
      runId: "run-001",
      unitId: "episode-001",
      profileId: "dark-truth",
      locale: "en",
      variant: "full",
      inputArtifacts: [artifactRef],
      fingerprint: hash,
    });
    expect(taskInputSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(
      input
    );

    const attempt = taskAttemptSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id: "attempt-001",
      runId: "run-001",
      workflowInstanceId: "workflow-instance-001",
      taskId: "story.rewrite",
      fingerprint: hash,
      attemptNumber: 1,
      startedAt: now,
      completedAt: now,
      result: {
        schemaVersion: TASK_SCHEMA_VERSION,
        status: "failed",
        error: {
          schemaVersion: ERROR_SCHEMA_VERSION,
          code: "ARTIFACT_VALIDATION_FAILED",
          message: "Output did not validate.",
          retryable: false,
          remediation: "Regenerate the output.",
        },
      },
    });
    expect(attempt.result.status).toBe("failed");

    expect(
      workflowEventSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        eventId: "event-001",
        workflowInstanceId: "workflow-instance-001",
        occurredAt: now,
        eventType: "task-state-changed",
        taskId: "story.rewrite",
        from: "running",
        to: "failed",
        attemptId: "attempt-001",
        reason: "Validation failed.",
      }).eventType
    ).toBe("task-state-changed");
  });

  it("enforces quality weights, thresholds, and hard failures", () => {
    const ready = {
      schemaVersion: QUALITY_SCHEMA_VERSION,
      profileId: "dark-truth",
      artifact: artifactRef,
      status: "READY",
      dimensions: [
        {
          dimension: "story.quality",
          score: 90,
          weight: 100,
          required: true,
          evidence: ["Gate passed"],
        },
      ],
      weightedScore: 90,
      hardFailures: [],
      boundedEdits: [],
      warnings: [],
      assessedAt: now,
    };
    expect(qualityAssessmentSchema.parse(ready).status).toBe("READY");
    expect(() =>
      qualityAssessmentSchema.parse({ ...ready, weightedScore: 80 })
    ).toThrow();
    expect(() =>
      qualityAssessmentSchema.parse({
        ...ready,
        hardFailures: [
          {
            code: "DARKTRUTH_BIBLE_CONTRADICTION",
            message: "The script contradicts the bible.",
            action: "rewrite",
            overridable: false,
            evidence: ["scene-003"],
          },
        ],
      })
    ).toThrow();
  });

  it("binds approvals to artifacts and preserves deterministic batch item identities", () => {
    const approval = approvalRecordSchema.parse({
      schemaVersion: APPROVAL_SCHEMA_VERSION,
      id: "approval-001",
      workflowInstanceId: "workflow-instance-001",
      taskId: "publish.youtube",
      profileId: "dark-truth",
      unitId: "episode-001",
      locale: "en",
      variant: "full",
      decision: "approved",
      actor: "reviewer@example.invalid",
      reason: "Quality evidence accepted.",
      boundRevision: "revision-1",
      artifactHashes: [hash],
      qualityAssessmentHash: hash,
      channel: "dark-truth-en",
      createdAt: now,
    });
    expect(approval.artifactHashes).toEqual([hash]);

    const item = {
      id: "item-001",
      taskId: "image.generate",
      unitId: "episode-001",
      locale: "en",
      variant: "full",
      fingerprint: hash,
      groupKey: "openai:example-model:en:full:image.generate",
      status: "pending",
      attemptIds: [],
      outputManifestIds: [],
      warnings: [],
    };
    const batch = {
      schemaVersion: BATCH_SCHEMA_VERSION,
      id: "batch-001",
      profileId: "dark-truth",
      provider: "openai",
      model: "example-model",
      operation: "image.generate",
      executionMode: "provider-batch",
      status: "planned",
      configuration: { concurrency: 2, retryLimit: 1 },
      items: [item],
      totals: {
        succeeded: 0,
        failedRetryable: 0,
        failedPermanent: 0,
        cancelled: 0,
        estimatedCostMicros: 0,
        actualCostMicros: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
    expect(batchManifestSchema.parse(batch).items[0]?.id).toBe("item-001");
    expect(() =>
      batchManifestSchema.parse({ ...batch, items: [item, item] })
    ).toThrow();
  });

  it("uses explicit legacy conversion functions", () => {
    expect(convertLegacyQualityStatus("PASS")).toBe("READY");
    expect(convertLegacyQualityStatus("REPAIRABLE")).toBe("REVISION_REQUIRED");
    expect(
      convertLegacyArtifactReference({
        id: "artifact-script",
        kind: "full-script",
        unitId: "episode-001",
        profileId: "dark-truth",
        locale: "en",
        variant: "full",
        artifactRevision: "revision-1",
        workflowRevision: "revision-1",
        policyRevision: "bible-1",
      })
    ).toEqual(artifactRef);
  });
});
