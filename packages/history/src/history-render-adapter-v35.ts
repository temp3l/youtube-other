import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { scenePlanSchema } from "@mediaforge/domain";
import {
  hashText,
  normalizeEpisodeId,
  sceneFilename,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  HISTORY_VISUAL_PLANNER_V35,
  HISTORY_VISUAL_SCHEMA_V35,
  type HistoryVisualPlanV35,
} from "./history-v35-contracts.js";
import type { HistoryShotPersonReferenceUsageV35 } from "./history-person-likeness-v35.js";

export const HISTORY_VISUAL_ADAPTER_V35_VERSION =
  "history-render-adapter.v3.5" as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const ratioSchema = z.enum(["16:9", "9:16"]);

const COMPILED_VISUAL_MODALITIES = new Set([
  "map",
  "diagram",
  "timeline",
  "date-card",
  "document",
  "quotation",
  "text-only transition",
]);

export const historyRenderDerivativeV35Schema = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_ADAPTER_V35_VERSION),
    planSchemaVersion: z.literal(HISTORY_VISUAL_SCHEMA_V35),
    planHash: sha256,
    derivativeHash: sha256,
    ratios: z.array(ratioSchema).length(2),
    scenePlan: scenePlanSchema,
    shotCount: z.number().int().nonnegative(),
    illustrationShotCount: z.number().int().nonnegative(),
    historicalPersonReferenceUsages: z.array(
      z
        .object({
          sceneId: z.string(),
          shotId: z.string(),
          canonicalPersonId: z.string(),
          canonicalName: z.string(),
          likenessPolicy: z.string(),
          selectedReferenceAssetIds: z.array(z.string()),
          attachmentStatus: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type HistoryRenderDerivativeV35 = z.infer<
  typeof historyRenderDerivativeV35Schema
>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return hashText(stable(value));
}

function beatNarration(plan: HistoryVisualPlanV35, beatId: string): string {
  const beat = plan.beats.find((item) => item.id === beatId);
  if (!beat) return "";
  return plan.narration.normalizedText
    .slice(beat.narrationSpan.startUtf16, beat.narrationSpan.endUtf16Exclusive)
    .trim();
}

function isIllustrationModality(modality: string): boolean {
  return !COMPILED_VISUAL_MODALITIES.has(modality);
}

function buildSceneImagePrompt(input: {
  readonly plan: HistoryVisualPlanV35;
  readonly shot: HistoryVisualPlanV35["shots"][number];
  readonly beat: HistoryVisualPlanV35["beats"][number];
}): string {
  const concept = input.plan.visualConcepts.find(
    (item) => item.beatId === input.beat.id
  );
  if (concept) {
    return [
      `${concept.modality}: ${concept.historicalSubject}.`,
      concept.intendedComposition,
      concept.protectedFactualRelation,
      concept.settingGeography ? `Setting: ${concept.settingGeography}.` : "",
      concept.approximatePeriod ? `Period: ${concept.approximatePeriod}.` : "",
      concept.forbiddenAnachronisms.length
        ? `Avoid: ${concept.forbiddenAnachronisms.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${input.beat.modality}: ${input.shot.subject}.`,
    input.shot.action,
    input.shot.framing,
    input.shot.adaptation16x9,
  ]
    .filter(Boolean)
    .join(" ");
}

export function compileHistoryRenderDerivativeV35(
  plan: HistoryVisualPlanV35
): HistoryRenderDerivativeV35 {
  const beatsById = new Map(plan.beats.map((beat) => [beat.id, beat]));
  const sortedShots = [...plan.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs;
    return left.id.localeCompare(right.id);
  });
  let illustrationShotCount = 0;
  const historicalPersonReferenceUsages: Array<{
    readonly sceneId: string;
    readonly shotId: string;
    readonly canonicalPersonId: string;
    readonly canonicalName: string;
    readonly likenessPolicy: string;
    readonly selectedReferenceAssetIds: readonly string[];
    readonly attachmentStatus: string;
  }> = [];
  const usagesByShotId = new Map<string, readonly HistoryShotPersonReferenceUsageV35[]>();
  for (const usage of plan.historicalPersonReferences.usages) {
    const existing = usagesByShotId.get(usage.shotId) ?? [];
    usagesByShotId.set(usage.shotId, [...existing, usage]);
  }
  const scenes = sortedShots.map((shot, index) => {
    const beat = beatsById.get(shot.beatId);
    if (!beat) {
      throw new Error(
        `History V3.5 render adapter could not resolve beat ${shot.beatId} for ${shot.id}.`
      );
    }
    if (isIllustrationModality(beat.modality)) illustrationShotCount += 1;
    const sequence = index + 1;
    const startSeconds = shot.startMs / 1_000;
    const endSeconds = shot.endMs / 1_000;
    const concept = plan.visualConcepts.find((item) => item.beatId === beat.id);
    const canonicalNarration = beatNarration(plan, beat.id);
    const sceneId = `scene-${String(sequence).padStart(3, "0")}`;
    const personUsages = usagesByShotId.get(shot.id) ?? [];
    for (const usage of personUsages) {
      historicalPersonReferenceUsages.push({
        sceneId,
        shotId: shot.id,
        canonicalPersonId: usage.canonicalPersonId,
        canonicalName: usage.canonicalName,
        likenessPolicy: usage.likenessPolicy,
        selectedReferenceAssetIds: usage.selectedReferenceAssetIds,
        attachmentStatus: usage.attachmentStatus,
      });
    }
    return {
      id: sceneId,
      sequenceNumber: sequence,
      canonicalNarration,
      sourceSegmentIds: [`scene-${String(sequence).padStart(3, "0")}`],
      estimatedDurationSeconds: endSeconds - startSeconds,
      timing: { startSeconds, endSeconds },
      visualPurpose: shot.purpose,
      textRequirement: { required: false },
      subject: concept?.historicalSubject ?? shot.subject,
      action: shot.action,
      setting:
        concept?.settingGeography ??
        shot.background ??
        "historically grounded documentary context",
      composition: concept?.intendedComposition ?? shot.adaptation16x9,
      cameraFraming: shot.framing,
      mood: isIllustrationModality(beat.modality)
        ? "evidence-aware"
        : "compiled-documentary",
      continuityReferences:
        index === 0
          ? []
          : [`scene-${String(index).padStart(3, "0")}`],
      onScreenText: "",
      negativeConstraints: [
        ...shot.prohibitedAdditions,
        ...(concept?.forbiddenAnachronisms ?? []),
      ],
      aspectRatios: ["16:9", "9:16"],
      imagePrompt: buildSceneImagePrompt({ plan, shot, beat }),
      expectedImageFilenames: [
        sceneFilename(sequence, startSeconds, endSeconds, "16:9"),
        sceneFilename(sequence, startSeconds, endSeconds, "9:16"),
      ],
      qualityStatus: "draft" as const,
    };
  });
  const scenePlan = scenePlanSchema.parse({
    sourceId: plan.episodeId,
    scenes,
  });
  const raw = {
    schemaVersion: HISTORY_VISUAL_ADAPTER_V35_VERSION,
    planSchemaVersion: HISTORY_VISUAL_SCHEMA_V35,
    planHash: plan.planHash,
    ratios: ["16:9", "9:16"] as const,
    scenePlan,
    shotCount: sortedShots.length,
    illustrationShotCount,
    historicalPersonReferenceUsages,
  };
  return historyRenderDerivativeV35Schema.parse({
    ...raw,
    derivativeHash: digest(raw),
  });
}

export function v35DerivativeArtifactPath(
  source: string,
  planHash: string,
  derivativeHash: string
): string {
  return path.join(
    source,
    `history-render-derivative.v3.5-${planHash}-${derivativeHash}.json`
  );
}

export function v35ApprovalArtifactPath(
  source: string,
  planHash: string,
  derivativeHash: string
): string {
  return path.join(
    source,
    `history-visual-approval.v3.5-${planHash}-${derivativeHash}.json`
  );
}

export function resolveHistoryV35PlanPath(root: string): string {
  return path.join(root, "source", "history-v3.5", "plan.json");
}

export async function loadHistoryVisualPlanV35(
  root: string
): Promise<HistoryVisualPlanV35 | null> {
  try {
    return JSON.parse(
      await fs.readFile(resolveHistoryV35PlanPath(root), "utf8")
    ) as HistoryVisualPlanV35;
  } catch {
    return null;
  }
}

export async function syncHistoryProductionArtifactsV35(args: {
  readonly root: string;
  readonly plan: HistoryVisualPlanV35;
}): Promise<{ readonly derivative: HistoryRenderDerivativeV35 }> {
  const derivative = compileHistoryRenderDerivativeV35(args.plan);
  const source = path.join(args.root, "source");
  await fs.mkdir(path.join(args.root, "shared"), { recursive: true });
  await fs.mkdir(path.join(args.root, "canonical"), { recursive: true });
  await writeJsonAtomic(
    v35DerivativeArtifactPath(source, args.plan.planHash, derivative.derivativeHash),
    derivative
  );
  await writeJsonAtomic(
    path.join(args.root, "shared", "scenes.json"),
    derivative.scenePlan
  );
  await writeJsonAtomic(
    path.join(args.root, "canonical", "scenes.json"),
    derivative.scenePlan
  );
  const manifestPath = path.join(args.root, "manifest.json");
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    /* first production sync */
  }
  await writeJsonAtomic(manifestPath, {
    ...manifest,
    scenePlan: derivative.scenePlan,
    historyRenderDerivativeV35: {
      planHash: derivative.planHash,
      derivativeHash: derivative.derivativeHash,
      shotCount: derivative.shotCount,
      illustrationShotCount: derivative.illustrationShotCount,
    },
    updatedAt: new Date().toISOString(),
  });
  return { derivative };
}

export async function decideHistoryVisualApprovalV35(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly planHash?: string;
  readonly derivativeHash?: string;
  readonly reason?: string;
}): Promise<{
  readonly state: "APPROVED" | "REJECTED";
  readonly planHash: string;
  readonly derivativeHash: string;
}> {
  if (!request.planHash || !request.derivativeHash) {
    throw new Error(
      "History V3.5 approval requires explicit plan and derivative hashes."
    );
  }
  const root = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(request.episodeId)
  );
  const source = path.join(root, "source");
  const plan = (await loadHistoryVisualPlanV35(root)) as HistoryVisualPlanV35 | null;
  if (!plan || plan.planHash !== request.planHash) {
    throw new Error("History V3.5 approval plan hash is stale or missing.");
  }
  const derivative = historyRenderDerivativeV35Schema.parse(
    JSON.parse(
      await fs.readFile(
        v35DerivativeArtifactPath(
          source,
          request.planHash,
          request.derivativeHash
        ),
        "utf8"
      )
    )
  );
  if (
    request.decision === "APPROVED" &&
    (derivative.planHash !== plan.planHash ||
      derivative.derivativeHash !== request.derivativeHash ||
      !plan.approval.structurallyValid ||
      !plan.approval.contentApprovalEligible)
  ) {
    throw new Error(
      "History V3.5 approval is blocked by structural/content gates or stale derivative hashes."
    );
  }
  await writeJsonAtomic(
    v35ApprovalArtifactPath(source, plan.planHash, derivative.derivativeHash),
    {
      schemaVersion: HISTORY_VISUAL_ADAPTER_V35_VERSION,
      state: request.decision,
      planHash: plan.planHash,
      derivativeHash: derivative.derivativeHash,
      approvalScope: plan.approval.productionApprovalEligible
        ? "renderable-derivative"
        : "provisional-plan-review",
      ...(request.reason ? { reason: request.reason } : {}),
      decidedAt: new Date().toISOString(),
    }
  );
  return {
    state: request.decision,
    planHash: plan.planHash,
    derivativeHash: derivative.derivativeHash,
  };
}

export async function assertHistoryVisualApprovalV35(root: string): Promise<void> {
  const plan = await loadHistoryVisualPlanV35(root);
  if (!plan) {
    throw new Error("History V3.5 media generation requires a V3.5 visual plan.");
  }
  const derivative = compileHistoryRenderDerivativeV35(plan);
  const approvalPath = v35ApprovalArtifactPath(
    path.join(root, "source"),
    plan.planHash,
    derivative.derivativeHash
  );
  let approvalRaw: string;
  try {
    approvalRaw = await fs.readFile(approvalPath, "utf8");
  } catch {
    throw new Error(
      "History media generation requires explicit approval of the current History V3.5 render derivative."
    );
  }
  const approval = z
    .object({
      state: z.enum(["APPROVED", "REJECTED"]),
      planHash: sha256,
      derivativeHash: sha256,
    })
    .passthrough()
    .parse(JSON.parse(approvalRaw));
  if (
    approval.state !== "APPROVED" ||
    approval.planHash !== plan.planHash ||
    approval.derivativeHash !== derivative.derivativeHash
  ) {
    throw new Error(
      "History media generation requires explicit approval of the current History V3.5 render derivative."
    );
  }
}
