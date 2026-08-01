import { describe, expect, it } from "vitest";

import { contentSourceManifestSchema } from "@mediaforge/domain";
import { evaluateSourcePolicy, sourcePolicyTelemetry } from "./source-policy.js";

const now = new Date("2026-08-01T00:00:00.000Z");
const source = () => contentSourceManifestSchema.parse({
  schemaVersion: "1.1", sourceId: "source-001", title: "Approved source", owner: "Owner",
  sourceType: "creator-written-note", provenance: { kind: "file", location: "source.md", originalLanguage: "it" },
  accessLevel: "public", rights: { status: "creator-owned", allowedUses: ["adapt", "translate", "publish", "monetize"], permittedLocales: ["it", "en"], commercialUse: true, expiresAt: "2026-08-02T00:00:00.000Z" },
  aiTransformations: { structure: true, summarize: true, adapt: true, translate: true, syntheticVoice: false, syntheticLikeness: false },
  sensitivity: { classification: "normal", tags: ["none"], manualReviewRequired: false }, sourceHash: "a".repeat(64),
  createdAt: "2026-01-01T00:00:00.000Z", approvedAt: "2026-01-02T00:00:00.000Z", approvedBy: "editor-001",
});
const request = { operation: "adapt" as const, locale: "it" as const, targetTier: "public" as const, commercial: true, now };

describe("evaluateSourcePolicy", () => {
  it("allows only a fully approved compatible source", () => {
    expect(evaluateSourcePolicy(source(), request)).toEqual({ allowed: true, reasonCodes: [] });
  });

  it.each([
    ["unknown rights", (value: ReturnType<typeof source>) => ({ ...value, rights: { ...value.rights, status: "unknown" as const, allowedUses: ["adapt"] } }), "RIGHTS_STATUS_NOT_APPROVED"],
    ["missing use", (value: ReturnType<typeof source>) => ({ ...value, rights: { ...value.rights, allowedUses: ["translate"] } }), "USE_NOT_PERMITTED"],
    ["disabled transformation", (value: ReturnType<typeof source>) => ({ ...value, aiTransformations: { ...value.aiTransformations, adapt: false } }), "TRANSFORMATION_NOT_PERMITTED"],
    ["missing locale", (value: ReturnType<typeof source>) => ({ ...value, rights: { ...value.rights, permittedLocales: ["en"] } }), "LOCALE_NOT_PERMITTED"],
    ["non-commercial grant", (value: ReturnType<typeof source>) => ({ ...value, rights: { ...value.rights, commercialUse: false } }), "COMMERCIAL_USE_NOT_PERMITTED"],
    ["expired rights", (value: ReturnType<typeof source>) => ({ ...value, rights: { ...value.rights, expiresAt: "2026-07-31T00:00:00.000Z" } }), "RIGHTS_EXPIRED"],
    ["missing approval", (value: ReturnType<typeof source>) => ({ ...value, approvedAt: undefined, approvedBy: undefined }), "SOURCE_APPROVAL_REQUIRED"],
    ["high risk", (value: ReturnType<typeof source>) => ({ ...value, sensitivity: { ...value.sensitivity, classification: "high-risk" as const, manualReviewRequired: true } }), "HIGH_RISK_SOURCE"],
    ["premium public leakage", (value: ReturnType<typeof source>) => ({ ...value, accessLevel: "premium" as const, sensitivity: { ...value.sensitivity, manualReviewRequired: true } }), "ACCESS_TIER_LEAKAGE"],
  ])("fails closed for %s", (_name, mutate, reason) => {
    const decision = evaluateSourcePolicy(contentSourceManifestSchema.parse(mutate(source())), request);
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain(reason);
  });

  it("emits identifiers, hashes and reasons without content", () => {
    const telemetry = sourcePolicyTelemetry(source(), { allowed: false, reasonCodes: ["USE_NOT_PERMITTED"] });
    expect(telemetry).toEqual({ sourceId: "source-001", sourceHash: "a".repeat(64), allowed: false, reasonCodes: ["USE_NOT_PERMITTED"] });
    expect(JSON.stringify(telemetry)).not.toContain("Approved source");
  });

  it("does not require synthetic media permission for ordinary voice or visual work", () => {
    expect(evaluateSourcePolicy(source(), { ...request, operation: "voice" })).toEqual({ allowed: false, reasonCodes: ["USE_NOT_PERMITTED"] });
    expect(evaluateSourcePolicy(source(), { ...request, operation: "visualize" })).toEqual({ allowed: false, reasonCodes: ["USE_NOT_PERMITTED"] });
  });

  it("fails closed when an explicitly requested synthetic transformation is not granted", () => {
    const voice = evaluateSourcePolicy(source(), { ...request, operation: "voice", requestedAiTransformation: "syntheticVoice" });
    const likeness = evaluateSourcePolicy(source(), { ...request, operation: "visualize", requestedAiTransformation: "syntheticLikeness" });
    expect(voice.reasonCodes).toContain("SYNTHETIC_TRANSFORMATION_NOT_PERMITTED");
    expect(likeness.reasonCodes).toContain("SYNTHETIC_TRANSFORMATION_NOT_PERMITTED");
  });
});
