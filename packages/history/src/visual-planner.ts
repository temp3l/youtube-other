import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  hashText,
  normalizeEpisodeId,
  normalizeWhitespace,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";

export const HISTORY_VISUAL_PLANNER_VERSION =
  "history-visual-planner.v1" as const;
export const HISTORY_VISUAL_PROMPT_VERSION =
  "history-visual-planner-prompt.v1" as const;
const text = z.string().trim().min(1);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/u);
const mediaTypeSchema = z.enum([
  "cinematic-scene",
  "map",
  "diagram",
  "archival",
]);
export type HistoryVisualMediaType = z.infer<typeof mediaTypeSchema>;

export const historyVisualPlannerConfigSchema = z
  .object({
    wordsPerMinute: z.number().min(80).max(180).default(108),
    uniqueAssets: z
      .object({
        min: z.number().int().positive(),
        max: z.number().int().positive(),
      })
      .optional(),
    editedShots: z
      .object({
        min: z.number().int().positive(),
        max: z.number().int().positive(),
      })
      .optional(),
  })
  .strict();
export type HistoryVisualPlannerConfig = z.input<
  typeof historyVisualPlannerConfigSchema
>;

export const historyVisualStrategySchema = z
  .object({
    runtimeMinutes: z.number().positive(),
    uniqueAssetTarget: z.number().int().positive(),
    editedShotTarget: z.number().int().positive(),
    mediaMix: z
      .object({
        cinematicScene: z.number().int().nonnegative(),
        map: z.number().int().nonnegative(),
        diagram: z.number().int().nonnegative(),
        archival: z.number().int().nonnegative(),
      })
      .strict(),
    mapRequired: z.boolean(),
    diagramRequired: z.boolean(),
    assumptions: z.array(text).default([]),
  })
  .strict();
export type HistoryVisualStrategy = z.infer<typeof historyVisualStrategySchema>;

export const historyMapSpecSchema = z
  .object({
    id,
    purpose: text,
    extent: text,
    routes: z.array(text),
    animated: z.boolean(),
    labels: z.array(text),
    factualConstraints: z.array(text),
  })
  .strict();
export type HistoryMapSpec = z.infer<typeof historyMapSpecSchema>;
export const historyDiagramSpecSchema = z
  .object({
    id,
    purpose: text,
    kind: z.enum([
      "logistics",
      "attrition",
      "causal-chain",
      "timeline",
      "comparison",
      "systems",
    ]),
    animated: z.boolean(),
    factualConstraints: z.array(text),
  })
  .strict();
export type HistoryDiagramSpec = z.infer<typeof historyDiagramSpecSchema>;
export const historyArchivalSpecSchema = z
  .object({
    id,
    kind: z.enum([
      "painting",
      "portrait",
      "manuscript",
      "document",
      "photograph",
      "artifact",
    ]),
    subject: text,
    dateOrPeriod: text,
    factualConstraints: z.array(text),
  })
  .strict();
export type HistoryArchivalSpec = z.infer<typeof historyArchivalSpecSchema>;

export const historyAssetSpecSchema = z
  .object({
    id,
    mediaType: mediaTypeSchema,
    title: text,
    prompt: text,
    reusable: z.boolean(),
    factualConstraints: z.array(text),
    map: historyMapSpecSchema.optional(),
    diagram: historyDiagramSpecSchema.optional(),
    archival: historyArchivalSpecSchema.optional(),
  })
  .strict();
export type HistoryAssetSpec = z.infer<typeof historyAssetSpecSchema>;
export const historyVisualBeatSchema = z
  .object({
    id,
    narrationStart: z.number().int().nonnegative(),
    narrationEnd: z.number().int().positive(),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    durationSeconds: z.number().positive(),
    narrativeRole: text,
    visualPurpose: text,
    mediaType: mediaTypeSchema,
    entities: z.array(text),
    places: z.array(text),
    dateOrPeriod: text.optional(),
    season: text.optional(),
    chronology: text.optional(),
    factualConstraints: z.array(text),
    assetId: id,
    motionOrOverlay: text,
    confidence: z.number().min(0).max(1),
    warnings: z.array(text),
  })
  .strict();
export type HistoryVisualBeat = z.infer<typeof historyVisualBeatSchema>;
export const historyShotSpecSchema = z
  .object({
    id,
    beatId: id,
    assetId: id,
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    treatment: text,
  })
  .strict();
export type HistoryShotSpec = z.infer<typeof historyShotSpecSchema>;
export const historyVisualValidationReportSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(text),
    warnings: z.array(text),
    narrationCovered: z.boolean(),
    mapRequired: z.boolean(),
    diagramRequired: z.boolean(),
    duplicatePromptCount: z.number().int().nonnegative(),
    staticIntervalsOverTwelveSeconds: z.number().int().nonnegative(),
  })
  .strict();
export type HistoryVisualValidationReport = z.infer<
  typeof historyVisualValidationReportSchema
>;
export const historyVisualApprovalStateSchema = z.enum([
  "AWAITING_VISUAL_APPROVAL",
  "APPROVED",
  "REJECTED",
]);
export type HistoryVisualApprovalState = z.infer<
  typeof historyVisualApprovalStateSchema
>;
export const historyVisualApprovalDecisionSchema = z
  .object({
    state: z.enum(["APPROVED", "REJECTED"]),
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
    reason: text.optional(),
    decidedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type HistoryVisualApprovalDecision = z.infer<
  typeof historyVisualApprovalDecisionSchema
>;
export const historyApprovalPackSchema = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_PLANNER_VERSION),
    episodeId: text,
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
    state: historyVisualApprovalStateSchema,
    approvalCommand: text,
    rejectCommand: text,
    regenerateCommand: text,
    markdown: text,
  })
  .strict();
export type HistoryApprovalPack = z.infer<typeof historyApprovalPackSchema>;
export const historyVisualPlanSchema = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_PLANNER_VERSION),
    promptVersion: z.literal(HISTORY_VISUAL_PROMPT_VERSION),
    episodeId: text,
    scriptHash: z.string().regex(/^[a-f0-9]{64}$/u),
    profileVersion: text,
    plannerConfiguration: historyVisualPlannerConfigSchema,
    strategy: historyVisualStrategySchema,
    beats: z.array(historyVisualBeatSchema).min(1),
    assets: z.array(historyAssetSpecSchema).min(1),
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type HistoryVisualPlan = z.infer<typeof historyVisualPlanSchema>;

const ranges = [
  { max: 4, assets: [16, 24], shots: [24, 36] },
  { max: 7, assets: [24, 32], shots: [36, 50] },
  { max: 10, assets: [35, 45], shots: [55, 70] },
  { max: 15, assets: [45, 60], shots: [70, 95] },
] as const;
function interpolate(
  runtime: number,
  metric: "assets" | "shots"
): readonly [number, number] {
  const safe = Math.max(0, Math.min(15, runtime));
  const i = ranges.findIndex((range) => safe <= range.max);
  const next = ranges[Math.max(0, i)] ?? ranges[ranges.length - 1]!;
  const previous =
    i <= 0
      ? { max: 0, [metric]: metric === "assets" ? [16, 24] : [24, 36] }
      : ranges[i - 1]!;
  const previousRange = previous[metric] as readonly [number, number];
  const nextRange = next[metric];
  const fraction =
    next.max === previous.max
      ? 1
      : (safe - previous.max) / (next.max - previous.max);
  return [
    Math.round(previousRange[0] + (nextRange[0] - previousRange[0]) * fraction),
    Math.round(previousRange[1] + (nextRange[1] - previousRange[1]) * fraction),
  ];
}
export function historyVisualTargets(
  runtimeMinutes: number,
  config: HistoryVisualPlannerConfig = {}
): {
  readonly uniqueAssets: readonly [number, number];
  readonly editedShots: readonly [number, number];
} {
  const parsed = historyVisualPlannerConfigSchema.parse(config);
  return {
    uniqueAssets: parsed.uniqueAssets
      ? [parsed.uniqueAssets.min, parsed.uniqueAssets.max]
      : interpolate(runtimeMinutes, "assets"),
    editedShots: parsed.editedShots
      ? [parsed.editedShots.min, parsed.editedShots.max]
      : interpolate(runtimeMinutes, "shots"),
  };
}

const mapPattern =
  /\b(invasion|campaign|retreat|migration|exploration|trade route|territor(?:y|ial)|shifting front|advance|cross(?:ed|ing)?|march(?:ed|ing)?)\b/iu;
const diagramPattern =
  /\b(logistics?|supply chain|attrition|systems? collapse|causal chain|because|consequence|comparison|strategy|economic|political|timeline)\b/iu;
const seasonPattern = /\b(spring|summer|autumn|fall|winter)\b/iu;
const locationPattern =
  /\b(?:Moscow|Russia|Russian Empire|Poland|Lithuania|Belarus|Niemen|Borodino|Berezina|France|Europe|Prussia|Austria)\b/gu;
function matches(source: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(source);
}
function entities(sentence: string): readonly string[] {
  return [
    ...sentence.matchAll(
      /\b(?:Napoleon|Kutuzov|Grande Armée|Russian army|Russian forces|Cossacks|tsar)\b/gu
    ),
  ]
    .map((match) => match[0]!)
    .filter((value, index, values) => values.indexOf(value) === index);
}
function places(source: string): readonly string[] {
  return [...source.matchAll(locationPattern)]
    .map((match) => match[0]!)
    .filter((value, index, values) => values.indexOf(value) === index);
}
function sentenceChunks(
  script: string,
  target: number
): readonly { text: string; start: number; end: number }[] {
  const sentences = [...script.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/gu)]
    .map((match) => ({
      text: normalizeWhitespace(match[0]!),
      start: match.index,
      end: (match.index ?? 0) + match[0]!.length,
    }))
    .filter((item) => item.text);
  const output: { text: string; start: number; end: number }[] = [];
  const totalWords = script.split(/\s+/u).filter(Boolean).length;
  const wordsPer = Math.max(1, Math.ceil(totalWords / target));
  let current: { text: string; start: number; end: number } | undefined;
  for (const sentence of sentences) {
    const wordCount = sentence.text.split(/\s+/u).length;
    if (
      current &&
      output.length < target - 1 &&
      current.text.split(/\s+/u).length + wordCount > wordsPer
    ) {
      output.push(current);
      current = undefined;
    }
    current = current
      ? {
          text: `${current.text} ${sentence.text}`,
          start: current.start,
          end: sentence.end,
        }
      : sentence;
  }
  if (current) output.push(current);
  return output;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function planDigest(plan: Omit<HistoryVisualPlan, "planHash">): string {
  return hashText(stable(plan));
}

export function validateHistoryVisualPlan(
  plan: HistoryVisualPlan
): HistoryVisualValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const covered =
    plan.beats[0]?.narrationStart === 0 &&
    plan.beats.every(
      (beat, index) =>
        index === 0 ||
        plan.beats[index - 1]!.narrationEnd === beat.narrationStart
    );
  const mapRequired = plan.strategy.mapRequired;
  const diagramRequired = plan.strategy.diagramRequired;
  const mapCount = plan.beats.filter((beat) => beat.mediaType === "map").length;
  const diagramCount = plan.beats.filter(
    (beat) => beat.mediaType === "diagram"
  ).length;
  const prompts = plan.assets.map((asset) => asset.prompt.toLocaleLowerCase());
  const duplicates = prompts.length - new Set(prompts).size;
  const staticLong = plan.beats.filter(
    (beat) =>
      beat.durationSeconds > 12 &&
      !/animated|progressive|hold/u.test(beat.motionOrOverlay)
  ).length;
  if (!covered)
    errors.push("Narration ranges do not provide contiguous full coverage.");
  if (mapRequired && mapCount === 0)
    errors.push("A map beat is mandatory for this narration.");
  if (diagramRequired && diagramCount === 0)
    errors.push("A diagram beat is mandatory for this narration.");
  if (duplicates > 0)
    warnings.push("Near-duplicate asset prompts require review.");
  if (staticLong > 0)
    warnings.push(
      "Static intervals over twelve seconds require a deliberate hold explanation."
    );
  return historyVisualValidationReportSchema.parse({
    valid: errors.length === 0,
    errors,
    warnings,
    narrationCovered: covered,
    mapRequired,
    diagramRequired,
    duplicatePromptCount: duplicates,
    staticIntervalsOverTwelveSeconds: staticLong,
  });
}

export function buildHistoryVisualPlan(input: {
  readonly episodeId: string;
  readonly narration: string;
  readonly profileVersion?: string;
  readonly targetDurationMinutes?: number;
  readonly config?: HistoryVisualPlannerConfig;
}): HistoryVisualPlan {
  const config = historyVisualPlannerConfigSchema.parse(input.config ?? {});
  const narration = normalizeWhitespace(input.narration);
  const words = narration.split(/\s+/u).filter(Boolean).length;
  const runtime = input.targetDurationMinutes ?? words / config.wordsPerMinute;
  const targets = historyVisualTargets(runtime, config);
  const uniqueTarget = Math.round(
    (targets.uniqueAssets[0] + targets.uniqueAssets[1]) / 2
  );
  const shotTarget = Math.round(
    (targets.editedShots[0] + targets.editedShots[1]) / 2
  );
  const allPlaces = places(narration);
  const mapRequired = matches(narration, mapPattern) || allPlaces.length >= 3;
  const diagramRequired = matches(narration, diagramPattern);
  const mediaMix = {
    cinematicScene: Math.max(1, Math.round(uniqueTarget * 0.64)),
    map: mapRequired
      ? Math.max(1, Math.round(uniqueTarget * 0.12))
      : Math.round(uniqueTarget * 0.1),
    diagram: diagramRequired
      ? Math.max(1, Math.round(uniqueTarget * 0.1))
      : Math.round(uniqueTarget * 0.08),
    archival: 0,
  };
  mediaMix.archival = Math.max(
    1,
    uniqueTarget - mediaMix.cinematicScene - mediaMix.map - mediaMix.diagram
  );
  const chunks = sentenceChunks(narration, shotTarget);
  const secondsPerBeat = (runtime * 60) / chunks.length;
  const assetMedia: HistoryVisualMediaType[] = [
    "cinematic-scene",
    "archival",
    "cinematic-scene",
    ...(mapRequired ? (["map"] as const) : []),
    "cinematic-scene",
    ...(diagramRequired ? (["diagram"] as const) : []),
  ];
  const assets: HistoryAssetSpec[] = Array.from(
    { length: uniqueTarget },
    (_, index) => {
      const chunk = chunks[index % chunks.length]!;
      const mediaType = assetMedia[index % assetMedia.length]!;
      const assetId = `asset-${String(index + 1).padStart(3, "0")}`;
      const common = {
        id: assetId,
        mediaType,
        title: `${mediaType.replace(/-/gu, " ")} ${index + 1}`,
        prompt: `${mediaType} for: ${chunk.text.slice(0, 220)}; historically grounded, no unsupported uniforms, borders, or equipment.`,
        reusable: index >= Math.ceil(uniqueTarget * 0.78),
        factualConstraints: [
          "Do not depict claims stronger than the narration.",
          "Avoid unsupported flags, uniforms, equipment, buildings, and borders.",
        ],
      } as const;
      if (mediaType === "map")
        return historyAssetSpecSchema.parse({
          ...common,
          map: {
            id: `map-${index + 1}`,
            purpose:
              "Explain changing positions and geography-dependent causation.",
            extent: allPlaces.join(", ") || "Narration locations",
            routes: [
              "Show only the route stated or clearly implied by narration.",
            ],
            animated: true,
            labels: allPlaces.slice(0, 8),
            factualConstraints: common.factualConstraints,
          },
        });
      if (mediaType === "diagram") {
        const kind = /attrition|loss|hunger|disease/iu.test(chunk.text)
          ? "attrition"
          : /supply|logistics/iu.test(chunk.text)
            ? "logistics"
            : "causal-chain";
        return historyAssetSpecSchema.parse({
          ...common,
          diagram: {
            id: `diagram-${index + 1}`,
            purpose: "Explain the causal or systems relationship in narration.",
            kind,
            animated: true,
            factualConstraints: common.factualConstraints,
          },
        });
      }
      if (mediaType === "archival")
        return historyAssetSpecSchema.parse({
          ...common,
          archival: {
            id: `archival-${index + 1}`,
            kind: "document",
            subject: "Period evidence related to the narration",
            dateOrPeriod: "Date must be verified before licensing or use",
            factualConstraints: common.factualConstraints,
          },
        });
      return historyAssetSpecSchema.parse(common);
    }
  );
  const beats = chunks.map((chunk, index) => {
    const asset = assets[index % assets.length]!;
    const startSeconds = Number((index * secondsPerBeat).toFixed(2));
    const endSeconds = Number(((index + 1) * secondsPerBeat).toFixed(2));
    const season = chunk.text.match(seasonPattern)?.[0]?.toLocaleLowerCase();
    return historyVisualBeatSchema.parse({
      id: `beat-${String(index + 1).padStart(3, "0")}`,
      narrationStart: chunk.start,
      narrationEnd: chunk.end,
      startSeconds,
      endSeconds,
      durationSeconds: Number((endSeconds - startSeconds).toFixed(2)),
      narrativeRole: index < 3 ? "opening-hook" : "explanation",
      visualPurpose: `Make this narration beat concrete: ${chunk.text.slice(0, 120)}`,
      mediaType: asset.mediaType,
      entities: entities(chunk.text),
      places: places(chunk.text),
      ...(chunk.text.match(/\b\d{4}\b/u)?.[0]
        ? { dateOrPeriod: chunk.text.match(/\b\d{4}\b/u)?.[0] }
        : {}),
      ...(season ? { season } : {}),
      chronology: `narration-order-${index + 1}`,
      factualConstraints: asset.factualConstraints,
      assetId: asset.id,
      motionOrOverlay:
        asset.mediaType === "map" || asset.mediaType === "diagram"
          ? "Progressive animated annotation."
          : index < 3
            ? "New visual or materially different crop every beat."
            : "Slow camera motion with meaningful overlay when needed.",
      confidence: 0.74,
      warnings: asset.reusable
        ? [
            "Reusable transitional asset; verify it remains specific to narration.",
          ]
        : [],
    });
  });
  const raw = {
    schemaVersion: HISTORY_VISUAL_PLANNER_VERSION,
    promptVersion: HISTORY_VISUAL_PROMPT_VERSION,
    episodeId: input.episodeId,
    scriptHash: hashText(narration),
    profileVersion: input.profileVersion ?? "history-profile.v1",
    plannerConfiguration: config,
    strategy: historyVisualStrategySchema.parse({
      runtimeMinutes: Number(runtime.toFixed(2)),
      uniqueAssetTarget: uniqueTarget,
      editedShotTarget: chunks.length,
      mediaMix,
      mapRequired,
      diagramRequired,
      assumptions:
        input.targetDurationMinutes === undefined
          ? [`Estimated at ${config.wordsPerMinute} words per minute.`]
          : ["Used configured episode duration metadata."],
    }),
    beats,
    assets,
  } as const;
  return historyVisualPlanSchema.parse({ ...raw, planHash: planDigest(raw) });
}

export async function planHistoryVisuals(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly config?: HistoryVisualPlannerConfig;
}): Promise<{
  readonly plan: HistoryVisualPlan;
  readonly validation: HistoryVisualValidationReport;
  readonly approvalPack: HistoryApprovalPack;
  readonly cached: boolean;
}> {
  const root = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(request.episodeId)
  );
  const source = path.join(root, "source");
  const narration = await fs.readFile(
    path.join(root, "languages", "script-en.md"),
    "utf8"
  );
  let metadata: { runtime?: { targetDurationMinutes?: number } } = {};
  try {
    metadata = JSON.parse(
      await fs.readFile(path.join(source, "normalized-metadata.json"), "utf8")
    ) as typeof metadata;
  } catch {
    /* narration-only planning is supported */
  }
  const plan = buildHistoryVisualPlan({
    episodeId: request.episodeId,
    narration,
    ...(metadata.runtime?.targetDurationMinutes !== undefined
      ? { targetDurationMinutes: metadata.runtime.targetDurationMinutes }
      : {}),
    ...(request.config ? { config: request.config } : {}),
  });
  const validation = validateHistoryVisualPlan(plan);
  if (!validation.valid)
    throw new Error(
      `History visual plan failed validation: ${validation.errors.join(" ")}`
    );
  const approvalCommand = `mediaforge history visuals approve ${request.episodeId} --plan-hash ${plan.planHash}`;
  const approvalPack = historyApprovalPackSchema.parse({
    schemaVersion: HISTORY_VISUAL_PLANNER_VERSION,
    episodeId: request.episodeId,
    planHash: plan.planHash,
    state: "AWAITING_VISUAL_APPROVAL",
    approvalCommand,
    rejectCommand: `mediaforge history visuals reject ${request.episodeId} --reason "..."`,
    regenerateCommand: `mediaforge history visuals plan ${request.episodeId}`,
    markdown: renderApprovalPack(plan, validation, approvalCommand),
  });
  let cached = false;
  try {
    const previous = historyVisualPlanSchema.parse(
      JSON.parse(
        await fs.readFile(path.join(source, "history-visual-plan.json"), "utf8")
      )
    );
    cached = previous.planHash === plan.planHash;
  } catch {
    /* first plan */
  }
  await Promise.all([
    writeJsonAtomic(path.join(source, "history-visual-plan.json"), plan),
    writeJsonAtomic(path.join(source, "history-shot-list.json"), {
      planHash: plan.planHash,
      shots: plan.beats.map(
        (beat) =>
          ({
            id: `shot-${beat.id.slice(5)}`,
            beatId: beat.id,
            assetId: beat.assetId,
            startSeconds: beat.startSeconds,
            endSeconds: beat.endSeconds,
            treatment: beat.motionOrOverlay,
          }) satisfies HistoryShotSpec
      ),
    }),
    writeJsonAtomic(path.join(source, "history-asset-manifest.draft.json"), {
      planHash: plan.planHash,
      assets: plan.assets,
    }),
    writeJsonAtomic(
      path.join(source, "history-visual-validation.json"),
      validation
    ),
    writeJsonAtomic(path.join(source, "history-visual-approval.json"), {
      state: "AWAITING_VISUAL_APPROVAL",
      planHash: plan.planHash,
    }),
    writeTextAtomic(
      path.join(source, "history-approval-pack.md"),
      approvalPack.markdown
    ),
  ]);
  return { plan, validation, approvalPack, cached };
}
function renderApprovalPack(
  plan: HistoryVisualPlan,
  validation: HistoryVisualValidationReport,
  approvalCommand: string
): string {
  const mix = plan.strategy.mediaMix;
  return `# History visual approval pack\n\nPlan hash: \`${plan.planHash}\`\n\n- Runtime: ${plan.strategy.runtimeMinutes} minutes\n- Unique assets: ${plan.assets.length}\n- Edited shots: ${plan.beats.length}\n- Mix: ${mix.cinematicScene} cinematic, ${mix.map} map, ${mix.diagram} diagram, ${mix.archival} archival\n- Maps required: ${plan.strategy.mapRequired}; diagrams required: ${plan.strategy.diagramRequired}\n\n## Approval\n\n\`\`\`bash\n${approvalCommand}\nmediaforge history visuals reject ${plan.episodeId} --reason "Needs changes"\nmediaforge history visuals plan ${plan.episodeId}\n\`\`\`\n\n## Beat overview\n\n${plan.beats.map((beat) => `- ${beat.id} (${beat.startSeconds}s–${beat.endSeconds}s): ${beat.mediaType}; ${beat.visualPurpose}`).join("\n")}\n\nWarnings: ${validation.warnings.length === 0 ? "none" : validation.warnings.join("; ")}\n`;
}
export async function decideHistoryVisualApproval(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly planHash?: string;
  readonly reason?: string;
}): Promise<{
  readonly state: HistoryVisualApprovalState;
  readonly planHash: string;
}> {
  const root = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(request.episodeId)
  );
  const file = path.join(root, "source", "history-visual-approval.json");
  const current = z
    .object({
      state: historyVisualApprovalStateSchema,
      planHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .passthrough()
    .parse(JSON.parse(await fs.readFile(file, "utf8")));
  if (request.decision === "APPROVED" && request.planHash !== current.planHash)
    throw new Error(
      "Visual approval plan hash is stale or does not match the current plan."
    );
  await writeJsonAtomic(file, {
    state: request.decision,
    planHash: current.planHash,
    ...(request.reason ? { reason: request.reason } : {}),
    decidedAt: new Date().toISOString(),
  });
  return { state: request.decision, planHash: current.planHash };
}
export async function assertHistoryVisualApproval(root: string): Promise<void> {
  const { assertHistoryVisualApprovalV35, loadHistoryVisualPlanV35 } =
    await import("./history-render-adapter-v35.js");
  if (await loadHistoryVisualPlanV35(root)) {
    await assertHistoryVisualApprovalV35(root);
    return;
  }
  const approval = z
    .object({
      state: historyVisualApprovalStateSchema,
      planHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .passthrough()
    .parse(
      JSON.parse(
        await fs.readFile(
          path.join(root, "source", "history-visual-approval.json"),
          "utf8"
        )
      )
    );
  const plan = historyVisualPlanSchema.parse(
    JSON.parse(
      await fs.readFile(
        path.join(root, "source", "history-visual-plan.json"),
        "utf8"
      )
    )
  );
  if (approval.state !== "APPROVED" || approval.planHash !== plan.planHash)
    throw new Error(
      "History media generation requires explicit approval of the current history visual plan."
    );
}
