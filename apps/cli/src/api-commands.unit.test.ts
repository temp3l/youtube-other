import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  ConnectedApiCliError,
  parseConnectedApiEnvironment,
  registerConnectedApiCommands,
} from "./api-commands.js";

const environment = {
  MEDIAFORGE_API_BASE_URL: "https://api.example.test/root/",
  MEDIAFORGE_API_BEARER_TOKEN: "test-secret-token",
};

async function execute(
  args: string[],
  response: { status?: number; body?: unknown } = {}
) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    return new Response(JSON.stringify(response.body ?? { id: "result-1", revision: 3 }), {
      status: response.status ?? 200,
      headers: { etag: '"revision-3"', "x-request-id": "request-1" },
    });
  }) as typeof fetch;
  let stdout = "";
  const program = new Command().exitOverride();
  registerConnectedApiCommands(program, {
    environment,
    request,
    stdout: { write: (chunk) => { stdout += chunk; } },
  });
  await program.parseAsync(["node", "mediaforge", ...args]);
  return { requests, stdout: JSON.parse(stdout) as Record<string, unknown> };
}

describe("connected API commands", () => {
  it("reads bounded credentials only from the environment", () => {
    expect(parseConnectedApiEnvironment(environment)).toEqual({
      baseUrl: environment.MEDIAFORGE_API_BASE_URL,
      bearerToken: environment.MEDIAFORGE_API_BEARER_TOKEN,
    });
    expect(() => parseConnectedApiEnvironment({})).toThrow(/bounded connected-API/);
    expect(() => parseConnectedApiEnvironment({
      ...environment,
      MEDIAFORGE_API_BASE_URL: "http://api.example.test",
    })).toThrow(/bounded connected-API/);
    expect(() => parseConnectedApiEnvironment({
      ...environment,
      MEDIAFORGE_API_BEARER_TOKEN: "secret with spaces",
    })).toThrow(/bounded connected-API/);
  });

  it("creates projects and typed episodes through the SDK", async () => {
    const project = await execute([
      "api", "project", "create", "--workspace", "workspace 1", "--name", "Pilot",
      "--profile", "dark_truth",
    ]);
    expect(project.requests[0]?.url).toBe("https://api.example.test/root/v1/workspaces/workspace%201/projects");
    expect(project.requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(project.requests[0]?.init?.body))).toEqual({ name: "Pilot", profile: "dark_truth" });
    expect(new Headers(project.requests[0]?.init?.headers).get("authorization")).toBe("Bearer test-secret-token");
    expect(project.stdout).toEqual({
      schemaVersion: "mediaforge.api-cli.v1",
      operation: "createProject",
      status: 200,
      requestId: "request-1",
      etag: '"revision-3"',
      data: { id: "result-1", revision: 3 },
    });
    expect(JSON.stringify(project.stdout)).not.toContain(environment.MEDIAFORGE_API_BEARER_TOKEN);

    const darkTruth = await execute([
      "api", "episode", "create", "--workspace", "w", "--project", "p",
      "--profile", "dark_truth", "--premise", "A premise", "--story-bible", "bible-1",
      "--reference-assets", "asset-1,asset-2",
    ]);
    expect(JSON.parse(String(darkTruth.requests[0]?.init?.body))).toEqual({ content: {
      type: "dark_truth", version: "1", premise: "A premise", storyBibleId: "bible-1",
      referenceAssetIds: ["asset-1", "asset-2"],
    } });

    const mathematics = await execute([
      "api", "episode", "create", "--workspace", "w", "--project", "p",
      "--profile", "mathematics_education", "--curriculum-source", "curriculum-1",
      "--skill", "m5-number-001", "--grade", "5", "--difficulty", "foundation",
      "--presentation-preset", "board", "--audio-preset", "teacher",
    ]);
    expect(JSON.parse(String(mathematics.requests[0]?.init?.body))).toEqual({ content: {
      type: "mathematics_education", version: "1", curriculumSourceId: "curriculum-1",
      skillId: "m5-number-001", grade: 5, difficulty: "foundation",
      presentationPresetId: "board", audioPresetId: "teacher",
    } });
  });

  it("covers workflow, job, and approval operations while preserving concurrency headers", async () => {
    const cases: readonly [string[], string, string, Record<string, string>][] = [
      [["api", "workflow", "start", "--workspace", "w", "--project", "p", "--episode", "e", "--episode-revision", "2", "--locales", "en,de", "--variants", "full,short", "--approval-mode", "required", "--idempotency-key", "idem-start"], "/episodes/e/workflow-runs", "POST", { "idempotency-key": "idem-start" }],
      [["api", "workflow", "status", "--workspace", "w", "--project", "p", "--run", "r"], "/workflow-runs/r", "GET", {}],
      [["api", "workflow", "steps", "--workspace", "w", "--project", "p", "--run", "r"], "/workflow-runs/r/steps", "GET", {}],
      [["api", "workflow", "cancel", "--workspace", "w", "--project", "p", "--run", "r", "--if-match", "\"2\""], "/workflow-runs/r:cancel", "POST", { "if-match": "\"2\"" }],
      [["api", "workflow", "resume", "--workspace", "w", "--project", "p", "--run", "r", "--if-match", "\"3\"", "--idempotency-key", "idem-resume"], "/workflow-runs/r:resume", "POST", { "if-match": "\"3\"", "idempotency-key": "idem-resume" }],
      [["api", "job", "status", "--workspace", "w", "--project", "p", "--job", "j"], "/jobs/j", "GET", {}],
      [["api", "approval", "record", "--workspace", "w", "--project", "p", "--challenge", "c", "--subject", "s", "--expected-revision", "4", "--decision", "approved", "--reason", "Reviewed", "--if-match", "\"4\"", "--idempotency-key", "idem-approval"], "/approvals", "POST", { "if-match": "\"4\"", "idempotency-key": "idem-approval" }],
    ];
    for (const [args, suffix, method, expectedHeaders] of cases) {
      const result = await execute(args);
      const request = result.requests[0];
      expect(request?.url).toContain(suffix);
      expect(request?.init?.method ?? "GET").toBe(method);
      const headers = new Headers(request?.init?.headers);
      for (const [name, value] of Object.entries(expectedHeaders)) expect(headers.get(name)).toBe(value);
      expect(result.stdout.schemaVersion).toBe("mediaforge.api-cli.v1");
    }
  });

  it("maps Problem Details to stable CLI errors without exposing the bearer token", async () => {
    const problem = {
      type: "https://mediaforge.dev/problems/revision_conflict",
      title: "Revision conflict",
      status: 409,
      detail: "The resource changed.",
      code: "revision_conflict",
      requestId: "request-conflict",
      retryable: false,
      errors: [],
    };
    await expect(execute([
      "api", "workflow", "cancel", "--workspace", "w", "--project", "p", "--run", "r",
      "--if-match", "\"1\"",
    ], { status: 409, body: problem })).rejects.toMatchObject<Partial<ConnectedApiCliError>>({
      name: "ConnectedApiCliError", exitCode: 5, problem,
    });
    expect(JSON.stringify(problem)).not.toContain(environment.MEDIAFORGE_API_BEARER_TOKEN);
  });

  it("rejects invalid typed enums before calling fetch", async () => {
    await expect(execute([
      "api", "workflow", "start", "--workspace", "w", "--project", "p", "--episode", "e",
      "--episode-revision", "1", "--locales", "en", "--variants", "vertical",
      "--approval-mode", "required", "--idempotency-key", "idem",
    ])).rejects.toThrow("--variants must be one of");
  });
});
