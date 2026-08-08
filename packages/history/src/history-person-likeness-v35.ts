import type { HistoryEntityMentionV34 } from "./history-v34-contracts.js";
import type { HistoryBeatV35, HistoryVisualModalityV35 } from "./history-v35-contracts.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import type { HistoryDiagnosticV34 } from "./history-v34-contracts.js";
import {
  type HistoricalLikenessPolicyV35,
  type HistoricalPersonReferenceAttachmentStatusV35,
  type HistoricalPersonReferenceSetV35,
  lookupHistoricalPersonReferenceSetByLabelV35,
  selectHistoricalReferenceImagesV35,
} from "./history-person-reference-v35.js";

const COMPILED_VISUAL_MODALITIES = new Set<HistoryVisualModalityV35>([
  "map",
  "diagram",
  "timeline",
  "date-card",
  "document",
  "quotation",
  "text-only transition",
]);

export interface HistoricalPersonLikenessDecisionV35 {
  readonly attachReferences: boolean;
  readonly likenessPolicy: HistoricalLikenessPolicyV35;
  readonly selectedReferenceAssetIds: readonly string[];
  readonly status: HistoricalPersonReferenceAttachmentStatusV35;
  readonly reason: string;
}

export interface HistoryShotPersonReferenceUsageV35 {
  readonly shotId: string;
  readonly beatId: string;
  readonly entityMentionId: string | null;
  readonly canonicalPersonId: string;
  readonly canonicalName: string;
  readonly likenessPolicy: HistoricalLikenessPolicyV35;
  readonly selectedReferenceAssetIds: readonly string[];
  readonly attachmentStatus: HistoricalPersonReferenceAttachmentStatusV35;
  readonly reason: string;
}

export interface HistoryHistoricalPersonReferenceReportV35 {
  readonly usages: readonly HistoryShotPersonReferenceUsageV35[];
  readonly resolvedPersonCount: number;
  readonly attachedReferenceCount: number;
}

function personTokens(label: string): readonly string[] {
  return label
    .split(/\s+/u)
    .map((token) => token.toLocaleLowerCase())
    .filter(Boolean);
}

function personIsVisuallyFocal(input: {
  readonly subject: string;
  readonly personLabel: string;
}): boolean {
  const subject = input.subject.toLocaleLowerCase();
  const tokens = personTokens(input.personLabel);
  return tokens.some((token) => token.length >= 3 && subject.includes(token));
}

export function deriveHistoricalPersonLikenessPolicyV35(input: {
  readonly modality: HistoryVisualModalityV35;
  readonly framing: string;
  readonly purpose: string;
  readonly subject: string;
  readonly personLabel: string;
  readonly narrationText: string;
}): HistoricalLikenessPolicyV35 {
  if (COMPILED_VISUAL_MODALITIES.has(input.modality)) {
    return "no-likeness";
  }

  const context = `${input.subject} ${input.framing} ${input.purpose} ${input.narrationText}`.toLocaleLowerCase();
  if (
    /\b(?:silhouette|back view|from behind|rear view|overhead map|diagram node|timeline card|crowd panorama)\b/u.test(
      context
    )
  ) {
    return "no-likeness";
  }

  if (!personIsVisuallyFocal(input)) {
    return "no-likeness";
  }

  if (
    /\b(?:battlefield|armies|Grande Armée|migration|fleet|encirclement|thousands of soldiers)\b/u.test(
      context
    ) &&
    !/\b(?:portrait|close(?:-|\s)?up|medium subject hold|facial)\b/u.test(
      `${input.framing} ${input.purpose}`
    )
  ) {
    return "generic-reconstruction";
  }

  if (
    /\b(?:wide establishing|establish\b)/u.test(`${input.framing} ${input.purpose}`) &&
    !/\b(?:portrait|close(?:-|\s)?up|medium subject hold)\b/u.test(
      `${input.framing} ${input.purpose}`
    )
  ) {
    return "generic-reconstruction";
  }

  if (
    /\b(?:portrait|close(?:-|\s)?up|medium subject hold|facial identity)\b/u.test(
      `${input.framing} ${input.purpose}`
    )
  ) {
    return "reference-required";
  }

  if (/\bmedium\b/u.test(input.framing)) {
    return "reference-preferred";
  }

  return "generic-reconstruction";
}

export function decideHistoricalPersonLikenessInclusionV35(input: {
  readonly likenessPolicy: HistoricalLikenessPolicyV35;
  readonly referenceSet: HistoricalPersonReferenceSetV35 | null;
}): HistoricalPersonLikenessDecisionV35 {
  const available = (input.referenceSet?.references.length ?? 0) > 0;
  const selectedReferenceAssetIds = available
    ? selectHistoricalReferenceImagesV35({
        referenceSet: input.referenceSet!,
      }).map((reference) => reference.assetFileId)
    : [];

  if (input.likenessPolicy === "no-likeness") {
    return {
      attachReferences: false,
      likenessPolicy: input.likenessPolicy,
      selectedReferenceAssetIds: [],
      status: "not-required",
      reason: "scene-does-not-require-likeness",
    };
  }

  if (input.likenessPolicy === "generic-reconstruction") {
    return {
      attachReferences: false,
      likenessPolicy: input.likenessPolicy,
      selectedReferenceAssetIds: [],
      status: "not-required",
      reason: "generic-reconstruction-without-identity-fidelity",
    };
  }

  if (!available) {
    return {
      attachReferences: false,
      likenessPolicy: input.likenessPolicy,
      selectedReferenceAssetIds: [],
      status: "not-available",
      reason: "no-curated-references-in-registry",
    };
  }

  return {
    attachReferences: true,
    likenessPolicy: input.likenessPolicy,
    selectedReferenceAssetIds,
    status: "attached",
    reason:
      input.likenessPolicy === "reference-required"
        ? "face-relevant-shot-with-curated-references"
        : "preferred-likeness-with-curated-references",
  };
}

function personEntitiesForShot(input: {
  readonly shot: HistoryShotV34;
  readonly entities: readonly HistoryEntityMentionV34[];
}): HistoryEntityMentionV34[] {
  const claimIds = new Set(input.shot.linkedClaimIds);
  return input.entities.filter(
    (entity) => entity.entityType === "person" && claimIds.has(entity.claimId)
  );
}

export function buildHistoricalPersonReferenceReportV35(input: {
  readonly beats: readonly HistoryBeatV35[];
  readonly shots: readonly HistoryShotV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly narrationText: string;
}): HistoryHistoricalPersonReferenceReportV35 {
  const beatById = new Map(input.beats.map((beat) => [beat.id, beat] as const));
  const usages: HistoryShotPersonReferenceUsageV35[] = [];
  const resolvedPersonIds = new Set<string>();

  for (const shot of input.shots) {
    const beat = beatById.get(shot.beatId);
    if (!beat) continue;
    const persons = personEntitiesForShot({ shot, entities: input.entities });
    if (persons.length === 0) continue;

    for (const person of persons) {
      const referenceSet = lookupHistoricalPersonReferenceSetByLabelV35(
        person.normalizedLabel
      );
      if (!referenceSet) continue;
      resolvedPersonIds.add(referenceSet.canonicalPersonId);
      const likenessPolicy = deriveHistoricalPersonLikenessPolicyV35({
        modality: beat.modality,
        framing: shot.framing,
        purpose: shot.purpose,
        subject: shot.subject,
        personLabel: person.normalizedLabel,
        narrationText: input.narrationText,
      });
      const decision = decideHistoricalPersonLikenessInclusionV35({
        likenessPolicy,
        referenceSet,
      });
      usages.push({
        shotId: shot.id,
        beatId: shot.beatId,
        entityMentionId: person.id,
        canonicalPersonId: referenceSet.canonicalPersonId,
        canonicalName: referenceSet.canonicalName,
        likenessPolicy,
        selectedReferenceAssetIds: decision.attachReferences
          ? decision.selectedReferenceAssetIds
          : [],
        attachmentStatus: decision.status,
        reason: decision.reason,
      });
    }
  }

  return {
    usages,
    resolvedPersonCount: resolvedPersonIds.size,
    attachedReferenceCount: usages.filter(
      (usage) => usage.attachmentStatus === "attached"
    ).length,
  };
}

export function historicalPersonReferenceValidationDiagnosticsV35(
  report: HistoryHistoricalPersonReferenceReportV35
): HistoryDiagnosticV34[] {
  const diagnostics: HistoryDiagnosticV34[] = [];
  for (const usage of report.usages) {
    const referenceSet = lookupHistoricalPersonReferenceSetByLabelV35(
      usage.canonicalName
    );
    if (
      usage.likenessPolicy === "reference-required" &&
      referenceSet &&
      referenceSet.references.length > 0 &&
      usage.attachmentStatus !== "attached"
    ) {
      diagnostics.push({
        code: "HISTORICAL_PERSON_REFERENCE_MISSING",
        gate: "content",
        message: `Face-relevant shot requires curated references for ${usage.canonicalName} but none were attached.`,
        affectedIds: [usage.shotId, usage.canonicalPersonId],
        severity: "error",
        remediation:
          "Attach curated historical-person references for face-relevant shots or adjust likeness policy.",
      });
    }
  }
  return diagnostics;
}

export function summarizeHistoricalPersonReferenceReportV35(
  report: HistoryHistoricalPersonReferenceReportV35
): string[] {
  if (report.usages.length === 0) {
    return ["No curated historical-person references were resolved for this plan."];
  }
  return report.usages.map((usage) => {
    const assets =
      usage.selectedReferenceAssetIds.length > 0
        ? usage.selectedReferenceAssetIds.join(", ")
        : "none";
    return [
      `- ${usage.shotId}: ${usage.canonicalName}`,
      `  policy: ${usage.likenessPolicy}; status: ${usage.attachmentStatus}`,
      `  references: ${assets}`,
      `  reason: ${usage.reason}`,
    ].join("\n");
  });
}
