import path from "node:path";

import {
  MICRODRAMA_TRUST_GATE_SCHEMA_VERSION,
  artifactIdentitySchema,
  trustGateDecisionSchema,
  type ArtifactIdentity,
  type SignedUrlScope,
  type TrustGateIssue,
  type TrustGateIssueCode,
} from "./microdrama-trust-gate-contracts.js";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const maxArtifactBytes = 8 * 1024 * 1024 * 1024;

const untrustedControlKeyPattern =
  /^(?:provider(?:Id|AccountId|Account|Name)?|account(?:Id)?|tool(?:Id|Name)?|policy(?:Id)?|approval(?:Id|Status|Decision|Token)?|canon(?:Transition|Revision|Override)?|gate(?:Override)?|dispatchMode|credential(?:Version|Handle)?|oauth(?:Token|Grant)?|accessToken|refreshToken|webhook(?:Secret)?|api(?:Key|-key)|secret|password)$/iu;

const promptInjectionPattern =
  /(?:^|\s)(?:ignore (?:all )?(?:previous|prior|above) (?:instructions|rules)|system\s*:\s*you must|override (?:policy|approval|canon|provider)|select (?:provider|tool|account)|execute (?:publication|dispatch)|grant (?:admin|owner)|bypass (?:gate|approval|policy))/iu;

const signedUrlExpiryParamPattern =
  /^(?:X-Amz-Expires|Expires|exp|se|sig|signature|token)$/iu;

export const CORRELATION_ID_KEYS = [
  "correlationId",
  "causationId",
  "auditId",
  "commandId",
  "executionId",
  "eventId",
] as const;

function issue(
  code: TrustGateIssueCode,
  message: string,
  field?: string,
  issuePath?: string
): TrustGateIssue {
  return field === undefined && issuePath === undefined
    ? { code, message }
    : {
        code,
        message,
        ...(field ? { field } : {}),
        ...(issuePath ? { path: issuePath } : {}),
      };
}

function joinPath(base: string, key: string | number): string {
  return base ? `${base}.${String(key)}` : String(key);
}

export function collectUntrustedControlIssues(
  value: unknown,
  currentPath = ""
): TrustGateIssue[] {
  const issues: TrustGateIssue[] = [];
  if (value === null || value === undefined) {
    return issues;
  }
  if (typeof value === "string") {
    if (promptInjectionPattern.test(value)) {
      issues.push(
        issue(
          "prompt_injection_boundary",
          "Untrusted text contains a control or instruction override boundary.",
          undefined,
          currentPath || "payload"
        )
      );
    }
    return issues;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      issues.push(...collectUntrustedControlIssues(entry, joinPath(currentPath, index)));
    }
    return issues;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = joinPath(currentPath, key);
      if (untrustedControlKeyPattern.test(key)) {
        issues.push(
          issue(
            "untrusted_control_field",
            `Untrusted payload cannot select control field ${key}.`,
            key,
            nextPath
          )
        );
      }
      issues.push(...collectUntrustedControlIssues(entry, nextPath));
    }
  }
  return issues;
}

export function validateUntrustedPayloadBoundary(payload: unknown): TrustGateIssue[] {
  return collectUntrustedControlIssues(payload);
}

function normalizeStoragePath(value: string): string {
  return value.split(path.sep).join("/");
}

export function validateArtifactStorageUri(
  storageUri: string,
  artifactRoot: string
): TrustGateIssue[] {
  const issues: TrustGateIssue[] = [];
  if (/^[a-z][a-z0-9+.-]*:/iu.test(storageUri)) {
    let parsed: URL;
    try {
      parsed = new URL(storageUri);
    } catch {
      issues.push(
        issue(
          "storage_uri_forbidden_scheme",
          "Artifact storage URI is not a valid URL.",
          "storageUri"
        )
      );
      return issues;
    }
    if (parsed.protocol !== "file:") {
      issues.push(
        issue(
          "storage_uri_forbidden_scheme",
          `Artifact storage URI scheme ${parsed.protocol} is forbidden at registration.`,
          "storageUri"
        )
      );
      return issues;
    }
    const candidate = path.resolve(decodeURIComponent(parsed.pathname));
    const normalizedRoot = path.resolve(artifactRoot);
    if (
      candidate !== normalizedRoot &&
      !candidate.startsWith(`${normalizedRoot}${path.sep}`)
    ) {
      issues.push(
        issue(
          "storage_uri_escape",
          "Artifact storage URI escapes the configured artifact root.",
          "storageUri"
        )
      );
    }
    return issues;
  }

  const normalized = normalizeStoragePath(storageUri);
  if (
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(normalized)
  ) {
    issues.push(
      issue(
        "storage_uri_escape",
        "Artifact storage URI contains traversal or absolute path segments.",
        "storageUri"
      )
    );
    return issues;
  }
  const candidate = path.resolve(artifactRoot, normalized);
  const normalizedRoot = path.resolve(artifactRoot);
  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    issues.push(
      issue(
        "storage_uri_escape",
        "Artifact storage URI escapes the configured artifact root.",
        "storageUri"
      )
    );
  }
  return issues;
}

export function validateSignedUrlScope(
  signedUrl: string,
  scope: SignedUrlScope
): TrustGateIssue[] {
  const issues: TrustGateIssue[] = [];
  let parsed: URL;
  try {
    parsed = new URL(signedUrl);
  } catch {
    issues.push(
      issue(
        "signed_url_out_of_scope",
        "Signed URL is not a valid HTTP(S) URL.",
        "signedUrl"
      )
    );
    return issues;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    issues.push(
      issue(
        "signed_url_out_of_scope",
        `Signed URL protocol ${parsed.protocol} is out of scope.`,
        "signedUrl"
      )
    );
    return issues;
  }
  const hostAllowed = scope.allowedHosts.some(
    (allowedHost) =>
      parsed.hostname === allowedHost ||
      parsed.hostname.endsWith(`.${allowedHost}`)
  );
  if (!hostAllowed) {
    issues.push(
      issue(
        "signed_url_out_of_scope",
        `Signed URL host ${parsed.hostname} is not in the allowed scope.`,
        "signedUrl"
      )
    );
  }
  const nowMs = Date.parse(scope.now);
  for (const [param, value] of parsed.searchParams.entries()) {
    if (!signedUrlExpiryParamPattern.test(param)) {
      continue;
    }
    if (param === "X-Amz-Expires" || param === "Expires" || param === "exp") {
      const numericValue = Number.parseInt(value, 10);
      const expiresAt =
        param === "X-Amz-Expires"
          ? nowMs + numericValue * 1_000
          : Number.isFinite(numericValue) && /^\d+$/u.test(value)
            ? numericValue * 1_000
            : Date.parse(value);
      if (Number.isFinite(expiresAt) && expiresAt <= nowMs) {
        issues.push(
          issue(
            "signed_url_expired",
            "Signed URL expiry is in the past.",
            "signedUrl"
          )
        );
      }
      if (
        param === "X-Amz-Expires" &&
        Number.parseInt(value, 10) > scope.maxTtlSeconds
      ) {
        issues.push(
          issue(
            "signed_url_out_of_scope",
            "Signed URL TTL exceeds the configured maximum.",
            "signedUrl"
          )
        );
      }
    }
  }
  return issues;
}

export function validateArtifactIdentity(input: {
  readonly identity: ArtifactIdentity;
  readonly artifactRoot: string;
  readonly observedContentHash?: string;
}): TrustGateIssue[] {
  const parsed = artifactIdentitySchema.safeParse(input.identity);
  if (!parsed.success) {
    return parsed.error.issues.map((entry) =>
      issue(
        entry.path.includes("artifactHash") || entry.path.includes("contentHash")
          ? "invalid_artifact_hash"
          : entry.path.includes("mimeType")
            ? "unsupported_mime_type"
            : entry.path.includes("byteSize")
              ? "artifact_size_invalid"
              : "dispatch_blocked",
        entry.message,
        entry.path.join(".") || "identity"
      )
    );
  }
  const identity = parsed.data;
  const issues: TrustGateIssue[] = [];
  if (!sha256Pattern.test(identity.artifactHash)) {
    issues.push(
      issue(
        "invalid_artifact_hash",
        "Artifact hash must be a lowercase SHA-256 digest.",
        "artifactHash"
      )
    );
  }
  if (identity.byteSize <= 0 || identity.byteSize > maxArtifactBytes) {
    issues.push(
      issue(
        "artifact_size_invalid",
        "Artifact byte size is outside the allowed bounds.",
        "byteSize"
      )
    );
  }
  if (
    input.observedContentHash !== undefined &&
    input.observedContentHash !== identity.artifactHash &&
    input.observedContentHash !== identity.contentHash
  ) {
    issues.push(
      issue(
        "artifact_hash_mismatch",
        "Observed content hash does not match the declared artifact identity.",
        "artifactHash"
      )
    );
  }
  issues.push(...validateArtifactStorageUri(identity.storageUri, input.artifactRoot));
  return issues;
}

export function evaluateTrustGate(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly untrustedPayload?: unknown;
  readonly artifact?: {
    readonly identity: ArtifactIdentity;
    readonly artifactRoot: string;
    readonly observedContentHash?: string;
  };
  readonly signedUrl?: {
    readonly url: string;
    readonly scope: SignedUrlScope;
  };
}): ReturnType<typeof trustGateDecisionSchema.parse> {
  const issues: TrustGateIssue[] = [];
  if (input.untrustedPayload !== undefined) {
    issues.push(...validateUntrustedPayloadBoundary(input.untrustedPayload));
  }
  if (input.artifact) {
    issues.push(...validateArtifactIdentity(input.artifact));
  }
  if (input.signedUrl) {
    issues.push(
      ...validateSignedUrlScope(input.signedUrl.url, input.signedUrl.scope)
    );
  }
  return trustGateDecisionSchema.parse({
    schemaVersion: MICRODRAMA_TRUST_GATE_SCHEMA_VERSION,
    allowed: issues.length === 0,
    issues,
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
  });
}
