import { z } from "zod";

import { lessonIdSchema } from "../domain/identity.js";

import {
  affectedMathSemanticStages,
  mathSemanticStageSchema,
  mathSemanticVersionVectorSchema,
  type MathSemanticStage,
  type MathSemanticVersionVector,
} from "./semantic-cache.js";

export const lessonRevalidationReasonCodeSchema = z.enum([
  "SEMANTIC_VECTOR_CURRENT",
  "LESSON_CONTRACT_CHANGED",
  "NARRATION_SEMANTICS_CHANGED",
  "SCENE_PLAN_SEMANTICS_CHANGED",
]);
export type LessonRevalidationReasonCode = z.infer<
  typeof lessonRevalidationReasonCodeSchema
>;

export const lessonRevalidationDispositionSchema = z.enum([
  "compliant",
  "narration-regeneration",
  "scene-plan-regeneration",
  "full-regeneration",
]);
export type LessonRevalidationDisposition = z.infer<
  typeof lessonRevalidationDispositionSchema
>;

export const mathLessonRevalidationInputSchema = z.strictObject({
  profile: z.literal("mathematics-education"),
  lessonId: lessonIdSchema,
  existing: mathSemanticVersionVectorSchema,
  current: mathSemanticVersionVectorSchema,
});

export const mathLessonRevalidationResultSchema = z.strictObject({
  profile: z.literal("mathematics-education"),
  lessonId: z.string().min(1),
  mode: z.literal("dry-run"),
  mutatesArtifacts: z.literal(false),
  automaticRegeneration: z.literal(false),
  disposition: lessonRevalidationDispositionSchema,
  reasonCodes: z.array(lessonRevalidationReasonCodeSchema).min(1),
  affectedStages: z.array(mathSemanticStageSchema),
  nextCommand: z.string().min(1),
});
export type MathLessonRevalidationResult = z.infer<
  typeof mathLessonRevalidationResultSchema
>;

function differs(
  previous: MathSemanticVersionVector,
  current: MathSemanticVersionVector,
  keys: readonly (keyof MathSemanticVersionVector)[]
): boolean {
  return keys.some((key) => previous[key] !== current[key]);
}

function commandFor(
  lessonId: string,
  disposition: LessonRevalidationDisposition
): string {
  if (disposition === "compliant")
    return `mediaforge math lesson validate --lesson ${lessonId}`;
  if (disposition === "narration-regeneration")
    return `mediaforge math lesson regenerate --lesson ${lessonId} --stage narration --dry-run`;
  if (disposition === "scene-plan-regeneration")
    return `mediaforge math lesson regenerate --lesson ${lessonId} --stage scene-plan --dry-run`;
  return `mediaforge math lesson regenerate --lesson ${lessonId} --stage lesson-spec --dry-run`;
}

/** Classifies legacy math artefacts without mutating them or triggering work. */
export function revalidateMathLessonDryRun(input: unknown): MathLessonRevalidationResult {
  const parsed = mathLessonRevalidationInputSchema.parse(input);
  const affectedStages = affectedMathSemanticStages({
    previous: parsed.existing,
    current: parsed.current,
  });
  const full = differs(parsed.existing, parsed.current, [
    "lessonSchemaVersion",
    "canonicalMathModelVersion",
    "gradeProfileVersion",
    "promptVersion",
  ]);
  const narration = differs(parsed.existing, parsed.current, [
    "narrationCompilerVersion",
    "numberVerbalizerVersion",
    "locale",
    "voicePresetVersion",
  ]);
  const scene = parsed.existing.rendererVersion !== parsed.current.rendererVersion;
  const disposition: LessonRevalidationDisposition = full
    ? "full-regeneration"
    : scene
      ? "scene-plan-regeneration"
      : narration
        ? "narration-regeneration"
        : "compliant";
  const reasonCodes: LessonRevalidationReasonCode[] = full
    ? ["LESSON_CONTRACT_CHANGED"]
    : scene
      ? ["SCENE_PLAN_SEMANTICS_CHANGED"]
      : narration
        ? ["NARRATION_SEMANTICS_CHANGED"]
        : ["SEMANTIC_VECTOR_CURRENT"];
  return mathLessonRevalidationResultSchema.parse({
    profile: "mathematics-education",
    lessonId: parsed.lessonId,
    mode: "dry-run",
    mutatesArtifacts: false,
    automaticRegeneration: false,
    disposition,
    reasonCodes,
    affectedStages,
    nextCommand: commandFor(parsed.lessonId, disposition),
  });
}
