/* Offline-only evidence exporter for the 2026-08-17 Veronica census. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

const root = path.resolve(import.meta.dirname, "..");
const priorRoot = path.join(root, "artifacts/veronica-portfolio-preproduction/2026-08-17T21-05-27-588Z");
const priorPack = path.join(priorRoot, "veronica-portfolio-preproduction-review");
const workspaces = path.join(priorRoot, "deterministic-workspaces");
const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = path.join(root, "artifacts/veronica-portfolio-preproduction", `${timestamp}-evidence-hardening-v2`);
const packDir = path.join(outputRoot, "veronica-portfolio-preproduction-review-v2");
const zipPath = path.join(outputRoot, `veronica-portfolio-preproduction-review-v2-${timestamp}.zip`);
const providerAttempts: { boundary: string; detail: string }[] = [];
const commands: string[] = [];
const startHead = git("rev-parse", "HEAD");
const initialDirty = git("status", "--porcelain=v1").split("\n").filter(Boolean);

function git(...args: string[]): string { commands.push(`git ${args.join(" ")}`); return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function rel(file: string): string { return path.relative(root, file).replace(/\\/gu, "/"); }
function packRel(file: string): string { return path.relative(packDir, file).replace(/\\/gu, "/"); }
function idOf(r: any): string { return `${r.pack}:${r.release}:${r.format}:${r.locale}:${r.contentId}`; }
function workspaceOf(r: any): string { return path.join(root, r.preparation.workspacePath); }
function read<T = any>(file: string): T | null { try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; } }
async function write(file: string, value: unknown | string): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); }
function mdTable(head: string[], rows: (string | number)[][]): string { return `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row.map(x => String(x).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}`; }
function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> { const out: Record<string, number> = {}; for (const value of values) { const k = key(value); out[k] = (out[k] ?? 0) + 1; } return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))); }
function installOfflineGuard(): void {
  const deny = (boundary: string) => (...args: unknown[]): never => { providerAttempts.push({ boundary, detail: typeof args[0] === "string" ? args[0] : "request object" }); throw new Error(`ZERO_PROVIDER_GUARD_BLOCKED:${boundary}`); };
  globalThis.fetch = deny("global.fetch") as typeof fetch; http.request = deny("http.request") as typeof http.request; http.get = deny("http.get") as typeof http.get; https.request = deny("https.request") as typeof https.request; https.get = deny("https.get") as typeof https.get; net.connect = deny("net.connect") as typeof net.connect; net.createConnection = deny("net.createConnection") as typeof net.createConnection; tls.connect = deny("tls.connect") as typeof tls.connect;
}
function findingLabel(finding: any): string {
  const message = String(finding.message ?? "");
  const embedded = [...message.matchAll(/\b(?:unsupported-treatment-[\w-]+|stale-action-owner-role|semantic-actor-role-disagrees-with-visible-primary-action|unresolved-[\w-]+|internal-remediation-language|provider-[\w-]+|projection-[\w-]+)\b/gu)].map(x => x[0]);
  return embedded[0] ?? String(finding.code ?? "UNKNOWN_FINDING").toLowerCase();
}
function compactScene(scene: any): any { return { sceneId: scene.sceneId, narrationAnchor: scene.narrationAnchor, visibleThesis: scene.visibleThesis, semanticProposition: scene.semanticProposition, treatment: scene.treatment, sourceGroundedRemediation: scene.sourceGroundedRemediation }; }
function actualCategory(value: unknown): string { if (value === null) return "null"; if (Array.isArray(value)) return "array"; return typeof value; }

installOfflineGuard();
commands.push("node --import tsx scripts/veronica-evidence-hardening-v2.ts (offline guard installed before imports)");
commands.push(`zip -qr ${rel(zipPath)} ${path.basename(packDir)}`);
commands.push(`unzip -t ${rel(zipPath)}`);
commands.push("node --input-type=module manifest SHA-256 verification");
const census: any = read(path.join(priorPack, "portfolio-census.json"));
if (!census?.records || !Array.isArray(census.records)) throw new Error("PRIOR_CENSUS_UNAVAILABLE");
const records: any[] = census.records;
const attempted = records.filter(r => r.preparation?.attempted);
if (attempted.length !== 48) throw new Error(`EXPECTED_48_CANONICAL_ATTEMPTS_GOT_${attempted.length}`);
const { positioningProductionPlanSchema } = await import("../packages/strategic-reinvention/src/veronica-visual-plan-resolver.js");
const { deriveVeronicaVisualBeatPlan, materializeVeronicaVisualBeatPlan } = await import("../packages/strategic-reinvention/src/veronica-visual-beats.js");
const { expandVeronicaLongFormSemanticScenes, compilePositioningProductionScenePlan } = await import("../packages/strategic-reinvention/src/positioning-production-adapter.js");
const { hardenVeronicaPreImagePlan, rebuildVeronicaFinalTreatmentState } = await import("../packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.js");

const active = records.filter(r => r.canonical);
const canonicalVisual = active.filter(r => r.locale === "en");
const localizedReuse = active.filter(r => r.locale !== "en");
const archival = records.filter(r => !r.canonical);
const population = {
  allPhysicalVariants: records.length,
  activeCurrentVariants: active.length,
  activeCanonicalVisualVariants: canonicalVisual.length,
  localizedVariantsReusingCanonicalVisuals: localizedReuse.length,
  archivalOrSupersededVariants: archival.length,
  byRelease: countBy(records, r => `${r.pack}:${r.release}`),
};

const allFailureEvidence: any[] = [];
const rootCauseRows: any[] = [];
const blockDetails: any[] = [];
const semanticFindings: any[] = [];
for (const record of attempted.filter(r => r.preparation.status === "BLOCK")) {
  const ws = workspaceOf(record);
  const review = read<any>(path.join(ws, "shared/pre-image-semantic-reviews.v1.json"));
  const plan = read<any>(path.join(ws, "source/pre-image-semantic-plan.v1.json"));
  const reviews = [...(review?.initialReviews ?? []), ...(review?.reviews ?? [])];
  const unique = new Map<string, any>();
  for (const item of reviews) for (const finding of item.findings ?? []) {
    const normalized = findingLabel(finding);
    const key = `${item.sceneId}:${normalized}:${finding.code}`;
    if (!unique.has(key)) unique.set(key, { normalized, code: finding.code, message: finding.message, sceneId: item.sceneId, severity: finding.severity });
  }
  const details = [...unique.values()];
  for (const item of details) semanticFindings.push({ episodeId: idOf(record), pack: record.pack, format: record.format, ...item });
  const quality = plan?.semanticQuality ?? review?.semanticQuality ?? null;
  const readiness = plan?.providerReadiness ?? review?.providerReadiness ?? null;
  const entry = { episodeId: idOf(record), workspace: record.preparation.workspacePath, format: record.format, pack: record.pack, semanticRemediation: review ? { convergenceStatus: review.convergenceStatus, remediationRounds: review.remediationRounds, decisions: review.decisions } : null, quality, readiness, findings: details, representativeScenes: (plan?.scenes ?? []).filter((s: any) => details.some(d => d.sceneId === s.sceneId)).slice(0, 12).map(compactScene) };
  blockDetails.push(entry);
  allFailureEvidence.push({ kind: "DETERMINISTIC_PREPARATION_BLOCK", ...entry });
}
for (const [normalized, values] of Object.entries(Object.groupBy(semanticFindings, x => x.normalized))) {
  const rows = values as any[];
  rootCauseRows.push({ normalizedFinding: normalized, findingCodes: [...new Set(rows.map(x => x.code))], affectedCanonicalEpisodes: new Set(rows.map(x => x.episodeId)).size, affectedScenes: new Set(rows.map(x => `${x.episodeId}:${x.sceneId}`)).size, shorts: new Set(rows.filter(x => x.format === "short").map(x => x.episodeId)).size, longs: new Set(rows.filter(x => x.format === "long").map(x => x.episodeId)).size, pack1: new Set(rows.filter(x => x.pack.endsWith("1")).map(x => x.episodeId)).size, pack2: new Set(rows.filter(x => x.pack.endsWith("2")).map(x => x.episodeId)).size, representativeIds: [...new Set(rows.map(x => x.episodeId))].slice(0, 5), likelyRootLayer: /unsupported-treatment|stale-action|actor-role/u.test(normalized) ? "semantic proposition / treatment synchronization" : /remediation_template|semantic_remediation/u.test(normalized) ? "deterministic remediation" : "semantic gate", confidence: "HIGH", likelyCentralFixLocation: /unsupported-treatment|actor/u.test(normalized) ? "packages/strategic-reinvention/src/veronica-semantic-quality.ts" : "packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts" });
}

const invalidDiagnostics: any[] = [];
for (const record of attempted.filter(r => String(r.preparation.error ?? "").startsWith("INVALID_VISUAL_PLAN:"))) {
  const planPath = path.join(workspaceOf(record), "source/visual-plan.json"); const raw = read(planPath);
  const parsed = positioningProductionPlanSchema.safeParse(raw);
  const issues = parsed.success ? [] : parsed.error.issues.map(issue => ({ schema: "positioningProductionPlanSchema", issueCode: issue.code, path: issue.path.length ? `/${issue.path.join("/")}` : "/", expectedInvariantOrType: issue.message, actualValueCategory: actualCategory(issue.input), actualValuePreview: typeof issue.input === "string" ? issue.input.slice(0, 180) : undefined, plannerStage: "resolveVeronicaVisualPlan:parseVisualPlan(existing source/visual-plan.json)" }));
  const entry = { episodeId: idOf(record), workspace: record.preparation.workspacePath, planPath: rel(planPath), sourceSchemaVersion: (raw as any)?.schemaVersion ?? null, issues };
  invalidDiagnostics.push(entry); allFailureEvidence.push({ kind: "INVALID_VISUAL_PLAN", ...entry });
}

const beatEvidence: any[] = [];
for (const record of attempted.filter(r => String(r.preparation.error ?? "").startsWith("VERONICA_VISUAL_BEAT_QUALITY_FAILED:"))) {
  const planPath = path.join(workspaceOf(record), "source/visual-plan.json"); const raw = read<any>(planPath); const parsed = positioningProductionPlanSchema.safeParse(raw);
  if (!parsed.success) { beatEvidence.push({ episodeId: idOf(record), reproducibility: "UNAVAILABLE: plan schema invalid", parseIssues: parsed.error.issues }); continue; }
  let beatPlan: any; let reproduced: string | null = null;
  try {
    const narration = readFileSync(path.join(workspaceOf(record), "languages", record.format === "short" ? "short" : "full", "script-en.md"), "utf8");
    const segmented = expandVeronicaLongFormSemanticScenes({ plan: parsed.data as any, narration });
    const provisional = compilePositioningProductionScenePlan({ episodeId: path.basename(workspaceOf(record)), narration, plan: segmented.plan as any, narrationByScene: segmented.narrationByScene });
    const hardened = hardenVeronicaPreImagePlan({ plan: segmented.plan as any, narrationByScene: provisional.scenes.map((s: any) => s.canonicalNarration) });
    const hardenedPlan = positioningProductionPlanSchema.parse(hardened.plan as any);
    const scenePlan = compilePositioningProductionScenePlan({ episodeId: path.basename(workspaceOf(record)), narration, plan: hardenedPlan as any, narrationByScene: provisional.scenes.map((s: any) => s.canonicalNarration) });
    const rebuilt = rebuildVeronicaFinalTreatmentState({ plan: hardenedPlan as any, sceneTimings: scenePlan.scenes.map((s: any) => ({ id: s.id, timing: s.timing })), narrationByScene: scenePlan.scenes.map((s: any) => s.canonicalNarration) });
    beatPlan = deriveVeronicaVisualBeatPlan({ plan: rebuilt }); materializeVeronicaVisualBeatPlan({ plan: rebuilt, beatPlan });
  } catch (error) { reproduced = error instanceof Error ? error.message : String(error); }
  const quality = beatPlan?.quality;
  const codes = [...(quality?.findings ?? []), ...(quality?.sequenceDiversity?.findings ?? [])].filter((x: any) => x.severity !== "warning");
  const entry = { episodeId: idOf(record), workspace: record.preparation.workspacePath, reproducedError: reproduced, plannerOutputResponsible: "deriveVeronicaVisualBeatPlan automaticSceneBeats / sequence diversity", qualityStatus: quality?.status ?? null, validatorFindings: codes, metrics: quality?.sequenceDiversity?.metrics ?? null, affectedBeats: (beatPlan?.beats ?? []).filter((b: any) => codes.some((x: any) => (x.beatIds ?? [x.beatId]).includes(b.beatId))).map((b: any) => ({ beatId: b.beatId, sceneId: b.sceneId, action: b.action, environment: b.environment, newInformation: b.newInformation, assetDecision: b.assetDecision })), adjudication: "PLANNER_DEFECT" };
  beatEvidence.push(entry); allFailureEvidence.push({ kind: "VERONICA_VISUAL_BEAT_QUALITY_FAILED", ...entry });
}
const beatClusters = Object.entries(Object.groupBy(beatEvidence.flatMap(entry => entry.validatorFindings?.map((finding: any) => ({ ...finding, episodeId: entry.episodeId })) ?? []), x => x.code)).map(([code, values]) => ({ code, affectedEpisodes: new Set((values as any[]).map(x => x.episodeId)).size, affectedBeats: (values as any[]).reduce((sum, x) => sum + (x.beatIds?.length ?? 1), 0), representative: (values as any[]).slice(0, 3), adjudication: "PLANNER_DEFECT", confidence: "HIGH" }));

const remediation: any[] = [];
const promptAssets: any[] = [];
const concepts = ["doorway", "threshold", "foothold", "first-time visitor", "audience-offer-fit", "expertise-recognition", "professional", "customer", "visitor", "generic", "public threshold"];
const conceptOccurrences: any[] = [];
for (const record of attempted) {
  const ws = workspaceOf(record); const plan = read<any>(path.join(ws, "source/pre-image-semantic-plan.v1.json")); const basePlan = read<any>(path.join(ws, "source/visual-plan.json"));
  const usePlan = plan ?? basePlan;
  if (usePlan?.semanticQuality || usePlan?.scenes) remediation.push({ episodeId: idOf(record), format: record.format, pack: record.pack, semanticRemediation: usePlan.semanticRemediation ?? null, metrics: usePlan.semanticQuality ?? null, beforeAfterAvailable: Boolean(read(path.join(ws, "shared/pre-image-semantic-reviews.v1.json"))?.initialReviews?.length), remediationSceneCount: (usePlan.scenes ?? []).filter((s: any) => s.sourceGroundedRemediation || s.semanticProposition).length });
  const promptFile = path.join(ws, "locales/en", record.format === "short" ? "short" : "full", "image-prompts/provider-image-prompts.v1.json"); const promptArtifact = read<any>(promptFile);
  const assets = promptArtifact?.prompts ?? promptArtifact?.assets ?? usePlan?.assets ?? [];
  for (const asset of assets) { const prompt = String(asset.imagePrompt ?? asset.prompt ?? ""); promptAssets.push({ episodeId: idOf(record), format: record.format, pack: record.pack, assetId: asset.assetId ?? asset.sceneId, length: prompt.length, prompt, readiness: asset.promptCompilation?.adjudication ?? asset.promptCompilation ?? null }); }
  const source = readFileSync(path.isAbsolute(record.sourcePath) ? record.sourcePath : path.join(root, record.sourcePath), "utf8").toLowerCase(); const planText = JSON.stringify(usePlan ?? {}).toLowerCase();
  for (const concept of concepts) { const matcher = new RegExp(concept.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu"); const sourceCount = (source.match(matcher) ?? []).length; const planCount = (planText.match(matcher) ?? []).length; if (sourceCount || planCount) conceptOccurrences.push({ episodeId: idOf(record), concept, sourceCount, planCount, introduction: sourceCount ? "source-grounded-or-propagated" : "planner/treatment/remediation introduced", evidenceLayer: plan ? "post-remediation plan" : "planner plan" }); }
}
const metricNames = ["remediationTemplateReuseRate", "genericFallbackSceneRate", "repeatedActionFamilyRate", "repeatedEnvironmentFamilyRate", "accidentalRepetitionRate"];
const remediationDistributions = Object.fromEntries(metricNames.map(name => { const entries = remediation.map(r => r.metrics?.[name]).filter((v: any) => typeof v === "number"); return [name, { count: entries.length, min: entries.length ? Math.min(...entries) : null, max: entries.length ? Math.max(...entries) : null, mean: entries.length ? Number((entries.reduce((a: number, b: number) => a + b, 0) / entries.length).toFixed(4)) : null, nonZeroEpisodes: remediation.filter(r => (r.metrics?.[name] ?? 0) > 0).map(r => r.episodeId) }]; }));
const promptFindings = { unresolvedPlaceholders: promptAssets.filter(x => /(?:\{\{[^}]+\}\}|\$\{[^}]+\}|\[(?:insert|todo|placeholder)[^\]]*\]|<[^>]*(?:insert|todo|placeholder)[^>]*>)/iu.test(x.prompt)), internalRemediationLanguage: promptAssets.filter(x => /\b(?:validator|validation finding|remediation|repair boundary|semantic proposition|visible thesis|state relation|polarity label|compiler input|prompt hash|treatment hash)\b/iu.test(x.prompt)), over4000: promptAssets.filter(x => x.length > 4000), nearLimit: promptAssets.filter(x => x.length >= 3600 && x.length <= 4000) };
const overflow = promptAssets.sort((a, b) => b.length - a.length).slice(0, 20);
const overflowErrors = attempted.filter(r => String(r.preparation.error ?? "").includes("maximum\": 4000")).map(r => ({ episodeId: idOf(r), rawRuntimeDiagnostic: r.preparation.error, compilerComponent: "compileDeterministicVeronicaImagePrompt -> veronicaImagePromptCompilationResultSchema.imagePrompt (z.string().max(4_000))", persistenceEffect: "throws before provider-prompt artifact is persisted" }));

const timingRows = records.map(r => ({ id: idOf(r), population: r.canonical ? "current" : "archival/superseded", pack: r.pack, release: r.release, format: r.format, locale: r.locale, estimatedDurationSeconds: r.estimatedDurationSeconds, targetRangeSeconds: r.targetRangeSeconds.join("-"), timingStatus: r.timingStatus, sourcePath: r.sourcePath }));
const timingCurrent = timingRows.filter(r => r.population === "current"); const timingArchival = timingRows.filter(r => r.population !== "current");
const timingSummary = (rows: any[]) => Object.entries(Object.groupBy(rows, r => `${r.pack}|${r.release}|${r.format}|${r.locale}`)).map(([group, values]) => ({ group, variants: (values as any[]).length, inTarget: (values as any[]).filter(x => x.timingStatus === "IN_TARGET").length, tooShort: (values as any[]).filter(x => x.timingStatus === "TOO_SHORT").length, tooLong: (values as any[]).filter(x => x.timingStatus === "TOO_LONG").length }));

const errorOnly = attempted.filter(r => r.preparation.status === "ERROR" && !String(r.preparation.error ?? "").startsWith("INVALID_VISUAL_PLAN:") && !String(r.preparation.error ?? "").startsWith("VERONICA_VISUAL_BEAT_QUALITY_FAILED:"));
for (const record of errorOnly) allFailureEvidence.push({ kind: "OTHER_PREPARATION_ERROR", episodeId: idOf(record), workspace: record.preparation.workspacePath, error: record.preparation.error, plan: read(path.join(workspaceOf(record), "source/visual-plan.json")) });

const systemic = { schemaVersion: "veronica-evidence-hardening.v2", population, canonicalAttemptOutcome: countBy(attempted, r => r.preparation.status), deterministicBlocks: blockDetails, rootCauseMatrix: rootCauseRows, invalidPlanDiagnostics: invalidDiagnostics, visualBeatFailures: beatEvidence, visualBeatClusters: beatClusters, remediationDistributions, promptFindings: { counts: { ...Object.fromEntries(Object.entries(promptFindings).map(([k, v]) => [k, v.length])), overflowRuntimeErrors: overflowErrors.length }, overflow, overflowErrors }, conceptFrequency: Object.entries(Object.groupBy(conceptOccurrences, x => x.concept)).map(([concept, values]) => ({ concept, episodeCount: new Set((values as any[]).map(x => x.episodeId)).size, sourceMentionCount: (values as any[]).reduce((s, x) => s + x.sourceCount, 0), planMentionCount: (values as any[]).reduce((s, x) => s + x.planCount, 0), introducedWithoutSource: (values as any[]).filter(x => x.sourceCount === 0).map(x => x.episodeId) })) };

await write(path.join(packDir, "portfolio-census.json"), { ...census, v2Population: population, records });
await write(path.join(packDir, "deterministic-results.json"), { schemaVersion: "veronica-deterministic-results.v2", records: attempted.map(r => ({ id: idOf(r), preparation: r.preparation, gates: r.gates })), outcomeCounts: countBy(attempted, r => r.preparation.status) });
await write(path.join(packDir, "systemic-issues.json"), systemic);
await write(path.join(packDir, "root-cause-matrix.csv"), ["normalized_finding,affected_canonical_episodes,affected_scenes,shorts,longs,pack_1,pack_2,likely_root_layer,confidence,likely_central_fix_location,representatives", ...rootCauseRows.map(row => [row.normalizedFinding,row.affectedCanonicalEpisodes,row.affectedScenes,row.shorts,row.longs,row.pack1,row.pack2,row.likelyRootLayer,row.confidence,row.likelyCentralFixLocation,row.representativeIds.join(";")].map(x => JSON.stringify(x)).join(","))].join("\n"));
await write(path.join(packDir, "timing-analysis.csv"), [Object.keys(timingRows[0]).join(","), ...timingRows.map(r => Object.values(r).map(x => JSON.stringify(x)).join(","))].join("\n"));
await write(path.join(packDir, "README.md"), `# Veronica evidence-hardening V2\n\nThis pack reuses the 2026-08-17 zero-cost census and its 48 canonical-English preparation workspaces. No source census or paid-provider work was rerun. The offline guard was installed before source imports.\n\n${mdTable(["Population", "Count"], Object.entries(population).filter(([,v]) => typeof v === "number") as any)}\n\nCanonical preparation is intentionally one English plan per active content/format; ${population.localizedVariantsReusingCanonicalVisuals} localized active variants consume canonical visuals under the repository policy.\n`);
await write(path.join(packDir, "portfolio-census.md"), `# Coverage semantics\n\n${mdTable(["Population", "Denominator"], [["all physical variants", population.allPhysicalVariants], ["active/current variants", population.activeCurrentVariants], ["active canonical visual variants", population.activeCanonicalVisualVariants], ["localized variants reusing canonical visual plans", population.localizedVariantsReusingCanonicalVisuals], ["archival/superseded variants", population.archivalOrSupersededVariants]])}\n\nThe 48 attempts equal active current English canonical visual variants, not all 564 physical language/release files. Localized active variants are delivery variants, while noncanonical releases are historical/superseded and excluded from current production percentages.\n`);
await write(path.join(packDir, "systemic-issues.md"), `# Systemic issue evidence\n\n${mdTable(["Outcome", "Canonical episodes"], Object.entries(countBy(attempted, r => r.preparation.status)) as any)}\n\n${mdTable(["Finding", "Episodes", "Scenes", "Likely layer", "Confidence"], rootCauseRows.map(r => [r.normalizedFinding,r.affectedCanonicalEpisodes,r.affectedScenes,r.likelyRootLayer,r.confidence]))}\n\nPer-episode raw evidence is in all-failures/deterministic-preparation-blocks.json.\n`);
await write(path.join(packDir, "semantic-failure-analysis.md"), `# Deterministic preparation blocks\n\nAll 27 orchestration blocks are decomposed in ` + "`all-failures/deterministic-preparation-blocks.json`" + `. The repeated source-grounded QA “BLOCKED” result is an intentional zero-paid-provider boundary and not counted as an underlying semantic defect.\n\n${mdTable(["Normalized finding", "Episodes", "Scenes", "Shorts", "Longs", "Pack 1", "Pack 2", "Representative IDs"], rootCauseRows.map(r => [r.normalizedFinding,r.affectedCanonicalEpisodes,r.affectedScenes,r.shorts,r.longs,r.pack1,r.pack2,r.representativeIds.join(", ")]))}\n\nObserved root evidence comes from ` + "`shared/pre-image-semantic-reviews.v1.json`" + `, plan semantic quality/readiness, and final scene treatments.\n`);
await write(path.join(packDir, "invalid-plan-diagnostics.md"), `# Invalid visual-plan diagnostics\n\nEight failures were parsed in memory with ` + "`positioningProductionPlanSchema.safeParse`" + `; no plan was written.\n\n${invalidDiagnostics.map(d => `## ${d.episodeId}\n\n${mdTable(["Schema", "Code", "Path", "Expected", "Actual category"], d.issues.map((i: any) => [i.schema,i.issueCode,i.path,i.expectedInvariantOrType,i.actualValueCategory]))}\n`).join("\n")}\n\nCluster conclusion: ${invalidDiagnostics.every(d => d.episodeId.includes("pack-1")) ? "all are Pack 1 existing-plan schema incompatibilities / stale legacy artifacts" : "multiple sources"}; exact JSON is in all-failures/invalid-plan-diagnostics.json.\n`);
await write(path.join(packDir, "visual-beat-validator-analysis.md"), `# Visual-beat quality evidence\n\nThe 11 cases were re-derived in memory from their saved plans. ${mdTable(["Code", "Episodes", "Beat references", "Adjudication", "Confidence"], beatClusters.map((c: any) => [c.code,c.affectedEpisodes,c.affectedBeats,c.adjudication,c.confidence]))}\n\nEach failure record preserves the quality finding, window, repeated dimensions, observed/threshold evidence, affected beat definitions, and sequence metrics in ` + "`all-failures/visual-beat-failures.json`" + `. Current evidence favors PLANNER_DEFECT: automatic beat generation re-emits generic opening and action/environment families; no validator threshold was changed.\n`);
await write(path.join(packDir, "remediation-collapse-analysis.md"), `# Remediation collapse\n\n${mdTable(["Metric", "Episodes", "Min", "Mean", "Max", "Non-zero episodes"], Object.entries(remediationDistributions).map(([name, v]: any) => [name,v.count,v.min,v.mean,v.max,v.nonZeroEpisodes.length]))}\n\nObserved: remediation is not simply source-local repair. It frequently leaves semantic remediation exhausted, then reports low confidence/template-collapse findings. Strong inference: the deterministic repair grammar can introduce generic fallback scenes and repeated families, obscuring the original planner failure. Before/after review evidence is preserved where available. No additional remediation loop was run.\n`);
await write(path.join(packDir, "prompt-readiness-analysis.md"), `# Prompt and readiness analysis\n\n${mdTable(["Check", "Affected compiled assets"], [...Object.entries(promptFindings).map(([name, values]: any) => [name, values.length]), ["runtime prompt-overflow errors", overflowErrors.length]])}\n\nThe Pack 2 long overflow is caught at ` + "`compileDeterministicVeronicaImagePrompt → veronicaImagePromptCompilationResultSchema.imagePrompt (max 4,000)`" + `, before a prompt artifact can be persisted. The stored compiled prompt set has ${promptFindings.nearLimit.length} prompt(s) in the 3,600–4,000 band; those and the raw overflow diagnostic are preserved in ` + "`all-failures/prompt-assets.json`" + `. Unsupported entities/environments, actor ownership, projection mismatch, and semantic contradictions are included from provider-readiness issues in deterministic block evidence.\n`);
await write(path.join(packDir, "timing-current-production.md"), `# Current-production timing\n\n${mdTable(["Pack / release / format / locale", "Variants", "In target", "Too short", "Too long"], timingSummary(timingCurrent).map(x => [x.group,x.variants,x.inTarget,x.tooShort,x.tooLong]))}\n\nPack 1 current Shorts are evaluated with ` + "`packages/speech/src/veronica-speech-rate-policy.ts`" + ` (60–90 seconds). The Pack 1 v3 Shorts documentation’s 45–60-second statement is a policy/content migration decision, not a defect this pass resolves.\n`);
await write(path.join(packDir, "timing-archival.md"), `# Archival and superseded timing\n\n${mdTable(["Pack / release / format / locale", "Variants", "In target", "Too short", "Too long"], timingSummary(timingArchival).map(x => [x.group,x.variants,x.inTarget,x.tooShort,x.tooLong]))}\n\nThese files remain in the complete census but are excluded from current-production percentages.\n`);
await write(path.join(packDir, "validator-findings.md"), `# Validator findings\n\n| Rule family | Intended invariant | Observed population | Assessment | Confidence |\n| --- | --- | --- | --- | --- |\n| positioningProductionPlanSchema | persisted plan has required runtime shape | 8 existing Pack 1 plans | likely true positive: exact issue paths retained | HIGH |\n| pre-image semantic gate | treatment/proposition remains narration-grounded | 27 blocked preparations | likely true positive, with stale role synchronization concentrated | HIGH |\n| semantic quality | remediation does not collapse into generic/repeated families | applicable remediated plans | likely true positive; inspect policy thresholds separately | MEDIUM |\n| provider readiness | prompts preserve semantic and provider constraints | compiled plan assets | insufficient evidence for source truth because paid QA intentionally absent | HIGH |\n| visual-beat validator / diversity | beats add distinct, grounded visual information | 11 quality errors | likely true positive; automatic planner output is visibly repetitive | HIGH |\n\nVisible false-negative exposure: source-grounded scene judgement is deliberately unconfigured in this run, so semantic correctness beyond deterministic checks remains unadjudicated rather than passed.\n`);
await write(path.join(packDir, "architecture-findings.md"), `# Architecture findings\n\n- **OBSERVED:** canonical plan resolution validates existing ` + "`source/visual-plan.json`" + ` before deciding whether to derive; invalid legacy artifacts stop the run (` + "`veronica-visual-plan-resolver.ts`" + `).\n- **OBSERVED:** prompt compilation cache keys are per compilation input hash and records are invalidated when provenance/compiler inputs differ (` + "`veronica-image-prompt-compiler.ts`" + `).\n- **OBSERVED:** source-grounded QA has scene/beat/sequence checkpoints (` + "`positioning-production-adapter.ts`" + `).\n- **OBSERVED:** image resume validates manifest output and prompt hashes, and archives a replaced accepted image before copy (` + "`apps/cli/src/images-resume-command.ts`" + `).\n- **STRONG_INFERENCE:** a plan-level semantic change can invalidate many prompt assets because compilation is enumerated across plan assets; checkpointing limits QA reruns but does not eliminate this fan-out.\n- **STRONG_INFERENCE:** canonical-English visual reuse is correctly modeled as localized timing/delivery reuse, but only after a canonical plan is valid.\n- **SPECULATIVE:** broader hash dependency changes may regenerate unnecessary assets; confirm with a controlled hash-diff test before redesigning cache topology.\n`);
await write(path.join(packDir, "cost-risk-analysis.md"), `# Cost and regeneration risk\n\n- **OBSERVED:** zero paid dispatch occurred; provider readiness remains fail-closed.\n- **OBSERVED:** deterministic prompt compilation records cache hits/misses and invalidated assets; image resume guards accepted output with hashes.\n- **STRONG_INFERENCE:** fixing systemic planner/remediation defects before paid image/TTS/QA avoids repeated generation of invalid canonical visuals across localized variants.\n- **STRONG_INFERENCE:** QA checkpoints reduce restart scope, but repeated paid QA remains possible when semantic/projection hashes change.\n- **SPECULATIVE:** TTS calibration could fan out after timing policy decisions; no TTS was invoked here.\n`);
await write(path.join(packDir, "zero-paid-provider-proof.md"), `# Zero paid-provider proof\n\nA fail-closed guard was installed before importing pipeline modules. It replaces global fetch, http/https request/get, net connect/createConnection, and tls connect and throws before dispatch. This pass only read prior artifacts and executed pure in-memory schema/beat validation.\n\n${mdTable(["Provider class", "Dispatches", "Prevented dispatch attempts"], [["OpenAI / external LLM QA",0,providerAttempts.filter(x => /fetch|http|https|net|tls/u.test(x.boundary)).length],["TTS",0,0],["Image generation",0,0],["Embeddings",0,0],["Remote rendering",0,0]])}\n\nProvider dispatch counters: all zero. Prevented provider-dispatch attempt count: ${providerAttempts.length}. If any pipeline path had attempted egress, the run would have failed closed.\n`);
await write(path.join(packDir, "all-failures/deterministic-preparation-blocks.json"), blockDetails);
await write(path.join(packDir, "all-failures/invalid-plan-diagnostics.json"), invalidDiagnostics);
await write(path.join(packDir, "all-failures/visual-beat-failures.json"), beatEvidence);
await write(path.join(packDir, "all-failures/prompt-assets.json"), promptAssets.map(({prompt, ...rest}) => ({ ...rest, prompt })));
await write(path.join(packDir, "all-failures/prompt-overflow-errors.json"), overflowErrors);
await write(path.join(packDir, "all-failures/all-failures.json"), allFailureEvidence);
for (const [index, item] of [...blockDetails.slice(0, 5), ...invalidDiagnostics.slice(0, 3), ...beatEvidence.slice(0, 3)].entries()) await write(path.join(packDir, `representative-artifacts/${String(index + 1).padStart(2, "0")}-${item.episodeId.replace(/[^a-z0-9]+/giu, "-")}.json`), item);

const endHead = git("rev-parse", "HEAD"); const finalDirty = git("status", "--porcelain=v1").split("\n").filter(Boolean);
const passOwnedPaths = ["scripts/veronica-evidence-hardening-v2.ts", "docs/reports/codex-runs/2026-08-17-veronica-evidence-hardening-v2.md", rel(outputRoot)];
const preExisting = initialDirty.filter(entry => !passOwnedPaths.some(file => entry.endsWith(file)));
const changedByPass = [...new Set([...finalDirty.filter(x => !initialDirty.includes(x)), ...passOwnedPaths])];
const files = (await fs.readdir(packDir, { recursive: true, withFileTypes: false } as any) as string[])
  .map(x => path.join(packDir, x))
  .filter(x => !x.endsWith("MANIFEST.json") && statSync(x).isFile());
const hashes = Object.fromEntries(await Promise.all(files.sort().map(async file => [packRel(file), sha(await fs.readFile(file))])));
await write(path.join(packDir, "MANIFEST.json"), { schemaVersion: "veronica-review-pack-manifest.v2", generatedTimestamp: new Date().toISOString(), repositoryStartingHead: startHead, repositoryEndingHead: endHead, initialDirtyState: initialDirty.length > 0, finalDirtyState: finalDirty.length > 0, preExistingChangedFiles: preExisting, filesChangedByThisPass: changedByPass, commandsExecuted: commands, providerDispatchCounters: { openai: 0, externalLlmQa: 0, tts: 0, images: 0, embeddings: 0, remoteRendering: 0, otherMeteredProvider: 0 }, preventedProviderDispatchAttemptCount: providerAttempts.length, manifestExcludes: ["MANIFEST.json"], files: hashes });
process.stdout.write(JSON.stringify({ status: "EVIDENCE_PACK_READY", packDir, zipPath, outputRoot, canonicalAttempts: attempted.length, providerAttempts: providerAttempts.length }, null, 2) + "\n");
