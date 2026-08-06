import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeEpisodeId, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { assessHistoryEditorialV32, type HistoryPurposeV32 } from "./history-editorial-v32.js";
import { selectHistoryDiagramFallbackV32 } from "./history-geo-v32.js";
import { classifyHistoryClaimMaterialityV32, deriveHistoryClaimProvenanceV32, type HistoryClaimProvenanceV32 } from "./history-provenance-v32.js";
import { HISTORY_VISUAL_PLANNER_V32, HISTORY_VISUAL_SCHEMA_V32, summarizeHistoryApprovalV32, type HistoryDiagnosticV32 } from "./history-v32-contracts.js";
import { allocateHistoryTimingV32, classifyHistoryTimingDeltaV32, estimateHistoryTimingV32 } from "./history-timing-v32.js";
import { buildHistoryVisualPlanV31 } from "./visual-planner-v31.js";

const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const diagnostic = (code: string, gate: HistoryDiagnosticV32["gate"], message: string, affectedIds: readonly string[] = [], severity: HistoryDiagnosticV32["severity"] = "error"): HistoryDiagnosticV32 => ({ code, gate, message, severity, remediation: "Resolve the V3.2 diagnostic and regenerate from canonical inputs.", affectedIds: [...affectedIds] });

export interface HistoryVisualPlanV32 {
  readonly schemaVersion: typeof HISTORY_VISUAL_SCHEMA_V32;
  readonly plannerVersion: typeof HISTORY_VISUAL_PLANNER_V32;
  readonly episodeId: string;
  readonly narration: { readonly normalizationVersion: "history-timing.v3.2.0"; readonly rawScriptSha256: string; readonly normalizedNarrationSha256: string; readonly normalizedText: string; readonly units: readonly { readonly id: string; readonly start: number; readonly end: number; readonly durationMs: number }[] };
  readonly timing: { readonly timingSource: "provisional-word-estimate" | "measured-tts-audio"; readonly totalDurationMs: number; readonly baseSpeechMs: number; readonly punctuationPauseMs: number; readonly paragraphPauseMs: number; readonly chapterPauseMs: number; readonly declaredDurationMs?: number; readonly deltaSeverity: "pass" | "warning" | "block"; readonly measuredAudioSha256?: string };
  readonly claims: readonly { readonly id: string; readonly text: string; readonly provenance: HistoryClaimProvenanceV32 }[];
  readonly visual: { readonly mapCount: number; readonly diagramFallback: ReturnType<typeof selectHistoryDiagramFallbackV32>; readonly purposes: readonly HistoryPurposeV32[]; readonly ratios: readonly { readonly ratio: "16:9" | "9:16"; readonly maxLabels: number; readonly minLabelPx: number; readonly titleSafeZones: readonly string[]; readonly independentRenderRequired: boolean }[] };
  readonly approval: ReturnType<typeof summarizeHistoryApprovalV32>;
  readonly diagnostics: readonly HistoryDiagnosticV32[];
  readonly planHash: string;
}

export function buildHistoryVisualPlanV32(input: { readonly episodeId: string; readonly narration: string; readonly targetDurationMs?: number; readonly chapters?: number; readonly spokenWordCount?: number; readonly timingSource?: "provisional-word-estimate" | "measured-tts-audio"; readonly measuredAudioSha256?: string }): HistoryVisualPlanV32 {
  const seed = buildHistoryVisualPlanV31({ episodeId: input.episodeId, narration: input.narration, ...(input.targetDurationMs ? { targetDurationMs: input.targetDurationMs } : {}) });
  const timing = estimateHistoryTimingV32(input.narration, { paragraphCount: input.narration.split(/\n\s*\n/gu).length, chapterCount: input.chapters ?? 0, ...(input.spokenWordCount === undefined ? {} : { spokenWordCount: input.spokenWordCount }) });
  const durations = allocateHistoryTimingV32(timing.totalDurationMs, seed.narration.units.map((unit) => Math.max(1, unit.end - unit.start)));
  let offset = 0;
  const units = seed.narration.units.map((unit, index) => { const durationMs = durations[index]!; const value = { id: unit.id, start: unit.start, end: unit.end, durationMs }; offset += durationMs; return value; });
  const planHashSeed = digest({ episodeId: input.episodeId, raw: timing.rawScriptSha256, normalized: timing.normalizedNarrationSha256, duration: timing.totalDurationMs });
  const claims = seed.claims.map((claim) => {
    const materiality = classifyHistoryClaimMaterialityV32({ kind: claim.kind, drivesMap: seed.mapStates.some((state) => state.claimIds.includes(claim.id)), drivesDiagram: seed.diagramStates.some((state) => state.claimIds.includes(claim.id)) });
    return { id: claim.id, text: claim.text, provenance: deriveHistoryClaimProvenanceV32({ claimId: claim.id, ...materiality, narrationSha256: timing.normalizedNarrationSha256, planHash: planHashSeed, sources: [], evidence: [], links: [] }) };
  });
  const purposes = seed.beats.map((beat, index) => { const excerpt = beat.coveredNarrationUnitIds.map((id) => seed.narration.units.find((unit) => unit.id === id)).filter((unit): unit is NonNullable<typeof unit> => Boolean(unit)).map((unit) => input.narration.slice(unit.start, unit.end)).join(" ").replace(/\s+/gu, " ").trim(); return { id: beat.id, editorialFunction: beat.editorialRole, subject: excerpt.split(/\s+/u).slice(0, 14).join(" ") || `Sequence ${index + 1}`, evidence: beat.visualPurpose, changeOrUncertainty: beat.causalMechanism ?? beat.contrast ?? (excerpt.split(/\s+/u).slice(14, 28).join(" ") || "Narration-grounded context"), supportingClaimIds: beat.claimIds }; });
  const cameraTreatments = ["locked evidence frame", "slow route reveal", "detail crop", "comparison frame", "annotation overlay", "parallax evidence layer"];
  const transitions = ["cut on evidence", "dissolve to contrast", "map wipe", "hold then cut", "match dissolve", "chapter fade"];
  const editorial = assessHistoryEditorialV32({ purposes, cameras: seed.shots.map((_shot, index) => cameraTreatments[index % cameraTreatments.length]!), transitions: seed.shots.map((_shot, index) => transitions[index % transitions.length]!) });
  const diagnostics: HistoryDiagnosticV32[] = [];
  for (const claim of claims) if (claim.provenance.material && !["supported", "overridden"].includes(claim.provenance.status)) diagnostics.push(diagnostic("CLAIM_PROVENANCE_UNRESOLVED", "content", "Material claim lacks verified human provenance.", [claim.id]));
  if ((input.timingSource ?? "provisional-word-estimate") === "provisional-word-estimate") diagnostics.push(diagnostic("TIMING_ESTIMATE_PROVISIONAL", "production", "Measured immutable narration audio is required for production eligibility."));
  const deltaSeverity = classifyHistoryTimingDeltaV32(timing.totalDurationMs, input.targetDurationMs);
  if (deltaSeverity === "block") diagnostics.push(diagnostic("TIMING_DELTA_BLOCK", "structural", "Declared duration differs beyond V3.2 timing tolerance."));
  else if (deltaSeverity === "warning") diagnostics.push(diagnostic("TIMING_DELTA_WARNING", "structural", "Declared duration differs beyond pass tolerance.", [], "warning"));
  for (const item of editorial.diagnostics) diagnostics.push(diagnostic(item.code, "editorial", "Editorial repetition threshold exceeded.", item.affectedIds, item.severity));
  const body = { schemaVersion: HISTORY_VISUAL_SCHEMA_V32, plannerVersion: HISTORY_VISUAL_PLANNER_V32, episodeId: input.episodeId, narration: { normalizationVersion: "history-timing.v3.2.0" as const, rawScriptSha256: timing.rawScriptSha256, normalizedNarrationSha256: timing.normalizedNarrationSha256, normalizedText: timing.normalizedNarration, units }, timing: { timingSource: input.timingSource ?? "provisional-word-estimate" as const, totalDurationMs: timing.totalDurationMs, baseSpeechMs: timing.baseSpeechMs, punctuationPauseMs: timing.punctuationPauseMs, paragraphPauseMs: timing.paragraphPauseMs, chapterPauseMs: timing.chapterPauseMs, ...(input.targetDurationMs ? { declaredDurationMs: input.targetDurationMs } : {}), deltaSeverity, ...(input.measuredAudioSha256 ? { measuredAudioSha256: input.measuredAudioSha256 } : {}) }, claims, visual: { mapCount: seed.mapStates.length, diagramFallback: selectHistoryDiagramFallbackV32({ hasVerifiedDiagramEvidence: false, hasMap: seed.mapStates.length > 0, hasTimeline: true, hasQuotation: false }), purposes, ratios: [{ ratio: "16:9" as const, maxLabels: 12, minLabelPx: 28, titleSafeZones: ["top-10%", "bottom-10%"], independentRenderRequired: false }, { ratio: "9:16" as const, maxLabels: 8, minLabelPx: 32, titleSafeZones: ["top-10%", "bottom-10%"], independentRenderRequired: true }] }, diagnostics, approval: summarizeHistoryApprovalV32(diagnostics) };
  return { ...body, planHash: digest(body) };
}

export function validateHistoryVisualPlanV32(plan: HistoryVisualPlanV32): { readonly approval: HistoryVisualPlanV32["approval"]; readonly diagnostics: readonly HistoryDiagnosticV32[] } {
  const { planHash: _ignored, ...body } = plan;
  const expected = digest(body);
  if (expected !== plan.planHash) throw new Error("History V3.2 plan hash cannot be recomputed.");
  if (plan.narration.units.reduce((sum, unit) => sum + unit.durationMs, 0) !== plan.timing.totalDurationMs) throw new Error("History V3.2 narration allocation does not equal planned duration.");
  return { approval: plan.approval, diagnostics: plan.diagnostics };
}

export async function planHistoryVisualsV32(request: { readonly episodeId: string; readonly outputRoot?: string; readonly targetDurationMs?: number; readonly force?: boolean }): Promise<{ readonly plan: HistoryVisualPlanV32; readonly validation: ReturnType<typeof validateHistoryVisualPlanV32>; readonly cached: boolean }> {
  const root = path.join(path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(request.episodeId));
  const source = path.join(root, "source");
  const narration = await fs.readFile(path.join(root, "languages", "script-en.md"), "utf8");
  let targetDurationMs = request.targetDurationMs;
  let spokenWordCount: number | undefined;
  if (!targetDurationMs || spokenWordCount === undefined) try { const metadata = JSON.parse(await fs.readFile(path.join(source, "normalized-metadata.json"), "utf8")) as { runtime?: { targetDurationMinutes?: number; calculatedNarrationWordCount?: number } }; targetDurationMs ??= metadata.runtime?.targetDurationMinutes ? metadata.runtime.targetDurationMinutes * 60_000 : undefined; spokenWordCount = metadata.runtime?.calculatedNarrationWordCount; } catch { /* no declared target */ }
  const plan = buildHistoryVisualPlanV32({ episodeId: request.episodeId, narration, ...(targetDurationMs ? { targetDurationMs } : {}), ...(spokenWordCount === undefined ? {} : { spokenWordCount }) });
  const validation = validateHistoryVisualPlanV32(plan);
  const base = path.join(source, `history-visual-plan.v3.2-${plan.planHash}.json`);
  let cached = false; try { cached = JSON.parse(await fs.readFile(base, "utf8")).planHash === plan.planHash; } catch { /* cache miss */ }
  if (!cached || request.force) await Promise.all([writeJsonAtomic(base, plan), writeJsonAtomic(path.join(source, `history-visual-validation.v3.2-${plan.planHash}.json`), validation), writeTextAtomic(path.join(source, `history-approval-pack.v3.2-${plan.planHash}.md`), `# History V3.2 approval pack\n\nPlan hash: \`${plan.planHash}\`\n\nStructural: ${plan.approval.structural.state}; editorial: ${plan.approval.editorial.state}; content: ${plan.approval.content.state}; production: ${plan.approval.production.state}.\n`) ]);
  return { plan, validation, cached };
}

export async function decideHistoryVisualApprovalV32(request: { readonly episodeId: string; readonly outputRoot?: string; readonly decision: "APPROVED" | "REJECTED"; readonly planHash?: string; readonly reason?: string }): Promise<{ readonly state: string; readonly planHash: string }> {
  if (!request.planHash) throw new Error("History V3.2 approval requires an explicit plan hash.");
  const source = path.join(path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")), normalizeEpisodeId(request.episodeId), "source");
  const plan = JSON.parse(await fs.readFile(path.join(source, `history-visual-plan.v3.2-${request.planHash}.json`), "utf8")) as HistoryVisualPlanV32;
  validateHistoryVisualPlanV32(plan);
  if (request.decision === "APPROVED" && (plan.approval.content.state !== "eligible" || plan.approval.production.state !== "eligible")) throw new Error("History V3.2 approval is blocked by content provenance or production timing.");
  await writeJsonAtomic(path.join(source, `history-visual-approval.v3.2-${plan.planHash}.json`), { state: request.decision, planHash: plan.planHash, ...(request.reason ? { reason: request.reason } : {}) });
  return { state: request.decision, planHash: plan.planHash };
}
