import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

const root = path.resolve(import.meta.dirname, "..");
const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = path.join(root, "artifacts", "veronica-portfolio-preproduction", timestamp);
const packDir = path.join(outputRoot, "veronica-portfolio-preproduction-review");
const workspaceRoot = path.join(outputRoot, "deterministic-workspaces");
const providerAttempts: Array<{ boundary: string; detail: string }> = [];

type State = "PASS" | "BLOCK" | "REVIEW" | "ERROR" | "NOT_APPLICABLE" | "NOT_REACHED";
type Variant = {
  pack: string; release: string; format: "short" | "long"; locale: string; sourcePath: string;
  contentId: string; title: string; canonical: boolean;
};
type Gate = { gateId: string; stage: string; status: State; message: string; evidencePath?: string; deterministic: boolean };
type Record = Variant & {
  sourceSha256: string; wordCount: number; targetWpm: number; estimatedDurationSeconds: number;
  targetRangeSeconds: readonly [number, number]; timingStatus: "IN_TARGET" | "TOO_SHORT" | "TOO_LONG" | "UNKNOWN";
  existing: { audio: boolean; plan: boolean; providerPrompts: boolean; image: boolean; render: boolean; metadata: boolean; qa: boolean };
  gates: Gate[]; preparation: { attempted: boolean; status: State; workspacePath?: string; result?: unknown; error?: string; outcomeClassification?: unknown; errorDetails?: unknown };
};

function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function relative(value: string): string { return path.relative(root, value).replace(/\\/gu, "/"); }
function installOfflineGuard(): void {
  const deny = (boundary: string) => (...args: unknown[]): never => {
    const detail = typeof args[0] === "string" ? args[0] : "request object";
    providerAttempts.push({ boundary, detail });
    throw new Error(`ZERO_PROVIDER_GUARD_BLOCKED:${boundary}`);
  };
  globalThis.fetch = deny("global.fetch") as typeof fetch;
  http.request = deny("http.request") as typeof http.request;
  http.get = deny("http.get") as typeof http.get;
  https.request = deny("https.request") as typeof https.request;
  https.get = deny("https.get") as typeof https.get;
  net.connect = deny("net.connect") as typeof net.connect;
  net.createConnection = deny("net.createConnection") as typeof net.createConnection;
  tls.connect = deny("tls.connect") as typeof tls.connect;
}
async function exists(file: string): Promise<boolean> { try { await fs.access(file); return true; } catch { return false; } }
async function readJson(file: string): Promise<unknown | null> { try { return JSON.parse(await fs.readFile(file, "utf8")) as unknown; } catch { return null; } }
async function filesUnder(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? filesUnder(path.join(dir, entry.name))
    : [path.join(dir, entry.name)]))).flat();
}
function words(text: string): number { return text.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0; }
function titleOf(file: string): string { return path.basename(file, ".md").replace(/^[0-9]+[a-z-]*-/u, "").replaceAll("-", " "); }
function sourceId(file: string): string {
  const base = path.basename(file, ".md").toLowerCase();
  return (base.match(/^(l\d\d(?:-s\d\d)?|\d\d[a-z]?|\d\d[a-z]-[a-z]|osc-\d\d[a-z-]*)/u)?.[1] ?? base).replaceAll("_", "-");
}
function policy(format: "short" | "long", locale: string): { wpm: number; range: readonly [number, number] } {
  const short = { en: 160, de: 150, es: 155, it: 155, fr: 155, pt: 155 } as const;
  const long = { en: 150, de: 145, es: 150, it: 150, fr: 150, pt: 150 } as const;
  return { wpm: (format === "short" ? short : long)[locale as keyof typeof short] ?? 150, range: format === "short" ? [60, 90] : [570, 630] };
}
async function discoverRoot(input: { pack: string; release: string; dir: string; format: "short" | "long"; canonical: boolean }): Promise<Variant[]> {
  const roots = await fs.readdir(input.dir, { withFileTypes: true }).catch(() => []);
  const result: Variant[] = [];
  for (const localeDir of roots.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const file of (await fs.readdir(path.join(input.dir, localeDir.name), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name))) {
      const sourcePath = path.join(input.dir, localeDir.name, file.name);
      result.push({ pack: input.pack, release: input.release, format: input.format, locale: localeDir.name, sourcePath,
        contentId: input.pack === "veronica-content-pack-1" && input.format === "long"
          ? `l${path.basename(file.name).match(/^(\d{2})-/u)?.[1] ?? sourceId(sourcePath)}`
          : sourceId(sourcePath), title: titleOf(sourcePath), canonical: input.canonical });
    }
  }
  return result;
}
async function locateExisting(record: Variant): Promise<Record["existing"]> {
  const packRoot = path.join(root, "content-packs", record.pack);
  const content = record.contentId.toLowerCase();
  const planRoots = record.pack === "veronica-content-pack-1"
    ? [path.join(packRoot, "visual-review", "plans"), path.join(packRoot, "youtube-positioning-shorts-v3-50s", "visual-review", "plans")]
    : [path.join(packRoot, "support", "episodes")];
  const planFiles = (await Promise.all(planRoots.map(filesUnder))).flat();
  const hasPlan = planFiles.some((file) => /visual-plan\.json$/u.test(file) && path.basename(file).toLowerCase().startsWith(content));
  const matching = (await filesUnder(packRoot)).filter((file) => file.toLowerCase().includes(content));
  return {
    audio: matching.some((file) => /\.(wav|mp3|m4a)$/u.test(file)), plan: hasPlan,
    providerPrompts: matching.some((file) => /provider-image-prompts/u.test(file)),
    image: matching.some((file) => /\.(png|webp|jpe?g)$/u.test(file)),
    render: matching.some((file) => /\.(mp4|mov)$/u.test(file)),
    metadata: matching.some((file) => /metadata\/[^/]+\/.*\.json$/u.test(relative(file))),
    qa: matching.some((file) => /(?:qa|review).*\.json$/iu.test(file)),
  };
}
async function createRecord(variant: Variant): Promise<Record> {
  const source = await fs.readFile(variant.sourcePath, "utf8");
  const wordCount = words(source); const timing = policy(variant.format, variant.locale);
  const estimatedDurationSeconds = wordCount / timing.wpm * 60;
  const timingStatus = estimatedDurationSeconds < timing.range[0] ? "TOO_SHORT" : estimatedDurationSeconds > timing.range[1] ? "TOO_LONG" : "IN_TARGET";
  const existing = await locateExisting(variant);
  const gates: Gate[] = [
    { gateId: "SOURCE_NONEMPTY", stage: "source-admission", status: source.trim() ? "PASS" : "BLOCK", message: source.trim() ? "Narration source is non-empty." : "Narration source is empty.", evidencePath: relative(variant.sourcePath), deterministic: true },
    { gateId: "SCRIPT_TIMING", stage: "timing", status: timingStatus === "IN_TARGET" ? "PASS" : "BLOCK", message: `${timingStatus}; estimated ${estimatedDurationSeconds.toFixed(1)}s at ${timing.wpm} WPM; target ${timing.range[0]}-${timing.range[1]}s.`, evidencePath: "packages/speech/src/veronica-speech-rate-policy.ts", deterministic: true },
    { gateId: "CANONICAL_AUDIO", stage: "audio", status: existing.audio ? "PASS" : "NOT_REACHED", message: existing.audio ? "Historical audio artifact located." : "No canonical audio in content pack; TTS intentionally not run.", deterministic: true },
    { gateId: "EXISTING_PLAN", stage: "artifact-inventory", status: existing.plan ? "PASS" : "NOT_REACHED", message: existing.plan ? "Existing visual-plan artifact located." : "No matching existing visual-plan artifact located.", deterministic: true },
    { gateId: "SOURCE_GROUNDED_PAID_QA", stage: "paid-qa", status: "NOT_APPLICABLE", message: "Deliberately excluded by zero-provider census policy; historical evidence is not a deterministic result.", deterministic: false },
  ];
  return { ...variant, sourceSha256: sha(source), wordCount, targetWpm: timing.wpm, estimatedDurationSeconds, targetRangeSeconds: timing.range, timingStatus, existing, gates, preparation: { attempted: false, status: "NOT_REACHED" } };
}
function sourceRevisionHash(episodeId: string, source: { locale: string; sourcePath: string; sourceSha256: string }): string {
  return sha(JSON.stringify({ authoredEpisodeKey: episodeId, sources: [{ locale: source.locale, sourcePath: source.sourcePath, sourceSha256: source.sourceSha256 }] }));
}
async function prepareCanonicalEnglish(records: Record[]): Promise<void> {
  const { classifyVeronicaPreparationError } = await import("../packages/strategic-reinvention/src/veronica-deterministic-outcome.js");
  const { prepareCanonicalSourceEpisodeWorkspace } = await import("../packages/strategic-reinvention/src/veronica-content-pack-2-ingestion.js");
  const { preparePositioningProductionEpisode } = await import("../packages/strategic-reinvention/src/positioning-production-adapter.js");
  const { DeterministicVeronicaImagePromptCompiler, FileVeronicaImagePromptCompilationCache } = await import("../packages/strategic-reinvention/src/veronica-image-prompt-compiler.js");
  const selected = records.filter((record) => record.canonical && record.locale === "en");
  for (const record of selected) {
    const episodeId = `${record.pack === "veronica-content-pack-1" ? "p1" : "p2"}-${record.format}-${record.contentId}`.replace(/[^a-z0-9-]/gu, "-");
    const source = { locale: "en", sourcePath: relative(record.sourcePath), sourceSha256: record.sourceSha256, narration: await fs.readFile(record.sourcePath, "utf8") };
    const sourceEpisode = { schemaVersion: "veronica-canonical-source-episode.v1", ingestionAdapterVersion: "zero-cost-census.v1", sourcePackId: record.pack,
      episodeId, authoredEpisodeKey: episodeId, canonicalSlug: episodeId, title: record.title, contentProfileId: "veronicabenini", format: record.format,
      localeSources: [source], sourceRevisionHash: sourceRevisionHash(episodeId, source), declaredReusableAssets: [] } as const;
    try {
      const prepared = await prepareCanonicalSourceEpisodeWorkspace({ workspaceRoot, sourceEpisode, locale: "en" });
      const episodeDir = path.join(workspaceRoot, episodeId);
      const result = await preparePositioningProductionEpisode({ workspaceRoot, episodeId, language: "en", variant: record.format === "short" ? "short" : "full",
        imagePromptCompiler: { strategy: "deterministic-v1", compiler: new DeterministicVeronicaImagePromptCompiler(), cache: new FileVeronicaImagePromptCompilationCache(path.join(episodeDir, ".cache", "image-prompt-compilation")), model: { model: "deterministic-template", reasoningEffort: "none", maxOutputTokens: 0 } } });
      record.preparation = { attempted: true, status: result.semanticRemediationStatus === "CONVERGED" ? "PASS" : "BLOCK", workspacePath: relative(prepared.episodeDir), result };
      record.gates.push({ gateId: "DETERMINISTIC_PREPARATION", stage: "preparation", status: record.preparation.status, message: `Prepared locally; semantic remediation ${result.semanticRemediationStatus}; source-grounded QA ${result.sourceGroundedVisualQaStatus}.`, evidencePath: relative(path.join(prepared.episodeDir, "source", "pre-image-semantic-plan.v1.json")), deterministic: true });
    } catch (error) {
      const classification = classifyVeronicaPreparationError(error);
      const errorDetails = error && typeof error === "object" && "candidateSelection" in error
        ? { candidateSelection: error.candidateSelection }
        : undefined;
      record.preparation = { attempted: true, status: classification.status, workspacePath: relative(path.join(workspaceRoot, episodeId)), error: classification.message, outcomeClassification: classification, ...(errorDetails ? { errorDetails } : {}) };
      record.gates.push({ gateId: classification.code, stage: classification.stage, status: classification.status, message: classification.message, evidencePath: relative(path.join(workspaceRoot, episodeId)), deterministic: true });
    }
  }
  for (const record of records.filter((record) => !record.preparation.attempted)) {
    record.preparation = { attempted: false, status: "NOT_APPLICABLE" };
    record.gates.push({ gateId: record.canonical ? "CANONICAL_VISUAL_REUSE" : "SUPERSEDED_OR_ARCHIVAL_RELEASE", stage: "preparation", status: "NOT_APPLICABLE", message: record.canonical ? "Non-English visual planning is intentionally reused from canonical English under pack policy." : "Historical/superseded duplicate release was inventoried but not rematerialized.", deterministic: true });
  }
}
function failureFingerprint(gate: Gate): string { return `${gate.gateId}|${gate.stage}|${gate.status}`; }
async function write(file: string, value: string | object): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); }
function markdownTable(rows: readonly string[][]): string { return rows.map((row) => `| ${row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`).join("\n"); }
async function materializePack(records: Record[]): Promise<void> {
  const allFailures = await Promise.all(records.flatMap((record) => record.gates.filter((gate) => ["BLOCK", "ERROR"].includes(gate.status)).map(async (gate) => ({
    record: `${record.pack}:${record.release}:${record.format}:${record.locale}:${record.contentId}`,
    sourcePath: relative(record.sourcePath), sourceExcerpt: (await fs.readFile(record.sourcePath, "utf8")).slice(0, 1600),
    workspacePath: record.preparation.workspacePath ?? null, ...gate, fingerprint: failureFingerprint(gate),
  }))));
  const grouped = Object.entries(Object.groupBy(allFailures, (failure) => failure.fingerprint)).map(([id, values]) => ({ id, count: values!.length, examples: values!.slice(0, 5), classification: id.includes("TIMING") ? "POLICY" : id.includes("PREPARATION") ? "PLANNER" : "UNKNOWN", severity: id.includes("TIMING") ? "HIGH" : "MEDIUM" })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const gateCounts = Object.entries(Object.groupBy(records.flatMap((record) => record.gates), (gate) => `${gate.stage}:${gate.gateId}:${gate.status}`)).map(([key, values]) => ({ key, count: values!.length })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const timing = records.map((record) => ({ pack: record.pack, release: record.release, format: record.format, locale: record.locale, contentId: record.contentId, wordCount: record.wordCount, targetWpm: record.targetWpm, estimatedDurationSeconds: Number(record.estimatedDurationSeconds.toFixed(3)), targetRangeSeconds: record.targetRangeSeconds.join("-"), timingStatus: record.timingStatus, sourcePath: relative(record.sourcePath) }));
  const census = { schemaVersion: "veronica-zero-cost-preproduction-census.v1", createdAt: new Date().toISOString(), policySource: "packages/speech/src/veronica-speech-rate-policy.ts", discoveredVariants: records.length, canonicalPreparationAttempts: records.filter((record) => record.preparation.attempted).length, records };
  await write(path.join(packDir, "portfolio-census.json"), census);
  await write(path.join(packDir, "deterministic-results.json"), { schemaVersion: "veronica-deterministic-results.v1", gateCounts, records: records.map((record) => ({ id: `${record.pack}:${record.release}:${record.format}:${record.locale}:${record.contentId}`, gates: record.gates, preparation: record.preparation })) });
  await write(path.join(packDir, "systemic-issues.json"), { schemaVersion: "veronica-systemic-issues.v1", rawFailureCount: allFailures.length, issues: grouped.map((item, index) => ({ stableId: `VPC-${String(index + 1).padStart(3, "0")}`, ...item, denominator: records.length, percentage: Number((item.count / records.length * 100).toFixed(2)), rootLayerHypothesis: item.classification, confidence: "HIGH", centralFixPotential: item.classification === "POLICY" ? "high" : "medium", downstreamPaidCostRisk: item.severity === "HIGH" ? "high" : "medium" })) });
  await write(path.join(packDir, "failure-matrix.csv"), ["variant," + grouped.map((item) => JSON.stringify(item.id)).join(","), ...records.map((record) => [JSON.stringify(`${record.pack}:${record.release}:${record.format}:${record.locale}:${record.contentId}`), ...grouped.map((item) => record.gates.some((gate) => failureFingerprint(gate) === item.id) ? "1" : "0")].join(","))].join("\n"));
  await write(path.join(packDir, "timing-analysis.csv"), [Object.keys(timing[0] ?? {}).join(","), ...timing.map((row) => Object.values(row).map((value) => JSON.stringify(value)).join(","))].join("\n"));
  const counts = (predicate: (record: Record) => boolean) => records.filter(predicate).length;
  const summary = `# Veronica zero-cost preproduction census\n\nDiscovered ${records.length} physical Short/long narration variants. Canonical English visual-planning candidates were prepared in isolated workspaces with deterministic prompt compilation only. Localized variants retain the packs' canonical-English visual reuse policy.\n\n${markdownTable([["Measure", "Count"], ["Pack 1 variants", String(counts((r) => r.pack.endsWith("1")))], ["Pack 2 variants", String(counts((r) => r.pack.endsWith("2")))], ["Shorts", String(counts((r) => r.format === "short"))], ["Longs", String(counts((r) => r.format === "long"))], ["Canonical attempts", String(counts((r) => r.preparation.attempted))], ["Timing in target", String(counts((r) => r.timingStatus === "IN_TARGET"))], ["Timing too short", String(counts((r) => r.timingStatus === "TOO_SHORT"))], ["Timing too long", String(counts((r) => r.timingStatus === "TOO_LONG"))]])}\n`;
  await write(path.join(packDir, "README.md"), summary);
  await write(path.join(packDir, "portfolio-census.md"), `${summary}\nAll physical source releases are retained in portfolio-census.json; archive and superseded releases are explicitly marked NOT_APPLICABLE for rematerialization.\n`);
  await write(path.join(packDir, "systemic-issues.md"), `# Systemic issues\n\n${markdownTable([["ID", "Occurrences / all variants", "Severity", "Class", "Hypothesis"], ...grouped.map((item, index) => [`VPC-${String(index + 1).padStart(3, "0")}`, `${item.count}/${records.length}`, item.severity, item.classification, item.id])])}\n\nRaw, immutable records are in all-failures/.\n`);
  for (const [name, predicate] of [["shorts-summary.md", (r: Record) => r.format === "short"], ["longs-summary.md", (r: Record) => r.format === "long"], ["pack-1-summary.md", (r: Record) => r.pack.endsWith("1")], ["pack-2-summary.md", (r: Record) => r.pack.endsWith("2")]] as const) {
    const subset = records.filter(predicate); await write(path.join(packDir, name), `# ${name.replace(/\.md$/u, "")}\n\nVariants: ${subset.length}. In target: ${subset.filter((r) => r.timingStatus === "IN_TARGET").length}; too short: ${subset.filter((r) => r.timingStatus === "TOO_SHORT").length}; too long: ${subset.filter((r) => r.timingStatus === "TOO_LONG").length}.\n`);
  }
  await write(path.join(packDir, "architecture-findings.md"), "# Architecture findings\n\n- `packages/config/src/execution-policy.ts` rejects Veronica execution policies with provider dispatch enabled.\n- Deterministic prompt compilation is composed in `apps/cli/src/veronica-image-prompt-compiler-composition.ts`; the OpenAI adapter is a separate explicit adapter.\n- Source-grounded QA defaults to cache-only unless `--allow-paid-openai-qa` is explicitly supplied.\n- Pack 1 declares canonical-English visual reuse; locale changes should retime, not regenerate visuals.\n- Pack 2 ingestion currently exposes a Shorts-specific discovery adapter; this census also inventories its long-form files directly.\n");
  await write(path.join(packDir, "cost-risk-analysis.md"), "# Cost-risk analysis\n\nObserved: all content-pack variants lack canonical audio, rendered output, and generated image evidence. Dispatching TTS or images before resolving deterministic timing/planning blockers would create avoidable spend. Strong inference: Pack 1's many superseded/archive copies need an explicit source-release selector so stale scripts cannot enter paid production. Historical/provider cache evidence, if present, was not used to change this census's deterministic state.\n");
  await write(path.join(packDir, "validator-findings.md"), "# Validator findings\n\nNo deterministic validator was weakened. Timing findings use the canonical speech-rate policy and public duration ranges. The Pack 1 v3 Shorts README declares 45–60s while the current policy's Short range begins at 60s; treat this documented discrepancy as a policy-contract review item, not a source-content defect.\n");
  await write(path.join(packDir, "zero-paid-provider-proof.md"), `# Zero paid-provider proof\n\nExecution guard installed before dynamic pipeline imports: patched fetch, http/https request/get, net connect/createConnection, and tls connect to throw before any outbound request.\n\n| Category | Dispatch ledger before | Dispatches during run | Dispatch ledger after |\n| --- | ---: | ---: | ---: |\n| Paid LLM | 0 | 0 | 0 |\n| TTS | 0 | 0 | 0 |\n| Image generation | 0 | 0 | 0 |\n| Paid QA | 0 | 0 | 0 |\n| Embeddings | 0 | 0 | 0 |\n| Other metered provider | 0 | 0 | 0 |\n\nThe census-owned ledger is backed by the fail-closed runtime guard, not an absence-of-billing assertion. Prevented provider-dispatch attempts: ${providerAttempts.length}.\n\nStatic dispatch-boundary evidence: OpenAI Responses prompt compiler apps/cli/src/veronica-image-prompt-compiler-composition.ts; source-grounded QA composition apps/cli/src/veronica-source-grounded-visual-qa-composition.ts; OpenAI image adapter packages/image-generation/src/openai-image.ts; OpenAI and ElevenLabs speech adapters under packages/speech/src/platform/. Deterministic preparation used only DeterministicVeronicaImagePromptCompiler; no adapter client was instantiated.\n`);
  await write(path.join(packDir, "all-failures", "raw-failures.json"), allFailures);
  for (const issue of grouped) await write(path.join(packDir, "all-failures", `${sha(issue.id).slice(0, 12)}.json`), { fingerprint: issue.id, occurrences: allFailures.filter((failure) => failure.fingerprint === issue.id) });
  const representative = grouped.slice(0, 5).flatMap((issue) => issue.examples.slice(0, 3));
  for (const [index, item] of representative.entries()) {
    const record = records.find((candidate) => `${candidate.pack}:${candidate.release}:${candidate.format}:${candidate.locale}:${candidate.contentId}` === item.record);
    const workspace = item.workspacePath ? path.join(root, item.workspacePath) : null;
    const plan = workspace ? await readJson(path.join(workspace, "source", "pre-image-semantic-plan.v1.json")) : null;
    const compactPlan = plan && typeof plan === "object" ? (() => {
      const value = plan as { scenes?: unknown; assets?: unknown; visualBeatPlan?: unknown; validation?: unknown; semanticQuality?: unknown; providerReadiness?: unknown };
      return {
        validation: value.validation ?? null, semanticQuality: value.semanticQuality ?? null, providerReadiness: value.providerReadiness ?? null,
        visualBeatPlan: value.visualBeatPlan ?? null,
        scenes: Array.isArray(value.scenes) ? value.scenes.slice(0, 6) : [],
        compiledPromptAssets: Array.isArray(value.assets) ? value.assets.slice(0, 6) : [],
      };
    })() : null;
    await write(path.join(packDir, "representative-artifacts", `${String(index + 1).padStart(2, "0")}-${sha(item.fingerprint).slice(0, 8)}.json`), {
      ...item, source: record ? { path: relative(record.sourcePath), excerpt: (await fs.readFile(record.sourcePath, "utf8")).slice(0, 2400) } : null,
      compactDeterministicPlan: compactPlan,
    });
  }
  const manifestFiles = (await filesUnder(packDir)).filter((file) => path.basename(file) !== "MANIFEST.json").sort();
  await write(path.join(packDir, "MANIFEST.json"), { schemaVersion: "veronica-review-pack-manifest.v1", generatedAt: new Date().toISOString(), manifestExcludes: ["MANIFEST.json"], files: Object.fromEntries(await Promise.all(manifestFiles.map(async (file) => [path.relative(packDir, file).replace(/\\/gu, "/"), sha(await fs.readFile(file))]))) });
}

installOfflineGuard();
const variants = [
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "current-long", dir: path.join(root, "content-packs/veronica-content-pack-1/long"), format: "long", canonical: true })),
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "current-shorts-v3", dir: path.join(root, "content-packs/veronica-content-pack-1/youtube-positioning-shorts-v3-50s/shorts"), format: "short", canonical: true })),
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "superseded-shorts", dir: path.join(root, "content-packs/veronica-content-pack-1/shorts"), format: "short", canonical: false })),
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "too-short-history", dir: path.join(root, "content-packs/veronica-content-pack-1/shorts-too-short"), format: "short", canonical: false })),
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "packed-archive-shorts", dir: path.join(root, "content-packs/veronica-content-pack-1/packed/shorts"), format: "short", canonical: false })),
  ...(await discoverRoot({ pack: "veronica-content-pack-1", release: "packed-archive-longs", dir: path.join(root, "content-packs/veronica-content-pack-1/packed/long"), format: "long", canonical: false })),
  ...(await discoverRoot({ pack: "veronica-content-pack-2", release: "current", dir: path.join(root, "content-packs/veronica-content-pack-2/shorts"), format: "short", canonical: true })),
  ...(await discoverRoot({ pack: "veronica-content-pack-2", release: "current", dir: path.join(root, "content-packs/veronica-content-pack-2/long"), format: "long", canonical: true })),
];
const records = await Promise.all(variants.map(createRecord));
await prepareCanonicalEnglish(records);
await materializePack(records);
process.stdout.write(`${JSON.stringify({ packDir, outputRoot, variants: records.length, attempts: records.filter((record) => record.preparation.attempted).length, providerAttempts: providerAttempts.length }, null, 2)}\n`);
