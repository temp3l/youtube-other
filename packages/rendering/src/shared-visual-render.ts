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

export interface SharedVisualRenderReadinessIssue {
  readonly code:
    | "VARIANT_MISMATCH"
    | "VALIDATION_MISMATCH"
    | "VALIDATION_BLOCKED"
    | "UNKNOWN_CANONICAL_SCENE"
    | "WRONG_VARIANT_IMAGE"
    | "INVALID_IMAGE_PATH"
    | "MISSING_IMAGE"
    | "IMAGE_VALIDATION_FAILED";
  readonly message: string;
  readonly sceneId?: string;
}

export interface SharedVisualRenderReadiness {
  readonly episodeSlug: CanonicalVisualManifest["episodeSlug"];
  readonly language: LocalizedAlignmentManifest["language"];
  readonly variant: "full" | "short";
  readonly renderProfile: "youtube" | "vertical";
  readonly imageSource: "canonical-full-reuse" | "short-only";
  readonly status: "ready" | "blocked";
  readonly resolvedSceneCount: number;
  readonly blockedSceneIds: readonly string[];
  readonly issues: readonly SharedVisualRenderReadinessIssue[];
  readonly segments: readonly SharedVisualRenderSegment[];
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

function issueCodeForImageError(message: string): SharedVisualRenderReadinessIssue["code"] {
  if (message.includes("wrong variant image path")) {
    return "WRONG_VARIANT_IMAGE";
  }
  if (message.includes("must be under")) {
    return "INVALID_IMAGE_PATH";
  }
  if (message.includes("Missing")) {
    return "MISSING_IMAGE";
  }
  return "IMAGE_VALIDATION_FAILED";
}

export async function evaluateSharedVisualRenderReadiness(
  input: ResolveSharedVisualRenderTimelineInput
): Promise<SharedVisualRenderReadiness> {
  const canonicalManifest = canonicalVisualManifestSchema.parse(input.canonicalManifest);
  const alignmentManifest = localizedAlignmentManifestSchema.parse(input.alignmentManifest);
  const validationReport = localizedVisualValidationReportSchema.parse(input.validationReport);
  const issues: SharedVisualRenderReadinessIssue[] = [];

  if (canonicalManifest.variant !== alignmentManifest.variant) {
    issues.push({
      code: "VARIANT_MISMATCH",
      message: `Cannot render ${alignmentManifest.variant} alignment with ${canonicalManifest.variant} canonical visual manifest.`,
    });
  }
  if (
    validationReport.variant !== alignmentManifest.variant ||
    validationReport.language !== alignmentManifest.language
  ) {
    issues.push({
      code: "VALIDATION_MISMATCH",
      message: `Localized visual validation report does not match ${alignmentManifest.language}/${alignmentManifest.variant}.`,
    });
  }
  if (validationReport.status === "block" && input.allowBlockedValidation !== true) {
    issues.push({
      code: "VALIDATION_BLOCKED",
      message: `Localized visual validation blocked ${alignmentManifest.language}/${alignmentManifest.variant} render.`,
    });
  }

  const scenes = new Map(canonicalManifest.scenes.map((scene) => [scene.sceneId, scene]));
  const segments: SharedVisualRenderSegment[] = [];
  for (const alignment of alignmentManifest.alignments) {
    const scene = scenes.get(alignment.sceneId);
    if (!scene) {
      issues.push({
        code: "UNKNOWN_CANONICAL_SCENE",
        sceneId: alignment.sceneId,
        message: `Localized alignment references unknown canonical scene ${alignment.sceneId}.`,
      });
      continue;
    }
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        code: issueCodeForImageError(message),
        sceneId: alignment.sceneId,
        message,
      });
    }
  }

  return {
    episodeSlug: canonicalManifest.episodeSlug,
    language: alignmentManifest.language,
    variant: canonicalManifest.variant,
    renderProfile: canonicalManifest.variant === "short" ? "vertical" : "youtube",
    imageSource:
      canonicalManifest.variant === "short" ? "short-only" : "canonical-full-reuse",
    status: issues.length > 0 ? "blocked" : "ready",
    resolvedSceneCount: segments.length,
    blockedSceneIds: [...new Set(issues.flatMap((issue) => (issue.sceneId ? [issue.sceneId] : [])))],
    issues,
    segments,
  };
}

export async function resolveSharedVisualRenderTimeline(
  input: ResolveSharedVisualRenderTimelineInput
): Promise<readonly SharedVisualRenderSegment[]> {
  const readiness = await evaluateSharedVisualRenderReadiness(input);
  if (readiness.status === "blocked") {
    throw new MediaValidationError(
      readiness.issues[0]?.message ?? "Shared visual render readiness is blocked."
    );
  }
  return readiness.segments;
}
