import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { planHistoryVisualsV32, type HistoryVisualPlanV32 } from "./visual-planner-v32.js";

const exec = promisify(execFile);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const epoch = new Date("1980-01-01T00:00:00.000Z");
const unsafe = /(?:\b(?:token|secret|password|api[_-]?key)\b|(?:^|[\\/])(?:home|users)(?:[\\/]|$))/iu;
const redacted = (value: string) => value.replace(/(?:\/home\/[^\s"']+|[A-Za-z]:\\[^\s"']+)/gu, "[redacted-path]");

async function setEpoch(file: string): Promise<void> { await fs.utimes(file, epoch, epoch); }
async function listRegularFiles(directory: string): Promise<string[]> { const entries = await fs.readdir(directory, { withFileTypes: true }); const names: string[] = []; for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) { if (entry.isSymbolicLink()) throw new Error("History V3.2 bundle refuses symlinks."); if (!entry.isFile()) throw new Error("History V3.2 bundle only permits regular files."); names.push(entry.name); } return names; }

export async function createHistoryReviewBundleV32(request: { readonly episodeId: string; readonly output: string; readonly outputRoot?: string; readonly regenerate?: boolean; readonly buildEpoch?: Date }): Promise<{ readonly directory: string; readonly zipPath: string; readonly planHash: string; readonly manifestSha256: string }> {
  const generated = await planHistoryVisualsV32({ episodeId: request.episodeId, ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}), ...(request.regenerate ? { force: true } : {}) });
  const plan: HistoryVisualPlanV32 = generated.plan;
  const directory = path.resolve(request.output);
  await fs.mkdir(directory, { recursive: true });
  await Promise.all(
    ["plan.json", "validation.json", "approval.md", "README.md", "manifest.json", "checksums.sha256"].map(
      (name) => fs.rm(path.join(directory, name), { force: true })
    )
  );
  const buildEpoch = request.buildEpoch ?? epoch;
  const approval = `# History V3.2 review\n\nPlan: \`${plan.planHash}\`\n\nStructural ${plan.approval.structural.state}; editorial ${plan.approval.editorial.state}; content ${plan.approval.content.state}; production ${plan.approval.production.state}.\n`;
  await Promise.all([writeJsonAtomic(path.join(directory, "plan.json"), plan), writeJsonAtomic(path.join(directory, "validation.json"), generated.validation), writeTextAtomic(path.join(directory, "approval.md"), approval), writeTextAtomic(path.join(directory, "README.md"), "# History V3.2 review bundle\n\nNo generated media, audio, local paths, credentials, or symlinks are included.\n")]);
  const files = await listRegularFiles(directory);
  const checksums = await Promise.all(files.map(async (name) => ({ name, sha256: sha256(await fs.readFile(path.join(directory, name))) })));
  if (checksums.some((item) => unsafe.test(item.name) || unsafe.test(item.sha256))) throw new Error("History V3.2 bundle contains unsafe metadata.");
  await writeJsonAtomic(path.join(directory, "manifest.json"), { bundleVersion: "history-review-bundle.v3.2", buildEpoch: buildEpoch.toISOString(), episodeId: plan.episodeId, planHash: plan.planHash, narrationSha256: plan.narration.normalizedNarrationSha256, approval: plan.approval, files: checksums });
  await writeTextAtomic(path.join(directory, "checksums.sha256"), `${checksums.map((item) => `${item.sha256}  ${item.name}`).join("\n")}\n`);
  for (const name of await listRegularFiles(directory)) { const file = path.join(directory, name); const text = await fs.readFile(file, "utf8"); if (unsafe.test(text)) throw new Error(`History V3.2 bundle redaction failed for ${name}.`); await fs.utimes(file, buildEpoch, buildEpoch); }
  await fs.utimes(directory, buildEpoch, buildEpoch);
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await exec("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: path.dirname(directory) });
  return { directory, zipPath, planHash: plan.planHash, manifestSha256: sha256(await fs.readFile(path.join(directory, "manifest.json")) ) };
}

export async function createCombinedHistoryReviewBundleV32(request: { readonly episodeIds: readonly string[]; readonly output: string; readonly outputRoot?: string; readonly buildEpoch?: Date }): Promise<{ readonly directory: string; readonly zipPath: string; readonly planHashes: readonly string[] }> {
  if (!request.episodeIds.length) throw new Error("A combined History V3.2 bundle requires at least one episode.");
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const buildEpoch = request.buildEpoch ?? epoch;
  const bundles = [];
  for (const episodeId of [...request.episodeIds].sort()) {
    const bundle = await createHistoryReviewBundleV32({ episodeId, output: path.join(directory, episodeId), ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}), buildEpoch });
    bundles.push(bundle);
  }
  await writeJsonAtomic(path.join(directory, "comparison-manifest.json"), { bundleVersion: "history-review-bundle-combined.v3.2", buildEpoch: buildEpoch.toISOString(), episodes: bundles.map((bundle) => ({ planHash: bundle.planHash, manifestSha256: bundle.manifestSha256 })).sort((a, b) => a.planHash.localeCompare(b.planHash)) });
  await writeTextAtomic(path.join(directory, "README.md"), "# Combined History V3.2 review bundle\n\nEach episode remains independently reviewable; content and production states are not collapsed into a false aggregate approval.\n");
  const allFiles = async (root: string): Promise<string[]> => { const entries = await fs.readdir(root, { withFileTypes: true }); const result: string[] = []; for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) { const full = path.join(root, entry.name); if (entry.isSymbolicLink()) throw new Error("History V3.2 bundle refuses symlinks."); if (entry.isDirectory()) result.push(...(await allFiles(full))); else if (entry.isFile()) result.push(full); else throw new Error("History V3.2 bundle only permits regular files."); } return result; };
  const manifestFiles = await allFiles(directory);
  const fileHashes = await Promise.all(manifestFiles.map(async (file) => ({ file: path.relative(directory, file), sha256: sha256(await fs.readFile(file)) })));
  await writeJsonAtomic(path.join(directory, "manifest.json"), { bundleVersion: "history-review-bundle-combined.v3.2", buildEpoch: buildEpoch.toISOString(), files: fileHashes.sort((left, right) => left.file.localeCompare(right.file)) });
  await writeTextAtomic(path.join(directory, "checksums.sha256"), `${fileHashes.sort((left, right) => left.file.localeCompare(right.file)).map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`);
  for (const file of await allFiles(directory)) { const text = await fs.readFile(file, "utf8"); if (unsafe.test(text)) throw new Error(`History V3.2 bundle redaction failed for ${file}.`); await fs.utimes(file, buildEpoch, buildEpoch); }
  await fs.utimes(directory, buildEpoch, buildEpoch);
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await exec("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: path.dirname(directory) });
  return { directory, zipPath, planHashes: bundles.map((bundle) => bundle.planHash) };
}
