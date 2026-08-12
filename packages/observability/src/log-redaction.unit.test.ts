import { describe, expect, it } from "vitest";

import {
  buildRedactedMicrodramaAuditRecord,
  redactMicrodramaLogValue,
} from "./log-redaction.js";

describe("microdrama log redaction", () => {
  it("redacts secrets and signed URLs while preserving correlation IDs", () => {
    const redacted = redactMicrodramaLogValue({
      correlationId: "corr.micro-043",
      causationId: "cause.render-001",
      accessToken: "mfk_live_abcd1234567890",
      signedUrl:
        "https://cdn.example.com/render.mp4?X-Amz-Signature=abc123&token=secret",
      operatorEmail: "operator@example.com",
      artifactHash: "a".repeat(64),
    }) as Record<string, unknown>;

    expect(redacted.correlationId).toBe("corr.micro-043");
    expect(redacted.causationId).toBe("cause.render-001");
    expect(redacted.accessToken).toBe("[REDACTED]");
    expect(redacted.signedUrl).toBe("[REDACTED_SIGNED_URL]");
    expect(redacted.operatorEmail).toBe("[REDACTED]");
    expect(redacted.artifactHash).toBe("a".repeat(64));
  });

  it("builds immutable audit records with explicit correlation binding", () => {
    const record = buildRedactedMicrodramaAuditRecord({
      correlation: {
        correlationId: "corr.micro-043",
        causationId: "cause.dispatch-001",
        auditId: "audit.micro-043",
      },
      payload: {
        apiKey: "mfk_live_abcd1234567890",
        signedUrl: "https://cdn.example.com/render.mp4?sig=abc",
        providerResponse: { ok: true },
      },
    });

    expect(record.correlationId).toBe("corr.micro-043");
    expect(record.causationId).toBe("cause.dispatch-001");
    expect(record.auditId).toBe("audit.micro-043");
    expect(record.apiKey).toBe("[REDACTED]");
    expect(record.signedUrl).toBe("[REDACTED_SIGNED_URL]");
    expect(record.providerResponse).toEqual({ ok: true });
  });
});
