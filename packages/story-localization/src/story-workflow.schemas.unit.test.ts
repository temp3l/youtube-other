import { describe, expect, it } from "vitest";
import { stableSerialize } from "./stable-json.js";
import {
  artifactIdSchema,
  batchItemStateSchema,
  executionIdSchema,
  qualityGateDecisionSchema,
  stageFailureSchema,
  stageIdSchema,
  stageOutcomeSchema,
  workflowIdSchema,
  workflowLocaleSchema,
  workflowManifestSchema,
} from "./story-workflow.schemas.js";
import {
  stageFailureSchemaVersion,
  stageOutcomeSchemaVersion,
  workflowSchemaVersion,
} from "./story-workflow.types.js";

function makeFingerprintInputs() {
  return {
    sourceFingerprint: "a".repeat(64),
    parentFingerprints: ["b".repeat(64)],
    promptFingerprint: "c".repeat(64),
    schemaFingerprint: "d".repeat(64),
    model: "gpt-5.4",
    reasoningEffort: "medium",
    configFingerprint: "e".repeat(64),
    workflowSchemaVersion,
  };
}

function makeWarning() {
  return {
    code: "quality-minor",
    message: "Minor cleanup recommended.",
    emittedAt: "2026-07-01T10:00:00.000Z",
    details: { affectedParagraphs: 2 },
  };
}

function makeFailure(overrides: Partial<ReturnType<typeof buildFailure>> = {}) {
  return buildFailure(overrides);
}

function buildFailure(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category: "localization-provider-failure",
    retryability: "retryable",
    message: "Provider timed out.",
    occurredAt: "2026-07-01T10:05:00.000Z",
    providerStatusCode: 504,
    providerErrorCode: "gateway_timeout",
    causeStageId: "stage:localize-full:es:full",
    details: { provider: "openai" },
    ...overrides,
  };
}

function makeArtifactLineage() {
  return {
    artifactId: "artifact:009-the-christmas-doll:es:full:narration:deadbeef",
    artifactType: "localized-story-package",
    owner: "narration",
    locale: "es",
    format: "full",
    provenance: "generated",
    path: "locales/es/full/script.md",
    fingerprint: "f".repeat(64),
    schemaVersion: "localized-story-package-v1",
    parents: ["artifact:009-the-christmas-doll:en:full:narration:beadfeed"],
    sourceStageId: "stage:localize-full:es:full",
  };
}

function makeOutcome() {
  return {
    schemaVersion: stageOutcomeSchemaVersion,
    status: "succeeded",
    stageId: "stage:localize-full:es:full",
    executionId: "exec_20260701T100000Z_deadbeef",
    artifact: makeArtifactLineage(),
    provenance: "generated",
    fingerprintInputs: makeFingerprintInputs(),
    cache: {
      status: "miss",
      invalidationReasons: [],
    },
    warnings: [makeWarning()],
    cost: {
      inputTokens: 1200,
      cachedInputTokens: 0,
      outputTokens: 900,
      reasoningTokens: 400,
      estimatedCostMicros: 120000,
      actualCostMicros: null,
      pricingVersion: "pricing-2026-07-01",
    },
    startedAt: "2026-07-01T10:00:00.000Z",
    completedAt: "2026-07-01T10:06:00.000Z",
    observability: {
      attemptNumber: 1,
      durationMs: 360000,
      model: "gpt-5.4",
      reasoningEffort: "medium",
      providerRequestId: "resp_123",
      providerBatchId: "batch_123",
    },
  } as const;
}

describe("story workflow schemas", () => {
  it("parses a valid workflow manifest", () => {
    const manifest = workflowManifestSchema.parse({
      schemaVersion: workflowSchemaVersion,
      workflowId: "wf_story-pipeline_20260701T100000Z_deadbeef",
      executionId: "exec_20260701T100000Z_deadbeef",
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:06:00.000Z",
      plannedStageCount: 2,
      stages: [
        {
          stageId: "stage:rewrite-full:en:full",
          stageType: "rewrite-full",
          locale: "en",
          format: "full",
          dependsOn: [],
          status: "succeeded",
          fingerprintInputs: makeFingerprintInputs(),
          cache: { status: "miss", invalidationReasons: [] },
        },
        {
          stageId: "stage:localize-full:es:full",
          stageType: "localize-full",
          locale: "es",
          format: "full",
          dependsOn: ["stage:rewrite-full:en:full"],
          status: "succeeded",
          fingerprintInputs: makeFingerprintInputs(),
          cache: { status: "miss", invalidationReasons: [] },
          latestExecutionId: "exec_20260701T100000Z_deadbeef",
          latestCompletedAt: "2026-07-01T10:06:00.000Z",
          latestOutcome: makeOutcome(),
        },
      ],
      attemptHistory: [makeOutcome()],
      artifacts: [makeArtifactLineage()],
      batches: [
        {
          id: "batch-localize-es-full",
          status: "imported",
          category: "text-localization",
          operation: "localization",
          endpoint: "/v1/responses",
          providerBatchId: "batch_123",
          localManifestPath: "state/story-workflow/batches/es.json",
          stageIds: ["stage:localize-full:es:full"],
          items: [
            {
              customId: "dte:009:localization:es:deadbeef:cafebabe",
              stageId: "stage:localize-full:es:full",
              locale: "es",
              format: "full",
              artifactId:
                "artifact:009-the-christmas-doll:es:full:narration:deadbeef",
              status: "persisted",
              updatedAt: "2026-07-01T10:06:00.000Z",
              fingerprintInputs: makeFingerprintInputs(),
            },
          ],
          createdAt: "2026-07-01T10:01:00.000Z",
          updatedAt: "2026-07-01T10:06:00.000Z",
          completedAt: "2026-07-01T10:06:00.000Z",
        },
      ],
      warnings: [makeWarning()],
    });

    expect(manifest.locales).toEqual(["en", "es"]);
    expect(manifest.stages[1]?.latestOutcome?.status).toBe("succeeded");
  });

  it("rejects legacy sp as a locale", () => {
    const parsed = workflowLocaleSchema.safeParse("sp");
    expect(parsed.success).toBe(false);
  });

  it("normalizes locale variants to canonical workflow locales", () => {
    expect(workflowLocaleSchema.parse("es-419")).toBe("es");
  });

  it("rejects malformed ids", () => {
    expect(workflowIdSchema.safeParse("wf_missing_parts").success).toBe(false);
    expect(executionIdSchema.safeParse("exec_bad").success).toBe(false);
    expect(stageIdSchema.safeParse("stage:unknown:es:full").success).toBe(false);
    expect(
      artifactIdSchema.safeParse(
        "artifact:009-the-christmas-doll:sp:full:narration:deadbeef"
      ).success
    ).toBe(false);
  });

  it("rejects unknown failure categories", () => {
    const parsed = stageFailureSchema.safeParse(
      makeFailure({ category: "mystery-failure" })
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects outcomes missing lineage on success", () => {
    const parsed = stageOutcomeSchema.safeParse({
      ...makeOutcome(),
      artifact: undefined,
    });
    expect(parsed.success).toBe(false);
  });

  it("enforces quality decision pass semantics", () => {
    const parsed = qualityGateDecisionSchema.safeParse({
      status: "REWRITE_REQUIRED",
      pass: true,
      profile: "production",
      gateVersion: "gate-v1",
      deterministicValidationStatus: "passed",
      failedChecks: ["hook-strength"],
      warnings: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("parses failed batch item state with typed failure", () => {
    const item = batchItemStateSchema.parse({
      customId: "dte:009:localization:es:deadbeef:cafebabe",
      stageId: "stage:localize-full:es:full",
      locale: "es",
      format: "full",
      status: "failed",
      updatedAt: "2026-07-01T10:06:00.000Z",
      failure: makeFailure(),
      fingerprintInputs: makeFingerprintInputs(),
    });

    expect(item.failure?.category).toBe("localization-provider-failure");
  });

  it("round-trips a manifest through stable JSON", () => {
    const manifest = workflowManifestSchema.parse({
      schemaVersion: workflowSchemaVersion,
      workflowId: "wf_story-pipeline_20260701T100000Z_deadbeef",
      executionId: "exec_20260701T100000Z_deadbeef",
      episodeId: "009-the-christmas-doll",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z",
      plannedStageCount: 1,
      stages: [
        {
          stageId: "stage:rewrite-full:en:full",
          stageType: "rewrite-full",
          locale: "en",
          format: "full",
          dependsOn: [],
          status: "planned",
          fingerprintInputs: makeFingerprintInputs(),
          cache: { status: "bypassed", invalidationReasons: ["dry-run"] },
        },
      ],
      attemptHistory: [],
      artifacts: [],
      batches: [],
      warnings: [],
    });

    const serialized = stableSerialize(manifest);
    const reparsed = workflowManifestSchema.parse(JSON.parse(serialized) as unknown);
    expect(reparsed).toEqual(manifest);
  });
});
