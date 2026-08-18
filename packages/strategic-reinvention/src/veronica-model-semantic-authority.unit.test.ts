import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FileVeronicaModelSemanticAuthorityCache,
  VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
  VeronicaSemanticExperimentLedger,
  VeronicaSemanticProviderError,
  createVeronicaSemanticFingerprint,
  estimateVeronicaSemanticMaximumRequestCost,
  resolveVeronicaModelSemanticAuthority,
  resolveVeronicaSemanticAuthorityPrecedence,
  validateVeronicaSemanticBeatPlan,
  veronicaSemanticBeatPlanSchema,
  type VeronicaModelSemanticAuthorityArtifact,
  type VeronicaModelSemanticAuthorityCache,
  type VeronicaSemanticBeatPlan,
  type VeronicaSemanticProviderPort,
} from "./veronica-model-semantic-authority.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

const request = {
  source: "Impressive revenue can coexist with a small retained margin.",
  contextBefore: "Revenue is the incoming amount.",
  contextAfter: "",
  allowedOwnerTypes: ["none", "abstract", "object"] as const,
};

function plan(
  overrides: Partial<VeronicaSemanticBeatPlan> = {},
): VeronicaSemanticBeatPlan {
  return veronicaSemanticBeatPlanSchema.parse({
    schemaVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
    semanticIntent: "retained_value",
    subject: "small retained margin",
    actionOwner: {
      type: "abstract",
      sourceReference: "small retained margin",
    },
    semanticClaims: [
      {
        claim: "Revenue can be impressive while retained margin remains small.",
        sourceEvidence:
          "Impressive revenue can coexist with a small retained margin.",
      },
    ],
    visualStrategies: [
      {
        family: "retained-value-reveal",
        description: "Contrast the larger incoming amount with the small retained margin.",
        preservesMeaning: true,
        requiresUnsupportedAction: false,
      },
    ],
    forbiddenInterpretations: ["A person intentionally causes the small margin."],
    ambiguity: "none",
    abstain: false,
    abstentionReason: null,
    ...overrides,
  });
}

class MemoryCache implements VeronicaModelSemanticAuthorityCache {
  public value: VeronicaModelSemanticAuthorityArtifact | null = null;

  public async get(): Promise<VeronicaModelSemanticAuthorityArtifact | null> {
    return this.value;
  }

  public async put(artifact: VeronicaModelSemanticAuthorityArtifact): Promise<void> {
    this.value = artifact;
  }
}

function provider(output: unknown = plan()): {
  readonly port: VeronicaSemanticProviderPort;
  readonly call: ReturnType<typeof vi.fn>;
} {
  const call = vi.fn(async () => ({
    output,
    providerRequestId: "resp_fixture",
    actualModel: "gpt-5.6-sol",
    usage: {
      inputTokens: 200,
      cachedInputTokens: 50,
      outputTokens: 100,
      reasoningTokens: 40,
    },
  }));
  return { port: { plan: call }, call };
}

describe("Veronica model semantic authority", () => {
  it("rejects unknown schema fields and ungrounded claims at runtime", () => {
    expect(
      veronicaSemanticBeatPlanSchema.safeParse({ ...plan(), extra: true }).success,
    ).toBe(false);
    expect(
      validateVeronicaSemanticBeatPlan({
        request,
        output: plan({
          semanticClaims: [
            {
              claim: "Shipping caused the margin.",
              sourceEvidence: "Shipping caused the margin.",
            },
          ],
        }),
      }).validation,
    ).toMatchObject({
      outcome: "REJECT",
      reasons: ["UNGROUNDED_SEMANTIC_CLAIM"],
    });
  });

  it("accepts explicit abstention and rejects unauthorized owners and unsupported accepted action", () => {
    expect(
      validateVeronicaSemanticBeatPlan({
        request,
        output: plan({
          actionOwner: { type: "none", sourceReference: null },
          semanticClaims: [],
          visualStrategies: [],
          ambiguity: "material",
          abstain: true,
          abstentionReason: "The source does not establish a visualizable mechanism.",
        }),
      }).validation.outcome,
    ).toBe("ABSTAIN");
    expect(
      validateVeronicaSemanticBeatPlan({
        request,
        output: plan({
          actionOwner: { type: "person", sourceReference: "Revenue" },
        }),
      }).validation.reasons,
    ).toContain("ACTION_OWNER_NOT_AUTHORIZED");
    expect(
      validateVeronicaSemanticBeatPlan({
        request,
        output: plan({
          visualStrategies: [
            {
              family: "ownership-transfer",
              description: "Invent a customer handoff.",
              preservesMeaning: true,
              requiresUnsupportedAction: true,
            },
          ],
        }),
      }).validation.reasons,
    ).toContain("UNSUPPORTED_ACTION_PRESENTED_AS_MEANING_PRESERVING");
  });

  it("keeps semantic identity stable across line endings and excludes telemetry", () => {
    const first = createVeronicaSemanticFingerprint(request);
    const second = createVeronicaSemanticFingerprint({
      ...request,
      source: `\r\n${request.source}\r\n`,
    });
    expect(first).toBe(second);
    expect(
      createVeronicaSemanticFingerprint({
        ...request,
        allowedOwnerTypes: ["none"],
      }),
    ).not.toBe(first);
  });

  it("persists and replays validated authority without a second provider request", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-m4-cache-"));
    temporaryRoots.push(root);
    const cache = new FileVeronicaModelSemanticAuthorityCache(root);
    const fake = provider();
    const ledger = new VeronicaSemanticExperimentLedger("test-authorization");
    const common = {
      request,
      experimentAuthorized: true,
      credentialAvailable: true,
      cache,
      provider: fake.port,
      ledger,
      now: () => "2026-08-18T00:00:00.000Z",
    } as const;
    const first = await resolveVeronicaModelSemanticAuthority(common);
    const replay = await resolveVeronicaModelSemanticAuthority(common);
    expect(first).toMatchObject({
      authoritySource: "CURRENT_MODEL_DERIVED_AUTHORITY",
      cacheState: "MISS",
      attempts: 1,
    });
    expect(replay).toMatchObject({
      authoritySource: "CURRENT_MODEL_DERIVED_AUTHORITY",
      cacheState: "HIT",
      attempts: 0,
    });
    expect(fake.call).toHaveBeenCalledTimes(1);
    expect(ledger.snapshot()).toMatchObject({
      logicalSemanticCases: 2,
      cacheHits: 1,
      providerRequests: 1,
    });
  });

  it("keeps accepted human authority above cache, model, and deterministic authority", async () => {
    const cache = new MemoryCache();
    const fake = provider();
    const ledger = new VeronicaSemanticExperimentLedger("human-control");
    const human = plan({ semanticIntent: "comparison" });
    const result = await resolveVeronicaModelSemanticAuthority({
      request,
      acceptedHuman: human,
      deterministicCurrent: true,
      experimentAuthorized: true,
      credentialAvailable: true,
      cache,
      provider: fake.port,
      ledger,
    });
    expect(result).toMatchObject({
      authoritySource: "ACCEPTED_HUMAN_AUTHORITY",
      cacheState: "BYPASSED_HUMAN",
      plan: human,
      attempts: 0,
    });
    expect(fake.call).not.toHaveBeenCalled();
    expect(
      resolveVeronicaSemanticAuthorityPrecedence({
        acceptedHuman: human,
        deterministicCurrent: true,
      }),
    ).toBe("ACCEPTED_HUMAN_AUTHORITY");
  });

  it("retries one transient failure but never retries semantic/schema disagreement", async () => {
    const transientCall = vi
      .fn()
      .mockRejectedValueOnce(
        new VeronicaSemanticProviderError(
          "rate limited",
          true,
          "SEMANTIC_PROVIDER_RATE_LIMITED",
        ),
      )
      .mockResolvedValueOnce({
        output: plan(),
        providerRequestId: "resp_retry",
        actualModel: "gpt-5.6-sol",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 60,
          reasoningTokens: 20,
        },
      });
    const transientLedger = new VeronicaSemanticExperimentLedger("retry-control");
    const retried = await resolveVeronicaModelSemanticAuthority({
      request,
      experimentAuthorized: true,
      credentialAvailable: true,
      cache: new MemoryCache(),
      provider: { plan: transientCall },
      ledger: transientLedger,
    });
    expect(retried.attempts).toBe(2);
    expect(transientCall).toHaveBeenCalledTimes(2);
    expect(transientLedger.snapshot().retries).toBe(1);

    const malformed = provider({ ...plan(), unknown: true });
    const rejected = await resolveVeronicaModelSemanticAuthority({
      request,
      experimentAuthorized: true,
      credentialAvailable: true,
      cache: new MemoryCache(),
      provider: malformed.port,
      ledger: new VeronicaSemanticExperimentLedger("malformed-control"),
    });
    expect(rejected.validation.outcome).toBe("REJECT");
    expect(malformed.call).toHaveBeenCalledTimes(1);

    const boundaryError = Object.assign(new Error("request rejected"), {
      name: "VeronicaSemanticProviderError",
      retryable: false,
      code: "SEMANTIC_PROVIDER_REQUEST_REJECTED",
    });
    const boundaryCall = vi.fn(async () => Promise.reject(boundaryError));
    const boundaryResult = await resolveVeronicaModelSemanticAuthority({
      request,
      experimentAuthorized: true,
      credentialAvailable: true,
      cache: new MemoryCache(),
      provider: { plan: boundaryCall },
      ledger: new VeronicaSemanticExperimentLedger("module-boundary-control"),
    });
    expect(boundaryResult.validation.reasons).toEqual([
      "SEMANTIC_PROVIDER_REQUEST_REJECTED",
    ]);
    expect(boundaryCall).toHaveBeenCalledTimes(1);
  });

  it("admits the full bounded diagnostic envelope conservatively and prevents over-budget calls", () => {
    const estimate = estimateVeronicaSemanticMaximumRequestCost(request);
    expect(estimate.projectedMaximumCostUsd * 40).toBeLessThan(
      VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
    );
    const ledger = new VeronicaSemanticExperimentLedger("budget-control", 0.1);
    ledger.admitProviderAttempt(0.06);
    expect(() => ledger.admitProviderAttempt(0.06)).toThrow(
      "would exceed the experiment budget",
    );
    expect(ledger.snapshot()).toMatchObject({
      cumulativeReservedMaximumUsd: 0.06,
      preventedRequestsDueToBudget: 1,
    });
  });

  it("fails closed without authorization or credentials", async () => {
    for (const gate of [
      { experimentAuthorized: false, credentialAvailable: true },
      { experimentAuthorized: true, credentialAvailable: false },
    ]) {
      const fake = provider();
      const result = await resolveVeronicaModelSemanticAuthority({
        request,
        ...gate,
        cache: new MemoryCache(),
        provider: fake.port,
        ledger: new VeronicaSemanticExperimentLedger("gate-control"),
      });
      expect(result.validation.outcome).toBe("REJECT");
      expect(result.authoritySource).toBe("NEUTRAL_FALLBACK");
      expect(fake.call).not.toHaveBeenCalled();
    }
  });
});
