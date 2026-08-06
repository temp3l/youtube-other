/**
 * Opt-in History visual planner.  This deliberately does not reinterpret the
 * v1 visual-plan or approval files: v2 artifacts live beside them and are
 * linked by immutable hashes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { scenePlanSchema } from "@mediaforge/domain";
import {
  hashText,
  hashFile,
  normalizeEpisodeId,
  sceneFilename,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";

export const HISTORY_VISUAL_PLANNER_V2_VERSION = "history-visual-plan.v2" as const;
export const HISTORY_VISUAL_PLANNER_V2_POLICY_VERSION = "history-visual-policy.v2" as const;
export const HISTORY_VISUAL_ADAPTER_V2_VERSION = "history-render-adapter.v2" as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const text = z.string().trim().min(1);
const ratioSchema = z.enum(["16:9", "9:16"]);
const diagnosticSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/u),
  severity: z.enum(["error", "warning"]),
  message: text,
  affectedIds: z.array(z.string()).default([]),
  remediation: text,
}).strict();
export type HistoryVisualV2Diagnostic = z.infer<typeof diagnosticSchema>;

export const narrationUnitSchema = z.object({
  id: z.string().regex(/^unit-\d{3,}$/u),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  textHash: sha256,
  kind: z.enum(["sentence", "paragraph", "incomplete"]),
  wordCount: z.number().int().positive(),
}).strict();
export type NarrationUnit = z.infer<typeof narrationUnitSchema>;

const timingSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("measured-word-timestamps"), audioHash: sha256 }),
  z.object({ kind: z.literal("measured-audio-proportional"), audioHash: sha256 }),
  z.object({ kind: z.literal("estimated-sentence"), wordsPerMinute: z.number().positive() }),
]);
const timedUnitSchema = narrationUnitSchema.extend({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  timingSource: timingSourceSchema,
}).strict();
export type TimedNarrationUnit = z.infer<typeof timedUnitSchema>;

const mediaKindSchema = z.enum([
  "reconstruction", "archival", "document", "portrait", "material-culture",
  "terrain", "map-state", "diagram-state", "quotation", "editorial-text",
]);
const provenanceSchema = z.object({
  sourceId: text,
  locator: text.optional(),
  rights: z.enum(["cleared", "unknown", "unavailable"]),
  confidence: z.number().min(0).max(1),
  claimIds: z.array(text),
}).strict();
const constraintSchema = z.object({
  kind: z.enum(["date", "place", "actor", "material-culture", "terrain", "exclusion", "uncertainty"]),
  value: text,
}).strict();
const compositionSchema = z.object({
  ratio: ratioSchema,
  strategy: z.enum(["native", "recompose", "crop", "split-panel"]),
  focalRegion: text,
  textSafeZone: text,
  layout: text.optional(),
}).strict();
const sourceAssetSchema = z.object({
  id: z.string().regex(/^asset-\d{3,}$/u),
  kind: mediaKindSchema,
  title: text,
  selectionReason: text,
  hardRequirements: z.array(text),
  constraints: z.array(constraintSchema),
  provenance: z.array(provenanceSchema),
  confidence: z.number().min(0).max(1),
  illustrative: z.boolean(),
  compositionVariants: z.array(compositionSchema).length(2),
}).strict();
const beatSchema = z.object({
  id: z.string().regex(/^beat-\d{3,}$/u),
  narrationUnitIds: z.array(z.string()).min(1),
  role: z.enum(["hook", "setup", "evidence", "turn", "climax", "aftermath", "conclusion"]),
  importance: z.number().int().min(1).max(5),
  visualPurpose: text,
  claimIds: z.array(text),
  hardRequirements: z.array(text),
  assetId: z.string().regex(/^asset-\d{3,}$/u),
}).strict();
const shotSchema = z.object({
  id: z.string().regex(/^shot-\d{3,}$/u),
  beatId: z.string().regex(/^beat-\d{3,}$/u),
  assetId: z.string().regex(/^asset-\d{3,}$/u),
  narrationUnitIds: z.array(z.string()).min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  purpose: text,
  compositionRatio: ratioSchema,
}).strict();
const stateSchema = z.object({
  id: z.string().regex(/^(map|diagram)-state-\d{3,}$/u),
  masterId: text,
  order: z.number().int().nonnegative(),
  claimIds: z.array(text),
  labels: z.array(text),
  routesOrRelationships: z.array(text),
  scale: z.enum(["strategic", "tactical"]),
  cameraOrLayout: text,
  disclosure: text,
}).strict();
const narrationSchema = z.object({
  normalizedText: z.string().min(1),
  sourceHash: sha256,
  sourceLength: z.number().int().positive(),
  sourcePath: text.optional(),
  units: z.array(narrationUnitSchema).min(1),
}).strict();
const planSchemaWithoutHash = z.object({
  schemaVersion: z.literal(HISTORY_VISUAL_PLANNER_V2_VERSION),
  plannerVersion: z.literal(HISTORY_VISUAL_PLANNER_V2_VERSION),
  policyVersion: z.literal(HISTORY_VISUAL_PLANNER_V2_POLICY_VERSION),
  episodeId: text,
  narration: narrationSchema,
  timing: z.object({
    source: timingSourceSchema,
    durationMs: z.number().int().positive(),
    targetDurationMs: z.number().int().positive().optional(),
    deltaMs: z.number().int(),
    provisional: z.boolean(),
  }).strict(),
  timedUnits: z.array(timedUnitSchema).min(1),
  beats: z.array(beatSchema).min(1),
  assets: z.array(sourceAssetSchema).min(1),
  shots: z.array(shotSchema).min(1),
  states: z.array(stateSchema),
  requiredRatios: z.array(ratioSchema).length(2),
}).strict();
export const historyVisualPlanV2Schema = planSchemaWithoutHash.extend({ planHash: sha256 }).strict();
export type HistoryVisualPlanV2 = z.infer<typeof historyVisualPlanV2Schema>;
export const historyVisualV2ValidationSchema = z.object({
  schemaVersion: z.literal(HISTORY_VISUAL_PLANNER_V2_VERSION),
  planHash: sha256,
  valid: z.boolean(),
  diagnostics: z.array(diagnosticSchema),
  sourceNarrationCharacters: z.number().int().nonnegative(),
  plannedNarrationCharacters: z.number().int().nonnegative(),
  sourceUnitCount: z.number().int().nonnegative(),
  plannedUnitCount: z.number().int().nonnegative(),
  finalRangeEnd: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  targetDurationMs: z.number().int().nonnegative().optional(),
  deltaMs: z.number().int(),
  timingSource: timingSourceSchema,
}).strict();
export type HistoryVisualV2Validation = z.infer<typeof historyVisualV2ValidationSchema>;

export const historyRenderDerivativeV2Schema = z.object({
  schemaVersion: z.literal(HISTORY_VISUAL_ADAPTER_V2_VERSION),
  planSchemaVersion: z.literal(HISTORY_VISUAL_PLANNER_V2_VERSION),
  planHash: sha256,
  derivativeHash: sha256,
  ratios: z.array(ratioSchema).length(2),
  scenePlan: scenePlanSchema,
}).strict();
export type HistoryRenderDerivativeV2 = z.infer<typeof historyRenderDerivativeV2Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value: unknown): string { return hashText(stable(value)); }
function normalizeNarration(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(/[ \t]+\n/gu, "\n").trim();
}
function words(value: string): number { return value.trim().split(/\s+/u).filter(Boolean).length; }
const abbreviations = new Set(["dr.", "mr.", "mrs.", "ms.", "prof.", "sr.", "jr.", "st.", "vs.", "etc.", "e.g.", "i.e.", "a.m.", "p.m."]);
function isSentenceEnd(source: string, offset: number): boolean {
  const char = source[offset - 1];
  if (!char || !/[.!?…]/u.test(char)) return false;
  if (char === "." && /\d/u.test(source[offset - 2] ?? "") && /\d/u.test(source[offset] ?? "")) return false;
  const token = source.slice(0, offset).match(/[\p{L}.]+$/u)?.[0]?.toLocaleLowerCase();
  return !token || !abbreviations.has(token);
}
/** Extracts source ranges, retaining intervening whitespace in the following unit. */
export function extractHistoryNarrationUnits(source: string): readonly NarrationUnit[] {
  const narration = normalizeNarration(source);
  const ends: Array<{ end: number; kind: "sentence" | "paragraph" }> = [];
  for (let index = 1; index <= narration.length; index += 1) {
    if (isSentenceEnd(narration, index)) ends.push({ end: index, kind: "sentence" });
    else if (narration.slice(index - 2, index) === "\n\n") ends.push({ end: index, kind: "paragraph" });
  }
  const output: NarrationUnit[] = [];
  let start = 0;
  for (const boundary of ends) {
    if (boundary.end <= start || words(narration.slice(start, boundary.end)) === 0) continue;
    output.push({ id: `unit-${String(output.length + 1).padStart(3, "0")}`, start, end: boundary.end, textHash: hashText(narration.slice(start, boundary.end)), kind: boundary.kind, wordCount: words(narration.slice(start, boundary.end)) });
    start = boundary.end;
  }
  if (start < narration.length && words(narration.slice(start)) > 0) output.push({ id: `unit-${String(output.length + 1).padStart(3, "0")}`, start, end: narration.length, textHash: hashText(narration.slice(start)), kind: "incomplete", wordCount: words(narration.slice(start)) });
  return narrationUnitSchema.array().min(1).parse(output);
}

export interface HistoryTimingInput {
  readonly audioHash?: string;
  readonly durationMs?: number;
  readonly wordTimings?: readonly { readonly unitId: string; readonly startMs: number; readonly endMs: number }[];
  readonly wordsPerMinute?: number;
}
export function resolveHistoryV2Timing(units: readonly NarrationUnit[], input: HistoryTimingInput = {}): { readonly source: z.infer<typeof timingSourceSchema>; readonly units: readonly TimedNarrationUnit[]; readonly durationMs: number; readonly provisional: boolean } {
  const wpm = input.wordsPerMinute ?? 108;
  const audioHash = input.audioHash && sha256.safeParse(input.audioHash).success ? input.audioHash : undefined;
  const byId = new Map(input.wordTimings?.map((item) => [item.unitId, item]));
  const hasFullWordTiming = audioHash && units.every((unit) => {
    const item = byId.get(unit.id); return item && item.endMs > item.startMs;
  });
  if (hasFullWordTiming) {
    const source = { kind: "measured-word-timestamps" as const, audioHash };
    const timed = units.map((unit) => ({ ...unit, startMs: byId.get(unit.id)!.startMs, endMs: byId.get(unit.id)!.endMs, timingSource: source }));
    return { source, units: timedUnitSchema.array().parse(timed), durationMs: timed[timed.length - 1]!.endMs, provisional: false };
  }
  const estimateWeights = units.map((unit) => Math.max(1, unit.wordCount * 1_000));
  const durationMs = input.durationMs && Number.isInteger(input.durationMs) && input.durationMs > 0 ? input.durationMs : Math.round((units.reduce((sum, unit) => sum + unit.wordCount, 0) / wpm) * 60_000);
  const source = audioHash && input.durationMs ? { kind: "measured-audio-proportional" as const, audioHash } : { kind: "estimated-sentence" as const, wordsPerMinute: wpm };
  const totalWeight = estimateWeights.reduce((sum, value) => sum + value, 0);
  let startMs = 0;
  const timed = units.map((unit, index) => {
    const endMs = index === units.length - 1 ? durationMs : Math.round((estimateWeights.slice(0, index + 1).reduce((sum, value) => sum + value, 0) / totalWeight) * durationMs);
    const result = { ...unit, startMs, endMs: Math.max(startMs + 1, endMs), timingSource: source };
    startMs = result.endMs;
    return result;
  });
  return { source, units: timedUnitSchema.array().parse(timed), durationMs, provisional: source.kind === "estimated-sentence" };
}

export interface HistoryV2ResearchInput {
  readonly claims?: readonly { readonly id: string; readonly statement: string; readonly sourceIds: readonly string[]; readonly confidence?: number; readonly isQuotation?: boolean; readonly classification?: string }[];
  readonly sources?: readonly { readonly id: string; readonly rights?: "cleared" | "unknown" | "unavailable"; readonly url?: string }[];
}
export interface BuildHistoryVisualPlanV2Input {
  readonly episodeId: string;
  readonly narration: string;
  readonly targetDurationMs?: number;
  readonly timing?: HistoryTimingInput;
  readonly research?: HistoryV2ResearchInput;
}
function roleFor(index: number, count: number): z.infer<typeof beatSchema>["role"] {
  if (index === 0) return "hook";
  if (index === count - 1) return "conclusion";
  if (index / count > 0.72) return "aftermath";
  return index % 4 === 0 ? "turn" : "evidence";
}
function classifyAsset(textValue: string, hasEvidence: boolean): z.infer<typeof mediaKindSchema> {
  if (/\b(invasion|campaign|retreat|advance|crossed|route|march)\b/iu.test(textValue)) return "map-state";
  if (/\b(logistics|supply|attrition|because|consequence|economy|system)\b/iu.test(textValue)) return "diagram-state";
  if (hasEvidence && /\b(document|letter|portrait|painting|photograph|artifact)\b/iu.test(textValue)) return "archival";
  return "reconstruction";
}
function constraintsFor(value: string): z.infer<typeof constraintSchema>[] {
  const constraints: z.infer<typeof constraintSchema>[] = [{ kind: "exclusion", value: "No modern objects, invented text, unsupported uniforms, borders, or equipment." }];
  const year = value.match(/\b\d{4}\b/u)?.[0]; if (year) constraints.push({ kind: "date", value: year });
  const location = value.match(/\b(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\b/u)?.[0]; if (location) constraints.push({ kind: "place", value: location });
  return constraints;
}
function variantsFor(kind: z.infer<typeof mediaKindSchema>): z.infer<typeof compositionSchema>[] {
  const stateful = kind === "map-state" || kind === "diagram-state";
  return [
    { ratio: "16:9", strategy: stateful ? "recompose" : "native", focalRegion: "central subject with contextual margin", textSafeZone: "lower third clear", ...(stateful ? { layout: "wide legend and progressive annotations" } : {}) },
    { ratio: "9:16", strategy: stateful ? "split-panel" : "recompose", focalRegion: "central vertical focal subject", textSafeZone: "upper and lower safe zones clear", ...(stateful ? { layout: "portrait stack; label priority and overflow disclosure" } : {}) },
  ];
}
export function buildHistoryVisualPlanV2(input: BuildHistoryVisualPlanV2Input): HistoryVisualPlanV2 {
  const normalizedText = normalizeNarration(input.narration);
  const units = extractHistoryNarrationUnits(normalizedText);
  const timing = resolveHistoryV2Timing(units, input.timing);
  const claims = input.research?.claims ?? [];
  const sources = new Map((input.research?.sources ?? []).map((source) => [source.id, source]));
  const assets = timing.units.map((unit, index) => {
    const unitText = normalizedText.slice(unit.start, unit.end);
    const unitClaims = claims.filter((claim) => unitText.includes(claim.statement) || claim.statement.includes(unitText.trim()));
    const sourceIds = [...new Set(unitClaims.flatMap((claim) => claim.sourceIds))];
    const kind = classifyAsset(unitText, sourceIds.length > 0);
    const provenance = sourceIds.map((sourceId) => ({ sourceId, ...(sources.get(sourceId)?.url ? { locator: sources.get(sourceId)!.url } : {}), rights: sources.get(sourceId)?.rights ?? "unknown" as const, confidence: unitClaims.find((claim) => claim.sourceIds.includes(sourceId))?.confidence ?? 0.5, claimIds: unitClaims.filter((claim) => claim.sourceIds.includes(sourceId)).map((claim) => claim.id) }));
    const hardRequirements = kind === "map-state" ? ["map"] : kind === "diagram-state" ? ["diagram"] : [];
    return sourceAssetSchema.parse({ id: `asset-${String(index + 1).padStart(3, "0")}`, kind, title: `${kind.replace(/-/gu, " ")} for narration unit ${index + 1}`, selectionReason: hardRequirements.length ? `Semantic requirement: ${hardRequirements[0]}.` : "Selected for the narration unit's historical action and evidence availability.", hardRequirements, constraints: constraintsFor(unitText), provenance, confidence: unitClaims.length ? Math.min(...unitClaims.map((claim) => claim.confidence ?? 0.5)) : 0.65, illustrative: kind === "reconstruction", compositionVariants: variantsFor(kind) });
  });
  const beats = timing.units.map((unit, index) => beatSchema.parse({ id: `beat-${String(index + 1).padStart(3, "0")}`, narrationUnitIds: [unit.id], role: roleFor(index, timing.units.length), importance: index === 0 || index === timing.units.length - 1 ? 5 : 3, visualPurpose: `Clarify the complete narration unit ${index + 1} without changing its claim scope.`, claimIds: claims.filter((claim) => normalizedText.slice(unit.start, unit.end).includes(claim.statement)).map((claim) => claim.id), hardRequirements: assets[index]!.hardRequirements, assetId: assets[index]!.id }));
  const shots = timing.units.flatMap((unit, index) => (["16:9", "9:16"] as const).map((ratio, ratioIndex) => shotSchema.parse({ id: `shot-${String(index * 2 + ratioIndex + 1).padStart(3, "0")}`, beatId: beats[index]!.id, assetId: assets[index]!.id, narrationUnitIds: [unit.id], startMs: unit.startMs, endMs: unit.endMs, purpose: beats[index]!.visualPurpose, compositionRatio: ratio })));
  const states = assets.flatMap((asset, index) => asset.kind === "map-state" || asset.kind === "diagram-state" ? [stateSchema.parse({ id: `${asset.kind === "map-state" ? "map" : "diagram"}-state-${String(index + 1).padStart(3, "0")}`, masterId: `${asset.kind}-master-001`, order: index, claimIds: beats[index]!.claimIds, labels: asset.constraints.filter((constraint) => constraint.kind === "place").map((constraint) => constraint.value), routesOrRelationships: [beats[index]!.visualPurpose], scale: asset.kind === "map-state" ? "strategic" : "tactical", cameraOrLayout: asset.compositionVariants[1]!.layout ?? "state progression", disclosure: "Interpretive explanatory state; source confidence is displayed with the linked claim." })] : []);
  const raw = { schemaVersion: HISTORY_VISUAL_PLANNER_V2_VERSION, plannerVersion: HISTORY_VISUAL_PLANNER_V2_VERSION, policyVersion: HISTORY_VISUAL_PLANNER_V2_POLICY_VERSION, episodeId: input.episodeId, narration: { normalizedText, sourceHash: hashText(normalizedText), sourceLength: normalizedText.length, units }, timing: { source: timing.source, durationMs: timing.durationMs, ...(input.targetDurationMs ? { targetDurationMs: input.targetDurationMs, deltaMs: timing.durationMs - input.targetDurationMs } : { deltaMs: 0 }), provisional: timing.provisional }, timedUnits: timing.units, beats, assets, shots, states, requiredRatios: ["16:9", "9:16"] as const };
  return historyVisualPlanV2Schema.parse({ ...raw, planHash: digest(raw) });
}

function diagnostic(code: string, severity: "error" | "warning", message: string, remediation: string, affectedIds: readonly string[] = []): HistoryVisualV2Diagnostic { return { code, severity, message, remediation, affectedIds: [...affectedIds] }; }
export function validateHistoryVisualPlanV2(plan: HistoryVisualPlanV2, expected?: { readonly sourceNarration?: string; readonly lineageNarration?: string; readonly derivative?: HistoryRenderDerivativeV2 }): HistoryVisualV2Validation {
  const diagnostics: HistoryVisualV2Diagnostic[] = [];
  const textValue = plan.narration.normalizedText;
  const rangeEnd = plan.timedUnits.at(-1)?.end ?? 0;
  if (plan.narration.sourceHash !== hashText(textValue) || plan.narration.sourceLength !== textValue.length) diagnostics.push(diagnostic("NARRATION_SOURCE_HASH_MISMATCH", "error", "The narration metadata does not match the normalized source text.", "Recreate the v2 plan from the canonical narration."));
  if (expected?.sourceNarration && normalizeNarration(expected.sourceNarration) !== textValue) diagnostics.push(diagnostic("NARRATION_LINEAGE_MISMATCH", "error", "The imported/source narration and planning narration disagree.", "Resolve the source lineage; neither artifact was overwritten."));
  if (expected?.lineageNarration && normalizeNarration(expected.lineageNarration) !== textValue) diagnostics.push(diagnostic("NARRATION_LINEAGE_MISMATCH", "error", "The verified narration and planning narration disagree.", "Resolve the script repair lineage before approval."));
  if (plan.timedUnits[0]?.start !== 0 || rangeEnd !== textValue.length || plan.timedUnits.some((unit, index) => index > 0 && plan.timedUnits[index - 1]!.end !== unit.start)) diagnostics.push(diagnostic("NARRATION_RANGE_COVERAGE", "error", "Narration ranges are not contiguous full-source coverage.", "Re-segment the canonical narration without clipping text."));
  if (plan.timedUnits.at(-1)?.kind === "incomplete") diagnostics.push(diagnostic("NARRATION_FINAL_BOUNDARY_INVALID", "error", "The final narration unit does not end at a sentence or intentional paragraph boundary.", "Complete or explicitly paragraph-bound the final narration before planning."));
  if (plan.timedUnits.some((unit, index) => unit.endMs <= unit.startMs || (index > 0 && plan.timedUnits[index - 1]!.endMs > unit.startMs))) diagnostics.push(diagnostic("TIMING_NON_MONOTONIC", "error", "Narration timing overlaps or is non-monotonic.", "Repair measured alignment or timing input."));
  if (plan.timing.targetDurationMs !== undefined) {
    const tolerance = plan.timing.source.kind === "estimated-sentence" ? Math.max(1_000, Math.round(plan.timing.targetDurationMs * 0.01)) : 250;
    if (Math.abs(plan.timing.deltaMs) > tolerance) diagnostics.push(diagnostic("NARRATION_DURATION_CONFLICT", "error", `Complete narration differs from the declared target by ${plan.timing.deltaMs}ms.`, "Revise the target or narration; do not clip a unit."));
  }
  if (plan.timing.provisional) diagnostics.push(diagnostic("TIMING_ESTIMATE_FALLBACK", "warning", "No immutable measured audio timing is attached; this is provisional plan review only.", "Reconcile after audio and obtain a revision-bound approval."));
  const ratios = new Set(plan.assets.flatMap((asset) => asset.compositionVariants.map((variant) => variant.ratio)));
  if (["16:9", "9:16"].some((ratio) => !ratios.has(ratio as "16:9" | "9:16"))) diagnostics.push(diagnostic("RATIO_VARIANT_MISSING", "error", "A required composition ratio is missing.", "Author both 16:9 and 9:16 variants."));
  for (const asset of plan.assets) {
    if (asset.kind === "reconstruction" && (asset.constraints.length === 0 || !asset.illustrative)) diagnostics.push(diagnostic("RECONSTRUCTION_CONSTRAINTS_MISSING", "error", `Reconstruction ${asset.id} lacks constraints or illustrative disclosure.`, "Add claim-derived constraints and the illustrative classification.", [asset.id]));
    if (["archival", "document", "portrait", "quotation"].includes(asset.kind) && asset.provenance.some((entry) => entry.rights !== "cleared")) diagnostics.push(diagnostic("EVIDENCE_RIGHTS_UNRESOLVED", "error", `Evidence asset ${asset.id} has unresolved rights.`, "Use cleared evidence or select a disclosed non-evidence alternative.", [asset.id]));
  }
  if (expected?.derivative && (expected.derivative.planHash !== plan.planHash || expected.derivative.planSchemaVersion !== HISTORY_VISUAL_PLANNER_V2_VERSION)) diagnostics.push(diagnostic("STALE_RENDER_DERIVATIVE", "error", "The render derivative does not bind the current v2 plan.", "Rebuild the opt-in History derivative and reapprove it."));
  return historyVisualV2ValidationSchema.parse({ schemaVersion: HISTORY_VISUAL_PLANNER_V2_VERSION, planHash: plan.planHash, valid: !diagnostics.some((item) => item.severity === "error"), diagnostics, sourceNarrationCharacters: textValue.length, plannedNarrationCharacters: rangeEnd, sourceUnitCount: plan.narration.units.length, plannedUnitCount: plan.timedUnits.length, finalRangeEnd: rangeEnd, durationMs: plan.timing.durationMs, ...(plan.timing.targetDurationMs ? { targetDurationMs: plan.timing.targetDurationMs } : {}), deltaMs: plan.timing.deltaMs, timingSource: plan.timing.source });
}

export function compileHistoryRenderDerivativeV2(plan: HistoryVisualPlanV2): HistoryRenderDerivativeV2 {
  const primaryShots = plan.shots.filter((shot) => shot.compositionRatio === "16:9");
  const byAsset = new Map(plan.assets.map((asset) => [asset.id, asset]));
  const scenes = primaryShots.map((shot, index) => {
    const asset = byAsset.get(shot.assetId)!;
    const unitText = shot.narrationUnitIds.map((id) => plan.timedUnits.find((unit) => unit.id === id)!).map((unit) => plan.narration.normalizedText.slice(unit.start, unit.end)).join(" ").trim();
    const startSeconds = shot.startMs / 1_000; const endSeconds = shot.endMs / 1_000;
    return { id: `scene-${String(index + 1).padStart(3, "0")}`, sequenceNumber: index + 1, canonicalNarration: unitText, sourceSegmentIds: [`scene-${String(index + 1).padStart(3, "0")}`], estimatedDurationSeconds: endSeconds - startSeconds, timing: { startSeconds, endSeconds }, visualPurpose: shot.purpose, textRequirement: { required: false }, subject: asset.title, action: asset.selectionReason, setting: asset.constraints.map((constraint) => constraint.value).join("; "), composition: asset.compositionVariants.map((variant) => `${variant.ratio}: ${variant.strategy}; ${variant.focalRegion}`).join(" | "), cameraFraming: "History documentary composition", mood: "evidence-aware", continuityReferences: index ? [`scene-${String(index).padStart(3, "0")}`] : [], onScreenText: "", negativeConstraints: asset.constraints.filter((constraint) => constraint.kind === "exclusion").map((constraint) => constraint.value), aspectRatios: ["16:9", "9:16"], imagePrompt: `${asset.kind}: ${asset.title}. ${asset.constraints.map((constraint) => constraint.value).join(" ")}`, expectedImageFilenames: [sceneFilename(index + 1, startSeconds, endSeconds, "16:9"), sceneFilename(index + 1, startSeconds, endSeconds, "9:16")], qualityStatus: "draft" as const };
  });
  const scenePlan = scenePlanSchema.parse({ sourceId: plan.episodeId, scenes });
  const raw = { schemaVersion: HISTORY_VISUAL_ADAPTER_V2_VERSION, planSchemaVersion: HISTORY_VISUAL_PLANNER_V2_VERSION, planHash: plan.planHash, ratios: ["16:9", "9:16"] as const, scenePlan };
  return historyRenderDerivativeV2Schema.parse({ ...raw, derivativeHash: digest(raw) });
}

function renderPack(plan: HistoryVisualPlanV2, validation: HistoryVisualV2Validation, derivative: HistoryRenderDerivativeV2): string {
  const errors = validation.diagnostics.filter((item) => item.severity === "error");
  const warnings = validation.diagnostics.filter((item) => item.severity === "warning");
  const mix = plan.assets.reduce<Record<string, number>>((value, asset) => ({ ...value, [asset.kind]: (value[asset.kind] ?? 0) + 1 }), {});
  return `# History visual approval pack (v2)\n\nPlan: \`${plan.planHash}\`  \nDerivative: \`${derivative.derivativeHash}\`\n\n- Narration: ${validation.plannedNarrationCharacters}/${validation.sourceNarrationCharacters} characters; ${validation.plannedUnitCount}/${validation.sourceUnitCount} units\n- Timing: ${validation.durationMs}ms (${plan.timing.source.kind}); delta ${validation.deltaMs}ms\n- Ratios: ${derivative.ratios.join(", ")}\n- Asset mix (actual): ${Object.entries(mix).map(([kind, count]) => `${kind} ${count}`).join(", ")}\n- Stateful map/diagram frames: ${plan.states.length}\n\n## Diagnostics\n\nErrors: ${errors.length ? errors.map((item) => `${item.code}: ${item.message}`).join("; ") : "none"}\n\nWarnings: ${warnings.length ? warnings.map((item) => `${item.code}: ${item.message}`).join("; ") : "none"}\n\n## Unit timeline\n\n${plan.timedUnits.map((unit) => `- ${unit.id}: ${unit.start}–${unit.end} chars; ${unit.startMs}–${unit.endMs}ms`).join("\n")}\n\n## Approval\n\n\`mediaforge history visuals approve ${plan.episodeId} --planner-version v2 --plan-hash ${plan.planHash} --derivative-hash ${derivative.derivativeHash}\`\n`;
}
export async function planHistoryVisualsV2(request: { readonly episodeId: string; readonly outputRoot?: string; readonly targetDurationMs?: number; readonly timing?: HistoryTimingInput; }): Promise<{ readonly plan: HistoryVisualPlanV2; readonly validation: HistoryVisualV2Validation; readonly derivative: HistoryRenderDerivativeV2; readonly cached: boolean; }> {
  const root = path.join(path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(request.episodeId));
  const sourceDir = path.join(root, "source"); const scriptPath = path.join(root, "languages", "script-en.md");
  const narration = await fs.readFile(scriptPath, "utf8");
  let metadata: { runtime?: { targetDurationMinutes?: number } } = {}; try { metadata = JSON.parse(await fs.readFile(path.join(sourceDir, "normalized-metadata.json"), "utf8")) as typeof metadata; } catch { /* narration-only diagnostics */ }
  let imported: string | undefined; try { imported = await fs.readFile(path.join(sourceDir, "canonical-narration-en.md"), "utf8"); } catch { /* legacy imports predate lineage artifact */ }
  let verified: string | undefined; try { verified = await fs.readFile(path.join(sourceDir, "verified-narration-en.md"), "utf8"); } catch { /* no repaired lineage yet */ }
  const targetDurationMs = request.targetDurationMs ?? (metadata.runtime?.targetDurationMinutes ? Math.round(metadata.runtime.targetDurationMinutes * 60_000) : undefined);
  const plan = buildHistoryVisualPlanV2({ episodeId: request.episodeId, narration, ...(targetDurationMs ? { targetDurationMs } : {}), ...(request.timing ? { timing: request.timing } : {}) });
  const derivative = compileHistoryRenderDerivativeV2(plan);
  const validation = validateHistoryVisualPlanV2(plan, { ...(imported ? { sourceNarration: imported } : {}), ...(verified ? { lineageNarration: verified } : {}), derivative });
  const files = v2ArtifactFiles(sourceDir, plan.planHash, derivative.derivativeHash);
  let cached = false; try { cached = historyVisualPlanV2Schema.parse(JSON.parse(await fs.readFile(files.plan, "utf8"))).planHash === plan.planHash; } catch { /* a v1 artifact is intentionally never a v2 cache hit */ }
  // Hash-addressed files are immutable revisions. Replanning never resets or
  // rewrites an earlier v1/v2 approval decision.
  await Promise.all([writeJsonAtomic(files.plan, plan), writeJsonAtomic(files.derivative, derivative), writeJsonAtomic(files.validation, validation), writeTextAtomic(files.pack, renderPack(plan, validation, derivative))]);
  return { plan, validation, derivative, cached };
}
export async function decideHistoryVisualApprovalV2(request: { readonly episodeId: string; readonly outputRoot?: string; readonly decision: "APPROVED" | "REJECTED"; readonly planHash?: string; readonly derivativeHash?: string; readonly reason?: string; }): Promise<{ readonly state: string; readonly planHash: string; readonly derivativeHash: string; }> {
  const root = path.join(path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(request.episodeId)); const source = path.join(root, "source");
  if (!request.planHash || !request.derivativeHash) throw new Error("History v2 approval requires explicit plan and derivative hashes.");
  const files = v2ArtifactFiles(source, request.planHash, request.derivativeHash);
  const [plan, derivative, validation] = await Promise.all([fs.readFile(files.plan, "utf8").then(JSON.parse).then(historyVisualPlanV2Schema.parse), fs.readFile(files.derivative, "utf8").then(JSON.parse).then(historyRenderDerivativeV2Schema.parse), fs.readFile(files.validation, "utf8").then(JSON.parse).then(historyVisualV2ValidationSchema.parse)]);
  if (request.decision === "APPROVED" && (!validation.valid || request.planHash !== plan.planHash || request.derivativeHash !== derivative.derivativeHash)) throw new Error("History v2 approval is blocked by diagnostics or stale plan/derivative hashes.");
  await writeJsonAtomic(path.join(source, `history-visual-approval.v2-${plan.planHash}-${derivative.derivativeHash}.json`), { schemaVersion: HISTORY_VISUAL_PLANNER_V2_VERSION, state: request.decision, planHash: plan.planHash, derivativeHash: derivative.derivativeHash, approvalScope: plan.timing.provisional ? "provisional-plan-review" : "renderable-derivative", ...(request.reason ? { reason: request.reason } : {}), decidedAt: new Date().toISOString() });
  return { state: request.decision, planHash: plan.planHash, derivativeHash: derivative.derivativeHash };
}

/**
 * Post-audio reconciliation is deliberately separate from semantic planning.
 * The caller supplies the local probe so planning has no provider dependency.
 */
export async function reconcileHistoryVisualAudioV2(request: { readonly episodeId: string; readonly audioPath: string; readonly outputRoot?: string; readonly targetDurationMs?: number; readonly probeAudio: (filePath: string) => Promise<{ readonly durationSeconds: number }>; }): Promise<{ readonly plan: HistoryVisualPlanV2; readonly validation: HistoryVisualV2Validation; readonly derivative: HistoryRenderDerivativeV2; readonly cached: boolean; }> {
  const audioHash = await hashFile(request.audioPath);
  const probe = await request.probeAudio(request.audioPath);
  const durationMs = Math.round(probe.durationSeconds * 1_000);
  if (!Number.isInteger(durationMs) || durationMs <= 0) throw new Error("Measured History audio duration must be a positive integer millisecond value.");
  return planHistoryVisualsV2({ episodeId: request.episodeId, ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}), ...(request.targetDurationMs ? { targetDurationMs: request.targetDurationMs } : {}), timing: { audioHash, durationMs } });
}

export async function inspectHistoryVisualV2(request: { readonly episodeId: string; readonly planHash: string; readonly outputRoot?: string; }): Promise<HistoryVisualV2Validation> {
  const root = path.join(path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(request.episodeId));
  return historyVisualV2ValidationSchema.parse(JSON.parse(await fs.readFile(path.join(root, "source", `history-visual-validation.v2-${sha256.parse(request.planHash)}.json`), "utf8")));
}

function v2ArtifactFiles(source: string, planHash: string, derivativeHash: string): { readonly plan: string; readonly derivative: string; readonly validation: string; readonly pack: string } {
  return {
    plan: path.join(source, `history-visual-plan.v2-${planHash}.json`),
    derivative: path.join(source, `history-render-derivative.v2-${derivativeHash}.json`),
    validation: path.join(source, `history-visual-validation.v2-${planHash}.json`),
    pack: path.join(source, `history-approval-pack.v2-${planHash}.md`),
  };
}
