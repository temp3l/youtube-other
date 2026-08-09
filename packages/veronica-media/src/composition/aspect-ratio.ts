import {
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  VERONICA_DEFAULT_PORTRAIT_PROFILE,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";
import {
  formatCompositionArtifactSchema,
  planIndependentFormatCompositions as planSharedIndependentFormatCompositions,
  type FormatCompositionArtifact,
  type PlanIndependentFormatCompositionsInput as PlanSharedIndependentFormatCompositionsInput,
} from "@mediaforge/rendering/composition-contract.js";
import { validatePortraitReadiness } from "../localization/translation.js";
import { z } from "zod";

export const SCENE_COMPOSITION_BLIND_CROP = "SCENE_COMPOSITION_BLIND_CROP";
export const SCENE_COMPOSITION_SAFE_AREA_VIOLATION = "SCENE_COMPOSITION_SAFE_AREA_VIOLATION";
export const SCENE_COMPOSITION_TEXT_TOO_SMALL = "SCENE_COMPOSITION_TEXT_TOO_SMALL";
export const FORMAT_COMPOSITION_SHARED_ID = "FORMAT_COMPOSITION_SHARED_ID";
export const FORMAT_COMPOSITION_BLIND_CROP = "FORMAT_COMPOSITION_BLIND_CROP";
export const FORMAT_COMPOSITION_MISSING_REDIRECTION = "FORMAT_COMPOSITION_MISSING_REDIRECTION";

/**
 * Immutable composition artifact over one language-neutral semantic revision.
 * The image identity may be shared, but the composition identity never is.
 */
export const veronicaFormatCompositionArtifactSchema = formatCompositionArtifactSchema.extend({
  contentProfileId: z.literal("veronicabenini"),
});
export type VeronicaFormatCompositionArtifact = z.infer<
  typeof veronicaFormatCompositionArtifactSchema
>;

export type PlanIndependentFormatCompositionsInput = Omit<
  PlanSharedIndependentFormatCompositionsInput,
  "contentProfileId"
>;

/** Plans descriptors only: it never generates images, narration, or a render. */
export function planIndependentFormatCompositions(
  input: PlanIndependentFormatCompositionsInput,
): readonly VeronicaFormatCompositionArtifact[] {
  return planSharedIndependentFormatCompositions({
    ...input,
    contentProfileId: "veronicabenini",
  }).map((artifact: FormatCompositionArtifact) =>
    veronicaFormatCompositionArtifactSchema.parse(artifact),
  );
}

export interface SceneCompositionReadabilityInput {
  readonly sceneId: string;
  readonly aspectRatio: "16:9" | "9:16";
  readonly profile:
    | VeronicaMediaPlan["aspectProfiles"]["landscape"]
    | VeronicaMediaPlan["aspectProfiles"]["portrait"];
  readonly compositionId: string;
  readonly sourceTreatment: "redesign" | "reflow" | "composite" | "blind-crop";
  readonly textBlocks: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly fontSize: number;
    readonly role: "title" | "subtitle" | "lower-third";
  }[];
}

export interface SceneCompositionReadabilityIssue {
  readonly code: string;
  readonly sceneId: string;
  readonly aspectRatio: "16:9" | "9:16";
  readonly message: string;
}

function usableArea(
  profile: SceneCompositionReadabilityInput["profile"],
  role: "title" | "subtitle" | "lower-third",
) {
  const safe = profile.safeAreas[role === "lower-third" ? "lowerThird" : role];
  return {
    left: Math.max(safe.left, profile.safeAreas.platformUi.left),
    top: Math.max(safe.top, profile.safeAreas.platformUi.top),
    right: profile.width - Math.max(safe.right, profile.safeAreas.platformUi.right),
    bottom: profile.height - Math.max(safe.bottom, profile.safeAreas.platformUi.bottom),
  };
}

/** Validates a composition in its own target ratio; it never infers portrait from landscape. */
export function validateSceneCompositionReadability(
  input: SceneCompositionReadabilityInput,
): readonly SceneCompositionReadabilityIssue[] {
  const issues: SceneCompositionReadabilityIssue[] = [];
  if (input.profile.aspectRatio !== input.aspectRatio) {
    throw new Error(`Profile aspect ratio does not match scene ${input.sceneId}.`);
  }
  if (input.sourceTreatment === "blind-crop") {
    issues.push({
      code: SCENE_COMPOSITION_BLIND_CROP,
      sceneId: input.sceneId,
      aspectRatio: input.aspectRatio,
      message: "Each aspect ratio must use an independently composed source slide.",
    });
  }
  for (const block of input.textBlocks) {
    const area = usableArea(input.profile, block.role);
    if (
      block.x < area.left || block.y < area.top ||
      block.x + block.width > area.right || block.y + block.height > area.bottom
    ) {
      issues.push({
        code: SCENE_COMPOSITION_SAFE_AREA_VIOLATION,
        sceneId: input.sceneId,
        aspectRatio: input.aspectRatio,
        message: `Text block falls outside the ${block.role} safe area.`,
      });
    }
    const minimumFontSize = input.aspectRatio === "9:16" ? 28 : 24;
    if (block.fontSize < minimumFontSize) {
      issues.push({
        code: SCENE_COMPOSITION_TEXT_TOO_SMALL,
        sceneId: input.sceneId,
        aspectRatio: input.aspectRatio,
        message: `Text block font size is below ${minimumFontSize}px for ${input.aspectRatio}.`,
      });
    }
  }
  return issues;
}

export function validateIndependentSceneCompositions(
  inputs: readonly SceneCompositionReadabilityInput[],
): readonly SceneCompositionReadabilityIssue[] {
  const byScene = new Map<string, SceneCompositionReadabilityInput[]>();
  for (const input of inputs) {
    const sceneInputs = byScene.get(input.sceneId) ?? [];
    sceneInputs.push(input);
    byScene.set(input.sceneId, sceneInputs);
  }
  const issues = inputs.flatMap(validateSceneCompositionReadability);
  for (const [sceneId, sceneInputs] of byScene) {
    const landscape = sceneInputs.find((entry) => entry.aspectRatio === "16:9");
    const portrait = sceneInputs.find((entry) => entry.aspectRatio === "9:16");
    if (!landscape || !portrait || landscape.compositionId === portrait.compositionId) {
      issues.push({
        code: SCENE_COMPOSITION_BLIND_CROP,
        sceneId,
        aspectRatio: portrait?.aspectRatio ?? landscape?.aspectRatio ?? "9:16",
        message: "A scene requires distinct 16:9 and 9:16 composition identities.",
      });
    }
  }
  return issues;
}

export function buildAspectRatioPlanSet(plan: VeronicaMediaPlan) {
  return {
    landscape: {
      profile: plan.aspectProfiles.landscape ?? VERONICA_DEFAULT_LANDSCAPE_PROFILE,
      placements: plan.landscapePlacements,
    },
    portrait: {
      profile: plan.aspectProfiles.portrait ?? VERONICA_DEFAULT_PORTRAIT_PROFILE,
      placements: plan.portraitPlacements,
    },
    portraitReadinessRatio: validatePortraitReadiness(plan),
    independentCompositions:
      plan.landscapePlacements !== plan.portraitPlacements &&
      plan.landscapePlacements.length === plan.portraitPlacements.length,
  };
}
