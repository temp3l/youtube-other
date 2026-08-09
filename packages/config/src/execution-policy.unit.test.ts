import { describe, expect, it } from "vitest";
import {
  executionPolicyFingerprint,
  redactPolicyEvidence,
  resolveExecutionPolicy,
} from "./execution-policy.js";

const policy = {
  schemaVersion: "execution-policy.v1",
  contentProfileId: "strategic-reinvention",
  policyVersion: "veronicabenini.execution-policy.v1",
  configurationRevision: "config-1",
  dependencyIdentity: { source: "a".repeat(64) },
  provider: { id: "none", configurationVersion: "human-supplied-v1", dispatchEnabled: false },
  budget: { currency: "EUR", maximumMinor: 1000n, reservationRequired: true },
  requiredApprovalGates: ["source", "publish"],
  preflightRequired: true,
} as const;

describe("execution policy", () => {
  it("normalizes Veronica identity and keeps its provider route disabled", () => {
    const resolved = resolveExecutionPolicy(policy);
    expect(resolved.contentProfileId).toBe("veronicabenini");
    expect(executionPolicyFingerprint(resolved)).toMatch(/^[a-f0-9]{64}$/u);
    expect(() => resolveExecutionPolicy({ ...policy, provider: { ...policy.provider, id: "openai", dispatchEnabled: true } })).toThrow("dispatch disabled");
  });

  it("redacts credential-shaped evidence without mutating safe provenance", () => {
    expect(redactPolicyEvidence({ apiKey: "secret", provenanceSha256: "a".repeat(64), nested: { token: "x" } })).toEqual({ apiKey: "[REDACTED]", provenanceSha256: "a".repeat(64), nested: { token: "[REDACTED]" } });
  });
});
