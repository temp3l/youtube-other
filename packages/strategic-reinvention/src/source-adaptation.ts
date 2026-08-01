import { createHash } from "node:crypto";
import type {
  ContentSourceManifest,
  CreatorProfile,
  EffectiveContentPolicy,
  EpisodeBlueprint,
  GenreDefinition,
} from "@mediaforge/domain";
import { evaluateSourcePolicy } from "./source-policy.js";
import {
  type AdaptationCandidate,
  type SourceEvidenceSpan,
} from "./adaptation-schema.js";
import {
  hasCurrentScopedApproval,
  validateAdaptationProvenance,
  type AdaptationProvenanceReport,
  type EvidenceApprovalContext,
} from "./provenance-validation.js";

export interface SourceLedAdaptationResult {
  readonly candidateCanonicalScript: {
    readonly status: "CANDIDATE_UNPUBLISHABLE";
    readonly revision: string;
    readonly fingerprint: string;
    readonly lines: readonly string[];
  };
  readonly provenance: AdaptationProvenanceReport;
  readonly identity: {
    readonly episodeId: string;
    readonly genreId: string;
    readonly creatorId: string;
    readonly locale: EpisodeBlueprint["canonicalLocale"];
    readonly tier: string;
    readonly genreRevision: string;
  };
  readonly remainingApprovalGates: readonly EffectiveContentPolicy["requiredApprovalGates"][number][];
  readonly canonicalScriptApproved: false;
  readonly approvedForPublication: false;
}
export interface ApprovedCanonicalScript extends Omit<
  SourceLedAdaptationResult,
  "candidateCanonicalScript" | "canonicalScriptApproved"
> {
  readonly candidateCanonicalScript: Omit<
    SourceLedAdaptationResult["candidateCanonicalScript"],
    "status"
  > & { readonly status: "CANONICAL_SCRIPT_APPROVED" };
  readonly canonicalScriptApproved: true;
  readonly approvedForPublication: false;
  readonly approvalCohortValidated: true;
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  return value;
}
function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
function fail(
  issues: readonly {
    readonly code: string;
    readonly detail: string;
    readonly sourceId?: string;
  }[]
): never {
  const error = new Error(issues.map((issue) => issue.code).join(","));
  Object.assign(error, { code: "ADAPTATION_PROVENANCE_INVALID", issues });
  throw error;
}

export function createSourceLedAdaptation(input: {
  readonly manifests: readonly ContentSourceManifest[];
  readonly sourceBytes: Readonly<Record<string, Uint8Array>>;
  readonly evidenceSpans: readonly SourceEvidenceSpan[];
  readonly evidenceApprovals: EvidenceApprovalContext;
  readonly candidate: AdaptationCandidate;
  readonly genre: GenreDefinition;
  readonly creator: CreatorProfile;
  readonly blueprint: EpisodeBlueprint;
  readonly effectivePolicy: EffectiveContentPolicy;
  readonly now: Date;
}): SourceLedAdaptationResult {
  const identityIssues: { code: "IDENTITY_MISMATCH"; detail: string }[] = [];
  if (
    input.genre.id !== input.blueprint.genreId ||
    input.genre.id !== input.effectivePolicy.genreId ||
    input.creator.genreId !== input.genre.id
  )
    identityIssues.push({
      code: "IDENTITY_MISMATCH",
      detail: "Genre identity chain does not match.",
    });
  if (
    input.creator.id !== input.blueprint.creatorProfileId ||
    input.creator.id !== input.effectivePolicy.creatorProfileId
  )
    identityIssues.push({
      code: "IDENTITY_MISMATCH",
      detail: "Creator identity chain does not match.",
    });
  if (
    input.genre.canonicalLocale !== input.blueprint.canonicalLocale ||
    input.creator.canonicalLocale !== input.blueprint.canonicalLocale ||
    input.effectivePolicy.canonicalLocale !== input.blueprint.canonicalLocale ||
    !input.effectivePolicy.supportedLocales.includes(
      input.blueprint.canonicalLocale
    )
  )
    identityIssues.push({
      code: "IDENTITY_MISMATCH",
      detail: "Canonical locale chain does not match.",
    });
  if (
    !input.effectivePolicy.permittedContentTiers.includes(
      input.blueprint.contentTier
    )
  )
    identityIssues.push({
      code: "IDENTITY_MISMATCH",
      detail: "Blueprint tier is outside effective policy.",
    });
  if (!input.genre.episodeModes.includes(input.blueprint.mode))
    identityIssues.push({
      code: "IDENTITY_MISMATCH",
      detail: "Blueprint mode is outside genre revision.",
    });
  if (
    !input.effectivePolicy.requiredApprovalGates.includes("canonical-script") ||
    !input.blueprint.requiredApprovalGates.includes("canonical-script") ||
    !input.genre.requiredApprovalGates.includes("canonical-script")
  )
    throw new Error(
      "CANONICAL_SCRIPT_APPROVAL_REQUIRED: all policy layers must require canonical-script approval."
    );
  const policyIssues = input.blueprint.sources.flatMap((sourceId) => {
    const source = input.manifests.find((item) => item.sourceId === sourceId);
    if (!source) return [];
    const decision = evaluateSourcePolicy(source, {
      operation: "adapt",
      locale: input.blueprint.canonicalLocale,
      targetTier: input.blueprint.contentTier,
      commercial: true,
      now: input.now,
    });
    return decision.allowed
      ? []
      : [
          {
            code: "SOURCE_POLICY_DENIED" as const,
            detail: decision.reasonCodes.join(","),
            sourceId,
          },
        ];
  });
  const provenance = validateAdaptationProvenance(input);
  const issues = [...identityIssues, ...policyIssues, ...provenance.issues];
  if (issues.length) fail(issues);
  const candidateFingerprint = fingerprint({
    manifests: [...input.manifests].sort((a, b) =>
      a.sourceId.localeCompare(b.sourceId)
    ),
    sourceHashes: provenance.sourceHashes,
    evidence: provenance.evidence,
    genre: input.genre,
    creator: input.creator,
    blueprint: input.blueprint,
    effectivePolicy: input.effectivePolicy,
    candidate: input.candidate,
  });
  return {
    candidateCanonicalScript: {
      status: "CANDIDATE_UNPUBLISHABLE",
      revision: input.candidate.revision,
      fingerprint: candidateFingerprint,
      lines: input.candidate.lines.map((line) => line.text),
    },
    provenance,
    identity: {
      episodeId: input.blueprint.episodeId,
      genreId: input.genre.id,
      creatorId: input.creator.id,
      locale: input.blueprint.canonicalLocale,
      tier: input.blueprint.contentTier,
      genreRevision: input.genre.version,
    },
    remainingApprovalGates: input.effectivePolicy.requiredApprovalGates.filter(
      (gate) => gate !== "source" && gate !== "canonical-script"
    ),
    canonicalScriptApproved: false,
    approvedForPublication: false,
  };
}

/** Applies only the current exact cohort from an immutable Task 05 approval ledger. */
export function applyCanonicalScriptGate(input: {
  readonly candidate: SourceLedAdaptationResult;
  readonly approvalLedger: readonly unknown[];
  readonly now: Date;
  readonly expected: {
    readonly workflowInstanceId: string;
    readonly taskId: string;
    readonly unitId: string;
    readonly workflowRevision: string;
    readonly requiredDistinctActors: number;
  };
}): SourceLedAdaptationResult | ApprovedCanonicalScript {
  const valid =
    input.expected.unitId === input.candidate.identity.episodeId &&
    hasCurrentScopedApproval(
      input.approvalLedger,
      {
        workflowInstanceId: input.expected.workflowInstanceId,
        taskId: input.expected.taskId,
        unitId: input.expected.unitId,
        profileId: "strategic-reinvention",
        locale: input.candidate.identity.locale,
        variant: "full",
        workflowRevision: input.expected.workflowRevision,
        gate: "canonical-script",
        inputArtifactHashes: Object.values(
          input.candidate.provenance.sourceHashes
        ),
        outputArtifactHashes: [
          input.candidate.candidateCanonicalScript.fingerprint,
        ],
        requiredDistinctActors: input.expected.requiredDistinctActors,
      },
      input.now
    );
  if (!valid) return input.candidate;
  return {
    ...input.candidate,
    candidateCanonicalScript: {
      ...input.candidate.candidateCanonicalScript,
      status: "CANONICAL_SCRIPT_APPROVED",
    },
    canonicalScriptApproved: true,
    approvedForPublication: false,
    approvalCohortValidated: true,
  };
}
