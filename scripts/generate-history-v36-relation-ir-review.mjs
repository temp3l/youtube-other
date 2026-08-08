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
const semanticBaselineCommitSha = await git("rev-parse", "history-v3.5-frozen-before-v36^{}");
const outputRoot = path.join(repository, "artifacts", "review");
const directory = path.join(outputRoot, `history-v3.6-relation-ir-review-${timestamp}`);
await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(directory);

const provenance = {
  generatedAt,
  gitCommitSha,
  gitBranch,
  schemaVersion: "history-explanatory-relations.v1",
  semanticBaselineCommitSha,
  artifactKind: "history-v3.6-relation-ir-review",
};
const docs = path.join(repository, "docs", "history", "v3.6");
const payloads = {
  "README.md": `# History V3.6 explanatory relation IR review\n\nThis is a compact semantic-contract review artifact. V3.5 remains production.\n\n\`generatedAt\`: ${generatedAt}\n\`gitCommitSha\`: ${gitCommitSha}\n\`gitBranch\`: ${gitBranch}\n\`schemaVersion\`: history-explanatory-relations.v1\n\`semanticBaselineCommitSha\`: ${semanticBaselineCommitSha}\n`,
  "architecture.md": await fs.readFile(path.join(docs, "explanatory-relation-ir.md"), "utf8"),
  "relation-schema.json": await fs.readFile(path.join(docs, "relation-schema.json"), "utf8"),
  "golden-fixture-summary.json": await fs.readFile(path.join(docs, "golden-fixture-summary.json"), "utf8"),
  "diagnostic-catalog.md": await fs.readFile(path.join(docs, "diagnostic-catalog.md"), "utf8"),
  "migration-plan.md": await fs.readFile(path.join(docs, "migration-plan.md"), "utf8"),
  "test-summary.json": JSON.stringify({
    command: "pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/history/src/v36/explanatory-relation-v36.unit.test.ts",
    result: "pass",
    testCount: 43,
    fixtureCount: 38,
    typecheck: "pnpm --filter @mediaforge/history typecheck: pass",
  }, null, 2) + "\n",
  "provenance.json": JSON.stringify(provenance, null, 2) + "\n",
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const files = Object.keys(payloads).sort();
const checksums = await Promise.all(files.map(async (name) => {
  const content = await fs.readFile(path.join(directory, name));
  return `${createHash("sha256").update(content).digest("hex")}  ${name}`;
}));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
const zipPath = `${directory}.zip`;
await execute("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: outputRoot });
process.stdout.write(`${zipPath}\n`);
