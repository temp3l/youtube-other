import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BoundedLlmCallBudgetV36,
  HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE,
  HISTORY_V36_LLM_MAX_CALLS_PER_RUN,
  HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION,
  HISTORY_V36_RELATION_PROPOSER_SYSTEM_PROMPT,
  boundedLlmProposerConfigFromEnvV36,
  callBoundedLlmRelationProposerV36,
  type BoundedLlmProviderResultV36,
  type BoundedLlmRelationPacketV36,
  type BoundedLlmRelationProviderV36,
  type BoundedLlmRelationProposerOutputV36,
} from "./bounded-llm-relation-proposer-v36.js";
import {
  HISTORY_V36_REPRESENTATIVE_EPISODE_SET,
  deduplicateBoundedLlmRelationsV36,
  runBoundedLlmShadowEpisodeV36,
  selectBoundedLlmWindowsV36,
} from "./bounded-llm-shadow-experiment-v36.js";
import {
  MemoryRelationProposalCacheV36,
  buildRelationProposalCacheKeyV36,
} from "./relation-proposer-cache-v36.js";
import { runRepresentativeShadowExtractionV36, type RepresentativeShadowSourceV36 } from "./representative-shadow-extraction-v36.js";
import { boundedLlmReviewArtifactProvenanceSchemaV36 } from "./review-provenance-v36.js";

const fixtureResponses = JSON.parse(readFileSync(resolve(process.cwd(), "packages/history/src/v36/fixtures/bounded-llm-shadow-responses-v36.json"), "utf8")) as Record<string, BoundedLlmRelationProposerOutputV36>;

function source(episodeId: string): RepresentativeShadowSourceV36 {
  const root = resolve(process.cwd(), "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(readFileSync(resolve(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(readFileSync(resolve(root, "plan.json"), "utf8"));
  return { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] };
}

class FixtureProvider implements BoundedLlmRelationProviderV36 {
  readonly providerIdentity = "offline-fixture";
  readonly model = "bounded-llm-fixture-v1";
  calls = 0;

  constructor(private readonly response?: (packet: BoundedLlmRelationPacketV36) => unknown) {}

  async propose(packet: BoundedLlmRelationPacketV36): Promise<BoundedLlmProviderResultV36> {
    this.calls += 1;
    const key = packet.claims.map((claim) => claim.claimId).join("|");
    return {
      output: this.response?.(packet) ?? fixtureResponses[key] ?? { proposals: [] },
      requestId: `fixture-${this.calls}`,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }
}

function franklinWindow() {
  const input = source("history-youtube-history-10-video-story-pack-05-franklin-expedition");
  const deterministic = runRepresentativeShadowExtractionV36(input);
  return selectBoundedLlmWindowsV36(input, deterministic)[0]!;
}

describe("V3.6 bounded LLM relation proposer", () => {
  it("is opt-in with hard-bounded configuration", () => {
    expect(boundedLlmProposerConfigFromEnvV36({})).toMatchObject({ enabled: false, model: "", maxCallsPerRun: HISTORY_V36_LLM_MAX_CALLS_PER_RUN, maxCallsPerEpisode: HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE });
    expect(boundedLlmProposerConfigFromEnvV36({ HISTORY_V36_LLM_SHADOW_PROPOSER: "1", HISTORY_V36_LLM_MAX_CALLS_PER_RUN: "999", HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE: "999" })).toMatchObject({ enabled: true, model: "gpt-5.6-terra", maxCallsPerRun: 40, maxCallsPerEpisode: 8 });
  });

  it("enforces dedicated exact-corpus artifact provenance", () => {
    expect(boundedLlmReviewArtifactProvenanceSchemaV36.parse({
      generatedAt: "2026-08-09T12:00:00Z",
      gitCommitSha: "a".repeat(40),
      gitBranch: "master",
      v36ImplementationCommitSha: "a".repeat(40),
      representativeV2BaselineCommitSha: "b".repeat(40),
      representativeV2BaselineTag: "history-v3.6-representative-shadow-v2-baseline",
      contractBaselineCommitSha: "c".repeat(40),
      contractBaselineTag: "history-v3.6-contract-preflight-baseline",
      frozenV35ProductionCommitSha: "d".repeat(40),
      frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
      acceptedV35SemanticBaselineCommitSha: "e".repeat(40),
      acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
      promptVersion: "history-v36-relation-proposer-v1",
      providerIdentity: null,
      model: null,
      liveExperimentStatus: "not-run",
      schemaVersion: "history-v3.6-bounded-llm-shadow-review-provenance.v1",
      artifactKind: "history-v3.6-bounded-llm-shadow-review",
      episodeSet: [...HISTORY_V36_REPRESENTATIVE_EPISODE_SET],
    }).episodeSet).toHaveLength(8);
  });

  it("builds a two-claim maximum semantic packet without whole-episode or operational data", () => {
    const input = source("history-youtube-history-10-video-story-pack-04-black-death");
    const windows = selectBoundedLlmWindowsV36(input, runRepresentativeShadowExtractionV36(input));
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((window) => window.packet.claims.length <= 2)).toBe(true);
    const serialized = JSON.stringify(windows);
    expect(serialized).not.toContain("source/history-v3.5");
    expect(serialized).not.toContain("API_KEY");
    expect(serialized).not.toContain("gitCommit");
    expect(HISTORY_V36_RELATION_PROPOSER_SYSTEM_PROMPT).toContain("Do not convert purpose into destination");
    expect(windows[0]!.packet.promptVersion).toBe(HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION);
  });

  it("requires strict structured output and fails open on provider errors", async () => {
    const window = franklinWindow();
    const invalid = new FixtureProvider(() => ({ proposals: [{ kind: "movement" }], extra: true }));
    const invalidResult = await callBoundedLlmRelationProposerV36({ packet: window.packet, provider: invalid, cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(invalidResult.diagnostics).toEqual([expect.objectContaining({ code: "SHADOW_LLM_OUTPUT_SCHEMA_INVALID" })]);
    const failing: BoundedLlmRelationProviderV36 = { providerIdentity: "failure-fixture", model: "failure", propose: async () => { throw new Error("offline"); } };
    const failed = await callBoundedLlmRelationProposerV36({ packet: window.packet, provider: failing, cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(failed.diagnostics).toEqual([expect.objectContaining({ code: "SHADOW_LLM_PROVIDER_FAILURE" })]);
  });

  it("reuses a successful cache entry after one provider call", async () => {
    const window = franklinWindow();
    const provider = new FixtureProvider(() => ({ proposals: [] }));
    const cache = new MemoryRelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>();
    const budget = new BoundedLlmCallBudgetV36(40, 8);
    const first = await callBoundedLlmRelationProposerV36({ packet: window.packet, provider, cache, budget });
    const second = await callBoundedLlmRelationProposerV36({ packet: window.packet, provider, cache, budget });
    expect(provider.calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
  });

  it("invalidates cache identity for prompt, model, claim, binding, and schema changes", () => {
    const window = franklinWindow();
    const base = {
      episodeId: window.packet.episodeId,
      orderedSupportClaimIds: window.packet.claims.map((claim) => claim.claimId),
      normalizedStructuredClaimContent: window.packet.claims,
      resolvedParticipantBindings: window.packet.participantBindings,
      relationSchemaVersion: window.packet.relationSchemaVersion,
      promptVersion: window.packet.promptVersion,
      model: "fixture-model",
      providerIdentity: "fixture-provider",
    };
    const key = buildRelationProposalCacheKeyV36(base);
    const variants = [
      { ...base, promptVersion: `${base.promptVersion}-next` },
      { ...base, model: "other-model" },
      { ...base, normalizedStructuredClaimContent: [{ ...window.packet.claims[0], normalizedProposition: "changed" }] },
      { ...base, resolvedParticipantBindings: [...window.packet.participantBindings, { id: "extra", type: "concept", canonicalLabel: "extra" }] },
      { ...base, relationSchemaVersion: `${base.relationSchemaVersion}-next` },
    ];
    expect(new Set(variants.map(buildRelationProposalCacheKeyV36)).size).toBe(variants.length);
    expect(variants.map(buildRelationProposalCacheKeyV36)).not.toContain(key);
  });

  it("continues deterministically when the call budget is exhausted", async () => {
    const input = source("history-youtube-history-10-video-story-pack-05-franklin-expedition");
    const provider = new FixtureProvider();
    const result = await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: input, provider, cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(0, 0) });
    expect(provider.calls).toBe(0);
    expect(result.callDiagnostics).toEqual([expect.objectContaining({ code: "SHADOW_LLM_CALL_BUDGET_EXHAUSTED" })]);
    expect(result.combinedRelations).toEqual(result.deterministic.extraction.relations);
  });

  it("rejects unknown participants and support outside the supplied window before validation", async () => {
    const battle = source("history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england");
    const unknown = await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: battle, provider: new FixtureProvider(), cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(unknown.llmCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ diagnostics: [expect.objectContaining({ code: "SHADOW_LLM_UNKNOWN_PARTICIPANT" })] })]));

    const franklin = source("history-youtube-history-10-video-story-pack-05-franklin-expedition");
    const outOfWindow = new FixtureProvider((packet) => ({ proposals: [{ kind: "movement", fromParticipantId: "entity-46a7fac47ed54973ae0cbd3f", toParticipantId: "entity-ac964e273d8d56019388fc87", viaParticipantIds: [], supportClaimIds: [packet.claims[0]!.claimId, "claim-not-in-window"], evidenceMapping: [] }] }));
    const rejected = await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: franklin, provider: outOfWindow, cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(rejected.llmCandidates[0]!.diagnostics).toEqual([expect.objectContaining({ code: "SHADOW_LLM_SUPPORT_CLAIM_OUT_OF_WINDOW" })]);
  });

  it("rejects the Franklin purpose-as-destination proposal before the validator", async () => {
    const franklin = source("history-youtube-history-10-video-story-pack-05-franklin-expedition");
    const result = await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: franklin, provider: new FixtureProvider(), cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(result.llmCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "rejected", diagnostics: [expect.objectContaining({ code: "SHADOW_RELATION_PROPOSITION_AMBIGUOUS" })] })]));
    expect(result.combinedRelations.some((relation) => relation.kind === "movement")).toBe(false);
  });

  it("fails provider errors open to the unchanged deterministic shadow result", async () => {
    const franklin = source("history-youtube-history-10-video-story-pack-05-franklin-expedition");
    const provider: BoundedLlmRelationProviderV36 = { providerIdentity: "offline", model: "offline", propose: async () => { throw new Error("not configured"); } };
    const result = await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: franklin, provider, cache: new MemoryRelationProposalCacheV36(), budget: new BoundedLlmCallBudgetV36(40, 8) });
    expect(result.combinedRelations).toEqual(result.deterministic.extraction.relations);
    expect(result.callDiagnostics).toEqual([expect.objectContaining({ code: "SHADOW_LLM_PROVIDER_FAILURE" })]);
  });

  it("collapses duplicate semantic IDs and reports both-proposer attribution", () => {
    const deterministic = runRepresentativeShadowExtractionV36(source("history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster")).extraction.relations;
    const combined = deduplicateBoundedLlmRelationsV36(deterministic, [deterministic[0]!]);
    expect(combined.relations).toHaveLength(deterministic.length);
    expect(combined.attribution).toEqual(expect.arrayContaining([expect.objectContaining({ semanticRelationId: deterministic[0]!.id, attribution: "both" })]));
  });

  it("runs the exact eight-episode mocked comparison without admitting unsupported proposals", async () => {
    const provider = new FixtureProvider();
    const budget = new BoundedLlmCallBudgetV36(40, 8);
    const results = [];
    for (const episodeId of HISTORY_V36_REPRESENTATIVE_EPISODE_SET) {
      results.push(await runBoundedLlmShadowEpisodeV36({ mode: "deterministic-plus-llm", source: source(episodeId), provider, cache: new MemoryRelationProposalCacheV36(), budget }));
    }
    expect(results).toHaveLength(8);
    expect(results.reduce((sum, result) => sum + result.metrics.deterministicValid, 0)).toBe(19);
    expect(results.reduce((sum, result) => sum + result.metrics.llmValidated, 0)).toBe(0);
    expect(results.reduce((sum, result) => sum + result.metrics.combinedUniqueValidated, 0)).toBe(19);
    expect(results.flatMap((result) => result.metrics.llmOnlySemanticIds)).toEqual([]);
    expect(budget.snapshot().runCalls).toBeLessThanOrEqual(40);
    expect(Object.values(budget.snapshot().episodeCalls).every((calls) => calls <= 8)).toBe(true);
  });
});
