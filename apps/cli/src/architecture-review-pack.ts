import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ArchitectureReviewPackProfile = "full" | "code" | "delta";
export type ReviewFileCategory =
  | "source"
  | "config"
  | "test"
  | "documentation"
  | "report"
  | "generated-metadata"
  | "representative-binary"
  | "review-generated";

export interface ArchitectureReviewPackOptions {
  readonly repositoryRoot?: string;
  readonly profile?: ArchitectureReviewPackProfile;
  readonly base?: string;
  readonly output?: string;
  readonly maxBinarySize?: number;
  readonly dryRun?: boolean;
}

export interface ArchitectureReviewPackResult {
  readonly status: "READY" | "PARTIAL";
  readonly profile: ArchitectureReviewPackProfile;
  readonly archive?: string;
  readonly sha256?: string;
  readonly contentHash: string;
  readonly commit: string | null;
  readonly branch: string | null;
  readonly dirty: boolean;
  readonly fileCount: number;
  readonly compressedBytes?: number;
  readonly uncompressedBytes: number;
  readonly excludedCount: number;
  readonly selectedSamples: readonly string[];
  readonly contentUnchanged: boolean;
  readonly secretSafety: "PASS" | "FAIL";
  readonly architectureSurfaceCompleteness: "PASS" | "FAIL";
  readonly validation: readonly string[];
}

export interface ArchitectureReviewSurface {
  readonly id: string;
  readonly path: string;
  readonly responsibility: string;
}

/**
 * These concrete composition and provider surfaces are the minimum evidence for
 * an independent architecture review. A moved or removed implementation fails
 * closed instead of silently disappearing from a pack.
 */
export const MANDATORY_ARCHITECTURE_SURFACES = [
  { id: "image-generation-pipeline", path: "packages/image-generation/src/episode-image-pipeline.ts", responsibility: "main image-generation pipeline" },
  { id: "openai-image-provider", path: "packages/image-generation/src/openai-image.ts", responsibility: "OpenAI image provider adapter" },
  { id: "cli-composition-root", path: "apps/cli/src/index.ts", responsibility: "CLI composition root" },
  { id: "youtube-publication-entry", path: "packages/youtube-upload/src/index.ts", responsibility: "YouTube upload and publication entry" },
  { id: "legacy-speech-adapter", path: "packages/speech/src/platform/legacy-application-adapter.ts", responsibility: "speech legacy application adapter" },
  { id: "image-batch-planner", path: "packages/image-generation/src/image-batch-planner.ts", responsibility: "image batch planning" },
  { id: "cli-image-batch-composition", path: "apps/cli/src/images-batch-commands.ts", responsibility: "CLI image batch composition" },
  { id: "cli-image-resume-composition", path: "apps/cli/src/images-resume-command.ts", responsibility: "CLI image resume composition" },
  { id: "cli-veronica-media-composition", path: "apps/cli/src/veronica-media-commands.ts", responsibility: "Veronica media workflow composition" },
  { id: "api-composition-root", path: "apps/api/src/api-entry.ts", responsibility: "API composition root" },
  { id: "durable-workflow-composition", path: "packages/application/src/composition.ts", responsibility: "durable workflow composition" },
] as const satisfies readonly ArchitectureReviewSurface[];

interface SelectedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly category: ReviewFileCategory;
  readonly sizeBytes: number;
  readonly criticalSurface: ArchitectureReviewSurface | null;
}

interface ArchitectureSurfaceRecord {
  readonly id: string;
  readonly path: string;
  readonly responsibility: string;
  readonly sourceSha256: string;
  readonly packedSha256: string;
  readonly sanitizationApplied: boolean;
  readonly redactionCount: number;
  readonly reason?: string;
}

interface Exclusion {
  readonly path: string;
  readonly reason: string;
}

interface Discovery {
  readonly files: readonly SelectedFile[];
  readonly exclusions: readonly Exclusion[];
  readonly samples: readonly Sample[];
}

interface Sample {
  readonly key: string;
  readonly path: string;
  readonly rationale: string;
}

interface PackageRecord {
  readonly path: string;
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly exports: string;
}

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".toml", ".txt", ".sql"]);
const BINARY_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".wav", ".mp3", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".pdf"]);
const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", ".mediaforge", ".localization-cache", "output", "generated-assets", "video", "audio", "images", "logs", "debug", ".idea", ".vscode"]);
const REQUIRED_REVIEW_FILES = ["REVIEW-MANIFEST.md", "REPO-TREE.txt", "PACKAGE-INVENTORY.md", "EXECUTION-PATHS.md", "ARTIFACT-DAG.md", "ARCHITECTURE-DEPENDENCIES.md", "ARCHITECTURE-SURFACE.tsv", "FILE-INVENTORY.tsv", "EXCLUSIONS.md"] as const;
const DEFAULT_MAX_BINARY_SIZE = 512 * 1024;
const MAX_SOURCE_FILE_SIZE = 2 * 1024 * 1024;
const MAX_METADATA_FILE_SIZE = 512 * 1024;

export class ArchitectureReviewPackError extends Error {
  public constructor(message: string, public readonly code = "ARCHITECTURE_REVIEW_PACK_ERROR") {
    super(message);
    this.name = "ArchitectureReviewPackError";
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function assertSafeRelative(relativePath: string): void {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
    throw new ArchitectureReviewPackError(`Unsafe archive path: ${relativePath}`);
  }
}

async function sha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function git(root: string, args: readonly string[]): Promise<string | null> {
  try {
    const result = await execFileAsync("git", [...args], { cwd: root });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

function categoryFor(relativePath: string): ReviewFileCategory {
  if (/\.(unit|integration|e2e)\.test\.[cm]?[jt]sx?$/u.test(relativePath)) return "test";
  if (relativePath.startsWith("docs/reports/") || relativePath.startsWith("reports/")) return "report";
  if (relativePath.startsWith("docs/") || relativePath.includes("/docs/")) return "documentation";
  if (relativePath.endsWith("package.json") || relativePath.startsWith(".github/") || /(^|\/)(pnpm-workspace\.yaml|tsconfig[^/]*\.json|eslint\.config\.|docker-compose|\.env\.example$)/u.test(relativePath)) return "config";
  return "source";
}

function isSafeExample(relativePath: string): boolean {
  return /(^|\/)\.env\.example$/u.test(relativePath) || relativePath.endsWith(".example");
}

interface SecretAnalysis {
  readonly hasSecrets: boolean;
  readonly sanitized: string;
  readonly redactionCount: number;
  readonly reason?: string;
}

function likelyLiteralSecret(value: string): boolean {
  return value.length >= 16 && value !== "[REDACTED_SECRET]" && !/^(?:mock|example|fixture|redacted|dry-run|test)[-_]/iu.test(value);
}

function analyzeSecrets(value: string): SecretAnalysis {
  if (value.includes("\0")) {
    throw new ArchitectureReviewPackError("Architecture source contains a NUL byte and cannot be safely sanitized.", "ARCHITECTURE_CRITICAL_SOURCE_SANITIZATION_FAILED");
  }
  let sanitized = value;
  let redactionCount = 0;
  const replace = (pattern: RegExp, replacement: string | ((substring: string, first: string, second: string, third: string, fourth: string) => string)): void => {
    sanitized = sanitized.replace(pattern, (substring: string, first: string, second: string, third: string, fourth: string) => {
      redactionCount += 1;
      return typeof replacement === "string" ? replacement : replacement(substring, first, second, third, fourth);
    });
  };
  replace(/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]");
  replace(/\bBearer\s+((?:sk|rk|pk)[_-][A-Za-z0-9._~+/-]{16,}|eyJ[A-Za-z0-9._-]{20,})/gu, "Bearer [REDACTED_SECRET]");
  replace(/\b(?:sk|rk|pk)[_-][A-Za-z0-9]{20,}/gu, "[REDACTED_SECRET]");
  replace(/\b(password|secret|api[_-]?key|client[_-]?secret)\s*([:=])\s*(["'])([^"'\r\n]+)\3/giu, (substring, name, separator, quote, literal) => {
    if (likelyLiteralSecret(literal)) return `${name}${separator}${quote}[REDACTED_SECRET]${quote}`;
    redactionCount -= 1;
    return substring;
  });
  return { hasSecrets: redactionCount > 0, sanitized, redactionCount, ...(redactionCount > 0 ? { reason: "literal secret value redacted" } : {}) };
}

async function analyzeFileSecrets(filePath: string, maxBytes = MAX_SOURCE_FILE_SIZE): Promise<SecretAnalysis> {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) return { hasSecrets: false, sanitized: "", redactionCount: 0 };
  const content = await fs.readFile(filePath, "utf8");
  return analyzeSecrets(content);
}

async function listFiles(root: string, relativeDirectory: string, exclusions: Exclusion[]): Promise<string[]> {
  const directory = path.join(root, relativeDirectory);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isSymbolicLink()) {
      exclusions.push({ path: toPosix(relativePath), reason: "symlink excluded to prevent content outside repository" });
      continue;
    }
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        exclusions.push({ path: toPosix(relativePath), reason: "excluded generated/cache/media directory" });
        continue;
      }
      result.push(...await listFiles(root, relativePath, exclusions));
      continue;
    }
    if (entry.isFile()) result.push(toPosix(relativePath));
  }
  return result;
}

function isArchitecturePath(relativePath: string): boolean {
  if (/^(apps|packages)\/[^/]+\/src\//u.test(relativePath)) return TEXT_EXTENSIONS.has(path.extname(relativePath));
  if (/^(scripts|config|docker)\//u.test(relativePath)) return TEXT_EXTENSIONS.has(path.extname(relativePath));
  if (/^(apps|packages)\/[^/]+\/package\.json$/u.test(relativePath)) return true;
  if (/^(\.github\/workflows\/|docs\/(architecture|decisions|runbooks|audits)\/)/u.test(relativePath)) return TEXT_EXTENSIONS.has(path.extname(relativePath));
  return ["package.json", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json", "vitest.unit.config.ts", "vitest.integration.config.ts", "vitest.e2e.config.ts", "eslint.config.js", ".env.example", "docker-compose.yml", "docker-compose.yaml"].includes(relativePath);
}

function isMetadataPath(relativePath: string): boolean {
  return /(?:manifest|scene-plan|visual-plan|timing|fingerprint|hash|readiness|quality|remediation|delivery|metadata|provider|batch|validation|artifact|cache)[^/]*\.(json|md)$/iu.test(path.basename(relativePath));
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sampleKey(relativePath: string, record: Record<string, unknown> | null): string | null {
  const lower = relativePath.toLowerCase();
  const metadata = record?.["sourceMetadata"];
  const genre = metadata !== null && typeof metadata === "object" ? String((metadata as Record<string, unknown>)["genre"] ?? "") : String(record?.["genre"] ?? "");
  const variant = `${lower} ${genre} ${String((metadata as Record<string, unknown>)?.["variant"] ?? record?.["variant"] ?? "")}`;
  const form = /(^|[-_/])s\d|short/u.test(variant) ? "short" : "long";
  if (genre.includes("veronica") || lower.startsWith("episodes/")) return `veronica-${form}`;
  if (genre.includes("history") || lower.includes("history")) return `history-${form}`;
  if (genre.includes("dark") || lower.includes("dark-truth") || lower.includes("horror")) return `darktruth-${form}`;
  if (genre.includes("math") || lower.includes("math") || lower.includes("mathe")) return `other-math-${form}`;
  return null;
}

async function selectSamples(root: string, allFiles: readonly string[], exclusions: Exclusion[]): Promise<Sample[]> {
  const candidates: Array<{ key: string; path: string }> = [];
  for (const relativePath of allFiles) {
    if (!relativePath.endsWith(".json") || !isMetadataPath(relativePath) || relativePath.includes("/.localization-cache/")) continue;
    const absolutePath = path.join(root, relativePath);
    const stat = await fs.stat(absolutePath);
    if (stat.size > MAX_METADATA_FILE_SIZE) continue;
    const key = sampleKey(relativePath, await readJson(absolutePath));
    if (key) candidates.push({ key, path: relativePath });
  }
  const preferred = new Map<string, { key: string; path: string }>();
  const canonicalRank = (candidate: { readonly key: string; readonly path: string }): number => {
    if (candidate.key.startsWith("veronica-") && candidate.path.startsWith("episodes/")) return 0;
    if (candidate.key.startsWith("history-") && candidate.path.startsWith("content-packs/")) return 0;
    if (candidate.key.startsWith("darktruth-") && candidate.path.startsWith("content-ideas/content/dark-truth-episodes/")) return 0;
    return 1;
  };
  for (const candidate of candidates.sort((left, right) => canonicalRank(left) - canonicalRank(right) || left.path.localeCompare(right.path))) {
    if (!preferred.has(candidate.key)) preferred.set(candidate.key, candidate);
  }
  const samples: Sample[] = [];
  for (const [key, candidate] of [...preferred.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    samples.push({ key, path: candidate.path, rationale: "Canonical production root is preferred when known; otherwise the first lexicographically sorted eligible metadata artifact for the discovered genre and variant is selected. No readiness status is trusted as a selection authority." });
  }
  if (samples.length === 0) exclusions.push({ path: "production metadata", reason: "no eligible representative metadata discovered" });
  return samples;
}

function sampleRoot(relativePath: string): string {
  const segments = relativePath.split("/");
  if (segments[0] === "episodes" && segments[1]) return segments.slice(0, 2).join("/");
  const batchIndex = segments.lastIndexOf("batches");
  if (batchIndex >= 0 && segments[batchIndex + 1]) return segments.slice(0, batchIndex + 2).join("/");
  return path.posix.dirname(relativePath);
}

export async function discoverArchitectureReviewPack(input: { readonly repositoryRoot: string; readonly profile: ArchitectureReviewPackProfile; readonly base?: string; readonly maxBinarySize?: number }): Promise<Discovery> {
  const root = path.resolve(input.repositoryRoot);
  const exclusions: Exclusion[] = [];
  const allFiles = await listFiles(root, "", exclusions);
  const surfacesByPath = new Map<string, ArchitectureReviewSurface>(MANDATORY_ARCHITECTURE_SURFACES.map((surface) => [surface.path, surface]));
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) {
    if (!allFiles.includes(surface.path)) {
      throw new ArchitectureReviewPackError(`Required architecture source is missing: ${surface.path}`, "ARCHITECTURE_CRITICAL_SOURCE_MISSING");
    }
  }
  let allowed = allFiles.filter(isArchitecturePath);
  if (input.profile === "delta") {
    if (!input.base) throw new ArchitectureReviewPackError("The delta profile requires --base <git-ref>.");
    const changed = await git(root, ["diff", "--name-only", "--diff-filter=ACMR", `${input.base}...HEAD`]);
    if (changed === null) throw new ArchitectureReviewPackError(`Cannot resolve delta base revision: ${input.base}`);
    const changedSet = new Set(changed.split("\n").filter(Boolean));
    const packageDirectories = new Set([...changedSet].map((file) => file.split("/").slice(0, 2).join("/")));
    allowed = allowed.filter((file) => changedSet.has(file) || packageDirectories.has(file.split("/").slice(0, 2).join("/")) && /package\.json$/u.test(file));
  }
  // Mandatory sources are evidence in every profile, including a delta pack.
  allowed.push(...MANDATORY_ARCHITECTURE_SURFACES.map((surface) => surface.path));
  const samples = input.profile === "full" ? await selectSamples(root, allFiles, exclusions) : [];
  if (input.profile === "full") {
    const sampleDirectories = new Set(samples.map((sample) => sampleRoot(sample.path)));
    for (const file of allFiles) {
      if (![...sampleDirectories].some((directory) => file === directory || file.startsWith(`${directory}/`))) continue;
      if (!isMetadataPath(file)) continue;
      allowed.push(file);
    }
  }
  const files: SelectedFile[] = [];
  const maxBinarySize = input.maxBinarySize ?? DEFAULT_MAX_BINARY_SIZE;
  for (const relativePath of [...new Set(allowed)].sort()) {
    assertSafeRelative(relativePath);
    const absolutePath = path.resolve(root, relativePath);
    if (!isInside(root, absolutePath)) throw new ArchitectureReviewPackError(`Candidate escapes repository root: ${relativePath}`);
    const stat = await fs.lstat(absolutePath);
    if (!stat.isFile()) continue;
    const extension = path.extname(relativePath).toLowerCase();
    const category = isMetadataPath(relativePath) && !isArchitecturePath(relativePath) ? "generated-metadata" : categoryFor(relativePath);
    if (BINARY_EXTENSIONS.has(extension)) {
      exclusions.push({ path: relativePath, reason: `binary media excluded (limit ${maxBinarySize} bytes)` });
      continue;
    }
    const maxSize = category === "generated-metadata" ? MAX_METADATA_FILE_SIZE : MAX_SOURCE_FILE_SIZE;
    if (stat.size > maxSize) {
      exclusions.push({ path: relativePath, reason: `file exceeds bounded collection limit (${maxSize} bytes)` });
      continue;
    }
    const criticalSurface = surfacesByPath.get(relativePath) ?? null;
    const secretAnalysis = isSafeExample(relativePath)
      ? { hasSecrets: false, sanitized: "", redactionCount: 0 }
      : await analyzeFileSecrets(absolutePath, maxSize);
    if (secretAnalysis.hasSecrets && criticalSurface === null) {
      exclusions.push({ path: relativePath, reason: "excluded by secret-safety scan" });
      continue;
    }
    files.push({ absolutePath, relativePath, category, sizeBytes: stat.size, criticalSurface });
  }
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) {
    if (!files.some((file) => file.relativePath === surface.path)) {
      throw new ArchitectureReviewPackError(`Required architecture source was rejected: ${surface.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
    }
  }
  return { files, exclusions, samples };
}

async function packageInventory(files: readonly SelectedFile[]): Promise<PackageRecord[]> {
  const manifests = files.filter((file) => /(^|\/)package\.json$/u.test(file.relativePath));
  const records: PackageRecord[] = [];
  for (const manifest of manifests) {
    const value = await readJson(manifest.absolutePath);
    if (!value) continue;
    const dependencies = ["dependencies", "devDependencies", "peerDependencies"].flatMap((key) => Object.keys((value[key] as Record<string, unknown> | undefined) ?? {})).filter((name) => name.startsWith("@mediaforge/")).sort();
    const exportsValue = value["exports"];
    records.push({ path: manifest.relativePath, name: String(value["name"] ?? path.dirname(manifest.relativePath)), dependencies, exports: exportsValue === undefined ? "not declared" : typeof exportsValue === "string" ? exportsValue : Object.keys(exportsValue as Record<string, unknown>).sort().join(", ") || "not declared" });
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function tree(files: readonly SelectedFile[]): string {
  return files.map((file) => `repository/${file.relativePath}`).sort().join("\n") + "\n";
}

function executionPaths(files: readonly SelectedFile[], packages: readonly PackageRecord[]): string {
  const packageNames = new Set(packages.map((record) => record.name));
  const rows = [
    ["CLI/workflow", "apps/cli/src → application/workflow-engine → domain/persistence"],
    ["Story production", "source-ingestion → story-localization/rewriting → speech/transcription → scene-planning/visual-planning → image-generation → rendering → metadata → youtube-upload"],
    ["History", "apps/cli/src/history-commands.ts → @mediaforge/history → shared image-generation/rendering/metadata surfaces"],
    ["Dark Truth/Horror", "apps/cli story commands → @mediaforge/dark-truth + story-localization → speech/image-generation/rendering"],
    ["Veronica", "apps/cli Veronica commands → strategic-reinvention + veronica-media → speech/image-generation/rendering/metadata"],
    ["Education", "apps/cli math commands → math-education + math-rendering → speech/rendering"],
  ];
  return ["# Execution paths", "", "The paths below are deterministic source-surface reconstructions, not runtime traces. They identify package and CLI ownership present in this pack.", "", ...rows.map(([name, evidence]) => `- ${name}: ${evidence}`), "", `Evidence files: ${files.filter((file) => file.relativePath.startsWith("apps/cli/src/")).length} CLI sources and ${files.filter((file) => file.relativePath.startsWith("packages/")).length} package sources.`, ""].join("\n");
}

function artifactDag(files: readonly SelectedFile[]): string {
  const evidence = files.filter((file) => /(?:manifest|fingerprint|hash|cache|artifact|timing|scene-plan|render)/iu.test(file.relativePath)).map((file) => `repository/${file.relativePath}`).slice(0, 160);
  return ["# Artifact dependency evidence", "", "The following paths mechanically match artifact, manifest, timing, cache, render, hash, or fingerprint ownership. They are evidence for an independent reviewer; this tool does not infer missing edges.", "", ...evidence.map((file) => `- ${file}`), ""].join("\n");
}

function dependencyReport(files: readonly SelectedFile[], packages: readonly PackageRecord[]): string {
  const packageNames = new Set(packages.map((record) => record.name));
  const edges = new Map<string, number>();
  for (const file of files.filter((candidate) => candidate.category === "source" || candidate.category === "test")) {
    // Import extraction is intentionally bounded to the selected TypeScript source.
    // It is descriptive rather than a substitute for a compiler graph.
    const content = requireText(file.absolutePath);
    for (const match of content.matchAll(/from\s+["'](@mediaforge\/[^"']+)["']/gu)) {
      const target = match[1] ?? "";
      if (packageNames.has(target)) edges.set(`${file.relativePath.split("/").slice(0, 2).join("/")} → ${target}`, (edges.get(`${file.relativePath.split("/").slice(0, 2).join("/")} → ${target}`) ?? 0) + 1);
    }
  }
  return ["# Architecture dependencies", "", "Mechanically observed workspace import directions (counted selected source/test import statements):", "", ...[...edges.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([edge, count]) => `- ${edge} (${count})`), "", "No circular dependency conclusion is inferred by this bounded report.", ""].join("\n");
}

function requireText(filePath: string): string {
  // This helper is populated from a small synchronous read only for source files already size-bounded by discovery.
  // Node's synchronous API avoids retaining all selected content in the main collection path.
  return readFileSync(filePath, "utf8");
}

function reviewManifest(input: { readonly profile: ArchitectureReviewPackProfile; readonly generatedAt: string; readonly branch: string | null; readonly commit: string | null; readonly dirty: boolean; readonly packages: readonly PackageRecord[]; readonly samples: readonly Sample[]; readonly files: readonly SelectedFile[]; readonly exclusions: readonly Exclusion[]; readonly contentHash: string; readonly surfaces: readonly ArchitectureSurfaceRecord[] }): string {
  const genres = [...new Set(input.samples.map((sample) => sample.key.split("-")[0]))].sort();
  const sanitized = input.surfaces.filter((surface) => surface.sanitizationApplied);
  return ["# Architecture review manifest", "", `- UTC timestamp: ${input.generatedAt}`, `- Profile: ${input.profile}`, `- Branch: ${input.branch ?? "unavailable"}`, `- Commit SHA: ${input.commit ?? "unavailable"}`, `- Working tree dirty: ${input.dirty}`, `- Node: ${process.version}`, `- Detected applications: ${input.packages.filter((record) => record.path.startsWith("apps/")).map((record) => record.name).join(", ") || "none"}`, `- Detected packages: ${input.packages.filter((record) => record.path.startsWith("packages/")).map((record) => record.name).join(", ") || "none"}`, `- Detected genres: ${genres.join(", ") || "none"}`, `- Semantic content hash: ${input.contentHash}`, "", "## Architecture surface", "", `- Required sources: ${MANDATORY_ARCHITECTURE_SURFACES.length}`, `- Included: ${input.surfaces.length}`, `- Sanitized: ${sanitized.length}`, "- Missing: 0", "- Excluded critical: 0", "- Architecture surface completeness: PASS", "- Secret safety: PASS", "", "## Included source areas", "", ...[...new Set(input.files.filter((file) => file.category === "source" || file.category === "test").map((file) => file.relativePath.split("/").slice(0, 3).join("/")))].sort().map((area) => `- ${area}`), "", "## Representative samples", "", ...(input.samples.length ? input.samples.flatMap((sample) => [`- ${sample.key}: repository/${sample.path}`, `  - Selection: ${sample.rationale}`]) : ["- No eligible representative sample metadata was found."]), "", "## Major exclusions", "", ...[...new Set(input.exclusions.map((exclusion) => exclusion.reason))].sort().map((reason) => `- ${reason}`), "", "## Missing evidence", "", "- Bulk media, provider caches, credentials, and unsafe or oversized files are intentionally not archived.", "- A missing genre/variant is reported as missing rather than fabricated.", "", "> Existing automated PASS results, readiness statuses, semantic scores, blocker counts, hashes, timing validations, architecture reports, and prior audit conclusions are included as evidence only. They must not be assumed correct by the independent reviewer.", ""].join("\n");
}

async function semanticContentHash(files: readonly SelectedFile[]): Promise<string> {
  const records = await Promise.all(files.map(async (file) => `${file.relativePath}\t${await sha256(file.absolutePath)}`));
  return sha256Text(records.sort().join("\n"));
}

function emitSurfaceEvent(record: ArchitectureSurfaceRecord, action: "included" | "sanitized" | "failed"): void {
  process.stderr.write(`${JSON.stringify({ component: "architecture-review-pack", path: record.path, critical: true, action, redactionCount: record.redactionCount, sourceSha256: record.sourceSha256, packedSha256: record.packedSha256, ...(record.reason !== undefined ? { reason: record.reason } : {}) })}\n`);
}

async function stageFiles(stageRoot: string, files: readonly SelectedFile[]): Promise<ArchitectureSurfaceRecord[]> {
  const surfaces: ArchitectureSurfaceRecord[] = [];
  for (const file of files) {
    assertSafeRelative(file.relativePath);
    const target = path.resolve(stageRoot, "repository", file.relativePath);
    if (!isInside(stageRoot, target)) throw new ArchitectureReviewPackError(`Staged target escapes archive root: ${file.relativePath}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      if (file.criticalSurface !== null) {
        const source = await fs.readFile(file.absolutePath, "utf8");
        const analysis = analyzeSecrets(source);
        await fs.writeFile(target, analysis.hasSecrets ? analysis.sanitized : source, "utf8");
        const record: ArchitectureSurfaceRecord = {
          id: file.criticalSurface.id,
          path: file.relativePath,
          responsibility: file.criticalSurface.responsibility,
          sourceSha256: createHash("sha256").update(source).digest("hex"),
          packedSha256: await sha256(target),
          sanitizationApplied: analysis.hasSecrets,
          redactionCount: analysis.redactionCount,
          ...(analysis.reason !== undefined ? { reason: analysis.reason } : {}),
        };
        surfaces.push(record);
        emitSurfaceEvent(record, analysis.hasSecrets ? "sanitized" : "included");
      } else {
        const analysis = await analyzeFileSecrets(file.absolutePath);
        if (analysis.hasSecrets) throw new ArchitectureReviewPackError(`Non-critical source became secret-bearing during staging: ${file.relativePath}`, "ARCHITECTURE_REVIEW_SECRET_SAFETY_FAILED");
        await fs.copyFile(file.absolutePath, target);
      }
    } catch (error: unknown) {
      if (file.criticalSurface !== null) {
        throw new ArchitectureReviewPackError(`Cannot stage required architecture source ${file.relativePath}: ${error instanceof Error ? error.message : "unknown error"}`, "ARCHITECTURE_CRITICAL_SOURCE_SANITIZATION_FAILED");
      }
      throw error;
    }
  }
  return surfaces.sort((left, right) => left.path.localeCompare(right.path));
}

function architectureSurfaceInventory(surfaces: readonly ArchitectureSurfaceRecord[]): string {
  return ["id\tpath\tresponsibility\tsource_sha256\tpacked_sha256\tsanitization_applied\tredaction_count\treason", ...surfaces.map((surface) => [surface.id, surface.path, surface.responsibility, surface.sourceSha256, surface.packedSha256, String(surface.sanitizationApplied), String(surface.redactionCount), surface.reason ?? ""].join("\t"))].join("\n") + "\n";
}

async function fileInventory(stageRoot: string, repositoryFiles: readonly SelectedFile[]): Promise<string> {
  const rows = await Promise.all(repositoryFiles.map(async (file) => [
    `repository/${file.relativePath}`,
    String(file.sizeBytes),
    await sha256(path.join(stageRoot, "repository", file.relativePath)),
    file.category,
  ].join("\t")));
  const generated = (await fs.readdir(stageRoot)).filter((name) => name !== "FILE-INVENTORY.tsv" && name !== "repository").sort();
  for (const name of generated) {
    const stat = await fs.stat(path.join(stageRoot, name));
    if (stat.isFile()) rows.push([name, String(stat.size), await sha256(path.join(stageRoot, name)), "review-generated"].join("\t"));
  }
  return ["relative_path\tsize_bytes\tsha256\tcategory", ...rows.sort()].join("\n") + "\n";
}

async function validateStage(stageRoot: string, repositoryFiles: readonly SelectedFile[], samples: readonly Sample[], surfaces: readonly ArchitectureSurfaceRecord[]): Promise<string[]> {
  const checks: string[] = [];
  for (const name of REQUIRED_REVIEW_FILES) {
    await fs.access(path.join(stageRoot, name));
  }
  checks.push("required review files present");
  if (!repositoryFiles.some((file) => file.category === "source")) throw new ArchitectureReviewPackError("Validation failed: no implementation source selected.");
  if (!repositoryFiles.some((file) => file.category === "test")) throw new ArchitectureReviewPackError("Validation failed: no architecture-relevant tests selected.");
  if (!repositoryFiles.some((file) => file.relativePath === "package.json") || !repositoryFiles.some((file) => /^(apps|packages)\/[^/]+\/package\.json$/u.test(file.relativePath))) throw new ArchitectureReviewPackError("Validation failed: workspace manifests are missing.");
  checks.push("source, tests, and workspace manifests present");
  const stagedFiles = await listFiles(stageRoot, "", []);
  for (const staged of stagedFiles) {
    assertSafeRelative(staged);
    if (staged.includes("node_modules/") || staged.startsWith(".git/") || /(^|\/)\.env(?:\.|$)/u.test(staged) && !isSafeExample(staged)) throw new ArchitectureReviewPackError(`Validation failed: unsafe staged path ${staged}`);
    if (BINARY_EXTENSIONS.has(path.extname(staged).toLowerCase())) throw new ArchitectureReviewPackError(`Validation failed: bulk binary staged: ${staged}`);
    if ((await analyzeFileSecrets(path.join(stageRoot, staged))).hasSecrets) throw new ArchitectureReviewPackError(`Validation failed: secret pattern in staged file ${staged}`, "ARCHITECTURE_REVIEW_SECRET_SAFETY_FAILED");
  }
  checks.push("staged secret, binary, and path safety scan passed");
  const inventory = await fs.readFile(path.join(stageRoot, "FILE-INVENTORY.tsv"), "utf8");
  for (const line of inventory.trim().split("\n").slice(1)) {
    const [relativePath, , digest] = line.split("\t");
    if (!relativePath || !digest) throw new ArchitectureReviewPackError("Validation failed: malformed file inventory.");
    if (digest !== await sha256(path.join(stageRoot, relativePath))) throw new ArchitectureReviewPackError(`Validation failed: file hash mismatch for ${relativePath}`);
  }
  checks.push("file inventory hashes verified");
  if (surfaces.length !== MANDATORY_ARCHITECTURE_SURFACES.length) throw new ArchitectureReviewPackError("Validation failed: mandatory architecture surface registry is incomplete.", "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
  for (const required of MANDATORY_ARCHITECTURE_SURFACES) {
    const source = repositoryFiles.find((file) => file.relativePath === required.path);
    const record = surfaces.find((surface) => surface.path === required.path);
    const packedPath = path.join(stageRoot, "repository", required.path);
    if (!source || !record) throw new ArchitectureReviewPackError(`Validation failed: missing required architecture source ${required.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
    const stat = await fs.stat(packedPath);
    if (stat.size === 0 || record.sourceSha256.length !== 64 || record.packedSha256 !== await sha256(packedPath)) throw new ArchitectureReviewPackError(`Validation failed: invalid required architecture source ${required.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
    if (record.sanitizationApplied && record.redactionCount < 1) throw new ArchitectureReviewPackError(`Validation failed: missing redaction provenance for ${required.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
  }
  checks.push("mandatory architecture surface completeness passed");
  for (const sample of samples) {
    await fs.access(path.join(stageRoot, "repository", sample.path));
  }
  checks.push(samples.length ? "representative sample metadata present" : "no representative sample metadata available");
  return checks;
}

async function archive(stageRoot: string, archivePath: string): Promise<void> {
  const entries = (await listFiles(stageRoot, "", [])).sort();
  await execFileAsync("zip", ["-X", "-q", archivePath, ...entries], { cwd: stageRoot, maxBuffer: 1024 * 1024 });
  await execFileAsync("unzip", ["-t", archivePath], { maxBuffer: 1024 * 1024 });
}

async function validateArchive(archivePath: string): Promise<void> {
  const listing = (await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 4 * 1024 * 1024 })).stdout.split("\n");
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) {
    const archivedPath = `repository/${surface.path}`;
    if (!listing.includes(archivedPath)) throw new ArchitectureReviewPackError(`Archive is missing required architecture source ${surface.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
    const content = (await execFileAsync("unzip", ["-p", archivePath, archivedPath], { maxBuffer: MAX_SOURCE_FILE_SIZE + 1024 })).stdout;
    if (content.length === 0) throw new ArchitectureReviewPackError(`Archive contains an empty required architecture source ${surface.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
  }
}

async function previousContentHash(outputDirectory: string): Promise<string | null> {
  try {
    const files = (await fs.readdir(outputDirectory)).filter((name) => name.endsWith(".zip")).sort();
    for (const file of files) {
      const result = await execFileAsync("unzip", ["-p", path.join(outputDirectory, file), "REVIEW-MANIFEST.md"], { maxBuffer: 1024 * 1024 });
      const match = /Semantic content hash: ([a-f0-9]{64})/u.exec(result.stdout);
      if (match?.[1]) return match[1];
    }
  } catch {
    // No previous archive is normal for a first pack.
  }
  return null;
}

export async function runArchitectureReviewPack(options: ArchitectureReviewPackOptions = {}): Promise<ArchitectureReviewPackResult> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const profile = options.profile ?? "full";
  const outputDirectory = path.resolve(repositoryRoot, options.output ?? "docs/reports/architecture-review-packs");
  if (!isInside(repositoryRoot, outputDirectory)) throw new ArchitectureReviewPackError("Output directory must be inside the repository root.");
  const discovery = await discoverArchitectureReviewPack({
    repositoryRoot,
    profile,
    ...(options.base !== undefined ? { base: options.base } : {}),
    ...(options.maxBinarySize !== undefined ? { maxBinarySize: options.maxBinarySize } : {}),
  });
  const contentHash = await semanticContentHash(discovery.files);
  const [commit, branch, status, packages] = await Promise.all([
    git(repositoryRoot, ["rev-parse", "HEAD"]),
    git(repositoryRoot, ["branch", "--show-current"]),
    git(repositoryRoot, ["status", "--porcelain"]),
    packageInventory(discovery.files),
  ]);
  const dirty = Boolean(status);
  const uncompressedBytes = discovery.files.reduce((total, file) => total + file.sizeBytes, 0);
  const previousHash = options.dryRun ? null : await previousContentHash(outputDirectory);
  if (options.dryRun) return { status: "READY", profile, contentHash, commit, branch, dirty, fileCount: discovery.files.length, uncompressedBytes, excludedCount: discovery.exclusions.length, selectedSamples: discovery.samples.map((sample) => `${sample.key}: ${sample.path}`), contentUnchanged: false, secretSafety: "PASS", architectureSurfaceCompleteness: "PASS", validation: ["dry-run selection and mandatory architecture surface validation completed; no staging or archive created"] };
  await fs.mkdir(outputDirectory, { recursive: true });
  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-architecture-review-"));
  try {
    const surfaces = await stageFiles(stageRoot, discovery.files);
    const generatedAt = new Date().toISOString();
    await fs.writeFile(path.join(stageRoot, "REPO-TREE.txt"), tree(discovery.files));
    await fs.writeFile(path.join(stageRoot, "PACKAGE-INVENTORY.md"), ["# Package inventory", "", ...packages.flatMap((record) => [`## ${record.name}`, `- Path: repository/${record.path}`, `- Workspace dependencies: ${record.dependencies.join(", ") || "none"}`, `- Public exports: ${record.exports}`, `- Role evidence: ${record.path.startsWith("apps/") ? "application/CLI" : record.path.includes("history") || record.path.includes("dark-truth") || record.path.includes("math") || record.path.includes("veronica") ? "genre-specific" : "shared platform"}`, ""])].join("\n"));
    await fs.writeFile(path.join(stageRoot, "EXECUTION-PATHS.md"), executionPaths(discovery.files, packages));
    await fs.writeFile(path.join(stageRoot, "ARTIFACT-DAG.md"), artifactDag(discovery.files));
    await fs.writeFile(path.join(stageRoot, "ARCHITECTURE-DEPENDENCIES.md"), dependencyReport(discovery.files, packages));
    await fs.writeFile(path.join(stageRoot, "ARCHITECTURE-SURFACE.tsv"), architectureSurfaceInventory(surfaces));
    const sanitized = surfaces.filter((surface) => surface.sanitizationApplied);
    await fs.writeFile(path.join(stageRoot, "EXCLUSIONS.md"), ["# Exclusions", "", "The pack excludes .git, dependencies, build output, cache directories, temporary/IDE state, bulk media, symlinks, oversize files, and non-critical candidate files that match secret patterns. Source files are never modified for redaction.", "", "## Excluded sources", "", ...discovery.exclusions.map((item) => `- repository/${item.path}: ${item.reason}`), "", "## Sanitized architecture sources", "", ...(sanitized.length ? sanitized.map((surface) => `- repository/${surface.path}: ${surface.reason ?? "secret value redacted"}; redactions=${surface.redactionCount}; source_sha256=${surface.sourceSha256}; packed_sha256=${surface.packedSha256}`) : ["- None."]), "", "`FILE-INVENTORY.tsv` enumerates every archived file except itself. Semantic content hashing covers the selected repository evidence only, avoiding self-referential generated-review files.", ""].join("\n"));
    await fs.writeFile(path.join(stageRoot, "REVIEW-MANIFEST.md"), reviewManifest({ profile, generatedAt, branch, commit, dirty, packages, samples: discovery.samples, files: discovery.files, exclusions: discovery.exclusions, contentHash, surfaces }));
    await fs.writeFile(path.join(stageRoot, "FILE-INVENTORY.tsv"), await fileInventory(stageRoot, discovery.files));
    const validation = await validateStage(stageRoot, discovery.files, discovery.samples, surfaces);
    const stamp = generatedAt.replace(/[-:.]/gu, "");
    const archivePath = path.join(outputDirectory, `youtube-production-architecture-review-${stamp}.zip`);
    await archive(stageRoot, archivePath);
    await validateArchive(archivePath);
    const archiveStat = await fs.stat(archivePath);
    return { status: "READY", profile, archive: archivePath, sha256: await sha256(archivePath), contentHash, commit, branch, dirty, fileCount: discovery.files.length + REQUIRED_REVIEW_FILES.length, compressedBytes: archiveStat.size, uncompressedBytes, excludedCount: discovery.exclusions.length, selectedSamples: discovery.samples.map((sample) => `${sample.key}: ${sample.path}`), contentUnchanged: previousHash === contentHash, secretSafety: "PASS", architectureSurfaceCompleteness: "PASS", validation: [...validation, "archive opens successfully and mandatory sources verified"] };
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true });
  }
}
