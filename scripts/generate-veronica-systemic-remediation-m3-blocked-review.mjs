import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const timestamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = join(root, "artifacts", "veronica-systemic-remediation-m3-final", timestamp);
const packName = `veronica-systemic-remediation-m3-final-review-${timestamp}`;
const pack = join(outputRoot, packName);
const zipPath = join(outputRoot, `${packName}.zip`);
const status = "BLOCKED";
const startingHead = "492543be534da6bf004d6089e174fbb2d21b86cc";
const authorityRoot = "artifacts/veronica-systemic-remediation-m3-planning-amendment/2026-08-18T01-54-40-423Z/veronica-systemic-remediation-m3-planning-amendment-review-2026-08-18T01-54-40-423Z";
const planningRoot = "artifacts/veronica-systemic-remediation-m3-planning/2026-08-18T01-34-07-356Z/veronica-systemic-remediation-m3-planning-review-2026-08-18T01-34-07-356Z";
const m2Root = "artifacts/veronica-systemic-remediation-m2-final/2026-08-18T01-18-27-136Z/veronica-systemic-remediation-m2-final-review-2026-08-18T01-18-27-136Z";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha(readFileSync(file));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const write = (name, content) => {
  const file = join(pack, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
};
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const copyText = (source, target) => write(target, readFileSync(join(root, source), "utf8"));
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
);

mkdirSync(pack, { recursive: true });
const blocked = "M3 stopped at Tier 1: the retained-value sequence characterization remained failing after two root-cause correction attempts. Tier 2, post-A0 recomputation, and exact Tier 3 were not run.";
const baseline = "M2 baseline: PASS 0 / BLOCK 48 / REVIEW 0 / ERROR 0.";
write("README.md", `# Veronica Systemic Remediation M3 final review\n\nObjective: implement the amended M3 authority, producer, reporting, and exact-proof scope. ${baseline}\n\nAmendment diagnosis: current derived authority contained nested M1-class producer findings hidden by coarse deterministic-preparation reporting.\n\nFinal M3 status: **BLOCKED**. ${blocked}\n\nZero-provider guarantee: actual dispatches 0; paid LLM, TTS, images, paid QA, embeddings, and remote rendering were not invoked.\n`);
write("implementation-summary.md", `# Implementation summary\n\nA0.1–A1 were partially implemented: authority classification/identity, accepted/stale protections, authority-aware resume, producer abstention, typed no-safe diagnostics, and nested root-cause flattening. B1–G1 were not accepted or executed.\n\nChanged source is listed in changed-files.md. No Pack 1 content/timing migration or provider work occurred. Deviation: mandatory Tier 1 stop prevented population recomputation and exact proof.\n`);
write("semantic-plan-authority-implementation.md", "# Semantic-plan authority implementation\n\nPartial implementation defines all seven authority states, telemetry-free identity inputs, explicit human acceptance, stale preservation, atomic publication, targeted descendant invalidation, and fail-closed unknown handling. Current/stale/accepted synthetic unit coverage passed. Adapter and resume integration remain unaccepted because Tier 1 did not complete.\n");
write("telemetry-identity-separation.md", "# Telemetry identity separation\n\nSemantic authority identity excludes timestamps, cache hit/miss, latency, and runtime telemetry. The persisted artifact self-hash remains separate. Synthetic timestamp/cache/latency equality and source/version invalidation tests passed. Exact corpus determinism was not run.\n");
write("current-producer-remediation.md", "# Current producer remediation\n\nPartial producer changes prevent inherited unsafe treatments from surviving low-confidence/no-safe remediation and reproject eligible resolved scenes from finalized semantics. Doorway/environment compatibility was narrowed to scene-local authorization. The changes are not accepted: Tier 1 stopped on retained-value candidate selection before representative or exact-corpus proof. Baseline counts remain authoritative; no post-M3 counts are claimed.\n");
write("root-cause-flattener.md", "# Root-cause flattener\n\nA canonical flattener was added to collect terminal, semantic-review, semantic-quality, provider-readiness, beat, and typed no-safe findings. DETERMINISTIC_PREPARATION remains a stage and is used as root cause only when no specific nested finding exists. Its synthetic test passed; corpus integration was not run.\n");
write("affected-population-recompute.md", `# Affected-population recompute\n\n${blocked}\n\nPre-A0 authority evidence: 18 current-derived records; 15 contained M1-class current-producer findings. Pre-A0 no-safe baseline: 25 variants / 51 beats (39 unresolved unauthorized, 10 buyer, 1 causal applicability, 1 causal unresolved). Post-A0 and post-M3 denominators: **NOT RUN**.\n`);
write("no-safe-results.md", "# No-safe results\n\nTyped diagnostic contracts and generation were added, including operator applicability, candidate/rejection evidence, semantic relation, authorization, mechanism, and causal state. Post-A0 census was not run. The 39 unresolved-unauthorized baseline remains a content/editorial hypothesis, not a post-M3 classification.\n");
write("causal-results.md", "# Causal results\n\nApplicability accepts a structured stable relation so stable recognition is not automatically treated as causal. p2-short-03b and p2-short-04a were not rerun. No causal operator was introduced.\n");
write("actor-ownership-results.md", "# Actor ownership results\n\nActor hard gates were tightened and retained-value candidate production was adjusted, but the focused retained-value sequence test still failed. p1-long-l03 and p1-long-l06 were not rerun; no ownership success is claimed.\n");
write("selector-integration.md", "# Selector integration\n\nThe M2 bounds remain unchanged in source: max 6 candidates, beam width 4, rolling window 5, hard gates before scoring, stable IDs/ties. The approved-capability integration failed Tier 1 characterization and is unaccepted.\n");
write("adapter-provenance-tests.md", "# Adapter and provenance tests\n\nAuthority fixture assertions active/pass: 7 classifications plus telemetry/source/version/archive/atomic/invalidation checks (10 authority tests). Root flattener: 1 pass. Adapter suite did not run to completion because Vitest bail stopped on the sequence failure. Remaining skips: not measured.\n");
write("tests.md", "# Tests\n\n- Authority + deterministic outcome: PASS, 2 files / 11 tests.\n- Semantic gate: PASS, 73 tests in the earlier focused run.\n- Final Tier 1 focused command: FAIL, `recognizes adjective-first incoming and retained-value contrasts`; 7 passed before bail, 2 files skipped.\n- Typecheck/lint: NOT RUN after mandatory stop.\n- Tier 2: NOT RUN.\n- Tier 3 exact 48: NOT RUN.\n");
write("before-after-summary.md", `# Before/after summary\n\n${baseline}\n\nM3 actual exact-48 status counts: NOT RUN. No status or root-cause delta is claimed. The implementation is BLOCKED at Tier 1.\n`);
copyText(`${authorityRoot}/m1-invariant-reconciliation.csv`, "current-authority-root-causes.csv");
const m2Canonical = JSON.parse(readFileSync(join(root, m2Root, "canonical-results.json"), "utf8"));
const records = (m2Canonical.records ?? m2Canonical).map((record) => ({ ...record, m3Evaluation: "NOT_RUN_TIER1_STOP", m3Status: null }));
json("canonical-results.json", { schemaVersion: "veronica-m3-canonical-results.blocked.v1", exactPopulationExpected: 48, exactPopulationHashExpected: "e58ee45acf8e81cc40787ea5b052133f0a02fd289b01988d4a4a0acc2c374246", tier3Status: "NOT_RUN", records });
copyText(`${planningRoot}/no-safe-candidate-census.csv`, "no-safe-candidate-census.csv");
copyText(`${planningRoot}/no-safe-candidate-clusters.csv`, "no-safe-clusters.csv");
write("beat-quality-results.md", "# Beat quality residuals\n\nPost-M3 MECHANISM_REPETITION, opening novelty, adjacent duplication, information gain, action monotony, causal evidence, and ownership counts: NOT RUN. No improvement is claimed.\n");
write("semantic-safety.md", "# Semantic safety\n\nSynthetic authority and root-cause checks passed. Actor ownership, polarity, contradiction, unsupported implication, and source-domain loss were not accepted at corpus level because Tier 1 failed. Validators were not weakened.\n");
write("m1-m2-regression-results.md", "# M1/M2 regression results\n\nUpdated current-authority contract audit: NOT RUN. No active-regression-zero claim is made. Historical artifacts were not rewritten and accepted authority was not exercised against the corpus.\n");
write("error-audit.md", "# Error audit\n\nNo Tier 3 corpus ERROR audit exists. The implementation test failure is deterministic and classified as an implementation blocker, not a production ERROR.\n");
write("block-audit.md", "# Block audit\n\nM2 baseline remains 48 BLOCK. Post-M3 grouping was not computed. The immediate implementation blocker is retained-value candidate-family selection after actor authorization hardening.\n");
write("pass-audit.md", "# Pass audit\n\nPost-M3 exact proof was not run; genuine PASS count and IDs are unavailable. No PASS is claimed.\n");
write("provenance-results.md", "# Provenance results\n\nSynthetic proof covers deterministic telemetry-free semantic identity, stale preservation, atomic failure preservation, targeted invalidation, and explicit accepted-human classification. Corpus reuse/resume and historical-QA preservation were not proven end-to-end.\n");
write("new-failures.md", "# New failures\n\nIMPLEMENTATION_REGRESSION: `Veronica sequence diversity > recognizes adjective-first incoming and retained-value contrasts` expected a retained-value-reveal candidate but selected only input-output-flow candidates. It persisted after two central corrections; no assertion was weakened.\n");
write("remaining-blockers.md", "# Remaining blockers\n\n1. Diagnose retained-value candidate applicability/selection without relaxing actor authorization.\n2. Complete adapter/resume Tier 1 integration.\n3. Run guarded representatives and post-A0 denominators.\n4. Re-evaluate B1/C1/D1 only from fresh evidence.\n5. Complete exact guarded 48 proof and regression audit.\n");
write("next-phase-analysis.md", "# Next-phase analysis\n\nRecommended next phase: **Systemic Remediation M4**. Central pipeline verification remains incomplete, so Pack 1 editorial timing/content migration is not authorized.\n");
write("pack1-content-timing-deferred.md", "# Deferred\n\nPACK1_CONTENT_TIMING_MIGRATION_REQUIRED\n\nNo scripts, WPM, duration policy, localization, or timing were changed for M3 metrics.\n");
const m3ChangedFiles = [
  "apps/cli/src/veronica-pre-image-review-pack.ts",
  "packages/strategic-reinvention/src/index.ts",
  "packages/strategic-reinvention/src/positioning-production-adapter.ts",
  "packages/strategic-reinvention/src/positioning-visual-contracts.ts",
  "packages/strategic-reinvention/src/veronica-causal-evidence.ts",
  "packages/strategic-reinvention/src/veronica-deterministic-outcome.ts",
  "packages/strategic-reinvention/src/veronica-deterministic-outcome.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts",
  "packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-semantic-plan-authority.ts",
  "packages/strategic-reinvention/src/veronica-semantic-plan-authority.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-sequence-diversity.ts",
  "packages/strategic-reinvention/src/veronica-sequence-diversity.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-visual-beats.ts",
  "packages/strategic-reinvention/src/veronica-visual-beats.unit.test.ts",
  "docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m3-implementation.md",
  "scripts/generate-veronica-systemic-remediation-m3-blocked-review.mjs",
];
write("changed-files.md", `# Changed files\n\n${m3ChangedFiles.map((file) => `- ${file}`).join("\n")}\n\nThe repository had extensive pre-existing M1/M2 changes; they were preserved.\n`);
const commands = [
  "git rev-parse HEAD; git status --porcelain=v1; git diff --stat",
  "pnpm test:focused -- veronica-semantic-plan-authority.unit.test.ts veronica-deterministic-outcome.unit.test.ts",
  "pnpm test:focused -- five affected M3/adapter/CLI test files (initial plus two repair reruns)",
  "pnpm exec vitest run -c vitest.unit.config.ts --bail=1 --reporter=dot [four affected files]",
];
write("commands-executed.md", `# Commands executed\n\n${commands.map((command) => `- \`${command}\``).join("\n")}\n`);
write("zero-paid-provider-proof.md", "# Zero paid-provider proof\n\nActual dispatches: fetch 0; HTTP 0; HTTPS 0; net 0; TLS 0; paid LLM 0; TTS 0; images 0; paid QA 0; embeddings 0; remote rendering 0; other providers 0. Prevented attempts: 0. Guarded corpus imports were not reached because Tier 1 stopped first. Safety is established by non-execution, not billing inference.\n");
for (const id of ["p1-long-l01", "p2-long-03", "p2-short-04b", "buyer-no-safe", "p2-short-03b", "p2-short-04a", "p1-long-l03", "p1-long-l06", "stale-authority-synthetic", "accepted-authority-control", "m2-success-control"]) {
  write(`representative-before-after/${id}.md`, `# ${id}\n\nM3 corpus before/after: NOT RUN due mandatory Tier 1 correction-loop stop. Synthetic authority controls are summarized in tests.md; no representative outcome is claimed.\n`);
}
const finalDirtyState = git("status", "--porcelain=v1").split("\n").filter(Boolean);
const provenance = {
  amendment: { path: `${authorityRoot}.zip`, sha256: "ea416791c1af258b1403be243e160b7c8156e4ab99ad302cd3f01ece7fb9dcb4" },
  originalPlanning: { path: `${planningRoot}.zip`, sha256: "2465d9bc4dfd9a954a68cf8fb4e6bdedac3f2e3a12898e7a741dc3105b217df5" },
  m2Final: { path: `${m2Root}.zip`, sha256: "bc538ccfdfc372b7bc2d66bf9e7b60fecfdfd76e95cef29fbec46f662d618e2c" },
  m1Final: { path: "artifacts/veronica-systemic-remediation-m1-final/2026-08-18T00-20-00Z/veronica-systemic-remediation-m1-final-review-2026-08-18T00-20-00Z.zip", sha256: "afede4096182db064e2bb59df867dfacbe45a67d00d214a40114fe195bd0d6de" },
};
const payloadHashes = Object.fromEntries(files(pack).sort().map((file) => [relative(pack, file), fileSha(file)]));
json("MANIFEST.json", {
  schemaVersion: "veronica-systemic-remediation-m3-final-review.blocked.v1",
  generatedTimestamp: timestamp,
  finalM3Status: status,
  startingHead,
  endingHead: git("rev-parse", "HEAD"),
  initialDirtyState: "dirty; 38 tracked modifications plus extensive untracked M1/M2/M3 planning artifacts",
  finalDirtyState,
  preExistingChangedFiles: "Recorded by the initial git-safety command; preserved and not reset/stashed/cleaned.",
  m3ChangedFiles,
  commandsExecuted: commands,
  payloadSha256: payloadHashes,
  manifestSelfHashExcluded: true,
  authorityPacks: provenance,
  exact48PopulationHash: "e58ee45acf8e81cc40787ea5b052133f0a02fd289b01988d4a4a0acc2c374246",
  m2BaselineCanonicalResultsHash: fileSha(join(root, m2Root, "canonical-results.json")),
  m3CanonicalResultsHash: fileSha(join(pack, "canonical-results.json")),
  preA0NoSafeCensusHash: fileSha(join(root, planningRoot, "no-safe-candidate-census.csv")),
  postA0NoSafeCensusHash: null,
  postM3NoSafeCensusHash: null,
  providerCounters: { actualDispatches: 0, preventedAttempts: 0 },
  verification: { typecheck: "NOT_RUN", lint: "NOT_RUN", tier1: "FAIL", tier2: "NOT_RUN", tier3: "NOT_RUN", authorityProvenance: "PARTIAL", adapterDebt: "OPEN" },
  milestones: { "A0.1": "PARTIAL", "A0.2": "PARTIAL", "A0.3": "PARTIAL", "A0.4": "PARTIAL", A1: "PARTIAL", B1: "NOT_STARTED", C1: "PARTIAL", D1: "BLOCKED", E1: "BLOCKED", F1: "PARTIAL", G1: "NOT_STARTED" },
});

execFileSync("zip", ["-qr", zipPath, packName], { cwd: outputRoot });
execFileSync("unzip", ["-tq", zipPath], { cwd: outputRoot, stdio: "pipe" });
const outerSha = fileSha(zipPath);
writeFileSync(`${zipPath}.sha256`, `${outerSha}  ${packName}.zip\n`);
process.stdout.write(`${zipPath}\n${outerSha}\n`);
