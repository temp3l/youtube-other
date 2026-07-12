import { z } from "zod";
import { type LessonVariantSpecification } from "../domain/index.js";
import { type LocalizedNarration } from "../localization/localization.js";

export const timingManifestSchema = z.strictObject({
  artifactVersion: z.literal("math-timing.v1"),
  fps: z.literal(30),
  durationSeconds: z.number().min(180).max(300),
  scenes: z
    .array(
      z.strictObject({
        sceneId: z.string(),
        startFrame: z.number().int().nonnegative(),
        endFrame: z.number().int().positive(),
        segmentId: z.string(),
        cueFrames: z.array(z.number().int().nonnegative()),
      })
    )
    .length(9),
});
export type TimingManifest = z.infer<typeof timingManifestSchema>;

export function createTimingManifest(
  lesson: LessonVariantSpecification,
  narration: LocalizedNarration,
  durations?: readonly number[]
): TimingManifest {
  const weights =
    durations ?? lesson.scenes.map((scene) => scene.plannedDurationSeconds);
  if (
    weights.length !== 9 ||
    weights.some((duration) => !Number.isFinite(duration) || duration <= 0)
  )
    throw new Error("Nine positive timing durations are required.");
  const target = lesson.targetDurationSeconds;
  const scale = target / weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const scenes = lesson.scenes.map((scene, index) => {
    const frames =
      index === 8
        ? target * 30 - cursor
        : Math.round((weights[index] ?? 0) * scale * 30);
    const startFrame = cursor;
    const endFrame = startFrame + frames;
    cursor = endFrame;
    const segment = narration.segments[index];
    if (!segment || segment.sceneId !== scene.sceneId)
      throw new Error(`Narration/timing scene mismatch at ${scene.sceneId}.`);
    return {
      sceneId: scene.sceneId,
      startFrame,
      endFrame,
      segmentId: segment.segmentId,
      cueFrames: scene.factIds.map(
        (_, factIndex) =>
          startFrame +
          Math.max(
            1,
            Math.floor((frames * (factIndex + 1)) / (scene.factIds.length + 1))
          )
      ),
    };
  });
  if (
    !lesson.scenes.some((scene) => scene.sceneFunction === "think-pause") ||
    !lesson.scenes.some((scene) => scene.sceneFunction === "solution")
  )
    throw new Error("Think pause and solution scenes are required.");
  return timingManifestSchema.parse({
    artifactVersion: "math-timing.v1",
    fps: 30,
    durationSeconds: target,
    scenes,
  });
}
