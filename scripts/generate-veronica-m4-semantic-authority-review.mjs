import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA,
  VERONICA_SEMANTIC_MODEL_CONFIGURATION,
  VERONICA_SEMANTIC_PRICING,
  VERONICA_SEMANTIC_STABLE_PROMPT,
} from "../packages/strategic-reinvention/dist/veronica-model-semantic-authority.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const artifactRoot = path.join(
  root,
  "artifacts/veronica-m4-semantic-authority/2026-08-18",
);
const reviewDirectory = path.join(
  artifactRoot,
  "veronica-m4-semantic-authority-review",
);
const zipPath = path.join(
  artifactRoot,
  "veronica-m4-semantic-authority-review.zip",
);

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const write = (name, contents) =>
  fs.writeFileSync(path.join(reviewDirectory, name), contents, "utf8");
const writeJson = (name, value) =>
  write(name, `${JSON.stringify(value, null, 2)}\n`);
const copy = (source, destination) =>
  fs.copyFileSync(path.join(root, source), path.join(reviewDirectory, destination));

const rawResults = readJson(
  "artifacts/veronica-m4-semantic-authority/2026-08-18/experiment-results.json",
);
const ledger = readJson(
  "artifacts/veronica-m4-semantic-authority/2026-08-18/cost-ledger.json",
);
const corpus = readJson(
  "experiments/veronica-m4/diagnostic-cases.v1.json",
);

const correctedOneAttemptMaximumUsd = Number(
  corpus.cases
    .filter((diagnosticCase) => !diagnosticCase.gold.acceptedHumanPlan)
    .reduce((total, diagnosticCase) => {
      const request = {
        source: diagnosticCase.source.trim(),
        contextBefore: diagnosticCase.contextBefore.trim(),
        contextAfter: diagnosticCase.contextAfter.trim(),
        allowedOwnerTypes: [...diagnosticCase.allowedOwnerTypes].sort(),
      };
      const payload = JSON.stringify({
        stablePrompt: VERONICA_SEMANTIC_STABLE_PROMPT,
        schema: VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA,
        request,
      });
      const conservativeInputTokens = Buffer.byteLength(payload, "utf8") + 1_024;
      return (
        total +
        (conservativeInputTokens *
          VERONICA_SEMANTIC_PRICING.inputUsdPerMillionTokens +
          VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens *
            VERONICA_SEMANTIC_PRICING.outputUsdPerMillionTokens) /
          1_000_000
      );
    }, 0)
    .toFixed(8),
);
const correctedTwoAttemptMaximumUsd = Number(
  (correctedOneAttemptMaximumUsd * 2).toFixed(8),
);
const auditedLedger = {
  ...ledger,
  qaCostAudit: {
    dispatchTimeEstimatedMaximumUsd: ledger.cumulativeEstimatedCostUsd,
    dispatchTimeEstimatorIssue:
      "The dispatched run used an average characters-per-token estimate and was not a strict upper bound.",
    correctedEstimator:
      "UTF-8 byte count plus 1024 input-token envelope headroom, with maximum output tokens priced in full.",
    correctedOneAttemptMaximumUsd,
    correctedTwoAttemptMaximumUsd,
    actualUsageReported: false,
    budgetCapUsd: 2.5,
    admissionStillWithinBudget: correctedTwoAttemptMaximumUsd <= 2.5,
  },
};

fs.mkdirSync(reviewDirectory, { recursive: true });

const adjudicatedResults = {
  ...rawResults,
  automatedStatus: rawResults.status,
  status: "BLOCKED_IMPLEMENTATION_REGRESSION",
  architecturalConclusion: "INCONCLUSIVE",
  qaAdjudication: {
    reason:
      "All 16 provider-eligible cases failed before a structured semantic response or usage report was captured. A duplicated source/package module boundary caused provider error metadata to be lost, so the automated semantic metrics are not evidence for acceptance or rejection.",
    providerOutputsReceived: 0,
    providerCasesSemanticallyEvaluable: 0,
    acceptedHumanControlsPreserved: 2,
    furtherPaidRequestsDispatched: false,
  },
};

write(
  "README.md",
  `# Veronica M4 semantic-authority review pack

Status: \`BLOCKED_IMPLEMENTATION_REGRESSION\`

The semantic-oracle hypothesis remains **inconclusive**. The deterministic architecture, strict contract, fingerprint/cache, admission controls, authority precedence, mocked adapter, and diagnostic corpus were implemented and passed focused preflight. The live run admitted 16 requests within budget, but every request failed before returning a structured model output. The runner crossed duplicate source/package module instances, lost the typed provider error classification, and did not fail fast after the first systemic error. The boundary and fail-fast behavior are repaired and covered by tests; no second paid run was made.

The original M3 retained-value regression remains unchanged. Conditional production integration and its Tier-1 retest were not authorized by experiment evidence.
`,
);

copy(
  "docs/reports/codex-runs/2026-08-18-veronica-m4-semantic-authority-baseline.md",
  "baseline.md",
);
copy(
  "docs/decisions/ADR-VERONICA-M4-001-bounded-semantic-authority.md",
  "architecture-decision.md",
);
copy(
  "docs/architecture/veronica-semantic-authority-contract.md",
  "semantic-contract.md",
);
writeJson("semantic-schema.json", VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA);
copy(
  "artifacts/veronica-m4-semantic-authority/2026-08-18/diagnostic-cases.json",
  "diagnostic-cases.json",
);
writeJson("experiment-results.json", adjudicatedResults);
writeJson("cost-ledger.json", auditedLedger);

write(
  "comparison.md",
  `# Experiment comparison

| Measure | Result | Interpretation |
| --- | ---: | --- |
| Selected cases | 18 | Corpus cap respected |
| Provider-eligible cases | 16 | Two accepted-human controls bypassed provider |
| Structured provider outputs | 0 | Semantic measures are not evaluable |
| Accepted-human preservation | 2/2 | PASS |
| Deterministic hard-gate violations | 0 | PASS in mocked and human-control paths |
| Critical inventions accepted | 0 | No provider output reached validation |
| Schema adherence | NOT MEASURABLE | No provider output |
| Intent / actor correctness | NOT MEASURABLE | No provider output |
| Abstention correctness | NOT MEASURABLE | No provider output |
| Cache replay correctness (live) | NOT MEASURABLE | No valid artifact was cacheable |
| Blocked-case improvement | NOT MEASURABLE | No provider output |
| Known-good regression rate | NOT MEASURABLE | Automated count of 8 reflects provider unavailability, not semantic regression |
| Dispatch-time ledger estimate | $${ledger.cumulativeEstimatedCostUsd.toFixed(6)} | Underconservative estimator retained for audit |
| Corrected one-attempt maximum | $${correctedOneAttemptMaximumUsd.toFixed(6)} | 16 dispatched attempts; below cap |
| Corrected full two-attempt envelope | $${correctedTwoAttemptMaximumUsd.toFixed(6)} | Below $2.50 cap |

The raw evaluator labeled the run \`${rawResults.status}\`; QA overrides that label because infrastructure failures cannot reject the semantic hypothesis. No canonical plans were mutated and no conditional integration occurred.
`,
);

const unavailableResults = rawResults.results.filter(
  (result) => result.deterministicValidation?.reasons?.includes("SEMANTIC_PROVIDER_ERROR"),
);
write(
  "disagreements.md",
  `# Disagreements and unavailable comparisons

The two accepted-human controls agreed with their independently accepted authority and bypassed the provider. The following ${unavailableResults.length} cases are provider-unavailable outcomes, not semantic disagreements:

${unavailableResults
  .map(
    (result) =>
      `- \`${result.caseId}\`: no structured model output; deterministic outcome \`${result.deterministicValidation.outcome}\` with \`SEMANTIC_PROVIDER_ERROR\`.`,
  )
  .join("\n")}

No model-derived disagreement was accepted, no assertion was changed, and no gold label came from another model.
`,
);

write(
  "validation.md",
  `# Validation

| Command / gate | Result |
| --- | --- |
| \`pnpm test:focused -- <six targeted files>\` | FAIL: 35 passed, one adapter test saw stale package dist |
| \`pnpm --filter @mediaforge/strategic-reinvention build\` | PASS |
| Same six-file focused command, repair rerun 1 | PASS: 38 tests |
| \`pnpm --filter @mediaforge/strategic-reinvention --filter @mediaforge/cli typecheck\` | PASS |
| \`pnpm exec tsx scripts/run-veronica-m4-semantic-authority-experiment.ts\` | PASS: deterministic preflight, 18 cases, zero provider calls |
| Original two-attempt admission calculation | PASS but underconservative: $1.562810 < $2.50 |
| Authorized \`--live\` experiment | BLOCKED: 16 calls, zero structured outputs, no retries |
| Final three-file direct Vitest | PASS: 13 tests |
| Scoped ESLint over seven M4 TypeScript files | PASS |
| Corrected UTF-8-byte cost audit | PASS: $1.918340 full two-attempt maximum < $2.50 |
| Retained-value regression | NOT_RUN: Stage 11 requires successful experiment integration |
| Affected Tier-1 suite | NOT_RUN: no integration; existing M3 blocker preserved |
| Secret scan and review-pack manifest audit | PASS |

The broad-looking \`node scripts/run-eslint.mjs --help\` probe was not credited: that wrapper has no help mode and produced no usable scoped result. The explicit seven-file ESLint command above is the lint authority.
`,
);

const changedFiles = [
  "apps/cli/src/veronica-model-semantic-authority-openai.ts",
  "apps/cli/src/veronica-model-semantic-authority-openai.unit.test.ts",
  "docs/architecture/veronica-semantic-authority-contract.md",
  "docs/decisions/ADR-VERONICA-M4-001-bounded-semantic-authority.md",
  "docs/reports/codex-runs/2026-08-18-veronica-m4-semantic-authority-baseline-git-status.txt",
  "docs/reports/codex-runs/2026-08-18-veronica-m4-semantic-authority-baseline.md",
  "docs/reports/codex-runs/2026-08-18-veronica-m4-semantic-authority.md",
  "experiments/veronica-m4/diagnostic-cases.v1.json",
  "packages/strategic-reinvention/src/index.ts (M4 exports appended to pre-existing dirty M3 file)",
  "packages/strategic-reinvention/src/veronica-model-semantic-authority.ts",
  "packages/strategic-reinvention/src/veronica-model-semantic-authority.unit.test.ts",
  "packages/strategic-reinvention/src/veronica-semantic-authority-experiment.ts",
  "packages/strategic-reinvention/src/veronica-semantic-authority-experiment.unit.test.ts",
  "scripts/generate-veronica-m4-semantic-authority-review.mjs",
  "scripts/run-veronica-m4-semantic-authority-experiment.ts",
  "artifacts/veronica-m4-semantic-authority/2026-08-18/{diagnostic-cases.json,experiment-results.json,cost-ledger.json}",
];
write("changed-files.txt", `${changedFiles.join("\n")}\n`);

write(
  "git-status.txt",
  execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }),
);

const diffParts = [];
const trackedDiff = spawnSync(
  "git",
  ["diff", "--", "packages/strategic-reinvention/src/index.ts"],
  { cwd: root, encoding: "utf8" },
);
if (trackedDiff.stdout) diffParts.push(trackedDiff.stdout);

const newDiffFiles = changedFiles
  .filter((file) => !file.includes("{") && !file.includes(" ("))
  .filter((file) => fs.existsSync(path.join(root, file)));
for (const file of newDiffFiles) {
  const result = spawnSync("git", ["diff", "--no-index", "/dev/null", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Unable to produce review diff for ${file}`);
  }
  if (result.stdout) diffParts.push(result.stdout);
}
write("relevant-diff.patch", diffParts.join("\n"));

if (fs.existsSync(zipPath)) {
  throw new Error(`Refusing to overwrite existing review ZIP: ${zipPath}`);
}
execFileSync("zip", ["-q", "-r", zipPath, path.basename(reviewDirectory)], {
  cwd: artifactRoot,
});

console.log(
  JSON.stringify({
    status: "BLOCKED_IMPLEMENTATION_REGRESSION",
    reviewDirectory,
    zipPath,
    files: fs.readdirSync(reviewDirectory).sort(),
  }),
);
