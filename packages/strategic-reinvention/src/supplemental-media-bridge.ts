import fs from "node:fs/promises";
import path from "node:path";
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

export async function loadStrategicEpisodeNarration(
  workspaceRoot: string,
  episodeId: string,
  narrationPath?: string,
): Promise<string> {
  if (narrationPath) {
    return fs.readFile(path.resolve(narrationPath), "utf8");
  }
  const candidates = [
    path.join(workspaceRoot, episodeId, "languages", "script-it.md"),
    path.join(workspaceRoot, episodeId, "languages", "it", "full", "script.md"),
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
  const files: Array<{
    assetId: string;
    filename: string;
    bytes: Uint8Array;
  }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;
    const absolute = path.join(sourcesDir, entry.name);
    const bytes = await fs.readFile(absolute);
    files.push({
      assetId: path.basename(entry.name, extension).replace(/[^a-z0-9-]+/giu, "-"),
      filename: entry.name,
      bytes,
    });
  }
  return files;
}

export async function runStrategicSupplementalMediaBridge(
  input: StrategicSupplementalMediaInput,
): Promise<VeronicaPipelineResult> {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const narration = await loadStrategicEpisodeNarration(
    input.workspaceRoot,
    episodeId,
    input.narrationPath,
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
    workspaceRoot: input.workspaceRoot,
    episodeId,
    originalNarration: narration,
    targetLanguage: input.targetLanguage ?? "it",
    sourceLanguage: "it",
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
