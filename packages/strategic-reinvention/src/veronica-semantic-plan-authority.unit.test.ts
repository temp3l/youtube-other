import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { writeJsonAtomic } from "@mediaforge/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeSemanticPlanHash } from "./positioning-visual-semantics.js";
import {
  computeVeronicaSemanticAuthorityIdentity,
  createVeronicaDerivedSemanticAuthority,
  invalidateVeronicaSemanticDescendants,
  preserveSupersededVeronicaSemanticPlan,
  publishVeronicaSemanticPlanAuthorityAtomic,
  resolveVeronicaSemanticPlanAuthority,
  veronicaSemanticAuthorityEnvelopeSchema,
  type VeronicaSemanticAuthorityIdentityInputs,
} from "./veronica-semantic-plan-authority.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const identityInputs: VeronicaSemanticAuthorityIdentityInputs = {
  schemaVersion: "veronica-semantic-authority-identity.v1",
  contentId: "fixture",
  canonicalSourceSha256: "1".repeat(64),
  sourceRevisionHash: "2".repeat(64),
  plannerInputHash: "3".repeat(64),
  plannerVersion: "planner.v1",
  semanticContractVersion: "contract.v1",
  semanticGateVersion: "gate.v1",
  remediationPolicyVersion: "remediation.v1",
  treatmentProjectionVersion: "projection.v1",
  semanticBytePolicyVersions: { alpha: "v1", beta: "v2" },
};

function semanticPlan(authority: unknown = createVeronicaDerivedSemanticAuthority(identityInputs), telemetry: unknown = undefined) {
  return finalizeSemanticPlanHash({
    contentId: "fixture",
    format: "short" as const,
    plannerVersion: "planner.v1",
    canonicalSourceHash: "1".repeat(64),
    derivation: {
      sourceNarrationSha256: "1".repeat(64),
      sourceRevisionHash: "2".repeat(64),
      plannerInputHash: "3".repeat(64),
      plannerVersion: "planner.v1",
    },
    assets: [{ projectionProvenance: { stateProjectionPolicyVersion: "projection.v1" } }],
    semanticAuthority: authority,
    ...(telemetry === undefined ? {} : { auditTelemetry: telemetry }),
    planHash: "0".repeat(64),
  });
}

function explicitAuthority(
  authorityKind: "ACCEPTED_HUMAN" | "LEGACY_COMPATIBILITY" | "HISTORICAL",
  inputs = identityInputs,
) {
  return veronicaSemanticAuthorityEnvelopeSchema.parse({
    schemaVersion: "veronica-semantic-plan-authority.v1",
    resolverVersion: "veronica-semantic-plan-authority-resolver.v1",
    authorityKind,
    semanticIdentity: computeVeronicaSemanticAuthorityIdentity(inputs),
    identityInputs: inputs,
    ...(authorityKind === "ACCEPTED_HUMAN"
      ? {
          acceptedEvidence: {
            decision: "ACCEPTED",
            reviewer: "reviewer",
            authorizationReference: "approval-1",
            acceptedAt: "2026-08-18T00:00:00.000Z",
          },
        }
      : {}),
  });
}

describe("Veronica semantic-plan authority", () => {
  it("classifies all seven authority states without treating existence as authority", () => {
    expect(resolveVeronicaSemanticPlanAuthority({ plan: semanticPlan(), expected: identityInputs }).state)
      .toBe("CURRENT_DERIVED_AUTHORITY");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(),
      expected: { ...identityInputs, semanticGateVersion: "gate.v2" },
    }).state).toBe("STALE_DERIVED_AUTHORITY");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(explicitAuthority("ACCEPTED_HUMAN")),
      expected: identityInputs,
    }).state).toBe("ACCEPTED_HUMAN_AUTHORITY");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(explicitAuthority("LEGACY_COMPATIBILITY")),
      expected: identityInputs,
    }).state).toBe("LEGACY_COMPATIBILITY_AUTHORITY");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(explicitAuthority("HISTORICAL")),
      expected: identityInputs,
    }).state).toBe("HISTORICAL_NON_AUTHORITY");
    const otherSource = { ...identityInputs, canonicalSourceSha256: "9".repeat(64) };
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(createVeronicaDerivedSemanticAuthority(otherSource)),
      expected: identityInputs,
    }).state).toBe("PROVENANCE_MISMATCH");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(null),
      expected: identityInputs,
    }).state).toBe("UNKNOWN");
  });

  it("keeps semantic identity stable across timestamp, cache, and latency telemetry", () => {
    const first = semanticPlan(undefined, { generatedAt: "2026-08-18T00:00:00Z", cacheHit: false, latencyMs: 91 });
    const second = semanticPlan(undefined, { generatedAt: "2026-08-19T00:00:00Z", cacheHit: true, latencyMs: 2 });
    expect(first.planHash).not.toBe(second.planHash);
    expect(computeVeronicaSemanticAuthorityIdentity(identityInputs))
      .toBe(computeVeronicaSemanticAuthorityIdentity({
        ...identityInputs,
        semanticBytePolicyVersions: { beta: "v2", alpha: "v1" },
      }));
  });

  it("invalidates source and semantic-version changes", () => {
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(),
      expected: { ...identityInputs, sourceRevisionHash: "8".repeat(64) },
    }).state).toBe("STALE_DERIVED_AUTHORITY");
    expect(resolveVeronicaSemanticPlanAuthority({
      plan: semanticPlan(),
      expected: { ...identityInputs, remediationPolicyVersion: "remediation.v2" },
    }).state).toBe("STALE_DERIVED_AUTHORITY");
  });

  it("preserves stale bytes content-addressed and leaves the current file intact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-authority-"));
    temporaryRoots.push(root);
    const planPath = path.join(root, "source", "pre-image-semantic-plan.v1.json");
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    const raw = `${JSON.stringify(semanticPlan())}\n`;
    await fs.writeFile(planPath, raw);
    const preserved = await preserveSupersededVeronicaSemanticPlan({
      planPath,
      raw,
      classification: "STALE_DERIVED_AUTHORITY",
      supersededReason: "gate changed",
      sourceIdentity: identityInputs,
      replacementSemanticIdentity: computeVeronicaSemanticAuthorityIdentity(identityInputs),
    });
    expect(await fs.readFile(preserved.archivePath, "utf8")).toBe(raw);
    expect(await fs.readFile(planPath, "utf8")).toBe(raw);
  });

  it("preserves previous current authority when atomic publication fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-authority-"));
    temporaryRoots.push(root);
    const planPath = path.join(root, "plan.json");
    await fs.writeFile(planPath, "previous\n");
    const failingWriter: typeof writeJsonAtomic = vi.fn(async () => {
      throw new Error("atomic-write-failed");
    });
    await expect(publishVeronicaSemanticPlanAuthorityAtomic({
      planPath,
      plan: semanticPlan(),
      writeAtomic: failingWriter,
    })).rejects.toThrow("atomic-write-failed");
    expect(await fs.readFile(planPath, "utf8")).toBe("previous\n");
  });

  it("invalidates only semantic descendants and preserves narration, audio, timing, and historical QA", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-authority-"));
    temporaryRoots.push(root);
    const removedPath = path.join(root, "shared", "visual-beats.v1.json");
    const preservedPaths = [
      path.join(root, "locales", "en", "short", "script.md"),
      path.join(root, "locales", "en", "short", "audio", "narration.wav"),
      path.join(root, "locales", "en", "short", "canonical-timing.v1.json"),
      path.join(root, "shared", "source-grounded-visual-qa.v1.json"),
    ];
    await Promise.all([removedPath, ...preservedPaths].map(async (file) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "evidence");
    }));
    expect(await invalidateVeronicaSemanticDescendants({
      episodeDir: root,
      language: "en",
      variant: "short",
    })).toContain("shared/visual-beats.v1.json");
    await expect(fs.access(removedPath)).rejects.toThrow();
    await Promise.all(preservedPaths.map((file) => expect(fs.readFile(file, "utf8")).resolves.toBe("evidence")));
  });
});
