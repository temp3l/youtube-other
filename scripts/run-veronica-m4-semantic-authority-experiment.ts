import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAiStoryClientWithOptions } from "@mediaforge/story-localization";
import { writeJsonAtomic } from "@mediaforge/shared";
import {
  FileVeronicaModelSemanticAuthorityCache,
  VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
  VeronicaSemanticExperimentLedger,
  evaluateVeronicaSemanticExperimentCase,
  resolveVeronicaModelSemanticAuthority,
  summarizeVeronicaSemanticExperiment,
  veronicaSemanticDiagnosticCorpusSchema,
  type VeronicaSemanticProviderPort,
} from "@mediaforge/strategic-reinvention";
import {
  OpenAiVeronicaSemanticAuthorityAdapter,
  type OpenAiSemanticClient,
} from "../apps/cli/src/veronica-model-semantic-authority-openai.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactRoot = path.join(
  repositoryRoot,
  "artifacts",
  "veronica-m4-semantic-authority",
  "2026-08-18",
);
const resultPath = path.join(artifactRoot, "experiment-results.json");
const ledgerPath = path.join(artifactRoot, "cost-ledger.json");
const diagnosticPath = path.join(artifactRoot, "diagnostic-cases.json");
const cacheRoot = path.join(artifactRoot, "semantic-cache");

const live = process.argv.includes("--live");
const experimentAuthorized =
  live &&
  process.env["VERONICA_M4_SEMANTIC_EXPERIMENT_AUTHORIZED"] === "true";
const apiKey =
  process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_TOKEN"] ?? "";
const credentialAvailable = apiKey.length > 0;

const corpus = veronicaSemanticDiagnosticCorpusSchema.parse(
  JSON.parse(
    await fs.readFile(
      path.join(repositoryRoot, "experiments/veronica-m4/diagnostic-cases.v1.json"),
      "utf8",
    ),
  ) as unknown,
);
await fs.mkdir(artifactRoot, { recursive: true });
await writeJsonAtomic(diagnosticPath, corpus);

const unavailableProvider: VeronicaSemanticProviderPort = {
  async plan() {
    throw new Error("Semantic provider was not configured for dispatch.");
  },
};
const provider =
  live && credentialAvailable
    ? new OpenAiVeronicaSemanticAuthorityAdapter(
        createOpenAiStoryClientWithOptions({
          apiKey,
          maxRetries: 0,
        }) as OpenAiSemanticClient,
      )
    : unavailableProvider;
const cache = new FileVeronicaModelSemanticAuthorityCache(cacheRoot);
const ledger = new VeronicaSemanticExperimentLedger(
  "veronica-m4-semantic-authority-2026-08-18",
  VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
);
const results = [];
let terminalBlocker: string | null = null;

for (const diagnosticCase of corpus.cases) {
  try {
    const resolution = await resolveVeronicaModelSemanticAuthority({
      request: {
        source: diagnosticCase.source,
        contextBefore: diagnosticCase.contextBefore,
        contextAfter: diagnosticCase.contextAfter,
        allowedOwnerTypes: diagnosticCase.allowedOwnerTypes,
      },
      acceptedHuman: diagnosticCase.gold.acceptedHumanPlan,
      deterministicCurrent:
        diagnosticCase.existingDeterministicResult.status === "PASS",
      experimentAuthorized,
      credentialAvailable,
      cache,
      provider,
      ledger,
    });
    results.push(
      evaluateVeronicaSemanticExperimentCase({ diagnosticCase, resolution }),
    );
    const providerFailure = resolution.validation.reasons.find((reason) =>
      reason.startsWith("SEMANTIC_PROVIDER_"),
    );
    if (
      providerFailure === "SEMANTIC_PROVIDER_AUTHENTICATION_ERROR" ||
      providerFailure === "SEMANTIC_PROVIDER_REQUEST_REJECTED" ||
      providerFailure === "SEMANTIC_PROVIDER_ERROR"
    ) {
      terminalBlocker = providerFailure;
    }
    await writeJsonAtomic(resultPath, {
      schemaVersion: "veronica-semantic-experiment-results.v1",
      state: "IN_PROGRESS",
      providerExperimentRan: live && experimentAuthorized && credentialAvailable,
      results,
    });
    await writeJsonAtomic(ledgerPath, ledger.snapshot());
    if (terminalBlocker) break;
  } catch (error) {
    terminalBlocker =
      error instanceof Error
        ? error.message.replace(/sk-[A-Za-z0-9_-]+/gu, "[REDACTED]")
        : String(error);
    break;
  }
}

const metrics = summarizeVeronicaSemanticExperiment(results);
const ledgerSnapshot = ledger.snapshot();
const hardGates = {
  strictSchemaCompliance:
    metrics.schemaFailures === 0 && results.length === corpus.cases.length,
  acceptedHumanPreservation:
    metrics.acceptedHumanPreserved === metrics.acceptedHumanControls,
  deterministicHardGateEnforcement:
    metrics.deterministicHardGateViolations === 0,
  criticalUnsupportedInvention:
    metrics.criticalUnsupportedInventionsAccepted === 0,
  cacheReplayCorrectness:
    metrics.cacheReplayCases > 0 &&
    metrics.cacheReplayCorrect === metrics.cacheReplayCases,
  knownGoodMaterialRegressions: metrics.knownGoodRegressions === 0,
  providerBudget:
    ledgerSnapshot.cumulativeReservedMaximumUsd <=
      VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD &&
    ledgerSnapshot.cumulativeEstimatedCostUsd <=
      VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
};
const hardGatesPass = Object.values(hardGates).every(Boolean);
const meaningfulImprovement =
  metrics.blockedCasesImproved >= 2 &&
  metrics.semanticIntentAgreement / Math.max(metrics.selectedCases, 1) >= 0.8 &&
  metrics.actorOwnerCorrect / Math.max(metrics.selectedCases, 1) >= 0.8 &&
  metrics.abstentionCorrect === metrics.abstentions;

let status: string;
if (terminalBlocker === "SEMANTIC_PROVIDER_AUTHENTICATION_ERROR") {
  status = "BLOCKED_PROVIDER_CREDENTIAL";
} else if (terminalBlocker?.toLowerCase().includes("budget")) {
  status = "BLOCKED_PROVIDER_BUDGET";
} else if (terminalBlocker) {
  status = "BLOCKED_IMPLEMENTATION_REGRESSION";
} else if (!live) {
  status = "READY_FOR_PROVIDER_CANARY";
} else if (!experimentAuthorized) {
  status = "BLOCKED_DETERMINISTIC_PREFLIGHT";
} else if (!credentialAvailable) {
  status = "BLOCKED_PROVIDER_CREDENTIAL";
} else if (!hardGatesPass) {
  status = "M4_SEMANTIC_ORACLE_REJECTED";
} else if (meaningfulImprovement) {
  status = "M4_SEMANTIC_ORACLE_ACCEPTED";
} else {
  status = "M4_SEMANTIC_ORACLE_INCONCLUSIVE";
}

await writeJsonAtomic(ledgerPath, ledgerSnapshot);
await writeJsonAtomic(resultPath, {
  schemaVersion: "veronica-semantic-experiment-results.v1",
  generatedAt: new Date().toISOString(),
  status,
  providerExperimentRan: live && experimentAuthorized && credentialAvailable,
  terminalBlocker,
  casesSelected: corpus.cases.length,
  casesCompleted: results.length,
  metrics,
  hardGates,
  meaningfulImprovement,
  results,
});

process.stdout.write(
  `${JSON.stringify({
    status,
    casesSelected: corpus.cases.length,
    casesCompleted: results.length,
    providerRequests: ledgerSnapshot.providerRequests,
    cacheHits: ledgerSnapshot.cacheHits,
    retries: ledgerSnapshot.retries,
    cumulativeEstimatedCostUsd: ledgerSnapshot.cumulativeEstimatedCostUsd,
  })}\n`,
);
