import {
  imagePromptSchema,
  sceneIdSchema,
  transcriptSegmentIdSchema,
  scenePlanSchema,
  type ImagePrompt,
  type RewrittenScript,
  type Scene,
  type ScenePlan,
  type Transcript
} from "@mediaforge/domain";
import { sceneFilename, safeTimestampToken } from "@mediaforge/shared";

export interface ScenePlanner {
  plan(
    transcript: Transcript,
    script: RewrittenScript,
    aspectRatios?: ReadonlyArray<"16:9" | "9:16">,
    options?: { readonly visualSceneMinSeconds?: number; readonly visualSceneMaxSeconds?: number }
  ): ScenePlan;
}

function buildScenePrompt(sceneNumber: number, scriptText: string, aspectRatio: "16:9" | "9:16"): string {
  return [
    `Create a rough hand-drawn ink-and-paper collage for scene ${String(sceneNumber).padStart(3, "0")}.`,
    `Aspect ratio: ${aspectRatio}.`,
    `Subject matter: ${scriptText}`,
    "Keep the composition hand-drawn, imperfect, and visually direct.",
    "Use simple expressive people and animals when they help explain the scene.",
    "Avoid borders, bands, frames, cinematic polish, text, logos, and watermarks unless explicitly required."
  ].join(" ");
}

function buildSceneId(sequenceNumber: number): `scene-${string}` {
  return `scene-${String(sequenceNumber).padStart(3, "0")}` as `scene-${string}`;
}

export class OneToOneScenePlanner implements ScenePlanner {
  public plan(
    transcript: Transcript,
    script: RewrittenScript,
    aspectRatios: ReadonlyArray<"16:9" | "9:16"> = ["16:9", "9:16"],
    options: { readonly visualSceneMinSeconds?: number; readonly visualSceneMaxSeconds?: number } = {}
  ): ScenePlan {
    const subtitleSegments =
      transcript.segments.length > 0
        ? transcript.segments
        : transcript.text.split(/(?<=[.!?])\s+/u).map((text, index) => ({
            id: transcriptSegmentIdSchema.parse(`segment-${String(index + 1).padStart(3, "0")}`),
            startSeconds: index * 4,
            endSeconds: index * 4 + 4,
            text,
            words: [],
            boundaryReason: "end-of-transcript" as const
          }));
    const grouped: Array<typeof subtitleSegments> = [];
    const minDurationSeconds = options.visualSceneMinSeconds ?? 8;
    const maxDurationSeconds = options.visualSceneMaxSeconds ?? 18;
    const targetDurationSeconds = (minDurationSeconds + maxDurationSeconds) / 2;
    let buffer: typeof subtitleSegments = [];
    const flush = (): void => {
      if (buffer.length === 0) {
        return;
      }
      grouped.push(buffer);
      buffer = [];
    };
    for (const segment of subtitleSegments) {
      buffer = [...buffer, segment];
      const durationSeconds = (buffer[buffer.length - 1]?.endSeconds ?? 0) - (buffer[0]?.startSeconds ?? 0);
      if (durationSeconds >= minDurationSeconds && (durationSeconds >= targetDurationSeconds || durationSeconds >= maxDurationSeconds)) {
        flush();
      }
    }
    flush();
    const scenes: Scene[] = grouped.map((group, index) => {
      const sequenceNumber = index + 1;
      const startSeconds = group[0]?.startSeconds ?? 0;
      const endSeconds = group[group.length - 1]?.endSeconds ?? startSeconds;
      const sceneId = sceneIdSchema.parse(buildSceneId(sequenceNumber));
      const narration = group.map((segment) => segment.text).join(" ").trim();
      return {
        id: sceneId,
        sequenceNumber,
        canonicalNarration: narration.length > 0 ? narration : script.sections[index]?.text ?? transcript.text,
        sourceSegmentIds: group.map((segment) => segment.id),
        estimatedDurationSeconds: Math.max(1, endSeconds - startSeconds),
        timing: {
          startSeconds,
          endSeconds
        },
        visualPurpose: "Depict the narrated concept clearly and directly.",
        subject: "subject inferred from narration",
        action: "static illustrative action",
        setting: "appropriate scene setting",
        composition: "balanced editorial composition with safe overlay area",
        cameraFraming: "medium shot",
        mood: "informative",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no watermark", "no extra limbs", "no unreadable text"],
        aspectRatios: [...aspectRatios],
        imagePrompt: buildScenePrompt(sequenceNumber, narration.length > 0 ? narration : script.sections[index]?.text ?? transcript.text, aspectRatios[0] ?? "16:9"),
        expectedImageFilenames: aspectRatios.map((aspectRatio) => sceneFilename(sequenceNumber, startSeconds, endSeconds, aspectRatio)),
        qualityStatus: "draft"
      };
    });
    return scenePlanSchema.parse({
      sourceId: transcript.sourceId,
      scenes
    });
  }
}

export function createImagePrompts(scenePlan: ScenePlan, aspectRatio: "16:9" | "9:16"): ImagePrompt[] {
  return scenePlan.scenes.map((scene) =>
    imagePromptSchema.parse({
      sceneId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      aspectRatio,
      timestampStart: scene.timing.startSeconds,
      timestampEnd: scene.timing.endSeconds,
      visualPurpose: scene.visualPurpose,
      prompt: scene.imagePrompt,
      negativePrompt: scene.negativeConstraints.join(", "),
      continuity: scene.continuityReferences.join("; "),
      expectedFilename: sceneFilename(scene.sequenceNumber, scene.timing.startSeconds, scene.timing.endSeconds, aspectRatio)
    })
  );
}

export function sortScenesByTiming(plan: ScenePlan): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: plan.sourceId,
    scenes: [...plan.scenes].sort((left, right) => left.sequenceNumber - right.sequenceNumber)
  });
}

export function sceneTimestampLabel(scene: Scene): string {
  return `${safeTimestampToken(scene.timing.startSeconds)}-${safeTimestampToken(scene.timing.endSeconds)}`;
}
