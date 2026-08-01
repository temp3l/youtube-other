import { createHash } from "node:crypto";
import {
  approvalRecordSchema,
  type ContentSourceManifest,
  type EpisodeBlueprint,
} from "@mediaforge/domain";
import {
  adaptationCandidateSchema,
  sourceEvidenceSpanSchema,
  type AdaptationCandidate,
  type AdaptationReasonCode,
  type SourceEvidenceSpan,
} from "./adaptation-schema.js";

export interface ProvenanceIssue {
  readonly code: AdaptationReasonCode;
  readonly detail: string;
  readonly beatId?: string;
  readonly sourceId?: string;
  readonly lineId?: string;
}
export interface ScopedApprovalRequirement {
  readonly workflowInstanceId: string;
  readonly taskId: string;
  readonly unitId: string;
  readonly profileId: "strategic-reinvention";
  readonly locale: EpisodeBlueprint["canonicalLocale"];
  readonly variant: "full" | "short";
  readonly workflowRevision: string;
  readonly gate: "source" | "canonical-script";
  readonly inputArtifactHashes: readonly string[];
  readonly outputArtifactHashes: readonly string[];
  readonly requiredDistinctActors: number;
}
export interface EvidenceApprovalContext {
  readonly ledger: readonly unknown[];
  readonly identity: Omit<
    ScopedApprovalRequirement,
    | "gate"
    | "inputArtifactHashes"
    | "outputArtifactHashes"
    | "requiredDistinctActors"
  >;
  readonly requiredDistinctActors: number;
}
export interface AdaptationProvenanceReport {
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly beatSourceMap: Readonly<Record<string, readonly string[]>>;
  readonly lineEvidenceMap: Readonly<Record<string, readonly string[]>>;
  readonly evidence: readonly {
    readonly spanId: string;
    readonly sourceId: string;
    readonly byteStart: number;
    readonly byteEnd: number;
    readonly spanHash: string;
  }[];
  readonly claims: readonly {
    readonly claimId: string;
    readonly lineId: string;
    readonly evidenceSpanIds: readonly string[];
    readonly certain: true;
  }[];
  readonly quotations: readonly {
    readonly lineId: string;
    readonly evidenceSpanIds: readonly string[];
  }[];
  readonly unsupportedInferenceIds: readonly string[];
  readonly sensitivityWarnings: readonly string[];
  readonly premiumLeakage: readonly string[];
  readonly issues: readonly ProvenanceIssue[];
}

export function hashCanonicalSourceBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function hashEvidenceSpan(bytes: Uint8Array): string {
  return hashCanonicalSourceBytes(bytes);
}
function normalizeExtracted(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}
function approvalMatches(
  record: ReturnType<typeof approvalRecordSchema.parse>,
  requirement: ScopedApprovalRequirement
): boolean {
  return (
    record.workflowInstanceId === requirement.workflowInstanceId &&
    record.taskId === requirement.taskId &&
    record.unitId === requirement.unitId &&
    record.profileId === requirement.profileId &&
    record.locale === requirement.locale &&
    record.variant === requirement.variant &&
    record.boundRevision === requirement.workflowRevision &&
    record.scope?.gate === requirement.gate &&
    record.scope.locale === requirement.locale &&
    record.scope.variant === requirement.variant &&
    sameSet(
      record.scope.inputArtifactHashes,
      requirement.inputArtifactHashes
    ) &&
    sameSet(record.scope.outputArtifactHashes, requirement.outputArtifactHashes)
  );
}

/** Evaluates an immutable Task 05 approval event cohort in timestamp/ledger order. */
export function hasCurrentScopedApproval(
  ledgerInput: readonly unknown[],
  requirement: ScopedApprovalRequirement,
  now: Date
): boolean {
  if (
    !Number.isInteger(requirement.requiredDistinctActors) ||
    requirement.requiredDistinctActors < 1
  )
    return false;
  const parsed = approvalRecordSchema.array().safeParse(ledgerInput);
  if (!parsed.success) return false;
  const cohort = parsed.data
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => approvalMatches(record, requirement))
    .sort(
      (left, right) =>
        left.record.createdAt.localeCompare(right.record.createdAt) ||
        left.index - right.index
    );
  const rejectedAt = cohort
    .filter(({ record }) => record.decision === "rejected")
    .at(-1);
  const revokedIds = new Set<string>();
  const previouslySeenIds = new Set<string>();
  for (const { record } of cohort) {
    if (
      record.decision === "revoked" &&
      record.supersedesApprovalId &&
      previouslySeenIds.has(record.supersedesApprovalId)
    ) {
      revokedIds.add(record.supersedesApprovalId);
    }
    previouslySeenIds.add(record.id);
  }
  const current = cohort.filter(
    ({ record, index }) =>
      record.decision === "approved" &&
      (!rejectedAt ||
        record.createdAt > rejectedAt.record.createdAt ||
        (record.createdAt === rejectedAt.record.createdAt &&
          index > rejectedAt.index)) &&
      !revokedIds.has(record.id) &&
      Date.parse(record.createdAt) <= now.getTime() &&
      (!record.expiresAt || Date.parse(record.expiresAt) > now.getTime())
  );
  const highRisk = cohort.some(({ record }) => record.scope?.highRisk === true);
  const requiredActors = Math.max(
    requirement.requiredDistinctActors,
    highRisk ? 2 : 1
  );
  return (
    new Set(current.map(({ record }) => record.actor)).size >= requiredActors
  );
}

function wordBoundaryValid(
  bytes: Uint8Array,
  start: number,
  end: number
): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const before = decoder.decode(bytes.slice(0, start));
    const selected = decoder.decode(bytes.slice(start, end));
    const after = decoder.decode(bytes.slice(end));
    const word = /[\p{L}\p{N}]/u;
    const beforeLast = [...before].at(-1) ?? "";
    const selectedFirst = [...selected][0] ?? "";
    const selectedLast = [...selected].at(-1) ?? "";
    const afterFirst = [...after][0] ?? "";
    return (
      !(word.test(beforeLast) && word.test(selectedFirst)) &&
      !(word.test(selectedLast) && word.test(afterFirst))
    );
  } catch {
    return false;
  }
}

export function validateAdaptationProvenance(input: {
  readonly manifests: readonly ContentSourceManifest[];
  readonly sourceBytes: Readonly<Record<string, Uint8Array>>;
  readonly evidenceSpans: readonly unknown[];
  readonly evidenceApprovals: EvidenceApprovalContext;
  readonly blueprint: EpisodeBlueprint;
  readonly candidate: AdaptationCandidate;
  readonly now: Date;
}): AdaptationProvenanceReport {
  const candidate = adaptationCandidateSchema.parse(input.candidate);
  const manifests = new Map(
    input.manifests.map((manifest) => [manifest.sourceId, manifest])
  );
  const issues: ProvenanceIssue[] = [];
  const sourceHashes: Record<string, string> = {};
  for (const sourceId of input.blueprint.sources) {
    const manifest = manifests.get(sourceId);
    const bytes = input.sourceBytes[sourceId];
    if (!manifest?.approvedAt || !manifest.approvedBy) {
      issues.push({
        code: "SOURCE_NOT_APPROVED",
        detail: "Blueprint source lacks approved manifest.",
        sourceId,
      });
      continue;
    }
    if (!bytes || hashCanonicalSourceBytes(bytes) !== manifest.sourceHash) {
      issues.push({
        code: "SOURCE_HASH_MISMATCH",
        detail: "Canonical bytes do not match manifest.",
        sourceId,
      });
      continue;
    }
    sourceHashes[sourceId] = manifest.sourceHash;
    if (
      ["premium", "private"].includes(manifest.accessLevel) &&
      ["public", "lead-generation"].includes(input.blueprint.contentTier)
    )
      issues.push({
        code: "PREMIUM_LEAKAGE",
        detail: "Restricted source cannot feed target tier.",
        sourceId,
      });
  }
  const beatSourceMap: Record<string, readonly string[]> = {};
  for (const beat of input.blueprint.beats) {
    const approved = beat.sourceIds.filter((id) => Boolean(sourceHashes[id]));
    beatSourceMap[beat.beatId] = approved;
    if (approved.length === 0)
      issues.push({
        code: "BEAT_SOURCE_MISSING",
        detail: "Beat has no approved hash-bound source.",
        beatId: beat.beatId,
      });
  }
  const spansResult = sourceEvidenceSpanSchema
    .array()
    .safeParse(input.evidenceSpans);
  const spans: SourceEvidenceSpan[] = spansResult.success
    ? spansResult.data
    : [];
  if (!spansResult.success)
    issues.push({
      code: "EVIDENCE_SPAN_INVALID",
      detail: "Evidence spans failed runtime schema validation.",
    });
  const ids = new Set<string>();
  const spanMap = new Map<
    string,
    { span: SourceEvidenceSpan; text: string; hash: string }
  >();
  for (const span of spans) {
    if (ids.has(span.spanId)) {
      issues.push({
        code: "EVIDENCE_SPAN_INVALID",
        detail: `Duplicate evidence span id ${span.spanId}.`,
      });
      continue;
    }
    ids.add(span.spanId);
    const bytes = input.sourceBytes[span.sourceId];
    if (
      !bytes ||
      !sourceHashes[span.sourceId] ||
      span.byteEnd > bytes.byteLength ||
      !wordBoundaryValid(bytes, span.byteStart, span.byteEnd)
    ) {
      issues.push({
        code: "EVIDENCE_SPAN_INVALID",
        detail: "Span is out of range, split UTF-8, or cuts a word.",
        sourceId: span.sourceId,
      });
      continue;
    }
    const slice = bytes.slice(span.byteStart, span.byteEnd);
    spanMap.set(span.spanId, {
      span,
      text: new TextDecoder("utf-8", { fatal: true }).decode(slice),
      hash: hashEvidenceSpan(slice),
    });
  }
  const bySource = new Map<string, SourceEvidenceSpan[]>();
  for (const span of spanMap.values())
    bySource.set(span.span.sourceId, [
      ...(bySource.get(span.span.sourceId) ?? []),
      span.span,
    ]);
  for (const sourceSpans of bySource.values()) {
    const ordered = [...sourceSpans].sort(
      (a, b) => a.byteStart - b.byteStart || a.byteEnd - b.byteEnd
    );
    for (let index = 1; index < ordered.length; index += 1)
      if (ordered[index]!.byteStart < ordered[index - 1]!.byteEnd)
        issues.push({
          code: "EVIDENCE_SPAN_INVALID",
          detail: "Evidence spans overlap.",
          sourceId: ordered[index]!.sourceId,
        });
  }
  const lineEvidenceMap: Record<string, readonly string[]> = {};
  const claims: AdaptationProvenanceReport["claims"][number][] = [];
  const quotations: AdaptationProvenanceReport["quotations"][number][] = [];
  for (const line of candidate.lines) {
    lineEvidenceMap[line.lineId] = line.evidenceSpanIds;
    if (new Set(line.evidenceSpanIds).size !== line.evidenceSpanIds.length) {
      issues.push({
        code: "EVIDENCE_SPAN_INVALID",
        detail: "Line repeats an evidence span.",
        lineId: line.lineId,
      });
      continue;
    }
    const evidence = line.evidenceSpanIds.map((id) => spanMap.get(id));
    if (evidence.some((item) => !item)) {
      issues.push({
        code: "LINE_EVIDENCE_MISSING",
        detail: "Line cites unknown or invalid span.",
        lineId: line.lineId,
      });
      continue;
    }
    const resolved = evidence as {
      span: SourceEvidenceSpan;
      text: string;
      hash: string;
    }[];
    const oneSource =
      new Set(resolved.map((item) => item.span.sourceId)).size === 1;
    const ordered = resolved.every(
      (item, index) =>
        index === 0 || item.span.byteStart >= resolved[index - 1]!.span.byteEnd
    );
    if (!oneSource || !ordered)
      issues.push({
        code: "LINE_NOT_DERIVED_FROM_SOURCE",
        detail:
          "Within-line evidence must preserve non-overlapping source order.",
        lineId: line.lineId,
      });
    if (
      normalizeExtracted(resolved.map((item) => item.text).join(" ")) !==
      normalizeExtracted(line.text)
    )
      issues.push({
        code: "LINE_NOT_DERIVED_FROM_SOURCE",
        detail:
          "Line is not extraction/omission/whitespace normalization of cited bytes.",
        lineId: line.lineId,
      });
    const beat = input.blueprint.beats.find(
      (item) => item.beatId === line.beatId
    );
    if (
      !beat ||
      resolved.some((item) => !beat.sourceIds.includes(item.span.sourceId))
    )
      issues.push({
        code: "LINE_EVIDENCE_MISSING",
        detail: "Line evidence is outside its blueprint beat.",
        lineId: line.lineId,
      });
    if (
      line.kind === "first-person" &&
      resolved.some(
        (item) =>
          !["creator-recording", "creator-written-note"].includes(
            manifests.get(item.span.sourceId)?.sourceType ?? ""
          )
      )
    )
      issues.push({
        code: "FIRST_PERSON_EVIDENCE_MISSING",
        detail: "First person requires creator-authored source bytes.",
        lineId: line.lineId,
      });
    const evidenceApproved = resolved.every((item) => {
      const source = manifests.get(item.span.sourceId)!;
      return hasCurrentScopedApproval(
        input.evidenceApprovals.ledger,
        {
          ...input.evidenceApprovals.identity,
          gate: "source",
          inputArtifactHashes: [source.sourceHash],
          outputArtifactHashes: [item.hash],
          requiredDistinctActors:
            input.evidenceApprovals.requiredDistinctActors,
        },
        input.now
      );
    });
    if (
      ["quote", "first-person", "claim"].includes(line.kind) &&
      !evidenceApproved
    )
      issues.push({
        code:
          line.kind === "quote"
            ? "QUOTE_NOT_APPROVED"
            : line.kind === "claim"
              ? "CLAIM_UNCERTAIN"
              : "FIRST_PERSON_EVIDENCE_MISSING",
        detail:
          "Line lacks a current exact span-scoped evidence approval cohort.",
        lineId: line.lineId,
      });
    if (line.kind === "quote")
      quotations.push({
        lineId: line.lineId,
        evidenceSpanIds: line.evidenceSpanIds,
      });
    if (line.kind === "claim") {
      if (!line.claimId || !evidenceApproved) {
        if (!line.claimId)
          issues.push({
            code: "CLAIM_UNCERTAIN",
            detail: "Claim requires stable ID and approved direct evidence.",
            lineId: line.lineId,
          });
      } else
        claims.push({
          claimId: line.claimId,
          lineId: line.lineId,
          evidenceSpanIds: line.evidenceSpanIds,
          certain: true,
        });
    }
  }
  const inventedCode: Record<
    AdaptationCandidate["invented"][number],
    AdaptationReasonCode
  > = {
    experience: "INVENTED_EXPERIENCE",
    opinion: "INVENTED_OPINION",
    memory: "INVENTED_MEMORY",
    claim: "UNSUPPORTED_CLAIM",
    advice: "UNSUPPORTED_ADVICE",
    "brand-wordplay": "BRAND_WORDPLAY_INVENTED",
  };
  for (const kind of candidate.invented)
    issues.push({
      code: inventedCode[kind],
      detail: `Invented ${kind} is prohibited.`,
    });
  for (const inferenceId of candidate.unsupportedInferenceIds)
    issues.push({
      code: "UNSUPPORTED_CLAIM",
      detail: `Unsupported inference ${inferenceId} is prohibited.`,
    });
  const evidence = [...spanMap.values()]
    .map(({ span, hash }) => ({ ...span, spanHash: hash }))
    .sort((a, b) => a.spanId.localeCompare(b.spanId));
  const sensitivityWarnings = input.manifests
    .filter((item) => item.sensitivity.classification !== "normal")
    .map((item) => `${item.sourceId}:${item.sensitivity.classification}`);
  return {
    sourceHashes,
    beatSourceMap,
    lineEvidenceMap,
    evidence,
    claims,
    quotations,
    unsupportedInferenceIds: candidate.unsupportedInferenceIds,
    sensitivityWarnings,
    premiumLeakage: issues
      .filter((i) => i.code === "PREMIUM_LEAKAGE")
      .flatMap((i) => (i.sourceId ? [i.sourceId] : [])),
    issues,
  };
}
