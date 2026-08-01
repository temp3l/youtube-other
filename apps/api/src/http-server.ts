import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import {
  ApplicationError,
  createApplicationExecutionContext,
  type AuthenticatedPrincipal,
  type OidcJwksAuthenticator,
  type WorkflowAdmissionCommand,
  type WorkflowAdmissionHandler,
  isApplicationError,
} from "@mediaforge/application";
import { ZodError } from "zod";

import {
  approvalInputSchema,
  approvalRevocationInputSchema,
  openApiDocument,
  parseEpisodeInput,
  projectInputSchema,
  workflowAdmissionSchema,
  type ApprovalInput,
  type ApprovalRevocationInput,
  type EpisodeInput,
  type ProjectInput,
  type WorkflowAdmission,
} from "./contract.js";
import {
  genreSpeechPolicyInputSchema,
  speechEstimateInputSchema,
  speechEstimateResponseSchema,
  speechGenerationInputSchema,
  speechGenerationResponseSchema,
  speechRetryInputSchema,
  speechPolicyResponseSchema,
  speechProfileResponseSchema,
  speechProfileVersionResponseSchema,
  videoSpeechOverrideInputSchema,
  voiceProfileInputSchema,
  voiceProfileVersionInputSchema,
  type GenreSpeechPolicyInput,
  type SpeechEstimateInput,
  type SpeechEstimateResponse,
  type SpeechGenerationInput,
  type SpeechGenerationResponse,
  type SpeechRetryInput,
  type SpeechPolicyResponse,
  type SpeechProfileResponse,
  type SpeechProfileVersionResponse,
  type VideoSpeechOverrideInput,
  type VoiceProfileInput,
  type VoiceProfileVersionInput,
} from "./speech-contract.js";

export interface ApiRequestContext {
  readonly workspaceId: string;
  readonly principal: AuthenticatedPrincipal;
  readonly projectId?: string;
  readonly episodeId?: string;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly ifMatch?: string;
}

export type ApiJobStatus =
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

/** A persisted asynchronous failure; HTTP status and raw internal causes are intentionally absent. */
export interface ApiJobFailure {
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly code: "job_failed" | "job_dead_lettered";
  readonly retryable: boolean;
  readonly errors: readonly {
    readonly path: string;
    readonly message: string;
  }[];
}

export interface ApiJob {
  readonly id: string;
  readonly revision: number;
  readonly status: ApiJobStatus;
  readonly attempts: number;
  readonly cancellationRequested: boolean;
  readonly failure?: ApiJobFailure;
}

export interface ApiWorkspaceQuotaStatus {
  readonly workspaceId: string;
  readonly budgetLimitMinor: string;
  readonly reservedMinor: string;
  readonly settledMinor: string;
  readonly availableMinor: string;
  readonly revision: number;
}

export interface ApiUsageRecord {
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

export interface ApiAuditEvent {
  readonly id: string;
  readonly action: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly data: unknown;
  readonly occurredAt: string;
}

export interface ApiPublicationArtifactBinding {
  readonly assetId: string;
  readonly role: string;
  readonly contentHash: string;
}

export interface ApiPublication {
  readonly id: string;
  readonly revision: number;
  readonly status:
    | "pending"
    | "executing"
    | "published"
    | "failed"
    | "reconciliation_required"
    | "cancelled";
  readonly workflowRunId: string;
  readonly approvalId: string;
  readonly approvalRevision: number;
  readonly approvalArtifactHash: string;
  readonly assetHash: string;
  readonly artifactBindings: readonly ApiPublicationArtifactBinding[];
  readonly channelId: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly scheduledAt: string | null;
  readonly playlistIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiUseCases {
  getQuota(
    context: Required<Pick<ApiRequestContext, "workspaceId" | "requestId">>
  ): Promise<ApiWorkspaceQuotaStatus | null>;
  listUsageRecords(
    after: string | undefined,
    size: number,
    context: Required<Pick<ApiRequestContext, "workspaceId" | "requestId">>
  ): Promise<{
    readonly items: readonly ApiUsageRecord[];
    readonly nextAfter?: string;
  }>;
  listAuditEvents(
    after: string | undefined,
    size: number,
    context: Required<Pick<ApiRequestContext, "workspaceId" | "requestId">>
  ): Promise<{
    readonly items: readonly ApiAuditEvent[];
    readonly nextAfter?: string;
  }>;
  createProject(
    input: ProjectInput,
    context: ApiRequestContext
  ): Promise<{ readonly id: string; readonly revision: number }>;
  createEpisode(
    input: EpisodeInput,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{ readonly id: string; readonly revision: number }>;
  getEpisode(
    episodeId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly content: unknown;
  } | null>;
  replaceEpisodeContent(
    episodeId: string,
    input: EpisodeInput,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "projectId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly content: EpisodeInput["content"];
  }>;
  admitWorkflow(
    input: WorkflowAdmission,
    context: Required<
      Pick<
        ApiRequestContext,
        | "workspaceId"
        | "projectId"
        | "episodeId"
        | "principal"
        | "requestId"
        | "idempotencyKey"
      >
    >
  ): Promise<{
    readonly workflowRunId: string;
    readonly jobId: string;
    readonly revision: number;
  }>;
  getWorkflow(
    runId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly status: string;
  } | null>;
  listWorkflowSteps(
    runId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{ readonly items: readonly unknown[] }>;
  cancelWorkflow(
    runId: string,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "projectId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<{
    readonly workflowRunId: string;
    readonly jobId: string;
    readonly revision: number;
  }>;
  resumeWorkflow(
    runId: string,
    context: Required<
      Pick<
        ApiRequestContext,
        | "workspaceId"
        | "projectId"
        | "principal"
        | "requestId"
        | "ifMatch"
        | "idempotencyKey"
      >
    >
  ): Promise<{
    readonly workflowRunId: string;
    readonly jobId: string;
    readonly revision: number;
  }>;
  getJob(
    jobId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<ApiJob | null>;
  getAsset(
    assetId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{
    readonly id: string;
    readonly mimeType: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly lifecycle: string;
    readonly provenance: string;
  } | null>;
  listValidations(
    after: string | undefined,
    size: number,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<{
    readonly items: readonly unknown[];
    readonly nextAfter?: string;
  }>;
  getPublication(
    publicationId: string,
    context: Required<
      Pick<ApiRequestContext, "workspaceId" | "projectId" | "requestId">
    >
  ): Promise<ApiPublication | null>;
  recordApproval(
    input: ApprovalInput,
    context: Required<
      Pick<
        ApiRequestContext,
        | "workspaceId"
        | "projectId"
        | "principal"
        | "requestId"
        | "idempotencyKey"
        | "ifMatch"
      >
    >
  ): Promise<{
    readonly id: string;
    readonly jobId: string;
    readonly revision: number;
  }>;
  revokeApproval(
    approvalId: string,
    input: ApprovalRevocationInput,
    context: Required<
      Pick<
        ApiRequestContext,
        | "workspaceId"
        | "projectId"
        | "principal"
        | "requestId"
        | "idempotencyKey"
        | "ifMatch"
      >
    >
  ): Promise<{
    readonly id: string;
    readonly revision: number;
    readonly state: "revoked";
    readonly revokedAt: string;
    readonly replayed: boolean;
  }>;
}

/** Application boundary for all speech entry points. Provider adapters are never HTTP dependencies. */
export interface SpeechApiUseCases {
  estimate(
    input: SpeechEstimateInput,
    context: ApiRequestContext
  ): Promise<SpeechEstimateResponse>;
  generate(
    input: SpeechGenerationInput,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "idempotencyKey"
      >
    >
  ): Promise<SpeechGenerationResponse>;
  getGeneration(
    generationId: string,
    context: ApiRequestContext
  ): Promise<SpeechGenerationResponse | null>;
  retryGeneration(
    generationId: string,
    input: SpeechRetryInput,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "idempotencyKey"
      >
    >
  ): Promise<SpeechGenerationResponse>;
  cancelGeneration(
    generationId: string,
    context: ApiRequestContext
  ): Promise<SpeechGenerationResponse>;
  listProfiles(
    context: ApiRequestContext
  ): Promise<readonly SpeechProfileResponse[]>;
  createProfile(
    input: VoiceProfileInput,
    context: ApiRequestContext
  ): Promise<SpeechProfileResponse>;
  createProfileVersion(
    profileId: string,
    input: VoiceProfileVersionInput,
    context: ApiRequestContext
  ): Promise<SpeechProfileVersionResponse>;
  validateProfileVersion(
    versionId: string,
    context: ApiRequestContext
  ): Promise<SpeechProfileVersionResponse>;
  activateProfileVersion(
    versionId: string,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<SpeechProfileVersionResponse>;
  deprecateProfileVersion(
    versionId: string,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<SpeechProfileVersionResponse>;
  setGenreSpeechPolicy(
    genreId: string,
    input: GenreSpeechPolicyInput,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<SpeechPolicyResponse>;
  setVideoSpeechOverride(
    videoId: string,
    input: VideoSpeechOverrideInput,
    context: Required<
      Pick<
        ApiRequestContext,
        "workspaceId" | "principal" | "requestId" | "ifMatch"
      >
    >
  ): Promise<SpeechPolicyResponse>;
}

export interface ApiServerOptions {
  readonly useCases: ApiUseCases;
  readonly requestId?: () => string;
  readonly authenticate?: (
    request: IncomingMessage
  ) => Promise<AuthenticatedPrincipal | null>;
  readonly workflowAdmissionHandler?: Pick<WorkflowAdmissionHandler, "execute">;
  readonly admissionDeadlineMs?: number;
  readonly readiness?: () => Promise<boolean>;
  /** Optional until speech composition is deployed; speech routes return a clear 503 meanwhile. */
  readonly speechUseCases?: SpeechApiUseCases;
}

/** Bridges the shared OIDC verifier to Node HTTP without duplicating JWT logic. */
export function createOidcRequestAuthenticator(
  authenticator: Pick<OidcJwksAuthenticator, "authenticate">
): NonNullable<ApiServerOptions["authenticate"]> {
  return (request) => authenticator.authenticate(request.headers.authorization);
}

/** Applies durable membership, revocation, and stored permissions after token verification. */
export function createDirectoryBackedRequestAuthenticator(input: {
  readonly authenticateToken: NonNullable<ApiServerOptions["authenticate"]>;
  readonly directory: {
    findActive(
      workspaceId: string,
      oidcSubject: string
    ): Promise<{
      readonly principalId: string;
      readonly kind: "user" | "service" | "worker";
      readonly permissions: readonly string[];
    } | null>;
  };
}): NonNullable<ApiServerOptions["authenticate"]> {
  return async (request) => {
    const token = await input.authenticateToken(request);
    if (!token) return null;
    const membership = await input.directory.findActive(
      token.workspaceId,
      token.principalId
    );
    if (!membership) return null;
    const asserted = new Set(token.permissions);
    return {
      principalId: membership.principalId,
      workspaceId: token.workspaceId,
      kind: membership.kind,
      permissions: membership.permissions.filter((permission) =>
        asserted.has(permission)
      ),
    };
  };
}

/** Binds the concrete shared handler without exposing HTTP-shaped input to it. */
export function createApiWorkflowAdmissionUseCase(
  handler: Pick<WorkflowAdmissionHandler, "execute">,
  deadlineMs = 30_000
): ApiUseCases["admitWorkflow"] {
  return async (input, context) => {
    const command = {
      ...input,
      projectId: context.projectId,
      episodeId: context.episodeId,
    };
    const normalizedRoute = `/v1/workspaces/${context.workspaceId}/projects/${context.projectId}/episodes/${context.episodeId}/workflow-runs`;
    const scopedIdempotencyKey = `v1:${crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          principalId: context.principal.principalId,
          method: "POST",
          route: normalizedRoute,
          key: context.idempotencyKey,
        })
      )
      .digest("hex")}`;
    const execution = createApplicationExecutionContext({
      context: {
        actor: {
          principalId: context.principal.principalId,
          kind: context.principal.kind,
          permissions: context.principal.permissions,
        },
        workspace: { id: context.workspaceId },
        authorization: {
          decision: "allowed",
          requiredPermissions: ["workflow.start"],
        },
        requestId: context.requestId,
        correlationId: context.requestId,
        deadlineAt: new Date(Date.now() + deadlineMs).toISOString(),
        idempotency: {
          key: scopedIdempotencyKey,
          fingerprint: crypto
            .createHash("sha256")
            .update(
              JSON.stringify({
                contractVersion: "v1",
                method: "POST",
                route: normalizedRoute,
                body: input,
              })
            )
            .digest("hex"),
        },
      },
    });
    return handler.execute(command as WorkflowAdmissionCommand, execution);
  };
}

const absentUseCases: ApiUseCases = new Proxy({} as ApiUseCases, {
  get: () => async () => {
    throw new ApplicationError(
      "upstream_unavailable",
      "The application composition is not configured.",
      true
    );
  },
});
const absentSpeechUseCases: SpeechApiUseCases = new Proxy(
  {} as SpeechApiUseCases,
  {
    get: () => async () => {
      throw new ApplicationError(
        "upstream_unavailable",
        "Speech generation is not configured in this deployment.",
        true
      );
    },
  }
);

function etag(revision: number): string {
  return `"${revision}"`;
}
function requestId(request: IncomingMessage, makeId: () => string): string {
  const value = request.headers["x-request-id"];
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/u.test(value)
    ? value
    : makeId();
}
function idempotencyKey(request: IncomingMessage): string | undefined {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string") return undefined;
  if (value.length < 1 || value.length > 255 || !/^[\x20-\x7E]+$/u.test(value))
    throw new ApplicationError(
      "invalid_request",
      "Idempotency-Key must be printable ASCII and at most 255 characters.",
      false
    );
  return value;
}
function ifMatch(request: IncomingMessage): string | undefined {
  const value = request.headers["if-match"];
  return typeof value === "string" ? value : undefined;
}
function strongIfMatch(request: IncomingMessage): string {
  const value = ifMatch(request);
  if (!value)
    throw new ApplicationError(
      "precondition_required",
      "If-Match is required.",
      false
    );
  if (!/^"(0|[1-9][0-9]*)"$/u.test(value))
    throw new ApplicationError(
      "precondition_failed",
      "If-Match must contain one strong numeric ETag.",
      false
    );
  return value;
}
const speechProblemStatuses = {
  SPEECH_PROFILE_NOT_FOUND: 404,
  SPEECH_PROFILE_VERSION_INACTIVE: 409,
  SPEECH_PROFILE_INVALID: 422,
  SPEECH_CONSENT_MISSING: 422,
  SPEECH_CONSENT_EXPIRED: 422,
  SPEECH_CONSENT_REVOKED: 422,
  SPEECH_PROVIDER_DISABLED: 503,
  SPEECH_PROVIDER_AUTHENTICATION_FAILED: 503,
  SPEECH_PROVIDER_RATE_LIMITED: 429,
  SPEECH_PROVIDER_TIMEOUT: 504,
  SPEECH_PROVIDER_UNAVAILABLE: 503,
  SPEECH_PROVIDER_REJECTED_INPUT: 422,
  SPEECH_PROVIDER_INVALID_RESPONSE: 502,
  SPEECH_QUOTA_EXCEEDED: 429,
  SPEECH_CACHE_CLAIM_CONFLICT: 409,
  SPEECH_AUDIO_PROCESSING_FAILED: 503,
  SPEECH_ARTIFACT_PERSISTENCE_FAILED: 503,
  SPEECH_GENERATION_NOT_RETRYABLE: 409,
  SPEECH_GENERATION_CANCELLED: 409,
} as const;
type SpeechProblemCode = keyof typeof speechProblemStatuses;
function speechProblem(error: unknown):
  | {
      readonly code: SpeechProblemCode;
      readonly message: string;
      readonly retryable: boolean;
    }
  | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly retryClass?: unknown;
  };
  if (
    typeof candidate.code !== "string" ||
    !(candidate.code in speechProblemStatuses)
  )
    return undefined;
  return {
    code: candidate.code as SpeechProblemCode,
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : "Speech generation failed.",
    retryable: candidate.retryClass === "retryable",
  };
}
function problem(
  response: ServerResponse,
  requestIdValue: string,
  error: unknown
): void {
  const appError = isApplicationError(error) ? error : undefined;
  const zod = error instanceof ZodError ? error : undefined;
  const speech = speechProblem(error);
  const status = appError
    ? (
        {
          authentication_required: 401,
          authorization_denied: 403,
          authority_conflict: 409,
          conflict: 409,
          idempotency_key_conflict: 409,
          idempotency_request_in_progress: 409,
          invalid_request: 400,
          not_found: 404,
          precondition_required: 428,
          precondition_failed: 412,
          profile_input_invalid: 422,
          quota_exceeded: 429,
          state_transition_rejected: 409,
          upstream_unavailable: 503,
        } as const
      )[appError.code]
    : speech
      ? speechProblemStatuses[speech.code]
      : zod
        ? 400
        : 500;
  const code =
    appError?.code ??
    speech?.code ??
    (zod ? "invalid_request" : "internal_error");
  const applicationErrors =
    appError?.code === "profile_input_invalid"
      ? appError.details.slice(0, 20).map((detail) => ({
          path: /^[A-Za-z0-9_.-]{1,160}$/u.test(detail) ? detail : "content",
          message: "Value is not supported by the selected profile capability.",
        }))
      : [];
  response.writeHead(status, {
    "content-type": "application/problem+json",
    "x-request-id": requestIdValue,
  });
  response.end(
    JSON.stringify({
      type: `https://mediaforge.invalid/problems/${code}`,
      title: code.replaceAll("_", " "),
      status,
      detail:
        appError?.message ??
        speech?.message ??
        (zod ? "Request validation failed." : "Internal server error."),
      code,
      requestId: requestIdValue,
      retryable: appError?.retryable ?? speech?.retryable ?? false,
      errors:
        zod?.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })) ?? applicationErrors,
    })
  );
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > 1_000_000)
      throw new ApplicationError(
        "invalid_request",
        "Request body exceeds 1 MB.",
        false
      );
    chunks.push(value);
  }
  if (chunks.length === 0)
    throw new ApplicationError(
      "invalid_request",
      "A JSON request body is required.",
      false
    );
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApplicationError(
      "invalid_request",
      "Request body must be valid JSON.",
      false
    );
  }
}
function json(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(value));
}
function pageSize(url: URL): number {
  const parsed = Number(url.searchParams.get("page[size]") ?? "25");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new ApplicationError(
      "invalid_request",
      "page[size] must be between 1 and 100.",
      false
    );
  return parsed;
}
function route(pathname: string): {
  readonly workspace: string;
  readonly project?: string;
  readonly episode?: string;
  readonly run?: string;
  readonly runAction?: "cancel" | "resume";
  readonly job?: string;
  readonly asset?: string;
  readonly publication?: string;
  readonly approval?: string;
  readonly approvalAction?: "revoke";
  readonly tail?: string;
} | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "v1" || parts[1] !== "workspaces" || !parts[2]) return null;
  const result: {
    workspace: string;
    project?: string;
    episode?: string;
    run?: string;
    runAction?: "cancel" | "resume";
    job?: string;
    asset?: string;
    publication?: string;
    approval?: string;
    approvalAction?: "revoke";
    tail?: string;
  } = { workspace: parts[2] };
  if (parts[3] !== "projects") {
    result.tail = parts.slice(3).join("/");
    return result;
  }
  if (!parts[4]) {
    result.tail = "";
    return result;
  }
  result.project = parts[4];
  result.tail = parts.slice(5).join("/");
  if (parts[5] === "episodes" && parts[6]) result.episode = parts[6];
  if (parts[5] === "workflow-runs" && parts[6]) {
    const action = parts[6].match(/^(.+):(cancel|resume)$/u);
    if (action?.[1] && (action[2] === "cancel" || action[2] === "resume")) {
      result.run = action[1];
      result.runAction = action[2];
    } else {
      result.run = parts[6];
    }
  }
  if (parts[5] === "jobs" && parts[6]) result.job = parts[6];
  if (parts[5] === "assets" && parts[6]) result.asset = parts[6];
  if (parts[5] === "publications" && parts[6]) result.publication = parts[6];
  if (parts[5] === "approvals" && parts[6]) {
    const action = parts[6].match(/^(.+):revoke$/u);
    if (action?.[1]) {
      result.approval = action[1];
      result.approvalAction = "revoke";
    }
  }
  return result;
}

type ApiPermission =
  | "audit.read"
  | "approval.decide"
  | "content.read"
  | "content.write"
  | "publication.read"
  | "validation.read"
  | "usage.read"
  | "workflow.cancel"
  | "workflow.start";

/** Resolves authorization from the exact implemented operation, not only its HTTP verb. */
function requiredPermission(
  method: string | undefined,
  matched: NonNullable<ReturnType<typeof route>>
): ApiPermission | null {
  if (
    method === "GET" &&
    !matched.project &&
    (matched.tail === "quota" || matched.tail === "usage-records")
  )
    return "usage.read";
  if (method === "GET" && !matched.project && matched.tail === "audit-events")
    return "audit.read";
  if (method === "POST" && !matched.project && matched.tail === "")
    return "content.write";
  if (method === "POST" && matched.tail === "speech/estimates")
    return "content.read";
  if (
    method === "GET" &&
    (matched.tail === "speech/profiles" ||
      /^speech\/generations\/[^/]+$/u.test(matched.tail ?? ""))
  )
    return "content.read";
  if (
    method === "POST" &&
    (matched.tail === "speech/generations" ||
      matched.tail === "speech/profiles" ||
      /^speech\/profiles\/[^/]+\/versions$/u.test(matched.tail ?? "") ||
      /^speech\/generations\/[^/]+:(retry|cancel)$/u.test(matched.tail ?? "") ||
      /^speech\/profile-versions\/[^/]+(?:\/activate|:validate|:deprecate)$/u.test(
        matched.tail ?? ""
      ))
  )
    return "content.write";
  if (
    method === "PUT" &&
    (/^genres\/[^/]+\/speech-policy$/u.test(matched.tail ?? "") ||
      /^videos\/[^/]+\/speech-override$/u.test(matched.tail ?? ""))
  )
    return "content.write";
  if (!matched.project) return null;
  if (method === "POST" && matched.tail === "episodes") return "content.write";
  if (
    method === "GET" &&
    matched.episode &&
    matched.tail === `episodes/${matched.episode}`
  )
    return "content.read";
  if (
    method === "PATCH" &&
    matched.episode &&
    matched.tail === `episodes/${matched.episode}`
  )
    return "content.write";
  if (
    method === "POST" &&
    matched.episode &&
    matched.tail === `episodes/${matched.episode}/workflow-runs`
  )
    return "workflow.start";
  if (
    method === "GET" &&
    matched.run &&
    (matched.tail === `workflow-runs/${matched.run}` ||
      matched.tail === `workflow-runs/${matched.run}/steps`)
  )
    return "content.read";
  if (
    method === "POST" &&
    matched.run &&
    matched.runAction === "cancel" &&
    matched.tail === `workflow-runs/${matched.run}:cancel`
  )
    return "workflow.cancel";
  if (
    method === "POST" &&
    matched.run &&
    matched.runAction === "resume" &&
    matched.tail === `workflow-runs/${matched.run}:resume`
  )
    return "workflow.start";
  if (method === "GET" && matched.job && matched.tail === `jobs/${matched.job}`)
    return "content.read";
  if (
    method === "GET" &&
    matched.asset &&
    matched.tail === `assets/${matched.asset}`
  )
    return "content.read";
  if (method === "GET" && matched.tail === "validations")
    return "validation.read";
  if (
    method === "GET" &&
    matched.publication &&
    matched.tail === `publications/${matched.publication}`
  )
    return "publication.read";
  if (method === "POST" && matched.tail === "approvals")
    return "approval.decide";
  if (
    method === "POST" &&
    matched.approval &&
    matched.approvalAction === "revoke" &&
    matched.tail === `approvals/${matched.approval}:revoke`
  )
    return "approval.decide";
  return null;
}

/** HTTP-only adapter: all policy and state decisions belong to injected use cases. */
export function createApiServer(
  options: Partial<ApiServerOptions> = {}
): http.Server {
  const useCases = options.useCases ?? absentUseCases;
  const speechUseCases = options.speechUseCases ?? absentSpeechUseCases;
  const admitWorkflow = options.workflowAdmissionHandler
    ? createApiWorkflowAdmissionUseCase(
        options.workflowAdmissionHandler,
        options.admissionDeadlineMs
      )
    : useCases.admitWorkflow;
  const makeRequestId = options.requestId ?? (() => crypto.randomUUID());
  return http.createServer(async (request, response) => {
    const requestIdValue = requestId(request, makeRequestId);
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health/live")
        return json(
          response,
          200,
          { status: "ok" },
          { "x-request-id": requestIdValue }
        );
      if (request.method === "GET" && url.pathname === "/health/ready") {
        const ready = (await options.readiness?.()) ?? false;
        return json(
          response,
          ready ? 200 : 503,
          { status: ready ? "ready" : "unavailable" },
          { "x-request-id": requestIdValue }
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/openapi.json")
        return json(response, 200, openApiDocument, {
          "x-request-id": requestIdValue,
        });
      const matched = route(url.pathname);
      if (!matched)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const principal = await options.authenticate?.(request);
      if (!principal)
        throw new ApplicationError(
          "authentication_required",
          "Authentication is required.",
          false
        );
      if (principal.workspaceId !== matched.workspace)
        throw new ApplicationError("not_found", "Resource not found.", false);
      if (principal.kind === "worker")
        throw new ApplicationError(
          "authorization_denied",
          "Worker principals cannot use the public API.",
          false
        );
      const permission = requiredPermission(request.method, matched);
      if (!permission)
        throw new ApplicationError("not_found", "Resource not found.", false);
      if (!principal.permissions.includes(permission))
        throw new ApplicationError(
          "authorization_denied",
          "Permission is denied.",
          false
        );
      const context = {
        workspaceId: matched.workspace,
        principal,
        ...(matched.project ? { projectId: matched.project } : {}),
        requestId: requestIdValue,
      };
      if (
        request.method === "GET" &&
        !matched.project &&
        matched.tail === "quota"
      ) {
        const result = await useCases.getQuota(context);
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        /^speech\/profile-versions\/[^/]+:deprecate$/u.test(matched.tail ?? "")
      ) {
        const versionId = matched.tail!.match(
          /^speech\/profile-versions\/([^/]+):deprecate$/u
        )![1]!;
        const result = speechProfileVersionResponseSchema.parse(
          await speechUseCases.deprecateProfileVersion(versionId, {
            ...context,
            ifMatch: strongIfMatch(request),
          })
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "GET" &&
        !matched.project &&
        matched.tail === "usage-records"
      ) {
        const result = await useCases.listUsageRecords(
          url.searchParams.get("page[after]") ?? undefined,
          pageSize(url),
          context
        );
        return json(response, 200, result, { "x-request-id": requestIdValue });
      }
      if (
        request.method === "GET" &&
        !matched.project &&
        matched.tail === "audit-events"
      ) {
        const result = await useCases.listAuditEvents(
          url.searchParams.get("page[after]") ?? undefined,
          pageSize(url),
          context
        );
        return json(response, 200, result, { "x-request-id": requestIdValue });
      }
      if (
        request.method === "POST" &&
        !matched.project &&
        matched.tail === ""
      ) {
        const result = await useCases.createProject(
          projectInputSchema.parse(await body(request)),
          context
        );
        return json(
          response,
          201,
          { id: result.id, revision: result.revision },
          { etag: etag(result.revision), "x-request-id": requestIdValue }
        );
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        matched.tail === "speech/estimates"
      )
        return json(
          response,
          200,
          speechEstimateResponseSchema.parse(
            await speechUseCases.estimate(
              speechEstimateInputSchema.parse(await body(request)),
              context
            )
          ),
          { "x-request-id": requestIdValue }
        );
      if (
        !matched.project &&
        request.method === "POST" &&
        matched.tail === "speech/generations"
      ) {
        const key = idempotencyKey(request);
        if (!key)
          throw new ApplicationError(
            "precondition_required",
            "Idempotency-Key is required.",
            false
          );
        const result = speechGenerationResponseSchema.parse(
          await speechUseCases.generate(
            speechGenerationInputSchema.parse(await body(request)),
            { ...context, idempotencyKey: key }
          )
        );
        return json(response, 202, result, {
          location: `/v1/workspaces/${matched.workspace}/speech/generations/${result.generationId}`,
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "GET" &&
        /^speech\/generations\/([^/]+)$/u.test(matched.tail ?? "")
      ) {
        const generationId = matched.tail!.split("/")[2]!;
        const result = await speechUseCases.getGeneration(
          generationId,
          context
        );
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        const wire = speechGenerationResponseSchema.parse(result);
        return json(response, 200, wire, {
          etag: etag(wire.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        /^speech\/generations\/([^/]+):(retry|cancel)$/u.test(
          matched.tail ?? ""
        )
      ) {
        const [, generationId, action] = matched.tail!.match(
          /^speech\/generations\/([^/]+):(retry|cancel)$/u
        )!;
        const result = speechGenerationResponseSchema.parse(
          action === "retry"
            ? await speechUseCases.retryGeneration(
                generationId!,
                speechRetryInputSchema.parse(await body(request)),
                {
                  ...context,
                  idempotencyKey:
                    idempotencyKey(request) ??
                    (() => {
                      throw new ApplicationError(
                        "precondition_required",
                        "Idempotency-Key is required for speech retries.",
                        false
                      );
                    })(),
                }
              )
            : await speechUseCases.cancelGeneration(generationId!, context)
        );
        return json(response, 202, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "GET" &&
        matched.tail === "speech/profiles"
      )
        return json(
          response,
          200,
          {
            items: (await speechUseCases.listProfiles(context)).map((profile) =>
              speechProfileResponseSchema.parse(profile)
            ),
          },
          { "x-request-id": requestIdValue }
        );
      if (
        !matched.project &&
        request.method === "POST" &&
        matched.tail === "speech/profiles"
      ) {
        const result = speechProfileResponseSchema.parse(
          await speechUseCases.createProfile(
            voiceProfileInputSchema.parse(await body(request)),
            context
          )
        );
        return json(response, 201, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        /^speech\/profiles\/[^/]+\/versions$/u.test(matched.tail ?? "")
      ) {
        const profileId = matched.tail!.split("/")[2]!;
        const result = speechProfileVersionResponseSchema.parse(
          await speechUseCases.createProfileVersion(
            profileId,
            voiceProfileVersionInputSchema.parse(await body(request)),
            context
          )
        );
        return json(response, 201, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        /^speech\/profile-versions\/[^/]+\/activate$/u.test(matched.tail ?? "")
      ) {
        const versionId = matched.tail!.split("/")[2]!;
        const result = speechProfileVersionResponseSchema.parse(
          await speechUseCases.activateProfileVersion(versionId, {
            ...context,
            ifMatch: strongIfMatch(request),
          })
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "POST" &&
        /^speech\/profile-versions\/[^/]+:validate$/u.test(matched.tail ?? "")
      ) {
        const versionId = matched.tail!.match(
          /^speech\/profile-versions\/([^/]+):validate$/u
        )![1]!;
        const result = speechProfileVersionResponseSchema.parse(
          await speechUseCases.validateProfileVersion(versionId, context)
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "PUT" &&
        /^genres\/[^/]+\/speech-policy$/u.test(matched.tail ?? "")
      ) {
        const genreId = matched.tail!.split("/")[1]!;
        const result = speechPolicyResponseSchema.parse(
          await speechUseCases.setGenreSpeechPolicy(
            genreId,
            genreSpeechPolicyInputSchema.parse(await body(request)),
            { ...context, ifMatch: strongIfMatch(request) }
          )
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        !matched.project &&
        request.method === "PUT" &&
        /^videos\/[^/]+\/speech-override$/u.test(matched.tail ?? "")
      ) {
        const videoId = matched.tail!.split("/")[1]!;
        const result = speechPolicyResponseSchema.parse(
          await speechUseCases.setVideoSpeechOverride(
            videoId,
            videoSpeechOverrideInputSchema.parse(await body(request)),
            { ...context, ifMatch: strongIfMatch(request) }
          )
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (!matched.project)
        throw new ApplicationError("not_found", "Resource not found.", false);
      const projectContext = {
        workspaceId: matched.workspace,
        projectId: matched.project,
        principal,
        requestId: requestIdValue,
      };
      if (request.method === "POST" && matched.tail === "episodes") {
        const result = await useCases.createEpisode(
          parseEpisodeInput(await body(request)),
          projectContext
        );
        return json(
          response,
          201,
          { id: result.id, revision: result.revision },
          { etag: etag(result.revision), "x-request-id": requestIdValue }
        );
      }
      if (
        request.method === "GET" &&
        matched.episode &&
        matched.tail === `episodes/${matched.episode}`
      ) {
        const result = await useCases.getEpisode(
          matched.episode,
          projectContext
        );
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "PATCH" &&
        matched.episode &&
        matched.tail === `episodes/${matched.episode}`
      ) {
        const match = strongIfMatch(request);
        const result = await useCases.replaceEpisodeContent(
          matched.episode,
          parseEpisodeInput(await body(request)),
          { ...projectContext, ifMatch: match }
        );
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "POST" &&
        matched.episode &&
        matched.tail === `episodes/${matched.episode}/workflow-runs`
      ) {
        const key = idempotencyKey(request);
        if (!key)
          throw new ApplicationError(
            "precondition_required",
            "Idempotency-Key is required.",
            false
          );
        const result = await admitWorkflow(
          workflowAdmissionSchema.parse(await body(request)),
          { ...projectContext, episodeId: matched.episode, idempotencyKey: key }
        );
        return json(
          response,
          202,
          {
            workflowRunId: result.workflowRunId,
            jobId: result.jobId,
            revision: result.revision,
            links: {
              workflowRun: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/workflow-runs/${result.workflowRunId}`,
              job: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            },
          },
          {
            location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            "retry-after": "3",
            etag: etag(result.revision),
            "x-request-id": requestIdValue,
          }
        );
      }
      if (
        request.method === "GET" &&
        matched.run &&
        matched.tail === `workflow-runs/${matched.run}`
      ) {
        const result = await useCases.getWorkflow(matched.run, projectContext);
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "GET" &&
        matched.run &&
        matched.tail === `workflow-runs/${matched.run}/steps`
      ) {
        const result = await useCases.listWorkflowSteps(
          matched.run,
          projectContext
        );
        return json(response, 200, result, { "x-request-id": requestIdValue });
      }
      if (
        request.method === "POST" &&
        matched.run &&
        matched.runAction === "cancel" &&
        matched.tail === `workflow-runs/${matched.run}:cancel`
      ) {
        const match = ifMatch(request);
        if (!match)
          throw new ApplicationError(
            "precondition_required",
            "If-Match is required.",
            false
          );
        const result = await useCases.cancelWorkflow(matched.run, {
          ...projectContext,
          ifMatch: match,
        });
        return json(
          response,
          202,
          {
            ...result,
            links: {
              workflowRun: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/workflow-runs/${result.workflowRunId}`,
              job: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            },
          },
          {
            location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            "retry-after": "3",
            etag: etag(result.revision),
            "x-request-id": requestIdValue,
          }
        );
      }
      if (
        request.method === "POST" &&
        matched.run &&
        matched.runAction === "resume" &&
        matched.tail === `workflow-runs/${matched.run}:resume`
      ) {
        const match = ifMatch(request);
        const key = idempotencyKey(request);
        if (!match || !key)
          throw new ApplicationError(
            "precondition_required",
            "If-Match and Idempotency-Key are required.",
            false
          );
        const result = await useCases.resumeWorkflow(matched.run, {
          ...projectContext,
          ifMatch: match,
          idempotencyKey: key,
        });
        return json(
          response,
          202,
          {
            ...result,
            links: {
              workflowRun: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/workflow-runs/${result.workflowRunId}`,
              job: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            },
          },
          {
            location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
            "retry-after": "3",
            etag: etag(result.revision),
            "x-request-id": requestIdValue,
          }
        );
      }
      if (
        request.method === "GET" &&
        matched.job &&
        matched.tail === `jobs/${matched.job}`
      ) {
        const result = await useCases.getJob(matched.job, projectContext);
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "GET" &&
        matched.asset &&
        matched.tail?.startsWith("assets/")
      ) {
        const result = await useCases.getAsset(matched.asset, projectContext);
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, { "x-request-id": requestIdValue });
      }
      if (request.method === "GET" && matched.tail === "validations") {
        const result = await useCases.listValidations(
          url.searchParams.get("page[after]") ?? undefined,
          pageSize(url),
          projectContext
        );
        return json(response, 200, result, { "x-request-id": requestIdValue });
      }
      if (
        request.method === "GET" &&
        matched.publication &&
        matched.tail === `publications/${matched.publication}`
      ) {
        const result = await useCases.getPublication(
          matched.publication,
          projectContext
        );
        if (!result)
          throw new ApplicationError("not_found", "Resource not found.", false);
        return json(response, 200, result, {
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (request.method === "POST" && matched.tail === "approvals") {
        const key = idempotencyKey(request);
        const match = ifMatch(request);
        if (!key || !match)
          throw new ApplicationError(
            "precondition_required",
            "Idempotency-Key and If-Match are required.",
            false
          );
        const result = await useCases.recordApproval(
          approvalInputSchema.parse(await body(request)),
          { ...projectContext, idempotencyKey: key, ifMatch: match }
        );
        return json(response, 202, result, {
          location: `/v1/workspaces/${matched.workspace}/projects/${matched.project}/jobs/${result.jobId}`,
          etag: etag(result.revision),
          "x-request-id": requestIdValue,
        });
      }
      if (
        request.method === "POST" &&
        matched.approval &&
        matched.approvalAction === "revoke" &&
        matched.tail === `approvals/${matched.approval}:revoke`
      ) {
        const match = strongIfMatch(request);
        const key = idempotencyKey(request);
        if (!key)
          throw new ApplicationError(
            "precondition_required",
            "Idempotency-Key is required.",
            false
          );
        const result = await useCases.revokeApproval(
          matched.approval,
          approvalRevocationInputSchema.parse(await body(request)),
          { ...projectContext, idempotencyKey: key, ifMatch: match }
        );
        const { replayed, ...wire } = result;
        return json(response, 200, wire, {
          etag: etag(result.revision),
          ...(replayed ? { "idempotency-replayed": "true" } : {}),
          "x-request-id": requestIdValue,
        });
      }
      throw new ApplicationError("not_found", "Resource not found.", false);
    } catch (error) {
      problem(response, requestIdValue, error);
    }
  });
}
