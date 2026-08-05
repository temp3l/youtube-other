import { z } from "zod";

import { canonicalHash } from "../verification/canonical-json.js";

const versionSchema = z.string().min(1).max(160);

/** Math-only semantic inputs. Non-math artefacts deliberately cannot use this key. */
export const mathSemanticVersionVectorSchema = z.strictObject({
  profile: z.literal("mathematics-education"),
  lessonSchemaVersion: versionSchema,
  canonicalMathModelVersion: versionSchema,
  gradeProfileVersion: versionSchema,
  narrationCompilerVersion: versionSchema,
  numberVerbalizerVersion: versionSchema,
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
  voicePresetVersion: versionSchema,
  rendererVersion: versionSchema,
  promptVersion: versionSchema,
});
export type MathSemanticVersionVector = z.infer<
  typeof mathSemanticVersionVectorSchema
>;

export const mathSemanticStageSchema = z.enum([
  "lesson-spec",
  "canonical-narration",
  "scene-plan",
  "subtitles",
  "tts",
  "timing",
  "render",
  "metadata",
  "quality-report",
]);
export type MathSemanticStage = z.infer<typeof mathSemanticStageSchema>;

export const mathSemanticCacheKeySchema = z.strictObject({
  profile: z.literal("mathematics-education"),
  lessonId: z.string().min(1),
  versionVector: mathSemanticVersionVectorSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type MathSemanticCacheKey = z.infer<typeof mathSemanticCacheKeySchema>;

export function createMathSemanticCacheKey(input: {
  readonly lessonId: string;
  readonly versionVector: MathSemanticVersionVector;
}): MathSemanticCacheKey {
  const versionVector = mathSemanticVersionVectorSchema.parse(input.versionVector);
  const payload = {
    profile: "mathematics-education" as const,
    lessonId: z.string().min(1).parse(input.lessonId),
    versionVector,
  };
  return mathSemanticCacheKeySchema.parse({
    ...payload,
    fingerprint: canonicalHash(payload),
  });
}

const downstream: Readonly<Record<MathSemanticStage, readonly MathSemanticStage[]>> = {
  "lesson-spec": ["canonical-narration", "scene-plan"],
  "canonical-narration": ["subtitles", "tts"],
  "scene-plan": ["timing", "render"],
  subtitles: ["quality-report"],
  tts: ["timing"],
  timing: ["render"],
  render: ["metadata", "quality-report"],
  metadata: ["quality-report"],
  "quality-report": [],
};

function downstreamClosure(starts: readonly MathSemanticStage[]): MathSemanticStage[] {
  const affected = new Set<MathSemanticStage>();
  const queue = [...starts];
  while (queue.length > 0) {
    const stage = queue.shift();
    if (!stage || affected.has(stage)) continue;
    affected.add(stage);
    queue.push(...downstream[stage]);
  }
  return mathSemanticStageSchema.options.filter((stage) => affected.has(stage));
}

/**
 * Determines only which math artefacts are stale. It never deletes, rewrites,
 * or schedules regeneration; an operator must execute the returned command.
 */
export function affectedMathSemanticStages(input: {
  readonly previous: MathSemanticVersionVector;
  readonly current: MathSemanticVersionVector;
}): readonly MathSemanticStage[] {
  const previous = mathSemanticVersionVectorSchema.parse(input.previous);
  const current = mathSemanticVersionVectorSchema.parse(input.current);
  const changed = (key: keyof MathSemanticVersionVector) => previous[key] !== current[key];
  const starts: MathSemanticStage[] = [];
  if (
    changed("lessonSchemaVersion") ||
    changed("canonicalMathModelVersion") ||
    changed("gradeProfileVersion") ||
    changed("promptVersion")
  ) starts.push("lesson-spec");
  if (
    changed("narrationCompilerVersion") ||
    changed("numberVerbalizerVersion") ||
    changed("locale") ||
    changed("voicePresetVersion")
  ) starts.push("canonical-narration");
  if (changed("rendererVersion")) starts.push("scene-plan");
  return downstreamClosure(starts);
}

export const MATH_CACHE_REGENERATION_POLICY = "operator-action-required.v1" as const;

