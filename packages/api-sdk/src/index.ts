import crypto from "node:crypto";

export * from "./v1-contract.js";

export interface ProblemError {
  readonly path: string;
  readonly message: string;
}

export interface ApiProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly errors: readonly ProblemError[];
}

export class ApiProblemError extends Error {
  public override readonly name = "ApiProblemError";

  public constructor(
    public readonly problem: ApiProblem,
    public readonly response: Response
  ) {
    super(problem.detail);
  }

  public get status(): number { return this.problem.status; }
  public get code(): string { return this.problem.code; }
  public get requestId(): string { return this.problem.requestId; }
  public get retryable(): boolean { return this.problem.retryable; }
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
  readonly requestId?: string;
  readonly etag?: string;
}

export interface WorkspaceQuotaStatus {
  readonly workspaceId: string;
  readonly budgetLimitMinor: string;
  readonly reservedMinor: string;
  readonly settledMinor: string;
  readonly availableMinor: string;
  readonly revision: number;
}

export interface UsageRecord {
  readonly id: string;
  readonly kind: "usage" | "correction";
  readonly subjectId: string;
  readonly operation: string;
  readonly unit: string;
  readonly quantityUnits: string;
  readonly costMinor: string;
  readonly correctionOfUsageId: string | null;
  readonly attemptId: string | null;
  readonly data: unknown;
  readonly occurredAt: string;
}

export interface UsageRecordPage {
  readonly items: readonly UsageRecord[];
  readonly nextAfter?: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly action: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: unknown;
  readonly occurredAt: string;
}

export interface AuditEventPage {
  readonly items: readonly AuditEvent[];
  readonly nextAfter?: string;
}

export type Profile = "dark_truth" | "mathematics_education" | "dynamic_generic" | "history";
export type Variant = "full" | "short";

export interface ProjectInput {
  readonly name: string;
  readonly profile: Profile;
}

export interface Project {
  readonly id: string;
  readonly revision: number;
}

export interface DarkTruthContent {
  readonly type: "dark_truth";
  readonly version: "1";
  readonly premise: string;
  readonly storyBibleId: string;
  readonly referenceAssetIds: readonly string[];
}

export interface MathematicsEducationContent {
  readonly type: "mathematics_education";
  readonly version: "1";
  readonly curriculumSourceId: string;
  readonly skillId: string;
  readonly grade: 5 | 6 | 7 | 8 | 9 | 10;
  readonly difficulty: "foundation" | "standard" | "challenge";
  readonly presentationPresetId: string;
  readonly audioPresetId: string;
}

export interface HistoryContent {
  readonly type: "history";
  readonly version: "1";
  readonly topic: string;
  readonly presetId:
    | "military-campaign"
    | "civilization-rise-fall"
    | "historical-biography"
    | "archaeology-mystery"
    | "world-war-geopolitics"
    | "royal-court-intrigue"
    | "everyday-life"
    | "disaster-pandemic-survival"
    | "technology-trade-transformation"
    | "dark-strange-history";
  readonly format: "short" | "standard" | "long";
  readonly audienceLevel: "general" | "enthusiast" | "academic-lite";
  readonly period?:
    | "prehistory"
    | "ancient"
    | "late antiquity"
    | "medieval"
    | "early modern"
    | "industrial age"
    | "modern"
    | "contemporary history"
    | "cross-period";
}

export type EpisodeContent = DarkTruthContent | MathematicsEducationContent | HistoryContent;

export interface EpisodeInput {
  readonly content: EpisodeContent;
}

export interface Episode {
  readonly id: string;
  readonly revision: number;
  readonly content: EpisodeContent;
}

export interface EpisodeCreated {
  readonly id: string;
  readonly revision: number;
}

export interface WorkflowAdmission {
  readonly template: "episode-production";
  readonly episodeRevision: number;
  readonly locales: readonly string[];
  readonly variants: readonly Variant[];
  readonly approvalMode: "required" | "automatic";
  readonly publicationMode: "none";
}

export interface ResourceLinks {
  readonly workflowRun: string;
  readonly job: string;
}

export interface WorkflowCommandAccepted {
  readonly workflowRunId: string;
  readonly jobId: string;
  readonly revision: number;
  readonly links: ResourceLinks;
}

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface WorkflowRun {
  readonly id: string;
  readonly revision: number;
  readonly status: WorkflowRunStatus;
}

export interface WorkflowStep {
  readonly id: string;
  readonly status: string;
  readonly phase?: string;
  readonly message?: string;
}

export interface WorkflowStepPage {
  readonly items: readonly WorkflowStep[];
}

export type JobStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "retry_scheduled"
  | "cancelling"
  | "cancelled"
  | "succeeded"
  | "succeeded_with_warnings"
  | "partially_succeeded"
  | "failed"
  | "dead_lettered";

/** Redacted asynchronous failure details; raw worker/provider errors never appear here. */
export interface JobFailureProblem {
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly code: "job_failed" | "job_dead_lettered";
  readonly retryable: boolean;
  readonly errors: readonly ProblemError[];
}

export interface Job {
  readonly id: string;
  readonly revision: number;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly cancellationRequested: boolean;
  readonly failure?: JobFailureProblem;
}

export interface Asset {
  readonly id: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly lifecycle: string;
  readonly provenance: string;
}

export interface ValidationResult {
  readonly id: string;
  readonly createdAt: string;
  readonly status?: string;
  readonly code?: string;
  readonly message?: string;
  readonly [key: string]: unknown;
}

export interface ValidationPage {
  readonly items: readonly ValidationResult[];
  readonly nextAfter?: string;
}

export interface PublicationArtifactBinding {
  readonly assetId: string;
  readonly role: string;
  readonly contentHash: string;
}

export interface Publication {
  readonly id: string;
  readonly revision: number;
  readonly status: "pending" | "executing" | "published" | "failed" | "reconciliation_required" | "cancelled";
  readonly workflowRunId: string;
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly approvalArtifactHash: string;
  readonly assetHash: string;
  readonly artifactBindings: readonly PublicationArtifactBinding[];
  readonly channelId: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly scheduledAt: string | null;
  readonly playlistIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApprovalInput {
  readonly challengeId: string;
  readonly subjectId: string;
  readonly expectedRevision: number;
  readonly decision: "approved" | "rejected";
  readonly reason: string;
}

export interface ApprovalAccepted {
  readonly id: string;
  readonly jobId: string;
  readonly revision: number;
}

export interface ApprovalRevocationInput {
  readonly reason: string;
}

export interface ApprovalRevoked {
  readonly id: string;
  readonly revision: number;
  readonly state: "revoked";
  readonly revokedAt: string;
}

export interface HealthStatus {
  readonly status: "ok" | "ready" | "unavailable";
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly requestId?: string;
}

export interface IdempotentRequestOptions extends RequestOptions {
  readonly idempotencyKey: string;
}

export interface ConditionalRequestOptions extends RequestOptions {
  readonly ifMatch: string;
}

export interface ConditionalIdempotentRequestOptions extends RequestOptions {
  readonly ifMatch: string;
  readonly idempotencyKey: string;
}

export interface ValidationListOptions extends RequestOptions {
  readonly size?: number;
  readonly after?: string;
}

export interface WorkspaceListOptions extends RequestOptions {
  readonly size?: number;
  readonly after?: string;
}

export interface PollJobOptions extends RequestOptions {
  readonly defaultIntervalMs?: number;
  readonly terminalStatuses?: ReadonlySet<JobStatus>;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: string | (() => string | Promise<string>);
  readonly request?: typeof fetch;
  readonly requestId?: () => string;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseApiProblem(value: unknown): ApiProblem | null {
  const candidate = object(value);
  if (!candidate || typeof candidate["type"] !== "string" ||
    typeof candidate["title"] !== "string" || typeof candidate["status"] !== "number" ||
    typeof candidate["detail"] !== "string" || typeof candidate["code"] !== "string" ||
    typeof candidate["requestId"] !== "string" || typeof candidate["retryable"] !== "boolean" ||
    !Array.isArray(candidate["errors"])) return null;
  const errors = candidate["errors"].map((value) => object(value));
  if (errors.some((error) => !error || typeof error["path"] !== "string" || typeof error["message"] !== "string")) return null;
  return {
    type: candidate["type"],
    title: candidate["title"],
    status: candidate["status"],
    detail: candidate["detail"],
    code: candidate["code"],
    requestId: candidate["requestId"],
    retryable: candidate["retryable"],
    errors: errors.map((error) => ({ path: error!["path"] as string, message: error!["message"] as string })),
  };
}

function validateRequestId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u.test(value))
    throw new TypeError("requestId must be a safe identifier between 3 and 160 characters.");
}

function validateIdempotencyKey(value: string): void {
  if (value.length < 1 || value.length > 255 || !/^[\x20-\x7E]+$/u.test(value))
    throw new TypeError("idempotencyKey must be printable ASCII and at most 255 characters.");
}

function validateIfMatch(value: string): void {
  if (!/^"(0|[1-9][0-9]*)"$/u.test(value))
    throw new TypeError("ifMatch must be one strong numeric ETag.");
}

export type SdkHeadersInit = Headers | Record<string, string> | [string, string][];

export function withRequestId(headers: SdkHeadersInit | undefined, requestId: string): Headers {
  validateRequestId(requestId);
  const result = new Headers(headers);
  result.set("x-request-id", requestId);
  return result;
}

export function withIdempotencyKey(headers: SdkHeadersInit | undefined, idempotencyKey: string): Headers {
  validateIdempotencyKey(idempotencyKey);
  const result = new Headers(headers);
  result.set("Idempotency-Key", idempotencyKey);
  return result;
}

export function withIfMatch(headers: SdkHeadersInit | undefined, ifMatch: string): Headers {
  validateIfMatch(ifMatch);
  const result = new Headers(headers);
  result.set("If-Match", ifMatch);
  return result;
}

export function formatEtag(revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new TypeError("revision must be a non-negative safe integer.");
  return `"${revision}"`;
}

export function createIdempotencyKey(prefix = "sdk"): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(prefix)) throw new TypeError("prefix must be a safe identifier.");
  return `${prefix}-${crypto.randomUUID()}`;
}

function encodePath(value: string): string {
  if (value.length === 0) throw new TypeError("Resource identifiers must not be empty.");
  return encodeURIComponent(value);
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

async function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^[0-9]+$/u.test(value)) return Number(value) * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

const defaultTerminalJobStatuses: ReadonlySet<JobStatus> = new Set([
  "cancelled", "succeeded", "succeeded_with_warnings", "partially_succeeded",
  "failed", "dead_lettered",
]);

export class MediaforgeApiClient {
  private readonly baseUrl: string;
  private readonly request: typeof fetch;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  public constructor(private readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    if (!this.baseUrl) throw new TypeError("baseUrl is required.");
    this.request = options.request ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private async headers(input: {
    readonly json?: boolean;
    readonly requestId?: string;
    readonly idempotencyKey?: string;
    readonly ifMatch?: string;
  }): Promise<Headers> {
    let headers = new Headers(input.json ? { "content-type": "application/json" } : undefined);
    const token = typeof this.options.accessToken === "function"
      ? await this.options.accessToken()
      : this.options.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    const requestId = input.requestId ?? this.options.requestId?.();
    if (requestId) headers = withRequestId(headers, requestId);
    if (input.idempotencyKey) headers = withIdempotencyKey(headers, input.idempotencyKey);
    if (input.ifMatch) headers = withIfMatch(headers, input.ifMatch);
    return headers;
  }

  private async execute<T>(path: string, input: {
    readonly method?: "GET" | "PATCH" | "POST";
    readonly body?: unknown;
    readonly options?: RequestOptions;
    readonly idempotencyKey?: string;
    readonly ifMatch?: string;
  } = {}): Promise<ApiResponse<T>> {
    throwIfAborted(input.options?.signal);
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: input.method ?? "GET",
      headers: await this.headers({
        ...(input.body !== undefined ? { json: true } : {}),
        ...(input.options?.requestId ? { requestId: input.options.requestId } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.ifMatch ? { ifMatch: input.ifMatch } : {}),
      }),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      ...(input.options?.signal ? { signal: input.options.signal } : {}),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) as unknown : null;
    } catch {
      throw new Error(`API returned invalid JSON with HTTP ${response.status}.`);
    }
    if (!response.ok) {
      const problem = parseApiProblem(parsed) ?? {
        type: "about:blank",
        title: `HTTP ${response.status}`,
        status: response.status,
        detail: "The API request failed without a valid Problem Details response.",
        code: "invalid_problem_response",
        requestId: response.headers.get("x-request-id") ?? "unknown",
        retryable: false,
        errors: [],
      };
      throw new ApiProblemError(problem, response);
    }
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const etag = response.headers.get("etag") ?? undefined;
    return {
      data: parsed as T,
      status: response.status,
      headers: response.headers,
      ...(requestId ? { requestId } : {}),
      ...(etag ? { etag } : {}),
    };
  }

  private projectPath(workspaceId: string, projectId: string): string {
    return `${this.workspacePath(workspaceId)}/projects/${encodePath(projectId)}`;
  }

  private workspacePath(workspaceId: string): string {
    return `/v1/workspaces/${encodePath(workspaceId)}`;
  }

  public getLiveness(options?: RequestOptions): Promise<ApiResponse<HealthStatus>> {
    return this.execute("/health/live", { ...(options ? { options } : {}) });
  }

  public getReadiness(options?: RequestOptions): Promise<ApiResponse<HealthStatus>> {
    return this.execute("/health/ready", { ...(options ? { options } : {}) });
  }

  public getOpenApiDocument(options?: RequestOptions): Promise<ApiResponse<Record<string, unknown>>> {
    return this.execute("/v1/openapi.json", { ...(options ? { options } : {}) });
  }

  public getQuota(workspaceId: string, options?: RequestOptions): Promise<ApiResponse<WorkspaceQuotaStatus>> {
    return this.execute(`${this.workspacePath(workspaceId)}/quota`, { ...(options ? { options } : {}) });
  }

  public listUsageRecords(workspaceId: string, options: WorkspaceListOptions = {}): Promise<ApiResponse<UsageRecordPage>> {
    const query = new URLSearchParams();
    if (options.size !== undefined) query.set("page[size]", String(options.size));
    if (options.after !== undefined) query.set("page[after]", options.after);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.execute(`${this.workspacePath(workspaceId)}/usage-records${suffix}`, { options });
  }

  public async *iterateUsageRecords(workspaceId: string, options: WorkspaceListOptions = {}): AsyncGenerator<UsageRecord, void, void> {
    let after = options.after;
    do {
      const page = await this.listUsageRecords(workspaceId, { ...options, ...(after ? { after } : {}) });
      for (const item of page.data.items) yield item;
      after = page.data.nextAfter;
    } while (after !== undefined);
  }

  public listAuditEvents(workspaceId: string, options: WorkspaceListOptions = {}): Promise<ApiResponse<AuditEventPage>> {
    const query = new URLSearchParams();
    if (options.size !== undefined) query.set("page[size]", String(options.size));
    if (options.after !== undefined) query.set("page[after]", options.after);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.execute(`${this.workspacePath(workspaceId)}/audit-events${suffix}`, { options });
  }

  public async *iterateAuditEvents(workspaceId: string, options: WorkspaceListOptions = {}): AsyncGenerator<AuditEvent, void, void> {
    let after = options.after;
    do {
      const page = await this.listAuditEvents(workspaceId, { ...options, ...(after ? { after } : {}) });
      for (const item of page.data.items) yield item;
      after = page.data.nextAfter;
    } while (after !== undefined);
  }

  public createProject(workspaceId: string, input: ProjectInput, options?: RequestOptions): Promise<ApiResponse<Project>> {
    return this.execute(`${this.workspacePath(workspaceId)}/projects`, { method: "POST", body: input, ...(options ? { options } : {}) });
  }

  public createEpisode(workspaceId: string, projectId: string, input: EpisodeInput, options?: RequestOptions): Promise<ApiResponse<EpisodeCreated>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/episodes`, { method: "POST", body: input, ...(options ? { options } : {}) });
  }

  public getEpisode(workspaceId: string, projectId: string, episodeId: string, options?: RequestOptions): Promise<ApiResponse<Episode>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/episodes/${encodePath(episodeId)}`, { ...(options ? { options } : {}) });
  }

  public replaceEpisodeContent(workspaceId: string, projectId: string, episodeId: string, input: EpisodeInput, options: ConditionalRequestOptions): Promise<ApiResponse<Episode>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/episodes/${encodePath(episodeId)}`, { method: "PATCH", body: input, options, ifMatch: options.ifMatch });
  }

  public admitWorkflow(workspaceId: string, projectId: string, episodeId: string, input: WorkflowAdmission, options: IdempotentRequestOptions): Promise<ApiResponse<WorkflowCommandAccepted>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/episodes/${encodePath(episodeId)}/workflow-runs`, { method: "POST", body: input, options, idempotencyKey: options.idempotencyKey });
  }

  public getWorkflow(workspaceId: string, projectId: string, runId: string, options?: RequestOptions): Promise<ApiResponse<WorkflowRun>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/workflow-runs/${encodePath(runId)}`, { ...(options ? { options } : {}) });
  }

  public listWorkflowSteps(workspaceId: string, projectId: string, runId: string, options?: RequestOptions): Promise<ApiResponse<WorkflowStepPage>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/workflow-runs/${encodePath(runId)}/steps`, { ...(options ? { options } : {}) });
  }

  public cancelWorkflow(workspaceId: string, projectId: string, runId: string, options: ConditionalRequestOptions): Promise<ApiResponse<WorkflowCommandAccepted>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/workflow-runs/${encodePath(runId)}:cancel`, { method: "POST", options, ifMatch: options.ifMatch });
  }

  public resumeWorkflow(workspaceId: string, projectId: string, runId: string, options: ConditionalIdempotentRequestOptions): Promise<ApiResponse<WorkflowCommandAccepted>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/workflow-runs/${encodePath(runId)}:resume`, { method: "POST", options, ifMatch: options.ifMatch, idempotencyKey: options.idempotencyKey });
  }

  public getJob(workspaceId: string, projectId: string, jobId: string, options?: RequestOptions): Promise<ApiResponse<Job>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/jobs/${encodePath(jobId)}`, { ...(options ? { options } : {}) });
  }

  public getAsset(workspaceId: string, projectId: string, assetId: string, options?: RequestOptions): Promise<ApiResponse<Asset>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/assets/${encodePath(assetId)}`, { ...(options ? { options } : {}) });
  }

  public listValidations(workspaceId: string, projectId: string, options: ValidationListOptions = {}): Promise<ApiResponse<ValidationPage>> {
    const query = new URLSearchParams();
    if (options.size !== undefined) query.set("page[size]", String(options.size));
    if (options.after !== undefined) query.set("page[after]", options.after);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.execute(`${this.projectPath(workspaceId, projectId)}/validations${suffix}`, { options });
  }

  public getPublication(workspaceId: string, projectId: string, publicationId: string, options?: RequestOptions): Promise<ApiResponse<Publication>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/publications/${encodePath(publicationId)}`, { ...(options ? { options } : {}) });
  }

  public async *iterateValidations(workspaceId: string, projectId: string, options: ValidationListOptions = {}): AsyncGenerator<ValidationResult, void, void> {
    let after = options.after;
    do {
      const page = await this.listValidations(workspaceId, projectId, {
        ...options,
        ...(after ? { after } : {}),
      });
      for (const item of page.data.items) yield item;
      after = page.data.nextAfter;
    } while (after !== undefined);
  }

  public recordApproval(workspaceId: string, projectId: string, input: ApprovalInput, options: ConditionalIdempotentRequestOptions): Promise<ApiResponse<ApprovalAccepted>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/approvals`, { method: "POST", body: input, options, ifMatch: options.ifMatch, idempotencyKey: options.idempotencyKey });
  }

  public revokeApproval(workspaceId: string, projectId: string, approvalId: string, input: ApprovalRevocationInput, options: ConditionalIdempotentRequestOptions): Promise<ApiResponse<ApprovalRevoked>> {
    return this.execute(`${this.projectPath(workspaceId, projectId)}/approvals/${encodePath(approvalId)}:revoke`, { method: "POST", body: input, options, ifMatch: options.ifMatch, idempotencyKey: options.idempotencyKey });
  }

  public async pollJob(workspaceId: string, projectId: string, jobId: string, options: PollJobOptions = {}): Promise<ApiResponse<Job>> {
    const terminal = options.terminalStatuses ?? defaultTerminalJobStatuses;
    const defaultInterval = options.defaultIntervalMs ?? 3_000;
    if (!Number.isFinite(defaultInterval) || defaultInterval < 0)
      throw new TypeError("defaultIntervalMs must be non-negative.");
    while (true) {
      throwIfAborted(options.signal);
      const result = await this.getJob(workspaceId, projectId, jobId, options);
      if (terminal.has(result.data.status)) return result;
      const delay = retryAfterMilliseconds(result.headers.get("retry-after")) ?? defaultInterval;
      await this.sleep(delay, options.signal);
    }
  }
}

export function verifyWebhookSignature(input: {
  readonly payload: string | Uint8Array;
  readonly timestamp: string;
  readonly signature: string;
  readonly secrets: readonly string[];
  readonly now?: Date;
  readonly toleranceMs?: number;
}): boolean {
  const timestamp = new Date(input.timestamp);
  const now = input.now ?? new Date();
  const tolerance = input.toleranceMs ?? 300_000;
  if (!Number.isFinite(timestamp.getTime()) || tolerance < 0 || Math.abs(now.getTime() - timestamp.getTime()) > tolerance)
    return false;
  return input.secrets.some((secret) => {
    const expected = `v1=${crypto.createHmac("sha256", secret).update(input.timestamp).update(".").update(input.payload).digest("hex")}`;
    return expected.length === input.signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  });
}
