import path from "node:path";
import fs from "node:fs/promises";
import { copyAtomic, ensureDir, fileExists } from "@mediaforge/shared";
import { ExistingArtifactError } from "./short-rewrite.errors.js";
import { sha256NormalizedSource } from "./short-rewrite.utils.js";
import {
  materializeCleanedCanonicalSourceStory,
} from "./source-cleaning-persistence.js";
import { type SourceResolvedFrom, type SourceRole } from "./source-cleaning.js";

export async function materializeCanonicalSourceStory(args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceSha256: string;
  readonly overwrite: boolean;
  readonly sourceRole?: SourceRole | undefined;
  readonly resolvedFrom?: SourceResolvedFrom | undefined;
  readonly artifactSet?: "canonical-source" | "short-story" | undefined;
}): Promise<"written" | "skipped"> {
  const materialized = await materializeCleanedCanonicalSourceStory({
    sourcePath: args.sourcePath,
    targetPath: args.targetPath,
    sourceRole: args.sourceRole ?? "raw-author-source",
    resolvedFrom: args.resolvedFrom ?? "unknown",
    artifactSet: args.artifactSet,
    expectedSourceSha256: args.sourceSha256,
    overwrite: args.overwrite,
  });
  return materialized.status;
}

export async function materializeRawCanonicalSourceStory(args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceSha256: string;
  readonly overwrite: boolean;
}): Promise<"written" | "skipped"> {
  if (await fileExists(args.targetPath)) {
    const existingHash = sha256NormalizedSource(await fs.readFile(args.targetPath, "utf8"));
    if (existingHash === args.sourceSha256) {
      return "skipped";
    }
    if (!args.overwrite) {
      throw new ExistingArtifactError(
        `Canonical source already exists and differs: ${args.targetPath}`
      );
    }
  }
  await ensureDir(path.dirname(args.targetPath));
  await copyAtomic(args.sourcePath, args.targetPath);
  return "written";
}
