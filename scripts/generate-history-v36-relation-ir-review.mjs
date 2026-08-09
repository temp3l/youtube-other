import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execute = promisify(execFile);
const repository = path.resolve(new URL("..", import.meta.url).pathname);
const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const git = async (...args) => (await execute("git", args, { cwd: repository })).stdout.trim();
const gitCommitSha = await git("rev-parse", "HEAD");
const gitBranch = await git("branch", "--show-current");
const frozenV35ProductionTag = "history-v3.5-frozen-before-v36";
const acceptedV35SemanticBaselineTag = "history-v3.5-semantic-baseline";
const frozenV35ProductionCommitSha = await git("rev-parse", `${frozenV35ProductionTag}^{}`);
const acceptedV35SemanticBaselineCommitSha = await git("rev-parse", `${acceptedV35SemanticBaselineTag}^{}`);
const outputRoot = path.join(repository, "artifacts", "review");
const directory = path.join(outputRoot, `history-v3.6-relation-ir-review-${timestamp}`);
const docs = path.join(repository, "docs", "history", "v3.6");
const testFile = "packages/history/src/v36/explanatory-relation-v36.unit.test.ts";

await execute("pnpm", ["exec", "tsx", "scripts/generate-history-v36-relation-contract-docs.ts"], { cwd: repository });
await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(directory);

const vitestJsonPath = path.join(directory, ".vitest-result.json");
await execute("pnpm", [
  "exec", "vitest", "run", "-c", "vitest.unit.config.ts", "--bail=1", testFile,
  "--reporter=json", "--outputFile", vitestJsonPath,
], { cwd: repository });
const vitestResult = JSON.parse(await fs.readFile(vitestJsonPath, "utf8"));
await fs.rm(vitestJsonPath);
if (vitestResult.numTotalTests !== vitestResult.numPassedTests) {
  throw new Error("Focused V3.6 relation tests did not fully pass; review artifact was not produced.");
}

const provenance = {
  generatedAt,
  gitCommitSha,
  gitBranch,
  v36ImplementationCommitSha: gitCommitSha,
  frozenV35ProductionCommitSha,
  frozenV35ProductionTag,
  acceptedV35SemanticBaselineCommitSha,
  acceptedV35SemanticBaselineTag,
  schemaVersion: "history-v3.6-relation-ir-review-provenance.v2",
  artifactKind: "history-v3.6-relation-ir-review",
};
const invariantTestSummary = {
  schemaVersion: "history-v3.6-relation-ir-invariant-summary.v2",
  result: "pass",
  testCount: vitestResult.numTotalTests,
  testFilePaths: [testFile],
  invariants: {
    goldenSemanticCorpus: "pass",
    deterministicSemanticIdentity: "pass",
    semanticIdentityIndependentOfEvidenceWindow: "pass",
    evidenceFingerprintDeterministic: "pass",
    episodeIsolation: "pass",
    properNameAtomicity: "pass",
    directionality: "pass",
    dependencyDirectionality: "pass",
    movementCardinality: "pass",
    processOrdering: "pass",
    temporalSequenceOrdering: "pass",
    unorderedEvidenceSet: "pass",
    semanticDuplicateCollapse: "pass",
    temporalVsCausalSeparation: "pass",
  },
};
const payloads = {
  "README.md": `# History V3.6 explanatory relation IR review\n\nThis is a compact semantic-contract review artifact. V3.5 remains production. The checksum manifest covers every payload except itself.\n\n\`generatedAt\`: ${generatedAt}\n\`gitCommitSha\`: ${gitCommitSha}\n\`v36ImplementationCommitSha\`: ${gitCommitSha}\n\`frozenV35ProductionCommitSha\`: ${frozenV35ProductionCommitSha}\n\`acceptedV35SemanticBaselineCommitSha\`: ${acceptedV35SemanticBaselineCommitSha}\n\`schemaVersion\`: ${provenance.schemaVersion}\n`,
  "architecture.md": await fs.readFile(path.join(docs, "explanatory-relation-ir.md"), "utf8"),
  "migration-plan.md": await fs.readFile(path.join(docs, "migration-plan.md"), "utf8"),
  "diagnostic-catalog.md": await fs.readFile(path.join(docs, "diagnostic-catalog.md"), "utf8"),
  "relation-schema.json": await fs.readFile(path.join(docs, "relation-schema.json"), "utf8"),
  "provenance-schema.json": await fs.readFile(path.join(docs, "provenance-schema.json"), "utf8"),
  "golden-fixture-summary.json": await fs.readFile(path.join(docs, "golden-fixture-summary.json"), "utf8"),
  "invariant-test-summary.json": `${JSON.stringify(invariantTestSummary, null, 2)}\n`,
  "test-summary.json": `${JSON.stringify({
    command: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 ${testFile}`,
    result: "pass",
    testCount: vitestResult.numTotalTests,
    fixtureCount: JSON.parse(await fs.readFile(path.join(docs, "golden-fixture-summary.json"), "utf8")).fixtureCount,
  }, null, 2)}\n`,
  "provenance.json": `${JSON.stringify(provenance, null, 2)}\n`,
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = Object.keys(payloads).sort();
const checksums = await Promise.all(files.map(async (name) => {
  const content = await fs.readFile(path.join(directory, name));
  return `${createHash("sha256").update(content).digest("hex")}  ${name}`;
}));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: outputRoot });
await execute("unzip", ["-t", zipPath], { cwd: outputRoot });
process.stdout.write(`${zipPath}\n`);
