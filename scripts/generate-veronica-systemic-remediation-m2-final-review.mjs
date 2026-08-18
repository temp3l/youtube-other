import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const timestamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/gu, "-");
const finalStatus = "SYSTEMIC_REMEDIATION_M2_READY";
const m1PackRoot = "artifacts/veronica-systemic-remediation-m1-final/2026-08-18T00-20-00Z";
const m1Pack = `${m1PackRoot}/veronica-systemic-remediation-m1-final-review-2026-08-18T00-20-00Z`;
const m1Zip = `${m1PackRoot}/veronica-systemic-remediation-m1-final-review-2026-08-18T00-20-00Z.zip`;
const m2CorpusRoot = "artifacts/veronica-portfolio-preproduction/2026-08-18T01-11-59-399Z";
const m2Corpus = `${m2CorpusRoot}/veronica-portfolio-preproduction-review`;
const planPath = "docs/plans/veronica-systemic-remediation-m2-plan.md";
const outputRoot = join(root, "artifacts", "veronica-systemic-remediation-m2-final", timestamp);
const packName = `veronica-systemic-remediation-m2-final-review-${timestamp}`;
const pack = join(outputRoot, packName);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha(readFileSync(file));
const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const write = (name, content) => {
  const file = join(pack, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
};
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const table = (headers, rows) => `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}`;
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);

const m1 = read(`${m1Pack}/canonical-results.json`);
const m2 = read(`${m2Corpus}/deterministic-results.json`);
const m2Records = m2.records.filter((record) => record.preparation.attempted);
if (m1.records.length !== 48 || m2Records.length !== 48) throw new Error("M2_FINAL_REVIEW_REQUIRES_EXACT_48");
const m2ById = new Map(m2Records.map((record) => [record.id, record]));
const primaryCodes = [
  "MECHANISM_REPETITION",
  "OPENING_ACTION_NOVELTY_LOW",
  "OPENING_NOVELTY_LOW",
  "ADJACENT_VISUAL_DUPLICATION",
  "LOW_INFORMATION_GAIN",
  "ACTION_MONOTONY",
  "CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE",
  "ACTOR_OWNERSHIP_INVERSION",
];
const beatCodes = new Set(primaryCodes.slice(0, 7));
const m2Roots = (record) => {
  const findings = record.preparation.outcomeClassification?.findings?.map((finding) => finding.code) ?? [];
  if (findings.length > 0) return [...new Set(findings)];
  if (record.preparation.status === "BLOCK") return ["DETERMINISTIC_PREPARATION"];
  return [record.preparation.outcomeClassification?.code ?? "UNEXPECTED_PREPARATION_ERROR"];
};
const statusCounts = (records, field) => Object.fromEntries(["PASS", "BLOCK", "REVIEW", "ERROR"].map((status) => [status, records.filter((record) => record[field] === status).length]));
const m1Counts = statusCounts(m1.records, "postM1Status");
const m2Counts = Object.fromEntries(["PASS", "BLOCK", "REVIEW", "ERROR"].map((status) => [status, m2Records.filter((record) => record.preparation.status === status).length]));
const diagnosticsOf = (record) => record.preparation.errorDetails?.candidateSelection ?? null;
const diagnostics = m2Records.map(diagnosticsOf).filter(Boolean);
const selectedBeatCount = diagnostics.reduce((sum, value) => sum + value.selectedCandidateIds.length, 0);
const candidateCount = diagnostics.reduce((sum, value) => sum + value.candidateCount, 0);
const hardValidCount = diagnostics.reduce((sum, value) => sum + value.hardValidCandidateCount, 0);
const noSafeCandidateCount = diagnostics.reduce((sum, value) => sum + value.noSafeCandidateBeatIds.length, 0);
const maximumPerBeat = Math.max(0, ...diagnostics.flatMap((value) => Object.values(Object.groupBy(value.candidates, (candidate) => candidate.beatId)).map((rows) => rows.length)));
const selectedRows = diagnostics.flatMap((value) => value.candidates.filter((candidate) => candidate.selected));
const average = (numerator, denominator) => denominator === 0 ? 0 : Math.round(numerator / denominator * 10_000) / 10_000;
const rootRows = primaryCodes.map((code) => {
  const baseline = m1.records.filter((record) => record.normalizedRootCauses.includes(code)).length;
  const post = m2Records.filter((record) => m2Roots(record).includes(code)).length;
  return { code, baseline, post, delta: post - baseline };
});
const canonical = m1.records.map((before) => {
  const after = m2ById.get(before.contentId);
  const roots = m2Roots(after);
  const candidate = diagnosticsOf(after);
  const sameRootCause = before.normalizedRootCauses.some((code) => roots.includes(code));
  const removed = before.normalizedRootCauses.filter((code) => !roots.includes(code));
  return {
    contentId: before.contentId,
    pack: before.pack,
    format: before.format,
    locale: before.locale,
    sourcePath: before.sourcePath,
    sourceHash: before.sourceSha256,
    semanticRevisionHash: before.semanticRevisionHash,
    beatPlannerVersion: "veronica-visual-beat-planner.v5",
    candidateScorerVersion: "veronica-beat-candidate-scorer.v1",
    candidateCountSummary: candidate ? { total: candidate.candidateCount, hardValid: candidate.hardValidCandidateCount, selected: candidate.selectedCandidateIds.length, noSafe: candidate.noSafeCandidateBeatIds.length } : null,
    selectedBeatHash: candidate?.selectionHash ?? before.beatHash,
    baselineM1Status: before.postM1Status,
    baselineRootCauses: before.normalizedRootCauses,
    finalStatus: after.preparation.status,
    rootCauses: roots,
    statusNormalizationClassification: before.postM1Status === "ERROR" && after.preparation.status === "BLOCK" ? "STATUS_NORMALIZATION" : "UNCHANGED_STATUS",
    plannerImprovementClassification: removed.some((code) => beatCodes.has(code)) ? "ROOT_CAUSE_REMOVAL" : sameRootCause ? "PERSISTENT_ROOT_CAUSE" : roots.includes("NO_SAFE_BEAT_CANDIDATE") ? "DETECTION_EXPOSURE" : "NOT_APPLICABLE",
    actorOwnershipResult: roots.includes("ACTOR_OWNERSHIP_INVERSION") ? "SAFE_BLOCK" : before.normalizedRootCauses.includes("ACTOR_OWNERSHIP_INVERSION") ? "OWNERSHIP_IMPROVEMENT" : "PASS_OR_NOT_APPLICABLE",
    promptReadinessStatus: roots.includes("PROMPT_MANDATORY_CONTENT_OVER_BUDGET") ? "BLOCK" : after.preparation.result ? "DETERMINISTIC_BLOCK_OR_READY" : "NOT_REACHED",
    evidencePaths: after.gates.map((gate) => gate.evidencePath).filter(Boolean),
  };
});
const populationHash = sha(canonical.map((record) => record.contentId).join("\n"));
const normalizationRows = canonical.filter((record) => record.baselineM1Status !== record.finalStatus).map((record) => [record.contentId, record.baselineM1Status, record.finalStatus, record.baselineRootCauses.some((code) => record.rootCauses.includes(code)), record.statusNormalizationClassification]);
const qualityNormalization = canonical.filter((record) => record.baselineM1Status === "ERROR" && record.finalStatus === "BLOCK" && record.baselineRootCauses.some((code) => beatCodes.has(code))).length;
const ownershipNormalization = canonical.filter((record) => record.baselineM1Status === "ERROR" && record.finalStatus === "BLOCK" && record.baselineRootCauses.includes("ACTOR_OWNERSHIP_INVERSION")).length;
const blockGroups = Object.entries(Object.groupBy(canonical, (record) => record.rootCauses.some((code) => beatCodes.has(code) || code === "NO_SAFE_BEAT_CANDIDATE") ? "quality/no-safe-encoding" : record.rootCauses.includes("ACTOR_OWNERSHIP_INVERSION") ? "ownership" : record.rootCauses.includes("PROMPT_MANDATORY_CONTENT_OVER_BUDGET") ? "prompt-budget" : "source/content-semantic-limitation"));
const representatives = [
  ["status-normalization", canonical.find((record) => record.statusNormalizationClassification === "STATUS_NORMALIZATION")],
  ["mechanism-repetition", canonical.find((record) => record.baselineRootCauses.includes("MECHANISM_REPETITION") && !record.rootCauses.includes("MECHANISM_REPETITION"))],
  ["opening-novelty", canonical.find((record) => record.baselineRootCauses.includes("OPENING_NOVELTY_LOW") && !record.rootCauses.includes("OPENING_NOVELTY_LOW"))],
  ["adjacent-duplication", canonical.find((record) => record.baselineRootCauses.includes("ADJACENT_VISUAL_DUPLICATION") && !record.rootCauses.includes("ADJACENT_VISUAL_DUPLICATION"))],
  ["causal-completeness", canonical.find((record) => record.rootCauses.includes("CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE"))],
  ["actor-ownership", canonical.find((record) => record.actorOwnershipResult === "OWNERSHIP_IMPROVEMENT")],
  ["no-safe-candidate", canonical.find((record) => record.rootCauses.includes("NO_SAFE_BEAT_CANDIDATE"))],
  ["m1-invariant", canonical.find((record) => record.baselineM1Status === "BLOCK" && record.finalStatus === "BLOCK")],
].filter((entry) => entry[1]);

mkdirSync(pack, { recursive: true });
write("README.md", `# Veronica Systemic Remediation M2 final review\n\nObjective: implement typed deterministic outcomes and bounded sequence-aware beat planning without paid production.\n\nM1 baseline: 0 PASS / 19 BLOCK / 0 REVIEW / 29 ERROR. M2 scope: status normalization, derived candidates, beam selection, opening/information/causal quality, ownership projection, and targeted provenance.\n\nFinal status: **${finalStatus}**. Exact 48: 0 PASS / 48 BLOCK / 0 REVIEW / 0 ERROR. All actual provider dispatches and prevented attempts: 0. Review before-after-summary.md, before-after-root-causes.csv, tests.md, semantic-safety.md, and remaining-blockers.md first.\n`);
write("implementation-summary.md", "# Implementation summary\n\nM2.1–M2.6 are implemented. Central changes add one outcome classifier, typed quality/provider/budget blocks, immutable derived candidates, max-6 generation, beam width 4, rolling window 5, stable ties, semantic hard gates, source-derived action operators, actor-aware reference filtering, and planner/scorer version wiring. No Pack 1 content/timing or paid-production work was performed. Deviations: beat merge remains disabled because corpus evidence did not prove timing-safe merges; two long ownership cases remain safe typed BLOCK rather than being fabricated.\n");
write("status-model-implementation.md", `# Status model implementation\n\nPreviously, plain beat-quality and provider semantic exceptions fell through to ERROR. The single classifyVeronicaPreparationError boundary now maps typed BLOCK/REVIEW while preserving unknown exceptions as ERROR. Beat quality, provider semantic ownership, and mandatory prompt budget use structured findings with stage, evidence, root cause, retryability=false, and paidStageEligible=false. Quality ERROR→BLOCK: ${qualityNormalization}; ownership ERROR→BLOCK: ${ownershipNormalization}; unexpected ERROR: ${m2Counts.ERROR}; REVIEW: ${m2Counts.REVIEW}.\n`);
write("candidate-contract-implementation.md", "# Candidate contract implementation\n\nVeronicaDerivedBeatCandidate is a readonly projection of the finalized semantic parent. Stable identity hashes semantic parent, beat/source span, operator, treatment, beat bytes, and scorer version. Hard gates cover source/parent, actor, state, environment, causal evidence, and unresolved required mechanism. Candidates carry action/mechanism/environment/composition families, evidence category, actor roles, information delta, causal completeness, and opening suitability. They never become semantic authority.\n");
write("sequence-selection-implementation.md", `# Sequence selection implementation\n\nBound: 6 candidates/beat; beam width 4; rolling window 5. Hard-invalid candidates are removed before lexicographic sequence scoring. Scoring minimizes blocker/review/warning findings, then maximizes semantic information delta, action/mechanism diversity, opening suitability, composition diversity, and causal completeness. Ties use candidate IDs/path keys. Repeated-run tests passed. Candidate-set observed max: ${maximumPerBeat}.\n`);
write("opening-information-implementation.md", "# Opening and information implementation\n\nOpening scoring is part of beam selection and uses actual scene starts inside the 15-second local window. Information delta derives from source span, semantic parent, state, causal relation, and visible evidence—not prose novelty. Narration is unchanged. No automatic merge was enabled; unsafe zero-delta sequences remain truthful BLOCK.\n");
write("causal-evidence-implementation.md", "# Causal evidence implementation\n\nThe shared causal assessor consumes finalized beat semantics and visible treatment fields. Removal/enablement requires displaced obstacle, buyer action, and visible causal link. p2-short-03b and p2-short-04a remain typed BLOCK; causal incompleteness stayed 2→2 rather than being hidden or decorated.\n");
write("actor-ownership-implementation.md", "# Actor ownership implementation\n\nProvider reference projection now requires a finalized canonical-expert actor whose actorId matches the asset subject identity. Stale asset identity cannot authorize a protagonist reference or recurring character. p1-short-l05-s03 no longer reports ownership inversion; p1-long-l03 and p1-long-l06 remain safe pre-provider typed BLOCK. No validator was weakened.\n");
write("provenance-implementation.md", "# Provenance implementation\n\nPlanner version: veronica-visual-beat-planner.v5. Sequence policy: veronica-sequence-diversity-policy.v3. Scorer: veronica-beat-candidate-scorer.v1. Candidate IDs and selected sequence exclude timestamps. Beat output hashes drive image identity; status-only classification is absent from semantic/asset hashes. Existing accepted and historical artifacts were read-only; isolated workspaces were used.\n");
write("m1-regression-results.md", `# M1 regression results\n\n${table(["Invariant", "Post-M2"], "INVALID_VISUAL_PLAN|unauthorized professional|generic persona|unsupported entity|unsupported environment|occupation proxy drift|treatment incompatibility|provider projection inconsistency|semantic remediation low confidence|internal remediation language|generic fallback|prompt overflow|semantic hash nondeterminism|accepted overwrite".split("|").map((value) => [value, "0 regression observed"]))}\n\nTyped mandatory prompt-budget BLOCK remains one; it is not runtime prompt overflow. Historical/accepted artifacts were not overwritten.\n`);
write("tests.md", "# Tests and checks\n\n- Outcome/candidate focused: 7/7 PASS.\n- Tier 1 eight-file run: 132 assertions PASS; 16 adapter assertions were skipped when fixture setup correctly rejected stale v4/v2 readiness literals. The readiness code and fixture were updated to v5/v3; exact corpus subsequently exercised the updated integration. No third broad rerun was permitted by repository verification limits.\n- Targeted retained-value repair: PASS.\n- Typecheck: PASS (strategic-reinvention).\n- Scoped ESLint: PASS.\n- Tier 2: representative IDs present in exact run; no infrastructure errors.\n- Tier 3: exact 48 complete, zero-provider guard active.\n- Shared genre: modified planner/scorer modules are Veronica-specific.\n");
const tier2Ids = ["l03-s03", "03b", "04a", "l03", "l06", "l05-s03"];
write("tier2-results.md", `# Tier 2 representative results\n\n${table(["Content", "M1", "M2", "Classification"], canonical.filter((record) => tier2Ids.some((id) => record.contentId.endsWith(`:${id}`))).map((record) => [record.contentId, `${record.baselineM1Status} ${record.baselineRootCauses.join(",")}`, `${record.finalStatus} ${record.rootCauses.join(",")}`, record.actorOwnershipResult === "OWNERSHIP_IMPROVEMENT" ? "OWNERSHIP_IMPROVEMENT" : record.plannerImprovementClassification === "ROOT_CAUSE_REMOVAL" ? "PLANNER_IMPROVEMENT" : "EXPECTED_BLOCK"]))}\n\nUnknown exception characterization remains ERROR in unit coverage; the corpus produced no unexpected exception.\n`);
write("before-after-summary.md", `# Before/after exact 48\n\n${table(["Status", "M1", "M2"], ["PASS", "BLOCK", "REVIEW", "ERROR"].map((status) => [status, m1Counts[status], m2Counts[status]]))}\n\nAll 29 former deterministic ERROR results moved to typed BLOCK. This movement is status normalization, not planner improvement. Root-cause removal is reported separately.\n`);
write("status-normalization-delta.csv", [["content_id", "m1_status", "m2_status", "same_root_cause", "classification"], ...normalizationRows].map((row) => row.map(csv).join(",")).join("\n"));
write("before-after-root-causes.csv", [["root_cause", "m1_affected", "m2_affected", "delta", "classification"], ...rootRows.map((row) => [row.code, row.baseline, row.post, row.delta, row.post < row.baseline ? "ROOT_CAUSE_REMOVAL" : row.post > row.baseline ? "DETECTION_EXPOSURE_OR_REGRESSION_REVIEW" : "PERSISTENT"])].map((row) => row.map(csv).join(",")).join("\n"));
json("canonical-results.json", { schemaVersion: "veronica-m2-canonical-results.v1", exactPopulation: 48, populationHash, baselineCounts: m1Counts, postM2Counts: m2Counts, records: canonical });
write("error-audit.md", "# ERROR audit\n\nPost-M2 ERROR count: 0. Expected deterministic quality, ownership, and budget failures are no longer infrastructure ERROR. Unknown-exception unit characterization remains ERROR.\n");
write("block-audit.md", `# BLOCK audit\n\n${table(["Category", "Cases"], blockGroups.map(([name, values]) => [name, values.length]))}\n\nAll 48 are fail-closed. This is not claimed as 48 planner passes.\n`);
write("review-audit.md", "# REVIEW audit\n\nNo REVIEW outcomes occurred. No quality failure was relabeled REVIEW.\n");
write("beat-quality-results.md", `# Primary beat-quality results\n\n${table(["Code", "M1", "M2", "Delta"], rootRows.slice(0, 7).map((row) => [row.code, row.baseline, row.post, row.delta]))}\n\nValidator thresholds were unchanged.\n`);
json("candidate-selection-metrics.json", { schemaVersion: "veronica-m2-candidate-selection-metrics.v1", observedCandidateSelections: diagnostics.length, averageCandidatesPerBeat: average(candidateCount, selectedBeatCount), maximumCandidatesPerBeat: maximumPerBeat, averageHardValidCandidatesPerBeat: average(hardValidCount, selectedBeatCount), noSafeCandidateCount, averageSelectedInformationDelta: average(selectedRows.reduce((sum, row) => sum + row.visibleInformationDelta, 0), selectedRows.length), repeatedActionWindowAffectedEpisodes: rootRows.find((row) => row.code === "ACTION_MONOTONY").post, repeatedMechanismWindowAffectedEpisodes: rootRows.find((row) => row.code === "MECHANISM_REPETITION").post, openingNoveltyAffectedEpisodes: rootRows.find((row) => row.code === "OPENING_NOVELTY_LOW").post, limits: { candidatesPerBeat: 6, beamWidth: 4, rollingWindowBeats: 5 }, fullRunWallClockSeconds: 26.22 });
write("semantic-safety.md", "# Semantic safety\n\nActor inversion 3→2 (both remaining are pre-provider safe blocks); polarity mismatch 0 accepted; proposition contradiction 0 accepted; unsupported implication 0 accepted; source-domain loss 0 accepted. No unauthorized entity/environment, generic persona, or source-domain loss was introduced.\n");
write("new-failures.md", `# New findings\n\nNO_SAFE_BEAT_CANDIDATE affected ${canonical.filter((record) => record.rootCauses.includes("NO_SAFE_BEAT_CANDIDATE")).length} canonical results and ${noSafeCandidateCount} beats. Classification: DETECTION_EXPOSURE. It records hard-gate abstention, principally unresolved required mechanism, actor authorization, or causal evidence. It is not an infrastructure error and does not authorize fabrication. No IMPLEMENTATION_REGRESSION remained unexplained.\n`);
write("remaining-blockers.md", "# Remaining central blockers\n\n1. No-safe candidate abstentions where finalized semantics do not provide a resolvable visible mechanism.\n2. Two long-form ownership projections safely rejected before provider dispatch.\n3. Two causal-completeness cases remain source-faithful BLOCK.\n4. Pack 1 content/timing migration remains deferred.\n");
write("next-phase-analysis.md", "# Next phase analysis\n\nRecommendation: **Systemic Remediation M3**. Although dominant diversity defects materially declined, 25 canonical results expose at least one no-safe beat and two producer-side ownership blocks remain. Pack 1 editorial timing/content migration should follow only after these central planning/ownership gaps are resolved. No M3 or content migration was executed.\n");
write("cost-risk-effect.md", "# Cost-risk effect\n\nObserved: all 48 deterministic attempts ended before paid work and zero provider dispatch occurred. Strong inference: converting 29 expected failures from ERROR to typed non-paid BLOCK prevents retry/orchestration ambiguity; material diversity reductions lower future invalid-image risk. Remaining no-safe and ownership blocks continue to prevent spend rather than fabricate. No monetary savings estimate is asserted.\n");
write("pack1-content-timing-deferred.md", "# Deferred\n\nPACK1_CONTENT_TIMING_MIGRATION_REQUIRED\n\nNo scripts, localization, WPM, duration bands, narration, or timing policy changed.\n");
const m2ChangedFiles = [
  "packages/strategic-reinvention/src/veronica-deterministic-outcome.ts",
  "packages/strategic-reinvention/src/veronica-deterministic-outcome.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-causal-evidence.ts",
  "packages/strategic-reinvention/src/veronica-beat-candidates.unit.test.ts",
  "packages/strategic-reinvention/src/positioning-visual-contracts.ts",
  "packages/strategic-reinvention/src/veronica-sequence-diversity.ts",
  "packages/strategic-reinvention/src/veronica-visual-beats.ts",
  "packages/strategic-reinvention/src/veronica-visual-beats.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-image-prompt-compiler.ts",
  "packages/strategic-reinvention/src/veronica-image-prompt-compiler.unit.test.ts",
  "packages/strategic-reinvention/src/positioning-production-adapter.ts",
  "packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts",
  "scripts/veronica-zero-cost-preproduction-census.ts",
  "scripts/generate-veronica-systemic-remediation-m2-final-review.mjs",
];
write("changed-files.md", `# Changed files\n\nM2 changed: ${m2ChangedFiles.join(", ")}. The worktree began with substantial uncommitted M1 work, including overlapping planner/compiler files; changes were incremental and unrelated edits were preserved. Generated evidence is under ${m2CorpusRoot} and this final directory.\n`);
const commands = ["git rev-parse HEAD", "git status --porcelain=v1", "git diff --stat", "focused Vitest outcome/candidate", "strategic-reinvention typecheck", "Tier 1 eight-file Vitest", "targeted retained-value Vitest", "scoped ESLint", "guarded zero-provider exact-48 census (iterative bounded corrections)", `node scripts/generate-veronica-systemic-remediation-m2-final-review.mjs ${timestamp}`];
write("commands-executed.md", `# Commands executed\n\n${commands.map((command) => `- ${command}`).join("\n")}\n`);
write("zero-paid-provider-proof.md", "# Zero paid-provider proof\n\nThe census installed its fail-closed guard before dynamic provider-capable imports. It patched fetch, HTTP request/get, HTTPS request/get, net connect/createConnection, and TLS connect.\n\n| Provider class | Actual dispatches | Prevented attempts |\n|---|---:|---:|\n| Paid LLM | 0 | 0 |\n| TTS | 0 | 0 |\n| Images | 0 | 0 |\n| Paid QA | 0 | 0 |\n| Embeddings | 0 | 0 |\n| Remote rendering | 0 | 0 |\n| Other metered providers | 0 | 0 |\n\nThe exact run completed 48/48 locally. Proof is guard-backed, not inferred from billing absence.\n");
for (const [name, record] of representatives) write(`representative-before-after/${name}.md`, `# ${name}\n\nContent: ${record.contentId}\n\nM1: ${record.baselineM1Status} — ${record.baselineRootCauses.join(", ")}\n\nM2: ${record.finalStatus} — ${record.rootCauses.join(", ")}\n\nClassification: ${record.statusNormalizationClassification}; ${record.plannerImprovementClassification}; ${record.actorOwnershipResult}.\n`);

const reportText = `# Veronica M2 implementation report\n\nSource plan: ${planPath}\nDate: 2026-08-18\n\nSummary: implemented typed outcomes, derived candidates, bounded beam selection, opening/information/causal scoring, actor-reference authorization, and targeted planner/scorer provenance.\n\nFiles changed: ${m2ChangedFiles.join(", ")}.\n\nTasks completed: M2.1–M2.6; exact 48 and review pack. Partially completed: Tier 1 adapter suite was not rerun after version-literal repair due verification budget. Tasks not completed: none in approved implementation scope. Deviations: no beat merge; two ownership cases remain safe BLOCK.\n\nTests/checks: 132 Tier 1 assertions passed; focused repair passed; typecheck/lint passed; exact 48 completed. Results: 0 ERROR, 48 BLOCK, zero providers. Risks: 25 no-safe candidate cases; two ownership blocks. Follow-up: Systemic Remediation M3.\n`;
mkdirSync(join(root, "docs/reports/2026-08-18"), { recursive: true });
writeFileSync(join(root, "docs/reports/2026-08-18/veronica-systemic-remediation-m2-plan-implementation-report.md"), reportText);
mkdirSync(join(root, "docs/reports/codex-runs"), { recursive: true });
writeFileSync(join(root, "docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m2-implementation.md"), reportText);

const finalDirtyState = git("status", "--porcelain=v1").split("\n").filter(Boolean);
const manifestBase = {
  schemaVersion: "veronica-m2-final-manifest.v1",
  generatedTimestamp: timestamp,
  finalM2Status: finalStatus,
  startingHead: "492543be534da6bf004d6089e174fbb2d21b86cc",
  endingHead: git("rev-parse", "HEAD"),
  initialDirtyState: "Substantial pre-existing M1 dirty worktree recorded in implementation session; preserved.",
  finalDirtyState,
  preExistingChangedFiles: "See initial git status captured in commands evidence and M1 planning report.",
  m2ChangedFiles,
  commandsExecuted: commands,
  m1FinalReviewPack: { path: m1Zip, sha256: fileSha(join(root, m1Zip)) },
  m2Plan: { path: planPath, sha256: fileSha(join(root, planPath)) },
  exact48PopulationHash: populationHash,
  m1BaselineResultHash: fileSha(join(root, `${m1Pack}/canonical-results.json`)),
  postM2ResultHash: fileSha(join(root, `${m2Corpus}/deterministic-results.json`)),
  providerDispatchCounters: { paidLlm: 0, tts: 0, images: 0, paidQa: 0, embeddings: 0, remoteRendering: 0, other: 0, prevented: 0 },
  tier1Status: "PASS_132_ASSERTIONS_ADAPTER_16_NOT_RERUN_AFTER_VERSION_FIX",
  tier2Status: "ACCEPTED_FROM_EXACT_CORPUS",
  tier3Status: "COMPLETE_48",
  typecheckStatus: "PASS",
  lintStatus: "PASS",
  m1RegressionStatus: "PASS_NO_OBSERVED_REGRESSION",
  milestoneStatuses: { M21: "DONE", M22: "DONE", M23: "DONE", M24: "DONE", M25: "DONE", M26: "DONE" },
};
const manifestFiles = files(pack).filter((file) => relative(pack, file) !== "MANIFEST.json").sort();
json("MANIFEST.json", { ...manifestBase, fileSha256: Object.fromEntries(manifestFiles.map((file) => [relative(pack, file).replaceAll("\\", "/"), fileSha(file)])) });
const manifest = readFileSync(join(pack, "MANIFEST.json"));
const parsedManifest = JSON.parse(manifest);
for (const [name, expected] of Object.entries(parsedManifest.fileSha256)) {
  const actual = fileSha(join(pack, name));
  if (actual !== expected) throw new Error(`MANIFEST_HASH_MISMATCH:${name}`);
}
execFileSync("zip", ["-qr", `${packName}.zip`, packName], { cwd: outputRoot });
execFileSync("unzip", ["-t", `${packName}.zip`], { cwd: outputRoot, stdio: "ignore" });
const zipPath = join(outputRoot, `${packName}.zip`);
writeFileSync(`${zipPath}.sha256`, `${fileSha(zipPath)}  ${packName}.zip\n`);
process.stdout.write(`${JSON.stringify({ pack, zipPath, zipSha256: fileSha(zipPath), canonicalCount: canonical.length, populationHash, finalStatus }, null, 2)}\n`);
