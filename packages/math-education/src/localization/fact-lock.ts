import { z } from "zod";
import { type LessonVariantSpecification } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";

export const factLockManifestSchema = z.strictObject({
  artifactVersion: z.literal("math-fact-lock.v2"),
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  variant: z.enum(["foundation", "standard", "challenge"]),
  objectiveHash: z.string().length(64),
  lessonContentHash: z.string().length(64),
  workedExamples: z.array(
    z.strictObject({
      exampleId: z.string(),
      stepOrder: z.array(z.string()),
      stepFactIds: z.array(z.string()),
      solutionFactId: z.string(),
    })
  ),
  challenge: z.strictObject({
    exampleId: z.string(),
    stepOrder: z.array(z.string()),
    stepFactIds: z.array(z.string()),
    solutionFactId: z.string(),
  }),
  commonMistakeHash: z.string().length(64),
  scenes: z.array(
    z.strictObject({
      sceneId: z.string(),
      sceneFunction: z.string(),
      factIds: z.array(z.string()),
      processCompetencies: z.array(z.string()),
    })
  ),
  facts: z.array(
    z.strictObject({
      factId: z.string(),
      semanticHash: z.string().length(64),
      checkIds: z.array(z.string()),
      lineageHash: z.string().length(64),
    })
  ),
  checkOrder: z.array(z.string()),
  factLockHash: z.string().length(64),
});
export type FactLockManifest = z.infer<typeof factLockManifestSchema>;

function exampleLock(example: LessonVariantSpecification["challenge"]) {
  return {
    exampleId: example.exampleId,
    stepOrder: example.steps.map((step) => step.stepId),
    stepFactIds: example.steps.map((step) => step.factId),
    solutionFactId: example.solutionFactId,
  };
}

export function buildFactLock(
  lesson: LessonVariantSpecification
): FactLockManifest {
  const value = {
    artifactVersion: "math-fact-lock.v2" as const,
    lessonId: lesson.lessonId,
    skillId: lesson.skillId,
    variant: lesson.variant,
    objectiveHash: canonicalHash(lesson.learningObjective),
    lessonContentHash: lesson.contentHash,
    workedExamples: lesson.workedExamples.map(exampleLock),
    challenge: exampleLock(lesson.challenge),
    commonMistakeHash: canonicalHash(lesson.commonMistake),
    scenes: lesson.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneFunction: scene.sceneFunction,
      factIds: scene.factIds,
      processCompetencies: scene.processCompetencies,
    })),
    facts: lesson.facts.map((fact) => ({
      factId: fact.factId,
      semanticHash: canonicalHash(fact.semantic),
      checkIds: fact.checkIds,
      lineageHash: canonicalHash(fact.lineage),
    })),
    checkOrder: lesson.checks.map((check) => check.checkId),
  };
  return factLockManifestSchema.parse({
    ...value,
    factLockHash: canonicalHash(value),
  });
}

export function assertFactLock(
  lesson: LessonVariantSpecification,
  expected: FactLockManifest
): void {
  const actual = buildFactLock(lesson);
  if (actual.factLockHash !== expected.factLockHash)
    throw new Error(
      `Fact lock mismatch for ${lesson.lessonId}: lesson semantics or order changed.`
    );
}
