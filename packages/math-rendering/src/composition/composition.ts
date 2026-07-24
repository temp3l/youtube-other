import { z } from "zod";
import { timingManifestSchema } from "@mediaforge/math-education";
import {
  grades57Profile,
  grades810Profile,
  validateSafeAreaAndReadability,
  validateTeacherPresence,
} from "../profiles/profiles.js";

export const mathCompositionSchema = z.strictObject({
  id: z.string(),
  width: z.literal(1920),
  height: z.literal(1080),
  fps: z.literal(30),
  durationInFrames: z.number().int().min(5400).max(9000),
  timing: timingManifestSchema,
  safeArea: z.strictObject({
    left: z.literal(96),
    right: z.literal(96),
    top: z.literal(54),
    bottom: z.literal(54),
  }),
  deterministicSeed: z.string(),
});
export function createMathComposition(
  id: string,
  timing: z.infer<typeof timingManifestSchema>
) {
  return mathCompositionSchema.parse({
    id,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: timing.durationSeconds * 30,
    timing,
    safeArea: { left: 96, right: 96, top: 54, bottom: 54 },
    deterministicSeed: id,
  });
}

export const mathSceneAssetSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  svgPath: z.string().min(1),
  svgHash: z.string().regex(/^[a-f0-9]{64}$/u),
  minimumGlyphPx: z.number().positive(),
  bounds: z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  caption: z
    .strictObject({
      text: z.string().min(1).max(180),
      lines: z.array(z.string().min(1).max(60)).min(1).max(3),
      fontSizePx: z.literal(48),
    })
    .optional(),
  teacher: z
    .strictObject({
      poseId: z.string().min(1),
      areaRatio: z.number().positive(),
    })
    .optional(),
  animation: z
    .strictObject({
      mode: z.literal("progressive-chalk-reveal"),
      rendererVersion: z.literal("math-semantic-chalk.v4"),
      cues: z
        .array(
          z.strictObject({
            factId: z.string().regex(/^[a-z][a-z0-9-]*$/u),
            frame: z.number().int().nonnegative(),
          })
        )
        .optional(),
      activity: z.enum(["standard", "think-pause"]).optional(),
    })
    .optional(),
});
export type MathSceneAsset = z.infer<typeof mathSceneAssetSchema>;

export function createReadyMathComposition(
  id: string,
  timing: z.infer<typeof timingManifestSchema>,
  profileId: "grades-5-7-v1" | "grades-8-10-v1",
  rawScenes: readonly MathSceneAsset[]
) {
  const composition = createMathComposition(id, timing);
  if (rawScenes.length !== timing.scenes.length)
    throw new Error(
      "Every synchronized scene requires one explicit visual component."
    );
  const profile =
    profileId === "grades-5-7-v1" ? grades57Profile : grades810Profile;
  const scenes = rawScenes.map((raw, index) => {
    const scene = mathSceneAssetSchema.parse(raw);
    if (scene.sceneId !== timing.scenes[index]?.sceneId)
      throw new Error(
        `Visual component is missing or reordered at ${timing.scenes[index]?.sceneId}.`
      );
    const sceneFrames =
      (timing.scenes[index]?.endFrame ?? 0) -
      (timing.scenes[index]?.startFrame ?? 0);
    if (scene.caption && sceneFrames < 60)
      throw new Error(
        `Caption dwell time is below two seconds in ${scene.sceneId}.`
      );
    if (
      scene.animation?.cues?.some((cue) => cue.frame >= sceneFrames) ||
      new Set(scene.animation?.cues?.map((cue) => cue.factId) ?? []).size !==
        (scene.animation?.cues?.length ?? 0)
    )
      throw new Error(
        `Animation cues are duplicated or outside ${scene.sceneId}.`
      );
    validateSafeAreaAndReadability(profile, scene.bounds, scene.minimumGlyphPx);
    if (scene.teacher && scene.teacher.areaRatio > profile.maxTeacherAreaRatio)
      throw new Error("Teacher exceeds 25 percent of the frame.");
    return scene;
  });
  const teacherFrames = scenes.reduce((total, scene, index) => {
    if (!scene.teacher) return total;
    const timingScene = timing.scenes[index];
    return (
      total + (timingScene ? timingScene.endFrame - timingScene.startFrame : 0)
    );
  }, 0);
  validateTeacherPresence(teacherFrames, composition.durationInFrames);
  return { ...composition, profile: profile.id, scenes };
}
