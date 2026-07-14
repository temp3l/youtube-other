import {
  QUALITY_SCHEMA_VERSION,
  qualityAssessmentSchema,
  type ArtifactRef,
  type HardFailure,
  type QualityAssessment,
  type QualityStatus,
} from "@mediaforge/domain";

import {
  darkTruthReferenceOverrideSchema,
  referenceImageManifestSchema,
  storyBibleManifestSchema,
  type DarkTruthReferenceOverride,
  type ReferenceImageManifest,
  type StoryBibleManifest,
} from "./profile-contracts.js";

export const DARK_TRUTH_QUALITY_POLICY_VERSION =
  "darktruth.quality-policy.v1" as const;

export const DARK_TRUTH_QUALITY_DIMENSIONS = [
  ["hook", 5],
  ["first-20-second-visual-potential", 5],
  ["originality", 4],
  ["specificity", 4],
  ["motivation", 4],
  ["escalation", 5],
  ["supernatural-rule-clarity", 5],
  ["emotional-cost", 5],
  ["causality", 5],
  ["sensory-detail", 4],
  ["dialogue-restraint", 3],
  ["repetition", 4],
  ["cliche-density", 4],
  ["final-reveal", 5],
  ["final-line", 5],
  ["narratability", 5],
  ["thumbnail-potential", 5],
  ["full-retention-potential", 4],
  ["short-retention-potential", 4],
  ["translation-resilience", 5],
  ["continuity-readiness", 5],
  ["policy-suitability", 5],
] as const;

export type DarkTruthQualityDimension =
  (typeof DARK_TRUTH_QUALITY_DIMENSIONS)[number][0];

export interface DarkTruthHardFailureEvidence {
  readonly supernaturalRuleClear: boolean;
  readonly bibleConsistent: boolean;
  readonly templateRepetitionAbsent: boolean;
  readonly characterIdentityConsistent: boolean;
  readonly emotionalCostPresent: boolean;
  readonly endingBehaviorCausal: boolean;
  readonly referenceSetPresent: boolean;
  readonly referenceSetApproved: boolean;
  readonly visualContinuityPassed: boolean;
  readonly evidence: readonly string[];
}

const hardFailureRules = [
  {
    key: "supernaturalRuleClear",
    code: "DARKTRUTH_SUPERNATURAL_RULE_UNCLEAR",
    action: "rewrite",
    message: "The supernatural rule is unclear or has inconsistent consequences.",
  },
  {
    key: "bibleConsistent",
    code: "DARKTRUTH_BIBLE_CONTRADICTION",
    action: "rewrite",
    message: "The artifact contradicts the bound story bible.",
  },
  {
    key: "templateRepetitionAbsent",
    code: "DARKTRUTH_TEMPLATE_REPETITION",
    action: "revision",
    message: "Template language or repeated story structure was detected.",
  },
  {
    key: "characterIdentityConsistent",
    code: "DARKTRUTH_CHARACTER_IDENTITY_INCONSISTENT",
    action: "rewrite",
    message: "A character identity conflicts across required artifacts.",
  },
  {
    key: "emotionalCostPresent",
    code: "DARKTRUTH_EMOTIONAL_COST_MISSING",
    action: "rewrite",
    message: "The protagonist's costly choice is absent.",
  },
  {
    key: "endingBehaviorCausal",
    code: "DARKTRUTH_ARBITRARY_ENDING_BEHAVIOR",
    action: "rewrite",
    message: "The ending relies on arbitrary behavior rather than established causality.",
  },
  {
    key: "referenceSetPresent",
    code: "DARKTRUTH_REFERENCE_SET_MISSING",
    action: "blocked",
    message: "Required reference evidence is missing.",
  },
  {
    key: "referenceSetApproved",
    code: "DARKTRUTH_REFERENCE_SET_UNAPPROVED",
    action: "blocked",
    message: "The exact reference-set revision is not approved.",
  },
  {
    key: "visualContinuityPassed",
    code: "DARKTRUTH_VISUAL_CONTINUITY_FAILED",
    action: "blocked",
    message: "Visual continuity validation failed.",
  },
] as const;

export function darkTruthHardFailures(
  input: DarkTruthHardFailureEvidence
): readonly HardFailure[] {
  const evidence = input.evidence.length > 0 ? input.evidence : ["No passing evidence supplied."];
  return hardFailureRules
    .filter((rule) => !input[rule.key])
    .map((rule) => ({
      code: rule.code,
      message: rule.message,
      action: rule.action,
      overridable: rule.action !== "rewrite",
      evidence: [...evidence],
    }));
}

function statusFor(
  weightedScore: number,
  requiredScores: readonly number[],
  failures: readonly HardFailure[],
  boundedEdits: readonly string[]
): QualityStatus {
  if (failures.some((failure) => failure.action === "blocked")) return "BLOCKED";
  if (failures.some((failure) => failure.action === "rewrite")) {
    return "REWRITE_REQUIRED";
  }
  if (failures.length > 0) return "REVISION_REQUIRED";
  if (
    weightedScore >= 85 &&
    requiredScores.every((score) => score >= 70) &&
    boundedEdits.length === 0
  ) {
    return "READY";
  }
  if (weightedScore >= 75 && boundedEdits.length > 0) {
    return "READY_WITH_MINOR_EDITS";
  }
  return weightedScore < 55 ? "REWRITE_REQUIRED" : "REVISION_REQUIRED";
}

export function buildDarkTruthQualityAssessment(input: {
  readonly artifact: ArtifactRef;
  readonly scores: Readonly<Record<DarkTruthQualityDimension, number>>;
  readonly evidence: DarkTruthHardFailureEvidence;
  readonly boundedEdits?: readonly string[];
  readonly warnings?: readonly string[];
  readonly assessedAt?: string;
}): QualityAssessment {
  const dimensions = DARK_TRUTH_QUALITY_DIMENSIONS.map(([name, weight]) => ({
    dimension: `darktruth.${name}` as const,
    score: input.scores[name],
    weight,
    required: [
      "supernatural-rule-clarity",
      "emotional-cost",
      "causality",
      "continuity-readiness",
      "policy-suitability",
    ].includes(name),
    evidence: input.evidence.evidence.length
      ? [...input.evidence.evidence]
      : [`${name} scored deterministically.`],
  }));
  const weightedScore = dimensions.reduce(
    (sum, dimension) => sum + (dimension.score * dimension.weight) / 100,
    0
  );
  const failures = darkTruthHardFailures(input.evidence);
  const boundedEdits = [...(input.boundedEdits ?? [])];
  return qualityAssessmentSchema.parse({
    schemaVersion: QUALITY_SCHEMA_VERSION,
    profileId: "dark-truth",
    artifact: input.artifact,
    status: statusFor(
      weightedScore,
      dimensions.filter((item) => item.required).map((item) => item.score),
      failures,
      boundedEdits
    ),
    dimensions,
    weightedScore,
    hardFailures: failures,
    boundedEdits,
    warnings: [...(input.warnings ?? [])],
    assessedAt: input.assessedAt ?? new Date().toISOString(),
  });
}

export interface ReferenceReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
  readonly hardFailureCodes: readonly (
    | "DARKTRUTH_REFERENCE_SET_MISSING"
    | "DARKTRUTH_REFERENCE_SET_UNAPPROVED"
    | "DARKTRUTH_BIBLE_CONTRADICTION"
    | "DARKTRUTH_VISUAL_CONTINUITY_FAILED"
    | "ARTIFACT_INVALID"
  )[];
  readonly overrideApplied: boolean;
}

export interface StoryBibleReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

export function assessStoryBibleReadiness(
  input: StoryBibleManifest | null,
  now: Date = new Date()
): StoryBibleReadiness {
  if (!input) {
    return { ready: false, reasons: ["The story-bible manifest is missing."] };
  }
  const bible = storyBibleManifestSchema.parse(input);
  const reasons: string[] = [];
  if (
    !bible.approval ||
    bible.approval.decision !== "approved" ||
    (bible.approval.expiresAt && new Date(bible.approval.expiresAt) <= now)
  ) {
    reasons.push("The exact story-bible revision is not currently approved.");
  }
  for (const document of bible.documents) {
    if (
      !document.approval ||
      document.approval.decision !== "approved" ||
      (document.approval.expiresAt && new Date(document.approval.expiresAt) <= now)
    ) {
      reasons.push(`Bible document ${document.kind} is not currently approved.`);
    }
  }
  return { ready: reasons.length === 0, reasons };
}

function activeOverride(
  override: DarkTruthReferenceOverride | undefined,
  bible: StoryBibleManifest,
  references: ReferenceImageManifest,
  taskId: string,
  now: Date
): boolean {
  if (!override) return false;
  const parsed = darkTruthReferenceOverrideSchema.parse(override);
  return (
    parsed.boundBibleRevision === bible.revision &&
    parsed.boundReferenceRevision === references.revision &&
    parsed.taskIds.includes(taskId as never) &&
    new Date(parsed.createdAt) <= now &&
    new Date(parsed.expiresAt) > now
  );
}

export function assessReferenceReadiness(input: {
  readonly bible: StoryBibleManifest | null;
  readonly references: ReferenceImageManifest | null;
  readonly variant: "full" | "short";
  readonly taskId: string;
  readonly verifiedChecksums?: Readonly<Record<string, string>>;
  readonly override?: DarkTruthReferenceOverride;
  readonly now?: Date;
}): ReferenceReadiness {
  if (!input.bible || !input.references) {
    return {
      ready: false,
      reasons: ["A complete story bible and reference manifest are required."],
      hardFailureCodes: ["DARKTRUTH_REFERENCE_SET_MISSING"],
      overrideApplied: false,
    };
  }
  const bible = storyBibleManifestSchema.parse(input.bible);
  const references = referenceImageManifestSchema.parse(input.references);
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const codes = new Set<ReferenceReadiness["hardFailureCodes"][number]>();
  if (
    references.bibleRevision !== bible.revision ||
    references.workflowRevision !== bible.workflowRevision
  ) {
    reasons.push("Reference-set revisions do not match the bound story bible.");
    codes.add("DARKTRUTH_BIBLE_CONTRADICTION");
  }
  const roles = new Set(
    references.entries
      .filter((entry) => entry.classification === "canonical")
      .map((entry) => entry.role)
  );
  for (const role of references.requiredCoverage[input.variant]) {
    if (!roles.has(role)) {
      reasons.push(`Missing required ${input.variant} reference role ${role}.`);
      codes.add("DARKTRUTH_REFERENCE_SET_MISSING");
    }
  }
  const entryIds = new Set(references.entries.map((entry) => entry.id));
  for (const required of bible.episode.requiredReferences) {
    if (!entryIds.has(required)) {
      reasons.push(`Episode bible reference ${required} is missing.`);
      codes.add("DARKTRUTH_REFERENCE_SET_MISSING");
    }
  }
  for (const entry of references.entries.filter(
    (candidate) => candidate.classification === "canonical"
  )) {
    if (
      !entry.approval ||
      entry.approval.decision !== "approved" ||
      (entry.approval.expiresAt && new Date(entry.approval.expiresAt) <= now)
    ) {
      reasons.push(`Canonical reference ${entry.id} is not currently approved.`);
      codes.add("DARKTRUTH_REFERENCE_SET_UNAPPROVED");
    }
    const verified = input.verifiedChecksums?.[entry.id];
    if (verified !== undefined && verified !== entry.checksumSha256) {
      reasons.push(`Canonical reference ${entry.id} failed checksum verification.`);
      codes.add("ARTIFACT_INVALID");
    }
  }
  if (references.validation.status !== "passed") {
    reasons.push("Reference validation has not passed.");
    codes.add("ARTIFACT_INVALID");
  }
  if (references.continuity.status !== "passed") {
    reasons.push("Reference continuity validation has not passed.");
    codes.add("DARKTRUTH_VISUAL_CONTINUITY_FAILED");
  }
  const overrideApplied = activeOverride(
    input.override,
    bible,
    references,
    input.taskId,
    now
  );
  return {
    ready: reasons.length === 0 || overrideApplied,
    reasons: overrideApplied
      ? [...reasons, "A revision-bound, task-scoped reference override applies."]
      : reasons,
    hardFailureCodes: [...codes],
    overrideApplied,
  };
}

export interface DarkTruthGateResult {
  readonly gate:
    | "localization"
    | "visual"
    | "thumbnail"
    | "audio"
    | "captions"
    | "audiovisual"
    | "metadata"
    | "publish";
  readonly status: "passed" | "blocked";
  readonly reasons: readonly string[];
}

export interface DarkTruthProductionEvidence {
  readonly localization: {
    readonly fidelityPassed: boolean;
    readonly nativeCharactersPassed: boolean;
    readonly pronunciationPassed: boolean;
  };
  readonly visual: {
    readonly referencesReady: boolean;
    readonly identityConsistent: boolean;
    readonly continuityPassed: boolean;
  };
  readonly thumbnail: {
    readonly safe: boolean;
    readonly compositionPassed: boolean;
    readonly textPassed: boolean;
    readonly identityConsistent: boolean;
  };
  readonly audio: {
    readonly streamValid: boolean;
    readonly durationValid: boolean;
    readonly pronunciationPassed: boolean;
    readonly continuityPassed: boolean;
  };
  readonly captions: { readonly valid: boolean; readonly timingPassed: boolean };
  readonly audiovisual: {
    readonly streamsValid: boolean;
    readonly timingPassed: boolean;
    readonly continuityPassed: boolean;
  };
  readonly metadata: {
    readonly titleValid: boolean;
    readonly descriptionValid: boolean;
    readonly policyPassed: boolean;
  };
  readonly publish: {
    readonly dryRunPassed: boolean;
    readonly artifactHash: string;
    readonly approval?: {
      readonly decision: "approved" | "rejected" | "revoked";
      readonly artifactHash: string;
      readonly boundRevision: string;
      readonly currentRevision: string;
      readonly expiresAt?: string;
    };
  };
}

function gate(
  name: DarkTruthGateResult["gate"],
  checks: readonly (readonly [boolean, string])[]
): DarkTruthGateResult {
  const reasons = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
  return { gate: name, status: reasons.length ? "blocked" : "passed", reasons };
}

export function evaluateDarkTruthProductionGates(
  evidence: DarkTruthProductionEvidence,
  now: Date = new Date()
): readonly DarkTruthGateResult[] {
  const approval = evidence.publish.approval;
  return [
    gate("localization", [
      [evidence.localization.fidelityPassed, "Localization fidelity failed."],
      [evidence.localization.nativeCharactersPassed, "Locale-native characters are invalid."],
      [evidence.localization.pronunciationPassed, "Pronunciation guidance is incomplete."],
    ]),
    gate("visual", [
      [evidence.visual.referencesReady, "Required references are not ready."],
      [evidence.visual.identityConsistent, "Character identity is inconsistent."],
      [evidence.visual.continuityPassed, "Visual continuity failed."],
    ]),
    gate("thumbnail", [
      [evidence.thumbnail.safe, "Thumbnail safety policy failed."],
      [evidence.thumbnail.compositionPassed, "Thumbnail composition failed."],
      [evidence.thumbnail.textPassed, "Thumbnail text constraints failed."],
      [evidence.thumbnail.identityConsistent, "Thumbnail identity is inconsistent."],
    ]),
    gate("audio", [
      [evidence.audio.streamValid, "Audio stream is invalid."],
      [evidence.audio.durationValid, "Audio duration is invalid."],
      [evidence.audio.pronunciationPassed, "Audio pronunciation failed."],
      [evidence.audio.continuityPassed, "Audio continuity failed."],
    ]),
    gate("captions", [
      [evidence.captions.valid, "Captions are invalid."],
      [evidence.captions.timingPassed, "Caption timing failed."],
    ]),
    gate("audiovisual", [
      [evidence.audiovisual.streamsValid, "Audiovisual streams are invalid."],
      [evidence.audiovisual.timingPassed, "Audiovisual timing failed."],
      [evidence.audiovisual.continuityPassed, "Audiovisual continuity failed."],
    ]),
    gate("metadata", [
      [evidence.metadata.titleValid, "Metadata title constraints failed."],
      [evidence.metadata.descriptionValid, "Metadata description constraints failed."],
      [evidence.metadata.policyPassed, "Metadata policy failed."],
    ]),
    gate("publish", [
      [evidence.publish.dryRunPassed, "Publish dry-run has not passed."],
      [approval?.decision === "approved", "Publish approval is missing."],
      [approval?.artifactHash === evidence.publish.artifactHash, "Publish approval is stale for the artifact hash."],
      [approval?.boundRevision === approval?.currentRevision, "Publish approval is stale for the workflow revision."],
      [!approval?.expiresAt || new Date(approval.expiresAt) > now, "Publish approval has expired."],
    ]),
  ];
}
