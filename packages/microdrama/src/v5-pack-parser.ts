import fs from "node:fs";
import path from "node:path";

import {
  canonicalEpisodeIds,
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_EXPECTED_FILE_COUNT,
  V5_EXPECTED_HASH_MANIFEST_ENTRIES,
  V5_EXPECTED_LOCALE_VARIANT_COUNT,
  V5_HASH_MANIFEST_RELATIVE_PATH,
  V5_LOCALE_PROFILES,
  V5_PACK_MANIFEST_HASH,
  V5_REMEDIATED_PACK_VERSION,
  V5_ROOT_ALLOWLIST,
  V5_SOURCE_LOCALE_ALIASES,
  V5_VALIDATION_RELATIVE_PATH,
  type V5SourceLocaleAlias,
} from "./v5-pack-constants.js";
import type {
  EpisodeImport,
  LocalizedScriptImport,
  SeriesImport,
  V5PackImportResult,
  V5PackValidationIssue,
  V5PackValidationResult,
} from "./v5-pack-contracts.js";
import {
  v5LocaleManifestSchema,
} from "./v5-pack-contracts.js";
import {
  computePackManifestHash,
  hashFileSync,
  loadHashManifest,
} from "./v5-pack-hash.js";
import {
  isSafePackRelativePath,
  normalizePackRelativePath,
  resolvePackPath,
  type PackPathIssue,
} from "./v5-pack-path-policy.js";

function fail(issues: V5PackValidationIssue[]): V5PackValidationResult {
  return { ok: false, issues };
}

function mapPathIssue(issue: PackPathIssue): V5PackValidationIssue {
  return {
    code: issue.code,
    message: issue.message,
    path: issue.path,
  };
}

function walkPackFiles(
  packRoot: string,
  relativeDir = ""
): { files: string[]; issues: V5PackValidationIssue[] } {
  const files: string[] = [];
  const issues: V5PackValidationIssue[] = [];
  const absoluteDir = path.join(packRoot, relativeDir);
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = relativeDir
      ? normalizePackRelativePath(path.join(relativeDir, entry.name))
      : entry.name;

    if (!isSafePackRelativePath(relativePath)) {
      issues.push({
        code: "unsafe_path",
        message: `Unsafe path: ${relativePath}`,
        path: relativePath,
      });
      continue;
    }

    const absolutePath = path.join(packRoot, relativePath);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      issues.push({
        code: "symlink",
        message: `Symlink is not allowed: ${relativePath}`,
        path: relativePath,
      });
      continue;
    }

    if (stat.isDirectory()) {
      if (relativePath === "") {
        for (const child of fs.readdirSync(absolutePath)) {
          if (!V5_ROOT_ALLOWLIST.has(child)) {
            issues.push({
              code: "unexpected_root_entry",
              message: `Unexpected root entry: ${child}`,
              path: child,
            });
          }
        }
      }
      const nested = walkPackFiles(packRoot, relativePath);
      files.push(...nested.files);
      issues.push(...nested.issues);
      continue;
    }

    if (stat.isFile()) {
      files.push(relativePath);
    }
  }
  return { files, issues };
}

function buildProvenance(
  sourceRelativePath: string,
  sourceArtifactHash: string,
  importedAt: string
) {
  return {
    sourceKind: "import" as const,
    sourcePackVersion: V5_REMEDIATED_PACK_VERSION,
    sourceRelativePath,
    sourceArtifactHash,
    importedAt,
  };
}

function resolveScriptPath(
  sourceAlias: V5SourceLocaleAlias,
  episodeId: string,
  hashManifest: Record<string, string>
): string | undefined {
  const episodePrefix = `e${episodeId.slice(1)}`;
  const pathPrefix = `languages/${sourceAlias}/episodes/${episodePrefix}`;
  const matches = Object.keys(hashManifest).filter(
    (filePath) => filePath.startsWith(pathPrefix) && filePath.endsWith(".md")
  );
  if (matches.length !== 1) {
    return undefined;
  }
  return matches[0];
}

export function validateAndImportV5Pack(
  packRoot: string,
  importedAt = new Date().toISOString()
): V5PackValidationResult {
  const resolvedRoot = path.resolve(packRoot);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    return fail([
      {
        code: "missing_file",
        message: `Pack root does not exist: ${resolvedRoot}`,
      },
    ]);
  }

  const hashManifestPath = resolvePackPath(resolvedRoot, V5_HASH_MANIFEST_RELATIVE_PATH);
  if (typeof hashManifestPath !== "string") {
    return fail([mapPathIssue(hashManifestPath)]);
  }
  if (!fs.existsSync(hashManifestPath)) {
    return fail([
      {
        code: "missing_file",
        message: "Missing hash manifest",
        path: V5_HASH_MANIFEST_RELATIVE_PATH,
      },
    ]);
  }

  const hashManifest = loadHashManifest(hashManifestPath);
  if (Object.keys(hashManifest).length !== V5_EXPECTED_HASH_MANIFEST_ENTRIES) {
    return fail([
      {
        code: "invalid_manifest",
        message: `Expected ${V5_EXPECTED_HASH_MANIFEST_ENTRIES} hash entries, received ${Object.keys(hashManifest).length}`,
        path: V5_HASH_MANIFEST_RELATIVE_PATH,
      },
    ]);
  }

  const walked = walkPackFiles(resolvedRoot);
  if (walked.issues.length > 0) {
    return fail(walked.issues);
  }

  const discoveredFiles = new Set(walked.files);
  if (discoveredFiles.size !== V5_EXPECTED_FILE_COUNT) {
    return fail([
      {
        code: "file_count_mismatch",
        message: `Expected ${V5_EXPECTED_FILE_COUNT} files, discovered ${discoveredFiles.size}`,
      },
    ]);
  }

  const manifestEntriesForHash = Object.entries(hashManifest).map(([filePath, digest]) => ({
    path: filePath,
    digest,
  }));
  const manifestHash = computePackManifestHash(manifestEntriesForHash);
  if (manifestHash !== V5_PACK_MANIFEST_HASH) {
    return fail([
      {
        code: "manifest_hash_mismatch",
        message: `Pack manifest hash mismatch: expected ${V5_PACK_MANIFEST_HASH}, computed ${manifestHash}`,
      },
    ]);
  }

  const issues: V5PackValidationIssue[] = [];
  for (const [relativePath, expectedDigest] of Object.entries(hashManifest)) {
    if (!discoveredFiles.has(relativePath)) {
      issues.push({
        code: "missing_file",
        message: "Declared file missing on disk",
        path: relativePath,
      });
      continue;
    }
    const absolute = resolvePackPath(resolvedRoot, relativePath);
    if (typeof absolute !== "string") {
      issues.push(mapPathIssue(absolute));
      continue;
    }
    const actualDigest = hashFileSync(absolute);
    if (actualDigest !== expectedDigest) {
      issues.push({
        code: "hash_mismatch",
        message: `Hash mismatch for ${relativePath}`,
        path: relativePath,
      });
    }
  }

  for (const relativePath of discoveredFiles) {
    if (relativePath === V5_HASH_MANIFEST_RELATIVE_PATH) {
      continue;
    }
    if (!hashManifest[relativePath]) {
      issues.push({
        code: "unexpected_file",
        message: "File is not covered by hash manifest",
        path: relativePath,
      });
    }
  }

  if (issues.length > 0) {
    return fail(issues);
  }

  const validationPath = resolvePackPath(resolvedRoot, V5_VALIDATION_RELATIVE_PATH);
  if (typeof validationPath !== "string") {
    return fail([mapPathIssue(validationPath)]);
  }
  const validation = JSON.parse(fs.readFileSync(validationPath, "utf8")) as {
    status?: string;
    total_variants?: number;
  };
  if (validation.status !== "PASS" || validation.total_variants !== V5_EXPECTED_LOCALE_VARIANT_COUNT) {
    return fail([
      {
        code: "authority_conflict",
        message: "validation-v5.json does not report PASS for 400 variants",
        path: V5_VALIDATION_RELATIVE_PATH,
      },
    ]);
  }

  const localizedScriptImports: LocalizedScriptImport[] = [];
  const episodeImports: EpisodeImport[] = [];
  const hashManifestDigest = hashFileSync(hashManifestPath);

  for (const sourceAlias of V5_SOURCE_LOCALE_ALIASES) {
    const profile = V5_LOCALE_PROFILES[sourceAlias];
    const localeManifestPath = resolvePackPath(
      resolvedRoot,
      `languages/${sourceAlias}/manifest.json`
    );
    if (typeof localeManifestPath !== "string") {
      return fail([mapPathIssue(localeManifestPath)]);
    }
    const manifest = v5LocaleManifestSchema.parse(
      JSON.parse(fs.readFileSync(localeManifestPath, "utf8"))
    );

    const episodeIds = new Set<string>();
    for (const entry of manifest) {
      if (episodeIds.has(entry.id)) {
        return fail([
          {
            code: "episode_id_conflict",
            message: `Duplicate episode id in ${sourceAlias} manifest: ${entry.id}`,
            path: `languages/${sourceAlias}/manifest.json`,
          },
        ]);
      }
      episodeIds.add(entry.id);

      if (entry.locale !== profile.locale) {
        return fail([
          {
            code: "locale_mismatch",
            message: `Manifest locale ${entry.locale} does not match profile ${profile.locale}`,
            path: `languages/${sourceAlias}/manifest.json`,
          },
        ]);
      }
      if (entry.wpm !== profile.wpm) {
        return fail([
          {
            code: "authority_conflict",
            message: `Manifest WPM ${entry.wpm} does not match locale profile ${profile.wpm}`,
            path: `languages/${sourceAlias}/manifest.json`,
          },
        ]);
      }

      const scriptRelativePath = resolveScriptPath(
        sourceAlias,
        entry.id,
        hashManifest
      );
      if (!scriptRelativePath) {
        return fail([
          {
            code: "missing_file",
            message: `Missing script for ${entry.id} in ${sourceAlias}`,
            path: `languages/${sourceAlias}/episodes`,
          },
        ]);
      }

      const scriptHash = hashManifest[scriptRelativePath];
      localizedScriptImports.push({
        schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
        episodeId: entry.id,
        locale: profile.locale,
        sourceLocaleAlias: sourceAlias,
        scriptRelativePath,
        contentHash: scriptHash,
        manifestEntry: entry,
        provenance: buildProvenance(scriptRelativePath, scriptHash, importedAt),
      });
    }

    const expectedIds = canonicalEpisodeIds();
    for (const episodeId of expectedIds) {
      if (!episodeIds.has(episodeId)) {
        return fail([
          {
            code: "episode_id_conflict",
            message: `Missing episode ${episodeId} in ${sourceAlias} manifest`,
            path: `languages/${sourceAlias}/manifest.json`,
          },
        ]);
      }
    }
  }

  const enManifestPath = resolvePackPath(resolvedRoot, "languages/en/manifest.json");
  if (typeof enManifestPath !== "string") {
    return fail([mapPathIssue(enManifestPath)]);
  }
  const enManifest = v5LocaleManifestSchema.parse(
    JSON.parse(fs.readFileSync(enManifestPath, "utf8"))
  );
  for (const entry of enManifest) {
    episodeImports.push({
      schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
      episodeId: entry.id,
      episodeNumber: Number.parseInt(entry.episode, 10),
      arcId: entry.arc,
      arcName: entry.arc_name,
      title: entry.title,
      provenance: buildProvenance(
        `languages/en/manifest.json`,
        hashManifest["languages/en/manifest.json"],
        importedAt
      ),
    });
  }

  const seriesImport: SeriesImport = {
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    packVersion: V5_REMEDIATED_PACK_VERSION,
    sourceRoot: resolvedRoot,
    manifestHash,
    hashManifestPath: V5_HASH_MANIFEST_RELATIVE_PATH,
    hashManifestDigest,
    locales: ["en-US", "de-DE", "es-ES", "pt-BR"],
    episodeCount: 100,
    localeVariantCount: 400,
    fileCount: 434,
    validationStatus: "PASS",
    provenance: buildProvenance(V5_HASH_MANIFEST_RELATIVE_PATH, hashManifestDigest, importedAt),
  };

  const result: V5PackImportResult = {
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    seriesImport,
    episodeImports,
    localizedScriptImports,
    hashCoverageCount: 433,
    fileCount: 434,
  };

  return { ok: true, result };
}
