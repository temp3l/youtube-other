import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const timestamp = process.argv[2];
if (!timestamp) throw new Error("timestamp argument is required");

const root = process.cwd();
const startingHead = "492543be534da6bf004d6089e174fbb2d21b86cc";
const previousReviewZip = "artifacts/veronica-systemic-remediation-m1/2026-08-17T22-39-10Z/veronica-systemic-remediation-m1-review-2026-08-17T22-39-10Z.zip";
const previousReviewDir = "artifacts/veronica-systemic-remediation-m1/2026-08-17T22-39-10Z/veronica-systemic-remediation-m1-review-2026-08-17T22-39-10Z";
const planningZip = "artifacts/veronica-systemic-remediation-m1-planning/2026-08-17T21-42-50Z/veronica-systemic-remediation-m1-planning-review-2026-08-17T21-42-50Z.zip";
const v2Dir = "artifacts/veronica-portfolio-preproduction/2026-08-17T21-24-44-405Z-evidence-hardening-v2/veronica-portfolio-preproduction-review-v2";
const baselinePath = `${v2Dir}/deterministic-results.json`;
const outputRoot = join(root, "artifacts/veronica-systemic-remediation-m1-recovery", timestamp);
const packName = `veronica-systemic-remediation-m1-recovery-review-${timestamp}`;
const pack = join(outputRoot, packName);

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (path) => sha(readFileSync(path));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const write = (name, value) => {
  const target = join(pack, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
};
const writeJson = (name, value) => write(name, JSON.stringify(value, null, 2));
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const gitStatus = () => execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
const generatorStatus = "?? scripts/generate-veronica-systemic-remediation-m1-recovery-review.mjs";
const initialDirtyState = gitStatus().filter((line) => line !== generatorStatus);
const baseline = readJson(baselinePath);
const previousManifest = readJson(`${previousReviewDir}/MANIFEST.json`);

const commands = [
  "git rev-parse HEAD",
  "git status --porcelain=v1",
  "git diff --stat",
  "targeted find/rg/sed/jq inspection of M1 review pack, source, tests, TypeScript boundary, and zero-provider guard",
  "pnpm test:focused -- packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts -t blocks unsupported threshold environments while preserving supported doorway stories (FAIL before fix; PASS after fix, 1/1)",
  "node --import tsx -e <focused supported-doorway trace> (pure local semantic projection; no provider import)",
  "pnpm --filter @mediaforge/strategic-reinvention typecheck (initial diagnostic plus two permitted repair retries; final FAIL)",
  "git diff --check -- <three recovery-touched production/test files> (PASS)",
  `node scripts/generate-veronica-systemic-remediation-m1-recovery-review.mjs ${timestamp}`,
  `zip -qr ${packName}.zip ${packName}`,
  `unzip -t ${packName}.zip`,
  `sha256sum ${packName}.zip`,
];

const records = baseline.records.map((record) => {
  const [packId, population, format, language, sourceId] = record.id.split(":");
  return {
    id: record.id,
    pack: packId,
    population,
    format,
    language,
    sourceId,
    baselineStatus: record.preparation.status,
    baselineRootCauses: record.gates.filter((gate) => gate.status === "BLOCK" || gate.status === "ERROR").map((gate) => gate.gateId),
    postM1Status: "NOT_REACHED",
    semanticRevisionHash: null,
    keyArtifactHashes: {},
    normalizedRootCauses: [],
    reason: "Acceptance Gate 1 stopped at the remaining exactOptionalPropertyTypes error; Tier 3 execution was prohibited.",
  };
});

write("README.md", `# Veronica Systemic Remediation M1 recovery review

Recovery objective: preserve M1.1, remove the M1.3 unauthorized-actor producer defect, repair the remaining TypeScript boundary, and resume exact offline acceptance. Previous blocker: the narration-native doorway projection invented a professional actor.

Status: **BLOCKED**. The producer defect is resolved and its exact regression passes. Strategic-reinvention typecheck remains blocked after the allowed repair retries, so Tier 1 completion, Tier 2, provenance acceptance, and exact 48-case Tier 3 were not reached.

Zero-provider guarantee: no provider-capable corpus runner or provider adapter was imported or executed. Paid/provider dispatches and prevented attempts are all zero.`);

write("blocker-root-cause.md", `# Blocker root cause

The first unauthorized introduction occurred in \`visualTreatmentFromProposition\` in \`packages/strategic-reinvention/src/veronica-semantic-quality.ts\`. Its early \`narrationNativeMetaphor\` return treated a source-grounded doorway motif as permission to hardcode a second \`professional\` actor in subject, composition, action, and action ownership.

The finalized v4 proposition for “A specific niche is a doorway, not a wall.” authorizes buyer semantics and doorway/threshold/foothold motifs; it does not authorize an expert/professional. \`assessVeronicaVisualConceptAuthorization\` therefore correctly returned \`unauthorized-visual-concept:professional\`.

Earlier narrow changes added typed authorization and post-projection checks but did not modify this upstream early-return template, so they exposed rather than removed the invention.

Correction: the threshold projector now resolves its sole actor slot from \`visualAuthorization\` and \`actorRole\`, preserves that owner, and emits a people-free spatial encoding when no primary actor is authorized. It no longer supplies an occupational or audience counterpart from the motif. Exact supported-doorway regression: PASS 1/1; projected unauthorized professional count: 0.`);

write("typecheck-fix.md", `# Typecheck fix

Original diagnostic: \`TS2379\` at \`positioning-production-adapter.ts:1446\`; editorial override \`contrast\` could contain an optional \`relation\`, but finalized \`contrast\` requires a non-STABLE relation when present under \`exactOptionalPropertyTypes\`.

Semantic interpretation: unknown contrast is absence. A present contrast must have a relation; optional state members must be omitted when unknown, never assigned explicit \`undefined\`.

Implemented: the override schema now requires \`contrast.relation\` when \`contrast\` is present; buyer consequence is narrowed to the contract union; parsed evidence spans are reconstructed as a checked non-empty tuple.

Final diagnostic after the allowed retries: \`TS2379\` at line 1449 because Zod-inferred optional state members (for example \`initialState?: string | undefined\`) are still spread into the exact-optional finalized contrast type (\`initialState?: string\`). Final typecheck status: FAIL. Smallest follow-up: construct merged contrast with conditional spreads for each defined optional member, then rerun this one package typecheck.`);

write("milestone-status.md", `# Milestone status

| Milestone | Status | Evidence |
|---|---|---|
| M1.1 | DONE | Previous focused resolver suite PASS 13/13; untouched in recovery. |
| M1.2 | PARTIAL | v4 authority staged; full acceptance stopped at typecheck. |
| M1.3 | DONE | Producer fixed; exact doorway authorization regression PASS. |
| M1.4 | PARTIAL | Source-bound remediation staged; suite not resumed. |
| M1.5 | PARTIAL | Parent-bound beats staged; recovery validation not reached. |
| M1.6 | PARTIAL | Structured budget staged; recovery validation not reached. |
| M1.7 | BLOCKED | Provenance and exact 48 proof not reached. |`);

write("tests.md", `# Tests and checks

| Check | Result |
|---|---|
| Supported-doorway characterization before fix | FAIL: unauthorized professional |
| Supported-doorway characterization after fix | PASS 1/1 (70 skipped) |
| Added professional/actorless projection characterizations | NOT_REACHED after Gate 1 stop |
| Full semantic-gate file | NOT_REACHED |
| Strategic-reinvention typecheck, initial | FAIL TS2379 contrast relation |
| Typecheck repair retry 1 | FAIL: newly exposed evidence-span tuple |
| Typecheck repair retry 2 | FAIL TS2379 nested exact-optional contrast member |
| Recovery diff whitespace check | PASS |
| Tier 1 remainder / lint / shared genre | NOT_REACHED |
| Tier 2 | NOT_REACHED |
| Tier 3 exact 48 | NOT_REACHED |

No unchanged failing command was rerun and no validator threshold or assertion was weakened.`);

write("before-after-summary.md", `# 48-case before/after

| Status | V2 baseline | Post-M1 recovery |
|---|---:|---:|
| PASS | 0 | 0 |
| BLOCK | 27 | 0 |
| REVIEW | 0 | 0 |
| ERROR | 21 | 0 |
| NOT_APPLICABLE | 0 | 0 |
| NOT_REACHED | 0 | 48 |

Post counts describe execution state, not improvement. The denominator remains the exact V2 population of 48.`);

write("before-after-root-causes.csv", readFileSync(join(root, previousReviewDir, "before-after-root-causes.csv"), "utf8"));
writeJson("canonical-results.json", {
  schemaVersion: "veronica-systemic-remediation-m1-recovery-canonical-results.v1",
  generatedTimestamp: timestamp,
  status: "BLOCKED",
  exactPopulation: 48,
  baselineCounts: { PASS: 0, BLOCK: 27, REVIEW: 0, ERROR: 21 },
  postCounts: { PASS: 0, BLOCK: 0, REVIEW: 0, ERROR: 0, NOT_APPLICABLE: 0, NOT_REACHED: 48 },
  records,
});

write("semantic-safety.md", `# Semantic safety

| Safety dimension | Baseline | Post-M1 | Delta | Classification |
|---|---:|---:|---:|---|
| Actor ownership inversion | NOT_RECOMPUTED | NOT_REACHED | UNKNOWN | UNKNOWN |
| Polarity mismatch | NOT_RECOMPUTED | NOT_REACHED | UNKNOWN | UNKNOWN |
| Proposition contradiction | NOT_RECOMPUTED | NOT_REACHED | UNKNOWN | UNKNOWN |
| Unsupported implication | NOT_RECOMPUTED | NOT_REACHED | UNKNOWN | UNKNOWN |
| Source-domain loss | NOT_RECOMPUTED | NOT_REACHED | UNKNOWN | UNKNOWN |

Focused evidence only: the supported-doorway fixture changes from one producer-created unsupported professional implication to zero, without changing finalized buyer ownership. No corpus safety delta is claimed.`);

const leakageRows = [
  ["doorway", 1, 0, "SOURCE_GROUNDED", "focused source span and motif authorization"],
  ["threshold", 1, 0, "AUTHORIZED_ENCODING", "typed motif-family encoding"],
  ["first-time visitor", "NOT_MEASURED", "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"],
  ["visitor", "NOT_MEASURED", "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"],
  ["professional", 0, "NOT_MEASURED", "SOURCE_GROUNDED_OR_AUTHORIZED_ONLY", "focused unauthorized count is zero; corpus not reached"],
  ["customer", "NOT_MEASURED", "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"],
  ["audience-offer-fit", "NOT_MEASURED", "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"],
  ["expertise-recognition", "NOT_MEASURED", "NOT_MEASURED", "UNKNOWN", "Tier 3 not reached"],
];
write("concept-leakage-after.csv", [
  ["concept", "focused_post_occurrences", "corpus_unauthorized_occurrences", "classification", "evidence"].map(csv).join(","),
  ...leakageRows.map((row) => row.map(csv).join(",")),
].join("\n"));

writeJson("remediation-metrics.json", {
  schemaVersion: "veronica-systemic-remediation-m1-recovery-remediation-metrics.v1",
  status: "NOT_REACHED",
  postM1: {
    remediationTemplateReuseRate: null,
    genericFallbackSceneRate: null,
    repeatedActionFamilyRate: null,
    repeatedEnvironmentFamilyRate: null,
    semanticRemediationLowConfidenceRate: null,
    noSafeEncodingCount: null,
    reviewDueSemanticAmbiguity: null,
    blockDueConceptAuthorization: null,
  },
});

write("prompt-budget-results.md", `# Prompt budget results

Known V2 overflow fixture: NOT_REACHED in recovery. Maximum prompt length, median, count above the 3,600 target, count above the 4,000 hard maximum, and mandatory-budget BLOCK count are NOT_MEASURED. No provider dispatch occurred. The staged compiler contract was not modified by recovery.`);

const nullIds = records.filter((record) => record.baselineRootCauses.includes("INVALID_VISUAL_PLAN")).map((record) => record.id);
write("resolver-results.md", `# Resolver results

Previous M1 focused suite: PASS 13/13 for literal-null preservation/rederive, content-addressed archive idempotence, accepted-artifact protection, valid-artifact reuse, and atomic failure retention. Recovery did not modify resolver code and stopped before corpus revalidation.

Eight known V2 null-plan cases (original hash, archive path/hash, rederived result, final status, and rerun reuse remain NOT_REACHED in this recovery):

${nullIds.map((id) => `- ${id}: NOT_REACHED`).join("\n")}

Corpus \`INVALID_VISUAL_PLAN\` terminal count is NOT_MEASURED; no zero claim is made.`);

write("provenance-results.md", `# Provenance and cache results

Staged design uses deterministic \`semanticRevisionHash\` as parent identity and a derived \`propositionHash\` compatibility alias. Recovery did not reach focused provenance/cache acceptance. Targeted invalidation, timing/prompt-version independence, accepted artifact preservation, historical QA immutability, and resume selection are NOT_REVALIDATED. No artifact, QA record, accepted asset, or cache authority was overwritten by this recovery.`);

write("new-failures.md", `# New failures

| Classification | Failure |
|---|---|
| IMPLEMENTATION_REGRESSION | None remaining in the focused supported-doorway fixture. |
| DETECTION_EXPOSURE | Authorization correctly exposed the pre-existing early-return template's invented professional actor; producer now fixed. |
| EXPECTED_ABSTENTION | Not reached. |
| PRE_EXISTING | None newly classified. |
| UNKNOWN | All corpus-level post-M1 results; Tier 3 not reached. |

Tooling blocker: final \`TS2379\` exact-optional nested contrast-member mismatch at the editorial override finalization boundary.`);

write("remaining-blockers.md", `# Remaining blockers

- COMPILER: editorial semantic override still spreads optional contrast members whose inferred values include explicit undefined; package typecheck fails.
- PLANNER: no remaining focused doorway producer defect; broader acceptance not reached.
- VALIDATOR: no demonstrated defect; unchanged.
- CACHE_PROVENANCE: M1.7 proof not reached.
- CONTENT: PACK1_CONTENT_TIMING_MIGRATION_REQUIRED.
- POLICY: paid production remains frozen.
- UNKNOWN: Tier 1 remainder, Tier 2, exact 48, shared-genre, and corpus deltas.`);

write("changed-files.md", `# Recovery changed files

- \`packages/strategic-reinvention/src/veronica-semantic-quality.ts\`: authorization-bound threshold actor slot and people-free encoding.
- \`packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts\`: doorway ownership, source-grounded professional, and actorless characterization coverage.
- \`packages/strategic-reinvention/src/positioning-production-adapter.ts\`: stricter editorial semantic schema and checked evidence tuple; nested exact-optional fix remains incomplete.
- \`scripts/generate-veronica-systemic-remediation-m1-recovery-review.mjs\`: recovery evidence generator.
- \`docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m1-recovery.md\`: required run report.

All three production/test files were already dirty with staged M1 work. Patches were incremental; no reset, stash, checkout, clean, rebase, or unrelated replacement occurred. Full initial and final dirty states are in \`MANIFEST.json\`.`);

write("cost-risk-effect.md", `# Cost and risk effect

Observed: the focused doorway projection no longer invents an unauthorized professional, reducing semantic fabrication risk at that producer. Observed: no provider dispatch and no paid production. Unknown: corpus-wide pass/block/error, remediation reuse, prompt overflow, and provenance effects because acceptance stopped at typecheck. No cost-savings estimate is asserted.`);
write("pack1-content-timing-deferred.md", `# Pack 1 content/timing deferred

PACK1_CONTENT_TIMING_MIGRATION_REQUIRED

No script length, Shorts copy, WPM, duration band, localization, narration, or timing-policy change was made.`);
write("zero-paid-provider-proof.md", `# Zero paid-provider proof

The established fail-closed guards in \`scripts/veronica-zero-cost-preproduction-census.ts\` and \`scripts/veronica-evidence-hardening-v2.ts\` were inspected. They patch global fetch, HTTP request/get, HTTPS request/get, socket connect/createConnection, and TLS connect before dynamic provider-capable imports.

This recovery never imported or executed provider-capable corpus code, so guard installation was not required for the pure unit/typecheck path. No network/provider command was run.

| Surface | Dispatches |
|---|---:|
| Paid LLM | 0 |
| TTS | 0 |
| Image generation | 0 |
| Paid QA | 0 |
| Embeddings | 0 |
| Remote rendering | 0 |
| Other providers | 0 |
| Prevented attempts | 0 |`);

write("representative-before-after/authorization-regression.md", `# Supported doorway

Before: buyer authority plus a source-grounded doorway motif entered the narration-native threshold template; the template added an unauthorized professional, and compatibility failed.

After: the template consumes the finalized primary actor slot (buyer here), depicts no occupational counterpart, preserves buyer ownership, and compatibility passes. Unauthorized professional: 1 → 0 in this fixture.`);
write("representative-before-after/typecheck-boundary.md", `# Editorial contrast boundary

Before: a present contrast override could omit its required relation and optional members flowed through as explicit undefined unions.

Partial recovery: relation is required when contrast exists, buyer consequence is a closed union, and evidence spans are checked into a non-empty tuple. Remaining: conditionally omit undefined nested contrast members before finalization. Typecheck remains FAIL.`);
write("representative-before-after/corpus-status.md", `# Corpus status

V2: 48 exact canonical-English variants (0 PASS, 27 BLOCK, 0 REVIEW, 21 ERROR). Recovery: all 48 NOT_REACHED because Acceptance Gate 1 did not pass. The denominator was preserved and no outcome improvement is claimed.`);

const reportPath = join(root, "docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m1-recovery.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `# Veronica systemic remediation M1 recovery

Status: BLOCKED.

Changed paths: \`veronica-semantic-quality.ts\`, its semantic-gate unit test, \`positioning-production-adapter.ts\`, recovery pack generator, and this report.

Checks: supported-doorway characterization failed before the fix and passed 1/1 after it; strategic-reinvention typecheck remained FAIL after two permitted repair retries with TS2379 on nested exact-optional contrast members; recovery diff check passed. Tier 1 remainder, Tier 2, exact 48 Tier 3, lint, and shared-genre checks were not reached.

Result: narration-native threshold projection now consumes only finalized authorized actor roles and uses a people-free encoding when no primary actor exists. No validator weakening. Provider dispatches: 0; prevented: 0.

Risk/follow-up: conditionally omit undefined contrast members at the editorial finalization boundary, then resume Gate 1. PACK1_CONTENT_TIMING_MIGRATION_REQUIRED remains deferred. Commit: none; HEAD ${startingHead}.
`, "utf8");

const listFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = join(directory, entry.name);
  return entry.isDirectory() ? listFiles(target) : [target];
});
const files = listFiles(pack).filter((path) => relative(pack, path) !== "MANIFEST.json").sort();
const fileSha256 = Object.fromEntries(files.map((path) => [relative(pack, path), fileSha(path)]));
const finalDirtyState = gitStatus();
writeJson("MANIFEST.json", {
  schemaVersion: "veronica-systemic-remediation-m1-recovery-review-manifest.v1",
  generationTimestamp: timestamp,
  status: "BLOCKED",
  startingHead,
  endingHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  initialDirtyState,
  finalDirtyState,
  preExistingChangedFiles: initialDirtyState.map((line) => line.slice(3)),
  previousM1ChangedFiles: previousManifest.filesChangedByM1,
  recoveryChangedFiles: [
    "packages/strategic-reinvention/src/veronica-semantic-quality.ts",
    "packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts",
    "packages/strategic-reinvention/src/positioning-production-adapter.ts",
    "scripts/generate-veronica-systemic-remediation-m1-recovery-review.mjs",
    "docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m1-recovery.md",
  ],
  commandsExecuted: commands,
  fileSha256,
  fileSha256Excludes: ["MANIFEST.json (self-referential hashing is invalid)"],
  previousM1ReviewPack: { path: previousReviewZip, sha256: fileSha(join(root, previousReviewZip)) },
  planningReviewPack: { path: planningZip, sha256: fileSha(join(root, planningZip)), usage: "NOT_USED_FOR_RECOVERY_IMPLEMENTATION" },
  v2Evidence: { path: v2Dir, manifestSha256: fileSha(join(root, v2Dir, "MANIFEST.json")) },
  baseline48: { path: baselinePath, sha256: fileSha(join(root, baselinePath)), count: 48 },
  postM148: { path: "canonical-results.json", sha256: fileSha(join(pack, "canonical-results.json")), execution: "NOT_REACHED", count: 48 },
  providerCounters: { paidLlm: 0, tts: 0, imageGeneration: 0, paidQa: 0, embeddings: 0, remoteRendering: 0, otherProviders: 0 },
  preventedDispatchCount: 0,
  tier1Status: "BLOCKED_AT_TYPECHECK",
  tier2Status: "NOT_REACHED",
  tier3Status: "NOT_REACHED_48_OF_48",
  typecheckStatus: "FAIL_TS2379_EXACT_OPTIONAL_CONTRAST_MEMBER",
  lintStatus: "NOT_REACHED",
});

process.stdout.write(`${outputRoot}\n${pack}\n`);
