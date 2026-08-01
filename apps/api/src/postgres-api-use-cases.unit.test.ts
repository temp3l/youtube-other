import type { WorkflowAdmissionHandler } from "@mediaforge/application";
import type {
  PostgresClient,
  PostgresPool,
  PostgresQueryResult,
} from "@mediaforge/persistence";
import { describe, expect, it } from "vitest";

import { createPostgresApiUseCases } from "./postgres-api-use-cases.js";

interface JobRow {
  readonly job_id: string;
  readonly revision: number;
  readonly status: string;
  readonly attempt_count: number;
  readonly cancellation_requested: boolean;
  readonly last_error: string | null;
}

describe("PostgreSQL API use cases", () => {
  it("rejects noncanonical mathematics input and project profile mismatches before writes", async () => {
    const statements: string[] = [];
    const query = async <T>(sql: string): Promise<PostgresQueryResult<T>> => {
      statements.push(sql);
      if (sql.includes("SELECT * FROM projects")) return { rows: [{
        workspace_id: "ws-1",
        project_id: "project-1",
        name: "Dark Truth",
        profile: "dark_truth",
        revision: 0,
        created_at: "2026-08-01T11:00:00.000Z",
        updated_at: "2026-08-01T11:00:00.000Z",
      } as unknown as T] };
      return { rows: [] };
    };
    const client: PostgresClient = { query, release: () => undefined };
    const pool: PostgresPool = {
      query,
      connect: async () => client,
      end: async () => undefined,
    };
    const useCases = createPostgresApiUseCases({
      pool,
      workflowAdmissionHandler: {
        execute: async () => ({
          workflowRunId: "unused",
          jobId: "unused",
          revision: 0,
        }),
      },
      cursorSecret: "cursor-secret-that-is-longer-than-32-bytes",
    });
    const context = {
      workspaceId: "ws-1",
      projectId: "project-1",
      requestId: "request-math",
    };
    const noncanonical = {
      content: {
        type: "mathematics_education",
        version: "1",
        curriculumSourceId: "curriculum-1",
        skillId: "M11-NO-001",
        grade: 11,
        difficulty: "advanced",
        presentationPresetId: "presentation-1",
        audioPresetId: "audio-1",
      },
    } as unknown as Parameters<typeof useCases.createEpisode>[0];

    await expect(useCases.createEpisode(noncanonical, context)).rejects.toMatchObject({
      code: "profile_input_invalid",
    });
    expect(statements).toEqual([]);

    const canonical = {
      content: {
        type: "mathematics_education",
        version: "1",
        curriculumSourceId: "curriculum-1",
        skillId: "M5-NO-001",
        grade: 5,
        difficulty: "foundation",
        presentationPresetId: "presentation-1",
        audioPresetId: "audio-1",
      },
    } as const;
    await expect(useCases.createEpisode(canonical, context)).rejects.toMatchObject({
      code: "profile_input_invalid",
    });
    expect(statements.some((sql) => sql.includes("INSERT INTO episodes"))).toBe(false);
  });

  it("projects job progress and replaces raw terminal errors with stable redacted problems", async () => {
    let row: JobRow | null = {
      job_id: "job-1",
      revision: 4,
      status: "failed",
      attempt_count: 2,
      cancellation_requested: false,
      last_error: "provider said Bearer sk-secret and returned an internal payload",
    };
    const query = async <T>(sql: string): Promise<PostgresQueryResult<T>> => ({
      rows: sql.includes("SELECT job.job_id") && row
        ? [row as unknown as T]
        : [],
      rowCount: sql.includes("SELECT job.job_id") && row ? 1 : 0,
    });
    const client: PostgresClient = { query, release: () => undefined };
    const pool: PostgresPool = {
      query,
      connect: async () => client,
      end: async () => undefined,
    };
    const workflowAdmissionHandler: Pick<WorkflowAdmissionHandler, "execute"> = {
      execute: async () => ({ workflowRunId: "unused", jobId: "unused", revision: 0 }),
    };
    const useCases = createPostgresApiUseCases({
      pool,
      workflowAdmissionHandler,
      cursorSecret: "a".repeat(32),
    });
    const context = {
      workspaceId: "ws-1",
      projectId: "project-1",
      requestId: "request-1",
    };

    const failed = await useCases.getJob("job-1", context);
    expect(failed).toEqual({
      id: "job-1",
      revision: 4,
      status: "failed",
      attempts: 2,
      cancellationRequested: false,
      failure: {
        type: "https://mediaforge.invalid/problems/job-failed",
        title: "Job failed",
        detail: "The job did not complete successfully.",
        code: "job_failed",
        retryable: false,
        errors: [],
      },
    });
    expect(JSON.stringify(failed)).not.toContain("sk-secret");
    expect(JSON.stringify(failed)).not.toContain("internal payload");

    row = {
      ...row!,
      revision: 5,
      status: "retry_scheduled",
      attempt_count: 3,
      cancellation_requested: true,
    };
    await expect(useCases.getJob("job-1", context)).resolves.toEqual({
      id: "job-1",
      revision: 5,
      status: "retry_scheduled",
      attempts: 3,
      cancellationRequested: true,
    });

    row = { ...row, revision: 6, status: "dead_lettered" };
    await expect(useCases.getJob("job-1", context)).resolves.toMatchObject({
      status: "dead_lettered",
      failure: {
        code: "job_dead_lettered",
        retryable: false,
      },
    });
  });

  it("encodes quota and usage bigints as strings and signs tenant-bound page cursors", async () => {
    const readValues: Array<readonly unknown[] | undefined> = [];
    let usageReads = 0;
    let auditReads = 0;
    const query = async <T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>> => {
      if (sql.includes("FROM workspace_quota_policies AS policy")) return { rows: [{
        budget_limit_minor: "90071992547409930",
        revision: 8,
        reserved_minor: "10",
        settled_minor: "20",
      } as unknown as T] };
      if (sql.includes("FROM usage_ledger")) {
        readValues.push(values);
        usageReads += 1;
        return { rows: usageReads === 1 ? [
          { usage_id: "usage-1", kind: "usage", subject_id: "run-1", operation: "render", unit: "frame", quantity_units: "9007199254740993", cost_minor: "42", correction_of_usage_id: null, attempt_id: "attempt-1", data: {}, occurred_at: "2026-08-01T12:00:00.000Z" } as unknown as T,
          { usage_id: "usage-2", kind: "correction", subject_id: "run-1", operation: "render", unit: "frame", quantity_units: "-1", cost_minor: "-1", correction_of_usage_id: "usage-1", attempt_id: null, data: {}, occurred_at: "2026-08-01T12:00:01.000Z" } as unknown as T,
        ] : [] };
      }
      if (sql.includes("FROM audit_facts")) {
        readValues.push(values);
        auditReads += 1;
        return { rows: auditReads === 1 ? [
          { audit_id: "audit-1", action: "workflow.admitted", subject_id: "run-1", actor_id: "user-1", correlation_id: "request-1", causation_id: null, data: {}, occurred_at: "2026-08-01T12:01:00.000Z" } as unknown as T,
          { audit_id: "audit-2", action: "workflow.started", subject_id: "run-1", actor_id: "worker-1", correlation_id: "request-1", causation_id: "audit-1", data: {}, occurred_at: "2026-08-01T12:01:01.000Z" } as unknown as T,
        ] : [] };
      }
      return { rows: [] };
    };
    const client: PostgresClient = { query, release: () => undefined };
    const pool: PostgresPool = { query, connect: async () => client, end: async () => undefined };
    const useCases = createPostgresApiUseCases({
      pool,
      workflowAdmissionHandler: { execute: async () => ({ workflowRunId: "unused", jobId: "unused", revision: 0 }) },
      cursorSecret: "cursor-secret-that-is-longer-than-32-bytes",
    });
    const context = { workspaceId: "ws-1", requestId: "request-1" };

    await expect(useCases.getQuota(context)).resolves.toEqual({
      workspaceId: "ws-1",
      budgetLimitMinor: "90071992547409930",
      reservedMinor: "10",
      settledMinor: "20",
      availableMinor: "90071992547409900",
      revision: 8,
    });
    const usage = await useCases.listUsageRecords(undefined, 1, context);
    expect(usage).toMatchObject({
      items: [{ quantityUnits: "9007199254740993", costMinor: "42" }],
      nextAfter: expect.any(String),
    });
    expect(usage.nextAfter).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    await expect(useCases.listUsageRecords(usage.nextAfter, 1, context)).resolves.toEqual({ items: [] });
    expect(readValues[1]).toEqual(["ws-1", "2026-08-01T12:00:00.000Z", "usage-1", 2]);

    const audit = await useCases.listAuditEvents(undefined, 1, context);
    expect(audit).toMatchObject({ items: [{ id: "audit-1", actorId: "user-1" }], nextAfter: expect.any(String) });
    await expect(useCases.listAuditEvents(`${audit.nextAfter}x`, 1, context))
      .rejects.toMatchObject({ code: "invalid_request" });
    await expect(useCases.listAuditEvents(usage.nextAfter, 1, context))
      .rejects.toMatchObject({ code: "invalid_request" });
    await expect(useCases.listUsageRecords(usage.nextAfter, 1, { ...context, workspaceId: "ws-2" }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("replaces episode content with scoped CAS evidence and distinguishes missing from stale", async () => {
    let state: "success" | "stale" | "missing" | "race" = "success";
    const replacementValues: Array<readonly unknown[]> = [];
    const query = async <T>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<T>> => {
      if (sql.includes("SELECT * FROM projects")) return { rows: [{
        workspace_id: "ws-1", project_id: "project-1", name: "Project", profile: "dark_truth", revision: 0,
        created_at: "2026-08-01T11:00:00.000Z", updated_at: "2026-08-01T11:00:00.000Z",
      } as unknown as T] };
      if (sql.includes("FROM episodes WHERE workspace_id")) return { rows: state === "missing" ? [] : [{
        workspace_id: "ws-1", project_id: "project-1", episode_id: "episode-1",
        content: { type: "dark_truth", version: "1", premise: "Original", storyBibleId: "bible-1", referenceAssetIds: [] },
        revision: 2, created_at: "2026-08-01T11:00:00.000Z", updated_at: "2026-08-01T11:00:00.000Z",
      } as unknown as T] };
      if (sql.includes("WITH updated AS")) {
        replacementValues.push(values ?? []);
        if (state === "race") return { rows: [] };
        return { rows: [{
          workspace_id: "ws-1", project_id: "project-1", episode_id: "episode-1",
          content: JSON.parse(values![5] as string), revision: 3,
          created_at: "2026-08-01T11:00:00.000Z", updated_at: "2026-08-01T12:00:00.000Z",
          revision_id: values![4], previous_revision: 2, evidence: JSON.parse(values![6] as string),
        } as unknown as T] };
      }
      return { rows: [] };
    };
    const client: PostgresClient = { query, release: () => undefined };
    const pool: PostgresPool = { query, connect: async () => client, end: async () => undefined };
    const useCases = createPostgresApiUseCases({
      pool,
      workflowAdmissionHandler: { execute: async () => ({ workflowRunId: "unused", jobId: "unused", revision: 0 }) },
      cursorSecret: "cursor-secret-that-is-longer-than-32-bytes",
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      createId: (prefix) => `${prefix}-generated`,
    });
    const input = { content: { type: "dark_truth", version: "1", premise: "Replacement", storyBibleId: "bible-1", referenceAssetIds: [] } } as const;
    const context = {
      workspaceId: "ws-1",
      projectId: "project-1",
      principal: { principalId: "user-1", workspaceId: "ws-1", permissions: ["content.write"], kind: "user" as const },
      requestId: "request-episode-replace",
      ifMatch: '"2"',
    };

    await expect(useCases.replaceEpisodeContent("episode-1", input, context)).resolves.toEqual({
      id: "episode-1", revision: 3, content: input.content,
    });
    expect(replacementValues[0]?.slice(0, 5)).toEqual(["ws-1", "project-1", "episode-1", 2, "episode-revision-generated"]);
    expect(JSON.parse(replacementValues[0]?.[6] as string)).toEqual({
      kind: "api.episode_content_replacement",
      requestId: "request-episode-replace",
      actorPrincipalId: "user-1",
      expectedRevision: 2,
    });

    state = "stale";
    await expect(useCases.replaceEpisodeContent("episode-1", input, { ...context, ifMatch: '"1"' }))
      .rejects.toMatchObject({ code: "precondition_failed" });
    state = "missing";
    await expect(useCases.replaceEpisodeContent("episode-1", input, context))
      .rejects.toMatchObject({ code: "not_found" });
    state = "race";
    await expect(useCases.replaceEpisodeContent("episode-1", input, context))
      .rejects.toMatchObject({ code: "precondition_failed" });
  });
});
