import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { ApplicationError, createApplicationExecutionContext, type AuthenticatedPrincipal, type OidcJwksAuthenticator, type WorkflowAdmissionCommand, type WorkflowAdmissionHandler, isApplicationError } from "@mediaforge/application";
import { ZodError } from "zod";

import {
  approvalInputSchema,
  episodeInputSchema,
  openApiDocument,
  projectInputSchema,
  workflowAdmissionSchema,
  type ApprovalInput,
  type EpisodeInput,
  type ProjectInput,
  type WorkflowAdmission,
} from "./contract.js";

export interface ApiRequestContext {
  readonly workspaceId: string;
  readonly principal: AuthenticatedPrincipal;
  readonly projectId?: string;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly ifMatch?: string;
}

export interface ApiUseCases {
  createProject(input: ProjectInput, context: ApiRequestContext): Promise<{ readonly id: string; readonly revision: number }>;
  createEpisode(input: EpisodeInput, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">>): Promise<{ readonly id: string; readonly revision: number }>;
  admitWorkflow(input: WorkflowAdmission, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "principal" | "requestId" | "idempotencyKey">>): Promise<{ readonly workflowRunId: string; readonly jobId: string; readonly revision: number }>;
  getWorkflow(runId: string, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">>): Promise<{ readonly id: string; readonly revision: number; readonly status: string } | null>;
  getAsset(assetId: string, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">>): Promise<{ readonly id: string; readonly mimeType: string; readonly bytes: number; readonly sha256: string; readonly lifecycle: string; readonly provenance: string } | null>;
  listValidations(after: string | undefined, size: number, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">>): Promise<{ readonly items: readonly unknown[]; readonly nextAfter?: string }>;
  recordApproval(input: ApprovalInput, context: Required<Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId" | "idempotencyKey" | "ifMatch">>): Promise<{ readonly id: string; readonly jobId: string; readonly revision: number }>;
}

export interface ApiServerOptions {
  readonly useCases: ApiUseCases;
  readonly requestId?: () => string;
  readonly authenticate?: (request: IncomingMessage) => Promise<AuthenticatedPrincipal | null>;
  readonly workflowAdmissionHandler?: Pick<WorkflowAdmissionHandler, "execute">;
  readonly admissionDeadlineMs?: number;
}

/** Bridges the shared OIDC verifier to Node HTTP without duplicating JWT logic. */
export function createOidcRequestAuthenticator(authenticator: Pick<OidcJwksAuthenticator, "authenticate">): NonNullable<ApiServerOptions["authenticate"]> {
  return (request) => authenticator.authenticate(request.headers.authorization);
}

/** Binds the concrete shared handler without exposing HTTP-shaped input to it. */
export function createApiWorkflowAdmissionUseCase(handler: Pick<WorkflowAdmissionHandler, "execute">, deadlineMs = 30_000): ApiUseCases["admitWorkflow"] {
  return async (input, context) => {
    const execution = createApplicationExecutionContext({
      context: {
        actor: { principalId: context.principal.principalId, kind: context.principal.kind, permissions: context.principal.permissions },
        workspace: { id: context.workspaceId },
        authorization: { decision: "allowed", requiredPermissions: ["workflow:write"] },
        requestId: context.requestId,
        correlationId: context.requestId,
        deadlineAt: new Date(Date.now() + deadlineMs).toISOString(),
        idempotency: { key: context.idempotencyKey, fingerprint: crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex") },
      },
    });
    return handler.execute(input as WorkflowAdmissionCommand, execution);
  };
}

const absentUseCases: ApiUseCases = new Proxy({} as ApiUseCases, {
  get: () => async () => {
    throw new ApplicationError("upstream_unavailable", "The application composition is not configured.", true);
  },
});

function etag(revision: number): string { return `"${revision}"`; }
function requestId(request: IncomingMessage, makeId: () => string): string {
  const value = request.headers["x-request-id"];
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u.test(value) ? value : makeId();
}
function idempotencyKey(request: IncomingMessage): string | undefined {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string") return undefined;
  if (value.length < 1 || value.length > 255 || !/^[\x20-\x7E]+$/u.test(value)) throw new ApplicationError("invalid_request", "Idempotency-Key must be printable ASCII and at most 255 characters.", false);
  return value;
}
function ifMatch(request: IncomingMessage): string | undefined {
  const value = request.headers["if-match"];
  return typeof value === "string" ? value : undefined;
}
function problem(response: ServerResponse, requestIdValue: string, error: unknown): void {
  const appError = isApplicationError(error) ? error : undefined;
  const zod = error instanceof ZodError ? error : undefined;
  const status = appError ? ({ authentication_required: 401, authorization_denied: 403, authority_conflict: 409, conflict: 409, idempotency_key_conflict: 409, idempotency_request_in_progress: 409, invalid_request: 400, not_found: 404, precondition_required: 428, precondition_failed: 412, quota_exceeded: 429, state_transition_rejected: 409, upstream_unavailable: 503 } as const)[appError.code] : zod ? 400 : 500;
  const code = appError?.code ?? (zod ? "invalid_request" : "internal_error");
  response.writeHead(status, { "content-type": "application/problem+json", "x-request-id": requestIdValue });
  response.end(JSON.stringify({ type: `https://mediaforge.invalid/problems/${code}`, title: code.replaceAll("_", " "), status, detail: appError?.message ?? (zod ? "Request validation failed." : "Internal server error."), code, requestId: requestIdValue, retryable: appError?.retryable ?? false, errors: zod?.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) ?? [] }));
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const value = Buffer.from(chunk); size += value.length; if (size > 1_000_000) throw new ApplicationError("invalid_request", "Request body exceeds 1 MB.", false); chunks.push(value); }
  if (chunks.length === 0) throw new ApplicationError("invalid_request", "A JSON request body is required.", false);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new ApplicationError("invalid_request", "Request body must be valid JSON.", false); }
}
function json(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void { response.writeHead(status, { "content-type": "application/json", ...headers }); response.end(JSON.stringify(value)); }
function route(pathname: string): { readonly workspace: string; readonly project?: string; readonly episode?: string; readonly run?: string; readonly asset?: string; readonly tail?: string } | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "v1" || parts[1] !== "workspaces" || !parts[2]) return null;
  const result: { workspace: string; project?: string; episode?: string; run?: string; asset?: string; tail?: string } = { workspace: parts[2] };
  if (parts[3] !== "projects" || !parts[4]) return result;
  result.project = parts[4]; result.tail = parts.slice(5).join("/");
  if (parts[5] === "episodes" && parts[6]) result.episode = parts[6];
  if (parts[5] === "workflow-runs" && parts[6]) result.run = parts[6];
  if (parts[5] === "assets" && parts[6]) result.asset = parts[6];
  return result;
}

/** HTTP-only adapter: all policy and state decisions belong to injected use cases. */
export function createApiServer(options: Partial<ApiServerOptions> = {}): http.Server {
  const useCases = options.useCases ?? absentUseCases;
  const admitWorkflow = options.workflowAdmissionHandler
    ? createApiWorkflowAdmissionUseCase(options.workflowAdmissionHandler, options.admissionDeadlineMs)
    : useCases.admitWorkflow;
  const makeRequestId = options.requestId ?? (() => crypto.randomUUID());
  return http.createServer(async (request, response) => {
    const requestIdValue = requestId(request, makeRequestId);
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/v1/openapi.json") return json(response, 200, openApiDocument, { "x-request-id": requestIdValue });
      const matched = route(url.pathname);
      if (!matched) throw new ApplicationError("not_found", "Resource not found.", false);
      const principal = await options.authenticate?.(request);
      if (!principal) throw new ApplicationError("authentication_required", "Authentication is required.", false);
      if (principal.workspaceId !== matched.workspace)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const requiredPermission = request.method === "GET"
        ? "projects:read"
        : matched.tail?.includes("workflow-runs")
          ? "workflow:write"
          : "projects:write";
      if (!principal.permissions.includes(requiredPermission))
        throw new ApplicationError("authorization_denied", "Permission is denied.", false);
      const context = { workspaceId: matched.workspace, principal, ...(matched.project ? { projectId: matched.project } : {}), requestId: requestIdValue };
      if (request.method === "POST" && matched.tail === "") { const result = await useCases.createProject(projectInputSchema.parse(await body(request)), context); return json(response, 201, { id: result.id, revision: result.revision }, { etag: etag(result.revision), "x-request-id": requestIdValue }); }
      if (!matched.project) throw new ApplicationError("not_found", "Resource not found.", false);
      const projectContext = { workspaceId: matched.workspace, projectId: matched.project, principal, requestId: requestIdValue };
      if (request.method === "POST" && matched.tail === "episodes") { const result = await useCases.createEpisode(episodeInputSchema.parse(await body(request)), projectContext); return json(response, 201, { id: result.id, revision: result.revision }, { etag: etag(result.revision), "x-request-id": requestIdValue }); }
      if (request.method === "POST" && matched.episode && matched.tail?.endsWith("workflow-runs")) { const key = idempotencyKey(request); if (!key) throw new ApplicationError("precondition_required", "Idempotency-Key is required.", false); const result = await admitWorkflow(workflowAdmissionSchema.parse(await body(request)), { ...projectContext, idempotencyKey: key }); return json(response, 202, { workflowRunId: result.workflowRunId, jobId: result.jobId, revision: result.revision, links: { workflowRun: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/workflow-runs/${result.workflowRunId}`, job: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}` } }, { location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`, "retry-after": "3", etag: etag(result.revision), "x-request-id": requestIdValue }); }
      if (request.method === "GET" && matched.run && matched.tail?.startsWith("workflow-runs/")) { const result = await useCases.getWorkflow(matched.run, projectContext); if (!result) throw new ApplicationError("not_found", "Resource not found.", false); return json(response, 200, result, { etag: etag(result.revision), "x-request-id": requestIdValue }); }
      if (request.method === "GET" && matched.asset && matched.tail?.startsWith("assets/")) { const result = await useCases.getAsset(matched.asset, projectContext); if (!result) throw new ApplicationError("not_found", "Resource not found.", false); return json(response, 200, result, { "x-request-id": requestIdValue }); }
      if (request.method === "GET" && matched.tail === "validations") { const parsed = Number(url.searchParams.get("page[size]") ?? "25"); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new ApplicationError("invalid_request", "page[size] must be between 1 and 100.", false); const result = await useCases.listValidations(url.searchParams.get("page[after]") ?? undefined, parsed, projectContext); return json(response, 200, result, { "x-request-id": requestIdValue }); }
      if (request.method === "POST" && matched.tail === "approvals") { const key = idempotencyKey(request); const match = ifMatch(request); if (!key || !match) throw new ApplicationError("precondition_required", "Idempotency-Key and If-Match are required.", false); const result = await useCases.recordApproval(approvalInputSchema.parse(await body(request)), { ...projectContext, idempotencyKey: key, ifMatch: match }); return json(response, 202, result, { location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`, etag: etag(result.revision), "x-request-id": requestIdValue }); }
      throw new ApplicationError("not_found", "Resource not found.", false);
    } catch (error) { problem(response, requestIdValue, error); }
  });
}
