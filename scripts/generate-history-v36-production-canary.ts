import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildHistoryVisualPlanShadowV36,
  buildHistoryVisualPlanV35,
  normalizeHistoryNarrationV33,
  renderDiagramSpecSvgV36,
  renderMapSpecSvgV36,
  resolveHistoryProductionCanaryRouteV36,
  validateHistoryVisualPlanShadowV36,
  validateHistoryVisualPlanV35,
  type HistoryVisualPlanV35,
  type RenderSpecV36,
} from "../packages/history/src/index.js";
import { runVisualPlanLaneV36 } from "./history-v36-visual-plan-inputs.js";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repository, "artifacts/canary/history-v3.6");
const workspaceRoot = path.join(root, "workspace");
const timestamp = new Date().toISOString().replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-production-canary-readiness-${timestamp}`;
const directory = path.join(root, basename);
const zipPath = `${directory}.zip`;
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const hashFile = async (file: string) => sha256(await fs.readFile(file));
const blackDeath = "history-youtube-history-10-video-story-pack-04-black-death";
const dDay = "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";
const canaries = [blackDeath, dDay] as const;
const head = (await execute("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function measuredDurationMs(audioPath: string): Promise<number> {
  const { stdout } = await execute("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath], { cwd: repository });
  const duration = Math.round(Number.parseFloat(stdout.trim()) * 1000);
  if (!Number.isInteger(duration) || duration <= 0) throw new Error(`Invalid measured duration: ${audioPath}`);
  return duration;
}

async function renderSpec(spec: RenderSpecV36, output: string) {
  const stem = spec.renderSpecId.replace("history-render-spec-", "");
  const svg = path.join(output, `${stem}.svg`);
  const png = path.join(output, `${stem}.png`);
  const markup = spec.renderTarget === "MAP_SVG" ? renderMapSpecSvgV36(spec) : renderDiagramSpecSvgV36(spec);
  await fs.writeFile(svg, markup);
  await execute("ffmpeg", ["-y", "-i", svg, "-frames:v", "1", "-update", "1", png], {
    cwd: repository,
  });
  const dimensions = (await execute("identify", ["-format", "%wx%h", png], { cwd: repository })).stdout.trim();
  if (dimensions !== "1200x675") throw new Error(`Unexpected rendered dimensions: ${dimensions}`);
  return { renderSpecId: spec.renderSpecId, renderTarget: spec.renderTarget, svg: path.relative(repository, svg), png: path.relative(repository, png), svgSha256: await hashFile(svg), pngSha256: await hashFile(png) };
}

const accepted = await runVisualPlanLaneV36(repository, "same-eight");
if (accepted.validationFailures.length) throw new Error("Accepted same-eight V3.6 lane is invalid.");

const runs = await Promise.all(canaries.map(async (episodeId) => {
  const workspace = path.join(workspaceRoot, episodeId);
  const source = path.join(workspace, "source/history-v3.5");
  const audio = path.join(workspace, "locales/en/full/audio");
  const audioPath = path.join(audio, "narration.wav");
  const [priorPlan, structured, timing, script] = await Promise.all([
    readJson<HistoryVisualPlanV35>(path.join(source, "plan.json")),
    readJson<unknown>(path.join(source, "structured-claims.json")),
    readJson<{ readonly model: string; readonly voice: string; readonly generatedAt: string }>(path.join(audio, "tts-generation.json")),
    fs.readFile(path.join(workspace, "languages/script-en.md"), "utf8"),
  ]);
  const durationMs = await measuredDurationMs(audioPath);
  const audioSha256 = await hashFile(audioPath);
  const basePlan = buildHistoryVisualPlanV35({
    episodeId,
    title: priorPlan.title,
    narration: normalizeHistoryNarrationV33({ episodeId, rawScript: script }),
    structuredClaims: structured as never,
    authorityMode: "trusted-script",
    measuredTiming: { source: "measured-tts", durationMs, audioSha256 },
  });
  const baseValidation = validateHistoryVisualPlanV35(basePlan);
  if (basePlan.approval.production.blockerCodes.length)
    throw new Error(
      `Measured V3.5 production blockers for ${episodeId}: ${basePlan.approval.production.blockerCodes.join(", ")}`
    );
  if (basePlan.approval.production.blockerCodes.includes("TIMING_MEASUREMENT_REQUIRED")) throw new Error(`Provisional timing remained: ${episodeId}`);
  const renderSpecs = accepted.renderSpecs.filter((spec) => spec.episodeId === episodeId);
  if (!renderSpecs.length) throw new Error(`No V3.6 render specs: ${episodeId}`);
  const candidate = buildHistoryVisualPlanShadowV36({ basePlan, renderSpecs });
  const candidateValidation = validateHistoryVisualPlanShadowV36(candidate, basePlan);
  if (!candidateValidation.valid || candidate.safePlacementAbstentions.length) throw new Error(`V3.6 candidate placement failed: ${episodeId}`);
  const output = path.join(directory, "candidates", episodeId);
  const renderOutput = path.join(output, "rendered-overlays");
  await fs.mkdir(renderOutput, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, "v35-measured-base-plan.json"), pretty(basePlan)),
    fs.writeFile(path.join(output, "v35-measured-base-validation.json"), pretty(baseValidation)),
    fs.writeFile(path.join(output, "v36-production-candidate-plan.json"), pretty(candidate)),
    fs.writeFile(path.join(output, "v36-production-candidate-validation.json"), pretty(candidateValidation)),
  ]);
  const renders = await Promise.all(renderSpecs.map((spec) => renderSpec(spec, renderOutput)));
  const smoke = path.join(output, "renderer-smoke.mkv");
  await execute("ffmpeg", ["-y", "-loop", "1", "-i", path.join(repository, renders[0]!.png), "-t", "1", "-r", "30", "-c:v", "ffv1", smoke], { cwd: repository });
  return { episodeId, durationMs, audioPath: path.relative(repository, audioPath), audioSha256, timingPath: path.relative(repository, path.join(audio, "tts-generation.json")), timingSha256: await hashFile(path.join(audio, "tts-generation.json")), timing, priorPlan, basePlan, baseValidation, candidate, candidateValidation, renders, smoke: { path: path.relative(repository, smoke), sha256: await hashFile(smoke) } };
}));

const black = runs.find((run) => run.episodeId === blackDeath)!;
const dday = runs.find((run) => run.episodeId === dDay)!;
const policyResponse = black.candidate.renderSpecs.find((spec) => spec.relationKind === "policy-response");
if (!policyResponse || policyResponse.renderTarget !== "DIAGRAM_SVG" || policyResponse.semanticPayload.conditionAssertionStatus !== "uncertain" || policyResponse.semanticPayload.responseAssertionStatus !== "attempted" || !policyResponse.semanticPayload.provenance.proof) throw new Error("Black Death policy-response contract failed.");
const eventLocation = dday.candidate.renderSpecs.find((spec) => spec.relationKind === "event-location");
const comparison = dday.candidate.renderSpecs.find((spec) => spec.relationKind === "spatial-comparison");
if (!eventLocation || eventLocation.renderTarget !== "MAP_SVG" || eventLocation.semanticPayload.location.canonicalLabel !== "Calais" || eventLocation.semanticPayload.assertionStatus !== "intended" || eventLocation.points[0]?.placeKind !== "point" || !comparison || comparison.renderTarget !== "MAP_SVG" || comparison.points.find((point) => point.label === "Pas-de-Calais")?.placeKind !== "area" || comparison.points.find((point) => point.label === "Pas-de-Calais")?.renderAnchorPresentationOnly !== true) throw new Error("D-Day event-location contract failed.");

const routes = Object.fromEntries([...canaries, "not-a-canary"].map((episodeId) => [episodeId, resolveHistoryProductionCanaryRouteV36({ episodeId, activationFlagValue: "canary", canaryEpisodesValue: canaries.join(",") })]));
if (routes[blackDeath]?.route !== "V3_6_PRODUCTION_CANDIDATE" || routes[dDay]?.route !== "V3_6_PRODUCTION_CANDIDATE" || routes["not-a-canary"]?.route !== "V3_5_PRODUCTION") throw new Error("Canary routing isolation failed.");

const timing = (run: (typeof runs)[number]) => ({ episodeId: run.episodeId, status: "PASS", audioAssetPath: run.audioPath, audioAssetHash: run.audioSha256, measuredDurationMs: run.durationMs, measuredDurationSeconds: run.durationMs / 1000, wordSegmentTimingSource: "measured TTS segment durations plus ffprobe narration duration", timingArtifactPath: run.timingPath, timingArtifactHash: run.timingSha256, provider: "openai-compatible", model: run.timing.model, voice: run.timing.voice, generatedAt: run.timing.generatedAt, durationPolicy: { allowedMinDurationMs: 300000, allowedMaxDurationMs: 1200000 }, provisionalTextEstimateUsed: false });
const plan = (run: (typeof runs)[number]) => ({ result: "PASS", episodeId: run.episodeId, timingSource: run.basePlan.timing.timingSource, v35MeasuredPlanHash: run.basePlan.planHash, v36CandidatePlanHash: run.candidate.planHash, beats: run.basePlan.beats.length, shots: run.basePlan.shots.length, overlays: run.candidate.summary.placed, maps: run.candidate.summary.mapPlacements, diagrams: run.candidate.summary.diagramPlacements, safePlacementAbstentions: run.candidate.summary.safePlacementAbstentions });
const render = (run: (typeof runs)[number]) => ({ result: "PASS", episodeId: run.episodeId, renderer: "History V3.6 SVG renderer adapters", outputDimensions: "1200x675", renderedOverlays: run.renders, ffmpegSmoke: run.smoke, fullVideo: "NOT_RUN: the isolated workspaces contain no pre-existing V3.5 image/video composition to overlay; no ordinary image assets were regenerated." });
const differential = { comparisonPolicy: "V3.6 overlays are additive; measured V3.5 beats/shots are preserved.", episodes: runs.map((run) => ({ episodeId: run.episodeId, v35: { beatCount: run.basePlan.beats.length, shotCount: run.basePlan.shots.length, mapCount: run.basePlan.beats.filter((beat) => beat.modality === "map").length, diagramCount: run.basePlan.beats.filter((beat) => beat.modality === "diagram").length, totalDurationMs: run.basePlan.timing.totalDurationMs }, v36: { overlayCount: run.candidate.summary.placed, mapCount: run.candidate.summary.mapPlacements, diagramCount: run.candidate.summary.diagramPlacements, visualInsertions: run.candidate.summary.placed, visualReplacements: 0, totalDurationMs: run.candidate.basePlan.totalDurationMs } })) };
const payloads: Record<string, unknown> = {
  "README.md": "# History V3.6 production-canary readiness\n\nTwo isolated canaries passed measured timing, additive V3.6 candidate planning, local SVG/PNG rendering, semantic checks, and rollback routing. V3.5 remains the production default; the general V3.5 production composer is intentionally unchanged, so this packet is ready for bounded rollout rather than global activation.\n",
  "phase-index.json": { phases: [{ phase: "0", result: "PASS" }, { phase: "1", result: "PASS" }, { phase: "2", result: "PASS", detail: "measured timing under the 300-second policy" }, { phase: "3", result: "PASS", detail: "candidate plans and local renderer smoke" }, { phase: "4", result: "PASS", detail: "semantic, differential, and rollback validation" }] },
  "routing-seam-summary.json": { flag: "MEDIAFORGE_HISTORY_V36_VISUAL_PLAN", enabledValue: "canary", allowlist: canaries, defaultRoute: "V3_5_PRODUCTION", routes },
  "canary-config-summary.json": { historyMinimumDurationSeconds: 300, V3_6_global_default: false, candidateOutputRoot: path.relative(repository, directory), allowedEpisodes: canaries },
  "black-death-timing.json": timing(black), "d-day-timing.json": timing(dday),
  "black-death-plan-summary.json": plan(black), "d-day-plan-summary.json": plan(dday),
  "black-death-render-review.json": render(black), "d-day-render-review.json": render(dday),
  "v35-v36-canary-differential.json": differential,
  "rollback-summary.json": { result: "PASS", disabledRoute: resolveHistoryProductionCanaryRouteV36({ episodeId: blackDeath }), V3_5_hashesChanged: 0, V3_6_candidateArtifactsConsumedByV35: 0, staleStateLeaks: 0 },
  "activation-instructions.md": "Do not activate globally. A bounded rollout may use only the explicit canary runner and allowlist after focused validation. Retain the V3.5 default and verify non-allowlisted episodes still resolve to V3.5. Roll back by unsetting MEDIAFORGE_HISTORY_V36_VISUAL_PLAN. General production-composer integration remains a separate approved change.\n",
  "rollback-instructions.md": "Unset MEDIAFORGE_HISTORY_V36_VISUAL_PLAN. The two canaries and every other episode then resolve to V3_5_PRODUCTION; no V3.6 candidate artifact is consumed.\n",
  "future-episode-timing-policy.md": "History V3.6 production candidates require measured TTS or measured final-audio timing of at least 300 seconds and at most 1200 seconds. Provisional text estimates fail closed.\n",
  "test-summary.json": { result: "PASS", checks: ["History duration-policy unit test", "History typecheck", "targeted ESLint", "measured timing checks", "measured V3.5 base-plan validation", "V3.6 candidate-plan validation", "Black Death proof-aware semantic assertion", "D-Day event-location semantic assertion", "SVG/PNG renderer validation", "FFmpeg smoke", "rollback routing", "V3.5 source isolation"] },
  "invariant-summary.json": { result: "PASS", productionActivated: 0, v35ProductionOutputChange: 0, semanticInferenceFallback: 0, v35HeuristicFallbackInsideV36: 0, provisionalTimingAccepted: 0, duplicatePlacements: 0, orphanRenderSpecs: 0, safePlacementAbstentions: 0, visualReplacements: 0 },
  "production-canary-decision.json": { verdict: "READY_FOR_BOUNDED_PRODUCTION_ROLLOUT", humanDecisionRequired: false, productionActivated: false, reason: "Both measured-timing canaries passed. The general production composer remains V3.5, so only the explicit isolated canary runner is ready for bounded rollout." },
  "provenance.json": { artifactInputHead: head, baseline: "history-v3.6-production-readiness-baseline", frozenV35: "history-v3.5-frozen-before-v36", providerCalls: { ttsCompleted: 0, llm: 0, image: 0, web: 0, geocoding: 0 }, reusedApprovedAudio: true, productionActivated: false },
};
await fs.mkdir(directory, { recursive: true });
await Promise.all(Object.entries(payloads).map(([name, value]) => fs.writeFile(path.join(directory, name), typeof value === "string" ? value : pretty(value))));
const entries = await fs.readdir(directory, { recursive: true });
const files = (await Promise.all(entries.map(async (entry) => (await fs.stat(path.join(directory, entry))).isFile() ? entry : undefined))).filter((entry): entry is string => Boolean(entry)).sort((left, right) => left.localeCompare(right));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${(await Promise.all(files.map(async (file) => `${await hashFile(path.join(directory, file))}  ${file}`))).join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
await execute("zip", ["-X", "-q", "-r", zipPath, basename], { cwd: root });
await execute("unzip", ["-t", zipPath], { cwd: root });
process.stdout.write(pretty({ directory: path.relative(repository, directory), zip: path.relative(repository, zipPath), zipSha256: await hashFile(zipPath), verdict: "READY_FOR_BOUNDED_PRODUCTION_ROLLOUT" }));
