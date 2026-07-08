import path from "node:path";
import {
  canonicalVisualManifestSchema,
  localizedAlignmentManifestSchema,
  localizedVisualValidationReportSchema,
  type CanonicalVisualManifest,
  type LocalizedAlignmentManifest,
  type LocalizedVisualValidationIssue,
  type LocalizedVisualValidationReport,
  type LocalizedVisualValidationStatus,
} from "@mediaforge/domain";
import {
  fileExists,
  resolveCanonicalVisualManifestPath,
  writeJsonAtomic,
} from "@mediaforge/shared";

export interface ValidateLocalizedVisualsInput {
  readonly episodeDir: string;
  readonly canonicalManifest: CanonicalVisualManifest;
  readonly alignmentManifest: LocalizedAlignmentManifest;
  readonly now?: Date;
}

function statusRank(status: LocalizedVisualValidationStatus): number {
  switch (status) {
    case "safe":
      return 0;
    case "warn":
      return 1;
    case "regenerate":
      return 2;
    case "block":
      return 3;
  }
}

function maxStatus(
  statuses: readonly LocalizedVisualValidationStatus[]
): LocalizedVisualValidationStatus {
  return statuses.reduce<LocalizedVisualValidationStatus>(
    (current, next) => (statusRank(next) > statusRank(current) ? next : current),
    "safe"
  );
}

function portableRelative(episodeDir: string, filePath: string): string {
  return path.relative(episodeDir, filePath).replace(/\\/gu, "/");
}

function variantSegment(variant: "full" | "short"): string {
  return `visuals/${variant}/`;
}

function oppositeVariantSegment(variant: "full" | "short"): string {
  return variant === "short" ? "visuals/full/" : "visuals/short/";
}

function expectedManifestPath(episodeDir: string, variant: "full" | "short"): string {
  return portableRelative(
    episodeDir,
    resolveCanonicalVisualManifestPath({ episodeDir, variant })
  );
}

function issue(input: {
  readonly sceneId: string;
  readonly status: Exclude<LocalizedVisualValidationStatus, "safe">;
  readonly reason: string;
  readonly recommendation: string;
}): LocalizedVisualValidationIssue {
  return {
    sceneId: input.sceneId as never,
    status: input.status,
    reason: input.reason,
    recommendation: input.recommendation,
  };
}

async function imageExists(episodeDir: string, imagePath: string | undefined): Promise<boolean> {
  if (!imagePath) {
    return false;
  }
  return fileExists(path.resolve(episodeDir, imagePath));
}

export async function validateLocalizedVisuals(
  input: ValidateLocalizedVisualsInput
): Promise<LocalizedVisualValidationReport> {
  const canonicalManifest = canonicalVisualManifestSchema.parse(input.canonicalManifest);
  const alignmentManifest = localizedAlignmentManifestSchema.parse(input.alignmentManifest);
  const issues: LocalizedVisualValidationIssue[] = [];

  if (canonicalManifest.variant !== alignmentManifest.variant) {
    issues.push(
      issue({
        sceneId: (canonicalManifest.scenes[0]?.sceneId ?? "scene-001") as string,
        status: "block",
        reason: `Localized ${alignmentManifest.variant} alignment references a ${canonicalManifest.variant} canonical visual manifest.`,
        recommendation: `Use ${expectedManifestPath(input.episodeDir, alignmentManifest.variant)} for ${alignmentManifest.variant} renders.`,
      })
    );
  }

  const expectedManifest = expectedManifestPath(input.episodeDir, alignmentManifest.variant);
  const normalizedManifestPath = alignmentManifest.canonicalVisualManifestPath.replace(/\\/gu, "/");
  if (normalizedManifestPath !== expectedManifest) {
    issues.push(
      issue({
        sceneId: (canonicalManifest.scenes[0]?.sceneId ?? "scene-001") as string,
        status: "block",
        reason: `${alignmentManifest.variant} localized alignment references ${normalizedManifestPath}, expected ${expectedManifest}.`,
        recommendation: `Reference the canonical ${alignmentManifest.variant} visual manifest only.`,
      })
    );
  }

  const canonicalSceneIds = canonicalManifest.scenes.map((scene) => scene.sceneId);
  const canonicalSceneIdSet = new Set(canonicalSceneIds);
  const alignmentSceneIds = alignmentManifest.alignments.map((alignment) => alignment.sceneId);
  const alignmentSceneIdSet = new Set(alignmentSceneIds);

  for (const sceneId of canonicalSceneIds) {
    if (!alignmentSceneIdSet.has(sceneId)) {
      issues.push(
        issue({
          sceneId,
          status: "block",
          reason: `Localized alignment is missing canonical scene ${sceneId}.`,
          recommendation: "Align every localized narration segment back to a canonical scene ID before rendering.",
        })
      );
    }
  }

  for (const sceneId of alignmentSceneIds) {
    if (!canonicalSceneIdSet.has(sceneId)) {
      issues.push(
        issue({
          sceneId,
          status: "block",
          reason: `Localized alignment references unknown canonical scene ${sceneId}.`,
          recommendation: "Remove orphan localized segments or map them to an existing canonical visual scene.",
        })
      );
    }
  }

  const projectedCanonicalOrder = canonicalSceneIds.filter((sceneId) =>
    alignmentSceneIdSet.has(sceneId)
  );
  const projectedAlignmentOrder = alignmentSceneIds.filter((sceneId) =>
    canonicalSceneIdSet.has(sceneId)
  );
  if (projectedCanonicalOrder.join("\n") !== projectedAlignmentOrder.join("\n")) {
    issues.push(
      issue({
        sceneId: projectedAlignmentOrder[0] ?? canonicalSceneIds[0] ?? "scene-001",
        status: "block",
        reason: "Localized alignment reorders canonical visual scene IDs.",
        recommendation: "Preserve canonical visual scene order and adjust localized timings only.",
      })
    );
  }

  const canonicalBySceneId = new Map(
    canonicalManifest.scenes.map((scene) => [scene.sceneId, scene])
  );
  for (const alignment of alignmentManifest.alignments) {
    if (alignment.language !== alignmentManifest.language || alignment.variant !== alignmentManifest.variant) {
      issues.push(
        issue({
          sceneId: alignment.sceneId,
          status: "block",
          reason: `Alignment row for ${alignment.sceneId} does not match manifest language and variant.`,
          recommendation: "Regenerate the localized alignment manifest for the requested language and variant.",
        })
      );
    }
    const scene = canonicalBySceneId.get(alignment.sceneId);
    if (!scene) {
      continue;
    }
    const imagePath = scene.imagePath?.replace(/\\/gu, "/");
    if (!imagePath || !(await imageExists(input.episodeDir, imagePath))) {
      issues.push(
        issue({
          sceneId: scene.sceneId,
          status: "block",
          reason: `Missing ${canonicalManifest.variant} visual image for ${scene.sceneId}.`,
          recommendation:
            canonicalManifest.variant === "short"
              ? `Generate ${variantSegment("short")}images/${scene.sceneId}.png. Full-video image fallback is disabled for short renders.`
              : `Generate ${variantSegment("full")}images/${scene.sceneId}.png. Short-video image fallback is disabled for full renders.`,
        })
      );
    } else if (imagePath.includes(oppositeVariantSegment(canonicalManifest.variant))) {
      issues.push(
        issue({
          sceneId: scene.sceneId,
          status: "block",
          reason: `${canonicalManifest.variant} render references the wrong variant image path: ${imagePath}.`,
          recommendation: `Use images under ${variantSegment(canonicalManifest.variant)}images only.`,
        })
      );
    } else if (!imagePath.includes(`${variantSegment(canonicalManifest.variant)}images/`)) {
      issues.push(
        issue({
          sceneId: scene.sceneId,
          status: "block",
          reason: `${canonicalManifest.variant} visual image path is not under ${variantSegment(canonicalManifest.variant)}images: ${imagePath}.`,
          recommendation: `Persist canonical image paths under ${variantSegment(canonicalManifest.variant)}images.`,
        })
      );
    }

    const duration = alignment.audioEndSeconds - alignment.audioStartSeconds;
    if (scene.maxDurationSeconds !== undefined && duration > scene.maxDurationSeconds * 1.35) {
      issues.push(
        issue({
          sceneId: scene.sceneId,
          status: "warn",
          reason: "Localized narration is much longer than canonical timing guidance but can reuse the same visual beat.",
          recommendation: "Reuse the canonical image with a slower or subtler motion preset.",
        })
      );
    }
    if (scene.minDurationSeconds !== undefined && duration < scene.minDurationSeconds * 0.65) {
      issues.push(
        issue({
          sceneId: scene.sceneId,
          status: "warn",
          reason: "Localized narration is much shorter than canonical timing guidance but still maps to the same visual beat.",
          recommendation: "Reuse the canonical image for the shorter duration or merge nearby beats intentionally.",
        })
      );
    }
  }

  return localizedVisualValidationReportSchema.parse({
    episodeSlug: canonicalManifest.episodeSlug,
    language: alignmentManifest.language,
    variant: alignmentManifest.variant,
    status: maxStatus(issues.map((entry) => entry.status)),
    issues,
    createdAt: (input.now ?? new Date()).toISOString(),
  });
}

export async function writeLocalizedVisualValidationReport(args: {
  readonly filePath: string;
  readonly report: LocalizedVisualValidationReport;
}): Promise<void> {
  await writeJsonAtomic(args.filePath, localizedVisualValidationReportSchema.parse(args.report));
}
