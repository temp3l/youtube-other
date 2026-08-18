/**
 * Planning-only review-pack manifest/export helper. It reads repository state
 * and the already-authored review docs; it never imports pipeline code or
 * dispatches providers.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const pack = process.argv[2];
if (!pack) throw new Error("usage: generate-veronica-systemic-remediation-m1-planning-pack.ts <pack-dir>");
const root = process.cwd();
const absolutePack = path.resolve(root, pack);
const reviewPrefix = path.relative(root, absolutePack).replace(/\\/gu, "/");
const reportPath = "docs/reports/codex-runs/2026-08-17-veronica-systemic-remediation-m1-planning.md";
const taskPaths = new Set([reviewPrefix, reportPath, "scripts/generate-veronica-systemic-remediation-m1-planning-pack.ts"]);
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const walk = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
};
const status = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean);
const isTaskPath = (line: string) => [...taskPaths].some((item) => line.slice(3).startsWith(item));
const resolvedFiles = Object.fromEntries(await Promise.all((await walk(absolutePack))
  .filter((file) => path.basename(file) !== "MANIFEST.json")
  .sort()
  .map(async (file) => [
    path.relative(absolutePack, file).replace(/\\/gu, "/"),
    sha(await fs.readFile(file)),
  ] as const)));
const manifest = {
  schemaVersion: "veronica-systemic-remediation-m1-planning-manifest.v1",
  generatedTimestamp: new Date().toISOString(),
  planningTaskStatus: "PLANNING_REVIEW_PACK_READY",
  repositoryStartingHead: "492543be534da6bf004d6089e174fbb2d21b86cc",
  repositoryEndingHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  initialDirtyState: true,
  finalDirtyState: status.length > 0,
  initialDirtyStatusSha256: "88d9e3e516fd2abafe156d5697d6024d4f3ab64bd4d16def5ba8d0036a5c68ca",
  preExistingChangedFiles: status.filter((line) => !isTaskPath(line)),
  filesChangedByPlanningTask: [reviewPrefix, reportPath, "scripts/generate-veronica-systemic-remediation-m1-planning-pack.ts"],
  commandsExecuted: [
    "git rev-parse HEAD", "git status --porcelain=v1", "git diff --stat",
    "read-only rg/sed/find/sha256sum inspection of V2 and source", 
    "npx tsx scripts/generate-veronica-systemic-remediation-m1-planning-pack.ts <pack-dir> (planning-only manifest)",
    "zip -qr <review-zip> <review-pack-dir>", "unzip -t <review-zip>",
  ],
  v2EvidencePack: {
    path: "artifacts/veronica-portfolio-preproduction/2026-08-17T21-24-44-405Z-evidence-hardening-v2/veronica-portfolio-preproduction-review-v2-2026-08-17T21-24-44-405Z.zip",
    sha256: "dd4ee85dafe2708f5c203eb88f410db76d5718717a179a30ec01877ce719af57",
  },
  m1ImplementationPrompt: { path: null, sha256: null, status: "NOT_FOUND_IN_REPOSITORY" },
  providerDispatchCounters: { openai: 0, tts: 0, images: 0, paidQa: 0, embeddings: 0, remoteRendering: 0, otherMeteredProvider: 0 },
  preventedProviderDispatchAttemptCount: 0,
  manifestExcludes: ["MANIFEST.json"],
  files: resolvedFiles,
};
await fs.writeFile(path.join(absolutePack, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
