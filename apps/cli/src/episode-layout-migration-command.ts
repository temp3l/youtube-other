import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  ensureDir,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  type ContentVariant,
  type LocaleCode,
} from "@mediaforge/shared";

export const episodeLayoutMigrationNormalizationPolicy =
  "utf8-strip-bom,crlf-to-lf,trim-trailing-line-whitespace,trim-final-whitespace,append-single-lf";

export type EpisodeLayoutMigrationClassification =
  | "already_canonical"
  | "safe_move"
  | "identical_duplicate"
  | "divergent_duplicate"
  | "target_collision"
  | "stale_unsupported_layout"
  | "invalid_language_or_variant"
  | "filesystem_error";

export type EpisodeScriptLayout =
  | "canonical_full"
  | "canonical_short"
  | "root_script"
  | "language_script"
  | "language_variant_script"
  | "source_pack"
  | "unsupported_script";

export interface EpisodeLayoutMigrationMove {
  readonly from: string;
  readonly to: string;
  readonly rollback: {
    readonly command: string;
    readonly from: string;
    readonly to: string;
  };
  readonly performed: boolean;
}

export interface EpisodeLayoutMigrationCandidate {
  readonly episodeSlug: string;
  readonly relativePath: string;
  readonly repositoryRelativePath: string;
  readonly layout: EpisodeScriptLayout;
  readonly language?: LocaleCode;
  readonly variant?: ContentVariant;
  readonly rawSha256?: string;
  readonly normalizedSha256?: string;
  readonly canonicalRelativePath?: string;
  readonly canonicalRepositoryRelativePath?: string;
  readonly classification: EpisodeLayoutMigrationClassification;
  readonly reason: string;
  readonly move?: EpisodeLayoutMigrationMove;
}

export interface EpisodeLayoutMigrationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly episodesRoot: string;
  readonly normalizationPolicy: typeof episodeLayoutMigrationNormalizationPolicy;
  readonly excludedDirectoryNames: readonly string[];
  readonly summary: Record<EpisodeLayoutMigrationClassification, number>;
  readonly candidates: readonly EpisodeLayoutMigrationCandidate[];
}

export interface EpisodeLayoutMigrationOptions {
  readonly episodesRoot: string;
  readonly write?: boolean;
  readonly now?: Date;
}

const excludedDirectoryNames = [
  ".batch",
  ".tmp-video-build",
  "audio",
  "debug",
  "generated-assets",
  "images",
  "locales",
  "logs",
  "output",
  "renders",
  "state",
  "transcripts",
  "video",
] as const;

const classificationOrder: readonly EpisodeLayoutMigrationClassification[] = [
  "already_canonical",
  "safe_move",
  "identical_duplicate",
  "divergent_duplicate",
  "target_collision",
  "stale_unsupported_layout",
  "invalid_language_or_variant",
  "filesystem_error",
];

interface DiscoveredCandidate {
  readonly episodeSlug: string;
  readonly episodeRelativePath: string;
  readonly repositoryRelativePath: string;
  readonly absolutePath: string;
  readonly layout: EpisodeScriptLayout;
  readonly rawLanguage?: string;
  readonly rawVariant?: string;
  readonly language?: LocaleCode;
  readonly variant?: ContentVariant;
  readonly rawSha256?: string;
  readonly normalizedSha256?: string;
  readonly canonicalRelativePath?: string;
  readonly canonicalRepositoryRelativePath?: string;
  readonly errorMessage?: string;
}

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeEpisodeScriptContent(raw: Buffer): string {
  const text = raw.toString("utf8").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const trimmedLines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .trimEnd();
  return `${trimmedLines}\n`;
}

function portablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function canonicalEpisodeRelativePath(args: {
  readonly language: LocaleCode;
  readonly variant: ContentVariant;
}): string {
  return args.variant === "short"
    ? `languages/short/script-${args.language}.md`
    : `languages/script-${args.language}.md`;
}

function parseCandidateLayout(episodeRelativePath: string): {
  readonly layout: EpisodeScriptLayout;
  readonly rawLanguage?: string;
  readonly rawVariant?: string;
} | null {
  const parts = episodeRelativePath.split("/");
  if (episodeRelativePath === "script.md") {
    return { layout: "root_script", rawLanguage: "en", rawVariant: "full" };
  }
  const canonicalFull = /^languages\/script-([a-z0-9-]+)\.md$/iu.exec(
    episodeRelativePath
  );
  if (canonicalFull) {
    return {
      layout: "canonical_full",
      rawLanguage: canonicalFull[1]!,
      rawVariant: "full",
    };
  }
  const canonicalShort = /^languages\/short\/script-([a-z0-9-]+)\.md$/iu.exec(
    episodeRelativePath
  );
  if (canonicalShort) {
    return {
      layout: "canonical_short",
      rawLanguage: canonicalShort[1]!,
      rawVariant: "short",
    };
  }
  if (parts.length === 2 && parts[1] === "script.md") {
    return { layout: "language_script", rawLanguage: parts[0]!, rawVariant: "full" };
  }
  if (parts.length === 3 && parts[2] === "script.md") {
    return {
      layout: "language_variant_script",
      rawLanguage: parts[0]!,
      rawVariant: parts[1]!,
    };
  }
  const sourcePack = /^source\/.+-([a-z0-9-]+)-(full|short)\.md$/iu.exec(
    episodeRelativePath
  );
  if (sourcePack) {
    return {
      layout: "source_pack",
      rawLanguage: sourcePack[1]!,
      rawVariant: sourcePack[2]!,
    };
  }
  if (path.posix.basename(episodeRelativePath) === "script.md") {
    return { layout: "unsupported_script" };
  }
  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discoverEpisodeCandidates(args: {
  readonly episodesRoot: string;
  readonly episodeSlug: string;
}): Promise<DiscoveredCandidate[]> {
  const episodeRoot = path.join(args.episodesRoot, args.episodeSlug);
  const candidates: DiscoveredCandidate[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.includes(entry.name as (typeof excludedDirectoryNames)[number])) {
          await walk(absolutePath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const episodeRelativePath = portablePath(path.relative(episodeRoot, absolutePath));
      const layout = parseCandidateLayout(episodeRelativePath);
      if (!layout) {
        continue;
      }
      const repositoryRelativePath = portablePath(
        path.relative(path.dirname(args.episodesRoot), absolutePath)
      );
      candidates.push(
        await buildDiscoveredCandidate({
          absolutePath,
          episodeSlug: args.episodeSlug,
          episodeRelativePath,
          repositoryRelativePath,
          ...layout,
        })
      );
    }
  }

  await walk(episodeRoot);
  return candidates;
}

async function buildDiscoveredCandidate(args: {
  readonly absolutePath: string;
  readonly episodeSlug: string;
  readonly episodeRelativePath: string;
  readonly repositoryRelativePath: string;
  readonly layout: EpisodeScriptLayout;
  readonly rawLanguage?: string;
  readonly rawVariant?: string;
}): Promise<DiscoveredCandidate> {
  let language: LocaleCode | undefined;
  let variant: ContentVariant | undefined;
  let errorMessage: string | undefined;
  try {
    if (args.rawLanguage) {
      language = normalizeLocaleCode(args.rawLanguage);
    }
    if (args.rawVariant) {
      variant = normalizeContentVariant(args.rawVariant);
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  let rawSha256: string | undefined;
  let normalizedSha256: string | undefined;
  if (!errorMessage) {
    try {
      const raw = await fs.readFile(args.absolutePath);
      rawSha256 = sha256(raw);
      normalizedSha256 = sha256(normalizeEpisodeScriptContent(raw));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const canonicalRelativePath =
    language && variant
      ? `${args.episodeSlug}/${canonicalEpisodeRelativePath({ language, variant })}`
      : undefined;
  const canonicalRepositoryRelativePath = canonicalRelativePath
    ? `episodes/${canonicalRelativePath}`
    : undefined;

  return {
    episodeSlug: args.episodeSlug,
    episodeRelativePath: args.episodeRelativePath,
    repositoryRelativePath: args.repositoryRelativePath,
    absolutePath: args.absolutePath,
    layout: args.layout,
    ...(args.rawLanguage ? { rawLanguage: args.rawLanguage } : {}),
    ...(args.rawVariant ? { rawVariant: args.rawVariant } : {}),
    ...(language ? { language } : {}),
    ...(variant ? { variant } : {}),
    ...(rawSha256 ? { rawSha256 } : {}),
    ...(normalizedSha256 ? { normalizedSha256 } : {}),
    ...(canonicalRelativePath ? { canonicalRelativePath } : {}),
    ...(canonicalRepositoryRelativePath ? { canonicalRepositoryRelativePath } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function candidateToReport(
  candidate: DiscoveredCandidate,
  classification: EpisodeLayoutMigrationClassification,
  reason: string,
  move?: EpisodeLayoutMigrationMove
): EpisodeLayoutMigrationCandidate {
  return {
    episodeSlug: candidate.episodeSlug,
    relativePath: candidate.episodeRelativePath,
    repositoryRelativePath: candidate.repositoryRelativePath,
    layout: candidate.layout,
    ...(candidate.language ? { language: candidate.language } : {}),
    ...(candidate.variant ? { variant: candidate.variant } : {}),
    ...(candidate.rawSha256 ? { rawSha256: candidate.rawSha256 } : {}),
    ...(candidate.normalizedSha256
      ? { normalizedSha256: candidate.normalizedSha256 }
      : {}),
    ...(candidate.canonicalRelativePath
      ? { canonicalRelativePath: candidate.canonicalRelativePath }
      : {}),
    ...(candidate.canonicalRepositoryRelativePath
      ? { canonicalRepositoryRelativePath: candidate.canonicalRepositoryRelativePath }
      : {}),
    classification,
    reason,
    ...(move ? { move } : {}),
  };
}

function preferredMoveSource(candidates: readonly DiscoveredCandidate[]): DiscoveredCandidate {
  const sourcePack = candidates.find((candidate) => candidate.layout === "source_pack");
  return sourcePack ?? [...candidates].sort((left, right) => left.episodeRelativePath.localeCompare(right.episodeRelativePath))[0]!;
}

async function classifyTargetGroup(args: {
  readonly episodesRoot: string;
  readonly write: boolean;
  readonly candidates: readonly DiscoveredCandidate[];
}): Promise<EpisodeLayoutMigrationCandidate[]> {
  const canonical = args.candidates.find(
    (candidate) =>
      candidate.canonicalRelativePath !== undefined &&
      candidate.episodeRelativePath ===
        candidate.canonicalRelativePath.slice(candidate.episodeSlug.length + 1)
  );
  const canonicalRelativePath = args.candidates[0]?.canonicalRelativePath;
  if (!canonicalRelativePath) {
    return args.candidates.map((candidate) =>
      candidateToReport(
        candidate,
        "stale_unsupported_layout",
        "Candidate has no canonical target."
      )
    );
  }
  const canonicalAbsolutePath = path.join(args.episodesRoot, canonicalRelativePath);
  const targetExists = await pathExists(canonicalAbsolutePath);
  const uniqueNormalizedHashes = new Set(
    args.candidates.map((candidate) => candidate.normalizedSha256).filter(Boolean)
  );

  if (canonical) {
    return args.candidates.map((candidate) => {
      if (candidate === canonical) {
        return candidateToReport(
          candidate,
          "already_canonical",
          args.candidates.length === 1
            ? "Canonical authored script is already in place."
            : "Canonical authored script exists with duplicate candidates."
        );
      }
      return candidateToReport(
        candidate,
        candidate.normalizedSha256 === canonical.normalizedSha256
          ? "identical_duplicate"
          : "divergent_duplicate",
        candidate.normalizedSha256 === canonical.normalizedSha256
          ? "Duplicate content matches the canonical authored script after normalization."
          : "Duplicate content diverges from the canonical authored script."
      );
    });
  }

  if (targetExists) {
    return args.candidates.map((candidate) =>
      candidateToReport(
        candidate,
        "target_collision",
        "Canonical target exists but was not discovered as the matching candidate."
      )
    );
  }

  if (uniqueNormalizedHashes.size > 1) {
    return args.candidates.map((candidate) =>
      candidateToReport(
        candidate,
        "divergent_duplicate",
        "Multiple noncanonical candidates for the same target have divergent normalized content."
      )
    );
  }

  const moveSource = preferredMoveSource(args.candidates);
  const move = buildMove({
    source: moveSource.absolutePath,
    target: canonicalAbsolutePath,
    performed: false,
  });
  let performedMove = move;
  if (args.write) {
    await ensureDir(path.dirname(canonicalAbsolutePath));
    await fs.rename(moveSource.absolutePath, canonicalAbsolutePath);
    performedMove = buildMove({
      source: moveSource.absolutePath,
      target: canonicalAbsolutePath,
      performed: true,
    });
  }

  return args.candidates.map((candidate) =>
    candidateToReport(
      candidate,
      candidate === moveSource ? "safe_move" : "identical_duplicate",
      candidate === moveSource
        ? "Single mechanically safe source selected for canonical move."
        : "Duplicate content matches the selected move source after normalization.",
      candidate === moveSource ? performedMove : undefined
    )
  );
}

function buildMove(args: {
  readonly source: string;
  readonly target: string;
  readonly performed: boolean;
}): EpisodeLayoutMigrationMove {
  return {
    from: args.source,
    to: args.target,
    rollback: {
      command: `mv ${JSON.stringify(args.target)} ${JSON.stringify(args.source)}`,
      from: args.target,
      to: args.source,
    },
    performed: args.performed,
  };
}

function emptySummary(): Record<EpisodeLayoutMigrationClassification, number> {
  return Object.fromEntries(
    classificationOrder.map((classification) => [classification, 0])
  ) as Record<EpisodeLayoutMigrationClassification, number>;
}

export async function planEpisodeLayoutMigration(
  options: EpisodeLayoutMigrationOptions
): Promise<EpisodeLayoutMigrationReport> {
  const episodesRoot = path.resolve(options.episodesRoot);
  const reportCandidates: EpisodeLayoutMigrationCandidate[] = [];
  const episodeEntries = await fs.readdir(episodesRoot, { withFileTypes: true });
  const episodeDirs = episodeEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const episodeDir of episodeDirs) {
    let episodeSlug: string;
    try {
      episodeSlug = normalizeEpisodeId(episodeDir);
    } catch {
      continue;
    }
    try {
      const discovered = await discoverEpisodeCandidates({
        episodesRoot,
        episodeSlug,
      });
      const invalid = discovered.filter(
        (candidate) => candidate.errorMessage || !candidate.language || !candidate.variant
      );
      for (const candidate of invalid) {
        reportCandidates.push(
          candidateToReport(
            candidate,
            candidate.errorMessage || candidate.rawSha256 || candidate.normalizedSha256
              ? "invalid_language_or_variant"
              : "filesystem_error",
            candidate.errorMessage ?? "Candidate is missing language or variant metadata."
          )
        );
      }
      const valid = discovered.filter(
        (candidate) => !invalid.includes(candidate) && candidate.canonicalRelativePath
      );
      const groups = new Map<string, DiscoveredCandidate[]>();
      for (const candidate of valid) {
        const key = candidate.canonicalRelativePath!;
        const current = groups.get(key) ?? [];
        current.push(candidate);
        groups.set(key, current);
      }
      for (const candidates of groups.values()) {
        reportCandidates.push(
          ...(await classifyTargetGroup({
            episodesRoot,
            write: options.write ?? false,
            candidates,
          }))
        );
      }
    } catch (error) {
      reportCandidates.push({
        episodeSlug,
        relativePath: ".",
        repositoryRelativePath: portablePath(path.relative(path.dirname(episodesRoot), path.join(episodesRoot, episodeSlug))),
        layout: "unsupported_script",
        classification: "filesystem_error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  reportCandidates.sort((left, right) =>
    left.repositoryRelativePath.localeCompare(right.repositoryRelativePath)
  );
  const summary = emptySummary();
  for (const candidate of reportCandidates) {
    summary[candidate.classification] += 1;
  }

  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    dryRun: !(options.write ?? false),
    write: options.write ?? false,
    episodesRoot,
    normalizationPolicy: episodeLayoutMigrationNormalizationPolicy,
    excludedDirectoryNames,
    summary,
    candidates: reportCandidates,
  };
}

export function formatEpisodeLayoutMigrationReport(
  report: EpisodeLayoutMigrationReport
): string {
  const lines = [
    `Episode layout migration ${report.dryRun ? "dry-run" : "write"} report`,
    `Episodes root: ${report.episodesRoot}`,
    `Normalization: ${report.normalizationPolicy}`,
    "Summary:",
    ...classificationOrder.map(
      (classification) => `- ${classification}: ${report.summary[classification]}`
    ),
    "Candidates:",
    ...report.candidates.map((candidate) => {
      const target = candidate.canonicalRepositoryRelativePath
        ? ` -> ${candidate.canonicalRepositoryRelativePath}`
        : "";
      const move = candidate.move
        ? ` move=${candidate.move.performed ? "performed" : "planned"}`
        : "";
      return `- ${candidate.classification}: ${candidate.repositoryRelativePath}${target}${move}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

export function registerEpisodeLayoutMigrationCommand(episodeCommand: Command): void {
  episodeCommand
    .command("migrate-layout")
    .description("Inventory and safely migrate authored episode script layouts")
    .option("--episodes-root <path>", "episodes root", "episodes")
    .option("--dry-run", "plan only without writing files", true)
    .option("--write", "perform only mechanically safe non-overwriting moves")
    .option("--json", "emit JSON report")
    .action(
      async (opts: {
        readonly episodesRoot: string;
        readonly dryRun?: boolean;
        readonly write?: boolean;
        readonly json?: boolean;
      }, command: Command) => {
        const optsWithGlobals = command.optsWithGlobals() as {
          readonly json?: boolean;
        };
        const report = await planEpisodeLayoutMigration({
          episodesRoot: opts.episodesRoot,
          write: opts.write === true,
        });
        if (opts.json ?? optsWithGlobals.json) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return;
        }
        process.stdout.write(formatEpisodeLayoutMigrationReport(report));
      }
    );
}
