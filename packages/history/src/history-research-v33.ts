import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CanonicalNarrationUnitV3_3,
  CanonicalNarrationV3_3,
  TextSpanV3_3,
} from "./history-narration-v33.js";
import {
  CLAIM_EXTRACTION_STABLE_PREFIX_V33,
  EVIDENCE_ASSESSMENT_STABLE_PREFIX_V33,
  HISTORY_PROMPT_CACHE_KEYS_V33,
  VISUAL_SEMANTICS_STABLE_PREFIX_V33,
  compactClaimEvidenceAssessmentV33Schema,
  expandCompactAssessmentV33,
} from "./history-research-compact-v33.js";

export const HISTORY_CLAIM_SCHEMA_V33 = "history-claim.v3.3" as const;
export const HISTORY_PROVENANCE_POLICY_V33 =
  "history-provenance-policy.v3.3.0" as const;
export const HISTORY_RESEARCH_SNAPSHOT_V33 =
  "history-research-snapshot.v3.3" as const;

export const hashV33Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const claimProposalV33Schema = z
  .object({
    narrationUnitId: z.string().min(1),
    verbatimText: z.string().min(1),
    normalizedProposition: z.string().min(1),
    claimKind: z.enum([
      "date",
      "quantity",
      "person",
      "place",
      "event",
      "institution",
      "causal",
      "comparative",
      "quotation",
      "interpretation",
      "uncertainty",
      "other",
    ]),
    materialityRecommendation: z.enum([
      "material",
      "non_material",
      "uncertain",
    ]),
    entities: z.array(
      z.object({ text: z.string().min(1), role: z.string().min(1) }).strict()
    ),
    temporalQualifiers: z.array(z.string()),
    geographicQualifiers: z.array(z.string()),
    quantitativeQualifiers: z.array(z.string()),
    uncertaintyMarkers: z.array(z.string()),
    requiresMultipleSources: z.boolean(),
    researchHints: z.array(z.string()),
  })
  .strict();

export type ClaimProposalV3_3 = z.infer<typeof claimProposalV33Schema>;

export interface ClaimV3_3 {
  readonly id: string;
  readonly narrationUnitId: string;
  readonly span: TextSpanV3_3;
  readonly verbatimText: string;
  readonly normalizedProposition: string;
  readonly propositionSha256: string;
  readonly claimKind: ClaimProposalV3_3["claimKind"];
  readonly material: boolean;
  readonly forcedMaterialityReasons: readonly string[];
  readonly requiresMultipleSources: boolean;
  readonly entities: ClaimProposalV3_3["entities"];
  readonly temporalQualifiers: readonly string[];
  readonly geographicQualifiers: readonly string[];
  readonly quantitativeQualifiers: readonly string[];
  readonly uncertaintyMarkers: readonly string[];
  readonly researchHints: readonly string[];
}

export const sourceReferenceV33Schema = z
  .object({
    id: z.string().min(1),
    canonicalIdentity: z.string().min(1),
    canonicalUrl: z.string().url().nullable(),
    sourceType: z.string().min(1),
    qualityTier: z.number().int().min(1).max(5),
    title: z.string().min(1),
    authors: z.array(z.string()),
    publisherOrInstitution: z.string().nullable(),
    publicationDate: z.string().nullable(),
    edition: z.string().nullable(),
    language: z.string().nullable(),
    doi: z.string().nullable(),
    isbn: z.string().nullable(),
    archiveIdentifier: z.string().nullable(),
    retrievalProvider: z.string().min(1),
    retrievedAt: z.string().datetime(),
    snapshotHash: hashV33Schema.nullable(),
    normalizedCitation: z.string().min(1),
  })
  .strict();
export type SourceReferenceV3_3 = z.infer<typeof sourceReferenceV33Schema>;

export const evidenceFragmentV33Schema = z
  .object({
    id: z.string().min(1),
    sourceReferenceId: z.string().min(1),
    locator: z
      .object({
        kind: z.enum([
          "page",
          "section",
          "heading",
          "paragraph",
          "timestamp",
          "text-anchor",
          "other",
        ]),
        value: z.string().min(1),
      })
      .strict(),
    excerpt: z.string().max(1_200),
    excerptHash: hashV33Schema,
    independentlyReproducible: z.boolean(),
    retrievedAt: z.string().datetime(),
  })
  .strict();
export type EvidenceFragmentV3_3 = z.infer<typeof evidenceFragmentV33Schema>;

export const claimEvidenceAssessmentV33Schema = z
  .object({
    claimId: z.string().min(1),
    evidenceFragmentId: z.string().min(1),
    assessment: z.enum([
      "supports",
      "partially_supports",
      "contradicts",
      "irrelevant",
      "ambiguous",
    ]),
    supportedAspects: z.array(z.string()),
    unsupportedAspects: z.array(z.string()),
    contradictionAspects: z.array(z.string()),
    temporalAlignment: z.enum([
      "aligned",
      "misaligned",
      "not_applicable",
      "unclear",
    ]),
    geographicAlignment: z.enum([
      "aligned",
      "misaligned",
      "not_applicable",
      "unclear",
    ]),
    entityAlignment: z.enum([
      "aligned",
      "misaligned",
      "not_applicable",
      "unclear",
    ]),
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type ClaimEvidenceAssessmentV3_3 = z.infer<
  typeof claimEvidenceAssessmentV33Schema
>;

export const visualPurposeProposalV33Schema = z
  .object({
    narrationUnitId: z.string().min(1),
    protectedFactualMeaning: z.string().min(1),
    recommendedModality: z.enum([
      "archival image",
      "historical artwork",
      "map",
      "timeline",
      "diagram",
      "document/quotation",
      "comparison card",
      "restrained atmospheric reconstruction",
      "text-only transition",
      "no generated visual",
    ]),
    semanticJustification: z.string().min(1),
    disallowedMisleadingTreatments: z.array(z.string()),
    requiredEntities: z.array(z.string()),
    requiredDates: z.array(z.string()),
    requiredPlaces: z.array(z.string()),
    requiredQuantities: z.array(z.string()),
    uncertainty: z.array(z.string()),
    evidenceRequirements: z.array(z.string()),
    rejectedModality: z.string().nullable(),
    rejectionReason: z.string().nullable(),
  })
  .strict();
export type VisualPurposeProposalV3_3 = z.infer<
  typeof visualPurposeProposalV33Schema
>;

export type ClaimProvenanceStatusV3_3 =
  | "supported"
  | "partially_supported"
  | "contested"
  | "contradicted"
  | "unresolved"
  | "not_required"
  | "trusted_input";

export interface ClaimProvenanceV3_3 {
  readonly claimId: string;
  readonly status: ClaimProvenanceStatusV3_3;
  readonly policyVersion: typeof HISTORY_PROVENANCE_POLICY_V33;
  readonly sourceReferenceIds: readonly string[];
  readonly evidenceFragmentIds: readonly string[];
  readonly assessmentCount: number;
  readonly approvalBlocking: boolean;
  readonly rationale: string;
}

export const humanOverrideV33Schema = z
  .object({
    id: z.string().min(1),
    sequence: z.number().int().positive(),
    reviewerId: z.string().min(1),
    recordedAt: z.string().datetime(),
    reason: z.string().min(1),
    claimId: z.string().min(1),
    decision: z.enum(["accept", "reject"]),
    boundHashes: z
      .object({
        narrationSha256: hashV33Schema,
        claimSha256: hashV33Schema,
        sourcesSha256: hashV33Schema,
        evidenceSha256: hashV33Schema,
        planSha256: hashV33Schema,
        policySha256: hashV33Schema,
      })
      .strict(),
    previousRecordHash: hashV33Schema.nullable(),
    recordHash: hashV33Schema,
  })
  .strict();
export type HumanOverrideV3_3 = z.infer<typeof humanOverrideV33Schema>;

export interface ProviderRunMetadataV3_3 {
  readonly provider: string;
  readonly model: string;
  readonly apiFeature: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly schemaVersion: string;
  readonly schemaHash: string;
  readonly requestId: string;
  readonly requestedAt: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly retryCount: number;
  readonly cacheKey: string;
  readonly batchId?: string | null;
  readonly escalationReason?: string | null;
  readonly escalationModel?: string | null;
  readonly reasoningTokens?: number | null;
  readonly promptCacheKey?: string | null;
}

export interface HistoryResearchSnapshotV3_3 {
  readonly schemaVersion: typeof HISTORY_RESEARCH_SNAPSHOT_V33;
  readonly episodeId: string;
  readonly snapshotVersion: number;
  readonly frozenAt: string;
  readonly canonicalNarration: CanonicalNarrationV3_3;
  readonly claims: readonly ClaimV3_3[];
  readonly sourceReferences: readonly SourceReferenceV3_3[];
  readonly evidenceFragments: readonly EvidenceFragmentV3_3[];
  readonly evidenceAssessments: readonly ClaimEvidenceAssessmentV3_3[];
  readonly provenance: readonly ClaimProvenanceV3_3[];
  readonly visualPurposeProposals?: readonly VisualPurposeProposalV3_3[];
  readonly providerRuns: readonly ProviderRunMetadataV3_3[];
  readonly researchDiagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly sourceUrl: string | null;
  }[];
  readonly overrides: readonly HumanOverrideV3_3[];
  readonly snapshotHash: string;
  readonly researchClusters?: readonly {
    readonly id: string;
    readonly claimIds: readonly string[];
    readonly normalizedTopic: string;
    readonly priorityScore: number;
  }[];
  readonly searchBudget?: {
    readonly totalSearchCalls: number;
    readonly softLimit: number;
    readonly hardLimit: number;
    readonly remainingHardBudget: number;
    readonly stopReason: string;
  };
  readonly costLedger?: {
    readonly pricingVersion: string;
    readonly pricingStatus: string;
    readonly cumulativeCostUsd: number | null;
    readonly softBudgetUsd: number;
    readonly hardBudgetUsd: number;
    readonly stopReason: string;
    readonly entryCount: number;
  };
  readonly escalations?: readonly {
    readonly claimId: string | null;
    readonly operation: string;
    readonly primaryModel: string;
    readonly escalationModel: string;
    readonly reasons: readonly string[];
    readonly finalSelected: "primary" | "escalation";
  }[];
}

export interface ClaimExtractionProviderV3_3 {
  readonly provider: string;
  extract(input: {
    readonly episodeId: string;
    readonly narrationSha256: string;
    readonly units: readonly CanonicalNarrationUnitV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly proposals: readonly ClaimProposalV3_3[];
    readonly metadata: ProviderRunMetadataV3_3;
  }>;
}

export interface SourceRetrievalProviderV3_3 {
  readonly provider: string;
  retrieve(input: {
    readonly episodeId: string;
    readonly queries: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly sources: readonly Omit<
      SourceReferenceV3_3,
      "id" | "canonicalIdentity"
    >[];
    readonly fragments: readonly Omit<
      EvidenceFragmentV3_3,
      "id" | "sourceReferenceId" | "excerptHash"
    >[];
  }>;
}

export interface EvidenceAssessmentProviderV3_3 {
  readonly provider: string;
  assess(input: {
    readonly claims: readonly ClaimV3_3[];
    readonly evidenceFragments: readonly EvidenceFragmentV3_3[];
    readonly sourceReferences: readonly SourceReferenceV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly assessments: readonly ClaimEvidenceAssessmentV3_3[];
    readonly metadata: ProviderRunMetadataV3_3;
  }>;
}

export interface VisualPurposeProviderV3_3 {
  readonly provider: string;
  propose(input: {
    readonly episodeId: string;
    readonly narration: CanonicalNarrationV3_3;
    readonly claims: readonly ClaimV3_3[];
    readonly provenance: readonly ClaimProvenanceV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly proposals: readonly VisualPurposeProposalV3_3[];
    readonly metadata: ProviderRunMetadataV3_3;
  }>;
}

export type HistoryProviderErrorKindV3_3 =
  | "configuration"
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "transport"
  | "provider"
  | "schema"
  | "semantic";

export class HistoryProviderErrorV3_3 extends Error {
  constructor(
    readonly kind: HistoryProviderErrorKindV3_3,
    message: string,
    readonly retryable: boolean,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = "HistoryProviderErrorV3_3";
  }
}

const retryableProviderError = (error: unknown): boolean => {
  if (error instanceof HistoryProviderErrorV3_3) return error.retryable;
  const status = (error as { status?: unknown })?.status;
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    (error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name))
  );
};

export async function retryHistoryProviderCallV33<T>(input: {
  readonly operation: (attempt: number) => Promise<T>;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly random?: () => number;
  readonly delay?: (milliseconds: number) => Promise<void>;
}): Promise<{ readonly value: T; readonly retryCount: number }> {
  const maxRetries = input.maxRetries ?? 2;
  const baseDelayMs = input.baseDelayMs ?? 250;
  const random = input.random ?? Math.random;
  const delay =
    input.delay ??
    ((milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return { value: await input.operation(attempt), retryCount: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !retryableProviderError(error)) throw error;
      await delay(
        baseDelayMs * 2 ** attempt + Math.floor(random() * baseDelayMs)
      );
    }
  }
  throw lastError;
}

export class ResilientClaimExtractionProviderV33 implements ClaimExtractionProviderV3_3 {
  readonly provider: string;
  readonly #cache = new Map<
    string,
    Awaited<ReturnType<ClaimExtractionProviderV3_3["extract"]>>
  >();
  #active = 0;
  readonly #waiters: Array<() => void> = [];
  #consecutiveFailures = 0;
  #circuitOpenedAt = 0;

  constructor(
    private readonly inner: ClaimExtractionProviderV3_3,
    private readonly options: {
      readonly maxConcurrency?: number;
      readonly maxRetries?: number;
      readonly circuitFailureThreshold?: number;
      readonly circuitResetMs?: number;
      readonly nowMs?: () => number;
      readonly random?: () => number;
      readonly delay?: (milliseconds: number) => Promise<void>;
    } = {}
  ) {
    this.provider = `resilient:${inner.provider}`;
  }

  async extract(input: Parameters<ClaimExtractionProviderV3_3["extract"]>[0]) {
    const cacheKey = hashCanonicalV33({
      episodeId: input.episodeId,
      narrationSha256: input.narrationSha256,
      unitIds: input.units.map((unit) => unit.id),
      provider: this.inner.provider,
    });
    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;
    const nowMs = this.options.nowMs ?? Date.now;
    const resetMs = this.options.circuitResetMs ?? 30_000;
    if (this.#circuitOpenedAt && nowMs() - this.#circuitOpenedAt < resetMs)
      throw new HistoryProviderErrorV3_3(
        "provider",
        "History provider circuit is temporarily open.",
        true
      );
    if (this.#circuitOpenedAt) {
      this.#circuitOpenedAt = 0;
      this.#consecutiveFailures = 0;
    }
    const maxConcurrency = this.options.maxConcurrency ?? 2;
    if (this.#active >= maxConcurrency)
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    this.#active += 1;
    try {
      const executed = await retryHistoryProviderCallV33({
        operation: () => this.inner.extract(input),
        ...(this.options.maxRetries === undefined
          ? {}
          : { maxRetries: this.options.maxRetries }),
        ...(this.options.random ? { random: this.options.random } : {}),
        ...(this.options.delay ? { delay: this.options.delay } : {}),
      });
      const result = {
        ...executed.value,
        metadata: {
          ...executed.value.metadata,
          retryCount: executed.retryCount,
          cacheKey,
        },
      };
      this.#cache.set(cacheKey, result);
      this.#consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.#consecutiveFailures += 1;
      if (
        this.#consecutiveFailures >= (this.options.circuitFailureThreshold ?? 3)
      )
        this.#circuitOpenedAt = nowMs();
      throw error;
    } finally {
      this.#active -= 1;
      this.#waiters.shift()?.();
    }
  }
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const stableJsonV33 = (value: unknown): string =>
  JSON.stringify(
    Array.isArray(value)
      ? value.map((item) => JSON.parse(stableJsonV33(item)) as unknown)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, item]) => [
                key,
                JSON.parse(stableJsonV33(item)) as unknown,
              ])
          )
        : value
  );

export const hashCanonicalV33 = (value: unknown): string =>
  sha256(stableJsonV33(value));

const forcedMateriality = (proposal: ClaimProposalV3_3): string[] => {
  const reasons: string[] = [];
  if (["date", "quantity"].includes(proposal.claimKind))
    reasons.push(proposal.claimKind);
  if (
    [
      "person",
      "place",
      "event",
      "institution",
      "causal",
      "comparative",
      "quotation",
      "interpretation",
    ].includes(proposal.claimKind)
  )
    reasons.push(`claim-kind:${proposal.claimKind}`);
  if (proposal.entities.length) reasons.push("named-entity");
  if (proposal.temporalQualifiers.length) reasons.push("temporal-qualifier");
  if (proposal.geographicQualifiers.length)
    reasons.push("geographic-qualifier");
  if (proposal.quantitativeQualifiers.length)
    reasons.push("quantitative-qualifier");
  if (proposal.requiresMultipleSources) reasons.push("higher-evidence-claim");
  return [...new Set(reasons)].sort();
};

export function alignClaimProposalsV33(input: {
  readonly episodeId: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly proposals: readonly unknown[];
}): ClaimV3_3[] {
  const unitById = new Map(
    input.narration.units.map((unit) => [unit.id, unit] as const)
  );
  const claims: ClaimV3_3[] = [];
  const semanticKeys = new Set<string>();
  for (const raw of input.proposals) {
    const proposal = claimProposalV33Schema.parse(raw);
    const unit = unitById.get(proposal.narrationUnitId);
    if (!unit)
      throw new Error(
        `Claim proposal references unknown narration unit ${proposal.narrationUnitId}.`
      );
    const first = unit.text.indexOf(proposal.verbatimText);
    if (first < 0) throw new Error(`Claim text is not present in ${unit.id}.`);
    if (unit.text.indexOf(proposal.verbatimText, first + 1) >= 0)
      throw new Error(`Claim text is ambiguous in ${unit.id}.`);
    const startUtf16 = unit.startUtf16 + first;
    const endUtf16Exclusive = startUtf16 + proposal.verbatimText.length;
    const proposition = proposal.normalizedProposition
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim();
    const propositionSha256 = sha256(proposition.toLocaleLowerCase());
    const semanticKey = `${unit.id}\u0000${startUtf16}\u0000${endUtf16Exclusive}\u0000${propositionSha256}`;
    if (semanticKeys.has(semanticKey)) continue;
    semanticKeys.add(semanticKey);
    const forcedMaterialityReasons = forcedMateriality(proposal);
    const material =
      forcedMaterialityReasons.length > 0 ||
      proposal.materialityRecommendation !== "non_material";
    claims.push({
      id: `claim-${sha256(
        [
          input.episodeId,
          input.narration.normalizedTextSha256,
          unit.id,
          String(startUtf16),
          String(endUtf16Exclusive),
          propositionSha256,
        ].join("\u0000")
      ).slice(0, 24)}`,
      narrationUnitId: unit.id,
      span: { startUtf16, endUtf16Exclusive },
      verbatimText: proposal.verbatimText,
      normalizedProposition: proposition,
      propositionSha256,
      claimKind: proposal.claimKind,
      material,
      forcedMaterialityReasons,
      requiresMultipleSources:
        proposal.requiresMultipleSources ||
        ["quantity", "causal", "interpretation"].includes(proposal.claimKind),
      entities: proposal.entities,
      temporalQualifiers: proposal.temporalQualifiers,
      geographicQualifiers: proposal.geographicQualifiers,
      quantitativeQualifiers: proposal.quantitativeQualifiers,
      uncertaintyMarkers: proposal.uncertaintyMarkers,
      researchHints: proposal.researchHints,
    });
  }
  return claims.sort(
    (left, right) =>
      left.span.startUtf16 - right.span.startUtf16 ||
      left.id.localeCompare(right.id)
  );
}

export function canonicalizeSourceUrlV33(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/u.test(url.protocol))
    throw new Error("History V3.3 sources require HTTP(S) URLs.");
  url.protocol = url.protocol.toLocaleLowerCase();
  url.hostname = url.hostname.toLocaleLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(?:utm_.+|fbclid|gclid|mc_.+)$/iu.test(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

export function createSourceReferenceV33(
  input: Omit<SourceReferenceV3_3, "id" | "canonicalIdentity">
): SourceReferenceV3_3 {
  const canonicalUrl = input.canonicalUrl
    ? canonicalizeSourceUrlV33(input.canonicalUrl)
    : null;
  const doi = input.doi
    ? input.doi
        .toLocaleLowerCase()
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "")
    : null;
  const isbn = input.isbn
    ? input.isbn.replace(/[^0-9X]/giu, "").toUpperCase()
    : null;
  const canonicalIdentity = [
    canonicalUrl,
    doi ? `doi:${doi}` : null,
    isbn ? `isbn:${isbn}` : null,
    input.archiveIdentifier ? `archive:${input.archiveIdentifier}` : null,
    input.edition,
  ]
    .filter(Boolean)
    .join("|");
  if (!canonicalIdentity)
    throw new Error(
      "A History source requires reproducible canonical identity."
    );
  return sourceReferenceV33Schema.parse({
    ...input,
    canonicalUrl,
    doi,
    isbn,
    canonicalIdentity,
    id: `source-${sha256(canonicalIdentity).slice(0, 24)}`,
  });
}

export function createEvidenceFragmentV33(input: {
  readonly sourceReferenceId: string;
  readonly locator: EvidenceFragmentV3_3["locator"];
  readonly excerpt: string;
  readonly independentlyReproducible: boolean;
  readonly retrievedAt: string;
}): EvidenceFragmentV3_3 {
  const excerpt = input.excerpt.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const excerptHash = sha256(excerpt);
  return evidenceFragmentV33Schema.parse({
    ...input,
    excerpt,
    excerptHash,
    id: `evidence-${sha256(
      `${input.sourceReferenceId}\u0000${input.locator.kind}\u0000${input.locator.value}\u0000${excerptHash}`
    ).slice(0, 24)}`,
  });
}

export function validateAssessmentsV33(input: {
  readonly claims: readonly ClaimV3_3[];
  readonly sources: readonly SourceReferenceV3_3[];
  readonly evidence: readonly EvidenceFragmentV3_3[];
  readonly assessments: readonly unknown[];
}): ClaimEvidenceAssessmentV3_3[] {
  const claimIds = new Set(input.claims.map((claim) => claim.id));
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const evidenceById = new Map(
    input.evidence.map((item) => [item.id, item] as const)
  );
  for (const fragment of input.evidence)
    if (!sourceIds.has(fragment.sourceReferenceId))
      throw new Error(`Evidence ${fragment.id} references an unknown source.`);
  return input.assessments.map((raw) => {
    const assessment = claimEvidenceAssessmentV33Schema.parse(raw);
    if (!claimIds.has(assessment.claimId))
      throw new Error(
        `Assessment references unknown claim ${assessment.claimId}.`
      );
    if (!evidenceById.has(assessment.evidenceFragmentId))
      throw new Error(
        `Assessment references evidence not supplied to the model: ${assessment.evidenceFragmentId}.`
      );
    return assessment;
  });
}

export function deriveClaimProvenanceV33(input: {
  readonly claims: readonly ClaimV3_3[];
  readonly sources: readonly SourceReferenceV3_3[];
  readonly evidence: readonly EvidenceFragmentV3_3[];
  readonly assessments: readonly ClaimEvidenceAssessmentV3_3[];
}): ClaimProvenanceV3_3[] {
  const sourceById = new Map(
    input.sources.map((source) => [source.id, source] as const)
  );
  const evidenceById = new Map(
    input.evidence.map((item) => [item.id, item] as const)
  );
  return input.claims.map((claim) => {
    if (!claim.material)
      return {
        claimId: claim.id,
        status: "not_required" as const,
        policyVersion: HISTORY_PROVENANCE_POLICY_V33,
        sourceReferenceIds: [],
        evidenceFragmentIds: [],
        assessmentCount: 0,
        approvalBlocking: false,
        rationale:
          "Deterministic materiality policy classified this as non-material.",
      };
    const assessments = input.assessments.filter(
      (assessment) => assessment.claimId === claim.id
    );
    const usable = assessments.filter((assessment) => {
      const evidence = evidenceById.get(assessment.evidenceFragmentId);
      const source = evidence
        ? sourceById.get(evidence.sourceReferenceId)
        : undefined;
      return Boolean(
        evidence?.independentlyReproducible && source && source.qualityTier <= 4
      );
    });
    const supports = usable.filter((item) => item.assessment === "supports");
    const partial = usable.some(
      (item) => item.assessment === "partially_supports"
    );
    const contradicts = usable.some(
      (item) => item.assessment === "contradicts"
    );
    const independentSourceIds = new Set(
      supports.map(
        (item) => evidenceById.get(item.evidenceFragmentId)!.sourceReferenceId
      )
    );
    const fullSupport = supports.every(
      (item) =>
        item.unsupportedAspects.length === 0 &&
        item.contradictionAspects.length === 0 &&
        item.temporalAlignment !== "misaligned" &&
        item.geographicAlignment !== "misaligned" &&
        item.entityAlignment !== "misaligned"
    );
    const enoughSources = claim.requiresMultipleSources
      ? independentSourceIds.size >= 2 ||
        [...independentSourceIds].some(
          (id) => (sourceById.get(id)?.qualityTier ?? 5) <= 2
        )
      : independentSourceIds.size >= 1;
    let status: ClaimProvenanceStatusV3_3 = "unresolved";
    if (contradicts && supports.length) status = "contested";
    else if (contradicts) status = "contradicted";
    else if (partial || (supports.length && (!fullSupport || !enoughSources)))
      status = "partially_supported";
    else if (supports.length && fullSupport && enoughSources)
      status = "supported";
    const evidenceFragmentIds = [
      ...new Set(usable.map((item) => item.evidenceFragmentId)),
    ].sort();
    const sourceReferenceIds = [
      ...new Set(
        evidenceFragmentIds.map((id) => evidenceById.get(id)!.sourceReferenceId)
      ),
    ].sort();
    return {
      claimId: claim.id,
      status,
      policyVersion: HISTORY_PROVENANCE_POLICY_V33,
      sourceReferenceIds,
      evidenceFragmentIds,
      assessmentCount: assessments.length,
      approvalBlocking: [
        "partially_supported",
        "contradicted",
        "unresolved",
      ].includes(status),
      rationale:
        status === "supported"
          ? "Acceptable reproducible evidence supports all material aspects."
          : status === "contested"
            ? "Credible supplied evidence disagrees; narration must preserve uncertainty."
            : "Deterministic provenance requirements are not fully satisfied.",
    };
  });
}

export function appendHumanOverrideV33(input: {
  readonly existing: readonly HumanOverrideV3_3[];
  readonly reviewerId: string;
  readonly recordedAt: string;
  readonly reason: string;
  readonly claimId: string;
  readonly decision: "accept" | "reject";
  readonly boundHashes: HumanOverrideV3_3["boundHashes"];
}): HumanOverrideV3_3[] {
  input.existing.forEach((record, index) => {
    humanOverrideV33Schema.parse(record);
    if (record.sequence !== index + 1)
      throw new Error("History override ledger sequence is not append-only.");
    if (
      index > 0 &&
      record.previousRecordHash !== input.existing[index - 1]!.recordHash
    )
      throw new Error("History override ledger hash chain is invalid.");
  });
  const previousRecordHash = input.existing.at(-1)?.recordHash ?? null;
  const body = {
    sequence: input.existing.length + 1,
    reviewerId: input.reviewerId,
    recordedAt: input.recordedAt,
    reason: input.reason,
    claimId: input.claimId,
    decision: input.decision,
    boundHashes: input.boundHashes,
    previousRecordHash,
  };
  const recordHash = hashCanonicalV33(body);
  const record = humanOverrideV33Schema.parse({
    ...body,
    id: `override-${recordHash.slice(0, 24)}`,
    recordHash,
  });
  return [...input.existing, record];
}

export function validHumanOverrideV33(input: {
  readonly record: HumanOverrideV3_3;
  readonly currentHashes: HumanOverrideV3_3["boundHashes"];
}): boolean {
  humanOverrideV33Schema.parse(input.record);
  return (
    hashCanonicalV33(input.record.boundHashes) ===
    hashCanonicalV33(input.currentHashes)
  );
}

const detectClaimKind = (text: string): ClaimProposalV3_3["claimKind"] => {
  if (/\b\d{3,4}\b/u.test(text)) return "date";
  if (
    /\b\d+(?:[,.]\d+)?\s*(?:percent|%|million|thousand|hundred)\b/iu.test(text)
  )
    return "quantity";
  if (
    /\b(?:because|therefore|caused|led to|resulted|enabled|forced)\b/iu.test(
      text
    )
  )
    return "causal";
  if (
    /\b(?:debate|uncertain|perhaps|may have|estimates vary|not uniform)\b/iu.test(
      text
    )
  )
    return "uncertainty";
  if (/\b(?:more|less|than|compared|rather than)\b/iu.test(text))
    return "comparative";
  return "event";
};

/** Deterministic fixture/replay mode. It is intentionally identified as non-OpenAI. */
export class FixtureClaimExtractionProviderV33 implements ClaimExtractionProviderV3_3 {
  readonly provider = "offline-fixture";

  constructor(private readonly frozenAt = "1980-01-01T00:00:00.000Z") {}

  async extract(input: {
    readonly episodeId: string;
    readonly narrationSha256: string;
    readonly units: readonly CanonicalNarrationUnitV3_3[];
  }): Promise<{
    proposals: ClaimProposalV3_3[];
    metadata: ProviderRunMetadataV3_3;
  }> {
    const proposals = input.units.map((unit) => {
      const claimKind = detectClaimKind(unit.text);
      const uncertaintyMarkers =
        unit.text.match(
          /\b(?:perhaps|uncertain|debated|may|might|estimates vary)\b/giu
        ) ?? [];
      const temporalQualifiers =
        unit.text.match(/\b(?:\d{3,4}|early|late|centur(?:y|ies))\b/giu) ?? [];
      const geographicQualifiers =
        unit.text.match(
          /\b[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2}\b/gu
        ) ?? [];
      const quantitativeQualifiers =
        unit.text.match(/\b\d+(?:[,.]\d+)?(?:\s*%)?\b/gu) ?? [];
      return claimProposalV33Schema.parse({
        narrationUnitId: unit.id,
        verbatimText: unit.text,
        normalizedProposition: unit.text,
        claimKind,
        materialityRecommendation: "material",
        entities: geographicQualifiers
          .slice(0, 8)
          .map((text) => ({ text, role: "named-entity-candidate" })),
        temporalQualifiers,
        geographicQualifiers,
        quantitativeQualifiers,
        uncertaintyMarkers,
        requiresMultipleSources: [
          "quantity",
          "causal",
          "interpretation",
        ].includes(claimKind),
        researchHints: [unit.text.slice(0, 180)],
      });
    });
    const promptHash = sha256("history-claim-extraction-prompt.v3.3.0");
    const schemaHash = hashCanonicalV33(z.toJSONSchema(claimProposalV33Schema));
    return {
      proposals,
      metadata: {
        provider: this.provider,
        model: "deterministic-fixture-v3.3",
        apiFeature: "fixture-replay",
        promptVersion: "history-claim-extraction-prompt.v3.3.0",
        promptHash,
        schemaVersion: HISTORY_CLAIM_SCHEMA_V33,
        schemaHash,
        requestId: `fixture-${input.narrationSha256.slice(0, 16)}`,
        requestedAt: this.frozenAt,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        retryCount: 0,
        cacheKey: sha256(
          `${input.narrationSha256}\u0000${input.units.map((unit) => unit.id).join(",")}\u0000${promptHash}\u0000${schemaHash}`
        ),
      },
    };
  }
}

export interface OpenAiResponsesClientV3_3 {
  readonly responses: {
    create(
      body: Record<string, unknown>,
      options: { readonly signal: AbortSignal }
    ): Promise<{
      readonly id: string;
      readonly output_text?: string;
      readonly output?: readonly unknown[];
      readonly usage?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly input_tokens_details?: { readonly cached_tokens?: number };
      };
    }>;
  };
}

export class OpenAiClaimExtractionProviderV33 implements ClaimExtractionProviderV3_3 {
  readonly provider = "openai";
  readonly #batchSchema = z
    .object({ proposals: z.array(claimProposalV33Schema) })
    .strict();
  readonly #schema = z.toJSONSchema(this.#batchSchema);

  constructor(
    private readonly client: OpenAiResponsesClientV3_3,
    private readonly model: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly timeoutMs = Number(
      process.env["HISTORY_OPENAI_TIMEOUT_MS"] ??
        process.env["OPENAI_HISTORY_TIMEOUT_MS"] ??
        10 * 60_000
    ),
    private readonly maxOutputTokens = Number(
      process.env["HISTORY_MAX_OUTPUT_TOKENS_PER_EXTRACTION_BATCH"] ?? 2_500
    ),
    private readonly enablePromptCaching = process.env["HISTORY_ENABLE_PROMPT_CACHING"] !== "false"
  ) {}

  async extract(input: {
    readonly episodeId: string;
    readonly narrationSha256: string;
    readonly units: readonly CanonicalNarrationUnitV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    proposals: ClaimProposalV3_3[];
    metadata: ProviderRunMetadataV3_3;
  }> {
    const promptVersion = "history-claim-extraction-prompt.v3.3.1";
    const dynamicPayload = JSON.stringify({
      episodeId: input.episodeId,
      narrationSha256: input.narrationSha256,
      units: input.units.map(({ id, text }) => ({ id, text })),
    });
    const promptHash = sha256(
      `${CLAIM_EXTRACTION_STABLE_PREFIX_V33}\n${dynamicPayload}`
    );
    const schemaHash = hashCanonicalV33(this.#schema);
    const promptCacheKey = this.enablePromptCaching
      ? HISTORY_PROMPT_CACHE_KEYS_V33.claimExtraction(
          promptVersion,
          HISTORY_CLAIM_SCHEMA_V33
        )
      : null;
    const signal = input.signal ?? AbortSignal.timeout(this.timeoutMs);
    const response = await this.client.responses.create(
      {
        model: this.model,
        max_output_tokens: this.maxOutputTokens,
        input: [
          {
            role: "system",
            content: [
              { type: "input_text", text: CLAIM_EXTRACTION_STABLE_PREFIX_V33 },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: dynamicPayload }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "history_claim_proposals_v33",
            strict: true,
            schema: this.#schema,
          },
        },
      },
      { signal }
    );
    let parsed: { proposals: ClaimProposalV3_3[] };
    try {
      parsed = this.#batchSchema.parse(
        JSON.parse(response.output_text ?? "null") as unknown
      );
    } catch (error) {
      const raw = response.output_text ?? "";
      const looksTruncated =
        !raw.trim().endsWith("}") ||
        /Unterminated string|Unexpected end|Expected ',' or '\]'|Expected property name/iu.test(
          error instanceof Error ? error.message : String(error)
        ) ||
        (typeof response.usage?.output_tokens === "number" &&
          response.usage.output_tokens >= this.maxOutputTokens - 5);
      throw new HistoryProviderErrorV3_3(
        "schema",
        looksTruncated
          ? `Claim extraction output truncated or invalid under max_output_tokens=${this.maxOutputTokens}; split the batch and retry.`
          : `Claim extraction response failed schema/JSON validation: ${
              error instanceof Error ? error.message : String(error)
            }`,
        false,
        error
      );
    }
    return {
      proposals: parsed.proposals,
      metadata: {
        provider: this.provider,
        model: this.model,
        apiFeature: "responses-api-structured-outputs",
        promptVersion,
        promptHash,
        schemaVersion: HISTORY_CLAIM_SCHEMA_V33,
        schemaHash,
        requestId: response.id,
        requestedAt: this.now(),
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        retryCount: 0,
        cacheKey: sha256(
          `${input.narrationSha256}\u0000${promptHash}\u0000${schemaHash}\u0000${this.model}`
        ),
        promptCacheKey,
      },
    };
  }
}

const collectToolCitations = (
  value: unknown,
  output: Array<{ url: string; title: string }>
): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectToolCitations(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    (record["type"] === "url_citation" || record["type"] === "citation") &&
    typeof record["url"] === "string" &&
    typeof record["title"] === "string"
  )
    output.push({ url: record["url"], title: record["title"] });
  Object.values(record).forEach((item) => collectToolCitations(item, output));
};

/** Accepts source identity only from Responses API web-search annotations. */
export class OpenAiWebSearchRetrievalProviderV33 implements SourceRetrievalProviderV3_3 {
  readonly provider = "openai-web-search";

  constructor(
    private readonly client: OpenAiResponsesClientV3_3,
    private readonly model: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly timeoutMs = Number(
      process.env["HISTORY_OPENAI_TIMEOUT_MS"] ??
        process.env["OPENAI_HISTORY_TIMEOUT_MS"] ??
        10 * 60_000
    )
  ) {}

  async retrieve(input: {
    readonly episodeId: string;
    readonly queries: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<{
    sources: Array<Omit<SourceReferenceV3_3, "id" | "canonicalIdentity">>;
    fragments: [];
  }> {
    const response = await this.client.responses.create(
      {
        model: this.model,
        tools: [{ type: "web_search_preview" }],
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Find authoritative historical sources for ${input.episodeId}. Queries:\n${input.queries.join("\n")}`,
              },
            ],
          },
        ],
      },
      { signal: input.signal ?? AbortSignal.timeout(this.timeoutMs) }
    );
    const citations: Array<{ url: string; title: string }> = [];
    collectToolCitations(response.output ?? [], citations);
    const unique = new Map<string, { url: string; title: string }>();
    for (const citation of citations) {
      const canonicalUrl = canonicalizeSourceUrlV33(citation.url);
      unique.set(canonicalUrl, { ...citation, url: canonicalUrl });
    }
    return {
      sources: [...unique.values()]
        .sort((left, right) => left.url.localeCompare(right.url))
        .map((citation) => ({
          canonicalUrl: citation.url,
          sourceType: "web-search-citation",
          qualityTier: 5,
          title: citation.title,
          authors: [],
          publisherOrInstitution: new URL(citation.url).hostname,
          publicationDate: null,
          edition: null,
          language: null,
          doi: null,
          isbn: null,
          archiveIdentifier: null,
          retrievalProvider: this.provider,
          retrievedAt: this.now(),
          snapshotHash: null,
          normalizedCitation: `${citation.title}. ${citation.url}`,
        })),
      fragments: [],
    };
  }
}

export class OpenAiEvidenceAssessmentProviderV33 implements EvidenceAssessmentProviderV3_3 {
  readonly provider = "openai";
  readonly #batchSchema = z
    .object({
      assessments: z.array(compactClaimEvidenceAssessmentV33Schema),
    })
    .strict();
  readonly #schema = z.toJSONSchema(this.#batchSchema);

  constructor(
    private readonly client: OpenAiResponsesClientV3_3,
    private readonly model: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly timeoutMs = Number(
      process.env["HISTORY_OPENAI_TIMEOUT_MS"] ??
        process.env["OPENAI_HISTORY_TIMEOUT_MS"] ??
        10 * 60_000
    ),
    private readonly maxOutputTokens = Number(
      process.env["HISTORY_MAX_OUTPUT_TOKENS_PER_ASSESSMENT_BATCH"] ?? 1_500
    ),
    private readonly enablePromptCaching = process.env["HISTORY_ENABLE_PROMPT_CACHING"] !== "false"
  ) {}

  async assess(input: {
    readonly claims: readonly ClaimV3_3[];
    readonly evidenceFragments: readonly EvidenceFragmentV3_3[];
    readonly sourceReferences: readonly SourceReferenceV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    assessments: ClaimEvidenceAssessmentV3_3[];
    metadata: ProviderRunMetadataV3_3;
  }> {
    const promptVersion = "history-evidence-assessment-prompt.v3.3.1";
    const payload = {
      claims: input.claims.map((claim) => ({
        id: claim.id,
        proposition: claim.normalizedProposition,
        kind: claim.claimKind,
        material: claim.material,
        temporalQualifiers: claim.temporalQualifiers,
        geographicQualifiers: claim.geographicQualifiers,
        entities: claim.entities,
      })),
      evidenceFragments: input.evidenceFragments.map((fragment) => ({
        id: fragment.id,
        excerpt: fragment.excerpt,
        sourceReferenceId: fragment.sourceReferenceId,
        locator: fragment.locator,
      })),
      sourceQuality: input.sourceReferences.map(
        ({ id, qualityTier, sourceType }) => ({ id, qualityTier, sourceType })
      ),
    };
    const dynamicPayload = JSON.stringify(payload);
    const promptHash = sha256(
      `${EVIDENCE_ASSESSMENT_STABLE_PREFIX_V33}\n${dynamicPayload}`
    );
    const schemaHash = hashCanonicalV33(this.#schema);
    const promptCacheKey = this.enablePromptCaching
      ? HISTORY_PROMPT_CACHE_KEYS_V33.evidenceAssessment(
          promptVersion,
          "history-claim-evidence-assessment.v3.3"
        )
      : null;
    const response = await this.client.responses.create(
      {
        model: this.model,
        max_output_tokens: this.maxOutputTokens,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: EVIDENCE_ASSESSMENT_STABLE_PREFIX_V33,
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: dynamicPayload }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "history_evidence_assessments_v33",
            strict: true,
            schema: this.#schema,
          },
        },
      },
      { signal: input.signal ?? AbortSignal.timeout(this.timeoutMs) }
    );
    const compact = this.#batchSchema.parse(
      JSON.parse(response.output_text ?? "null") as unknown
    ).assessments;
    const assessments = validateAssessmentsV33({
      claims: input.claims,
      sources: input.sourceReferences,
      evidence: input.evidenceFragments,
      assessments: compact.map(expandCompactAssessmentV33),
    });
    return {
      assessments,
      metadata: {
        provider: this.provider,
        model: this.model,
        apiFeature: "responses-api-structured-outputs",
        promptVersion,
        promptHash,
        schemaVersion: "history-claim-evidence-assessment.v3.3",
        schemaHash,
        requestId: response.id,
        requestedAt: this.now(),
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        retryCount: 0,
        cacheKey: sha256(
          `${hashCanonicalV33(payload)}\u0000${promptHash}\u0000${schemaHash}\u0000${this.model}`
        ),
        promptCacheKey,
      },
    };
  }
}

export class OpenAiVisualPurposeProviderV33 implements VisualPurposeProviderV3_3 {
  readonly provider = "openai";
  readonly #batchSchema = z
    .object({ proposals: z.array(visualPurposeProposalV33Schema) })
    .strict();
  readonly #schema = z.toJSONSchema(this.#batchSchema);

  constructor(
    private readonly client: OpenAiResponsesClientV3_3,
    private readonly model: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly timeoutMs = Number(
      process.env["HISTORY_OPENAI_TIMEOUT_MS"] ??
        process.env["OPENAI_HISTORY_TIMEOUT_MS"] ??
        10 * 60_000
    ),
    private readonly enablePromptCaching = process.env["HISTORY_ENABLE_PROMPT_CACHING"] !== "false"
  ) {}

  async propose(input: {
    readonly episodeId: string;
    readonly narration: CanonicalNarrationV3_3;
    readonly claims: readonly ClaimV3_3[];
    readonly provenance: readonly ClaimProvenanceV3_3[];
    readonly signal?: AbortSignal;
  }): Promise<{
    proposals: VisualPurposeProposalV3_3[];
    metadata: ProviderRunMetadataV3_3;
  }> {
    const promptVersion = "history-visual-purpose-prompt.v3.3.1";
    const purposeInput = {
      episodeId: input.episodeId,
      units: input.narration.units.map(({ id, text }) => ({ id, text })),
      claims: input.claims.map((claim) => ({
        narrationUnitId: claim.narrationUnitId,
        proposition: claim.normalizedProposition,
        material: claim.material,
        provenanceStatus:
          input.provenance.find((item) => item.claimId === claim.id)?.status ??
          "unresolved",
      })),
    };
    const dynamicPayload = JSON.stringify(purposeInput);
    const promptHash = sha256(
      `${VISUAL_SEMANTICS_STABLE_PREFIX_V33}\n${dynamicPayload}`
    );
    const schemaHash = hashCanonicalV33(this.#schema);
    const promptCacheKey = this.enablePromptCaching
      ? HISTORY_PROMPT_CACHE_KEYS_V33.visualSemantics(
          promptVersion,
          "history-visual-purpose-proposal.v3.3"
        )
      : null;
    const response = await this.client.responses.create(
      {
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              { type: "input_text", text: VISUAL_SEMANTICS_STABLE_PREFIX_V33 },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: dynamicPayload }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "history_visual_purpose_proposals_v33",
            strict: true,
            schema: this.#schema,
          },
        },
      },
      { signal: input.signal ?? AbortSignal.timeout(this.timeoutMs) }
    );
    const proposals = this.#batchSchema.parse(
      JSON.parse(response.output_text ?? "null") as unknown
    ).proposals;
    const unitIds = new Set(input.narration.units.map((unit) => unit.id));
    if (proposals.some((proposal) => !unitIds.has(proposal.narrationUnitId)))
      throw new HistoryProviderErrorV3_3(
        "semantic",
        "Visual-purpose response references an unknown narration unit.",
        false
      );
    return {
      proposals,
      metadata: {
        provider: this.provider,
        model: this.model,
        apiFeature: "responses-api-structured-outputs",
        promptVersion,
        promptHash,
        schemaVersion: "history-visual-purpose-proposal.v3.3",
        schemaHash,
        requestId: response.id,
        requestedAt: this.now(),
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        retryCount: 0,
        cacheKey: sha256(
          `${input.narration.normalizedTextSha256}\u0000${promptHash}\u0000${schemaHash}\u0000${this.model}`
        ),
        promptCacheKey,
      },
    };
  }
}

export function freezeResearchSnapshotV33(
  input: Omit<HistoryResearchSnapshotV3_3, "schemaVersion" | "snapshotHash">
): HistoryResearchSnapshotV3_3 {
  const body = { schemaVersion: HISTORY_RESEARCH_SNAPSHOT_V33, ...input };
  return { ...body, snapshotHash: hashCanonicalV33(body) };
}

export function assertResearchSnapshotV33(
  snapshot: HistoryResearchSnapshotV3_3
): void {
  const { snapshotHash, ...body } = snapshot;
  if (hashCanonicalV33(body) !== snapshotHash)
    throw new Error("History V3.3 research snapshot hash is invalid.");
  const claims = new Set(snapshot.claims.map((claim) => claim.id));
  for (const item of snapshot.provenance)
    if (!claims.has(item.claimId))
      throw new Error(`Provenance references unknown claim ${item.claimId}.`);
  validateAssessmentsV33({
    claims: snapshot.claims,
    sources: snapshot.sourceReferences,
    evidence: snapshot.evidenceFragments,
    assessments: snapshot.evidenceAssessments,
  });
}
