import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  normalizeEpisodeId,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  buildHistoryEditorialPlanV31,
  type EditorialBeatInput,
  type EditorialDiagnostic,
  type EditorialRole,
  type HistoryEditorialPlanV31,
} from "./history-editorial-v31.js";
import {
  lintHistoryVisualPlanV31,
  HISTORY_SEMANTIC_VALIDATOR_V31,
  type HistoryArtifactLintV31,
} from "./history-artifact-lint-v31.js";
import {
  planHistoryGeoV31,
  type HistoryGeoV31Plan,
} from "./history-geo-v31.js";
import {
  extractHistorySemanticsV31,
  HISTORY_SEMANTIC_V31,
  type HistoryClaimV31,
  type HistorySemanticEntityV31,
  type HistorySemanticExtractionV31,
} from "./history-semantic-v31.js";
import {
  extractHistoryNarrationUnits,
  type NarrationUnit,
} from "./visual-planner-v2.js";

export const HISTORY_VISUAL_SCHEMA_V31 = "history-visual-plan.v3.1" as const;
export const HISTORY_VISUAL_PLANNER_V31 =
  "history-visual-planner.v3.1.0" as const;
export const HISTORY_REJECTED_ENTITY_POLICY_V31 =
  "history-rejected-entity-policy.v3.1.0" as const;

export interface HistoryV31Diagnostic {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly remediation: string;
  readonly affectedIds: readonly string[];
}

export interface HistoryChapterV31 {
  readonly id: string;
  readonly title: string;
  readonly startMs: number;
  readonly provisional: boolean;
  readonly beatIds: readonly string[];
}

export interface HistorySourceReferenceV31 {
  readonly id: string;
  readonly title: string;
  readonly status: "candidate-source-found" | "resolved";
}

export interface HistoryAssetIntentV31 {
  readonly id: string;
  readonly beatId: string;
  readonly mediaType: HistoryEditorialPlanV31["mediaDecisions"][number]["selectedMediaType"];
  readonly claimIds: readonly string[];
  readonly evidenceAvailability: HistoryEditorialPlanV31["mediaDecisions"][number]["evidenceAvailability"];
  readonly reuseOpportunity: HistoryEditorialPlanV31["mediaDecisions"][number]["reuseOpportunity"];
  readonly illustrativeReconstruction: boolean;
}

export interface HistoryVisualPlanV31 {
  readonly schemaVersion: typeof HISTORY_VISUAL_SCHEMA_V31;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V31;
  readonly episodeId: string;
  readonly narration: {
    readonly normalizedText: string;
    readonly revision: string;
    readonly units: readonly NarrationUnit[];
  };
  readonly timing: {
    readonly requestedTargetDurationMs?: number;
    readonly plannedNarrationDurationMs: number;
    readonly estimatedNarrationDurationMs: number;
    readonly timingSource: "estimated-sentence";
    readonly durationDeltaMs: number;
    readonly provisional: true;
  };
  readonly sourceReferences: readonly HistorySourceReferenceV31[];
  readonly entities: readonly HistorySemanticEntityV31[];
  readonly rejectedEntityCandidates: HistorySemanticExtractionV31["rejectedCandidates"];
  readonly uncertainEntityCandidates: HistorySemanticExtractionV31["uncertainCandidates"];
  readonly claims: readonly HistoryClaimV31[];
  readonly chapters: readonly HistoryChapterV31[];
  readonly beats: HistoryEditorialPlanV31["beats"];
  readonly shots: HistoryEditorialPlanV31["shots"];
  readonly assetIntents: readonly HistoryAssetIntentV31[];
  readonly mediaDecisions: HistoryEditorialPlanV31["mediaDecisions"];
  readonly mapMasters: HistoryGeoV31Plan["mapMasters"];
  readonly mapStates: HistoryGeoV31Plan["mapStates"];
  readonly diagramMasters: HistoryGeoV31Plan["diagramMasters"];
  readonly diagramStates: HistoryGeoV31Plan["diagramStates"];
  readonly diagnostics: readonly HistoryV31Diagnostic[];
  readonly semanticDiagnostics: {
    readonly invalidEntityReasons: HistorySemanticExtractionV31["diagnostics"]["invalidEntityReasons"];
    readonly entityNormalisationEvents: HistorySemanticExtractionV31["diagnostics"]["entityNormalisationEvents"];
    readonly entityTypeCorrections: HistorySemanticExtractionV31["diagnostics"]["entityTypeCorrections"];
    readonly editorial: readonly EditorialDiagnostic[];
    readonly geographic: HistoryGeoV31Plan["diagnostics"];
  };
  readonly config: {
    readonly historyProfileVersion: "history-production-budget.v1";
    readonly requiredRatios: readonly ["16:9", "9:16"];
    readonly rejectedEntityPolicyVersion: typeof HISTORY_REJECTED_ENTITY_POLICY_V31;
    readonly semanticValidatorVersion: typeof HISTORY_SEMANTIC_VALIDATOR_V31;
    readonly semanticExtractorVersion: typeof HISTORY_SEMANTIC_V31;
    readonly genericPurposeThreshold: 0.1;
    readonly narrationWordsPerMinute: 108;
  };
  readonly planHash: string;
}

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const historyVisualPlanV31Shape = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_SCHEMA_V31),
    plannerVersion: z.literal(HISTORY_VISUAL_PLANNER_V31),
    episodeId: z.string().min(1),
    narration: z.object({
      normalizedText: z.string().min(1),
      revision: hashSchema,
      units: z.array(z.unknown()).min(1),
    }),
    timing: z.object({
      requestedTargetDurationMs: z.number().positive().optional(),
      plannedNarrationDurationMs: z.number().int().positive(),
      estimatedNarrationDurationMs: z.number().int().positive(),
      timingSource: z.literal("estimated-sentence"),
      durationDeltaMs: z.number().int(),
      provisional: z.literal(true),
    }),
    sourceReferences: z.array(z.unknown()),
    entities: z.array(z.unknown()),
    rejectedEntityCandidates: z.array(z.unknown()),
    uncertainEntityCandidates: z.array(z.unknown()),
    claims: z.array(z.unknown()),
    chapters: z.array(z.unknown()),
    beats: z.array(z.unknown()).min(1),
    shots: z.array(z.unknown()).min(1),
    assetIntents: z.array(z.unknown()).min(1),
    mediaDecisions: z.array(z.unknown()).min(1),
    mapMasters: z.array(z.unknown()),
    mapStates: z.array(z.unknown()),
    diagramMasters: z.array(z.unknown()),
    diagramStates: z.array(z.unknown()),
    diagnostics: z.array(z.unknown()),
    semanticDiagnostics: z.object({
      invalidEntityReasons: z.array(z.unknown()),
      entityNormalisationEvents: z.array(z.unknown()),
      entityTypeCorrections: z.array(z.unknown()),
      editorial: z.array(z.unknown()),
      geographic: z.array(z.unknown()),
    }),
    config: z.object({
      historyProfileVersion: z.literal("history-production-budget.v1"),
      requiredRatios: z.tuple([z.literal("16:9"), z.literal("9:16")]),
      rejectedEntityPolicyVersion: z.literal(
        HISTORY_REJECTED_ENTITY_POLICY_V31
      ),
      semanticValidatorVersion: z.literal(HISTORY_SEMANTIC_VALIDATOR_V31),
      semanticExtractorVersion: z.literal(HISTORY_SEMANTIC_V31),
      genericPurposeThreshold: z.literal(0.1),
      narrationWordsPerMinute: z.literal(108),
    }),
    planHash: hashSchema,
  })
  .strict();

export const historyVisualPlanV31Schema = z.custom<HistoryVisualPlanV31>(
  (value) => historyVisualPlanV31Shape.safeParse(value).success,
  "Invalid History visual plan v3.1"
);

export interface HistoryVisualValidationV31 {
  readonly reviewable: boolean;
  readonly approvalEligible: boolean;
  readonly diagnostics: readonly HistoryV31Diagnostic[];
  readonly counts: {
    readonly narrationUnits: number;
    readonly semanticBeats: number;
    readonly editorialShots: number;
    readonly uniqueAssetIntents: number;
    readonly sourceAssets: number;
    readonly mapMasters: number;
    readonly mapStates: number;
    readonly typedRoutes: number;
    readonly diagramMasters: number;
    readonly diagramStates: number;
    readonly renderVariants: number;
    readonly reuseRatio: number;
  };
  readonly artifactLint: HistoryArtifactLintV31;
  readonly diagnosticsArtifact: Record<string, unknown>;
}

const clean = (text: string): string =>
  text.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  return value;
};
const digest = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
const unitText = (narration: string, unit: NarrationUnit): string =>
  narration.slice(unit.start, unit.end).trim();
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

function groupNarrationUnits(
  narration: string,
  units: readonly NarrationUnit[]
): EditorialBeatInput[] {
  const result: EditorialBeatInput[] = [];
  for (let index = 0; index < units.length; ) {
    const current = units[index]!;
    const next = units[index + 1];
    const currentText = unitText(narration, current);
    const combine =
      Boolean(next) &&
      (current.wordCount < 16 ||
        /^(?:But|And|Instead|Yet|So|This|That|These|Those)\b/iu.test(
          next ? unitText(narration, next) : ""
        ));
    const narrationUnitIds = combine ? [current.id, next!.id] : [current.id];
    const text = narrationUnitIds
      .map((id) => unitText(narration, units.find((unit) => unit.id === id)!))
      .join(" ");
    const editorialRole: EditorialRole =
      index === 0
        ? "hook"
        : index + narrationUnitIds.length === units.length
          ? "conclusion"
          : /\b(?:because|therefore|supply|logistics|tax|revenue|trade|labou?r|mortality)\b/iu.test(
                text
              )
            ? "cause"
            : /\b(?:but|however|instead|rather than|not simply|yet)\b/iu.test(
                  text
                )
              ? "contrast"
              : /\b(?:battle|crossed|captured|sacked|retreat|assassinated|plague|collapse)\b/iu.test(
                    text
                  )
                ? "turning-point"
                : /\b(?:law|statute|account|record|DNA|evidence)\b/iu.test(text)
                  ? "evidence"
                  : "context";
    result.push({
      id: `beat-${String(result.length + 1).padStart(3, "0")}`,
      narrationUnitIds,
      editorialRole,
      importance:
        editorialRole === "hook" ||
        editorialRole === "conclusion" ||
        editorialRole === "turning-point"
          ? 5
          : editorialRole === "cause" || editorialRole === "contrast"
            ? 4
            : 3,
    });
    index += narrationUnitIds.length;
  }
  return result;
}

function retimeShots(
  shots: HistoryEditorialPlanV31["shots"],
  beats: HistoryEditorialPlanV31["beats"],
  units: readonly NarrationUnit[],
  totalDurationMs: number
): HistoryEditorialPlanV31["shots"] {
  const totalWords = units.reduce((sum, unit) => sum + unit.wordCount, 0);
  let cursor = 0;
  return beats.flatMap((beat) => {
    const beatShots = shots.filter((shot) => shot.beatId === beat.id);
    const words = beat.coveredNarrationUnitIds.reduce(
      (sum, id) => sum + (units.find((unit) => unit.id === id)?.wordCount ?? 0),
      0
    );
    const duration = Math.max(
      1,
      beat.id === beats.at(-1)?.id
        ? totalDurationMs - cursor
        : Math.round((totalDurationMs * words) / Math.max(1, totalWords))
    );
    const result = beatShots.map((shot, index) => ({
      ...shot,
      startMs: cursor + Math.floor((duration * index) / beatShots.length),
      endMs: cursor + Math.floor((duration * (index + 1)) / beatShots.length),
    }));
    cursor += duration;
    return result;
  });
}

function buildChapters(
  editorial: readonly {
    readonly title?: string;
    readonly timestampSeconds?: number;
    readonly provisional?: boolean;
  }[],
  beats: HistoryEditorialPlanV31["beats"],
  shots: HistoryEditorialPlanV31["shots"]
): HistoryChapterV31[] {
  const items = editorial.length
    ? editorial
    : [{ title: "Complete narration", timestampSeconds: 0, provisional: true }];
  return items.map((chapter, index) => {
    const startMs = Math.round((chapter.timestampSeconds ?? 0) * 1000);
    const endMs =
      index + 1 < items.length
        ? Math.round((items[index + 1]!.timestampSeconds ?? 0) * 1000)
        : Number.POSITIVE_INFINITY;
    return {
      id: `chapter-${String(index + 1).padStart(2, "0")}`,
      title: chapter.title ?? `Chapter ${index + 1}`,
      startMs,
      provisional: chapter.provisional ?? true,
      beatIds: unique(
        shots
          .filter((shot) => shot.startMs >= startMs && shot.startMs < endMs)
          .map((shot) => shot.beatId)
      ).filter((id) => beats.some((beat) => beat.id === id)),
    };
  });
}

export function buildHistoryVisualPlanV31(input: {
  readonly episodeId: string;
  readonly narration: string;
  readonly targetDurationMs?: number;
  readonly sourceReferences?: readonly HistorySourceReferenceV31[];
  readonly chapters?: readonly {
    readonly title?: string;
    readonly timestampSeconds?: number;
    readonly provisional?: boolean;
  }[];
}): HistoryVisualPlanV31 {
  const narration = clean(input.narration);
  const units = [...extractHistoryNarrationUnits(narration)];
  const narrationRevision = digest(narration);
  const estimatedNarrationDurationMs = Math.round(
    (units.reduce((sum, unit) => sum + unit.wordCount, 0) / 108) * 60_000
  );
  const semantics = extractHistorySemanticsV31(narration, units);
  const groupedBeats = groupNarrationUnits(narration, units).map((beat) => ({
    ...beat,
    claimIds: semantics.claims
      .filter((claim) =>
        claim.unitIds.some((id) => beat.narrationUnitIds.includes(id))
      )
      .map((claim) => claim.id),
  }));
  const editorial = buildHistoryEditorialPlanV31({
    narrationUnits: units.map((unit) => ({
      id: unit.id,
      text: unitText(narration, unit),
    })),
    entities: semantics.entities.map((entity) => ({
      id: entity.id,
      name: entity.canonicalName,
      type: entity.type,
      narrationUnitIds: entity.sourceUnitIds,
      confidence: entity.confidence,
    })),
    claims: semantics.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      kind: claim.kind,
      narrationUnitIds: claim.unitIds,
      sourceStatus:
        claim.sourceStatus === "resolved" ? "resolved" : "unresolved",
      sourceReferenceIds: claim.sourceReferenceIds,
      confidence: claim.confidence,
    })),
    beats: groupedBeats,
    researchAssetTypes: ["archival-art", "historical-map", "document"],
    productionCostPreference: "balanced",
  });
  const shots = retimeShots(
    editorial.shots,
    editorial.beats,
    units,
    estimatedNarrationDurationMs
  );
  const geo = planHistoryGeoV31({
    narration,
    entities: semantics.entities.map((entity) => ({
      id: entity.id,
      canonicalName: entity.canonicalName,
      type:
        entity.type === "date" || entity.type === "period"
          ? "date-or-period"
          : (entity.type as
              | "place"
              | "person"
              | "state-or-polity"
              | "army-or-formation"
              | "organisation"
              | "event"
              | "other"),
      sourceUnitIds: entity.sourceUnitIds,
    })),
    claims: semantics.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      unitIds: claim.unitIds,
    })),
  });
  const durationDeltaMs = input.targetDurationMs
    ? estimatedNarrationDurationMs - input.targetDurationMs
    : 0;
  const diagnostics: HistoryV31Diagnostic[] = [
    {
      code: "TIMING_ESTIMATE_FALLBACK",
      severity: "warning",
      message:
        "No revision-compatible immutable measured audio is attached; timing is provisional.",
      remediation: "Reconcile measured audio before production approval.",
      affectedIds: [],
    },
  ];
  if (
    input.targetDurationMs &&
    Math.abs(durationDeltaMs) > Math.max(1000, input.targetDurationMs * 0.01)
  )
    diagnostics.push({
      code: "NARRATION_DURATION_CONFLICT",
      severity: "error",
      message: `Complete narration differs from target by ${durationDeltaMs}ms.`,
      remediation: "Revise the target or narration; never clip narration.",
      affectedIds: [],
    });
  if (units.at(-1)?.kind === "incomplete")
    diagnostics.push({
      code: "NARRATION_FINAL_BOUNDARY_INVALID",
      severity: "error",
      message: "The final narration unit lacks a complete semantic boundary.",
      remediation: "Complete canonical narration before approval.",
      affectedIds: [units.at(-1)!.id],
    });
  if (
    semantics.claims.length > 0 &&
    semantics.claims.every((claim) => claim.sourceStatus === "unresolved")
  )
    diagnostics.push({
      code: "CLAIM_PROVENANCE_UNRESOLVED",
      severity: "warning",
      message:
        "All extracted claims remain linked only to narration evidence, not resolved external sources.",
      remediation:
        "Resolve claim-level sources during human historical review before production approval.",
      affectedIds: semantics.claims.map((claim) => claim.id),
    });
  for (const item of [...editorial.diagnostics, ...geo.diagnostics])
    diagnostics.push({
      code: item.code,
      severity: item.severity,
      message: item.message,
      remediation: "Review the affected semantic planning records.",
      affectedIds: [...item.affectedIds],
    });

  const body = {
    schemaVersion: HISTORY_VISUAL_SCHEMA_V31,
    plannerVersion: HISTORY_VISUAL_PLANNER_V31,
    episodeId: normalizeEpisodeId(input.episodeId),
    narration: {
      normalizedText: narration,
      revision: narrationRevision,
      units,
    },
    timing: {
      ...(input.targetDurationMs
        ? { requestedTargetDurationMs: input.targetDurationMs }
        : {}),
      plannedNarrationDurationMs: estimatedNarrationDurationMs,
      estimatedNarrationDurationMs,
      timingSource: "estimated-sentence" as const,
      durationDeltaMs,
      provisional: true as const,
    },
    sourceReferences: input.sourceReferences ?? [],
    entities: semantics.entities,
    rejectedEntityCandidates: semantics.rejectedCandidates,
    uncertainEntityCandidates: semantics.uncertainCandidates,
    claims: semantics.claims,
    chapters: buildChapters(input.chapters ?? [], editorial.beats, shots),
    beats: editorial.beats,
    shots,
    assetIntents: editorial.mediaDecisions.map((decision) => ({
      id: decision.id,
      beatId: decision.beatId,
      mediaType: decision.selectedMediaType,
      claimIds:
        editorial.beats.find((beat) => beat.id === decision.beatId)?.claimIds ??
        [],
      evidenceAvailability: decision.evidenceAvailability,
      reuseOpportunity: decision.reuseOpportunity,
      illustrativeReconstruction: decision.illustrativeReconstruction,
    })),
    mediaDecisions: editorial.mediaDecisions,
    mapMasters: geo.mapMasters,
    mapStates: geo.mapStates,
    diagramMasters: geo.diagramMasters,
    diagramStates: geo.diagramStates,
    diagnostics,
    semanticDiagnostics: {
      ...semantics.diagnostics,
      editorial: editorial.diagnostics,
      geographic: geo.diagnostics,
    },
    config: {
      historyProfileVersion: "history-production-budget.v1" as const,
      requiredRatios: ["16:9", "9:16"] as const,
      rejectedEntityPolicyVersion: HISTORY_REJECTED_ENTITY_POLICY_V31,
      semanticValidatorVersion: HISTORY_SEMANTIC_VALIDATOR_V31,
      semanticExtractorVersion: HISTORY_SEMANTIC_V31,
      genericPurposeThreshold: 0.1 as const,
      narrationWordsPerMinute: 108 as const,
    },
  };
  return historyVisualPlanV31Schema.parse({ ...body, planHash: digest(body) });
}

const diagnostic = (
  code: string,
  message: string,
  affectedIds: readonly string[] = []
): HistoryV31Diagnostic => ({
  code,
  severity: "error",
  message,
  remediation: "Regenerate the V3.1 plan from canonical inputs.",
  affectedIds,
});

export function validateHistoryVisualPlanV31(
  plan: HistoryVisualPlanV31
): HistoryVisualValidationV31 {
  historyVisualPlanV31Schema.parse(plan);
  const diagnostics = [...plan.diagnostics];
  const unitIds = new Set(plan.narration.units.map((unit) => unit.id));
  const beatIds = new Set(plan.beats.map((beat) => beat.id));
  const claimIds = new Set(plan.claims.map((claim) => claim.id));
  const entityIds = new Set(plan.entities.map((entity) => entity.id));
  const mediaIds = new Set(plan.assetIntents.map((item) => item.id));
  if (
    plan.narration.units[0]?.start !== 0 ||
    plan.narration.units.at(-1)?.end !== plan.narration.normalizedText.length ||
    plan.narration.units.some(
      (unit, index) =>
        index > 0 && plan.narration.units[index - 1]!.end !== unit.start
    )
  )
    diagnostics.push(
      diagnostic("NARRATION_RANGE_COVERAGE", "Narration ranges are not exact.")
    );
  const coveredUnits = plan.beats.flatMap((beat) =>
    beat.coveredNarrationUnitIds.map((id) => `${beat.id}:${id}`)
  );
  const coverageCounts = new Map<string, number>();
  for (const value of coveredUnits) {
    const id = value.slice(value.indexOf(":") + 1);
    coverageCounts.set(id, (coverageCounts.get(id) ?? 0) + 1);
  }
  const uncovered = [...unitIds].filter((id) => !coverageCounts.has(id));
  const duplicated = [...coverageCounts]
    .filter(([, count]) => count !== 1)
    .map(([id]) => id);
  if (uncovered.length || duplicated.length)
    diagnostics.push(
      diagnostic(
        "NARRATION_UNIT_COVERAGE",
        "Every narration unit must be covered exactly once by semantic beats.",
        [...uncovered, ...duplicated]
      )
    );
  const invalidEntityUnitLinks = plan.entities.flatMap((entity) =>
    entity.sourceUnitIds
      .filter((id) => !unitIds.has(id))
      .map((id) => `${entity.id}:${id}`)
  );
  if (invalidEntityUnitLinks.length)
    diagnostics.push(
      diagnostic(
        "ENTITY_UNIT_REFERENCE_INVALID",
        "Accepted entities reference missing narration units.",
        invalidEntityUnitLinks
      )
    );
  const invalidClaimLinks = [
    ...plan.beats.flatMap((beat) =>
      beat.claimIds.filter((id) => !claimIds.has(id)).map((id) => beat.id)
    ),
    ...plan.mapStates.flatMap((state) =>
      state.claimIds.filter((id) => !claimIds.has(id)).map(() => state.id)
    ),
    ...plan.diagramStates.flatMap((state) =>
      state.claimIds.filter((id) => !claimIds.has(id)).map(() => state.id)
    ),
  ];
  if (invalidClaimLinks.length)
    diagnostics.push(
      diagnostic(
        "CLAIM_REFERENCE_INVALID",
        "Semantic records reference missing claims.",
        invalidClaimLinks
      )
    );
  const invalidShots = plan.shots.filter(
    (shot) =>
      !beatIds.has(shot.beatId) ||
      !mediaIds.has(shot.assetIntentId) ||
      shot.startMs < 0 ||
      shot.endMs <= shot.startMs
  );
  if (invalidShots.length)
    diagnostics.push(
      diagnostic(
        "SHOT_REFERENCE_INVALID",
        "Shots require existing beats/assets and positive timing.",
        invalidShots.map((shot) => shot.id)
      )
    );
  const orderedShots = [...plan.shots].sort(
    (left, right) => left.startMs - right.startMs
  );
  if (
    orderedShots.some(
      (shot, index) =>
        index > 0 && orderedShots[index - 1]!.endMs > shot.startMs
    )
  )
    diagnostics.push(
      diagnostic("SHOT_TIMING_OVERLAP", "Editorial shot timings overlap.")
    );
  const invalidMapEntityLinks = plan.mapStates.flatMap((state) =>
    [...state.locationEntityIds, ...state.actorEntityIds]
      .filter((id) => !entityIds.has(id))
      .map((id) => `${state.id}:${id}`)
  );
  if (invalidMapEntityLinks.length)
    diagnostics.push(
      diagnostic(
        "MAP_ENTITY_REFERENCE_INVALID",
        "Map states reference missing accepted entities.",
        invalidMapEntityLinks
      )
    );

  const artifactLint = lintHistoryVisualPlanV31(plan);
  if (!artifactLint.valid)
    diagnostics.push({
      code: "SEMANTIC_ARTIFACT_LINT_FAILED",
      severity: "error",
      message: artifactLint.errors.join(" "),
      remediation: "Resolve semantic lint errors before packaging or approval.",
      affectedIds: [],
    });
  const counts = {
    narrationUnits: plan.narration.units.length,
    semanticBeats: plan.beats.length,
    editorialShots: plan.shots.length,
    uniqueAssetIntents: plan.assetIntents.length,
    sourceAssets: plan.sourceReferences.length,
    mapMasters: plan.mapMasters.length,
    mapStates: plan.mapStates.length,
    typedRoutes: plan.mapStates.reduce(
      (sum, state) => sum + state.routes.length,
      0
    ),
    diagramMasters: plan.diagramMasters.length,
    diagramStates: plan.diagramStates.length,
    renderVariants: plan.shots.length * plan.config.requiredRatios.length,
    reuseRatio: plan.shots.length
      ? Number((1 - plan.assetIntents.length / plan.shots.length).toFixed(3))
      : 0,
  };
  const errorDiagnostics = diagnostics.filter(
    (item) => item.severity === "error"
  );
  const reviewable = !errorDiagnostics.some((item) =>
    [
      "NARRATION_RANGE_COVERAGE",
      "NARRATION_UNIT_COVERAGE",
      "ENTITY_UNIT_REFERENCE_INVALID",
      "CLAIM_REFERENCE_INVALID",
      "SHOT_REFERENCE_INVALID",
      "SHOT_TIMING_OVERLAP",
      "MAP_ENTITY_REFERENCE_INVALID",
    ].includes(item.code)
  );
  const approvalEligible =
    reviewable &&
    !plan.timing.provisional &&
    errorDiagnostics.length === 0 &&
    artifactLint.valid;
  const claimKinds = Object.fromEntries(
    [...new Set(plan.claims.map((claim) => claim.kind))]
      .sort()
      .map((kind) => [
        kind,
        plan.claims.filter((claim) => claim.kind === kind).length,
      ])
  );
  const claimStatuses = Object.fromEntries(
    [...new Set(plan.claims.map((claim) => claim.sourceStatus))]
      .sort()
      .map((status) => [
        status,
        plan.claims.filter((claim) => claim.sourceStatus === status).length,
      ])
  );
  return {
    reviewable,
    approvalEligible,
    diagnostics,
    counts,
    artifactLint,
    diagnosticsArtifact: {
      schemaVersion: plan.schemaVersion,
      plannerVersion: plan.plannerVersion,
      semanticValidatorVersion: plan.config.semanticValidatorVersion,
      planHash: plan.planHash,
      narrationRevision: plan.narration.revision,
      timingSource: plan.timing.timingSource,
      requestedTargetDurationMs: plan.timing.requestedTargetDurationMs,
      plannedDurationMs: plan.timing.plannedNarrationDurationMs,
      durationDeltaMs: plan.timing.durationDeltaMs,
      uncoveredNarrationUnitIds: uncovered,
      duplicatedNarrationUnitIds: duplicated,
      rejectedEntityCandidates: plan.rejectedEntityCandidates.length,
      invalidEntityReasons: plan.semanticDiagnostics.invalidEntityReasons,
      entityNormalisationEvents:
        plan.semanticDiagnostics.entityNormalisationEvents,
      entityTypeCorrections: plan.semanticDiagnostics.entityTypeCorrections,
      purposeTemplateFrequency: plan.semanticDiagnostics.editorial.filter(
        (item) => item.code === "purposeTemplateFrequency"
      ),
      purposeSimilarityClusters: plan.semanticDiagnostics.editorial.filter(
        (item) => item.code === "purposeSimilarityCluster"
      ),
      purposeNarrationOverlap: plan.beats.map((beat) => ({
        beatId: beat.id,
        overlap: beat.narrationOverlap,
      })),
      genericPurposeBeatIds: plan.semanticDiagnostics.editorial
        .filter((item) =>
          ["genericPurposeTemplate", "narrationPurposeOverlap"].includes(
            item.code
          )
        )
        .flatMap((item) => item.affectedIds),
      claimKinds,
      claimStatuses,
      unsourcedClaimCount: plan.claims.filter(
        (claim) => claim.sourceStatus === "unresolved"
      ).length,
      ...counts,
      artifactLint,
      validationErrors: errorDiagnostics,
      validationWarnings: diagnostics.filter(
        (item) => item.severity === "warning"
      ),
      reviewable,
      approvalEligible,
      fallbacksUsed: ["estimated-sentence"],
    },
  };
}

const md = (value: string): string => value.replaceAll("|", "\\|");
const distribution = (items: readonly string[]): string =>
  [...new Set(items)]
    .sort()
    .map((item) => `${item}: ${items.filter((value) => value === item).length}`)
    .join(", ") || "none";

export function renderHistoryVisualApprovalPackV31(
  plan: HistoryVisualPlanV31,
  validation = validateHistoryVisualPlanV31(plan)
): string {
  const errors = validation.diagnostics.filter(
    (item) => item.severity === "error"
  );
  const warnings = validation.diagnostics.filter(
    (item) => item.severity === "warning"
  );
  const anchorBeats = plan.beats.filter((beat) => beat.importance >= 4);
  const mediaProfile = distribution(
    plan.mediaDecisions.map((item) => item.selectedMediaType)
  );
  const claimsByKind = distribution(plan.claims.map((claim) => claim.kind));
  const claimsByStatus = distribution(
    plan.claims.map((claim) => claim.sourceStatus)
  );
  const ratioSummary = unique(
    plan.mediaDecisions.flatMap((item) =>
      item.adaptations.map(
        (adaptation) =>
          `${item.selectedMediaType} ${adaptation.ratio}: ${adaptation.strategy}`
      )
    )
  );
  const commandLines = [
    `\`mediaforge history visuals plan ${plan.episodeId} --planner-version v3.1 --force\``,
    `\`mediaforge history visuals review-bundle ${plan.episodeId} --planner-version v3.1 --output artifacts/chatgpt-review --regenerate\``,
  ];
  if (validation.approvalEligible)
    commandLines.push(
      `\`mediaforge history visuals approve ${plan.episodeId} --planner-version v3.1 --plan-hash ${plan.planHash}\``
    );
  else
    commandLines.push(
      "Production approval is unavailable while blocking errors or provisional timing remain."
    );
  return `# History visual approval pack (V3.1)

## 1. Episode identity

- Episode: ${plan.episodeId}
- Narration revision: \`${plan.narration.revision}\`
- Schema / planner: ${plan.schemaVersion} / ${plan.plannerVersion}
- Plan hash: \`${plan.planHash}\`
- Reviewable: ${validation.reviewable ? "yes" : "no"}
- Production approval eligible: ${validation.approvalEligible ? "yes" : "no"}

## 2. Blocking errors and warnings

Blocking: ${errors.map((item) => item.code).join(", ") || "none"}

Warnings: ${warnings.map((item) => item.code).join(", ") || "none"}

## 3. Timing and narration coverage

- Timing: ${plan.timing.timingSource}; planned ${plan.timing.plannedNarrationDurationMs}ms; target ${plan.timing.requestedTargetDurationMs ?? "not declared"}ms; delta ${plan.timing.durationDeltaMs}ms.
- Coverage: ${validation.counts.narrationUnits} narration units, each assigned once to ${validation.counts.semanticBeats} beats.

## 4. Chapter overview

| Chapter | Start | Beats |
| --- | ---: | ---: |
${plan.chapters.map((chapter) => `| ${md(chapter.title)} | ${chapter.startMs}ms | ${chapter.beatIds.length} |`).join("\n")}

## 5. Anchor sequences

| Beat | Role | Purpose | Shots |
| --- | --- | --- | ---: |
${anchorBeats.map((beat) => `| ${beat.id} | ${beat.editorialRole} | ${md(beat.visualPurpose)} | ${plan.shots.filter((shot) => shot.beatId === beat.id).length} |`).join("\n")}

## 6. Count semantics

- Narration units ${validation.counts.narrationUnits}; semantic beats ${validation.counts.semanticBeats}; editorial shots ${validation.counts.editorialShots}; unique asset intents ${validation.counts.uniqueAssetIntents}; render variants ${validation.counts.renderVariants}.
- Map masters/states/routes ${validation.counts.mapMasters}/${validation.counts.mapStates}/${validation.counts.typedRoutes}; diagram masters/states ${validation.counts.diagramMasters}/${validation.counts.diagramStates}.

## 7. Semantic beat summary

| Beat | Role | Importance | Viewer understanding | Visual purpose | Claims |
| --- | --- | ---: | --- | --- | ---: |
${plan.beats.map((beat) => `| ${beat.id} | ${beat.editorialRole} | ${beat.importance} | ${md(beat.viewerUnderstanding)} | ${md(beat.visualPurpose)} | ${beat.claimIds.length} |`).join("\n")}

## 8. Shot-sequence summary

| Sequence | Shot | Function | Asset | Composition |
| --- | --- | --- | --- | --- |
${plan.shots
  .filter((shot) => anchorBeats.some((beat) => beat.id === shot.beatId))
  .map(
    (shot) =>
      `| ${shot.sequenceId} | ${shot.id} | ${shot.editorialFunction} | ${shot.assetIntentId} | ${md(shot.compositionIntent)} |`
  )
  .join("\n")}

## 9. Media profile and decisions

Profile: ${mediaProfile}

| Beat | Selected | Reason | Confidence |
| --- | --- | --- | ---: |
${plan.mediaDecisions.map((item) => `| ${item.beatId} | ${item.selectedMediaType} | ${md(item.selectionReason)} | ${item.confidence} |`).join("\n")}

## 10. Entity extraction

Accepted ${plan.entities.length}; rejected ${plan.rejectedEntityCandidates.length}; uncertain ${plan.uncertainEntityCandidates.length}.

| Entity | Type | Confidence | Evidence units |
| --- | --- | ---: | ---: |
${plan.entities.map((entity) => `| ${md(entity.canonicalName)} | ${entity.type} | ${entity.confidence} | ${entity.sourceUnitIds.length} |`).join("\n")}

Rejected examples: ${
    plan.rejectedEntityCandidates
      .slice(0, 12)
      .map((item) => `${item.value} — ${item.reason}`)
      .join("; ") || "none"
  }.

## 11. Claims and provenance

- Kinds: ${claimsByKind}
- Source status: ${claimsByStatus}
- Declared candidate sources: ${plan.sourceReferences.length}

## 12. Map masters, states, and routes

${plan.mapStates.map((state) => `- ${state.id}: ${state.title}; ${state.dateOrPeriod}; ${state.geographicExtent}; actors ${state.actorEntityIds.length}; routes ${state.routes.map((route) => `${route.label} (${route.direction})`).join(", ") || `none — ${state.routeAbsenceJustification ?? "no directional route asserted"}`}.`).join("\n") || "No map states were justified by accepted geography and claims."}

## 13. Diagram masters and states

${plan.diagramStates.map((state) => `- ${state.id} (${state.domain}): ${state.nodes.map((node) => node.label).join(" → ")}; ${state.edges.map((edge) => edge.label).join(", ")}.`).join("\n") || "No diagram state was justified by the narration."}

## 14. Aspect-ratio strategy

${ratioSummary.map((item) => `- ${item}`).join("\n")}

## 15. Asset reuse and production budget

- Reuse ratio: ${validation.counts.reuseRatio}; cost classes: ${distribution(plan.mediaDecisions.map((item) => item.productionCostClass))}.
- Reconstruction is illustrative and separately identified; no generated media is part of this pack.

## 16. Semantic quality diagnostics and red flags

- Generic visual purposes: ${validation.artifactLint.genericPurposeRate}
- Invalid/rejected entities: ${validation.artifactLint.invalidEntityCount}/${validation.artifactLint.rejectedEntityCount}
- Movement maps without routes: ${validation.artifactLint.emptyMovementRouteCount}
- Placeholder diagrams: ${validation.artifactLint.genericDiagramCount}
- Duplicate multi-shot anchors: ${validation.artifactLint.duplicateAnchorShotCount}
- Dominant media share: ${validation.artifactLint.dominantMediaShare}
- Uniform confidence flags: ${validation.artifactLint.constantConfidenceFlags.join(", ") || "none"}
- Generic ratio strategies: ${validation.artifactLint.genericAspectRatioRate}
- Unsourced claims: ${plan.claims.filter((claim) => claim.sourceStatus === "unresolved").length}/${plan.claims.length}
- Semantic lint: ${validation.artifactLint.valid ? "pass" : "fail"}

## 17. Unresolved limitations

- Timings remain estimated until revision-compatible immutable audio exists.
- Declared sources are candidates, not resolved claim provenance or rights clearance.
- Routes and diagrams intentionally expose uncertainty and must be fact-checked before production.

## 18. Available commands

${commandLines.join("\n")}
`;
}

async function readOptionalJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function planHistoryVisualsV31(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly targetDurationMs?: number;
  readonly force?: boolean;
}): Promise<{
  readonly plan: HistoryVisualPlanV31;
  readonly validation: HistoryVisualValidationV31;
  readonly cached: boolean;
}> {
  const episodeId = normalizeEpisodeId(request.episodeId);
  const root = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    episodeId
  );
  const source = path.join(root, "source");
  const narration = await fs.readFile(
    path.join(root, "languages", "script-en.md"),
    "utf8"
  );
  const metadata = await readOptionalJson<{
    readonly runtime?: { readonly targetDurationMinutes?: number };
  }>(path.join(source, "normalized-metadata.json"), {});
  const research = await readOptionalJson<{
    readonly sources?: readonly {
      readonly id?: string;
      readonly title?: string;
      readonly status?: string;
    }[];
  }>(path.join(source, "research-sources.json"), {});
  const chapterData = await readOptionalJson<{
    readonly editorial?: readonly {
      readonly title?: string;
      readonly timestampSeconds?: number;
      readonly provisional?: boolean;
    }[];
  }>(path.join(source, "provisional-chapters.json"), {});
  const targetDurationMs =
    request.targetDurationMs ??
    (metadata.runtime?.targetDurationMinutes
      ? metadata.runtime.targetDurationMinutes * 60_000
      : undefined);
  const plan = buildHistoryVisualPlanV31({
    episodeId,
    narration,
    ...(targetDurationMs ? { targetDurationMs } : {}),
    sourceReferences: (research.sources ?? [])
      .filter((item) => item.id && item.title)
      .map((item) => ({
        id: item.id!,
        title: item.title!,
        status:
          item.status === "resolved" ? "resolved" : "candidate-source-found",
      })),
    chapters: chapterData.editorial ?? [],
  });
  const validation = validateHistoryVisualPlanV31(plan);
  const planFile = path.join(
    source,
    `history-visual-plan.v3.1-${plan.planHash}.json`
  );
  let cached = false;
  try {
    cached =
      historyVisualPlanV31Schema.parse(
        JSON.parse(await fs.readFile(planFile, "utf8"))
      ).planHash === plan.planHash;
  } catch {
    // A cache miss or an older artifact is intentionally not reused.
  }
  if (!cached || request.force)
    await Promise.all([
      writeJsonAtomic(planFile, plan),
      writeJsonAtomic(
        path.join(
          source,
          `history-visual-validation.v3.1-${plan.planHash}.json`
        ),
        validation
      ),
      writeJsonAtomic(
        path.join(
          source,
          `history-visual-diagnostics.v3.1-${plan.planHash}.json`
        ),
        validation.diagnosticsArtifact
      ),
      writeTextAtomic(
        path.join(source, `history-approval-pack.v3.1-${plan.planHash}.md`),
        renderHistoryVisualApprovalPackV31(plan, validation)
      ),
    ]);
  return { plan, validation, cached };
}

export async function decideHistoryVisualApprovalV31(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly planHash?: string;
  readonly reason?: string;
}): Promise<{ readonly state: string; readonly planHash: string }> {
  if (!request.planHash)
    throw new Error("History v3.1 approval requires an explicit plan hash.");
  const source = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(request.episodeId),
    "source"
  );
  const plan = historyVisualPlanV31Schema.parse(
    JSON.parse(
      await fs.readFile(
        path.join(source, `history-visual-plan.v3.1-${request.planHash}.json`),
        "utf8"
      )
    )
  );
  if (
    request.decision === "APPROVED" &&
    !validateHistoryVisualPlanV31(plan).approvalEligible
  )
    throw new Error(
      "History v3.1 approval is blocked by semantic validation or provisional timing."
    );
  await writeJsonAtomic(
    path.join(source, `history-visual-approval.v3.1-${plan.planHash}.json`),
    {
      state: request.decision,
      planHash: plan.planHash,
      ...(request.reason ? { reason: request.reason } : {}),
    }
  );
  return { state: request.decision, planHash: plan.planHash };
}
