import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDir,
  fileExists,
  hashText,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { ExistingArtifactError, StoryInputNotFoundError } from "./short-rewrite.errors.js";
import {
  cleanSourceText,
  type SourceCleaningReport,
  type SourceCleaningResult,
  type SourceResolvedFrom,
  type SourceRole,
} from "./source-cleaning.js";
import { sha256NormalizedSource } from "./short-rewrite.utils.js";

export interface SourceCleaningPaths {
  readonly sourceDirectory: string;
  readonly canonicalSourcePath: string;
  readonly originalSourcePath: string;
  readonly cleanedSourcePath: string;
  readonly reportPath: string;
}

export type SourceCleaningArtifactSet = "canonical-source" | "short-story";

export interface MaterializedCleanedSourceStory {
  readonly paths: SourceCleaningPaths;
  readonly cleaning: SourceCleaningResult;
  readonly status: "written" | "skipped";
}

export function resolveSourceCleaningPaths(
  canonicalSourcePath: string,
  artifactSet: SourceCleaningArtifactSet = "canonical-source"
): SourceCleaningPaths {
  const sourceDirectory = path.dirname(canonicalSourcePath);
  const sidecarFileNames =
    artifactSet === "short-story"
      ? {
          originalSourcePath: "original-short-story.md",
          cleanedSourcePath: "cleaned-short-story.md",
          reportPath: "short-story-cleaning-report.json",
        }
      : {
          originalSourcePath: "source-original.md",
          cleanedSourcePath: "source-cleaned.md",
          reportPath: "source-cleaning-report.json",
        };
  return {
    sourceDirectory,
    canonicalSourcePath,
    originalSourcePath: path.join(sourceDirectory, sidecarFileNames.originalSourcePath),
    cleanedSourcePath: path.join(sourceDirectory, sidecarFileNames.cleanedSourcePath),
    reportPath: path.join(sourceDirectory, sidecarFileNames.reportPath),
  };
}

async function writeTextIfChanged(
  filePath: string,
  content: string,
  overwrite: boolean
): Promise<"written" | "skipped"> {
  if (await fileExists(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content) {
      return "skipped";
    }
    if (!overwrite) {
      throw new ExistingArtifactError(`Source artifact already exists and differs: ${filePath}`);
    }
  }
  await writeTextAtomic(filePath, content);
  return "written";
}

async function writeReportIfChanged(
  filePath: string,
  report: SourceCleaningReport,
  overwrite: boolean
): Promise<"written" | "skipped"> {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (await fileExists(filePath)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === serialized) {
      return "skipped";
    }
    if (!overwrite) {
      throw new ExistingArtifactError(`Source cleaning report already exists and differs: ${filePath}`);
    }
  }
  await writeJsonAtomic(filePath, report);
  return "written";
}

async function writeOriginalSnapshotIfMissing(
  filePath: string,
  content: string,
  overwrite: boolean
): Promise<"written" | "skipped"> {
  if (await fileExists(filePath)) {
    if (overwrite) {
      await writeTextAtomic(filePath, content);
      return "written";
    }
    return "skipped";
  }
  await writeTextAtomic(filePath, content);
  return "written";
}

export async function materializeCleanedCanonicalSourceStory(args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceRole: SourceRole;
  readonly resolvedFrom: SourceResolvedFrom;
  readonly artifactSet?: SourceCleaningArtifactSet | undefined;
  readonly overwrite: boolean;
  readonly expectedSourceSha256?: string | undefined;
}): Promise<MaterializedCleanedSourceStory> {
  const original = await fs.readFile(args.sourcePath, "utf8");
  if (args.expectedSourceSha256) {
    const actual = sha256NormalizedSource(original);
    if (actual !== args.expectedSourceSha256 && hashText(original) !== args.expectedSourceSha256) {
      throw new StoryInputNotFoundError(
        `Resolved source hash changed before materialization: ${args.sourcePath}`
      );
    }
  }
  const cleaning = cleanSourceText({
    sourcePath: args.sourcePath,
    text: original,
    sourceRole: args.sourceRole,
    resolvedFrom: args.resolvedFrom,
  });
  if (cleaning.report.fatal) {
    throw new StoryInputNotFoundError(
      `${cleaning.report.fatal.message} Source: ${args.sourcePath}`
    );
  }
  const paths = resolveSourceCleaningPaths(args.targetPath, args.artifactSet);
  await ensureDir(paths.sourceDirectory);
  const inPlaceCanonicalSource = path.resolve(args.sourcePath) === path.resolve(args.targetPath);
  const writes = await Promise.all([
    writeOriginalSnapshotIfMissing(paths.originalSourcePath, original, args.overwrite),
    writeTextIfChanged(paths.cleanedSourcePath, cleaning.cleanedText, args.overwrite),
    writeTextIfChanged(paths.canonicalSourcePath, cleaning.cleanedText, args.overwrite || inPlaceCanonicalSource),
    writeReportIfChanged(paths.reportPath, cleaning.report, args.overwrite),
  ]);
  return {
    paths,
    cleaning,
    status: writes.some((status) => status === "written") ? "written" : "skipped",
  };
}
