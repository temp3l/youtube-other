import { createHash } from "node:crypto";
import {
  HISTORY_NARRATION_NORMALIZATION_V33,
  type CanonicalNarrationV3_3,
  type CanonicalNarrationUnitV3_3,
} from "./history-narration-v33.js";
import {
  HISTORY_PROVENANCE_POLICY_V33,
  alignClaimProposalsV33,
  claimProposalV33Schema,
  freezeResearchSnapshotV33,
  hashCanonicalV33,
  type ClaimProposalV3_3,
  type ClaimProvenanceStatusV3_3,
  type ClaimProvenanceV3_3,
  type ClaimV3_3,
  type HistoryResearchSnapshotV3_3,
} from "./history-research-v33.js";

export const DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE =
  "trusted-script" as const;

export const HISTORY_TRUST_POLICY_V33 =
  "history-trust-policy.v3.3.0" as const;

export const HISTORY_TRUSTED_ATTESTATION_SCHEMA_V33 =
  "history-trusted-narration-attestation.v1" as const;

export const HISTORY_TRUSTED_CLAIM_SCHEMA_V33 =
  "history-trusted-claim.v1" as const;

export const HISTORY_AUTHORITY_TRANSITION_SCHEMA_V33 =
  "history-authority-transition.v1" as const;

export const TRUSTED_SCRIPT_REVIEW_WARNING =
  "This episode is accepted from a trusted script and has not been independently verified by the pipeline.";

export type HistorySourceAuthorityMode =
  | "trusted-script"
  | "research-backed"
  | "unverified-external";

export type HistoryTrustedClaimKindV1 =
  | "date"
  | "quantity"
  | "person"
  | "place"
  | "event"
  | "institution"
  | "causal"
  | "comparative"
  | "quotation"
  | "interpretation"
  | "uncertainty"
  | "compound"
  | "other";

export interface TrustedNarrationAttestationV1 {
  readonly schemaVersion: typeof HISTORY_TRUSTED_ATTESTATION_SCHEMA_V33;
  readonly id: string;
  readonly episodeId: string;
  readonly narrationHash: string;
  readonly normalizationVersion: string;
  readonly authority: "user" | "content-pack-owner" | "editorial-workflow";
  readonly authorityName: string | null;
  readonly scope: "entire-narration" | "selected-claims";
  readonly selectedClaimIds: readonly string[];
  readonly assertion:
    | "factually-verified"
    | "accepted-without-independent-verification";
  readonly assertedAt: string | null;
  readonly timestampStatus?: "recorded" | "not-recorded";
  readonly policyVersion: string;
  readonly parentAttestationId: string | null;
  readonly invalidatedAt: string | null;
  readonly invalidationReason: string | null;
}

export interface HistoryTrustedClaimV1 {
  readonly id: string;
  readonly episodeId: string;
  readonly narrationUnitId: string;
  readonly narrationSpan: {
    readonly startUtf16: number;
    readonly endUtf16Exclusive: number;
  };
  readonly verbatimText: string;
  readonly normalizedProposition: string;
  readonly claimKind: HistoryTrustedClaimKindV1;
  readonly materiality: "material" | "non_material";
  readonly entities: readonly { readonly text: string; readonly role: string }[];
  readonly temporalQualifiers: readonly string[];
  readonly geographicQualifiers: readonly string[];
  readonly quantitativeQualifiers: readonly string[];
  readonly uncertaintyMarkers: readonly string[];
  readonly provenanceStatus: "trusted_input" | "not_required";
  readonly trustAttestationId: string | null;
  readonly independentlyVerified: false;
}

export interface HistoryStoryGenerationResultV1 {
  readonly narrationMarkdown: string;
  readonly trustedClaimProposals: readonly {
    readonly verbatimNarrationText: string;
    readonly normalizedProposition: string;
    readonly claimKind: string;
    readonly materialityRecommendation: string;
    readonly entities: readonly { readonly text: string; readonly role: string }[];
    readonly temporalQualifiers: readonly string[];
    readonly geographicQualifiers: readonly string[];
    readonly quantitativeQualifiers: readonly string[];
    readonly uncertaintyMarkers: readonly string[];
  }[];
  readonly claimNarrationBindings: readonly {
    readonly claimProposalIndex: number;
    readonly verbatimNarrationText: string;
  }[];
  readonly visualOpportunities: readonly {
    readonly claimProposalIndexes: readonly number[];
    readonly suggestedModality: string;
    readonly purpose: string;
  }[];
}

export interface HistoryAuthorityTransitionV1 {
  readonly schemaVersion: typeof HISTORY_AUTHORITY_TRANSITION_SCHEMA_V33;
  readonly id: string;
  readonly episodeId: string;
  readonly fromMode: HistorySourceAuthorityMode | null;
  readonly toMode: HistorySourceAuthorityMode;
  readonly actor: string;
  readonly reason: string;
  readonly narrationHash: string;
  readonly recordedAt: string;
  readonly previousSnapshotHash: string | null;
}

export interface HistorySourceAuthorityRecordV33 {
  readonly schemaVersion: "history-source-authority.v1";
  readonly episodeId: string;
  readonly sourceAuthorityMode: HistorySourceAuthorityMode;
  readonly resolvedFrom: "default" | "episode-metadata" | "cli" | "import" | "workflow";
  readonly narrationHash: string | null;
  readonly updatedAt: string;
  readonly policyVersion: typeof HISTORY_TRUST_POLICY_V33;
}

export interface TrustedResearchDiagnosticsV33 {
  readonly researchMode: "skipped-trusted-script";
  readonly providerCalls: 0;
  readonly webSearchCalls: 0;
  readonly externalSourcesRequired: false;
}

export interface HistoryTrustDeltaV33 {
  readonly claimId: string | null;
  readonly kind:
    | "punctuation-only"
    | "formatting-only"
    | "equivalent-paraphrase"
    | "new-factual-assertion"
    | "changed-date"
    | "changed-number"
    | "changed-actor"
    | "changed-location"
    | "changed-quotation"
    | "changed-causality"
    | "removed-uncertainty"
    | "changed-interpretation"
    | "span-realignment";
  readonly invalidatesTrust: boolean;
  readonly summary: string;
  readonly previousProposition: string | null;
  readonly nextProposition: string | null;
}

export interface HistoryTrustDeltaReportV33 {
  readonly schemaVersion: "history-trust-delta-report.v1";
  readonly episodeId: string;
  readonly previousNarrationHash: string;
  readonly nextNarrationHash: string;
  readonly deltas: readonly HistoryTrustDeltaV33[];
  readonly invalidatedClaimIds: readonly string[];
  readonly reattestationRequired: boolean;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const FIXED_ISO = "1980-01-01T00:00:00.000Z";

const RHETORICAL =
  /^(?:but|however|so what|and yet|still|meanwhile|now|then|again|instead)\b/iu;

export function isHistorySourceAuthorityMode(
  value: unknown
): value is HistorySourceAuthorityMode {
  return (
    value === "trusted-script" ||
    value === "research-backed" ||
    value === "unverified-external"
  );
}

export function resolveHistorySourceAuthorityMode(input: {
  readonly genreId?: string | null;
  readonly explicitMode?: unknown;
  readonly episodeMetadataMode?: unknown;
  readonly persistedMode?: unknown;
}): {
  readonly mode: HistorySourceAuthorityMode | null;
  readonly resolvedFrom:
    | "default"
    | "episode-metadata"
    | "cli"
    | "import"
    | "workflow"
    | "non-history";
} {
  if (input.genreId && input.genreId !== "history")
    return { mode: null, resolvedFrom: "non-history" };
  if (isHistorySourceAuthorityMode(input.explicitMode))
    return { mode: input.explicitMode, resolvedFrom: "cli" };
  if (isHistorySourceAuthorityMode(input.episodeMetadataMode))
    return { mode: input.episodeMetadataMode, resolvedFrom: "episode-metadata" };
  if (isHistorySourceAuthorityMode(input.persistedMode))
    return { mode: input.persistedMode, resolvedFrom: "workflow" };
  return {
    mode: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
    resolvedFrom: "default",
  };
}

export function createHistorySourceAuthorityRecordV33(input: {
  readonly episodeId: string;
  readonly mode: HistorySourceAuthorityMode;
  readonly resolvedFrom: HistorySourceAuthorityRecordV33["resolvedFrom"];
  readonly narrationHash?: string | null;
  readonly updatedAt?: string;
}): HistorySourceAuthorityRecordV33 {
  return {
    schemaVersion: "history-source-authority.v1",
    episodeId: input.episodeId,
    sourceAuthorityMode: input.mode,
    resolvedFrom: input.resolvedFrom,
    narrationHash: input.narrationHash ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    policyVersion: HISTORY_TRUST_POLICY_V33,
  };
}

export function createTrustedNarrationAttestationV1(input: {
  readonly episodeId: string;
  readonly narrationHash: string;
  readonly normalizationVersion?: string;
  readonly authority?: TrustedNarrationAttestationV1["authority"];
  readonly authorityName?: string | null;
  readonly scope?: TrustedNarrationAttestationV1["scope"];
  readonly selectedClaimIds?: readonly string[];
  readonly assertion?: TrustedNarrationAttestationV1["assertion"];
  readonly assertedAt?: string;
  readonly parentAttestationId?: string | null;
}): TrustedNarrationAttestationV1 {
  const authority = input.authority ?? "editorial-workflow";
  const assertion =
    input.assertion ?? "accepted-without-independent-verification";
  const scope = input.scope ?? "entire-narration";
  const selectedClaimIds = [...(input.selectedClaimIds ?? [])].sort();
  const normalizationVersion =
    input.normalizationVersion ?? HISTORY_NARRATION_NORMALIZATION_V33;
  const assertedAt = input.assertedAt ?? new Date().toISOString();
  const parentAttestationId = input.parentAttestationId ?? null;
  const id = `attestation-${sha256(
    [
      HISTORY_TRUSTED_ATTESTATION_SCHEMA_V33,
      input.episodeId,
      input.narrationHash,
      normalizationVersion,
      authority,
      assertion,
      scope,
      selectedClaimIds.join(","),
      HISTORY_TRUST_POLICY_V33,
      parentAttestationId ?? "",
      assertedAt,
    ].join("\u0000")
  ).slice(0, 24)}`;
  return {
    schemaVersion: HISTORY_TRUSTED_ATTESTATION_SCHEMA_V33,
    id,
    episodeId: input.episodeId,
    narrationHash: input.narrationHash,
    normalizationVersion,
    authority,
    authorityName: input.authorityName ?? null,
    scope,
    selectedClaimIds,
    assertion,
    assertedAt,
    timestampStatus: "recorded",
    policyVersion: HISTORY_TRUST_POLICY_V33,
    parentAttestationId,
    invalidatedAt: null,
    invalidationReason: null,
  };
}

export function invalidateTrustedNarrationAttestationV1(
  attestation: TrustedNarrationAttestationV1,
  input: { readonly reason: string; readonly invalidatedAt?: string }
): TrustedNarrationAttestationV1 {
  if (attestation.invalidatedAt) return attestation;
  return {
    ...attestation,
    invalidatedAt: input.invalidatedAt ?? new Date().toISOString(),
    invalidationReason: input.reason,
  };
}

export function isTrustedAttestationValidV1(input: {
  readonly attestation: TrustedNarrationAttestationV1;
  readonly narrationHash: string;
  readonly claimId?: string;
}): boolean {
  const { attestation } = input;
  if (attestation.invalidatedAt) return false;
  if (attestation.narrationHash !== input.narrationHash) return false;
  if (attestation.scope === "selected-claims") {
    if (!input.claimId) return false;
    return attestation.selectedClaimIds.includes(input.claimId);
  }
  return true;
}

function detectTrustedClaimKind(text: string): HistoryTrustedClaimKindV1 {
  if (/["“”«»]/u.test(text) && /\b(?:said|wrote|declared|quoted)\b/iu.test(text))
    return "quotation";
  if (/\b\d{3,4}\b/u.test(text)) return "date";
  if (
    /\b\d+(?:[,.]\d+)?\s*(?:percent|%|million|thousand|hundred|troops?|soldiers?|casualties)\b/iu.test(
      text
    )
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
  if (
    /\b(?:and|,|;)\b/u.test(text) &&
    (/\b\d{3,4}\b/u.test(text) || /\b[A-Z][\p{L}'’.-]+\b/u.test(text))
  )
    return "compound";
  return "event";
}

function isRhetoricalUnit(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 24 && RHETORICAL.test(trimmed)) return true;
  if (
    /^(?:so what|but that|and yet|still,|meanwhile,)/iu.test(trimmed) &&
    !/\b\d{3,4}\b/u.test(trimmed) &&
    !/\b(?:army|empire|king|emperor|plague|battle|war|treaty)\b/iu.test(trimmed)
  )
    return true;
  return false;
}

function extractQualifiers(text: string): {
  temporalQualifiers: string[];
  geographicQualifiers: string[];
  quantitativeQualifiers: string[];
  uncertaintyMarkers: string[];
  entities: Array<{ text: string; role: string }>;
} {
  const temporalQualifiers =
    text.match(/\b(?:\d{3,4}|early|late|mid|centur(?:y|ies)|winter|summer|spring|autumn|fall)\b/giu) ??
    [];
  const geographicQualifiers =
    text.match(
      /\b(?:Russian Empire|Poland|Lithuania|Belarus|Rome|Constantinople|Europe|Asia|Africa|Mediterranean|Nile|Danube|Moscow|Smolensk|Borodino|Niemen|Berezina|[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2})\b/gu
    ) ?? [];
  const quantitativeQualifiers =
    text.match(/\b\d+(?:[,.]\d+)?(?:\s*%)?\b/gu) ?? [];
  const uncertaintyMarkers =
    text.match(
      /\b(?:perhaps|uncertain|debated|may|might|estimates vary|reportedly|allegedly|probably)\b/giu
    ) ?? [];
  const entities = [...new Set(geographicQualifiers)]
    .slice(0, 8)
    .map((value) => ({ text: value, role: "named-entity-candidate" }));
  return {
    temporalQualifiers: [...new Set(temporalQualifiers)],
    geographicQualifiers: [...new Set(geographicQualifiers)],
    quantitativeQualifiers: [...new Set(quantitativeQualifiers)],
    uncertaintyMarkers: [...new Set(uncertaintyMarkers)],
    entities,
  };
}

export function stableTrustedClaimIdV1(input: {
  readonly episodeId: string;
  readonly normalizedProposition: string;
  readonly entities: readonly { readonly text: string }[];
  readonly temporalQualifiers: readonly string[];
  readonly geographicQualifiers: readonly string[];
  readonly claimKind: HistoryTrustedClaimKindV1;
  readonly normalizationPolicyVersion?: string;
}): string {
  return `trusted-claim-${sha256(
    [
      input.episodeId,
      input.normalizedProposition.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase(),
      [...input.entities.map((entity) => entity.text.toLocaleLowerCase())].sort().join(","),
      [...input.temporalQualifiers].map((value) => value.toLocaleLowerCase()).sort().join(","),
      [...input.geographicQualifiers].map((value) => value.toLocaleLowerCase()).sort().join(","),
      input.claimKind,
      input.normalizationPolicyVersion ?? HISTORY_TRUST_POLICY_V33,
    ].join("\u0000")
  ).slice(0, 24)}`;
}

function mapTrustedKindToProposal(
  kind: HistoryTrustedClaimKindV1
): ClaimProposalV3_3["claimKind"] {
  if (kind === "compound") return "other";
  return kind;
}

export function extractDeterministicTrustedClaimsV33(input: {
  readonly episodeId: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly attestationId?: string | null;
  readonly knownEntities?: readonly string[];
}): {
  readonly trustedClaims: HistoryTrustedClaimV1[];
  readonly proposals: ClaimProposalV3_3[];
  readonly claims: ClaimV3_3[];
} {
  const known = new Set(
    (input.knownEntities ?? []).map((value) => value.toLocaleLowerCase())
  );
  const proposals: ClaimProposalV3_3[] = [];
  for (const unit of input.narration.units) {
    const rhetorical = isRhetoricalUnit(unit.text);
    const claimKind = detectTrustedClaimKind(unit.text);
    const qualifiers = extractQualifiers(unit.text);
    if (known.size)
      for (const entity of known)
        if (
          unit.text.toLocaleLowerCase().includes(entity) &&
          !qualifiers.entities.some(
            (item) => item.text.toLocaleLowerCase() === entity
          )
        )
          qualifiers.entities.push({
            text: entity,
            role: "metadata-entity",
          });
    proposals.push(
      claimProposalV33Schema.parse({
        narrationUnitId: unit.id,
        verbatimText: unit.text,
        normalizedProposition: unit.text,
        claimKind: mapTrustedKindToProposal(claimKind),
        materialityRecommendation: rhetorical ? "non_material" : "material",
        entities: qualifiers.entities,
        temporalQualifiers: qualifiers.temporalQualifiers,
        geographicQualifiers: qualifiers.geographicQualifiers,
        quantitativeQualifiers: qualifiers.quantitativeQualifiers,
        uncertaintyMarkers: qualifiers.uncertaintyMarkers,
        requiresMultipleSources: false,
        researchHints: [],
      })
    );
  }
  const claims = alignClaimProposalsV33({
    episodeId: input.episodeId,
    narration: input.narration,
    proposals,
  });
  const trustedClaims = claims.map((claim) => {
    const trustedKind =
      claim.claimKind === "other" &&
      detectTrustedClaimKind(claim.verbatimText) === "compound"
        ? ("compound" as const)
        : (claim.claimKind as HistoryTrustedClaimKindV1);
    const materiality = claim.material ? ("material" as const) : ("non_material" as const);
    const id = stableTrustedClaimIdV1({
      episodeId: input.episodeId,
      normalizedProposition: claim.normalizedProposition,
      entities: claim.entities,
      temporalQualifiers: claim.temporalQualifiers,
      geographicQualifiers: claim.geographicQualifiers,
      claimKind: trustedKind,
    });
    return {
      id,
      episodeId: input.episodeId,
      narrationUnitId: claim.narrationUnitId,
      narrationSpan: claim.span,
      verbatimText: claim.verbatimText,
      normalizedProposition: claim.normalizedProposition,
      claimKind: trustedKind,
      materiality,
      entities: claim.entities,
      temporalQualifiers: claim.temporalQualifiers,
      geographicQualifiers: claim.geographicQualifiers,
      quantitativeQualifiers: claim.quantitativeQualifiers,
      uncertaintyMarkers: claim.uncertaintyMarkers,
      provenanceStatus:
        materiality === "material" ? ("trusted_input" as const) : ("not_required" as const),
      trustAttestationId: input.attestationId ?? null,
      independentlyVerified: false as const,
    };
  });
  return { trustedClaims, proposals, claims };
}

export function importTrustedClaimsFromStoryGenerationV33(input: {
  readonly episodeId: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly generation: HistoryStoryGenerationResultV1;
  readonly attestationId?: string | null;
}): {
  readonly trustedClaims: HistoryTrustedClaimV1[];
  readonly proposals: ClaimProposalV3_3[];
  readonly claims: ClaimV3_3[];
} {
  const unitByText = new Map(
    input.narration.units.map((unit) => [unit.text, unit] as const)
  );
  const proposals: ClaimProposalV3_3[] = [];
  for (const [index, proposal] of input.generation.trustedClaimProposals.entries()) {
    const binding = input.generation.claimNarrationBindings.find(
      (item) => item.claimProposalIndex === index
    );
    const verbatim =
      binding?.verbatimNarrationText ?? proposal.verbatimNarrationText;
    const unit =
      [...unitByText.values()].find((item) => item.text.includes(verbatim)) ??
      unitByText.get(verbatim);
    if (!unit)
      throw new Error(
        `Story-generation claim proposal ${index} is not bound to narration.`
      );
    const first = unit.text.indexOf(verbatim);
    if (first < 0 || unit.text.indexOf(verbatim, first + 1) >= 0)
      throw new Error(
        `Story-generation claim proposal ${index} has an ambiguous narration span.`
      );
    const kindRaw = proposal.claimKind;
    const trustedKind = (
      [
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
        "compound",
        "other",
      ] as const
    ).includes(kindRaw as HistoryTrustedClaimKindV1)
      ? (kindRaw as HistoryTrustedClaimKindV1)
      : "other";
    proposals.push(
      claimProposalV33Schema.parse({
        narrationUnitId: unit.id,
        verbatimText: verbatim,
        normalizedProposition: proposal.normalizedProposition,
        claimKind: mapTrustedKindToProposal(trustedKind),
        materialityRecommendation:
          proposal.materialityRecommendation === "non_material"
            ? "non_material"
            : "material",
        entities: [...proposal.entities],
        temporalQualifiers: [...proposal.temporalQualifiers],
        geographicQualifiers: [...proposal.geographicQualifiers],
        quantitativeQualifiers: [...proposal.quantitativeQualifiers],
        uncertaintyMarkers: [...proposal.uncertaintyMarkers],
        requiresMultipleSources: false,
        researchHints: [],
      })
    );
  }
  const claims = alignClaimProposalsV33({
    episodeId: input.episodeId,
    narration: input.narration,
    proposals,
  });
  const trustedClaims = claims.map((claim, index): HistoryTrustedClaimV1 => {
    const proposal = input.generation.trustedClaimProposals[index];
    const kinds: readonly HistoryTrustedClaimKindV1[] = [
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
      "compound",
      "other",
    ];
    const fromProposal =
      proposal && kinds.includes(proposal.claimKind as HistoryTrustedClaimKindV1)
        ? (proposal.claimKind as HistoryTrustedClaimKindV1)
        : null;
    const claimKind: HistoryTrustedClaimKindV1 =
      fromProposal ??
      (kinds.includes(claim.claimKind as HistoryTrustedClaimKindV1)
        ? (claim.claimKind as HistoryTrustedClaimKindV1)
        : "other");
    const materiality = claim.material ? ("material" as const) : ("non_material" as const);
    return {
      id: stableTrustedClaimIdV1({
        episodeId: input.episodeId,
        normalizedProposition: claim.normalizedProposition,
        entities: claim.entities,
        temporalQualifiers: claim.temporalQualifiers,
        geographicQualifiers: claim.geographicQualifiers,
        claimKind,
      }),
      episodeId: input.episodeId,
      narrationUnitId: claim.narrationUnitId,
      narrationSpan: claim.span,
      verbatimText: claim.verbatimText,
      normalizedProposition: claim.normalizedProposition,
      claimKind,
      materiality,
      entities: claim.entities,
      temporalQualifiers: claim.temporalQualifiers,
      geographicQualifiers: claim.geographicQualifiers,
      quantitativeQualifiers: claim.quantitativeQualifiers,
      uncertaintyMarkers: claim.uncertaintyMarkers,
      provenanceStatus:
        materiality === "material" ? "trusted_input" : "not_required",
      trustAttestationId: input.attestationId ?? null,
      independentlyVerified: false,
    };
  });
  return { trustedClaims, proposals, claims };
}

export function deriveTrustedClaimProvenanceV33(input: {
  readonly claims: readonly ClaimV3_3[];
  readonly trustedClaims: readonly HistoryTrustedClaimV1[];
  readonly attestation: TrustedNarrationAttestationV1 | null;
  readonly narrationHash: string;
}): ClaimProvenanceV3_3[] {
  const trustedByProposition = new Map(
    input.trustedClaims.map(
      (claim) =>
        [
          claim.normalizedProposition.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase(),
          claim,
        ] as const
    )
  );
  return input.claims.map((claim) => {
    const trusted =
      trustedByProposition.get(
        claim.normalizedProposition.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase()
      ) ?? null;
    if (!claim.material || trusted?.provenanceStatus === "not_required")
      return {
        claimId: claim.id,
        status: "not_required" as const,
        policyVersion: HISTORY_PROVENANCE_POLICY_V33,
        sourceReferenceIds: [],
        evidenceFragmentIds: [],
        assessmentCount: 0,
        approvalBlocking: false,
        rationale:
          "Rhetorical or non-material narration does not require independent evidence under trusted-script mode.",
      };
    const attestationOk =
      input.attestation !== null &&
      isTrustedAttestationValidV1({
        attestation: input.attestation,
        narrationHash: input.narrationHash,
        ...(input.attestation.scope === "selected-claims"
          ? { claimId: trusted?.id ?? claim.id }
          : {}),
      });
    if (!attestationOk)
      return {
        claimId: claim.id,
        status: "unresolved" as const,
        policyVersion: HISTORY_PROVENANCE_POLICY_V33,
        sourceReferenceIds: [],
        evidenceFragmentIds: [],
        assessmentCount: 0,
        approvalBlocking: true,
        rationale:
          "Trusted-script content approval requires a valid hash-bound narration attestation.",
      };
    return {
      claimId: claim.id,
      status: "trusted_input" as ClaimProvenanceStatusV3_3,
      policyVersion: HISTORY_PROVENANCE_POLICY_V33,
      sourceReferenceIds: [],
      evidenceFragmentIds: [],
      assessmentCount: 0,
      approvalBlocking: false,
      rationale:
        "Accepted from trusted script under a valid hash-bound attestation; not independently verified by the pipeline.",
    };
  });
}

export function trustedResearchDiagnosticsV33(): TrustedResearchDiagnosticsV33 {
  return {
    researchMode: "skipped-trusted-script",
    providerCalls: 0,
    webSearchCalls: 0,
    externalSourcesRequired: false,
  };
}

export function freezeTrustedScriptResearchSnapshotV33(input: {
  readonly episodeId: string;
  readonly snapshotVersion: number;
  readonly frozenAt?: string;
  readonly canonicalNarration: CanonicalNarrationV3_3;
  readonly claims: readonly ClaimV3_3[];
  readonly trustedClaims: readonly HistoryTrustedClaimV1[];
  readonly attestation: TrustedNarrationAttestationV1;
}): HistoryResearchSnapshotV3_3 {
  const provenance = deriveTrustedClaimProvenanceV33({
    claims: input.claims,
    trustedClaims: input.trustedClaims,
    attestation: input.attestation,
    narrationHash: input.canonicalNarration.normalizedTextSha256,
  });
  const diagnostics = trustedResearchDiagnosticsV33();
  return freezeResearchSnapshotV33({
    episodeId: input.episodeId,
    snapshotVersion: input.snapshotVersion,
    frozenAt: input.frozenAt ?? FIXED_ISO,
    canonicalNarration: input.canonicalNarration,
    claims: input.claims,
    sourceReferences: [],
    evidenceFragments: [],
    evidenceAssessments: [],
    provenance,
    visualPurposeProposals: [],
    providerRuns: [],
    researchDiagnostics: [
      {
        code: "TRUSTED_SCRIPT_RESEARCH_SKIPPED",
        message: JSON.stringify(diagnostics),
        sourceUrl: null,
      },
      {
        code: "TRUSTED_SCRIPT_WARNING",
        message: TRUSTED_SCRIPT_REVIEW_WARNING,
        sourceUrl: null,
      },
    ],
    overrides: [],
    researchClusters: [],
    searchBudget: {
      totalSearchCalls: 0,
      softLimit: 0,
      hardLimit: 0,
      remainingHardBudget: 0,
      stopReason: "skipped-trusted-script",
    },
    costLedger: {
      pricingVersion: "skipped-trusted-script",
      pricingStatus: "not-applicable",
      cumulativeCostUsd: 0,
      softBudgetUsd: 0,
      hardBudgetUsd: 0,
      stopReason: "skipped-trusted-script",
      entryCount: 0,
    },
    escalations: [],
  });
}

function normalizeComparableProposition(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeComparableProposition(value).split(" ").filter(Boolean);
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function extractNumbers(value: string): string[] {
  return value.match(/\b\d+(?:[,.]\d+)?\b/gu) ?? [];
}

function extractYears(value: string): string[] {
  return value.match(/\b\d{3,4}\b/gu) ?? [];
}

export function diffTrustedScriptNarrationV33(input: {
  readonly episodeId: string;
  readonly previousNarration: CanonicalNarrationV3_3;
  readonly nextNarration: CanonicalNarrationV3_3;
  readonly previousClaims: readonly HistoryTrustedClaimV1[];
  readonly nextClaims: readonly HistoryTrustedClaimV1[];
}): HistoryTrustDeltaReportV33 {
  const deltas: HistoryTrustDeltaV33[] = [];
  const previousById = new Map(
    input.previousClaims.map((claim) => [claim.id, claim] as const)
  );
  const nextById = new Map(input.nextClaims.map((claim) => [claim.id, claim] as const));
  const previousOnlyFormatting =
    normalizeComparableProposition(input.previousNarration.normalizedText) ===
      normalizeComparableProposition(input.nextNarration.normalizedText) &&
    input.previousNarration.normalizedTextSha256 !==
      input.nextNarration.normalizedTextSha256;
  if (
    input.previousNarration.normalizedTextSha256 ===
    input.nextNarration.normalizedTextSha256
  ) {
    return {
      schemaVersion: "history-trust-delta-report.v1",
      episodeId: input.episodeId,
      previousNarrationHash: input.previousNarration.normalizedTextSha256,
      nextNarrationHash: input.nextNarration.normalizedTextSha256,
      deltas: [],
      invalidatedClaimIds: [],
      reattestationRequired: false,
    };
  }
  if (previousOnlyFormatting) {
    deltas.push({
      claimId: null,
      kind: "formatting-only",
      invalidatesTrust: false,
      summary:
        "Narration changed only through punctuation, Markdown, or whitespace-equivalent formatting.",
      previousProposition: null,
      nextProposition: null,
    });
  }
  for (const next of input.nextClaims) {
    const previous = previousById.get(next.id);
    if (!previous) {
      const near = input.previousClaims.find(
        (candidate) =>
          jaccard(
            tokenize(candidate.normalizedProposition),
            tokenize(next.normalizedProposition)
          ) >= 0.86
      );
      if (near) {
        const prevYears = extractYears(near.normalizedProposition).join(",");
        const nextYears = extractYears(next.normalizedProposition).join(",");
        const prevNumbers = extractNumbers(near.normalizedProposition).join(",");
        const nextNumbers = extractNumbers(next.normalizedProposition).join(",");
        if (prevYears !== nextYears) {
          deltas.push({
            claimId: next.id,
            kind: "changed-date",
            invalidatesTrust: true,
            summary: "Temporal claim changed.",
            previousProposition: near.normalizedProposition,
            nextProposition: next.normalizedProposition,
          });
          continue;
        }
        if (prevNumbers !== nextNumbers) {
          deltas.push({
            claimId: next.id,
            kind: "changed-number",
            invalidatesTrust: true,
            summary: "Quantitative claim changed.",
            previousProposition: near.normalizedProposition,
            nextProposition: next.normalizedProposition,
          });
          continue;
        }
        if (
          near.entities.map((item) => item.text).sort().join("|") !==
          next.entities.map((item) => item.text).sort().join("|")
        ) {
          deltas.push({
            claimId: next.id,
            kind: "changed-actor",
            invalidatesTrust: true,
            summary: "Named actor or institution set changed.",
            previousProposition: near.normalizedProposition,
            nextProposition: next.normalizedProposition,
          });
          continue;
        }
        if (
          near.geographicQualifiers.slice().sort().join("|") !==
          next.geographicQualifiers.slice().sort().join("|")
        ) {
          deltas.push({
            claimId: next.id,
            kind: "changed-location",
            invalidatesTrust: true,
            summary: "Geographic claim changed.",
            previousProposition: near.normalizedProposition,
            nextProposition: next.normalizedProposition,
          });
          continue;
        }
        if (
          near.claimKind === "causal" ||
          next.claimKind === "causal" ||
          /\b(?:because|caused|led to|resulted)\b/iu.test(next.normalizedProposition)
        ) {
          if (
            normalizeComparableProposition(near.normalizedProposition) !==
            normalizeComparableProposition(next.normalizedProposition)
          ) {
            deltas.push({
              claimId: next.id,
              kind: "changed-causality",
              invalidatesTrust: true,
              summary: "Causal relationship changed.",
              previousProposition: near.normalizedProposition,
              nextProposition: next.normalizedProposition,
            });
            continue;
          }
        }
        if (
          near.uncertaintyMarkers.length > 0 &&
          next.uncertaintyMarkers.length === 0
        ) {
          deltas.push({
            claimId: next.id,
            kind: "removed-uncertainty",
            invalidatesTrust: true,
            summary: "Uncertainty markers were removed.",
            previousProposition: near.normalizedProposition,
            nextProposition: next.normalizedProposition,
          });
          continue;
        }
        deltas.push({
          claimId: next.id,
          kind: "equivalent-paraphrase",
          invalidatesTrust: false,
          summary: "Claim rephrased without material factual change.",
          previousProposition: near.normalizedProposition,
          nextProposition: next.normalizedProposition,
        });
        continue;
      }
      if (next.materiality === "material")
        deltas.push({
          claimId: next.id,
          kind: "new-factual-assertion",
          invalidatesTrust: true,
          summary: "New material factual claim appeared.",
          previousProposition: null,
          nextProposition: next.normalizedProposition,
        });
      continue;
    }
    if (
      previous.narrationSpan.startUtf16 !== next.narrationSpan.startUtf16 ||
      previous.narrationSpan.endUtf16Exclusive !==
        next.narrationSpan.endUtf16Exclusive
    )
      deltas.push({
        claimId: next.id,
        kind: "span-realignment",
        invalidatesTrust: false,
        summary: "Claim span realigned without identity change.",
        previousProposition: previous.normalizedProposition,
        nextProposition: next.normalizedProposition,
      });
  }
  for (const previous of input.previousClaims) {
    if (nextById.has(previous.id)) continue;
    const near = input.nextClaims.find(
      (candidate) =>
        jaccard(
          tokenize(candidate.normalizedProposition),
          tokenize(previous.normalizedProposition)
        ) >= 0.86
    );
    if (!near && previous.materiality === "material")
      deltas.push({
        claimId: previous.id,
        kind: "changed-interpretation",
        invalidatesTrust: true,
        summary: "Previous material claim disappeared without equivalence.",
        previousProposition: previous.normalizedProposition,
        nextProposition: null,
      });
  }
  const invalidatedClaimIds = [
    ...new Set(
      deltas.filter((delta) => delta.invalidatesTrust && delta.claimId).map((delta) => delta.claimId!)
    ),
  ].sort();
  return {
    schemaVersion: "history-trust-delta-report.v1",
    episodeId: input.episodeId,
    previousNarrationHash: input.previousNarration.normalizedTextSha256,
    nextNarrationHash: input.nextNarration.normalizedTextSha256,
    deltas,
    invalidatedClaimIds,
    reattestationRequired: invalidatedClaimIds.length > 0,
  };
}

export function createAuthorityTransitionV1(input: {
  readonly episodeId: string;
  readonly fromMode: HistorySourceAuthorityMode | null;
  readonly toMode: HistorySourceAuthorityMode;
  readonly actor: string;
  readonly reason: string;
  readonly narrationHash: string;
  readonly recordedAt?: string;
  readonly previousSnapshotHash?: string | null;
}): HistoryAuthorityTransitionV1 {
  const recordedAt = input.recordedAt ?? FIXED_ISO;
  const id = `authority-transition-${sha256(
    [
      input.episodeId,
      input.fromMode ?? "",
      input.toMode,
      input.actor,
      input.reason,
      input.narrationHash,
      recordedAt,
    ].join("\u0000")
  ).slice(0, 24)}`;
  return {
    schemaVersion: HISTORY_AUTHORITY_TRANSITION_SCHEMA_V33,
    id,
    episodeId: input.episodeId,
    fromMode: input.fromMode,
    toMode: input.toMode,
    actor: input.actor,
    reason: input.reason,
    narrationHash: input.narrationHash,
    recordedAt,
    previousSnapshotHash: input.previousSnapshotHash ?? null,
  };
}

export function contentGateAllowsTrustedClaimV33(input: {
  readonly provenanceStatus: ClaimProvenanceStatusV3_3;
  readonly attestation: TrustedNarrationAttestationV1 | null;
  readonly narrationHash: string;
  readonly claimId: string;
  readonly authorityMode: HistorySourceAuthorityMode;
}): boolean {
  if (input.authorityMode === "unverified-external") return false;
  if (input.authorityMode !== "trusted-script") return false;
  if (input.provenanceStatus !== "trusted_input") return false;
  if (!input.attestation) return false;
  return isTrustedAttestationValidV1({
    attestation: input.attestation,
    narrationHash: input.narrationHash,
    ...(input.attestation.scope === "selected-claims"
      ? { claimId: input.claimId }
      : {}),
  });
}

export function narrationImpliesRouteLabelV33(input: {
  readonly narrationText: string;
  readonly routeLabel: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}): boolean {
  const text = input.narrationText.toLocaleLowerCase();
  const origin = input.originLabel.toLocaleLowerCase();
  const destination = input.destinationLabel.toLocaleLowerCase();
  const label = input.routeLabel.toLocaleLowerCase();
  if (!text.includes(origin) || !text.includes(destination)) return false;
  if (label && !text.includes(label) && !/\b(?:route|crossed|entered|retreat|advanced|marched)\b/iu.test(text))
    return false;
  return true;
}

export function validateNarrationBoundMapRouteV33(input: {
  readonly narrationText: string;
  readonly claimTexts: readonly string[];
  readonly route: {
    readonly label: string;
    readonly originLabel: string;
    readonly destinationLabel: string;
    readonly linkedClaimIds: readonly string[];
  };
}): { readonly ok: boolean; readonly reason: string | null } {
  if (!input.route.linkedClaimIds.length)
    return { ok: false, reason: "Every trusted map route requires claim bindings." };
  const corpus = [input.narrationText, ...input.claimTexts].join("\n");
  if (
    !narrationImpliesRouteLabelV33({
      narrationText: corpus,
      routeLabel: input.route.label,
      originLabel: input.route.originLabel,
      destinationLabel: input.route.destinationLabel,
    })
  )
    return {
      ok: false,
      reason: "Map route is not present or clearly implied by trusted narration.",
    };
  return { ok: true, reason: null };
}

export function validateNarrationBoundDiagramEdgeV33(input: {
  readonly claimTexts: readonly string[];
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly relationship: string;
}): { readonly ok: boolean; readonly reason: string | null } {
  const corpus = input.claimTexts.join("\n").toLocaleLowerCase();
  if (!corpus.includes(input.fromLabel.toLocaleLowerCase()))
    return { ok: false, reason: "Diagram edge source actor is absent from trusted claims." };
  if (!corpus.includes(input.toLabel.toLocaleLowerCase()))
    return { ok: false, reason: "Diagram edge target actor is absent from trusted claims." };
  if (
    input.relationship &&
    !corpus.includes(input.relationship.toLocaleLowerCase()) &&
    !/\b(?:because|led to|caused|resulted|relationship|system|cycle)\b/iu.test(corpus)
  )
    return {
      ok: false,
      reason: "Diagram edge relationship is not expressed in trusted narration.",
    };
  return { ok: true, reason: null };
}

export function buildTrustedScriptClaimBindingsV33(input: {
  readonly trustedClaims: readonly HistoryTrustedClaimV1[];
}): readonly {
  readonly claimId: string;
  readonly narrationUnitId: string;
  readonly startUtf16: number;
  readonly endUtf16Exclusive: number;
  readonly verbatimText: string;
}[] {
  return input.trustedClaims.map((claim) => ({
    claimId: claim.id,
    narrationUnitId: claim.narrationUnitId,
    startUtf16: claim.narrationSpan.startUtf16,
    endUtf16Exclusive: claim.narrationSpan.endUtf16Exclusive,
    verbatimText: claim.verbatimText,
  }));
}

export function hashCanonicalTrustedArtifactsV33(value: unknown): string {
  return hashCanonicalV33(value);
}

export type { CanonicalNarrationUnitV3_3 };
