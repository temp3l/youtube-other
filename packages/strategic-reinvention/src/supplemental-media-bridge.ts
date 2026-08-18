import fs from "node:fs/promises";
import path from "node:path";
import {
  canonicalContentIdentityFromVeronicaWorkspace,
  type VeronicaCanonicalContentIdentity,
} from "@mediaforge/domain";
import {
  createEpisodePathResolver,
  normalizeEpisodeId,
} from "@mediaforge/shared";
import {
  runVeronicaSupplementalMediaPipeline,
  veronicaEpisodeStateDir,
  type VeronicaPipelineResult,
} from "@mediaforge/veronica-media";

const supportedExtensions = new Set([
  ".pdf",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".mp4",
  ".mov",
]);

export interface StrategicSupplementalMediaInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly narrationPath?: string;
  readonly supplementalDir?: string;
  readonly targetLanguage?: string;
  readonly resume?: boolean;
}

export async function loadVeronicaCanonicalContentIdentity(
  workspaceRoot: string,
  episodeId: string,
): Promise<VeronicaCanonicalContentIdentity> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(workspaceRoot, episodeId, "manifest.json"), "utf8"),
  ) as { readonly sourceMetadata?: unknown };
  return canonicalContentIdentityFromVeronicaWorkspace(manifest.sourceMetadata);
}

export async function loadStrategicEpisodeNarration(
  workspaceRoot: string,
  episodeId: string,
  narrationPath?: string,
  locale: string = "it",
  variant: "long" | "short" = "long",
): Promise<string> {
  if (narrationPath) {
    return fs.readFile(path.resolve(narrationPath), "utf8");
  }
  const candidates = variant === "short"
    ? [
        path.join(workspaceRoot, episodeId, "languages", "short", `script-${locale}.md`),
        path.join(workspaceRoot, episodeId, "locales", locale, "short", "script.md"),
      ]
    : [
        path.join(workspaceRoot, episodeId, "languages", `script-${locale}.md`),
        path.join(workspaceRoot, episodeId, "locales", locale, "full", "script.md"),
      ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(
    `Strategic episode narration not found for ${episodeId}. Provide --narration or create languages/script-it.md.`,
  );
}

export async function loadStrategicSupplementalFiles(input: {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly supplementalDir?: string;
}) {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const resolver = createEpisodePathResolver(input.workspaceRoot);
  const sourcesDir =
    input.supplementalDir ??
    path.join(resolver.episodeRoot(episodeId), "sources", "content");
  const entries = await fs.readdir(sourcesDir, { withFileTypes: true });
  const candidates: Array<{ readonly name: string; readonly absolute: string }> = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      candidates.push({ name: entry.name, absolute: path.join(sourcesDir, entry.name) });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const nested = await fs.readdir(path.join(sourcesDir, entry.name), { withFileTypes: true });
    for (const nestedEntry of nested) {
      if (nestedEntry.isFile()) candidates.push({
        name: nestedEntry.name,
        absolute: path.join(sourcesDir, entry.name, nestedEntry.name),
      });
    }
  }
  const files: Array<{
    assetId: string;
    filename: string;
    bytes: Uint8Array;
  }> = [];
  for (const candidate of candidates) {
    const extension = path.extname(candidate.name).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;
    const bytes = await fs.readFile(candidate.absolute);
    files.push({
      assetId: path.basename(candidate.name, extension).replace(/[^a-z0-9-]+/giu, "-"),
      filename: candidate.name,
      bytes,
    });
  }
  return files;
}

export async function runStrategicSupplementalMediaBridge(
  input: StrategicSupplementalMediaInput,
): Promise<VeronicaPipelineResult> {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const canonicalContentIdentity = await loadVeronicaCanonicalContentIdentity(
    input.workspaceRoot,
    episodeId,
  );
  const narration = await loadStrategicEpisodeNarration(
    input.workspaceRoot,
    episodeId,
    input.narrationPath,
    canonicalContentIdentity.locale,
    canonicalContentIdentity.variant,
  );
  const supplementalFiles = await loadStrategicSupplementalFiles({
    workspaceRoot: input.workspaceRoot,
    episodeId,
    ...(input.supplementalDir ? { supplementalDir: input.supplementalDir } : {}),
  });
  if (supplementalFiles.length === 0) {
    throw new Error(
      `No supported supplemental media found under ${input.supplementalDir ?? "sources/content"}.`,
    );
  }
  return runVeronicaSupplementalMediaPipeline({
    canonicalContentIdentity,
    workspaceRoot: input.workspaceRoot,
    episodeId,
    originalNarration: narration,
    targetLanguage: input.targetLanguage ?? canonicalContentIdentity.locale,
    sourceLanguage: canonicalContentIdentity.locale,
    supplementalFiles,
    ...(input.resume === undefined ? {} : { resume: input.resume }),
  });
}

export function strategicSupplementalMediaPlanPath(
  workspaceRoot: string,
  episodeId: string,
): string {
  return path.join(
    veronicaEpisodeStateDir(workspaceRoot, normalizeEpisodeId(episodeId)),
    "veronica-media-plan.json",
  );
}
