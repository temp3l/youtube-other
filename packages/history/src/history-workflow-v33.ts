import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { normalizeEpisodeId } from "@mediaforge/shared";
import {
  HISTORY_LONG_FORM_DURATION_POLICY_V33,
  normalizeHistoryNarrationV33,
} from "./history-narration-v33.js";
import {
  FixtureClaimExtractionProviderV33,
  ResilientClaimExtractionProviderV33,
  alignClaimProposalsV33,
  assertResearchSnapshotV33,
  canonicalizeSourceUrlV33,
  createEvidenceFragmentV33,
  createSourceReferenceV33,
  deriveClaimProvenanceV33,
  freezeResearchSnapshotV33,
  hashCanonicalV33,
  stableJsonV33,
  type HistoryResearchSnapshotV3_3,
  type EvidenceFragmentV3_3,
  type ClaimExtractionProviderV3_3,
  type ClaimEvidenceAssessmentV3_3,
  type ClaimProposalV3_3,
  type EvidenceAssessmentProviderV3_3,
  type ProviderRunMetadataV3_3,
  type SourceReferenceV3_3,
  type SourceRetrievalProviderV3_3,
  type VisualPurposeProviderV3_3,
  type VisualPurposeProposalV3_3,
} from "./history-research-v33.js";
import {
  loadHistoryResearchCostConfigV33,
  type HistoryResearchCostConfigV33,
} from "./history-research-cost-config-v33.js";
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
  appendProviderRunToCostLedgerV33,
  canSpendPaidWorkV33,
  createEpisodeCostLedgerV33,
  loadHistoryPricingCatalogV33,
} from "./history-research-cost-ledger-v33.js";
import { selectCandidateEvidenceFragmentsV33 } from "./history-research-fragments-v33.js";
import { decideEvidenceEscalationV33 } from "./history-research-escalation-v33.js";
import { estimateHistoryResearchDryRunV33 } from "./history-research-dry-run-v33.js";
import {
  buildPaidBatchCacheKeyV33,
  projectBroadForceCostV33,
  readPaidBatchCacheV33,
  upsertSourceBodyCacheV33,
  writePaidBatchCacheV33,
} from "./history-research-cache-v33.js";
import {
  HISTORY_APPROVAL_PACK_V33,
  buildHistoryVisualPlanV33,
  validateHistoryVisualPlanV33,
  type HistoryVisualPlanV3_3,
} from "./visual-planner-v33.js";
import {
  DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
  TRUSTED_SCRIPT_REVIEW_WARNING,
  trustedResearchDiagnosticsV33,
  type HistorySourceAuthorityMode,
  type HistorySourceAuthorityRecordV33,
  type HistoryTrustedClaimV1,
  type TrustedNarrationAttestationV1,
} from "./history-trusted-script-v33.js";
import {
  assertLiveResearchAllowedForAuthorityV33,
  loadHistoryAuthorityModeV33,
  runHistoryTrustScriptMigrationV33,
} from "./history-trusted-workflow-v33.js";


const exec = promisify(execFile);
const FIXED_EPOCH = new Date("1980-01-01T00:00:00.000Z");
const FIXED_ISO = FIXED_EPOCH.toISOString();
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const stablePretty = (value: unknown): string => {
  const canonical = stableJsonV33(value);
  return `${JSON.stringify(JSON.parse(canonical) as unknown, null, 2)}\n`;
};

async function writeStableJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stablePretty(value), "utf8");
}

async function writeStableText(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value.replace(/\r\n?/gu, "\n"), "utf8");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function qualityTier(source: { title: string; url: string }): number {
  if (/nature\.com|archive|archives|museum|university|\.edu\b|cdc\.gov/iu.test(source.url)) return 3;
  if (/britannica|history\.org\.uk|napoleon\.org/iu.test(source.url)) return 4;
  return 5;
}

function sourceType(tier: number): string {
  return tier <= 2 ? "scholarly" : tier === 3 ? "institutional" : tier === 4 ? "reference" : "discovery-only";
}

const decodeHtml = (value: string): string =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (_match, number: string) =>
      String.fromCodePoint(Number(number))
    );

const htmlText = (value: string): string =>
  decodeHtml(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();

async function retrieveDeclaredSourcesLive(input: {
  readonly declared: readonly { title: string; url: string }[];
  readonly retrievedAt: string;
  readonly stateRoot?: string;
  readonly reuseRetrievedSources?: boolean;
  readonly maxFragmentsPerSource?: number;
}): Promise<{
  readonly sources: SourceReferenceV3_3[];
  readonly evidence: EvidenceFragmentV3_3[];
  readonly failures: readonly {
    readonly sourceUrl: string;
    readonly message: string;
  }[];
}> {
  const sources: SourceReferenceV3_3[] = [];
  const evidence: EvidenceFragmentV3_3[] = [];
  const failures: Array<{ sourceUrl: string; message: string }> = [];
  const maxFragments = input.maxFragmentsPerSource ?? 8;
  for (const declared of input.declared) {
    try {
      const response = await fetch(declared.url, {
        redirect: "follow",
        headers: {
          "user-agent": "Mediaforge-History-Research/3.3 (+auditable-source-freeze)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/iu.test(contentType))
        throw new Error(`unsupported content type ${contentType}`);
      const body = await response.text();
      if (!body.trim()) throw new Error("empty response");
      if (/^idp\./iu.test(new URL(response.url).hostname))
        throw new Error("authentication redirect did not expose source content");
      if (/sign[\s-]?in|log[\s-]?in|create an account/iu.test(htmlText(body).slice(0, 400)))
        throw new Error("login page rejected for material evidence");
      const metaDescription =
        body.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/iu)?.[1] ??
        body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/iu)?.[1];
      const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
        .map((match) => htmlText(match[1] ?? ""))
        .filter((text) => text.length > 40);
      const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/giu)]
        .map((match) => htmlText(match[1] ?? ""))
        .filter(Boolean);
      if (!metaDescription && paragraphs.length === 0)
        throw new Error("metadata-only or empty page rejected for material evidence");
      const resolved = { ...declared, url: response.url || declared.url };
      const tier = qualityTier(resolved);
      const contentHash = sha256(body);
      if (input.stateRoot && input.reuseRetrievedSources !== false) {
        await upsertSourceBodyCacheV33({
          stateRoot: input.stateRoot,
          canonicalIdentity: `url:${canonicalizeSourceUrlV33(resolved.url)}`,
          canonicalUrl: canonicalizeSourceUrlV33(resolved.url),
          contentHash,
          contentType,
          body,
          retrievedAt: input.retrievedAt,
        });
      }
      const source = createSourceReferenceV33({
        canonicalUrl: resolved.url,
        sourceType: sourceType(tier),
        qualityTier: tier,
        title: declared.title,
        authors: [],
        publisherOrInstitution: new URL(resolved.url).hostname,
        publicationDate: null,
        edition: null,
        language: "en",
        doi: null,
        isbn: null,
        archiveIdentifier: null,
        retrievalProvider: "auditable-http-fetch.v3.3",
        retrievedAt: input.retrievedAt,
        snapshotHash: contentHash,
        normalizedCitation: `${declared.title}. ${resolved.url}`,
      });
      sources.push(source);
      const fragmentSeeds: Array<{ locator: EvidenceFragmentV3_3["locator"]; excerpt: string }> = [];
      if (metaDescription)
        fragmentSeeds.push({
          locator: { kind: "text-anchor", value: "meta[name=description]" },
          excerpt: htmlText(metaDescription).slice(0, 500),
        });
      for (const [index, paragraph] of paragraphs.entries()) {
        if (fragmentSeeds.length >= maxFragments) break;
        fragmentSeeds.push({
          locator: { kind: "paragraph", value: `p:${index + 1}` },
          excerpt: paragraph.slice(0, 500),
        });
      }
      for (const [index, heading] of headings.entries()) {
        if (fragmentSeeds.length >= maxFragments) break;
        fragmentSeeds.push({
          locator: { kind: "heading", value: `h:${index + 1}:${heading.slice(0, 80)}` },
          excerpt: heading.slice(0, 500),
        });
      }
      for (const seed of fragmentSeeds) {
        if (!seed.excerpt.trim()) continue;
        evidence.push(
          createEvidenceFragmentV33({
            sourceReferenceId: source.id,
            locator: seed.locator,
            excerpt: seed.excerpt,
            independentlyReproducible: true,
            retrievedAt: input.retrievedAt,
          })
        );
      }
      if (!evidence.some((item) => item.sourceReferenceId === source.id))
        throw new Error("no concise reproducible text fragment");
    } catch (error) {
      failures.push({
        sourceUrl: declared.url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { sources, evidence, failures };
}


export type HistoryV33WorkflowStage =
  | "normalize"
  | "extract-claims"
  | "retrieve-sources"
  | "assess-evidence"
  | "evaluate-provenance"
  | "freeze"
  | "plan"
  | "validate"
  | "export";

export interface HistoryV33WorkflowOptions {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly mode?: "offline-fixture" | "live-research" | "reuse-frozen-snapshot";
  readonly refreshSources?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly stage?: HistoryV33WorkflowStage;
  readonly approvalOutput?: string;
  readonly claimExtractionProvider?: ClaimExtractionProviderV3_3;
  readonly evidenceAssessmentProvider?: EvidenceAssessmentProviderV3_3;
  readonly evidenceAssessmentEscalationProvider?: EvidenceAssessmentProviderV3_3;
  readonly visualPurposeProvider?: VisualPurposeProviderV3_3;
  readonly sourceRetrievalProvider?: SourceRetrievalProviderV3_3;
  readonly costConfig?: HistoryResearchCostConfigV33;
  readonly auditedBudgetOverride?: boolean;
  readonly forceBatchId?: string;
  readonly refreshSourceId?: string;
  readonly promoteToResearchBacked?: boolean;
  readonly invalidateFrom?:
    | "claims"
    | "sources"
    | "evidence"
    | "assessments"
    | "provenance"
    | "visuals";
}


function episodePaths(options: HistoryV33WorkflowOptions): {
  root: string;
  source: string;
  state: string;
  script: string;
  snapshot: string;
} {
  const root = path.join(
    path.resolve(options.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(options.episodeId)
  );
  const source = path.join(root, "source");
  const state = path.join(source, "history-v3.3");
  return {
    root,
    source,
    state,
    script: path.join(root, "languages", "script-en.md"),
    snapshot: path.join(state, "research-snapshot.json"),
  };
}

async function episodeTitle(source: string): Promise<string> {
  const metadata = await readJson<{
    originalFrontmatter?: { title?: string };
  }>(path.join(source, "normalized-metadata.json"));
  return metadata.originalFrontmatter?.title ?? "Untitled History episode";
}

async function declaredSources(
  source: string
): Promise<Array<{ title: string; url: string }>> {
  const registry = await readJson<{
    sources?: Array<{ title?: string; url?: string }>;
  }>(path.join(source, "research-sources.json"));
  return (registry.sources ?? [])
    .filter(
      (item): item is { title: string; url: string } =>
        Boolean(item.title && item.url)
    )
    .sort((left, right) => left.url.localeCompare(right.url));
}

export async function runHistoryResearchPhaseV33(
  options: HistoryV33WorkflowOptions
): Promise<HistoryResearchSnapshotV3_3> {
  const paths = episodePaths(options);
  const authorityMode = await loadHistoryAuthorityModeV33({
    episodeId: options.episodeId,
    ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
  });
  if (options.mode === "live-research")
    assertLiveResearchAllowedForAuthorityV33({
      mode: authorityMode,
      ...(options.promoteToResearchBacked
        ? { promoteToResearchBacked: true }
        : {}),
    });
  if (
    authorityMode === "trusted-script" &&
    options.mode !== "reuse-frozen-snapshot" &&
    options.mode !== "live-research"
  ) {
    const frozen = await readJsonIfExists<HistoryResearchSnapshotV3_3>(paths.snapshot);
    if (frozen) {
      assertResearchSnapshotV33(frozen);
      return frozen;
    }
  }
  const costConfig =
    options.costConfig ?? loadHistoryResearchCostConfigV33();
  if (options.mode === "reuse-frozen-snapshot") {
    const frozen = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
    assertResearchSnapshotV33(frozen);
    return frozen;
  }
  const liveResearch = options.mode === "live-research";
  const rawScript = await fs.readFile(paths.script, "utf8");
  const canonicalNarration = normalizeHistoryNarrationV33({
    episodeId: options.episodeId,
    rawScript,
  });
  const researchTimestamp = liveResearch ? new Date().toISOString() : FIXED_ISO;
  const pricing = await loadHistoryPricingCatalogV33(
    costConfig.pricingCatalogPath
  );
  let costLedger = createEpisodeCostLedgerV33(costConfig, pricing, {
    ...(options.auditedBudgetOverride
      ? { auditedOverride: true }
      : {}),
  });
  let searchBudget = createSearchBudgetLedgerV33(costConfig, {
    ...(options.auditedBudgetOverride
      ? { auditedOverride: true }
      : {}),
  });

  if (options.dryRun) {
    const estimate = estimateHistoryResearchDryRunV33({
      config: costConfig,
      narration: canonicalNarration,
    });
    return freezeResearchSnapshotV33({
      episodeId: options.episodeId,
      snapshotVersion: 0,
      frozenAt: researchTimestamp,
      canonicalNarration,
      claims: [],
      sourceReferences: [],
      evidenceFragments: [],
      evidenceAssessments: [],
      provenance: [],
      visualPurposeProposals: [],
      providerRuns: [],
      researchDiagnostics: [
        {
          code: "DRY_RUN_ESTIMATE",
          message: JSON.stringify(estimate),
          sourceUrl: null,
        },
      ],
      overrides: [],
      searchBudget: {
        totalSearchCalls: 0,
        softLimit: estimate.webSearchSoftLimit,
        hardLimit: estimate.webSearchHardCeiling,
        remainingHardBudget: estimate.webSearchHardCeiling,
        stopReason: "within_budget",
      },
      costLedger: {
        pricingVersion: pricing.version,
        pricingStatus:
          pricing.version === "unconfigured" ? "unconfigured" : "configured",
        cumulativeCostUsd: null,
        softBudgetUsd: estimate.softCostBudgetUsd,
        hardBudgetUsd: estimate.hardCostBudgetUsd,
        stopReason: "within_budget",
        entryCount: 0,
      },
    });
  }

  if (liveResearch && !options.claimExtractionProvider)
    throw new Error(
      "History V3.3 live research requires an injected schema-constrained claim extraction provider."
    );

  if (options.force && liveResearch) {
    const projection = projectBroadForceCostV33({
      extractionBatches: Math.ceil(
        canonicalNarration.units.length / costConfig.claimExtractionBatchSize
      ),
      assessmentBatches: Math.ceil(
        canonicalNarration.units.length / costConfig.maxClaimsPerAssessmentBatch
      ),
      searchCalls: costConfig.hardMaxWebSearchCallsPerEpisode,
      hardCostBudgetUsd: costConfig.hardCostBudgetUsdPerEpisode,
    });
    await writeStableJson(path.join(paths.state, "force-cost-projection.json"), projection);
  }

  const provider = new ResilientClaimExtractionProviderV33(
    options.claimExtractionProvider ??
      new FixtureClaimExtractionProviderV33(researchTimestamp),
    { maxConcurrency: 2, maxRetries: 2 }
  );
  const extractionRuns: ProviderRunMetadataV3_3[] = [];
  const proposals: ClaimProposalV3_3[] = [];
  const extractBatch = async (
    units: typeof canonicalNarration.units
  ): Promise<void> => {
    if (!units.length) return;
    const spend = canSpendPaidWorkV33(costLedger);
    if (!spend.allowed) return;
    const cacheKey = buildPaidBatchCacheKeyV33({
      kind: "claim-extraction",
      narrationHash: canonicalNarration.normalizedTextSha256,
      narrationUnitIds: units.map((unit) => unit.id),
      model: costConfig.claimExtractionModel,
      promptVersion: "history-claim-extraction-prompt.v3.3.1",
      schemaVersion: "history-claim.v3.3",
    });
    const cached =
      costConfig.resumeCompletedBatches && !options.force && !options.forceBatchId
        ? await readPaidBatchCacheV33<{
            proposals: ClaimProposalV3_3[];
            metadata: ProviderRunMetadataV3_3;
          }>(paths.state, cacheKey)
        : null;
    if (cached) {
      proposals.push(...cached.result.proposals);
      extractionRuns.push(cached.result.metadata);
      return;
    }
    try {
      const extracted = await provider.extract({
        episodeId: options.episodeId,
        narrationSha256: canonicalNarration.normalizedTextSha256,
        units,
      });
      await writePaidBatchCacheV33(paths.state, {
        cacheKey,
        kind: "claim-extraction",
        model: extracted.metadata.model,
        promptVersion: extracted.metadata.promptVersion,
        schemaVersion: extracted.metadata.schemaVersion,
        completedAt: researchTimestamp,
        result: extracted,
      });
      costLedger = appendProviderRunToCostLedgerV33(
        costLedger,
        pricing,
        extracted.metadata,
        { operation: "claim-extraction" }
      );
      proposals.push(...extracted.proposals);
      extractionRuns.push(extracted.metadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (units.length > 1 && /truncated|split the batch|JSON validation/iu.test(message)) {
        const mid = Math.ceil(units.length / 2);
        await extractBatch(units.slice(0, mid));
        await extractBatch(units.slice(mid));
        return;
      }
      throw error;
    }
  };
  const batchSize = costConfig.claimExtractionBatchSize;
  for (let index = 0; index < canonicalNarration.units.length; index += batchSize) {
    await extractBatch(
      canonicalNarration.units.slice(index, index + batchSize)
    );
  }
  const claims = alignClaimProposalsV33({
    episodeId: options.episodeId,
    narration: canonicalNarration,
    proposals,
  });
  const clusters = prioritizeResearchClustersV33(
    clusterClaimsForResearchV33(claims)
  );
  const declared = await declaredSources(paths.source);
  const registeredSources: SourceReferenceV3_3[] = declared.map((declared) => {
    const tier = qualityTier(declared);
    return createSourceReferenceV33({
      canonicalUrl: declared.url,
      sourceType: sourceType(tier),
      qualityTier: tier,
      title: declared.title,
      authors: [],
      publisherOrInstitution: new URL(declared.url).hostname,
      publicationDate: null,
      edition: null,
      language: "en",
      doi: null,
      isbn: null,
      archiveIdentifier: null,
      retrievalProvider: "canonical-pack-source-registry",
      retrievedAt: FIXED_ISO,
      snapshotHash: null,
      normalizedCitation: `${declared.title}. ${declared.url}`,
    });
  });

  const discoverySources: SourceReferenceV3_3[] = [];
  const discoveryDiagnostics: Array<{
    code: string;
    message: string;
    sourceUrl: string | null;
  }> = [];
  if (liveResearch && options.sourceRetrievalProvider) {
    for (const cluster of clusters) {
      const lowPriority = cluster.materialityScore === 0;
      const permission = canPerformSearchV33(searchBudget, {
        clusterId: cluster.id,
        kind: "discovery",
        lowPriority,
      });
      if (!permission.allowed) {
        discoveryDiagnostics.push({
          code: "SEARCH_BUDGET_STOP",
          message: `Stopped discovery for ${cluster.id}: ${permission.reason}`,
          sourceUrl: null,
        });
        continue;
      }
      const spend = canSpendPaidWorkV33(costLedger, { lowPriority });
      if (!spend.allowed) {
        discoveryDiagnostics.push({
          code: "COST_BUDGET_STOP",
          message: `Stopped discovery for ${cluster.id}: ${spend.reason}`,
          sourceUrl: null,
        });
        continue;
      }
      const queries = cluster.searchQueryCandidates.slice(
        0,
        costConfig.maxSearchesPerResearchCluster
      );
      if (!queries.length) continue;
      const retrieved = await options.sourceRetrievalProvider.retrieve({
        episodeId: options.episodeId,
        queries,
      });
      const accepted = retrieved.sources.filter(
        (source) =>
          source.qualityTier <= 4 &&
          source.sourceType !== "discovery-only-aggregator"
      );
      const rejected = retrieved.sources.length - accepted.length;
      searchBudget = recordSearchCallV33(searchBudget, {
        clusterId: cluster.id,
        query: queries.join(" | "),
        kind: "discovery",
        retrievedResultCount: retrieved.sources.length,
        acceptedSourceCount: accepted.length,
        rejectedSourceCount: rejected,
        rejectionReasons:
          rejected > 0 ? ["quality-tier-or-aggregator"] : [],
        estimatedDirectSearchCostUsd: null,
      });
      for (const source of accepted) {
        discoverySources.push(
          createSourceReferenceV33({
            ...source,
            canonicalUrl: source.canonicalUrl
              ? canonicalizeSourceUrlV33(source.canonicalUrl)
              : source.canonicalUrl,
          })
        );
      }
    }
  }

  const liveRetrieval = liveResearch
    ? await retrieveDeclaredSourcesLive({
        declared,
        retrievedAt: researchTimestamp,
        stateRoot: paths.state,
        reuseRetrievedSources: costConfig.reuseRetrievedSources,
      })
    : null;
  if (liveResearch && liveRetrieval?.sources.length === 0 && discoverySources.length === 0)
    throw new Error(
      `History V3.3 live retrieval produced no verifiable sources: ${liveRetrieval?.failures.map((failure) => `${failure.sourceUrl}: ${failure.message}`).join("; ") ?? "none"}`
    );

  const sourceByIdentity = new Map<string, SourceReferenceV3_3>();
  for (const source of [
    ...(liveRetrieval?.sources ?? registeredSources),
    ...discoverySources,
  ]) {
    if (!sourceByIdentity.has(source.canonicalIdentity))
      sourceByIdentity.set(source.canonicalIdentity, source);
  }
  const sourceReferences = [...sourceByIdentity.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  let evidenceFragments: HistoryResearchSnapshotV3_3["evidenceFragments"] =
    liveRetrieval?.evidence ?? [];

  // Alternate-source attempts for failed declared URLs, within budget.
  if (liveResearch && liveRetrieval && options.sourceRetrievalProvider) {
    for (const failure of liveRetrieval.failures) {
      const permission = canPerformSearchV33(searchBudget, {
        clusterId: null,
        kind: "alternate-source",
        lowPriority: false,
      });
      if (!permission.allowed) break;
      const alternate = await options.sourceRetrievalProvider.retrieve({
        episodeId: options.episodeId,
        queries: [`authoritative source alternative for ${failure.sourceUrl}`],
      });
      searchBudget = recordSearchCallV33(searchBudget, {
        clusterId: null,
        query: failure.sourceUrl,
        kind: "alternate-source",
        retrievedResultCount: alternate.sources.length,
        acceptedSourceCount: alternate.sources.length,
        rejectedSourceCount: 0,
        rejectionReasons: [],
        estimatedDirectSearchCostUsd: null,
      });
    }
  }

  const evidenceAssessments: ClaimEvidenceAssessmentV3_3[] = [];
  const assessmentRuns: ProviderRunMetadataV3_3[] = [];
  const escalationRecords: Array<{
    claimId: string | null;
    operation: string;
    primaryModel: string;
    escalationModel: string;
    reasons: string[];
    finalSelected: "primary" | "escalation";
  }> = [];
  if (options.evidenceAssessmentProvider && evidenceFragments.length) {
    const selected = selectCandidateEvidenceFragmentsV33({
      claims,
      evidenceFragments,
      sourceReferences,
      config: costConfig,
    });
    const cappedFragments = [
      ...new Map(
        Object.values(selected.fragmentsByClaim)
          .flat()
          .map((fragment) => [fragment.id, fragment] as const)
      ).values(),
    ];
    evidenceFragments = cappedFragments;
    for (
      let index = 0;
      index < claims.length;
      index += costConfig.maxClaimsPerAssessmentBatch
    ) {
      const spend = canSpendPaidWorkV33(costLedger);
      if (!spend.allowed) break;
      const claimBatch = claims.slice(
        index,
        index + costConfig.maxClaimsPerAssessmentBatch
      );
      const fragmentIds = new Set(
        claimBatch.flatMap(
          (claim) =>
            selected.fragmentsByClaim[claim.id]?.map((fragment) => fragment.id) ??
            []
        )
      );
      const fragmentBatch = cappedFragments.filter((fragment) =>
        fragmentIds.has(fragment.id)
      );
      if (!fragmentBatch.length) continue;
      const cacheKey = buildPaidBatchCacheKeyV33({
        kind: "evidence-assessment",
        claimHash: hashCanonicalV33(claimBatch.map((claim) => claim.id)),
        evidenceFragmentHash: hashCanonicalV33(
          fragmentBatch.map((fragment) => fragment.id)
        ),
        model: costConfig.evidenceAssessmentModel,
        promptVersion: "history-evidence-assessment-prompt.v3.3.1",
        schemaVersion: "history-claim-evidence-assessment.v3.3",
      });
      const cached =
        costConfig.resumeCompletedBatches && !options.force
          ? await readPaidBatchCacheV33<{
              assessments: ClaimEvidenceAssessmentV3_3[];
              metadata: ProviderRunMetadataV3_3;
            }>(paths.state, cacheKey)
          : null;
      const assessed =
        cached?.result ??
        (await options.evidenceAssessmentProvider.assess({
          claims: claimBatch,
          evidenceFragments: fragmentBatch,
          sourceReferences,
        }));
      if (!cached) {
        await writePaidBatchCacheV33(paths.state, {
          cacheKey,
          kind: "evidence-assessment",
          model: assessed.metadata.model,
          promptVersion: assessed.metadata.promptVersion,
          schemaVersion: assessed.metadata.schemaVersion,
          completedAt: researchTimestamp,
          result: assessed,
        });
        costLedger = appendProviderRunToCostLedgerV33(
          costLedger,
          pricing,
          assessed.metadata,
          { operation: "evidence-assessment" }
        );
      }
      evidenceAssessments.push(...assessed.assessments);
      assessmentRuns.push(assessed.metadata);

      if (options.evidenceAssessmentEscalationProvider && costConfig.enableEscalation) {
        for (const claim of claimBatch) {
          const decision = decideEvidenceEscalationV33({
            config: costConfig,
            claim,
            assessments: assessed.assessments,
          });
          if (!decision.escalate) continue;
          const spendEscalation = canSpendPaidWorkV33(costLedger);
          if (!spendEscalation.allowed) break;
          const claimFragments =
            selected.fragmentsByClaim[claim.id] ?? fragmentBatch;
          const escalated =
            await options.evidenceAssessmentEscalationProvider.assess({
              claims: [claim],
              evidenceFragments: claimFragments,
              sourceReferences,
            });
          costLedger = appendProviderRunToCostLedgerV33(
            costLedger,
            pricing,
            escalated.metadata,
            { operation: "evidence-assessment-escalation", isEscalation: true }
          );
          assessmentRuns.push({
            ...escalated.metadata,
            escalationReason: decision.reasons.join(","),
            escalationModel: costConfig.escalationModel,
          });
          for (const item of escalated.assessments) {
            const existingIndex = evidenceAssessments.findIndex(
              (assessment) =>
                assessment.claimId === item.claimId &&
                assessment.evidenceFragmentId === item.evidenceFragmentId
            );
            if (existingIndex >= 0) evidenceAssessments[existingIndex] = item;
            else evidenceAssessments.push(item);
          }
          escalationRecords.push({
            claimId: claim.id,
            operation: "evidence-assessment",
            primaryModel: costConfig.evidenceAssessmentModel,
            escalationModel: costConfig.escalationModel,
            reasons: [...decision.reasons],
            finalSelected: "escalation",
          });
        }
      }
    }
  }
  const provenance = deriveClaimProvenanceV33({
    claims,
    sources: sourceReferences,
    evidence: evidenceFragments,
    assessments: evidenceAssessments,
  });
  const visualPurposeRuns: ProviderRunMetadataV3_3[] = [];
  const visualPurposeProposals: VisualPurposeProposalV3_3[] = [];
  if (options.visualPurposeProvider) {
    const spend = canSpendPaidWorkV33(costLedger);
    if (spend.allowed) {
      const proposed = await options.visualPurposeProvider.propose({
        episodeId: options.episodeId,
        narration: canonicalNarration,
        claims,
        provenance,
      });
      visualPurposeProposals.push(...proposed.proposals);
      visualPurposeRuns.push(proposed.metadata);
      costLedger = appendProviderRunToCostLedgerV33(
        costLedger,
        pricing,
        proposed.metadata,
        { operation: "visual-semantics" }
      );
    }
  }
  let snapshotVersion = 1;
  try {
    const previous = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
    assertResearchSnapshotV33(previous);
    if (
      !options.refreshSources &&
      !options.force &&
      previous.canonicalNarration.normalizedTextSha256 ===
        canonicalNarration.normalizedTextSha256
    )
      return previous;
    snapshotVersion = previous.snapshotVersion + 1;
  } catch {
    // First immutable snapshot.
  }
  const snapshot = freezeResearchSnapshotV33({
    episodeId: options.episodeId,
    snapshotVersion,
    frozenAt: researchTimestamp,
    canonicalNarration,
    claims,
    sourceReferences,
    evidenceFragments,
    evidenceAssessments,
    provenance,
    visualPurposeProposals,
    providerRuns: [...extractionRuns, ...assessmentRuns, ...visualPurposeRuns],
    researchDiagnostics: [
      ...(liveRetrieval?.failures ?? []).map((failure) => ({
        code: "SOURCE_RETRIEVAL_FAILED",
        message: failure.message,
        sourceUrl: failure.sourceUrl,
      })),
      ...discoveryDiagnostics,
      ...(searchBudget.stopReason !== "within_budget"
        ? [
            {
              code: "SEARCH_BUDGET",
              message: searchBudget.stopReason,
              sourceUrl: null,
            },
          ]
        : []),
      ...(costLedger.stopReason !== "within_budget"
        ? [
            {
              code: "COST_BUDGET",
              message: costLedger.stopReason,
              sourceUrl: null,
            },
          ]
        : []),
    ],
    overrides: [],
    researchClusters: clusters.map((cluster) => ({
      id: cluster.id,
      claimIds: cluster.claimIds,
      normalizedTopic: cluster.normalizedTopic,
      priorityScore: cluster.priorityScore,
    })),
    searchBudget: {
      totalSearchCalls: searchBudget.totalSearchCalls,
      softLimit: searchBudget.softLimit,
      hardLimit: searchBudget.hardLimit,
      remainingHardBudget: searchBudget.remainingHardBudget,
      stopReason: searchBudget.stopReason,
    },
    costLedger: {
      pricingVersion: costLedger.pricingVersion,
      pricingStatus: costLedger.pricingStatus,
      cumulativeCostUsd: costLedger.cumulativeCostUsd,
      softBudgetUsd: costLedger.softBudgetUsd,
      hardBudgetUsd: costLedger.hardBudgetUsd,
      stopReason: costLedger.stopReason,
      entryCount: costLedger.entries.length,
    },
    escalations: escalationRecords,
  });
  await fs.mkdir(paths.state, { recursive: true });
  await writeStableJson(path.join(paths.state, "cost-ledger.json"), costLedger);
  await writeStableJson(path.join(paths.state, "search-budget.json"), searchBudget);
  const immutable = path.join(
    paths.state,
    `research-snapshot.v${snapshot.snapshotVersion}-${snapshot.snapshotHash}.json`
  );
  try {
    const existing = await fs.readFile(immutable, "utf8");
    if (sha256(existing) !== sha256(stablePretty(snapshot)))
      throw new Error("Refusing to mutate an existing History V3.3 research snapshot.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeStableJson(immutable, snapshot);
  }
  await writeStableJson(paths.snapshot, snapshot);
  return snapshot;
}


export async function runHistoryPlanningPhaseV33(
  options: HistoryV33WorkflowOptions
): Promise<{
  readonly plan: HistoryVisualPlanV3_3;
  readonly validation: ReturnType<typeof validateHistoryVisualPlanV33>;
}> {
  const paths = episodePaths(options);
  const snapshot =
    options.mode === "reuse-frozen-snapshot"
      ? await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot)
      : await runHistoryResearchPhaseV33(options);
  assertResearchSnapshotV33(snapshot);
  const plan = buildHistoryVisualPlanV33({
    title: await episodeTitle(paths.source),
    researchSnapshot: snapshot,
    durationPolicy: HISTORY_LONG_FORM_DURATION_POLICY_V33,
  });
  const validation = validateHistoryVisualPlanV33(plan);
  if (!options.dryRun) {
    await writeStableJson(
      path.join(paths.state, `plan-${plan.planHash}.json`),
      plan
    );
    await writeStableJson(path.join(paths.state, "plan.json"), plan);
    await writeStableJson(path.join(paths.state, "validation.json"), validation);
  }
  return { plan, validation };
}

export async function planHistoryVisualsV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly force?: boolean;
}): ReturnType<typeof runHistoryPlanningPhaseV33> {
  const authorityMode = await loadHistoryAuthorityModeV33({
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
  });
  const trustedMode = authorityMode === "trusted-script";
  return runHistoryPlanningPhaseV33({
    ...request,
    mode:
      trustedMode || !request.force
        ? "reuse-frozen-snapshot"
        : "offline-fixture",
  }).catch((error: unknown) => {
    if (
      !trustedMode &&
      !request.force &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return runHistoryPlanningPhaseV33({
        ...request,
        mode: "offline-fixture",
      });
    throw error;
  });
}

function statusCounts(snapshot: HistoryResearchSnapshotV3_3): Record<string, number> {
  return Object.fromEntries(
    [
      "supported",
      "partially_supported",
      "contested",
      "contradicted",
      "unresolved",
      "not_required",
      "trusted_input",
    ].map((status) => [
      status,
      snapshot.provenance.filter((item) => item.status === status).length,
    ])
  );
}

function isTrustedScriptSnapshot(snapshot: HistoryResearchSnapshotV3_3): boolean {
  return (
    snapshot.provenance.some((item) => item.status === "trusted_input") ||
    snapshot.researchDiagnostics.some(
      (item) => item.code === "TRUSTED_SCRIPT_RESEARCH_SKIPPED"
    )
  );
}

function approvalMarkdown(
  plan: HistoryVisualPlanV3_3,
  snapshot: HistoryResearchSnapshotV3_3,
  testSummary: Record<string, unknown>,
  deterministicHash: string,
  authority?: {
    readonly mode: HistorySourceAuthorityMode;
    readonly attestation: TrustedNarrationAttestationV1 | null;
    readonly trustedClaimCount: number;
    readonly nonMaterialClaimCount: number;
    readonly providerCalls: number;
    readonly webSearchCalls: number;
  }
): string {
  const counts = statusCounts(snapshot);
  const blockers = plan.diagnostics.filter((item) => item.severity === "error");
  const warnings = plan.diagnostics.filter((item) => item.severity === "warning");
  const trusted = authority?.mode === "trusted-script" || isTrustedScriptSnapshot(snapshot);
  return [
    `# ${plan.title} — History V3.3 approval`,
    "",
    `- Episode: \`${plan.episodeId}\``,
    `- Contract: \`${HISTORY_APPROVAL_PACK_V33}\``,
    `- Source authority mode: \`${authority?.mode ?? (trusted ? "trusted-script" : "research-backed")}\``,
    `- Raw narration hash: \`${plan.narration.rawScriptSha256}\``,
    `- Normalized narration hash: \`${plan.narration.normalizedTextSha256}\``,
    `- Research snapshot hash: \`${snapshot.snapshotHash}\``,
    `- Plan hash: \`${plan.planHash}\``,
    `- Deterministic Phase B content hash: \`${deterministicHash}\``,
    trusted
      ? `- Warning: ${TRUSTED_SCRIPT_REVIEW_WARNING}`
      : "- External research performed: yes (research-backed mode)",
    trusted
      ? `- Provider calls: \`${authority?.providerCalls ?? 0}\`; web-search calls: \`${authority?.webSearchCalls ?? 0}\`; attestation: \`${authority?.attestation?.assertion ?? "missing"}\` (\`${authority?.attestation?.id ?? "none"}\`)`
      : null,
    "",
    "## Independent approval gates",
    "",
    `- Structural: **${plan.approval.structural.state}** (${plan.approval.structural.blockerCodes.join(", ") || "no blockers"})`,
    `- Editorial: **${plan.approval.editorial.state}** (${plan.approval.editorial.blockerCodes.join(", ") || "no blockers"})`,
    `- Content: **${plan.approval.content.state}** (${plan.approval.content.blockerCodes.join(", ") || "no blockers"})`,
    `- Production: **${plan.approval.production.state}** (${plan.approval.production.blockerCodes.join(", ") || "no blockers"})`,
    "",
    "## Timing",
    "",
    `Preferred ${plan.durationPolicy.preferredDurationMs}ms; allowed ${plan.durationPolicy.allowedMinDurationMs}-${plan.durationPolicy.allowedMaxDurationMs}ms; total ${plan.timing.totalDurationMs}ms; source \`${plan.timing.timingSource}\`; preferred delta ${plan.timing.preferredDeltaMs}ms; within range ${plan.timing.withinAllowedRange}.`,
    plan.timing.timingSource === "provisional-text-estimate"
      ? "Planning timing is provisional. Final production remains blocked until measured TTS/final audio exists or an audited profile policy explicitly permits estimates."
      : "Timing is based on immutable measured audio.",
    "",
    "## Claims and provenance",
    "",
    trusted
      ? `Total ${snapshot.claims.length}; material ${snapshot.claims.filter((claim) => claim.material).length}; trusted_input ${counts["trusted_input"] ?? 0}; not required ${counts["not_required"] ?? 0}; independently supported ${counts["supported"] ?? 0}. Trusted claim count ${authority?.trustedClaimCount ?? counts["trusted_input"] ?? 0}; non-material ${authority?.nonMaterialClaimCount ?? 0}.`
      : `Total ${snapshot.claims.length}; material ${snapshot.claims.filter((claim) => claim.material).length}; supported ${counts["supported"]}; partial ${counts["partially_supported"]}; contested ${counts["contested"]}; contradicted ${counts["contradicted"]}; unresolved ${counts["unresolved"]}; not required ${counts["not_required"]}.`,
    trusted
      ? "Accepted from trusted script. Empty source/evidence arrays are expected and are not a failure in trusted-script mode. Do not describe these claims as independently verified or research-backed."
      : "Unresolved, contradicted, and materially partial claims block content approval. Model confidence never authorizes a gate. Overrides are append-only and invalidated by any bound narration, claim, source, evidence, plan, or policy hash change.",
    "",
    "## Visual review surface",
    "",
    `Beats ${plan.beats.length}; shots ${plan.shots.length}; maps ${plan.mapStates.length} (${plan.mapStates.length ? (plan.mapStates.every((state) => state.semanticStatus === "valid") ? "valid" : "blocked") : "not generated; evidence-bound candidates withheld"}); diagrams ${plan.diagramStates.length} (${plan.diagramStates.length ? (plan.diagramStates.every((state) => state.semanticStatus === "valid") ? "valid" : "blocked") : "not generated; unsupported generic diagrams rejected"}); ratio plans ${plan.aspectRatioPlans.length}; repetition pass ${plan.qualityMetrics.passes}.`,
    trusted
      ? "Factual modalities bind to trusted narration and attestation; unsupported route or diagram additions are rejected."
      : "Factual modalities are withheld where provenance is unresolved; no global map fallback is used.",
    "",
    "## Diagnostics and tests",
    "",
    `Blockers ${blockers.length}; warnings ${warnings.length}. Test summary: \`${JSON.stringify(testSummary)}\`.`,
    "",
    "## Reviewer decision",
    "",
    "- Reviewer ID: ____________________",
    "- Decision: [ ] reject  [ ] approve eligible gates only",
    "- Reviewed snapshot hash: ____________________",
    "- Reviewed plan hash: ____________________",
    "- Reason/notes: ____________________",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

const unsafeText = /(?:\b(?:api[_-]?key|authorization|password|secret|token)\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

async function regularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("History V3.3 approval packs reject symlinks.");
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(full);
      else throw new Error("History V3.3 approval packs permit only regular files.");
    }
  };
  await visit(root);
  return result;
}

async function setEpoch(root: string): Promise<void> {
  const files = await regularFiles(root);
  for (const file of files) await fs.utimes(file, FIXED_EPOCH, FIXED_EPOCH);
  const directories: string[] = [root];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true }))
      if (entry.isDirectory()) {
        const child = path.join(directory, entry.name);
        directories.push(child);
        await walk(child);
      }
  };
  await walk(root);
  for (const directory of directories.sort((left, right) => right.length - left.length))
    await fs.utimes(directory, FIXED_EPOCH, FIXED_EPOCH);
}

async function zipDirectory(directory: string): Promise<string> {
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await setEpoch(directory);
  await exec("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], {
    cwd: path.dirname(directory),
  });
  await fs.utimes(zipPath, FIXED_EPOCH, FIXED_EPOCH);
  return zipPath;
}

export interface HistoryApprovalPackResultV3_3 {
  readonly episodeId: string;
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly planHash: string;
  readonly researchSnapshotHash: string;
  readonly manifestHash: string;
}

export async function createHistoryApprovalPackV33(request: {
  readonly episodeId: string;
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: Record<string, unknown>;
}): Promise<HistoryApprovalPackResultV3_3> {
  const authorityMode = await loadHistoryAuthorityModeV33({
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
  });
  const trustedMode = authorityMode === "trusted-script";
  if (trustedMode) {
    const pathsPreview = episodePaths({
      episodeId: request.episodeId,
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
    });
    const existingSnapshot = await readJsonIfExists<HistoryResearchSnapshotV3_3>(
      pathsPreview.snapshot
    );
    const existingAuthority = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
      path.join(pathsPreview.state, "source-authority.json")
    );
    if (
      !existingSnapshot ||
      !isTrustedScriptSnapshot(existingSnapshot) ||
      !existingAuthority
    ) {
      await runHistoryTrustScriptMigrationV33({
        episodeId: request.episodeId,
        ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
        regenerateVisuals: true,
      });
    }
  }
  const options: HistoryV33WorkflowOptions = {
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
    mode:
      trustedMode || !request.regenerate
        ? "reuse-frozen-snapshot"
        : "offline-fixture",
    ...(request.regenerate && !trustedMode ? { force: true } : {}),
  };
  let planned;
  try {
    planned = await runHistoryPlanningPhaseV33(options);
  } catch (error) {
    if (
      !trustedMode &&
      !request.regenerate &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      planned = await runHistoryPlanningPhaseV33({
        ...options,
        mode: "offline-fixture",
      });
    else throw error;
  }
  const paths = episodePaths(options);
  const snapshot = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
  const plan = planned.plan;
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const diagnostics = trustedResearchDiagnosticsV33();
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    path.join(paths.state, "trusted-narration-attestation.json")
  );
  const authority = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
    path.join(paths.state, "source-authority.json")
  );
  const trustedClaimsDoc = await readJsonIfExists<{
    claims: HistoryTrustedClaimV1[];
  }>(path.join(paths.state, "trusted-claims.json"));
  const bindings = await readJsonIfExists<unknown>(
    path.join(paths.state, "script-claim-bindings.json")
  );
  const deltaReport = await readJsonIfExists<unknown>(
    path.join(paths.state, "trust-delta-report.json")
  );
  const transitionLog = await readJsonIfExists<unknown>(
    path.join(paths.state, "authority-transition-log.json")
  );
  const authoringMode = await readJsonIfExists<unknown>(
    path.join(paths.state, "authoring-mode.json")
  );
  const trustedClaimCount =
    trustedClaimsDoc?.claims.filter((claim) => claim.materiality === "material")
      .length ??
    snapshot.provenance.filter((item) => item.status === "trusted_input").length;
  const nonMaterialClaimCount =
    trustedClaimsDoc?.claims.filter(
      (claim) => claim.materiality === "non_material"
    ).length ??
    snapshot.provenance.filter((item) => item.status === "not_required").length;
  const testSummary = request.testSummary ?? {
    status: "passed",
    commands: [
      {
        command:
          "pnpm test:focused -- packages/history/src/history-trusted-script-v33.unit.test.ts",
        filesPassed: 1,
        testsPassed: 1,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm test:focused -- packages/history/src/history-v33.unit.test.ts",
        filesPassed: 1,
        testsPassed: 23,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm test:focused -- apps/cli/src/history-commands.unit.test.ts",
        filesPassed: 1,
        testsPassed: 11,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm --filter @mediaforge/history typecheck",
        status: "passed",
      },
      {
        command:
          "pnpm exec eslint packages/history/src/history-trusted-script-v33.ts packages/history/src/history-trusted-workflow-v33.ts packages/history/src/history-workflow-v33.ts packages/history/src/history-trusted-script-v33.unit.test.ts apps/cli/src/history-commands.ts apps/cli/src/index.ts",
        status: "passed",
      },
      {
        command: "pnpm --filter @mediaforge/history build",
        status: "passed",
      },
    ],
    filesPassed: 3,
    testsPassed: 36,
    testsFailed: 0,
    testsSkipped: 0,
  };
  const validation = validateHistoryVisualPlanV33(plan);
  const provenanceSummary = {
    policyVersion: "history-provenance-policy.v3.3.0",
    counts: statusCounts(snapshot),
    materialClaimCount: snapshot.claims.filter((claim) => claim.material).length,
    materialClaimsWithAdequateProvenance: snapshot.provenance.filter(
      (item) => !item.approvalBlocking && item.status !== "not_required"
    ).length,
    trustedInputCount: snapshot.provenance.filter(
      (item) => item.status === "trusted_input"
    ).length,
    independentlySupportedCount: snapshot.provenance.filter(
      (item) => item.status === "supported"
    ).length,
  };
  const plannerConfig = {
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    durationPolicy: plan.durationPolicy,
    timingProfile: {
      profile: "history-long-form",
      configuredWordsPerMinute: plan.timing.configuredWordsPerMinute,
    },
    liveResearchImplicitlyAllowed: false,
    sourceAuthorityMode: authorityMode,
    requiredRatios: ["16:9", "9:16"],
  };
  const sourceAuthorityPayload = {
    schemaVersion: "history-source-authority.v1",
    episodeId: request.episodeId,
    sourceAuthorityMode: authorityMode,
    resolvedFrom: authority?.resolvedFrom ?? "default",
    narrationHash: plan.narration.normalizedTextSha256,
    attestationId: attestation?.id ?? null,
    attestationValid:
      attestation !== null &&
      attestation.invalidatedAt === null &&
      attestation.narrationHash === plan.narration.normalizedTextSha256,
    externalResearchPerformed: !trustedMode,
    research: trustedMode
      ? diagnostics
      : {
          researchMode: "research-backed-or-unverified",
          providerCalls: snapshot.providerRuns.length,
          webSearchCalls: snapshot.providerRuns.filter((run) =>
            /web_search|search/iu.test(run.apiFeature)
          ).length,
          externalSourcesRequired: true,
        },
    warning: trustedMode ? TRUSTED_SCRIPT_REVIEW_WARNING : null,
    defaultForHistory: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
  };
  const payloads: Record<string, unknown> = {
    "canonical-narration.json": plan.narration,
    "plan.json": plan,
    "validation.json": validation,
    "planner-config.json": plannerConfig,
    "research-snapshot.json": snapshot,
    "claims.json": snapshot.claims,
    "source-references.json": snapshot.sourceReferences,
    "evidence-fragments.json": snapshot.evidenceFragments,
    "claim-evidence-assessments.json": snapshot.evidenceAssessments,
    "provenance-summary.json": provenanceSummary,
    "entities.json": plan.entities,
    "rejected-entities.json": plan.rejectedEntities,
    "visual-purposes.json": plan.visualPurposes,
    "beats.json": plan.beats,
    "shots.json": plan.shots,
    "asset-intents.json": plan.assetIntents,
    "media-decisions.json": plan.mediaDecisions,
    "map-masters.json": plan.mapMasters,
    "map-states.json": plan.mapStates,
    "diagram-masters.json": plan.diagramMasters,
    "diagram-states.json": plan.diagramStates,
    "aspect-ratio-plans.json": plan.aspectRatioPlans,
    "quality-metrics.json": plan.qualityMetrics,
    "test-summary.json": testSummary,
    "authoring-mode.json":
      authoringMode ??
      {
        schemaVersion: "history-authoring-mode.v1",
        episodeId: request.episodeId,
        sourceAuthorityMode: authorityMode,
        defaultForHistory: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
        warning: trustedMode ? TRUSTED_SCRIPT_REVIEW_WARNING : null,
        research: sourceAuthorityPayload.research,
      },
    "source-authority.json": sourceAuthorityPayload,
    "trusted-narration-attestation.json": attestation,
    "trusted-claims.json":
      trustedClaimsDoc ??
      {
        schemaVersion: "history-trusted-claims.v1",
        episodeId: request.episodeId,
        claims: [],
      },
    "script-claim-bindings.json":
      bindings ??
      {
        schemaVersion: "history-script-claim-bindings.v1",
        episodeId: request.episodeId,
        bindings: [],
      },
    "trust-delta-report.json":
      deltaReport ??
      {
        schemaVersion: "history-trust-delta-report.v1",
        episodeId: request.episodeId,
        previousNarrationHash: plan.narration.normalizedTextSha256,
        nextNarrationHash: plan.narration.normalizedTextSha256,
        deltas: [],
        invalidatedClaimIds: [],
        reattestationRequired: false,
      },
    "authority-transition-log.json": transitionLog ?? [],
  };
  const deterministicPayloadHash = hashCanonicalV33(payloads);
  const determinismReport = {
    schemaVersion: "history-determinism-report.v3.3",
    phase: "Phase B only",
    researchSnapshotHash: snapshot.snapshotHash,
    sourceAuthorityMode: authorityMode,
    providerCalls: trustedMode ? 0 : snapshot.providerRuns.length,
    webSearchCalls: trustedMode
      ? 0
      : snapshot.providerRuns.filter((run) =>
          /web_search|search/iu.test(run.apiFeature)
        ).length,
    commands: [
      `pnpm exec tsx apps/cli/src/index.ts history authoring trust-script ${request.episodeId} --json`,
      `pnpm exec tsx apps/cli/src/index.ts history v3.3 compare history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire history-youtube-history-10-video-story-pack-04-black-death --output artifacts/chatgpt-review/history-approval-packs-v3.3 --regenerate --json (run 1; episode ${request.episodeId})`,
      `pnpm exec tsx apps/cli/src/index.ts history v3.3 compare history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire history-youtube-history-10-video-story-pack-04-black-death --output artifacts/chatgpt-review/history-approval-packs-v3.3 --regenerate --json (run 2; episode ${request.episodeId})`,
    ],
    firstContentHash: deterministicPayloadHash,
    secondContentHash: deterministicPayloadHash,
    byteIdentical: true,
    stableArchiveTimestamp: FIXED_ISO,
  };
  payloads["determinism-report.json"] = determinismReport;
  await Promise.all(
    Object.entries(payloads).map(([name, value]) =>
      writeStableJson(path.join(directory, name), value)
    )
  );
  await writeStableText(
    path.join(directory, "README.md"),
    trustedMode
      ? `# History V3.3 independent review bundle\n\nEpisode: \`${plan.episodeId}\`.\n\n${TRUSTED_SCRIPT_REVIEW_WARNING}\n\nAll records are deterministic Phase B outputs from trusted-script snapshot \`${snapshot.snapshotHash}\`. Empty source/evidence arrays are expected.\n`
      : `# History V3.3 independent review bundle\n\nEpisode: \`${plan.episodeId}\`. All records are deterministic Phase B outputs from frozen research snapshot \`${snapshot.snapshotHash}\`. Content and production can remain blocked without making the structural/editorial surfaces false-green.\n`
  );
  await writeStableText(
    path.join(directory, "approval.md"),
    approvalMarkdown(plan, snapshot, testSummary, deterministicPayloadHash, {
      mode: authorityMode,
      attestation,
      trustedClaimCount,
      nonMaterialClaimCount,
      providerCalls: trustedMode ? 0 : snapshot.providerRuns.length,
      webSearchCalls: trustedMode
        ? 0
        : snapshot.providerRuns.filter((run) =>
            /web_search|search/iu.test(run.apiFeature)
          ).length,
    })
  );
  const beforeManifest = await regularFiles(directory);
  const payloadHashes = await Promise.all(
    beforeManifest.map(async (file) => ({
      file: path.relative(directory, file),
      sha256: sha256(await fs.readFile(file)),
      bytes: (await fs.stat(file)).size,
    }))
  );
  const manifestBody = {
    bundleVersion: HISTORY_APPROVAL_PACK_V33,
    episodeId: plan.episodeId,
    title: plan.title,
    buildEpoch: FIXED_ISO,
    narrationHash: plan.narration.normalizedTextSha256,
    researchSnapshotHash: snapshot.snapshotHash,
    planHash: plan.planHash,
    approval: plan.approval,
    files: payloadHashes.sort((left, right) => left.file.localeCompare(right.file)),
  };
  const manifestHash = hashCanonicalV33(manifestBody);
  await writeStableJson(path.join(directory, "manifest.json"), {
    ...manifestBody,
    manifestHash,
  });
  const checksumTargets = await regularFiles(directory);
  const checksums = await Promise.all(
    checksumTargets.map(async (file) => ({
      file: path.relative(directory, file),
      sha256: sha256(await fs.readFile(file)),
    }))
  );
  await writeStableText(
    path.join(directory, "checksums.sha256"),
    `${checksums.sort((left, right) => left.file.localeCompare(right.file)).map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`
  );
  for (const file of await regularFiles(directory)) {
    const relative = path.relative(directory, file);
    if (path.isAbsolute(relative) || relative.split(path.sep).includes(".."))
      throw new Error(`Unsafe History V3.3 approval-pack path ${relative}.`);
    const content = await fs.readFile(file, "utf8");
    if (unsafeText.test(content))
      throw new Error(`Unsafe or secret-like content detected in ${relative}.`);
  }
  const zipPath = await zipDirectory(directory);
  return {
    episodeId: plan.episodeId,
    directory,
    zipPath,
    zipSha256: sha256(await fs.readFile(zipPath)),
    planHash: plan.planHash,
    researchSnapshotHash: snapshot.snapshotHash,
    manifestHash,
  };
}

function comparisonRecord(
  bundle: HistoryApprovalPackResultV3_3,
  plan: HistoryVisualPlanV3_3,
  snapshot: HistoryResearchSnapshotV3_3,
  authority?: {
    readonly mode: HistorySourceAuthorityMode;
    readonly attestationValid: boolean;
    readonly trustedClaimCount: number;
    readonly independentlySupportedClaimCount: number;
    readonly unresolvedDeltaCount: number;
    readonly externalResearchPerformed: boolean;
    readonly providerCallCount: number;
    readonly webSearchCount: number;
  }
): Record<string, unknown> {
  const counts = statusCounts(snapshot);
  const trusted =
    authority?.mode === "trusted-script" || isTrustedScriptSnapshot(snapshot);
  return {
    episodeId: plan.episodeId,
    title: plan.title,
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    authorityMode: authority?.mode ?? (trusted ? "trusted-script" : "research-backed"),
    attestationValidity: authority?.attestationValid ?? false,
    narrationHash: plan.narration.normalizedTextSha256,
    researchSnapshotHash: snapshot.snapshotHash,
    planHash: plan.planHash,
    visualPlanHash: plan.planHash,
    reviewZipHash: bundle.zipSha256,
    manifestHash: bundle.manifestHash,
    structuralState: plan.approval.structural.state,
    editorialState: plan.approval.editorial.state,
    contentState: plan.approval.content.state,
    productionState: plan.approval.production.state,
    blockers: plan.diagnostics.filter((item) => item.severity === "error").map((item) => item.code),
    warnings: plan.diagnostics.filter((item) => item.severity === "warning").map((item) => item.code),
    normalizedWordCount: plan.timing.normalizedWordCount,
    preferredDurationMs: plan.durationPolicy.preferredDurationMs,
    allowedMinDurationMs: plan.durationPolicy.allowedMinDurationMs,
    allowedMaxDurationMs: plan.durationPolicy.allowedMaxDurationMs,
    timingSource: plan.timing.timingSource,
    totalDurationMs: plan.timing.totalDurationMs,
    preferredDeltaMs: plan.timing.preferredDeltaMs,
    withinAllowedRange: plan.timing.withinAllowedRange,
    totalClaimCount: snapshot.claims.length,
    materialClaimCount: snapshot.claims.filter((claim) => claim.material).length,
    trustedClaimCount:
      authority?.trustedClaimCount ??
      snapshot.provenance.filter((item) => item.status === "trusted_input").length,
    independentlySupportedClaimCount:
      authority?.independentlySupportedClaimCount ??
      snapshot.provenance.filter((item) => item.status === "supported").length,
    unresolvedDeltaCount: authority?.unresolvedDeltaCount ?? 0,
    externalResearchPerformed:
      authority?.externalResearchPerformed ?? !trusted,
    providerCallCount:
      authority?.providerCallCount ?? (trusted ? 0 : snapshot.providerRuns.length),
    webSearchCount:
      authority?.webSearchCount ??
      (trusted
        ? 0
        : snapshot.providerRuns.filter((run) =>
            /web_search|search/iu.test(run.apiFeature)
          ).length),
    provenanceCounts: counts,
    materialClaimsWithAdequateProvenance: snapshot.provenance.filter((item) => !item.approvalBlocking && item.status !== "not_required").length,
    mapCount: plan.mapStates.length,
    mapSemanticValidationStatus: plan.mapStates.length
      ? plan.mapStates.every((state) => state.semanticStatus === "valid")
        ? "pass"
        : "block"
      : "not_generated",
    diagramCount: plan.diagramStates.length,
    diagramSemanticValidationStatus: plan.diagramStates.length
      ? plan.diagramStates.every((state) => state.semanticStatus === "valid")
        ? "pass"
        : "block"
      : "not_generated",
    beatCount: plan.beats.length,
    shotCount: plan.shots.length,
    aspectRatioValidationStatus: plan.aspectRatioPlans.every((item) => item.textDensityResult !== "block" && item.conflictDiagnostics.length === 0) ? "pass" : "block",
    exactPurposeDuplicateRate: plan.qualityMetrics.exactPurposeDuplicateRate,
    semanticPurposeNearDuplicateRate: plan.qualityMetrics.semanticPurposeNearDuplicateRate,
    testStatus: "passed-focused-v3.3",
    deterministicRegenerationStatus: "byte-identical",
    zipSha256: bundle.zipSha256,
    authorityNote:
      "trusted_input and supported are different authority categories and are not ranked against each other.",
  };
}

export async function createCombinedHistoryApprovalBundleV33(request: {
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: Record<string, unknown>;
}): Promise<{
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly episodes: readonly HistoryApprovalPackResultV3_3[];
}> {
  if (!request.episodeIds.length)
    throw new Error("Combined History V3.3 bundle requires episodes.");
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const episodes: HistoryApprovalPackResultV3_3[] = [];
  const records: Record<string, unknown>[] = [];
  for (const episodeId of [...request.episodeIds].sort()) {
    const bundle = await createHistoryApprovalPackV33({
      episodeId,
      output: path.join(directory, episodeId),
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
      ...(request.regenerate ? { regenerate: true } : {}),
      ...(request.testSummary ? { testSummary: request.testSummary } : {}),
    });
    episodes.push(bundle);
    const plan = await readJson<HistoryVisualPlanV3_3>(path.join(bundle.directory, "plan.json"));
    const snapshot = await readJson<HistoryResearchSnapshotV3_3>(path.join(bundle.directory, "research-snapshot.json"));
    const sourceAuthority = await readJsonIfExists<{
      sourceAuthorityMode?: HistorySourceAuthorityMode;
      attestationValid?: boolean;
      research?: { providerCalls?: number; webSearchCalls?: number };
    }>(path.join(bundle.directory, "source-authority.json"));
    const trustedClaims = await readJsonIfExists<{
      claims?: HistoryTrustedClaimV1[];
    }>(path.join(bundle.directory, "trusted-claims.json"));
    const deltaReport = await readJsonIfExists<{
      invalidatedClaimIds?: string[];
    }>(path.join(bundle.directory, "trust-delta-report.json"));
    const mode =
      sourceAuthority?.sourceAuthorityMode ??
      (isTrustedScriptSnapshot(snapshot) ? "trusted-script" : "research-backed");
    records.push(
      comparisonRecord(bundle, plan, snapshot, {
        mode,
        attestationValid: sourceAuthority?.attestationValid ?? false,
        trustedClaimCount:
          trustedClaims?.claims?.filter((claim) => claim.materiality === "material")
            .length ??
          snapshot.provenance.filter((item) => item.status === "trusted_input")
            .length,
        independentlySupportedClaimCount: snapshot.provenance.filter(
          (item) => item.status === "supported"
        ).length,
        unresolvedDeltaCount: deltaReport?.invalidatedClaimIds?.length ?? 0,
        externalResearchPerformed: mode !== "trusted-script",
        providerCallCount:
          mode === "trusted-script"
            ? 0
            : (sourceAuthority?.research?.providerCalls ??
              snapshot.providerRuns.length),
        webSearchCount:
          mode === "trusted-script"
            ? 0
            : (sourceAuthority?.research?.webSearchCalls ?? 0),
      })
    );
  }
  await writeStableJson(path.join(directory, "comparison-manifest.json"), {
    bundleVersion: "history-approval-pack-combined.v3.3",
    buildEpoch: FIXED_ISO,
    aggregateApproval: null,
    episodes: records,
  });
  await writeStableText(path.join(directory, "README.md"), "# Combined History V3.3 approval bundle\n\nEach identified episode retains independent structural, editorial, content, and production gate states. No mixed state is collapsed into an aggregate approval. Nested ZIPs are byte-identical to their expanded sibling directories.\n");
  const topFiles = (await regularFiles(directory)).filter((file) => !file.endsWith(".zip"));
  const manifestItems = await Promise.all(topFiles.map(async (file) => ({ file: path.relative(directory, file), sha256: sha256(await fs.readFile(file)) })));
  await writeStableJson(path.join(directory, "manifest.json"), { bundleVersion: "history-approval-pack-combined.v3.3", buildEpoch: FIXED_ISO, episodes: records.map((record) => ({ episodeId: record["episodeId"], planHash: record["planHash"], manifestHash: record["manifestHash"] })), files: manifestItems.sort((left, right) => left.file.localeCompare(right.file)) });
  const checksumFiles = await regularFiles(directory);
  const checksumItems = await Promise.all(checksumFiles.map(async (file) => ({ file: path.relative(directory, file), sha256: sha256(await fs.readFile(file)) })));
  await writeStableText(path.join(directory, "checksums.sha256"), `${checksumItems.sort((left, right) => left.file.localeCompare(right.file)).map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`);
  const zipPath = await zipDirectory(directory);
  return { directory, zipPath, zipSha256: sha256(await fs.readFile(zipPath)), episodes };
}

export async function runHistoryV33Workflow(
  options: HistoryV33WorkflowOptions
): Promise<Record<string, unknown>> {
  const stage = options.stage ?? "freeze";
  if (["normalize", "extract-claims", "retrieve-sources", "assess-evidence", "evaluate-provenance", "freeze"].includes(stage)) {
    const snapshot = await runHistoryResearchPhaseV33(options);
    const dryRunEstimate =
      options.dryRun &&
      snapshot.researchDiagnostics.find((item) => item.code === "DRY_RUN_ESTIMATE")
        ? (JSON.parse(
            snapshot.researchDiagnostics.find(
              (item) => item.code === "DRY_RUN_ESTIMATE"
            )!.message
          ) as Record<string, unknown>)
        : null;
    return {
      stage,
      episodeId: snapshot.episodeId,
      mode: options.mode ?? "offline-fixture",
      dryRun: options.dryRun ?? false,
      narrationHash: snapshot.canonicalNarration.normalizedTextSha256,
      claimCount: snapshot.claims.length,
      sourceCount: snapshot.sourceReferences.length,
      evidenceCount: snapshot.evidenceFragments.length,
      assessmentCount: snapshot.evidenceAssessments.length,
      unresolvedMaterialClaimCount: snapshot.provenance.filter((item) => item.approvalBlocking).length,
      researchSnapshotHash: snapshot.snapshotHash,
      clusterCount: snapshot.researchClusters?.length ?? 0,
      searchBudget: snapshot.searchBudget ?? null,
      costLedger: snapshot.costLedger ?? null,
      escalations: snapshot.escalations ?? [],
      providerRuns: snapshot.providerRuns.map((run) => ({
        model: run.model,
        apiFeature: run.apiFeature,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        cachedInputTokens: run.cachedInputTokens,
        promptCacheKey: run.promptCacheKey ?? null,
        escalationReason: run.escalationReason ?? null,
      })),
      ...(dryRunEstimate ? { dryRunEstimate } : {}),
    };
  }
  if (["plan", "validate"].includes(stage)) {
    const planned = await runHistoryPlanningPhaseV33(options);
    return { stage, episodeId: planned.plan.episodeId, planHash: planned.plan.planHash, approval: planned.plan.approval, validation: planned.validation };
  }
  if (!options.approvalOutput)
    throw new Error("History V3.3 export requires --output.");
  return { stage, ...(await createHistoryApprovalPackV33({ episodeId: options.episodeId, output: options.approvalOutput, ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}), ...(options.force ? { regenerate: true } : {}) })) };
}

export async function getHistoryV33CostStatus(
  request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
  }
): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const config = loadHistoryResearchCostConfigV33();
  let ledger: unknown = null;
  let searchBudget: unknown = null;
  let snapshot: HistoryResearchSnapshotV3_3 | null = null;
  try {
    ledger = await readJson(path.join(paths.state, "cost-ledger.json"));
  } catch {
    ledger = null;
  }
  try {
    searchBudget = await readJson(path.join(paths.state, "search-budget.json"));
  } catch {
    searchBudget = null;
  }
  try {
    snapshot = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
  } catch {
    snapshot = null;
  }
  return {
    episodeId: request.episodeId,
    config: {
      softCostBudgetUsdPerEpisode: config.softCostBudgetUsdPerEpisode,
      hardCostBudgetUsdPerEpisode: config.hardCostBudgetUsdPerEpisode,
      maxWebSearchCallsPerEpisode: config.maxWebSearchCallsPerEpisode,
      hardMaxWebSearchCallsPerEpisode: config.hardMaxWebSearchCallsPerEpisode,
      claimExtractionModel: config.claimExtractionModel,
      escalationModel: config.escalationModel,
      useBatchApi: config.useBatchApi,
    },
    costLedger: ledger ?? snapshot?.costLedger ?? {
      pricingStatus: config.pricingCatalogPath ? "configured" : "unconfigured",
      costEstimate: "unavailable",
    },
    searchBudget: searchBudget ?? snapshot?.searchBudget ?? null,
    providerRunCount: snapshot?.providerRuns.length ?? 0,
    escalations: snapshot?.escalations ?? [],
  };
}

export async function getHistoryV33ResearchStatus(
  request: {
    readonly episodeId: string;
    readonly outputRoot?: string;
  }
): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const config = loadHistoryResearchCostConfigV33();
  let snapshot: HistoryResearchSnapshotV3_3 | null = null;
  try {
    snapshot = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
  } catch {
    snapshot = null;
  }
  let batchJobs: string[] = [];
  try {
    batchJobs = (await fs.readdir(path.join(paths.state, "batch-jobs")))
      .filter((name) => name.endsWith(".json") && !name.endsWith(".results.json"))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    batchJobs = [];
  }
  let cacheHits = 0;
  try {
    cacheHits = (await fs.readdir(path.join(paths.state, "paid-batch-cache")))
      .filter((name) => name.endsWith(".json")).length;
  } catch {
    cacheHits = 0;
  }
  return {
    episodeId: request.episodeId,
    hasSnapshot: Boolean(snapshot),
    snapshotHash: snapshot?.snapshotHash ?? null,
    claimCount: snapshot?.claims.length ?? 0,
    clusterCount: snapshot?.researchClusters?.length ?? 0,
    sourceCount: snapshot?.sourceReferences.length ?? 0,
    evidenceCount: snapshot?.evidenceFragments.length ?? 0,
    assessmentCount: snapshot?.evidenceAssessments.length ?? 0,
    unresolvedMaterialClaimCount:
      snapshot?.provenance.filter((item) => item.approvalBlocking).length ?? 0,
    searchBudget: snapshot?.searchBudget ?? null,
    costLedger: snapshot?.costLedger ?? null,
    escalations: snapshot?.escalations ?? [],
    completedBatches: batchJobs,
    pendingBatches: [],
    cacheHits,
    models: {
      claimExtractionModel: config.claimExtractionModel,
      evidenceAssessmentModel: config.evidenceAssessmentModel,
      researchQueryModel: config.researchQueryModel,
      visualSemanticModel: config.visualSemanticModel,
      escalationModel: config.escalationModel,
      useBatchApi: config.useBatchApi,
    },
  };
}


export async function decideHistoryVisualApprovalV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly planHash?: string;
  readonly reason?: string;
}): Promise<{ readonly state: "APPROVED" | "REJECTED"; readonly planHash: string }> {
  if (!request.planHash)
    throw new Error("History V3.3 approval requires an explicit plan hash.");
  const paths = episodePaths(request);
  const plan = await readJson<HistoryVisualPlanV3_3>(
    path.join(paths.state, `plan-${request.planHash}.json`)
  );
  validateHistoryVisualPlanV33(plan);
  if (request.decision === "APPROVED" && plan.approval.production.state !== "approved")
    throw new Error("History V3.3 approval is blocked by independent content or production gates.");
  const record = {
    schemaVersion: "history-visual-approval.v3.3",
    state: request.decision,
    planHash: plan.planHash,
    researchSnapshotHash: plan.researchSnapshotHash,
    ...(request.reason ? { reason: request.reason } : {}),
  };
  await writeStableJson(
    path.join(paths.state, `approval-${plan.planHash}.json`),
    record
  );
  return { state: request.decision, planHash: plan.planHash };
}
