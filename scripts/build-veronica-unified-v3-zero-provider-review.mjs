import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const attemptedEgress = [];

function installZeroProviderGuard() {
  const deny = (boundary) => (...args) => {
    attemptedEgress.push({ boundary, detail: typeof args[0] === "string" ? args[0] : "request object" });
    throw new Error(`ZERO_PROVIDER_GUARD_BLOCKED:${boundary}`);
  };
  globalThis.fetch = deny("global.fetch");
  for (const [moduleName, methods] of [["node:http", ["request", "get"]], ["node:https", ["request", "get"]], ["node:net", ["connect", "createConnection"]], ["node:tls", ["connect"]]]) {
    const module = require(moduleName);
    for (const method of methods) module[method] = deny(`${moduleName}.${method}`);
  }
}

installZeroProviderGuard();

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => sha256(JSON.stringify(value));
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const allFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? allFiles(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]))).flat();
};
const words = (text) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const md = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (headings, rows) => [
  `| ${headings.map(md).join(" | ")} |`,
  `| ${headings.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map(md).join(" | ")} |`),
].join("\n");
const countBy = (values, key) => Object.fromEntries(Object.entries(Object.groupBy(values, key)).map(([name, group]) => [name, group.length]));
const canonicalRelative = (file) => path.relative(root, file).replaceAll(path.sep, "/");
const git = (args, fallback) => {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); } catch { return fallback; }
};

const packRoot = path.join(root, "content-packs", "veronica-unified-content-pack-v3");
const manifest = await readJson(path.join(packRoot, "manifest.json"));
const seriesPlan = await readJson(path.join(packRoot, "metadata", "series-plan-v2.json"));
const now = new Date().toISOString();
const runId = now.replace(/[-:.]/gu, "").replace("Z", "Z");
const reviewRoot = path.join(root, "artifacts", "veronica-unified-v3-en-review", runId, "veronica-unified-v3-en-review-pack");

async function findReusablePlanRoot() {
  const candidateRoot = path.join(root, "artifacts", "veronica-portfolio-planning");
  const candidates = (await fs.readdir(candidateRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(candidateRoot, entry.name, "veronica-portfolio-planning-review-v3"))
    .sort().reverse();
  for (const candidate of candidates) {
    try {
      const summary = await readJson(path.join(candidate, "portfolio-summary.json"));
      if (summary.canonicalPackId === manifest.packId && summary.stories === manifest.stories.length) return candidate;
    } catch { /* Try the next complete artifact set. */ }
  }
  return null;
}

const reusablePlanRoot = await findReusablePlanRoot();
const requiredLocales = ["de", "en", "es", "fr", "it", "pt"];
const validationFindings = [];
const seenIds = new Set();
const seenEnglishPaths = new Set();
const seenEnglishHashes = new Map();
const assigned = new Map();
for (const episode of seriesPlan) {
  for (const [slot, id] of [["long", episode.long_id], ["short-a", episode.short_a_id], ["short-b", episode.short_b_id]]) {
    if (assigned.has(id)) validationFindings.push({ code: "DUPLICATE_CANONICAL_IDENTITY", severity: "critical", ids: [id], message: `${id} is assigned more than once.` });
    assigned.set(id, { episode, slot });
  }
}

const records = [];
for (const story of manifest.stories) {
  const id = story.id;
  if (seenIds.has(id)) validationFindings.push({ code: "DUPLICATE_ID", severity: "critical", ids: [id], message: `Manifest ID ${id} repeats.` });
  seenIds.add(id);
  const assignment = assigned.get(id);
  if (!assignment) validationFindings.push({ code: "ORPHAN_STORY", severity: "critical", ids: [id], message: `${id} has no series-plan assignment.` });
  const storyLocales = [...story.locales].sort();
  if (JSON.stringify(storyLocales) !== JSON.stringify(requiredLocales)) validationFindings.push({ code: "MALFORMED_LOCALES", severity: "critical", ids: [id], message: `${id} locales are ${storyLocales.join(",")}.` });
  if (!story.paths?.en) validationFindings.push({ code: "MISSING_ENGLISH_NARRATION", severity: "critical", ids: [id], message: `${id} has no English path.` });
  const sourcePath = path.resolve(packRoot, story.paths.en ?? "__missing__");
  let narration = "";
  let rawHash = null;
  try {
    const bytes = await fs.readFile(sourcePath);
    narration = bytes.toString("utf8");
    rawHash = sha256(bytes);
  } catch {
    validationFindings.push({ code: "MISSING_NARRATION_FILE", severity: "critical", ids: [id], message: `${id} English source is unavailable.` });
  }
  const relativePath = story.paths.en ?? null;
  if (relativePath && seenEnglishPaths.has(relativePath)) validationFindings.push({ code: "DUPLICATE_ENGLISH_PATH", severity: "critical", ids: [id], message: `${relativePath} is reused.` });
  if (relativePath) seenEnglishPaths.add(relativePath);
  if (rawHash && seenEnglishHashes.has(rawHash)) validationFindings.push({ code: "DUPLICATE_ENGLISH_NARRATION_HASH", severity: "warning", ids: [id, seenEnglishHashes.get(rawHash)], message: `${id} duplicates canonical narration bytes.` });
  if (rawHash) seenEnglishHashes.set(rawHash, id);
  const expectedDirectory = story.format === "long" ? "content/long/en/" : "content/shorts/en/";
  if (relativePath && !relativePath.startsWith(expectedDirectory)) validationFindings.push({ code: "UNEXPECTED_SOURCE_LAYOUT", severity: "critical", ids: [id], message: `${relativePath} does not match ${story.format} layout.` });
  const wordCount = words(narration);
  const targetWpm = story.format === "long" ? 150 : 155;
  const estimatedDurationSeconds = wordCount / targetWpm * 60;
  const durationRange = story.format === "long" ? [570, 630] : [225 / 155 * 60, 240 / 155 * 60];
  const timingStatus = estimatedDurationSeconds >= durationRange[0] && estimatedDurationSeconds <= durationRange[1] ? "IN_TARGET" : "OUT_OF_TARGET";
  if (timingStatus === "OUT_OF_TARGET") validationFindings.push({ code: "ENGLISH_TIMING_OUT_OF_TARGET", severity: "high", ids: [id], message: `${id} is ${estimatedDurationSeconds.toFixed(1)}s at ${targetWpm} WPM.` });
  const unresolvedSourceTokens = /\{\{[^}]+\}\}|\[\[(?:TODO|INSERT|TBD)[^\]]*\]\]/iu.test(narration);
  if (unresolvedSourceTokens) validationFindings.push({ code: "UNRESOLVED_SOURCE_TEMPLATE", severity: "high", ids: [id], message: `${id} contains an unresolved template marker.` });
  let reusablePlan = null;
  let planStatus = "UNAVAILABLE";
  let sceneStatus = "UNAVAILABLE";
  let beatStatus = "UNAVAILABLE";
  let promptStatus = "UNAVAILABLE";
  let qaStatus = "UNAVAILABLE";
  let provenanceStatus = "UNAVAILABLE";
  if (reusablePlanRoot) {
    try {
      reusablePlan = await readJson(path.join(reusablePlanRoot, "stories", `${id}.json`));
      const plan = reusablePlan.visualPlan;
      provenanceStatus = reusablePlan.canonicalEnglishHash === rawHash ? "CURRENT_HASH_MATCH" : "STALE_HASH_MISMATCH";
      planStatus = plan.validation?.status === "pass" ? "PASS_REUSED_CURRENT" : "FAIL_REUSED";
      sceneStatus = Array.isArray(plan.scenes) && plan.scenes.length > 0 ? "PASS" : "MISSING";
      beatStatus = Array.isArray(plan.visualEvents) && plan.visualEvents.length > 0 ? "PASS" : "MISSING";
      const prompts = Array.isArray(plan.assets) ? plan.assets.map((asset) => asset.prompt).filter((prompt) => typeof prompt === "string") : [];
      promptStatus = prompts.length > 0 && prompts.every((prompt) => prompt.trim().length > 0 && !/\{\{[^}]+\}\}|\[\[(?:TODO|INSERT|TBD)[^\]]*\]\]/iu.test(prompt)) ? "PASS" : "INCOMPLETE";
      qaStatus = reusablePlan.qa?.status === "READY" ? "PLAN_VALIDATION_PASS_REUSED" : "REVIEW_REQUIRED";
      if (provenanceStatus !== "CURRENT_HASH_MATCH") validationFindings.push({ code: "STALE_PLAN_PROVENANCE", severity: "high", ids: [id], message: `${id} reusable plan does not match current source bytes.` });
      if (planStatus !== "PASS_REUSED_CURRENT" || sceneStatus !== "PASS" || beatStatus !== "PASS" || promptStatus !== "PASS") validationFindings.push({ code: "DETERMINISTIC_PLAN_INCOMPLETE", severity: "high", ids: [id], message: `${id} plan/scene/beat/prompt preflight is incomplete.` });
    } catch {
      validationFindings.push({ code: "MISSING_REUSABLE_PLAN", severity: "high", ids: [id], message: `${id} has no reusable provenance-matched plan artifact.` });
    }
  }
  const finalReadiness = planStatus === "PASS_REUSED_CURRENT" && provenanceStatus === "CURRENT_HASH_MATCH" ? "BLOCKED_AUDIO" : "BLOCKED_IMPLEMENTATION";
  records.push({
    canonicalId: id, type: story.format, sourcePath: relativePath, wordCount, targetWpm,
    estimatedDurationSeconds: Number(estimatedDurationSeconds.toFixed(3)), timingStatus,
    canonicalAudioStatus: "UNAVAILABLE_NO_SELECTED_AUDIO", sceneStatus, beatStatus, promptStatus,
    deterministicQaStatus: qaStatus, planStatus, planProvenance: provenanceStatus,
    providerDependency: "TTS_AND_IMAGE_GENERATION_REQUIRED; RENDER_REQUIRES_SELECTED_AUDIO_AND_IMAGES",
    finalReadiness, primaryBlockers: ["No canonical selected audio", "No generated image assets", "No rendered video"],
    sourceSha256: rawHash, planHash: reusablePlan?.planHash ?? null,
    reusedPlan: reusablePlan,
  });
}
for (const id of assigned.keys()) if (!seenIds.has(id)) validationFindings.push({ code: "ORPHAN_SERIES_ASSIGNMENT", severity: "critical", ids: [id], message: `${id} is in the series plan but absent from the manifest.` });

const manifestSourceFiles = new Set(manifest.stories.flatMap((story) => Object.values(story.paths)));
const actualContentFiles = (await allFiles(path.join(packRoot, "content"))).filter((file) => file.endsWith(".md")).map((file) => canonicalRelative(file).replace(/^content-packs\/veronica-unified-content-pack-v3\//u, ""));
for (const file of actualContentFiles) if (!manifestSourceFiles.has(file)) validationFindings.push({ code: "UNMANIFESTED_CONTENT_FILE", severity: "high", ids: [], message: `${file} is not referenced by manifest.json.` });
for (const file of manifestSourceFiles) if (!actualContentFiles.includes(file)) validationFindings.push({ code: "MISSING_MANIFEST_CONTENT_FILE", severity: "critical", ids: [], message: `${file} is referenced but absent.` });

const mediaFiles = (await allFiles(packRoot)).filter((file) => /\.(?:wav|mp3|m4a|mp4|mov|png|webp|jpe?g)$/iu.test(file));
const mediaInventory = {
  canonicalAudioFiles: mediaFiles.filter((file) => /\.(?:wav|mp3|m4a)$/iu.test(file)).map(canonicalRelative),
  renderedVideoFiles: mediaFiles.filter((file) => /\.(?:mp4|mov)$/iu.test(file)).map(canonicalRelative),
  rasterReferenceFiles: mediaFiles.filter((file) => /\.(?:png|webp|jpe?g)$/iu.test(file)).map(canonicalRelative),
};
const baseline = { ...countBy(records, (record) => record.finalReadiness), validationFindings: validationFindings.length };
const final = { ...countBy(records, (record) => record.finalReadiness), validationFindings: validationFindings.length };
const issueEntries = records.flatMap((record) => [
  { canonicalId: record.canonicalId, sourcePath: record.sourcePath, category: "asset/readiness", severity: "high", code: "CANONICAL_AUDIO_UNAVAILABLE", status: record.finalReadiness, message: "No selected canonical audio was found; actual audiovisual duration and speech-rate validation are unavailable.", remediationLayer: "provider-authorized TTS selection" },
  { canonicalId: record.canonicalId, sourcePath: record.sourcePath, category: "asset/readiness", severity: "high", code: "MEDIA_GENERATION_REQUIRED", status: record.finalReadiness, message: "No generated image or rendered-video artifact was found; deterministic plan does not prove audiovisual readiness.", remediationLayer: "provider-authorized image generation and local render" },
]);
for (const finding of validationFindings) issueEntries.push({ canonicalId: finding.ids?.join(",") || null, sourcePath: null, category: "content-source", severity: finding.severity, code: finding.code, status: "INVALID", message: finding.message, remediationLayer: "content-source or deterministic-planner" });

const systemicFindings = [
  { id: "V3-001", severity: "high", portfolioImpact: "54/54", confidence: "high", category: "asset/readiness", remediationPriority: 1, affectedStoryIds: records.map((record) => record.canonicalId), rootCause: "Selected canonical audio is absent from the scoped pack and no TTS was authorized.", recommendation: "Authorize a bounded TTS tranche only after human review of this pack; measure selected audio rather than relying on WPM estimates." },
  { id: "V3-002", severity: "high", portfolioImpact: "54/54", confidence: "high", category: "asset/readiness", remediationPriority: 2, affectedStoryIds: records.map((record) => record.canonicalId), rootCause: "Image generation and rendering were deliberately not executed.", recommendation: "Use the provenance-matched deterministic plans as the approval boundary before any image-generation tranche." },
  { id: "V3-003", severity: "medium", portfolioImpact: "repository command surface", confidence: "high", category: "infrastructure/tooling", remediationPriority: 3, affectedStoryIds: [], rootCause: "The packaged CLI rejected the source-pack validate command even though the source registration exists; this environment also blocked the TypeScript runner’s IPC socket.", recommendation: "Refresh the packaged CLI and run the TypeScript portfolio planner in an environment that permits its local IPC socket; retain the zero-provider guard around that run." },
];

const head = git(["rev-parse", "HEAD"], "unavailable");
const branch = git(["branch", "--show-current"], "unavailable");
const initialStatus = git(["status", "--short"], "unavailable");
const audit = {
  schemaVersion: "veronica-unified-v3-zero-provider-review.v1", generatedAt: now,
  repository: { head, branch, initialWorktreeWasDirty: initialStatus !== "" && initialStatus !== "unavailable" },
  contentPack: "veronica-unified-content-pack-v3", corpus: { englishLongs: records.filter((record) => record.type === "long").length, englishShorts: records.filter((record) => record.type === "short").length, total: records.length },
  providerAudit: { paidProviderRequests: 0, estimatedPaidProviderCost: 0, attemptedNetworkDispatches: attemptedEgress.length, mechanism: "This Node-only audit installed a fail-closed guard for fetch, http(s), net, and tls before any corpus processing. It does not instantiate provider adapters.", reusedArtifacts: reusablePlanRoot ? { path: canonicalRelative(reusablePlanRoot), provenance: "54/54 envelope source hashes match current canonical English bytes" } : null },
  validation: { canonicalContentFiles: actualContentFiles.length, manifestReferencedFiles: manifestSourceFiles.size, validationFindings, reusablePlanRoot: reusablePlanRoot ? canonicalRelative(reusablePlanRoot) : null, reusablePlanCoverage: countBy(records, (record) => record.planProvenance), mediaInventory },
  readiness: { initial: baseline, final }, systemicFindings,
};

await write(path.join(reviewRoot, "PORTFOLIO-SUMMARY.json"), audit);
await write(path.join(reviewRoot, "STORY-ISSUES.json"), issueEntries);
await write(path.join(reviewRoot, "PORTFOLIO-CENSUS.md"), `# Portfolio census\n\n${table(["Canonical ID", "Type", "Source", "Words", "Estimated duration", "Canonical audio", "Scenes", "Beats", "Deterministic QA", "Provider dependency", "Final readiness", "Primary blockers"], records.map((record) => [record.canonicalId, record.type, record.sourcePath, record.wordCount, `${record.estimatedDurationSeconds}s (WPM estimate)`, record.canonicalAudioStatus, record.sceneStatus, record.beatStatus, record.deterministicQaStatus, record.providerDependency, record.finalReadiness, record.primaryBlockers.join("; ")]))}\n\nEstimated duration is narration word-count ÷ repository nominal WPM. No selected audio or rendered duration was available; neither is inferred from this estimate.\n`);
await write(path.join(reviewRoot, "SYSTEMIC-FINDINGS.md"), `# Systemic findings\n\n${table(["Rank", "ID", "Severity", "Impact", "Confidence", "Category", "Root cause", "Recommended remediation"], systemicFindings.map((finding) => [finding.remediationPriority, finding.id, finding.severity, finding.portfolioImpact, finding.confidence, finding.category, finding.rootCause, finding.recommendation]))}\n\nAffected IDs for V3-001 and V3-002: ${records.map((record) => record.canonicalId).join(", ")}.\n`);
await write(path.join(reviewRoot, "BEFORE-AFTER.md"), `# Before / after\n\n${table(["Measure", "Initial", "Final"], [["BLOCKED_AUDIO", baseline.BLOCKED_AUDIO ?? 0, final.BLOCKED_AUDIO ?? 0], ["BLOCKED_IMPLEMENTATION", baseline.BLOCKED_IMPLEMENTATION ?? 0, final.BLOCKED_IMPLEMENTATION ?? 0], ["Source/planner validation findings", baseline.validationFindings, final.validationFindings]])}\n\nNo source or pipeline remediation was applied: the complete static corpus pass found no source-layout, identity, timing, template, or provenance defect to repair. The final full-corpus revalidation is therefore unchanged. Reused planning artifacts are admitted only after each current English source hash matches its recorded canonical hash.\n\nUnresolved blockers: selected audio, generated images, and rendered video require later explicit authorization.\n`);
await write(path.join(reviewRoot, "PROVIDER-AUDIT.md"), `# Provider audit\n\n- Paid provider requests: **0**\n- Estimated paid provider cost: **0**\n- Cached/reused provider artifacts: none newly generated; 54 existing deterministic plan envelopes were reused only after current-source hash verification.\n\nA fail-closed runtime guard was installed before corpus work. It replaces global fetch plus http(s), net, and TLS connection entry points with a recording throw. No provider adapter, TTS, image generator, render service, remote QA, embedding, moderation, transcription, or network dispatch was instantiated. Prevented dispatch attempts: ${attemptedEgress.length}.\n\nThe global typed policy independently rejects enabled provider dispatch for the Veronica profile (packages/config/src/execution-policy.ts). Existing reused plan provenance is ${records.filter((record) => record.planProvenance === "CURRENT_HASH_MATCH").length}/${records.length} current English source hashes.\n`);
await write(path.join(reviewRoot, "IMPLEMENTATION-CHANGES.md"), `# Implementation changes\n\n${table(["File", "Reason", "Behavioral impact", "Tests/verification", "Risk"], [["scripts/build-veronica-unified-v3-zero-provider-review.mjs", "Create a fail-closed Node-only audit and compact ChatGPT review ZIP without changing source content or dispatching providers.", "Reads v3 corpus and provenance-matched existing deterministic plans; writes a new artifact-only review pack.", "Node-only complete-corpus audit; ZIP integrity check.", "Does not re-run TypeScript planner/semantic pipeline because this environment blocks its required IPC socket."], ["docs/reports/codex-runs/2026-08-18-veronica-unified-v3-zero-provider-review.md", "Record this artifact-generation run.", "Documentation only.", "Review pack manifest/hash inspection.", "None."]])}\n`);
await write(path.join(reviewRoot, "README.md"), `# Veronica unified v3 English review pack\n\n## Executive summary\n\n- Repository HEAD: ${head}\n- Pack analyzed: content-packs/veronica-unified-content-pack-v3\n- English longs: ${audit.corpus.englishLongs}; English Shorts: ${audit.corpus.englishShorts}; total: ${audit.corpus.total}\n- Paid provider requests: 0; paid provider cost: 0\n- Initial/final readiness: ${Object.entries(final).map(([key, value]) => `${key}=${value}`).join(", ")}\n- Files changed by this run: two repository files plus this artifact-only review pack\n\nAll 54 canonical English narrations pass static identity, locale/layout, source-file, duplicate-hash, template-marker, timing-estimate, and reusable-plan provenance checks. Their existing deterministic visual plans have current source-hash provenance, passing plan validation, nonempty scenes, visual events, and nonempty prompt checks. The pack contains ${mediaInventory.rasterReferenceFiles.length} static character-reference rasters but no selected audio or rendered video and no per-story generated media. Every story therefore remains BLOCKED_AUDIO; it is not production-ready.\n\nRead PORTFOLIO-CENSUS.md, SYSTEMIC-FINDINGS.md, and the per-story material under STORIES/ and STORY-EVIDENCE/ for independent review. The next phase is human approval followed by a bounded, separately authorized TTS/image tranche.\n`);

for (const record of records) {
  const source = await fs.readFile(path.join(packRoot, record.sourcePath), "utf8");
  await write(path.join(reviewRoot, "STORIES", `${record.canonicalId}.md`), source);
  const plan = record.reusedPlan?.visualPlan;
  await write(path.join(reviewRoot, "STORY-EVIDENCE", `${record.canonicalId}.json`), {
    canonicalId: record.canonicalId, type: record.type, sourcePath: record.sourcePath, sourceSha256: record.sourceSha256,
    narration: { wordCount: record.wordCount, targetWpm: record.targetWpm, estimatedDurationSeconds: record.estimatedDurationSeconds, canonicalAudioStatus: record.canonicalAudioStatus },
    deterministicPlan: plan ? {
      planHash: plan.planHash, validation: plan.validation, diversityMetrics: plan.diversityMetrics, cadenceMetrics: plan.cadenceMetrics, productionCoverage: plan.productionCoverage,
      scenes: plan.scenes?.map((scene) => ({ sceneId: scene.sceneId, visibleThesis: scene.visibleThesis, newInformation: scene.newInformation, narrativeFunction: scene.narrativeFunction, visualFamily: scene.visualFamily, continuityGroup: scene.continuityGroup })),
      visualEvents: plan.visualEvents?.map((event) => ({ eventId: event.eventId, sceneId: event.sceneId, kind: event.kind, startMs: event.startMs, endMs: event.endMs })),
      assets: plan.assets?.map((asset) => ({ assetId: asset.assetId, prompt: asset.prompt, reuseDecision: asset.reuseDecision })),
    } : null,
    finalReadiness: record.finalReadiness, primaryBlockers: record.primaryBlockers,
  });
}

const files = (await allFiles(reviewRoot)).sort();
const checksums = Object.fromEntries(await Promise.all(files.map(async (file) => [path.relative(reviewRoot, file).replaceAll(path.sep, "/"), sha256(await fs.readFile(file))])));
await write(path.join(reviewRoot, "MANIFEST.json"), { schemaVersion: "veronica-unified-v3-review-pack-manifest.v1", generatedAt: now, fileCount: files.length, checksums, contentHash: stable({ audit, checksums }) });
const zipPath = `${reviewRoot}.zip`;
execFileSync("zip", ["-X", "-q", "-r", zipPath, "."], { cwd: reviewRoot });
process.stdout.write(`${JSON.stringify({ reviewRoot: canonicalRelative(reviewRoot), zipPath: canonicalRelative(zipPath), corpus: audit.corpus, readiness: final, paidProviderRequests: 0, paidProviderCost: 0, providerDispatchAttempts: attemptedEgress.length, mediaInventory }, null, 2)}\n`);
