import {
  CORRELATION_ID_KEYS,
  type MicrodramaAuditCorrelation,
} from "@mediaforge/domain";

const REDACTED = "[REDACTED]";
const REDACTED_SIGNED_URL = "[REDACTED_SIGNED_URL]";

const secretFieldPattern =
  /(?:secret|token|password|credential|api[_-]?key|authorization|private[_-]?key)/iu;
const secretValuePattern =
  /^(?:mfk_[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._~+/=-]+|act\.[A-Za-z0-9._-]+|rft\.[A-Za-z0-9._-]+|[A-Za-z0-9+/]{32,}={0,2})$/u;
const signedUrlPattern =
  /^https?:\/\/[^\s?#]+(?:\?[^\s#]*?(?:sig|signature|token|X-Amz-Signature|X-Amz-Credential)=[^&#\s]+)/iu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;

function redactString(value: string, key?: string): string {
  if (key && /^signed[_-]?url$/iu.test(key)) {
    return REDACTED_SIGNED_URL;
  }
  if (signedUrlPattern.test(value)) {
    return REDACTED_SIGNED_URL;
  }
  if (key && secretFieldPattern.test(key)) {
    return REDACTED;
  }
  if (secretValuePattern.test(value)) {
    return REDACTED;
  }
  if (emailPattern.test(value)) {
    return REDACTED;
  }
  return value;
}

const PRESERVED_LOG_KEYS = [
  ...CORRELATION_ID_KEYS,
  "artifactHash",
  "contentHash",
  "credentialHandle",
  "credentialVersionId",
] as const;

export function redactMicrodramaLogValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactMicrodramaLogValue(entry));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (
        PRESERVED_LOG_KEYS.includes(
          entryKey as (typeof PRESERVED_LOG_KEYS)[number]
        )
      ) {
        output[entryKey] = entryValue;
        continue;
      }
      output[entryKey] = redactMicrodramaLogValue(entryValue, entryKey);
    }
    return output;
  }
  return value;
}

export function redactTikTokPublicationAuditPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return redactMicrodramaLogValue(payload) as Record<string, unknown>;
}

export function buildRedactedMicrodramaAuditRecord(input: {
  readonly correlation: MicrodramaAuditCorrelation;
  readonly payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...redactMicrodramaLogValue(input.payload) as Record<string, unknown>,
    correlationId: input.correlation.correlationId,
    ...(input.correlation.causationId
      ? { causationId: input.correlation.causationId }
      : {}),
    ...(input.correlation.auditId ? { auditId: input.correlation.auditId } : {}),
    ...(input.correlation.commandId
      ? { commandId: input.correlation.commandId }
      : {}),
  };
}
