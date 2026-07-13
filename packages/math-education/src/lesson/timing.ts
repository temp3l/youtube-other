import { z } from "zod";
import { type LessonVariantSpecification } from "../domain/index.js";
import { type LocalizedNarration } from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";

const MATH_TIMING_FPS = 30;

const timingManifestFieldsSchema = z.strictObject({
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
export const timingManifestSchema = timingManifestFieldsSchema.superRefine(
  (value, context) => {
    let cursor = 0;
    const segmentIds = new Set<string>();
    for (const [index, scene] of value.scenes.entries()) {
      if (scene.startFrame !== cursor)
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "startFrame"],
          message: "Timing scenes must form a continuous, gap-free timeline.",
        });
      if (scene.endFrame <= scene.startFrame)
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "endFrame"],
          message: "Timing scenes must contain at least one frame.",
        });
      if (segmentIds.has(scene.segmentId))
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "segmentId"],
          message: "Timing segment ids must be unique.",
        });
      segmentIds.add(scene.segmentId);
      for (const [cueIndex, cueFrame] of scene.cueFrames.entries())
        if (cueFrame < scene.startFrame || cueFrame >= scene.endFrame)
          context.addIssue({
            code: "custom",
            path: ["scenes", index, "cueFrames", cueIndex],
            message: "Every visual cue must remain inside its scene.",
          });
      cursor = scene.endFrame;
    }
    if (cursor !== Math.round(value.durationSeconds * value.fps))
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Timing duration must match the final synchronized frame.",
      });
  }
);
export type TimingManifest = z.infer<typeof timingManifestSchema>;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const metadataTimingEvidenceSchema = z.strictObject({
  artifactVersion: z.literal("math-metadata-timing-evidence.v1"),
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  variant: z.enum(["foundation", "standard", "challenge"]),
  language: z.enum(["de", "en", "es", "fr", "pt"]),
  lessonContentHash: hashSchema,
  localizationHash: hashSchema,
  timingPayloadHash: hashSchema,
  durationSeconds: z.number().min(180).max(300),
  orderedSceneIds: z.array(z.string()).length(9),
  orderedSegmentIds: z.array(z.string()).length(9),
  timing: timingManifestSchema,
});
export type MetadataTimingEvidence = z.infer<typeof metadataTimingEvidenceSchema>;

export function createMetadataTimingEvidence(
  lesson: LessonVariantSpecification,
  localization: LocalizedNarration,
  timing: TimingManifest
): MetadataTimingEvidence {
  const parsedTiming = timingManifestSchema.parse(timing);
  const { contentHash: _contentHash, ...lessonPayload } = lesson;
  if (lesson.contentHash !== canonicalHash(lessonPayload))
    throw new Error("Lesson content hash is stale.");
  if (
    localization.lessonId !== lesson.lessonId ||
    localization.variant !== lesson.variant ||
    parsedTiming.scenes.some((scene, index) =>
      scene.sceneId !== lesson.scenes[index]?.sceneId ||
      scene.segmentId !== localization.segments[index]?.segmentId
    )
  ) throw new Error("Timing evidence identity does not match lesson/localization.");
  return metadataTimingEvidenceSchema.parse({
    artifactVersion: "math-metadata-timing-evidence.v1",
    lessonId: lesson.lessonId,
    skillId: lesson.skillId,
    variant: lesson.variant,
    language: localization.language,
    lessonContentHash: lesson.contentHash,
    localizationHash: localization.contentHash,
    timingPayloadHash: canonicalHash(parsedTiming),
    durationSeconds: parsedTiming.durationSeconds,
    orderedSceneIds: parsedTiming.scenes.map((scene) => scene.sceneId),
    orderedSegmentIds: parsedTiming.scenes.map((scene) => scene.segmentId),
    timing: parsedTiming,
  });
}

export const narrationAudioTimingSchema = z.strictObject({
  segmentId: z.string().regex(/^segment-\d{3}$/u),
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  durationSeconds: z.number().positive(),
  cueOffsetsSeconds: z.array(z.number().nonnegative()).optional(),
});
export type NarrationAudioTiming = z.infer<typeof narrationAudioTimingSchema>;

function cueFramesForSegment(
  startFrame: number,
  frames: number,
  factCount: number,
  audio: NarrationAudioTiming
): number[] {
  const offsets =
    audio.cueOffsetsSeconds ??
    Array.from(
      { length: factCount },
      (_, index) => (audio.durationSeconds * (index + 1)) / (factCount + 1)
    );
  if (offsets.length !== factCount)
    throw new Error(
      `Audio cue count does not match displayed facts for ${audio.segmentId}.`
    );
  return offsets.map((offset) => {
    if (
      !Number.isFinite(offset) ||
      offset < 0 ||
      offset >= audio.durationSeconds
    )
      throw new Error(`Audio cue is outside ${audio.segmentId}.`);
    return Math.min(
      startFrame + frames - 1,
      startFrame + Math.round(offset * MATH_TIMING_FPS)
    );
  });
}

function allocateNarrationFrames(
  audio: readonly NarrationAudioTiming[]
): { durationSeconds: number; totalFrames: number; segmentFrames: number[] } {
  const durationSeconds = audio.reduce(
    (total, segment) => total + segment.durationSeconds,
    0
  );
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 180 ||
    durationSeconds > 300
  )
    throw new Error(
      `Narration-driven duration ${durationSeconds.toFixed(3)}s is outside 180-300 seconds.`
    );
  const totalFrames = Math.round(durationSeconds * MATH_TIMING_FPS);
  let assignedFrames = 0;
  const segmentFrames = audio.map((segment, index) => {
    const frames =
      index === audio.length - 1
        ? totalFrames - assignedFrames
        : Math.round(segment.durationSeconds * MATH_TIMING_FPS);
    if (frames <= 0)
      throw new Error(`Audio segment ${segment.segmentId} has no frames.`);
    assignedFrames += frames;
    return frames;
  });
  if (assignedFrames !== totalFrames)
    throw new Error("Audio frame allocation did not reconcile to its total.");
  return { durationSeconds, totalFrames, segmentFrames };
}

export function createNarrationDrivenTiming(
  narration: LocalizedNarration,
  rawAudio: readonly NarrationAudioTiming[]
): TimingManifest {
  const audio = rawAudio.map((segment) =>
    narrationAudioTimingSchema.parse(segment)
  );
  if (audio.length !== 9)
    throw new Error("Nine narration audio segments are required.");
  const allocation = allocateNarrationFrames(audio);
  let cursor = 0;
  const scenes = narration.segments.map((segment, index) => {
    const audioSegment = audio[index];
    if (
      !audioSegment ||
      audioSegment.segmentId !== segment.segmentId ||
      audioSegment.sceneId !== segment.sceneId
    )
      throw new Error(
        `Narration/audio identity mismatch at ${segment.segmentId}.`
      );
    const frames = allocation.segmentFrames[index];
    if (!frames) throw new Error(`Audio segment ${segment.segmentId} has no frames.`);
    const startFrame = cursor;
    const endFrame = startFrame + frames;
    cursor = endFrame;
    return {
      sceneId: segment.sceneId,
      startFrame,
      endFrame,
      segmentId: segment.segmentId,
      cueFrames: cueFramesForSegment(
        startFrame,
        frames,
        segment.factIds.length,
        audioSegment
      ),
    };
  });
  return timingManifestSchema.parse({
    artifactVersion: "math-timing.v1",
    fps: MATH_TIMING_FPS,
    durationSeconds: allocation.totalFrames / MATH_TIMING_FPS,
    scenes,
  });
}

export function assertTimingSynchronization(
  timing: TimingManifest,
  rawAudio: readonly NarrationAudioTiming[],
  factCounts: readonly number[],
  maxCueDriftFrames = 2
): void {
  if (
    !Number.isFinite(maxCueDriftFrames) ||
    !Number.isInteger(maxCueDriftFrames) ||
    maxCueDriftFrames < 0
  )
    throw new Error(
      "Maximum cue drift must be a finite, non-negative whole number of frames."
    );
  const parsed = timingManifestSchema.parse(timing);
  const audio = rawAudio.map((segment) =>
    narrationAudioTimingSchema.parse(segment)
  );
  if (
    audio.length !== parsed.scenes.length ||
    factCounts.length !== parsed.scenes.length
  )
    throw new Error("Timing, audio, and fact-count lengths must match.");
  if (
    factCounts.some(
      (count) => !Number.isFinite(count) || !Number.isInteger(count) || count < 0
    )
  )
    throw new Error("Fact counts must be finite, non-negative integers.");
  const allocation = allocateNarrationFrames(audio);
  if (
    allocation.totalFrames !==
    Math.round(parsed.durationSeconds * parsed.fps)
  )
    throw new Error("Timing duration does not match narration audio frames.");
  let expectedStartFrame = 0;
  for (const [index, scene] of parsed.scenes.entries()) {
    const segment = audio[index];
    if (
      !segment ||
      segment.segmentId !== scene.segmentId ||
      segment.sceneId !== scene.sceneId
    )
      throw new Error(`Timing/audio identity mismatch at ${scene.segmentId}.`);
    const expectedFrames = allocation.segmentFrames[index];
    if (
      expectedFrames === undefined ||
      scene.startFrame !== expectedStartFrame ||
      scene.endFrame !== expectedStartFrame + expectedFrames
    )
      throw new Error(
        `Timing scene span does not match audio frames in ${scene.sceneId}.`
      );
    expectedStartFrame += expectedFrames;
    const expected = cueFramesForSegment(
      scene.startFrame,
      scene.endFrame - scene.startFrame,
      factCounts[index] ?? 0,
      segment
    );
    if (
      expected.length !== scene.cueFrames.length ||
      expected.some(
        (frame, cueIndex) =>
          Math.abs(
            frame - (scene.cueFrames[cueIndex] ?? Number.POSITIVE_INFINITY)
          ) > maxCueDriftFrames
      )
    )
      throw new Error(
        `Visual cue drift exceeds ${maxCueDriftFrames} frames in ${scene.sceneId}.`
      );
  }
}

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
