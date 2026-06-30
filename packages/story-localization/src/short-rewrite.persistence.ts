import path from "node:path";
import fs from "node:fs/promises";
import { ensureDir, fileExists, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { shortRewriteArtifactSchema, shortRewriteManifestSchema } from "./short-rewrite.schemas.js";
import {
  type ShortRewriteArtifact,
  type ShortRewriteJsonSidecar,
  type ShortRewriteManifest,
} from "./short-rewrite.types.js";
import { withFileLock } from "./story-localization-batch-storage.js";

export async function readShortRewriteManifest(
  manifestPath: string
): Promise<ShortRewriteManifest | null> {
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  try {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
    return shortRewriteManifestSchema.parse(raw) as ShortRewriteManifest;
  } catch {
    return null;
  }
}

export async function writeShortRewriteArtifactFiles(args: {
  readonly markdownPath: string;
  readonly jsonPath: string;
  readonly compatibilityMarkdownPath: string;
  readonly compatibilityJsonPath: string;
  readonly markdown: string;
  readonly jsonSidecar: ShortRewriteJsonSidecar;
}): Promise<void> {
  await ensureDir(path.dirname(args.markdownPath));
  await Promise.all([
    writeTextAtomic(args.markdownPath, args.markdown),
    writeTextAtomic(args.compatibilityMarkdownPath, args.markdown),
    writeJsonAtomic(args.jsonPath, args.jsonSidecar),
    writeJsonAtomic(args.compatibilityJsonPath, args.jsonSidecar),
  ]);
}

export async function writeShortRewriteManifest(
  manifestPath: string,
  nextManifest: ShortRewriteManifest
): Promise<void> {
  await ensureDir(path.dirname(manifestPath));
  await writeJsonAtomic(manifestPath, shortRewriteManifestSchema.parse(nextManifest));
}

export async function updateShortRewriteManifestAtomically(
  manifestPath: string,
  build: (current: ShortRewriteManifest | null) => ShortRewriteManifest
): Promise<ShortRewriteManifest> {
  return withFileLock(`${manifestPath}.lock`, async () => {
    const current = await readShortRewriteManifest(manifestPath);
    const next = build(current);
    await writeShortRewriteManifest(manifestPath, next);
    return next;
  });
}
