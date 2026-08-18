import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const timestamp = process.argv[2];
if (!timestamp) throw new Error("timestamp argument is required");

const root = process.cwd();
const startHead = "492543be534da6bf004d6089e174fbb2d21b86cc";
const planningZip = "artifacts/veronica-systemic-remediation-m1-planning/2026-08-17T21-42-50Z/veronica-systemic-remediation-m1-planning-review-2026-08-17T21-42-50Z.zip";
const baselineDir = "artifacts/veronica-portfolio-preproduction/2026-08-17T21-24-44-405Z-evidence-hardening-v2/veronica-portfolio-preproduction-review-v2";
const baselineResultsPath = `${baselineDir}/deterministic-results.json`;
const systemicPath = `${baselineDir}/systemic-issues.json`;
const outer = join(root, "artifacts/veronica-systemic-remediation-m1", timestamp);
const packName = `veronica-systemic-remediation-m1-review-${timestamp}`;
const pack = join(outer, packName);
const representative = join(pack, "representative-before-after");
mkdirSync(representative, { recursive: true });

const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (path) => sha(readFileSync(path));
const write = (name, value) => {
  const path = join(pack, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, "utf8");
};
const writeJson = (name, value) => write(name, JSON.stringify(value, null, 2));
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const baseline = readJson(baselineResultsPath);
const systemic = readJson(systemicPath);
const gitStatus = () => execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
const currentBeforePack = gitStatus();
const introducedCleanFiles = new Set([
  " M packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts",
  " M packages/strategic-reinvention/src/veronica-visual-plan-resolver.ts",
  "?? scripts/generate-veronica-systemic-remediation-m1-review.mjs",
]);
const reconstructedInitialDirty = currentBeforePack.filter((line) => !introducedCleanFiles.has(line));

const m1Files = [
  ["packages/strategic-reinvention/src/veronica-visual-plan-resolver.ts", false, "typed authority classification, content-addressed preservation, atomic rederive", "M1.1"],
  ["packages/strategic-reinvention/src/veronica-visual-plan-resolver.unit.test.ts", true, "resolver characterization and idempotence coverage", "M1.1"],
  ["packages/strategic-reinvention/src/positioning-visual-contracts.ts", true, "v4 finalized proposition, authorization, state model, semantic revision", "M1.2/M1.7"],
  ["packages/strategic-reinvention/src/positioning-production-adapter.ts", true, "v3 rederivation boundary and override finalization", "M1.2/M1.3"],
  ["packages/strategic-reinvention/src/veronica-semantic-quality.ts", true, "machine-readable concept authorization", "M1.2/M1.3"],
  ["packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts", false, "finite source-bound operators and typed abstention", "M1.2-M1.4"],
  ["packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts", true, "semantic authority, authorization, and abstention fixtures", "M1.2-M1.4"],
  ["packages/strategic-reinvention/src/veronica-visual-beats.ts", true, "parent semantic identity and parent-bound automatic beats", "M1.5/M1.7"],
  ["packages/strategic-reinvention/src/veronica-visual-beats.unit.test.ts", true, "v4 parent identity fixtures", "M1.5/M1.7"],
  ["packages/strategic-reinvention/src/veronica-image-prompt-compiler.ts", true, "structured prompt budget and typed mandatory overflow", "M1.6"],
  ["packages/strategic-reinvention/src/veronica-image-prompt-compiler.unit.test.ts", true, "budget compaction and mandatory overflow fixtures", "M1.6"],
  ["scripts/generate-veronica-systemic-remediation-m1-review.mjs", false, "blocked-run evidence pack generator", "Reporting"],
  ["docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m1.md", false, "required run report", "Reporting"],
];

const canonical = {
  schemaVersion: "veronica-systemic-remediation-m1-canonical-results.v1",
  generatedAt: timestamp,
  finalStatus: "BLOCKED",
  baselineSource: baselineResultsPath,
  postM1Execution: "NOT_REACHED",
  records: baseline.records.map((record) => ({
    id: record.id,
    baselineStatus: record.preparation.status,
    baselineRootCauses: record.gates.filter((gate) => gate.status === "BLOCK" || gate.status === "ERROR").map((gate) => gate.gateId),
    postM1Status: "NOT_REACHED",
    postM1RootCauses: [],
    resolvedRootCauses: [],
    newlyIntroducedRootCauses: [],
    reason: "M1.3 focused regression survived two targeted fixes; Tier 3 was prohibited by the stop rule.",
  })),
};
writeJson("canonical-results.json", canonical);

const rootCauseRows = systemic.rootCauseMatrix.map((item) => [
  item.normalizedFinding,
  item.affectedCanonicalEpisodes,
  item.affectedScenes,
  "NOT_MEASURED",
  "NOT_MEASURED",
  "",
  "UNKNOWN",
  "Post-M1 corpus run was not reached; no delta claimed.",
]);
write("before-after-root-causes.csv", [
  ["normalized_finding", "baseline_episodes", "baseline_occurrences", "post_episodes", "post_occurrences", "delta", "classification", "interpretation"].map(csvCell).join(","),
  ...rootCauseRows.map((row) => row.map(csvCell).join(",")),
].join("\n"));

const suspiciousConcepts = ["doorway", "threshold", "first-time visitor", "visitor", "professional", "customer", "audience-offer-fit", "expertise-recognition"];
write("concept-leakage-after.csv", [
  ["concept", "post_occurrences", "classification", "evidence"].map(csvCell).join(","),
  ...suspiciousConcepts.map((concept) => [concept, "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"].map(csvCell).join(",")),
].join("\n"));

const baselineMetric = (key) => systemic.remediationDistributions[key]?.mean ?? null;
writeJson("remediation-metrics.json", {
  schemaVersion: "veronica-systemic-remediation-m1-remediation-metrics.v1",
  status: "NOT_REACHED",
  baseline: {
    remediationTemplateReuseRate: baselineMetric("remediationTemplateReuseRate"),
    genericFallbackSceneRate: baselineMetric("genericFallbackSceneRate"),
    repeatedActionFamilyRate: baselineMetric("repeatedActionFamilyRate"),
    repeatedEnvironmentFamilyRate: baselineMetric("repeatedEnvironmentFamilyRate"),
  },
  postM1: {
    remediationTemplateReuseRate: null,
    genericFallbackSceneRate: null,
    repeatedActionFamilyRate: null,
    repeatedEnvironmentFamilyRate: null,
    semanticRemediationLowConfidenceRate: null,
    noSafeEncodingCount: null,
    reviewDueSemanticAmbiguity: null,
    blockDueSourceAuthorization: null,
  },
});

const beatCounts = {};
for (const failure of systemic.visualBeatFailures ?? []) {
  for (const finding of failure.validatorFindings ?? []) beatCounts[finding.code] = (beatCounts[finding.code] ?? 0) + 1;
}

write("README.md", `# Veronica Systemic Remediation M1 review\n\nStatus: **BLOCKED**. The run implemented and verified resolver safety, staged semantic/projection/remediation/beat/prompt changes, then stopped when M1.3 authorization regression persisted after two focused fixes. The V2 baseline is 48 canonical variants: 0 PASS, 27 BLOCK, 21 ERROR. Tier 3 was not run, so all post-M1 corpus fields are NOT_REACHED.\n\nNo provider-capable corpus runner was imported. Actual paid/provider dispatches: 0. Review implementation-summary.md, remaining-blockers.md, tests.md, and changed-files.md first.`);
write("implementation-summary.md", `# Implementation summary\n\n- M1.1 DONE: typed resolver authority, null-plan rederive, content-addressed archive, atomic replacement.\n- M1.2 PARTIAL: v4 finalized semantic authority is implemented; full focused suite did not complete.\n- M1.3 BLOCKED: a supported doorway fixture still receives an unauthorized template-invented professional actor.\n- M1.4-M1.7 PARTIAL/NOT REACHED: code is staged, but dependent tests and corpus proof were stopped.\n\nNo Pack 1 scripts/timing, providers, validators, paid QA, assets, rendering, or publication policy changed.`);
write("architecture-after.md", `# Architecture after\n\nThe staged path is: source spans → finalized v4 semantic proposition and authorization → pure treatment/projection validation → bounded source-bound operator or typed abstention → parent-bound beat candidates → structured budgeted prompt → semantic-parent provenance.\n\n\`\`\`mermaid\nflowchart LR\nS[Source spans] --> F[Finalized semantic v4]\nF --> A[Authorization]\nF --> P[Projection]\nA --> P\nP --> O{Safe operator?}\nO -->|yes| B[Beat plan]\nO -->|no| R[BLOCK or REVIEW]\nB --> C[Budgeted compiler]\n\`\`\`\n\nDeviation: M1.3 was stopped before acceptance because legacy motif treatment still introduces an unsupported actor persona.`);
write("semantic-contract-implemented.md", `# Semantic contract implemented\n\nThe existing VeronicaSemanticProposition is extended to version 4; no parallel authority was added. Finalization rebuilds readonly authority for subject, owner, affected party, buyer perspective, polarity, causality, discriminated state model, source spans, visible consequence, authorization, and constraints. semanticRevisionHash uses stable canonical serialization; propositionHash remains a derived compatibility alias. Persisted v3 data is audit-readable but must rederive/finalize and cannot silently claim v4 authority.`);
write("stale-plan-implementation.md", `# Stale-plan implementation\n\nResolver classification precedes parse authority. Valid compatible derived plans are reused; positively accepted plans are immutable; literal null and safe derived-compatible invalid plans are preserved then deterministically rederived; malformed untrusted non-null plans block. Archives use visual-plan.invalid/<sha256>.json plus metadata. The write path uses an injected/existing atomic writer. Focused tests passed null preservation, idempotence, accepted protection, rerun reuse, and atomic failure retention.`);
write("remediation-implementation.md", `# Remediation implementation\n\nA finite operator result distinguishes ENCODED from NO_SAFE_ENCODING. Candidate families are bounded and consume typed semantic slots. Authorization and compatibility are checked after projection. Failed authorization leaves the original scene unchanged with audit evidence; repair stops on no-change. Generic repair-until-pass behavior is bypassed. Acceptance is blocked because the legacy doorway motif template still injects a professional actor not authorized by source or the final contract.`);
write("beat-planner-implementation.md", `# Beat planner implementation\n\nStaged beats carry parentSemanticRevisionHash and automatic generation uses the finalized parent proposition rather than independently re-inferring owner/polarity/mechanism per narration chunk. Existing sequence diversity/quality validators and thresholds were not changed by M1. The beat test file was not reached in the final grouped run after M1.3 stopped the suite; no quality delta is claimed.`);
write("prompt-budget-implementation.md", `# Prompt budget implementation\n\nThe hard schema maximum remains 4,000 characters and the internal target is 3,600. The compiler renders ordered mandatory and compactable sections, deterministically deduplicates constraints, and never substring-truncates semantic clauses. Mandatory-only overflow yields PROMPT_MANDATORY_CONTENT_OVER_BUDGET with BLOCK semantics. Prompt tests and the V2 overflow corpus case were not reached, so produced maximum length is NOT_MEASURED.`);
write("cache-provenance-implementation.md", `# Cache and provenance implementation\n\nsemanticRevisionHash is the semantic parent identity; propositionHash is a derived legacy view. Beat plans explicitly carry parentSemanticRevisionHash. No global cache redesign or broad invalidation was introduced. Resolver archives cannot become canonical authority. Historical QA and accepted assets were not touched. Targeted invalidation/resume behavior remains unverified because M1.7 corpus proof was not reached.`);
write("tests.md", `# Tests\n\n- Characterization: resolver null artifact reproduced INVALID_VISUAL_PLAN before the fix.\n- Tier 1 resolver: PASS, 13/13.\n- Tier 1 semantic gate: staged fixtures ran until supported-doorway regression; FAIL. Same focused regression survived two targeted fixes.\n- Sequence diversity in grouped run: PASS, 13 tests.\n- Beat and prompt files: NOT_REACHED because Vitest bailed at semantic gate.\n- Typecheck: FAIL after two repair reruns; remaining exactOptionalPropertyTypes mismatch for editorial override contrast at positioning-production-adapter.ts:1446.\n- Tier 2: NOT_REACHED. Tier 3 exact 48: NOT_REACHED. Lint/shared-genre: NOT_REACHED.\n\nNo validator threshold was weakened.`);
write("before-after-summary.md", `# Before/after summary\n\n| Status | V2 baseline | Post-M1 |\n|---|---:|---:|\n| PASS | 0 | NOT_REACHED |\n| BLOCK | 27 | NOT_REACHED |\n| REVIEW | 0 | NOT_REACHED |\n| ERROR | 21 | NOT_REACHED |\n| NOT_APPLICABLE | 0 | NOT_REACHED |\n| NOT_REACHED | 0 | 48 |\n\nThe stop rule prevented an exact offline rerun; therefore no root-cause reduction, semantic safety delta, remediation rate, beat delta, or prompt maximum is asserted.`);
write("new-failures.md", `# New failures\n\n## IMPLEMENTATION_REGRESSION\n\n- Supported source-grounded doorway fixture is rejected because the legacy motif treatment template injects an unsupported professional actor. This is a production projection defect, not a validator false positive.\n\n## UNKNOWN\n\n- Corpus-level new failures are unknown because Tier 3 was not reached.\n\n## Tooling blocker\n\n- Typecheck retains an exactOptionalPropertyTypes mismatch for optional contrast in the editorial override finalization boundary.`);
write("validator-regression.md", `# Validator regression\n\nNo validator thresholds or blocker severities were weakened. Existing semantic authorization exposed an unsupported actor introduced by a template; the implementation did not suppress it. Known beat-validator true-positive proof was not rerun because the stop rule halted dependent validation.`);
write("cost-risk-effect.md", `# Cost-risk effect\n\n- REDUCED (focused proof): null/stale derived plans can be preserved and rederived without an INVALID_VISUAL_PLAN infrastructure terminal.\n- REDUCED (staged, unaccepted): unsupported generic remediation is designed to abstain before image generation.\n- REDUCED (staged, unaccepted): prompt mandatory overflow is represented before dispatch.\n- UNKNOWN: corpus-wide semantic/provenance/cache risk, because Tier 3 was not reached.\n- UNCHANGED: paid production remains frozen.`);
write("remaining-blockers.md", `# Remaining blockers\n\n- PLANNER/COMPILER: legacy doorway motif projection injects an unauthorized professional actor; redesign the template/operator to project only finalized roles.\n- COMPILER: editorial override contrast typing fails exactOptionalPropertyTypes.\n- VALIDATOR: no known defect; current rejection is treated as valid detection.\n- QA_ORCHESTRATION: Tier 2 and Tier 3 were not reached.\n- CACHE_PROVENANCE: targeted invalidation/resume proof not run.\n- CONTENT: PACK1_CONTENT_TIMING_MIGRATION_REQUIRED.\n- POLICY: none changed.\n- UNKNOWN: post-M1 48-case deltas.`);
write("pack1-content-timing-deferred.md", `# Pack 1 content/timing deferred\n\nPACK1_CONTENT_TIMING_MIGRATION_REQUIRED\n\nM1 did not modify Pack 1 scripts, localization, WPM, duration, or timing policy.`);
write("changed-files.md", `# Changed files\n\n| Path | Pre-existing dirty? | M1 change | Milestone | Risk |\n|---|---|---|---|---|\n${m1Files.map(([path, dirty, change, milestone]) => `| ${path} | ${dirty ? "yes" : "no"} | ${change} | ${milestone} | ${milestone === "M1.1" || milestone === "Reporting" ? "low" : "unaccepted"} |`).join("\n")}\n\nEdits were incremental; no reset, stash, checkout, cleanup, or commit occurred.`);
write("commands-executed.md", `# Commands executed\n\n- git rev-parse HEAD\n- git status --porcelain=v1\n- git diff --stat\n- targeted rg/find/sed/jq/sha256sum inspection commands are recorded in the interactive run transcript\n- pnpm test:focused -- packages/strategic-reinvention/src/veronica-visual-plan-resolver.unit.test.ts (characterization fail, then PASS)\n- pnpm test:focused -- packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts (characterization/repair runs)\n- pnpm test:focused -- resolver, semantic-gate, visual-beats, sequence-diversity, prompt-compiler, adapter unit files (initial + two repair reruns; stopped at semantic gate)\n- pnpm --filter @mediaforge/strategic-reinvention typecheck (initial + two repair reruns; final FAIL)\n- node scripts/generate-veronica-systemic-remediation-m1-review.mjs ${timestamp}\n- zip -qr ${packName}.zip ${packName}\n- unzip -t ${packName}.zip\n- sha256sum ${packName}.zip\n\nProvider-capable pipeline commands were not executed.`);
write("zero-paid-provider-proof.md", `# Zero paid provider proof\n\nThe established census/evidence guard was inspected and confirmed to patch fetch, HTTP, HTTPS, sockets, and TLS before dynamic provider-capable imports. Because M1.3 stopped focused tests, no provider-capable corpus import or runner was executed.\n\n| Surface | Actual dispatches |\n|---|---:|\n| Paid LLM | 0 |\n| TTS | 0 |\n| Image generation | 0 |\n| Paid QA | 0 |\n| Embeddings | 0 |\n| Remote rendering | 0 |\n| Other providers | 0 |\n| Prevented attempts | 0 |`);
write("representative-before-after/null-plan-resolver.md", `# Null plan resolver\n\nBefore: literal JSON null terminated as INVALID_VISUAL_PLAN. Focused after: bytes are SHA-256 archived idempotently, valid planner input rederives atomically, and rerun reuses the valid derived artifact. Corpus after: NOT_REACHED.`);
write("representative-before-after/authorization-regression.md", `# Authorization regression\n\nA source-grounded doorway is correctly authorized as a motif family. The downstream legacy motif template nevertheless introduces professional as a depicted actor. The machine-readable authorization gate rejects it. Two narrow corrections did not remove that projection defect, triggering the regression stop rule.`);
write("representative-before-after/prompt-overflow.md", `# Prompt overflow\n\nBefore: V2 Pack 2 long 01 exceeded the 4,000-character schema. Staged implementation separates mandatory/compactable sections and returns a typed BLOCK if mandatory material alone exceeds the limit. Focused and corpus after: NOT_REACHED.`);
write("representative-before-after/semantic-parent.md", `# Semantic parent identity\n\nThe staged v4 finalizer hashes canonical authority fields and beat plans reference semanticRevisionHash. Repeatability assertions were added, but the dependent grouped suite and corpus proof were not completed.`);

const runReportPath = join(root, "docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m1.md");
mkdirSync(dirname(runReportPath), { recursive: true });
writeFileSync(runReportPath, `# Veronica systemic remediation M1\n\nStatus: BLOCKED.\n\nChanged: resolver safety; semantic v4/finalization; authorization and source-bound remediation; semantic-parent beat identity; structured prompt budget; focused tests; blocked-run review pack. See changed-files.md in the review pack for exact paths and pre-existing-dirty attribution.\n\nChecks: resolver focused tests PASS (13/13); sequence-diversity slice PASS (13); semantic-gate grouped run FAIL on source-grounded doorway because a legacy projection invents a professional actor; package typecheck FAIL at positioning-production-adapter.ts:1446 on exact optional contrast typing. Tier 2, Tier 3, lint, and shared-genre checks were not reached under retry/stop limits.\n\nProvider dispatches: 0 across LLM, TTS, images, paid QA, embeddings, rendering, and other providers; prevented attempts: 0.\n\nRisks: M1.2-M1.7 are not accepted; no 48-case deltas can be claimed. Follow-up: Systemic Remediation M2 should replace the actor-inventing motif projection and repair the override finalization type boundary, then resume focused validation.\n`, "utf8");

const finalDirty = gitStatus();
const listFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? listFiles(path) : [path];
});
const filesBeforeManifest = listFiles(pack)
  .filter((path) => relative(pack, path) !== "MANIFEST.json")
  .sort();
const fileHashes = Object.fromEntries(filesBeforeManifest.map((path) => [relative(pack, path), fileSha(path)]));
const manifest = {
  schemaVersion: "veronica-systemic-remediation-m1-review-manifest.v1",
  generatedTimestamp: timestamp,
  finalM1Status: "BLOCKED",
  startingHead: startHead,
  endingHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  initialDirtyState: reconstructedInitialDirty,
  finalDirtyState: finalDirty,
  preExistingChangedFiles: reconstructedInitialDirty.map((line) => line.slice(3)),
  filesChangedByM1: m1Files.map(([path]) => path),
  commandsExecuted: readFileSync(join(pack, "commands-executed.md"), "utf8").split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2)),
  fileSha256: fileHashes,
  fileSha256Excludes: ["MANIFEST.json (self-referential hashing is invalid)"],
  planningReviewPack: { path: planningZip, sha256: fileSha(join(root, planningZip)) },
  v2Evidence: { path: baselineDir, manifestSha256: fileSha(join(root, baselineDir, "MANIFEST.json")) },
  baseline48CaseResult: { path: baselineResultsPath, sha256: fileSha(join(root, baselineResultsPath)) },
  postM148CaseResult: { path: "canonical-results.json", sha256: fileSha(join(pack, "canonical-results.json")), execution: "NOT_REACHED" },
  providerDispatchCounters: { paidLlm: 0, tts: 0, imageGeneration: 0, paidQa: 0, embeddings: 0, remoteRendering: 0, other: 0, prevented: 0 },
  testResultSummary: { resolver: "PASS_13_OF_13", sequenceDiversitySlice: "PASS_13", semanticGate: "FAIL", typecheck: "FAIL", tier2: "NOT_REACHED", tier3: "NOT_REACHED", lint: "NOT_REACHED" },
  milestoneStatusSummary: { "M1.1": "DONE", "M1.2": "PARTIAL", "M1.3": "BLOCKED", "M1.4": "PARTIAL", "M1.5": "PARTIAL", "M1.6": "PARTIAL", "M1.7": "BLOCKED" },
  baselineOutcomeCounts: baseline.outcomeCounts,
  postOutcomeCounts: { NOT_REACHED: 48 },
  baselineBeatFindingOccurrences: beatCounts,
};
writeJson("MANIFEST.json", manifest);

process.stdout.write(`${outer}\n${pack}\n`);
