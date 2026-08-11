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

/**
 * The forensic pack is deliberately a separate output shape from the older
 * archive-only review pack above. It reuses its safe discovery and redaction
 * primitives, but has no episode, scene, or content-pack semantics.
 */
export type ArchitectureReviewScope =
  | "repository"
  | "image"
  | "speech"
  | "localization"
  | "publishing"
  | "qa"
  | "episode-pipeline";

export interface BuildArchitectureReviewPackOptions {
  readonly repositoryRoot?: string;
  readonly scope?: ArchitectureReviewScope;
  readonly output?: string;
  readonly zip?: boolean;
  readonly maxSourceBytes?: number;
  readonly maxFileBytes?: number;
  /** Test-only clock injection; it is not exposed by the CLI. */
  readonly generatedAt?: Date;
}

export interface BuildArchitectureReviewPackResult {
  readonly packDirectory: string;
  readonly zipPath?: string;
  readonly sourceFilesIncluded: number;
  readonly totalFiles: number;
  readonly excludedFiles: number;
  readonly truncations: number;
  readonly totalBytes: number;
  readonly zipBytes?: number;
  readonly validation: readonly string[];
}

interface ForensicSourceRecord {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly category: ReviewFileCategory;
  readonly symbols: readonly string[];
  readonly referencedBy: readonly string[];
}

interface SourceText {
  readonly file: SelectedFile;
  readonly content: string;
}

const FORENSIC_REQUIRED_FILES = [
  "README.md", "REVIEW-INSTRUCTIONS.md", "COMPLETENESS.md", "manifest.json", "repository-summary.md",
  "architecture/current-architecture.md", "architecture/contracts.md", "architecture/artifact-lifecycle.md", "architecture/concurrency.md", "architecture/cache-and-reuse.md", "architecture/type-safety.md", "architecture/legacy-and-deprecation.md", "architecture/execution-paths.md", "architecture/pipeline-versions.md", "architecture/behavioral-surface.md", "architecture/execution-variations.md", "architecture/workflow-state-machine.md", "architecture/genre-variation-matrix.md", "architecture/locale-variation-matrix.md", "architecture/provider-matrix.md", "architecture/feature-flags.md", "architecture/uncertainties.md", "architecture/findings.md", "architecture/performance.md",
  "flows/end-to-end-production.md", "flows/image-generation.md", "flows/speech-generation.md", "flows/localization.md",
  "quality/gate-inventory.md", "quality/gate-matrix.md", "quality/gate-dependencies.md", "quality/remediation-flow.md", "quality/readiness-state-machine.md",
  "dependency-analysis/module-graph.md", "dependency-analysis/module-graph.json", "configuration/runtime-config.md", "configuration/config-precedence.md", "configuration/ai-models.md", "testing/test-architecture.md", "testing/behavioral-contracts.md", "operations/error-handling.md", "operations/observability.md", "operations/reliability.md", "operations/security.md",
  "indexes/packages.json", "indexes/source-index.json", "indexes/symbols.md", "indexes/entrypoints.json", "indexes/cli-commands.json", "indexes/cli-options.json", "indexes/feature-flags.json", "indexes/quality-gates.json", "indexes/execution-paths.json", "indexes/pipeline-versions.json", "indexes/config-values.json",
] as const;

const SCOPE_HINTS: Readonly<Record<Exclude<ArchitectureReviewScope, "repository">, readonly string[]>> = {
  image: ["image", "visual", "prompt", "scene"],
  speech: ["speech", "narration", "tts", "audio"],
  localization: ["local", "locale", "translation", "language"],
  publishing: ["youtube", "publish", "metadata", "upload"],
  qa: ["quality", "gate", "approval", "readiness", "validation", "remediat"],
  "episode-pipeline": ["episode", "workflow", "scene", "render", "artifact"],
};

function forensicJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function lineMatches(sources: readonly SourceText[], terms: readonly RegExp[], limit = 48): string[] {
  const matches: string[] = [];
  for (const source of sources) {
    const lines = source.content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (terms.some((term) => term.test(lines[index] ?? ""))) {
        matches.push(`- \`source/${source.file.relativePath}:${index + 1}\` — ${(lines[index] ?? "").trim().slice(0, 220)}`);
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}

function sourceReferences(sources: readonly SourceText[], terms: readonly RegExp[], limit = 80): string[] {
  const paths = sources.filter((source) => terms.some((term) => term.test(source.file.relativePath) || term.test(source.content))).map((source) => `- \`source/${source.file.relativePath}\``);
  return [...new Set(paths)].sort().slice(0, limit);
}

function symbolsFrom(content: string): string[] {
  const symbols = new Set<string>();
  for (const match of content.matchAll(/(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const)\s+([A-Za-z_$][\w$]*)/gu)) {
    if (match[1]) symbols.add(match[1]);
  }
  return [...symbols].sort().slice(0, 80);
}

function markdownEvidence(title: string, purpose: string, sources: readonly SourceText[], terms: readonly RegExp[], extra: readonly string[] = []): string {
  const evidence = lineMatches(sources, terms);
  const references = sourceReferences(sources, terms);
  return [`# ${title}`, "", purpose, "", "## Evidence", "", ...(evidence.length ? evidence : ["- No matching static evidence was found in the selected scope; see the uncertainty register."]), "", "## Related source", "", ...(references.length ? references : ["- None discovered."]), ...(extra.length ? ["", "## Reconstruction notes", "", ...extra] : []), "", "This report is generated from static source evidence. It is secondary evidence; inspect the cited source before drawing a runtime conclusion.", ""].join("\n");
}

function commandInventory(sources: readonly SourceText[]): Array<Record<string, unknown>> {
  const commands: Array<Record<string, unknown>> = [];
  for (const source of sources.filter((candidate) => candidate.file.relativePath.startsWith("apps/cli/src/"))) {
    for (const match of source.content.matchAll(/\.command\(\s*["']([^"']+)["']/gu)) {
      const command = match[1] ?? "";
      const position = match.index ?? 0;
      const nearby = source.content.slice(position, position + 1800);
      const options = [...nearby.matchAll(/\.option\(\s*["']([^"']+)/gu)].map((option) => option[1]).filter((option): option is string => Boolean(option));
      commands.push({ id: `cli:${command}`, command, aliases: [], sourcePath: source.file.relativePath, status: /legacy|deprecated|v\d/iu.test(nearby) ? "legacy" : "unknown", options: [...new Set(options)].sort(), sideEffects: /upload|generate|write|delete|render/iu.test(nearby) ? ["implementation-dependent; inspect action"] : [], qualityGates: [], featureFlags: [], configDependencies: [] });
    }
  }
  return commands.sort((left, right) => String(left["command"]).localeCompare(String(right["command"])) || String(left["sourcePath"]).localeCompare(String(right["sourcePath"])));
}

function environmentInventory(sources: readonly SourceText[]): Array<Record<string, unknown>> {
  const values = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const match of source.content.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\])/gu)) {
      const name = match[1] ?? match[2];
      if (!name) continue;
      const paths = values.get(name) ?? new Set<string>();
      paths.add(source.file.relativePath);
      values.set(name, paths);
    }
  }
  return [...values.entries()].map(([name, consumers]) => ({ name, definition: "process.env", default: "not statically determined", required: "not statically determined", legacy: /LEGACY|DEPRECATED/iu.test(name), overrideSources: ["environment"], consumers: [...consumers].sort(), runtimeEffect: "inspect consumers" })).sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function featureFlags(config: readonly Record<string, unknown>[]): Array<Record<string, unknown>> {
  return config.filter((value) => /ENABLE|FORCE|OFFLINE|FIXTURE|PAID|CACHE|REUSE|EXPERIMENT|RENDER/iu.test(String(value["name"]))).map((value) => ({ name: value["name"], definition: value["definition"], default: value["default"], source: value["consumers"], consumers: value["consumers"], enabledBehavior: "inspect cited consumers", disabledBehavior: "inspect cited consumers", status: "unknown" }));
}

function qualityGates(sources: readonly SourceText[]): Array<Record<string, unknown>> {
  return sources.filter((source) => /(?:quality|gate|readiness|approval|remediat|validation)/iu.test(source.file.relativePath)).map((source) => ({ id: `gate:${source.file.relativePath.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase()}`, name: path.posix.basename(source.file.relativePath), sourcePath: source.file.relativePath, scope: /scene/iu.test(source.file.relativePath) ? "scene" : /publish|youtube/iu.test(source.file.relativePath) ? "publishing" : "other", inputs: [], outputs: [], outcome: "unknown", canSkip: /skip|optional|bypass/iu.test(source.content), skipConditions: lineMatches([source], [/skip|optional|bypass/iu], 8), canRetry: /retry|attempt/iu.test(source.content), retryPolicy: /retry|attempt/iu.test(source.content) ? "see cited source" : undefined, remediation: /remediat|repair/iu.test(source.content) ? "see cited source" : undefined, escalation: /escalat/iu.test(source.content) ? "see cited source" : undefined, legacy: /legacy|v\d/iu.test(source.file.relativePath) }));
}

function importGraph(sources: readonly SourceText[]): { readonly nodes: readonly string[]; readonly edges: readonly Record<string, unknown>[] } {
  const edges: Array<Record<string, unknown>> = [];
  for (const source of sources) {
    for (const match of source.content.matchAll(/from\s+["']([^"']+)["']/gu)) {
      const target = match[1] ?? "";
      if (target.startsWith("@mediaforge/")) edges.push({ from: source.file.relativePath, to: target, kind: "static-import" });
    }
  }
  return { nodes: sources.map((source) => source.file.relativePath).sort(), edges: edges.sort((left, right) => `${left["from"]}:${left["to"]}`.localeCompare(`${right["from"]}:${right["to"]}`)) };
}

function packageRecords(sources: readonly SourceText[]): Array<Record<string, unknown>> {
  return sources.filter((source) => /(^|\/)package\.json$/u.test(source.file.relativePath)).flatMap((source) => {
    try {
      const value = JSON.parse(source.content) as Record<string, unknown>;
      const dependencies = Object.keys((value["dependencies"] as Record<string, unknown> | undefined) ?? {}).sort();
      const devDependencies = Object.keys((value["devDependencies"] as Record<string, unknown> | undefined) ?? {}).sort();
      return [{ name: String(value["name"] ?? path.posix.dirname(source.file.relativePath)), path: path.posix.dirname(source.file.relativePath), packageType: source.file.relativePath.startsWith("apps/") ? "application" : "library", dependencies, devDependencies, internalDependencies: dependencies.filter((dependency) => dependency.startsWith("@mediaforge/")), entrypoints: typeof value["bin"] === "string" ? [value["bin"]] : Object.values((value["bin"] as Record<string, string> | undefined) ?? {}).sort(), scripts: value["scripts"] ?? {}, tsconfigs: sources.filter((candidate) => path.posix.dirname(candidate.file.relativePath) === path.posix.dirname(source.file.relativePath) && path.posix.basename(candidate.file.relativePath).startsWith("tsconfig")).map((candidate) => candidate.file.relativePath).sort() }];
    } catch { return []; }
  }).sort((left, right) => String(left.path).localeCompare(String(right.path)));
}

function selectedForScope(files: readonly SelectedFile[], scope: ArchitectureReviewScope): SelectedFile[] {
  if (scope === "repository") return [...files];
  const hints = SCOPE_HINTS[scope];
  const mandatory = new Set<string>(MANDATORY_ARCHITECTURE_SURFACES.map((surface) => surface.path));
  return files.filter((file) => mandatory.has(file.relativePath) || hints.some((hint) => file.relativePath.toLowerCase().includes(hint))).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function writeForensicFile(root: string, relativePath: string, value: string): Promise<void> {
  assertSafeRelative(relativePath);
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value, "utf8");
}

async function bytesIn(directory: string): Promise<number> {
  const files = await listFiles(directory, "", []);
  const sizes = await Promise.all(files.map(async (file) => (await fs.stat(path.join(directory, file))).size));
  return sizes.reduce((total, size) => total + size, 0);
}

async function validateForensicPack(root: string, sources: readonly ForensicSourceRecord[]): Promise<string[]> {
  const checks: string[] = [];
  for (const required of FORENSIC_REQUIRED_FILES) await fs.access(path.join(root, required));
  checks.push("required reports and indexes present");
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")) as Record<string, unknown>;
  if (manifest["schemaVersion"] !== "architecture-review-pack.v1") throw new ArchitectureReviewPackError("Forensic manifest schema is invalid.");
  for (const source of sources) {
    const target = path.join(root, "source", source.path);
    if (await sha256(target) !== source.sha256) throw new ArchitectureReviewPackError(`Source hash mismatch: ${source.path}`);
    if (path.isAbsolute(source.path) || source.path.includes("..")) throw new ArchitectureReviewPackError(`Unsafe source index path: ${source.path}`);
  }
  checks.push("source index paths and hashes verified");
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) await fs.access(path.join(root, "source", surface.path));
  checks.push("mandatory image, OpenAI adapter, CLI, upload, and legacy speech evidence present");
  for (const file of await listFiles(root, "", [])) {
    if (/(^|\/)\.env(?:\.|$)/u.test(file) && !isSafeExample(file)) throw new ArchitectureReviewPackError(`Secret file leaked: ${file}`);
  }
  checks.push("secret-file denylist and relative-path validation passed");
  return checks;
}

async function collectSafeCliHelp(repositoryRoot: string, packDirectory: string): Promise<void> {
  const binary = path.join(repositoryRoot, "apps", "cli", "bin", "mediaforge.js");
  try {
    await fs.access(binary);
    const commands: ReadonlyArray<readonly string[]> = [["--help"], ["audit", "--help"], ["audit", "build-review-pack", "--help"]];
    for (const args of commands) {
      const result = await execFileAsync(process.execPath, [binary, ...args], { cwd: repositoryRoot, maxBuffer: 1024 * 1024 });
      const name = args.length === 1 ? "root.txt" : `${args.join("-").replace(/--/gu, "")}.txt`;
      await writeForensicFile(packDirectory, `indexes/cli-help/${name}`, result.stdout);
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message.replaceAll(repositoryRoot, "[repository]") : "unknown error";
    await writeForensicFile(packDirectory, "indexes/cli-help/README.md", `# Safe CLI help snapshots\n\nThe packaged CLI was unavailable during generation: ${detail}\n\nCommand and option indexes remain source-derived; regenerate after building apps/cli to capture help snapshots.\n`);
  }
}

function reviewPackReadme(input: { readonly repositoryName: string; readonly commit: string | null; readonly branch: string | null; readonly dirty: boolean; readonly generatedAt: string; readonly scope: ArchitectureReviewScope; readonly sourceCount: number; readonly excludedCount: number; readonly packBytes: number; readonly zipBytes?: number }): string {
  return ["# Architecture review pack", "", `- Repository: \`${input.repositoryName}\``, "- Repository path: `.` (pack-relative; absolute path omitted)", `- Commit: \`${input.commit ?? "unavailable"}\``, `- Branch: \`${input.branch ?? "unavailable"}\``, `- Dirty working tree: \`${input.dirty}\``, `- Generated at: \`${input.generatedAt}\``, "- Generator version: `1.0.0`", `- Requested scope: \`${input.scope}\``, `- Included source count: \`${input.sourceCount}\``, `- Excluded file count: \`${input.excludedCount}\``, "- Truncation count: `0` (oversize files are excluded, never silently truncated)", `- Total pack size: \`${input.packBytes}\` bytes`, `- ZIP size: \`${input.zipBytes ?? "created after this metadata pass"}\` bytes`, "- Generated artifacts included: `false` (only bounded metadata evidence where selected)", "- Secrets scanned/redacted: `true`", "", "## Limitations", "", "This pack is static, source-grounded evidence. It excludes media, dependencies, build outputs, credentials, and runtime-only state. Dynamic registry/configuration resolution and runtime gate ordering must be verified from cited source and safe runtime evidence.", ""].join("\n");
}

export async function buildArchitectureReviewPack(options: BuildArchitectureReviewPackOptions = {}): Promise<BuildArchitectureReviewPackResult> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const scope = options.scope ?? "repository";
  const outputRoot = path.resolve(repositoryRoot, options.output ?? "artifacts/review-packs");
  if (!isInside(repositoryRoot, outputRoot)) throw new ArchitectureReviewPackError("Output directory must be inside the repository root.");
  const discovery = await discoverArchitectureReviewPack({ repositoryRoot, profile: "full" });
  const exclusions = [...discovery.exclusions];
  const candidates = selectedForScope(discovery.files, scope);
  const mandatoryPaths = new Set<string>(MANDATORY_ARCHITECTURE_SURFACES.map((surface) => surface.path));
  const maxFileBytes = options.maxFileBytes;
  const maxSourceBytes = options.maxSourceBytes;
  if (maxFileBytes !== undefined && (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1)) throw new ArchitectureReviewPackError("maxFileBytes must be a positive safe integer.");
  if (maxSourceBytes !== undefined && (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1)) throw new ArchitectureReviewPackError("maxSourceBytes must be a positive safe integer.");
  let usedBytes = 0;
  const selected: SelectedFile[] = [];
  for (const file of candidates) {
    const essential = mandatoryPaths.has(file.relativePath);
    if (!essential && maxFileBytes !== undefined && file.sizeBytes > maxFileBytes) { exclusions.push({ path: file.relativePath, reason: "excluded by --max-file-bytes" }); continue; }
    if (!essential && maxSourceBytes !== undefined && usedBytes + file.sizeBytes > maxSourceBytes) { exclusions.push({ path: file.relativePath, reason: "excluded by --max-source-bytes" }); continue; }
    selected.push(file); usedBytes += file.sizeBytes;
  }
  for (const surface of MANDATORY_ARCHITECTURE_SURFACES) if (!selected.some((file) => file.relativePath === surface.path)) throw new ArchitectureReviewPackError(`Mandatory source excluded by scope: ${surface.path}`, "ARCHITECTURE_REVIEW_SURFACE_INCOMPLETE");
  const sourceTexts: SourceText[] = [];
  for (const file of selected) sourceTexts.push({ file, content: await fs.readFile(file.absolutePath, "utf8") });
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const timestamp = generatedAt.replace(/[-:.]/gu, "").replace("Z", "Z");
  const packName = `youtube-architecture-review-${timestamp}`;
  const packDirectory = path.join(outputRoot, packName);
  await fs.mkdir(outputRoot, { recursive: true });
  try { await fs.access(packDirectory); throw new ArchitectureReviewPackError(`Refusing to overwrite existing pack: ${packDirectory}`); } catch (error) { if (!(error instanceof ArchitectureReviewPackError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await fs.mkdir(packDirectory, { recursive: true });
  try {
    const sourceIndex: ForensicSourceRecord[] = [];
    for (const source of sourceTexts) {
      const analysis = analyzeSecrets(source.content);
      if (analysis.hasSecrets && source.file.criticalSurface === null) throw new ArchitectureReviewPackError(`Secret-bearing non-mandatory file reached forensic staging: ${source.file.relativePath}`);
      const staged = analysis.hasSecrets ? analysis.sanitized : source.content;
      await writeForensicFile(packDirectory, `source/${source.file.relativePath}`, staged);
      sourceIndex.push({ path: source.file.relativePath, size: Buffer.byteLength(staged), sha256: sha256Text(staged), category: source.file.category, symbols: symbolsFrom(staged), referencedBy: [] });
    }
    sourceIndex.sort((left, right) => left.path.localeCompare(right.path));
    const packages = packageRecords(sourceTexts);
    const commands = commandInventory(sourceTexts);
    const configValues = environmentInventory(sourceTexts);
    const flags = featureFlags(configValues);
    const gates = qualityGates(sourceTexts).sort((left, right) => String(left["id"]).localeCompare(String(right["id"])));
    const graph = importGraph(sourceTexts);
    const entrypoints = commands.map((command) => ({ id: command["id"], kind: "cli-command", path: command["sourcePath"], command: command["command"] }));
    const executionPaths = MANDATORY_ARCHITECTURE_SURFACES.map((surface) => ({ id: surface.id, implementation: [surface.path], callers: sourceReferences(sourceTexts, [new RegExp(path.posix.basename(surface.path).replace(/\.[^.]+$/u, ""), "iu")]).map((value) => value.replace(/^- `source\//u, "").replace(/`$/u, "")), conditions: [], status: "included-evidence", replacement: null, remainingConsumers: [], reachabilityConfidence: "high for inclusion; caller analysis is static" }));
    const versions = sourceTexts.filter((source) => /legacy|v[0-9]|experimental|beta|next/iu.test(source.file.relativePath)).map((source) => ({ id: `version:${source.file.relativePath}`, path: source.file.relativePath, status: /legacy/iu.test(source.file.relativePath) ? "legacy-or-compatibility-candidate" : "versioned-or-experimental-candidate", differences: "inspect included source", callers: [], migrationPath: "unknown" })).sort((left, right) => String(left.path).localeCompare(String(right.path)));

    const reportSpecs: Array<{ path: string; title: string; purpose: string; terms: RegExp[]; extra?: string[] }> = [
      { path: "architecture/current-architecture.md", title: "Current architecture", purpose: "Static reconstruction of domains, composition roots, ports/adapters, artifacts, and dependency direction.", terms: [/register.*command|create.*provider|workflow|artifact|adapter/iu] },
      { path: "architecture/contracts.md", title: "Public contracts", purpose: "Interfaces, schemas, ports, adapters, and DTO boundaries discovered in selected source.", terms: [/\b(interface|type|schema|adapter|port|contract)\b/iu] },
      { path: "architecture/artifact-lifecycle.md", title: "Artifact lifecycle", purpose: "Artifact, manifest, cache, timing, hash, and persistence evidence.", terms: [/artifact|manifest|cache|fingerprint|hash|timing|persist/iu] },
      { path: "architecture/concurrency.md", title: "Concurrency", purpose: "Promise, queue, throttle, lock, and atomic-write evidence; no runtime safety conclusion is implied.", terms: [/Promise\.all|Promise\.allSettled|concurren|queue|semaphore|lock|atomic/iu] },
      { path: "architecture/cache-and-reuse.md", title: "Cache and reuse", purpose: "Cache keys, semantic hashes, reuse, invalidation, and provider/model identity evidence.", terms: [/cache|reuse|semantic.*hash|fingerprint|invalidation/iu] },
      { path: "architecture/type-safety.md", title: "Type safety", purpose: "Risk-oriented evidence for assertions, unknown/any, JSON parsing, and dynamic configuration.", terms: [/\bany\b|as unknown as|JSON\.parse|\bunknown\b|process\.env/iu] },
      { path: "architecture/legacy-and-deprecation.md", title: "Legacy and deprecation", purpose: "Legacy, compatibility, and competing version candidates, including the speech adapter.", terms: [/legacy|deprecated|compatibility|v[0-9]/iu] },
      { path: "architecture/execution-paths.md", title: "Execution paths", purpose: "Entry points, orchestration targets, and static call-site evidence.", terms: [/\.command\(|register.*command|create.*provider|dynamic import|import\(/iu] },
      { path: "architecture/pipeline-versions.md", title: "Pipeline versions", purpose: "Versioned, legacy, next, beta, and experimental implementation candidates.", terms: [/legacy|v[0-9]|experimental|beta|next/iu] },
      { path: "architecture/behavioral-surface.md", title: "Behavioral surface", purpose: "Reachable CLI registrations, options, flags, and operation candidates derived from source.", terms: [/\.command\(|\.option\(|--(?:force|resume|refresh|offline|fixture|skip|provider|model)/iu] },
      { path: "architecture/execution-variations.md", title: "Execution variations", purpose: "Options and conditional branches that may alter providers, artifacts, gates, retries, or cache behavior.", terms: [/\.option\(|--(?:force|resume|refresh|offline|fixture|skip|provider|model)|if \(/iu] },
      { path: "architecture/workflow-state-machine.md", title: "Workflow state machine", purpose: "States and transitions inferred from types, manifests, workflow stores, and CLI behavior.", terms: [/status|state|transition|approved|blocked|failed|ready/iu] },
      { path: "architecture/genre-variation-matrix.md", title: "Genre variation matrix", purpose: "Genre-specific code and configuration evidence. Unlisted cells remain unknown rather than inferred.", terms: [/genre|history|veronica|dark.?truth|math/iu] },
      { path: "architecture/locale-variation-matrix.md", title: "Locale variation matrix", purpose: "Locale, language, translation, localized metadata, voice, and timing evidence.", terms: [/locale|language|localiz|translation|voice|wpm/iu] },
      { path: "architecture/provider-matrix.md", title: "Provider matrix", purpose: "Provider selection, registry, adapter, retry, timeout, and offline-fixture evidence.", terms: [/provider|registry|adapter|retry|timeout|fixture/iu] },
      { path: "architecture/feature-flags.md", title: "Feature flags", purpose: "Environment/configuration-controlled behavioral branch candidates.", terms: [/process\.env|ENABLE_|FORCE_|OFFLINE|FIXTURE|PAID_|CACHE/iu] },
      { path: "architecture/uncertainties.md", title: "Behavioral uncertainty register", purpose: "Static analysis limitations, dynamic-dispatch caveats, and evidence that needs runtime confirmation.", terms: [/import\(|registry|factory|process\.env|JSON\.parse/iu], extra: ["Question: Which registry-selected implementation runs for a given production configuration?", "Resolution: capture the effective configuration and safe CLI help/runtime diagnostics; static imports alone are insufficient."] },
      { path: "architecture/findings.md", title: "Architectural findings", purpose: "Conservative findings queue. Entries are evidence pointers, not automated PASS/FAIL judgments.", terms: [/legacy|TODO|FIXME|catch \(|process\.exit|Promise\.all/iu] },
      { path: "architecture/performance.md", title: "Performance", purpose: "Filesystem traversal, hashing, serial/parallel provider calls, and cache evidence. Findings require profiling unless explicitly measured.", terms: [/readFile|readdir|hash|cache|Promise\.all|await/iu] },
      { path: "flows/end-to-end-production.md", title: "End-to-end production", purpose: "Static stage reconstruction from CLI through localization, speech, planning, images, rendering, QA, metadata, and upload.", terms: [/localiz|narration|speech|scene|image|render|quality|upload|publish/iu], extra: ["```mermaid", "flowchart LR", "  CLI --> Localization --> Speech --> Planning --> Images --> Rendering --> QA --> Publishing", "```", "The diagram is a navigation hypothesis; cited implementation determines the actual optional ordering and branches."] },
      { path: "flows/image-generation.md", title: "Image generation", purpose: "Image caller, orchestration, prompt/cache/reuse, provider, validation, persistence, and manifest evidence.", terms: [/generateEpisodeImages|OpenAIImage|image.*cache|image.*provider|image.*manifest|technical.*qa/iu] },
      { path: "flows/speech-generation.md", title: "Speech generation", purpose: "Current providers, legacy adapter, voices/models, storage, timing, retries, and offline behavior evidence.", terms: [/speech|narration|tts|legacy.*speech|voice|timing/iu] },
      { path: "flows/localization.md", title: "Localization", purpose: "Master/localized scripts, localized metadata, TTS settings, timing, visual and upload evidence.", terms: [/localiz|locale|language|translation|caption|subtitle/iu] },
      { path: "quality/gate-inventory.md", title: "Quality gate inventory", purpose: "Gate/readiness/approval/remediation implementations selected by static path and symbol evidence.", terms: [/quality.*gate|readiness|approval|remediat|assert.*allowed/iu] },
      { path: "quality/gate-matrix.md", title: "Quality gate matrix", purpose: "Genre/mode gate evidence. Absence is marked unknown, not disabled.", terms: [/quality|gate|history|veronica|math|dark/iu] },
      { path: "quality/gate-dependencies.md", title: "Quality gate dependencies", purpose: "Precondition, evaluation, retry, remediation, and escalation evidence.", terms: [/gate|precondition|retry|remediat|escalat|ready/iu] },
      { path: "quality/remediation-flow.md", title: "Remediation flow", purpose: "Failure, repair/regeneration, re-evaluation, escalation, and stop-condition evidence.", terms: [/remediat|repair|retry|attempt|escalat|regenerat/iu] },
      { path: "quality/readiness-state-machine.md", title: "Readiness state machine", purpose: "Approval/readiness/blocking state and transition evidence.", terms: [/readiness|production.?ready|approved|blocked|transition|status/iu] },
      { path: "configuration/runtime-config.md", title: "Runtime configuration", purpose: "Environment, schema/default, provider/model, genre, locale, and CLI option evidence.", terms: [/process\.env|config|default|provider|model|locale|genre/iu] },
      { path: "configuration/config-precedence.md", title: "Configuration precedence", purpose: "Assignment, merge, fallback, environment, CLI, and override evidence. No universal precedence is inferred without a cited resolver.", terms: [/process\.env|\?\?|Object\.assign|\.merge\(|override|default|options\./iu] },
      { path: "configuration/ai-models.md", title: "AI models", purpose: "LLM, image, speech, escalation, fallback, caching, and model override evidence.", terms: [/model|reasoning|openai|elevenlabs|provider|escalat/iu] },
      { path: "testing/test-architecture.md", title: "Test architecture", purpose: "Unit/integration/E2E/fixture/offline/provider test evidence included in the pack.", terms: [/describe\(|it\(|fixture|offline|integration|e2e/iu] },
      { path: "testing/behavioral-contracts.md", title: "Behavioral contracts", purpose: "Test-derived contracts for flags, failures, retries, cache, state, and compatibility.", terms: [/expect\(|retry|cache|legacy|approval|resume|force/iu] },
      { path: "operations/error-handling.md", title: "Error handling", purpose: "Error normalization, catches, retryability, exits, partial failures, and provider errors.", terms: [/catch \(|throw new|Error|process\.exit|retry/iu] },
      { path: "operations/observability.md", title: "Observability", purpose: "Logging, telemetry, request IDs, costs, retry and duration evidence.", terms: [/logger|telemetry|requestId|cost|duration|metrics/iu] },
      { path: "operations/reliability.md", title: "Reliability", purpose: "Resumability, idempotency, retries, recovery, cache/stale artifacts, and upload behavior evidence.", terms: [/resume|idempoten|retry|checkpoint|stale|reconcile|atomic/iu] },
      { path: "operations/security.md", title: "Security", purpose: "Credential, token, shell/process, filesystem, path, archive, URL, and output-validation evidence.", terms: [/credential|token|api.?key|execFile|spawn|path|sanitize|validate/iu] },
    ];
    for (const report of reportSpecs) await writeForensicFile(packDirectory, report.path, markdownEvidence(report.title, report.purpose, sourceTexts, report.terms, report.extra));
    await writeForensicFile(packDirectory, "indexes/packages.json", forensicJson(packages));
    await writeForensicFile(packDirectory, "indexes/source-index.json", forensicJson(sourceIndex));
    await writeForensicFile(packDirectory, "indexes/cli-commands.json", forensicJson(commands));
    const cliOptions = commands.flatMap((command) => (command["options"] as string[]).map((option) => ({ command: command["command"], sourcePath: command["sourcePath"], option })));
    await writeForensicFile(packDirectory, "indexes/cli-options.json", forensicJson(cliOptions));
    await writeForensicFile(packDirectory, "indexes/feature-flags.json", forensicJson(flags));
    await writeForensicFile(packDirectory, "indexes/quality-gates.json", forensicJson(gates));
    await writeForensicFile(packDirectory, "indexes/entrypoints.json", forensicJson(entrypoints));
    await writeForensicFile(packDirectory, "indexes/execution-paths.json", forensicJson(executionPaths));
    await writeForensicFile(packDirectory, "indexes/pipeline-versions.json", forensicJson(versions));
    await writeForensicFile(packDirectory, "indexes/config-values.json", forensicJson(configValues));
    await writeForensicFile(packDirectory, "indexes/symbols.md", ["# Important symbols", "", ...sourceIndex.flatMap((source) => source.symbols.map((symbol) => `- \`${symbol}\` — \`source/${source.path}\``)), ""].join("\n"));
    await writeForensicFile(packDirectory, "dependency-analysis/module-graph.json", forensicJson(graph));
    await writeForensicFile(packDirectory, "dependency-analysis/module-graph.md", markdownEvidence("Module dependency graph", "Static workspace-package import graph. Dynamic imports, registries, and configuration factories are separately surfaced as uncertainties.", sourceTexts, [/from\s+["']@mediaforge|import\(|registry|factory/iu]));
    await writeForensicFile(packDirectory, "architecture/packages.md", ["# Package inventory", "", ...packages.flatMap((record) => [`## ${record["name"]}`, `- Path: \`source/${record["path"]}\``, `- Internal dependencies: ${((record["internalDependencies"] as string[]) ?? []).join(", ") || "none"}`, ""]), ""].join("\n"));
    await writeForensicFile(packDirectory, "repository-summary.md", ["# Repository summary", "", "This bounded tree contains selected architecture-relevant source, configuration, tests, scripts, and CI evidence. Generated media, dependencies, caches, credentials, and build outputs are excluded.", "", "## Selected repository tree", "", ...selected.map((file) => `- \`source/${file.relativePath}\``), ""].join("\n"));
    await writeForensicFile(packDirectory, "REVIEW-INSTRUCTIONS.md", ["# Review instructions", "", "Treat generated summaries as secondary evidence. Prioritize `source/` and verify every claim against implementation; inspect tests when behavior is ambiguous.", "", "Distinguish intended from actual architecture, reachable code from merely existing code, and legacy compatibility from active production paths. Check configuration-dependent and dynamically dispatched paths, mark unsupported conclusions uncertain, and never treat an automated PASS as proof that implementation is correct.", ""] .join("\n"));
    const completeness = ["# Completeness", "", "| Area | Status | Rationale |", "| --- | --- | --- |", "| packages, source selection, mandatory source areas | COMPLETE | Deterministic selected source and required-surface validation. |", "| commands, aliases, options, feature flags | HIGH CONFIDENCE | Static registration/environment extraction; runtime help snapshots are bounded. |", "| configuration precedence, gate ordering, remediation, readiness | PARTIAL | Source evidence is present; static extraction does not prove every runtime combination. |", "| pipeline versions, legacy, genres, locales, providers, cache/reuse, tests, dynamic dispatch | HIGH CONFIDENCE | Matching evidence is indexed; dynamic resolution remains explicitly uncertain. |", "", "Pack integrity is not architectural completeness.", ""];
    await writeForensicFile(packDirectory, "COMPLETENESS.md", completeness.join("\n"));
    await fs.mkdir(path.join(packDirectory, "indexes", "cli-help"), { recursive: true });
    await collectSafeCliHelp(repositoryRoot, packDirectory);
    const [commit, branch, status] = await Promise.all([git(repositoryRoot, ["rev-parse", "HEAD"]), git(repositoryRoot, ["branch", "--show-current"]), git(repositoryRoot, ["status", "--porcelain"])]);
    const sourceManifest = sourceIndex.map((source) => ({ path: source.path, sha256: source.sha256, size: source.size, category: source.category }));
    const manifest = { schemaVersion: "architecture-review-pack.v1", generatorVersion: "1.0.0", generatedAt, repository: { name: path.basename(repositoryRoot), commit, branch, dirty: Boolean(status) }, scope: { id: scope }, files: sourceManifest, hashes: Object.fromEntries(sourceManifest.map((source) => [source.path, source.sha256])), warnings: ["Generated reports are static secondary evidence."], exclusions: exclusions.sort((left, right) => left.path.localeCompare(right.path)), truncations: [], coverage: { mandatoryArchitectureSurfaces: MANDATORY_ARCHITECTURE_SURFACES.map((surface) => surface.id), sources: sourceIndex.length, commands: commands.length, configurationValues: configValues.length, qualityGateCandidates: gates.length } };
    await writeForensicFile(packDirectory, "manifest.json", forensicJson(manifest));
    await writeForensicFile(packDirectory, "README.md", reviewPackReadme({ repositoryName: path.basename(repositoryRoot), commit, branch, dirty: Boolean(status), generatedAt, scope, sourceCount: sourceIndex.length, excludedCount: exclusions.length, packBytes: 0 }));
    let packBytes = await bytesIn(packDirectory);
    await writeForensicFile(packDirectory, "README.md", reviewPackReadme({ repositoryName: path.basename(repositoryRoot), commit, branch, dirty: Boolean(status), generatedAt, scope, sourceCount: sourceIndex.length, excludedCount: exclusions.length, packBytes }));
    packBytes = await bytesIn(packDirectory);
    const validation = await validateForensicPack(packDirectory, sourceIndex);
    let zipPath: string | undefined;
    let zipBytes: number | undefined;
    if (options.zip ?? true) {
      zipPath = path.join(outputRoot, `${packName}.zip`);
      await execFileAsync("zip", ["-X", "-q", "-r", zipPath, packName], { cwd: outputRoot, maxBuffer: 8 * 1024 * 1024 });
      await execFileAsync("unzip", ["-t", zipPath], { maxBuffer: 8 * 1024 * 1024 });
      const listing = (await execFileAsync("unzip", ["-Z1", zipPath], { maxBuffer: 8 * 1024 * 1024 })).stdout.split("\n");
      if (!listing.includes(`${packName}/manifest.json`) || !listing.includes(`${packName}/source/${MANDATORY_ARCHITECTURE_SURFACES[0].path}`)) throw new ArchitectureReviewPackError("ZIP root structure validation failed.");
      zipBytes = (await fs.stat(zipPath)).size;
      await writeForensicFile(packDirectory, "README.md", reviewPackReadme({ repositoryName: path.basename(repositoryRoot), commit, branch, dirty: Boolean(status), generatedAt, scope, sourceCount: sourceIndex.length, excludedCount: exclusions.length, packBytes, zipBytes }));
      await execFileAsync("zip", ["-X", "-q", "-r", zipPath, packName], { cwd: outputRoot, maxBuffer: 8 * 1024 * 1024 });
      await execFileAsync("unzip", ["-t", zipPath], { maxBuffer: 8 * 1024 * 1024 });
      zipBytes = (await fs.stat(zipPath)).size;
      validation.push("ZIP root structure and archive integrity verified");
    }
    return { packDirectory, ...(zipPath ? { zipPath } : {}), sourceFilesIncluded: sourceIndex.length, totalFiles: (await listFiles(packDirectory, "", [])).length, excludedFiles: exclusions.length, truncations: 0, totalBytes: await bytesIn(packDirectory), ...(zipBytes !== undefined ? { zipBytes } : {}), validation };
  } catch (error) {
    await fs.rm(packDirectory, { recursive: true, force: true });
    throw error;
  }
}
