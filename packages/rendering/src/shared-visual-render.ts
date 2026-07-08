import path from "node:path";
import {
  MediaValidationError,
  canonicalVisualManifestSchema,
  localizedAlignmentManifestSchema,
  localizedVisualValidationReportSchema,
  type CanonicalVisualManifest,
  type LocalizedAlignmentManifest,
  type LocalizedVisualValidationReport,
} from "@mediaforge/domain";
import { fileExists } from "@mediaforge/shared";

export interface SharedVisualRenderSegment {
  readonly sceneId: string;
  readonly imagePath: string;
  readonly audioStartSeconds: number;
  readonly audioEndSeconds: number;
  readonly durationSeconds: number;
  readonly narrationText: string;
}

export interface ResolveSharedVisualRenderTimelineInput {
  readonly episodeDir: string;
  readonly canonicalManifest: CanonicalVisualManifest;
  readonly alignmentManifest: LocalizedAlignmentManifest;
  readonly validationReport: LocalizedVisualValidationReport;
  readonly allowBlockedValidation?: boolean;
}

function variantImageSegment(variant: "full" | "short"): string {
  return `visuals/${variant}/images/`;
}

function oppositeVariantImageSegment(variant: "full" | "short"): string {
  return variant === "short" ? "visuals/full/images/" : "visuals/short/images/";
}

async function resolveSceneImage(args: {
  readonly episodeDir: string;
  readonly variant: "full" | "short";
  readonly sceneId: string;
  readonly imagePath: string | undefined;
}): Promise<string> {
  if (!args.imagePath) {
    throw new MediaValidationError(
      `Missing ${args.variant} visual image for ${args.sceneId}. Expected path: visuals/${args.variant}/images/${args.sceneId}.png. ${
        args.variant === "short"
          ? "Full-video image fallback is disabled for short renders."
          : "Short-video image fallback is disabled for full renders."
      }`
    );
  }
  const normalized = args.imagePath.replace(/\\/gu, "/");
  if (normalized.includes(oppositeVariantImageSegment(args.variant))) {
    throw new MediaValidationError(
      `${args.variant} render references the wrong variant image path for ${args.sceneId}: ${normalized}.`
    );
  }
  if (!normalized.includes(variantImageSegment(args.variant))) {
    throw new MediaValidationError(
      `${args.variant} render image for ${args.sceneId} must be under ${variantImageSegment(args.variant)}.`
    );
  }
  const resolved = path.resolve(args.episodeDir, normalized);
  if (!(await fileExists(resolved))) {
    throw new MediaValidationError(
      `Missing ${args.variant} visual image for ${args.sceneId}. Expected path: ${normalized}. ${
        args.variant === "short"
          ? "Full-video image fallback is disabled for short renders."
          : "Short-video image fallback is disabled for full renders."
      }`
    );
  }
  return resolved;
}

export async function resolveSharedVisualRenderTimeline(
  input: ResolveSharedVisualRenderTimelineInput
): Promise<readonly SharedVisualRenderSegment[]> {
  const canonicalManifest = canonicalVisualManifestSchema.parse(input.canonicalManifest);
  const alignmentManifest = localizedAlignmentManifestSchema.parse(input.alignmentManifest);
  const validationReport = localizedVisualValidationReportSchema.parse(input.validationReport);

  if (canonicalManifest.variant !== alignmentManifest.variant) {
    throw new MediaValidationError(
      `Cannot render ${alignmentManifest.variant} alignment with ${canonicalManifest.variant} canonical visual manifest.`
    );
  }
  if (
    validationReport.variant !== alignmentManifest.variant ||
    validationReport.language !== alignmentManifest.language
  ) {
    throw new MediaValidationError(
      `Localized visual validation report does not match ${alignmentManifest.language}/${alignmentManifest.variant}.`
    );
  }
  if (validationReport.status === "block" && input.allowBlockedValidation !== true) {
    throw new MediaValidationError(
      `Localized visual validation blocked ${alignmentManifest.language}/${alignmentManifest.variant} render.`
    );
  }

  const scenes = new Map(canonicalManifest.scenes.map((scene) => [scene.sceneId, scene]));
  const segments: SharedVisualRenderSegment[] = [];
  for (const alignment of alignmentManifest.alignments) {
    const scene = scenes.get(alignment.sceneId);
    if (!scene) {
      throw new MediaValidationError(
        `Localized alignment references unknown canonical scene ${alignment.sceneId}.`
      );
    }
    const imagePath = await resolveSceneImage({
      episodeDir: input.episodeDir,
      variant: canonicalManifest.variant,
      sceneId: alignment.sceneId,
      imagePath: scene.imagePath,
    });
    segments.push({
      sceneId: alignment.sceneId,
      imagePath,
      audioStartSeconds: alignment.audioStartSeconds,
      audioEndSeconds: alignment.audioEndSeconds,
      durationSeconds: alignment.audioEndSeconds - alignment.audioStartSeconds,
      narrationText: alignment.narrationText,
    });
  }
  return segments;
}
