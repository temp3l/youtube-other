import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  artifactManifestSchema,
  artifactRefSchema,
  contentProfileIdSchema,
  type ArtifactRef,
  type ContentProfileId,
} from "@mediaforge/domain";
import {
  ARTIFACT_PATH_RESOLVER_VERSION,
  LEGACY_ARTIFACT_LAYOUT_VERSION,
  assertContainedRegularFile,
  assertContainedWritablePath,
  hashFile,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveArtifactPathSet,
  type ContentVariant,
  type LegacyArtifactProvenance,
  type LocaleCode,
  type ResolvedLegacyArtifactCandidate,
} from "@mediaforge/shared";
import {
  ArtifactRepository,
  ArtifactRepositoryError,
} from "@mediaforge/workflow-engine";
import { Command } from "commander";

export const EPISODE_LAYOUT_MIGRATION_VERSION =
  "mediaforge.episode-layout-migration.v2" as const;
export const episodeLayoutMigrationNormalizationPolicy =
  "utf8-strip-bom,crlf-to-lf,trim-trailing-line-whitespace,trim-final-whitespace,append-single-lf";

export type EpisodeLayoutMigrationOperation =
  | "copy"
  | "write-manifest"
  | "skip"
  | "block";

export type EpisodeLayoutMigrationClassification =
  | "canonical_verified"
  | "canonical_manifest_missing"
  | "legacy_copy"
  | "equivalent_legacy"
  | "ambiguous_candidates"
  | "target_conflict"
  | "compatibility_only"
  | "invalid_language_or_variant"
  | "stale_unsupported_layout"
  | "filesystem_error";

export type EpisodeScriptLayout =
  | "canonical_full"
  | "canonical_short"
  | "root_script"
  | "language_script"
  | "language_variant_script"
  | "locale_runtime_script"
  | "source_pack"
  | "unsupported_script";

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
  readonly source: "canonical" | "legacy" | "unsupported";
  readonly legacyLayoutVersion?: typeof LEGACY_ARTIFACT_LAYOUT_VERSION;
  readonly legacyProvenance?: LegacyArtifactProvenance;
  readonly readOnly?: true;
  readonly classification: EpisodeLayoutMigrationClassification;
  readonly reason: string;
}

export interface EpisodeLayoutMigrationSource {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly rawSha256: string;
  readonly normalizedSha256: string;
  readonly source: "canonical" | "legacy";
  readonly legacyLayoutVersion?: typeof LEGACY_ARTIFACT_LAYOUT_VERSION;
  readonly legacyProvenance?: LegacyArtifactProvenance;
  readonly readOnly?: true;
}

export interface EpisodeLayoutRollbackMetadata {
  readonly schemaVersion: typeof EPISODE_LAYOUT_MIGRATION_VERSION;
  readonly planId: string;
  readonly source: EpisodeLayoutMigrationSource;
  readonly canonicalArtifactPath: string;
  readonly canonicalManifestPath: string;
  readonly rollback:
    | "delete-canonical-artifact-and-manifest"
    | "delete-canonical-manifest";
  readonly preconditions: {
    readonly canonicalSha256: string;
    readonly sourceMustRemainReadOnly: true;
  };
  readonly recordedAt: string;
}

export interface EpisodeLayoutMigrationPlan {
  readonly id: string;
  readonly ref: ArtifactRef;
  readonly operation: EpisodeLayoutMigrationOperation;
  readonly classification: EpisodeLayoutMigrationClassification;
  readonly reason: string;
  readonly source: EpisodeLayoutMigrationSource | null;
  readonly destination: {
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly manifestPath: string;
    readonly expectedState:
      | "absent"
      | "canonical-unmanifested"
      | "verified"
      | "conflict";
  };
  readonly candidatePaths: readonly string[];
  readonly performed: boolean;
  readonly rollbackMetadataPath?: string;
}

export interface EpisodeLayoutMigrationReport {
  readonly schemaVersion: typeof EPISODE_LAYOUT_MIGRATION_VERSION;
  readonly resolverVersion: typeof ARTIFACT_PATH_RESOLVER_VERSION;
  readonly migrationId: string;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly episodesRoot: string;
  readonly profileId: ContentProfileId;
  readonly normalizationPolicy: typeof episodeLayoutMigrationNormalizationPolicy;
  readonly excludedDirectoryNames: readonly string[];
  readonly summary: Record<EpisodeLayoutMigrationOperation, number>;
  readonly plans: readonly EpisodeLayoutMigrationPlan[];
  readonly candidates: readonly EpisodeLayoutMigrationCandidate[];
}

export interface EpisodeLayoutMigrationOptions {
  readonly episodesRoot: string;
  readonly profileId?: ContentProfileId | "strategic-reinvention";
  readonly write?: boolean;
  readonly confirmationMigrationId?: string;
  readonly confirmed?: boolean;
  readonly now?: Date;
}

const excludedDirectoryNames = [
  ".batch",
  ".tmp-video-build",
  "audio",
  "debug",
  "generated-assets",
  "images",
  "logs",
  "output",
  "renders",
  "state",
  "transcripts",
  "video",
] as const;

const migrationRevisions = {
  artifact: "legacy-layout-import-v1",
  workflow: EPISODE_LAYOUT_MIGRATION_VERSION,
  policy: "canonical-episode-layout-v2",
  producerTask: "artifact.layout-migration",
  validator: "artifact.layout-migration",
} as const;

interface DiscoveredCandidate {
  readonly episodeSlug: string;
  readonly episodeRelativePath: string;
  readonly repositoryRelativePath: string;
  readonly absolutePath: string;
  readonly layout: EpisodeScriptLayout;
  readonly language?: LocaleCode;
  readonly variant?: ContentVariant;
  readonly rawSha256?: string;
  readonly normalizedSha256?: string;
  readonly ref?: ArtifactRef;
  readonly source: "canonical" | "legacy" | "unsupported";
  readonly legacyCandidate?: ResolvedLegacyArtifactCandidate;
  readonly errorMessage?: string;
}

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeEpisodeScriptContent(raw: Buffer): string {
  const text = raw
    .toString("utf8")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n");
  const trimmedLines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .trimEnd();
  return `${trimmedLines}\n`;
}

function validateScriptContent(content: Buffer): void {
  if (normalizeEpisodeScriptContent(content).trim().length === 0) {
    throw new Error("Episode script is empty after normalization.");
  }
}

function portablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function candidateLayout(
  layout: EpisodeScriptLayout,
  rawLanguage?: string,
  rawVariant?: string
): {
  readonly layout: EpisodeScriptLayout;
  readonly rawLanguage?: string;
  readonly rawVariant?: string;
} {
  return {
    layout,
    ...(rawLanguage !== undefined ? { rawLanguage } : {}),
    ...(rawVariant !== undefined ? { rawVariant } : {}),
  };
}

function parseCandidateLayout(
  episodeSlug: string,
  episodeRelativePath: string
): {
  readonly layout: EpisodeScriptLayout;
  readonly rawLanguage?: string;
  readonly rawVariant?: string;
} | null {
  const parts = episodeRelativePath.split("/");
  if (episodeRelativePath === "script.md") {
    return candidateLayout("root_script", "en", "full");
  }
  const canonicalFull = /^languages\/script-([a-z0-9-]+)\.md$/iu.exec(
    episodeRelativePath
  );
  if (canonicalFull) {
    return candidateLayout("canonical_full", canonicalFull[1], "full");
  }
  const canonicalShort = /^languages\/short\/script-([a-z0-9-]+)\.md$/iu.exec(
    episodeRelativePath
  );
  if (canonicalShort) {
    return candidateLayout("canonical_short", canonicalShort[1], "short");
  }
  if (parts.length === 2 && parts[1] === "script.md") {
    return candidateLayout("language_script", parts[0], "full");
  }
  if (parts.length === 3 && parts[2] === "script.md") {
    return candidateLayout("language_variant_script", parts[0], parts[1]);
  }
  if (
    parts.length === 4 &&
    parts[0] === "locales" &&
    parts[3] === "script.md"
  ) {
    return candidateLayout("locale_runtime_script", parts[1], parts[2]);
  }
  const escapedEpisode = episodeSlug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const sourcePack = new RegExp(
    `^source/${escapedEpisode}-([a-z0-9-]+)-(full|short)\\.md$`,
    "iu"
  ).exec(episodeRelativePath);
  if (sourcePack) {
    return candidateLayout("source_pack", sourcePack[1], sourcePack[2]);
  }
  if (path.posix.basename(episodeRelativePath) === "script.md") {
    return candidateLayout("unsupported_script");
  }
  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function buildScriptRef(args: {
  readonly episodeSlug: string;
  readonly profileId: ContentProfileId;
  readonly language: LocaleCode;
  readonly variant: ContentVariant;
}): ArtifactRef {
  return artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: args.episodeSlug,
    profileId: args.profileId,
    locale: args.language,
    variant: args.variant,
    kind: args.variant === "short" ? "short-script" : "full-script",
    format: "md",
    artifactRevision: migrationRevisions.artifact,
    workflowRevision: migrationRevisions.workflow,
    policyRevision: migrationRevisions.policy,
  });
}

async function discoverEpisodeCandidates(args: {
  readonly episodesRoot: string;
  readonly episodeSlug: string;
  readonly profileId: ContentProfileId;
}): Promise<DiscoveredCandidate[]> {
  const episodeRoot = path.join(args.episodesRoot, args.episodeSlug);
  const candidates: DiscoveredCandidate[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const relativePath = portablePath(
          path.relative(episodeRoot, absolutePath)
        );
        if (path.posix.basename(relativePath) === "script.md") {
          candidates.push({
            episodeSlug: args.episodeSlug,
            episodeRelativePath: relativePath,
            repositoryRelativePath: portablePath(
              path.relative(path.dirname(args.episodesRoot), absolutePath)
            ),
            absolutePath,
            layout: "unsupported_script",
            source: "unsupported",
            errorMessage: "Symbolic links are not valid migration candidates.",
          });
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (
          !excludedDirectoryNames.includes(
            entry.name as (typeof excludedDirectoryNames)[number]
          )
        ) {
          await walk(absolutePath);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const episodeRelativePath = portablePath(
        path.relative(episodeRoot, absolutePath)
      );
      const parsed = parseCandidateLayout(
        args.episodeSlug,
        episodeRelativePath
      );
      if (!parsed) continue;
      const base = {
        episodeSlug: args.episodeSlug,
        episodeRelativePath,
        repositoryRelativePath: portablePath(
          path.relative(path.dirname(args.episodesRoot), absolutePath)
        ),
        absolutePath,
        layout: parsed.layout,
      } as const;
      if (!parsed.rawLanguage || !parsed.rawVariant) {
        candidates.push({
          ...base,
          source: "unsupported",
          errorMessage:
            "Script layout does not declare a language and variant.",
        });
        continue;
      }
      try {
        const language = normalizeLocaleCode(parsed.rawLanguage);
        const variant = normalizeContentVariant(parsed.rawVariant);
        const ref = buildScriptRef({
          episodeSlug: args.episodeSlug,
          profileId: args.profileId,
          language,
          variant,
        });
        const resolved = resolveArtifactPathSet({
          workspaceRoot: args.episodesRoot,
          ref,
        });
        const legacyCandidate = resolved.legacyCandidates.find(
          (candidate) => candidate.relativePath === episodeRelativePath
        );
        const source =
          resolved.canonicalRelativePath === episodeRelativePath
            ? "canonical"
            : legacyCandidate
              ? "legacy"
              : "unsupported";
        const raw = await fs.readFile(
          await assertContainedRegularFile(episodeRoot, absolutePath)
        );
        validateScriptContent(raw);
        candidates.push({
          ...base,
          language,
          variant,
          rawSha256: sha256(raw),
          normalizedSha256: sha256(normalizeEpisodeScriptContent(raw)),
          ref,
          source,
          ...(legacyCandidate ? { legacyCandidate } : {}),
          ...(source === "unsupported"
            ? {
                errorMessage:
                  "Path is not declared by the typed artifact resolver.",
              }
            : {}),
        });
      } catch (error) {
        candidates.push({
          ...base,
          source: "unsupported",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await walk(episodeRoot);
  return candidates;
}

function toSource(
  candidate: DiscoveredCandidate
): EpisodeLayoutMigrationSource {
  if (
    !candidate.rawSha256 ||
    !candidate.normalizedSha256 ||
    candidate.source === "unsupported"
  ) {
    throw new Error(
      "Cannot create a migration source from an invalid candidate."
    );
  }
  return {
    absolutePath: candidate.absolutePath,
    relativePath: candidate.episodeRelativePath,
    rawSha256: candidate.rawSha256,
    normalizedSha256: candidate.normalizedSha256,
    source: candidate.source,
    ...(candidate.legacyCandidate
      ? {
          legacyLayoutVersion: candidate.legacyCandidate.layoutVersion,
          legacyProvenance: candidate.legacyCandidate.provenance,
          readOnly: true as const,
        }
      : {}),
  };
}

function planId(value: unknown): string {
  return `episode-layout-${sha256(stableJson(value)).slice(0, 24)}`;
}

function selectLegacySource(
  candidates: readonly DiscoveredCandidate[]
): DiscoveredCandidate | undefined {
  const priority: readonly LegacyArtifactProvenance[] = [
    "source-lineage",
    "authored-language-compatibility",
    "authored-root-compatibility",
  ];
  return candidates
    .filter(
      (candidate) =>
        candidate.legacyCandidate !== undefined &&
        priority.includes(candidate.legacyCandidate.provenance)
    )
    .sort((left, right) => {
      const leftPriority = priority.indexOf(
        left.legacyCandidate?.provenance ?? "generated-locale-runtime"
      );
      const rightPriority = priority.indexOf(
        right.legacyCandidate?.provenance ?? "generated-locale-runtime"
      );
      return (
        leftPriority - rightPriority ||
        left.episodeRelativePath.localeCompare(right.episodeRelativePath)
      );
    })[0];
}

async function inspectCanonicalManifest(args: {
  readonly repository: ArtifactRepository;
  readonly manifestPath: string;
}): Promise<"missing" | "verified" | "conflict"> {
  if (!(await pathExists(args.manifestPath))) return "missing";
  try {
    const manifest = artifactManifestSchema.parse(
      JSON.parse(await fs.readFile(args.manifestPath, "utf8")) as unknown
    );
    const manifestPaths = args.repository.resolve(manifest.ref);
    if (manifestPaths.canonicalManifest !== args.manifestPath) {
      return "conflict";
    }
    await args.repository.verify(manifest.ref);
    return "verified";
  } catch {
    return "conflict";
  }
}

async function buildGroupPlan(args: {
  readonly repository: ArtifactRepository;
  readonly ref: ArtifactRef;
  readonly candidates: readonly DiscoveredCandidate[];
}): Promise<EpisodeLayoutMigrationPlan> {
  const resolved = args.repository.resolve(args.ref);
  const canonical = args.candidates.find(
    (candidate) => candidate.source === "canonical"
  );
  const legacy = args.candidates.filter(
    (candidate) => candidate.source === "legacy"
  );
  const uniqueHashes = new Set(
    args.candidates
      .map((candidate) => candidate.normalizedSha256)
      .filter((hash): hash is string => Boolean(hash))
  );
  let operation: EpisodeLayoutMigrationOperation;
  let classification: EpisodeLayoutMigrationClassification;
  let reason: string;
  let source: EpisodeLayoutMigrationSource | null = null;
  let expectedState: EpisodeLayoutMigrationPlan["destination"]["expectedState"];

  if (uniqueHashes.size > 1) {
    operation = "block";
    classification = "ambiguous_candidates";
    reason =
      "Canonical and compatibility candidates have different normalized hashes.";
    expectedState = canonical ? "conflict" : "absent";
  } else if (canonical) {
    source = toSource(canonical);
    const manifestState = await inspectCanonicalManifest({
      repository: args.repository,
      manifestPath: resolved.canonicalManifest,
    });
    if (manifestState === "verified") {
      operation = "skip";
      classification = "canonical_verified";
      reason = "Canonical artifact and manifest verify successfully.";
      expectedState = "verified";
    } else if (manifestState === "missing") {
      operation = "write-manifest";
      classification = "canonical_manifest_missing";
      reason =
        "Canonical artifact exists without a manifest; migration will atomically adopt it.";
      expectedState = "canonical-unmanifested";
    } else {
      operation = "block";
      classification = "target_conflict";
      reason =
        "Canonical manifest exists but does not validate for the resolver-selected artifact.";
      expectedState = "conflict";
    }
  } else if (await pathExists(resolved.canonical)) {
    operation = "block";
    classification = "target_conflict";
    reason =
      "Resolver-selected canonical destination exists but is not a regular discovered script.";
    expectedState = "conflict";
  } else if (await pathExists(resolved.canonicalManifest)) {
    operation = "block";
    classification = "target_conflict";
    reason = "Canonical manifest exists without its canonical artifact.";
    expectedState = "conflict";
  } else {
    const selected = selectLegacySource(legacy);
    if (!selected) {
      operation = "block";
      classification = "compatibility_only";
      reason =
        "Only generated runtime compatibility candidates exist; authored source classification is required before migration.";
      expectedState = "absent";
    } else {
      source = toSource(selected);
      operation = "copy";
      classification = "legacy_copy";
      reason =
        "A single hash-equivalent resolver-declared legacy source will be copied; the source remains read-only.";
      expectedState = "absent";
    }
  }

  const identity = {
    ref: args.ref,
    operation,
    classification,
    source,
    destination: resolved.canonicalRelativePath,
    candidatePaths: args.candidates.map(
      (candidate) => candidate.episodeRelativePath
    ),
  };
  return {
    id: planId(identity),
    ref: args.ref,
    operation,
    classification,
    reason,
    source,
    destination: {
      absolutePath: resolved.canonical,
      relativePath: resolved.canonicalRelativePath,
      manifestPath: resolved.canonicalManifest,
      expectedState,
    },
    candidatePaths: identity.candidatePaths,
    performed: false,
  };
}

function candidateReport(
  candidate: DiscoveredCandidate,
  plan?: EpisodeLayoutMigrationPlan
): EpisodeLayoutMigrationCandidate {
  const classification = candidate.errorMessage
    ? /language|variant/iu.test(candidate.errorMessage)
      ? "invalid_language_or_variant"
      : candidate.source === "unsupported"
        ? "stale_unsupported_layout"
        : "filesystem_error"
    : candidate.source === "legacy" &&
        plan &&
        plan.operation !== "block" &&
        plan.source?.absolutePath !== candidate.absolutePath
      ? "equivalent_legacy"
      : (plan?.classification ?? "stale_unsupported_layout");
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
    ...(plan
      ? {
          canonicalRelativePath: plan.destination.relativePath,
          canonicalRepositoryRelativePath: `episodes/${candidate.episodeSlug}/${plan.destination.relativePath}`,
        }
      : {}),
    source: candidate.source,
    ...(candidate.legacyCandidate
      ? {
          legacyLayoutVersion: candidate.legacyCandidate.layoutVersion,
          legacyProvenance: candidate.legacyCandidate.provenance,
          readOnly: true as const,
        }
      : {}),
    classification,
    reason: candidate.errorMessage ?? plan?.reason ?? "Unsupported candidate.",
  };
}

async function writeJsonAtomicNoReplace(
  filePath: string,
  value: unknown
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.link(temporary, filePath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function applyPlan(args: {
  readonly repository: ArtifactRepository;
  readonly plan: EpisodeLayoutMigrationPlan;
  readonly now: Date;
}): Promise<EpisodeLayoutMigrationPlan> {
  if (args.plan.operation === "skip" || args.plan.operation === "block") {
    return args.plan;
  }
  if (!args.plan.source) throw new Error("Writable plan has no source.");
  const resolved = args.repository.resolve(args.plan.ref);
  const content = await fs.readFile(
    await assertContainedRegularFile(
      resolved.unitRoot,
      args.plan.source.absolutePath
    )
  );
  validateScriptContent(content);
  if (sha256(content) !== args.plan.source.rawSha256) {
    throw new ArtifactRepositoryError(
      "MIGRATION_PLAN_STALE",
      `Migration source changed for ${args.plan.id}.`
    );
  }
  const rollbackMetadataPath = path.join(
    resolved.unitRoot,
    "state",
    "artifact-migrations",
    `${args.plan.id}.rollback.json`
  );
  const rollback: EpisodeLayoutRollbackMetadata = {
    schemaVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
    planId: args.plan.id,
    source: args.plan.source,
    canonicalArtifactPath: resolved.canonical,
    canonicalManifestPath: resolved.canonicalManifest,
    rollback:
      args.plan.operation === "copy"
        ? "delete-canonical-artifact-and-manifest"
        : "delete-canonical-manifest",
    preconditions: {
      canonicalSha256: args.plan.source.rawSha256,
      sourceMustRemainReadOnly: true,
    },
    recordedAt: args.now.toISOString(),
  };
  await assertContainedWritablePath(
    path.dirname(resolved.unitRoot),
    rollbackMetadataPath
  );
  await writeJsonAtomicNoReplace(rollbackMetadataPath, rollback);
  try {
    if (args.plan.operation === "copy") {
      if (
        (await hashFile(args.plan.source.absolutePath)) !==
        args.plan.source.rawSha256
      ) {
        throw new ArtifactRepositoryError(
          "MIGRATION_PLAN_STALE",
          `Migration source changed immediately before promotion for ${args.plan.id}.`
        );
      }
      const result = await args.repository.promote({
        ref: args.plan.ref,
        content,
        mediaType: "text/markdown",
        producerTaskId: migrationRevisions.producerTask,
        producerTaskVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
        producerAttemptId: args.plan.id,
        validatorId: migrationRevisions.validator,
        validatorVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
        dependencyFingerprints: [args.plan.source.rawSha256],
        validate: validateScriptContent,
      });
      if (result.dryRun) throw new Error("Migration promotion was a dry-run.");
    } else {
      await args.repository.adoptCanonical({
        ref: args.plan.ref,
        expectedChecksumSha256: args.plan.source.rawSha256,
        mediaType: "text/markdown",
        producerTaskId: migrationRevisions.producerTask,
        producerTaskVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
        producerAttemptId: args.plan.id,
        validatorId: migrationRevisions.validator,
        validatorVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
        dependencyFingerprints: [args.plan.source.rawSha256],
        validate: validateScriptContent,
      });
    }
  } catch (error) {
    if (!(await pathExists(resolved.canonicalManifest))) {
      await fs.unlink(rollbackMetadataPath).catch(() => undefined);
    }
    throw error;
  }
  return { ...args.plan, performed: true, rollbackMetadataPath };
}

async function buildReport(
  options: EpisodeLayoutMigrationOptions
): Promise<EpisodeLayoutMigrationReport> {
  const episodesRoot = path.resolve(options.episodesRoot);
  const profileId = contentProfileIdSchema.parse(
    options.profileId ?? "dark-truth"
  );
  if (profileId !== "dark-truth" && profileId !== "veronicabenini") {
    throw new Error("Episode layout migration supports episode profiles only.");
  }
  const repository = new ArtifactRepository({
    workspaceRoot: episodesRoot,
    now: () => options.now ?? new Date(),
  });
  const discovered: DiscoveredCandidate[] = [];
  const episodeEntries = await fs.readdir(episodesRoot, {
    withFileTypes: true,
  });
  for (const entry of episodeEntries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    let episodeSlug: string;
    try {
      episodeSlug = normalizeEpisodeId(entry.name);
    } catch {
      continue;
    }
    try {
      discovered.push(
        ...(await discoverEpisodeCandidates({
          episodesRoot,
          episodeSlug,
          profileId,
        }))
      );
    } catch (error) {
      discovered.push({
        episodeSlug,
        episodeRelativePath: ".",
        repositoryRelativePath: `episodes/${episodeSlug}`,
        absolutePath: path.join(episodesRoot, episodeSlug),
        layout: "unsupported_script",
        source: "unsupported",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const groups = new Map<string, DiscoveredCandidate[]>();
  for (const candidate of discovered.filter(
    (item): item is DiscoveredCandidate & { ref: ArtifactRef } =>
      Boolean(item.ref) && item.source !== "unsupported"
  )) {
    const key = stableJson(candidate.ref);
    const current = groups.get(key) ?? [];
    current.push(candidate);
    groups.set(key, current);
  }
  let plans: EpisodeLayoutMigrationPlan[] = [];
  for (const candidates of groups.values()) {
    const first = candidates[0];
    if (!first?.ref) continue;
    plans.push(
      await buildGroupPlan({ repository, ref: first.ref, candidates })
    );
  }
  plans.sort((left, right) =>
    left.destination.absolutePath.localeCompare(right.destination.absolutePath)
  );
  const unsupportedEvidence = discovered
    .filter((candidate) => candidate.source === "unsupported")
    .map((candidate) => ({
      path: candidate.repositoryRelativePath,
      rawSha256: candidate.rawSha256 ?? null,
      error: candidate.errorMessage ?? null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const migrationId = `episode-layout-migration-${sha256(
    stableJson({ plans, unsupportedEvidence })
  ).slice(0, 24)}`;
  if (options.write) {
    const blockedPlans = plans.filter((plan) => plan.operation === "block");
    if (blockedPlans.length > 0 || unsupportedEvidence.length > 0) {
      throw new ArtifactRepositoryError(
        "ARTIFACT_CONFLICT",
        "Migration contains blocked or unsupported candidates; resolve every ambiguity and conflict before writing.",
        {
          blockedPlanIds: blockedPlans.map((plan) => plan.id),
          unsupportedCandidates: unsupportedEvidence.map(
            (candidate) => candidate.path
          ),
        }
      );
    }
    if (
      options.confirmed !== true ||
      options.confirmationMigrationId !== migrationId
    ) {
      throw new ArtifactRepositoryError(
        "MIGRATION_CONFIRMATION_REQUIRED",
        "Write mode requires --yes and the exact current --confirm migration ID.",
        { migrationId }
      );
    }
    const applied: EpisodeLayoutMigrationPlan[] = [];
    for (const plan of plans) {
      applied.push(
        await applyPlan({
          repository,
          plan,
          now: options.now ?? new Date(),
        })
      );
    }
    plans = applied;
  }
  const planByRef = new Map(plans.map((plan) => [stableJson(plan.ref), plan]));
  const candidates = discovered
    .map((candidate) =>
      candidateReport(
        candidate,
        candidate.ref ? planByRef.get(stableJson(candidate.ref)) : undefined
      )
    )
    .sort((left, right) =>
      left.repositoryRelativePath.localeCompare(right.repositoryRelativePath)
    );
  const summary: Record<EpisodeLayoutMigrationOperation, number> = {
    copy: 0,
    "write-manifest": 0,
    skip: 0,
    block: 0,
  };
  for (const plan of plans) summary[plan.operation] += 1;
  return {
    schemaVersion: EPISODE_LAYOUT_MIGRATION_VERSION,
    resolverVersion: ARTIFACT_PATH_RESOLVER_VERSION,
    migrationId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    dryRun: !options.write,
    write: options.write ?? false,
    episodesRoot,
    profileId,
    normalizationPolicy: episodeLayoutMigrationNormalizationPolicy,
    excludedDirectoryNames,
    summary,
    plans,
    candidates,
  };
}

export async function planEpisodeLayoutMigration(
  options: EpisodeLayoutMigrationOptions
): Promise<EpisodeLayoutMigrationReport> {
  return buildReport(options);
}

export function formatEpisodeLayoutMigrationReport(
  report: EpisodeLayoutMigrationReport
): string {
  const lines = [
    `Episode layout migration ${report.dryRun ? "dry-run" : "write"} report`,
    `Migration ID: ${report.migrationId}`,
    `Episodes root: ${report.episodesRoot}`,
    `Profile: ${report.profileId}`,
    `Resolver: ${report.resolverVersion}`,
    `Normalization: ${report.normalizationPolicy}`,
    "Summary:",
    `- copy: ${report.summary.copy}`,
    `- write-manifest: ${report.summary["write-manifest"]}`,
    `- skip: ${report.summary.skip}`,
    `- block: ${report.summary.block}`,
    "Plans:",
    ...report.plans.map(
      (plan) =>
        `- ${plan.operation}: ${plan.source?.relativePath ?? "none"} -> ${plan.destination.relativePath}${plan.performed ? " performed" : ""}`
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function registerEpisodeLayoutMigrationCommand(
  episodeCommand: Command
): void {
  episodeCommand
    .command("migrate-layout")
    .description(
      "Inventory and migrate resolver-declared episode scripts to canonical manifested paths"
    )
    .option("--episodes-root <path>", "episodes root", "episodes")
    .option(
      "--profile <id>",
      "episode content profile (dark-truth or veronicabenini)",
      "dark-truth"
    )
    .option("--dry-run", "plan only without writing files", true)
    .option("--write", "apply the exact hash-bound migration plan")
    .option("--confirm <migration-id>", "exact dry-run migration ID")
    .option("--yes", "confirm canonical writes")
    .option("--json", "emit JSON report")
    .action(
      async (
        opts: {
          readonly episodesRoot: string;
          readonly profile: ContentProfileId | "strategic-reinvention";
          readonly write?: boolean;
          readonly confirm?: string;
          readonly yes?: boolean;
          readonly json?: boolean;
        },
        command: Command
      ) => {
        const optsWithGlobals = command.optsWithGlobals() as {
          readonly json?: boolean;
        };
        const report = await planEpisodeLayoutMigration({
          episodesRoot: opts.episodesRoot,
          profileId: opts.profile,
          write: opts.write === true,
          ...(opts.confirm !== undefined
            ? { confirmationMigrationId: opts.confirm }
            : {}),
          confirmed: opts.yes === true,
        });
        if (opts.json ?? optsWithGlobals.json) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return;
        }
        process.stdout.write(formatEpisodeLayoutMigrationReport(report));
      }
    );
}
