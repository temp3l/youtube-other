import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
  HistoryResearchCostConfigErrorV33,
  loadHistoryResearchCostConfigV33,
  redactHistoryResearchCostConfigV33,
  validateHistoryResearchCostConfigV33,
} from "./history-research-cost-config-v33.js";
import {
  appendCostLedgerEntryV33,
  canSpendPaidWorkV33,
  createEpisodeCostLedgerV33,
  formatCostStatusV33,
  UNCONFIGURED_HISTORY_PRICING_V33,
} from "./history-research-cost-ledger-v33.js";
import {
  clusterClaimsForResearchV33,
  prioritizeResearchClustersV33,
} from "./history-research-clusters-v33.js";
import {
  canPerformSearchV33,
  createSearchBudgetLedgerV33,
  recordSearchCallV33,
} from "./history-research-search-budget-v33.js";
import {
  decideEvidenceEscalationV33,
  shouldEscalateOrdinaryExtractionV33,
} from "./history-research-escalation-v33.js";
import {
  buildCompactAssessmentPayloadV33,
  selectCandidateEvidenceFragmentsV33,
} from "./history-research-fragments-v33.js";
import {
  expandCompactAssessmentV33,
  requiresDetailedRationaleV33,
  compactClaimEvidenceAssessmentV33Schema,
} from "./history-research-compact-v33.js";
import {
  buildPaidBatchCacheKeyV33,
  phasesInvalidatedFromV33,
  projectBroadForceCostV33,
  readPaidBatchCacheV33,
  upsertSourceBodyCacheV33,
  writePaidBatchCacheV33,
} from "./history-research-cache-v33.js";
import {
  buildStableBatchCustomIdV33,
  parseHistoryBatchOutputJsonlV33,
  runHistorySemanticBatchV33,
} from "./history-research-batch-v33.js";
import { estimateHistoryResearchDryRunV33 } from "./history-research-dry-run-v33.js";
import {
  HistoryModelAvailabilityErrorV33,
  assertHistoryModelsAvailableV33,
} from "./history-research-model-availability-v33.js";
import {
  alignClaimProposalsV33,
  claimProposalV33Schema,
  createEvidenceFragmentV33,
  createSourceReferenceV33,
  type ClaimProposalV3_3,
  type ClaimV3_3,
} from "./history-research-v33.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

const proposal = (
  unitId: string,
  text: string,
  extra: Partial<ClaimProposalV3_3> = {}
): ClaimProposalV3_3 =>
  claimProposalV33Schema.parse({
    narrationUnitId: unitId,
    verbatimText: text,
    normalizedProposition: text,
    claimKind: "event",
    materialityRecommendation: "material",
    entities: [{ text: "Napoleon", role: "person" }],
    temporalQualifiers: ["1812"],
    geographicQualifiers: ["Russia"],
    quantitativeQualifiers: [],
    uncertaintyMarkers: [],
    requiresMultipleSources: false,
    researchHints: ["napoleon russia 1812"],
    ...extra,
  });

const claimsFromScript = (script: string): ClaimV3_3[] => {
  const narration = normalizeHistoryNarrationV33({
    episodeId: "episode",
    rawScript: script,
  });
  const proposals = narration.units.map((unit) =>
    proposal(unit.id, unit.text)
  );
  return alignClaimProposalsV33({
    episodeId: "episode",
    narration,
    proposals,
  });
};

describe("History V3.3 cost configuration", () => {
  it("loads Luna-first defaults", () => {
    const config = loadHistoryResearchCostConfigV33({}, {});
    expect(config.claimExtractionModel).toBe("gpt-5.6-luna");
    expect(config.escalationModel).toBe("gpt-5.6-terra");
    expect(config.maxWebSearchCallsPerEpisode).toBe(20);
    expect(config.hardMaxWebSearchCallsPerEpisode).toBe(25);
    expect(config.maxEvidenceFragmentsPerClaim).toBe(3);
    expect(config.useBatchApi).toBe(true);
    expect(redactHistoryResearchCostConfigV33(config).secretsPresent).toEqual({
      openAiApiKey: Boolean(process.env["OPENAI_API_KEY"]),
      openAiApiToken: Boolean(process.env["OPENAI_API_TOKEN"]),
    });
  });

  it("applies environment overrides and rejects invalid budgets", () => {
    const config = loadHistoryResearchCostConfigV33(
      {},
      {
        HISTORY_CLAIM_EXTRACTION_MODEL: "gpt-5.6-luna-custom",
        HISTORY_MAX_WEB_SEARCH_CALLS_PER_EPISODE: "15",
        HISTORY_SOFT_COST_BUDGET_USD_PER_EPISODE: "1.00",
      }
    );
    expect(config.claimExtractionModel).toBe("gpt-5.6-luna-custom");
    expect(config.maxWebSearchCallsPerEpisode).toBe(15);
    expect(() =>
      validateHistoryResearchCostConfigV33({
        ...HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
        softCostBudgetUsdPerEpisode: 3,
        hardCostBudgetUsdPerEpisode: 2,
      })
    ).toThrow(HistoryResearchCostConfigErrorV33);
    expect(() =>
      loadHistoryResearchCostConfigV33(
        {},
        { HISTORY_MAX_WEB_SEARCH_CALLS_PER_EPISODE: "0" }
      )
    ).toThrow(HistoryResearchCostConfigErrorV33);
  });
});

describe("History V3.3 model routing and escalation", () => {
  it("does not escalate ordinary extraction or clear support", () => {
    expect(shouldEscalateOrdinaryExtractionV33()).toBe(false);
    const claim = claimsFromScript("In 1812 Napoleon invaded Russia.")[0]!;
    const decision = decideEvidenceEscalationV33({
      config: HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
      claim,
      assessments: [
        {
          claimId: claim.id,
          evidenceFragmentId: "evidence-1",
          assessment: "supports",
          supportedAspects: ["date"],
          unsupportedAspects: [],
          contradictionAspects: [],
          temporalAlignment: "aligned",
          geographicAlignment: "aligned",
          entityAlignment: "aligned",
          rationale: "clear_support",
          confidence: 0.9,
        },
      ],
    });
    expect(decision.escalate).toBe(false);
  });

  it("escalates contested material claims and records reasons", () => {
    const claim = claimsFromScript("In 1812 Napoleon invaded Russia.")[0]!;
    const decision = decideEvidenceEscalationV33({
      config: HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
      claim: { ...claim, material: true },
      assessments: [
        {
          claimId: claim.id,
          evidenceFragmentId: "evidence-1",
          assessment: "supports",
          supportedAspects: [],
          unsupportedAspects: [],
          contradictionAspects: [],
          temporalAlignment: "aligned",
          geographicAlignment: "aligned",
          entityAlignment: "aligned",
          rationale: "clear_support",
          confidence: 0.8,
        },
        {
          claimId: claim.id,
          evidenceFragmentId: "evidence-2",
          assessment: "contradicts",
          supportedAspects: [],
          unsupportedAspects: [],
          contradictionAspects: ["date"],
          temporalAlignment: "misaligned",
          geographicAlignment: "aligned",
          entityAlignment: "aligned",
          rationale: "conflict",
          confidence: 0.7,
        },
      ],
    });
    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain("evidence_assessment_conflict");
  });

  it("fails clearly when a configured model is unavailable", async () => {
    await expect(
      assertHistoryModelsAvailableV33({
        models: ["missing-model"],
        client: {
          models: {
            retrieve: async () => {
              throw new Error("404 model not found");
            },
          },
        },
      })
    ).rejects.toBeInstanceOf(HistoryModelAvailabilityErrorV33);
  });
});

describe("History V3.3 clustering and search budgets", () => {
  it("clusters related claims instead of one cluster per claim", () => {
    const claims = claimsFromScript(
      [
        "In 1812 Napoleon invaded Russia.",
        "Napoleon's army crossed the Niemen into Russia in 1812.",
        "The retreat from Moscow devastated Napoleon's forces.",
        "Separately, the Bronze Age collapse reshaped the eastern Mediterranean.",
      ].join(" ")
    );
    const clusters = clusterClaimsForResearchV33(claims);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBeLessThan(claims.length);
    expect(
      prioritizeResearchClustersV33(clusters)[0]!.priorityScore
    ).toBeGreaterThanOrEqual(clusters.at(-1)!.priorityScore);
  });

  it("enforces soft, hard, per-cluster, and alternate-source limits", () => {
    const ledger = createSearchBudgetLedgerV33({
      maxWebSearchCallsPerEpisode: 2,
      hardMaxWebSearchCallsPerEpisode: 3,
      maxSearchesPerResearchCluster: 1,
      maxAlternateSourceAttempts: 1,
    });
    expect(
      canPerformSearchV33(ledger, {
        clusterId: "c1",
        kind: "discovery",
        lowPriority: false,
      }).allowed
    ).toBe(true);
    let next = recordSearchCallV33(ledger, {
      clusterId: "c1",
      query: "q1",
      kind: "discovery",
      retrievedResultCount: 2,
      acceptedSourceCount: 1,
      rejectedSourceCount: 1,
      rejectionReasons: ["thin"],
      estimatedDirectSearchCostUsd: null,
    });
    expect(
      canPerformSearchV33(next, {
        clusterId: "c1",
        kind: "discovery",
        lowPriority: false,
      }).reason
    ).toBe("cluster_limit_reached");
    next = recordSearchCallV33(next, {
      clusterId: "c2",
      query: "q2",
      kind: "discovery",
      retrievedResultCount: 1,
      acceptedSourceCount: 1,
      rejectedSourceCount: 0,
      rejectionReasons: [],
      estimatedDirectSearchCostUsd: null,
    });
    expect(
      canPerformSearchV33(next, {
        clusterId: "c3",
        kind: "discovery",
        lowPriority: true,
      }).reason
    ).toBe("soft_limit_reached");
    next = recordSearchCallV33(next, {
      clusterId: "c3",
      query: "q3",
      kind: "discovery",
      retrievedResultCount: 0,
      acceptedSourceCount: 0,
      rejectedSourceCount: 0,
      rejectionReasons: [],
      estimatedDirectSearchCostUsd: null,
    });
    expect(
      canPerformSearchV33(next, {
        clusterId: "c4",
        kind: "discovery",
        lowPriority: false,
      }).reason
    ).toBe("hard_limit_reached");
    expect(
      canPerformSearchV33(next, {
        clusterId: null,
        kind: "alternate-source",
      }).allowed
    ).toBe(false);
  });
});

describe("History V3.3 source reuse and fragment selection", () => {
  it("creates source revisions on content change and reuses identical bodies", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hist33-source-"));
    roots.push(root);
    const first = await upsertSourceBodyCacheV33({
      stateRoot: root,
      canonicalIdentity: "url:https://example.edu/a",
      canonicalUrl: "https://example.edu/a",
      contentHash: "a".repeat(64),
      contentType: "text/html",
      body: "one",
      retrievedAt: "1980-01-01T00:00:00.000Z",
    });
    const same = await upsertSourceBodyCacheV33({
      stateRoot: root,
      canonicalIdentity: "url:https://example.edu/a",
      canonicalUrl: "https://example.edu/a",
      contentHash: "a".repeat(64),
      contentType: "text/html",
      body: "one",
      retrievedAt: "1980-01-01T00:00:00.000Z",
    });
    const changed = await upsertSourceBodyCacheV33({
      stateRoot: root,
      canonicalIdentity: "url:https://example.edu/a",
      canonicalUrl: "https://example.edu/a",
      contentHash: "b".repeat(64),
      contentType: "text/html",
      body: "two",
      retrievedAt: "1980-01-02T00:00:00.000Z",
    });
    expect(same.revision).toBe(first.revision);
    expect(changed.revision).toBe(first.revision + 1);
  });

  it("caps candidate fragments at three and keeps payloads compact", () => {
    const claim = claimsFromScript("In 1812 Napoleon invaded Russia.")[0]!;
    const source = createSourceReferenceV33({
      canonicalUrl: "https://example.edu/history",
      sourceType: "scholarly",
      qualityTier: 2,
      title: "Scholarly",
      authors: [],
      publisherOrInstitution: "example.edu",
      publicationDate: null,
      edition: null,
      language: "en",
      doi: null,
      isbn: null,
      archiveIdentifier: null,
      retrievalProvider: "fixture",
      retrievedAt: "1980-01-01T00:00:00.000Z",
      snapshotHash: null,
      normalizedCitation: "Scholarly",
    });
    const fragments = Array.from({ length: 6 }, (_item, index) =>
      createEvidenceFragmentV33({
        sourceReferenceId: source.id,
        locator: { kind: "paragraph", value: `p:${index}` },
        excerpt: `Napoleon invaded Russia in 1812 paragraph ${index}`,
        independentlyReproducible: true,
        retrievedAt: "1980-01-01T00:00:00.000Z",
      })
    );
    const selected = selectCandidateEvidenceFragmentsV33({
      claims: [claim],
      evidenceFragments: fragments,
      sourceReferences: [source],
      config: HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
    });
    expect(selected.selections[0]!.selectedFragmentIds).toHaveLength(3);
    const payload = buildCompactAssessmentPayloadV33({
      claim,
      fragments: selected.fragmentsByClaim[claim.id]!,
      sources: [source],
    });
    expect(JSON.stringify(payload)).not.toContain("full document");
    expect(payload.fragments).toHaveLength(3);
  });
});

describe("History V3.3 compact output, batch, cache, and cost ledger", () => {
  it("requires detailed rationale only for exceptional assessments", () => {
    expect(
      requiresDetailedRationaleV33({
        result: "supports",
        confidenceBand: "high",
      })
    ).toBe(false);
    expect(
      requiresDetailedRationaleV33({
        result: "contradicts",
        confidenceBand: "medium",
      })
    ).toBe(true);
    const expanded = expandCompactAssessmentV33(
      compactClaimEvidenceAssessmentV33Schema.parse({
        claimId: "c1",
        evidenceFragmentId: "e1",
        result: "supports",
        unsupportedAspects: [],
        contradictionAspects: [],
        temporalAlignment: "aligned",
        geographicAlignment: "aligned",
        entityAlignment: "aligned",
        confidenceBand: "high",
      })
    );
    expect(expanded.rationale).toBe("clear_support");
    expect(expanded.assessment).toBe("supports");
  });

  it("supports fixture batch mode, stable custom IDs, resume, and sync fallback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hist33-batch-"));
    roots.push(root);
    const customId = buildStableBatchCustomIdV33({
      episodeId: "ep",
      operation: "claim-extraction",
      itemKey: "batch-1",
      promptVersion: "p1",
      schemaVersion: "s1",
    });
    expect(customId.startsWith("hist33:")).toBe(true);
    const first = await runHistorySemanticBatchV33({
      config: { useBatchApi: true, resumeCompletedBatches: true },
      stateRoot: root,
      localJobId: "job-1",
      items: [{ customId, body: { model: "gpt-5.6-luna" } }],
      fixtureMode: true,
      syncFallback: async (item) => ({
        customId: item.customId,
        success: true,
        responseJson: { sync: true },
        error: null,
      }),
    });
    expect(first.mode).toBe("fixture");
    const resumed = await runHistorySemanticBatchV33({
      config: { useBatchApi: true, resumeCompletedBatches: true },
      stateRoot: root,
      localJobId: "job-1",
      items: [{ customId, body: { model: "gpt-5.6-luna" } }],
      fixtureMode: true,
      syncFallback: async () => {
        throw new Error("should not rerun");
      },
    });
    expect(resumed.mode).toBe("resumed");
    const sync = await runHistorySemanticBatchV33({
      config: { useBatchApi: false, resumeCompletedBatches: false },
      stateRoot: root,
      localJobId: "job-2",
      items: [{ customId: `${customId}-b`, body: {} }],
      syncFallback: async (item) => ({
        customId: item.customId,
        success: true,
        responseJson: { sync: true },
        error: null,
      }),
    });
    expect(sync.mode).toBe("sync-fallback");
    const parsed = parseHistoryBatchOutputJsonlV33(
      `${JSON.stringify({ custom_id: "a", response: { body: { ok: true } } })}\n`
    );
    expect(parsed[0]?.success).toBe(true);
  });

  it("persists paid batches, projects broad force cost, and never fabricates pricing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hist33-cache-"));
    roots.push(root);
    const cacheKey = buildPaidBatchCacheKeyV33({
      kind: "claim-extraction",
      narrationHash: "n".repeat(64),
      narrationUnitIds: ["u1"],
      model: "gpt-5.6-luna",
      promptVersion: "p",
      schemaVersion: "s",
    });
    await writePaidBatchCacheV33(root, {
      cacheKey,
      kind: "claim-extraction",
      model: "gpt-5.6-luna",
      promptVersion: "p",
      schemaVersion: "s",
      completedAt: "1980-01-01T00:00:00.000Z",
      result: { ok: true },
    });
    expect((await readPaidBatchCacheV33(root, cacheKey))?.result).toEqual({
      ok: true,
    });
    expect(phasesInvalidatedFromV33("assessments")).toEqual([
      "assessments",
      "provenance",
      "visuals",
    ]);
    const projection = projectBroadForceCostV33({
      extractionBatches: 2,
      assessmentBatches: 3,
      searchCalls: 25,
      hardCostBudgetUsd: 2.5,
    });
    expect(projection.warning).toMatch(/Broad --force/);
    const ledger = createEpisodeCostLedgerV33(
      HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
      UNCONFIGURED_HISTORY_PRICING_V33
    );
    expect(formatCostStatusV33(ledger).costEstimate).toBe("unavailable");
    expect(ledger.cumulativeCostUsd).toBeNull();
    const priced = createEpisodeCostLedgerV33(
      HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
      {
        version: "history-pricing.v1",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        models: {
          "gpt-5.6-luna": {
            inputUsdPer1M: 1,
            outputUsdPer1M: 2,
          },
        },
      }
    );
    const after = appendCostLedgerEntryV33(priced, {
      version: "history-pricing.v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      models: {
        "gpt-5.6-luna": { inputUsdPer1M: 1, outputUsdPer1M: 2 },
      },
    }, {
      provider: "openai",
      model: "gpt-5.6-luna",
      operation: "claim-extraction",
      batchId: null,
      inputTokens: 2_000,
      cachedInputTokens: 0,
      outputTokens: 500,
      reasoningTokens: null,
      webSearchCalls: 0,
      timestamp: "1980-01-01T00:00:00.000Z",
    });
    expect(after.cumulativeCostUsd).toBeGreaterThan(0);
    expect(canSpendPaidWorkV33(after).allowed).toBe(true);
    const exhausted = appendCostLedgerEntryV33(after, {
      version: "history-pricing.v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      models: {
        "gpt-5.6-luna": { inputUsdPer1M: 1_000, outputUsdPer1M: 1_000 },
      },
    }, {
      provider: "openai",
      model: "gpt-5.6-luna",
      operation: "claim-extraction",
      batchId: null,
      inputTokens: 3_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null,
      webSearchCalls: 0,
      timestamp: "1980-01-01T00:00:00.000Z",
    });
    expect(canSpendPaidWorkV33(exhausted).allowed).toBe(false);
    expect(canSpendPaidWorkV33(exhausted).reason).toBe("hard_budget_reached");
  });

  it("estimates dry-run ceilings without paid calls", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: "episode",
      rawScript: "In 1812 Napoleon invaded Russia. The retreat was catastrophic.",
    });
    const estimate = estimateHistoryResearchDryRunV33({
      config: HISTORY_RESEARCH_COST_CONFIG_DEFAULTS_V33,
      narration,
    });
    expect(estimate.paidCalls).toBe(false);
    expect(estimate.effectiveModels.claimExtractionModel).toBe("gpt-5.6-luna");
    expect(estimate.effectiveModels.escalationModel).toBe("gpt-5.6-terra");
    expect(estimate.webSearchHardCeiling).toBe(25);
    expect(estimate.evidenceFragmentCap).toBe(3);
    expect(estimate.expectedExtractionBatches).toBeGreaterThan(0);
  });
});
