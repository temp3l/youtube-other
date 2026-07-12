import { type LessonVariantSpecification } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";

const expectedProfiles = {
  foundation: {
    scaffolding: "high",
    abstraction: "concrete",
    reasoningDepth: "guided",
    pacingProfile: "slowed",
    numberComplexity: "bounded",
    challengeMode: "guided-application",
    workedExamples: 2,
    challengeSteps: 2,
  },
  standard: {
    scaffolding: "moderate",
    abstraction: "mixed",
    reasoningDepth: "independent",
    pacingProfile: "balanced",
    numberComplexity: "grade-level",
    challengeMode: "independent-application",
    workedExamples: 1,
    challengeSteps: 2,
  },
  challenge: {
    scaffolding: "low",
    abstraction: "symbolic",
    reasoningDepth: "transfer",
    pacingProfile: "compressed",
    numberComplexity: "extended",
    challengeMode: "novel-transfer",
    workedExamples: 1,
    challengeSteps: 3,
  },
} as const;

export function lessonStructuralSignature(
  lesson: LessonVariantSpecification
): string {
  return canonicalHash({
    workedExamples: lesson.workedExamples.map((example) =>
      example.steps.map((step) =>
        step.factId.replace(/example-?\d*/gu, "example")
      )
    ),
    challengeSteps: lesson.challenge.steps.map((step) => step.factId),
    scenes: lesson.scenes.map((scene) => ({
      sceneFunction: scene.sceneFunction,
      factCount: scene.factIds.length,
      processCompetencyCount: scene.processCompetencies.length,
      visualComponent: scene.visualComponent,
      plannedDurationSeconds: scene.plannedDurationSeconds,
    })),
    checkKinds: lesson.checks.map((check) => check.kind),
  });
}

export function assertNotNearDuplicateLessons(
  left: LessonVariantSpecification,
  right: LessonVariantSpecification
): void {
  if (lessonStructuralSignature(left) === lessonStructuralSignature(right))
    throw new Error(
      "Near-duplicate lessons differ only in labels, prose, or number material."
    );
}

export function validateVariantDifferentiation(
  variants: readonly LessonVariantSpecification[]
): void {
  if (
    variants.length !== 3 ||
    new Set(variants.map((item) => item.variant)).size !== 3
  )
    throw new Error("Exactly three variants are required.");
  if (new Set(variants.map((item) => item.skillId)).size !== 1)
    throw new Error("Variants must stay inside one skill boundary.");
  if (new Set(variants.map((item) => item.learningObjective)).size !== 1)
    throw new Error("Variants must share one learning objective.");
  for (const variant of variants) {
    const expected = expectedProfiles[variant.variant];
    for (const key of ["scaffolding", "abstraction", "reasoningDepth"] as const)
      if (variant[key] !== expected[key])
        throw new Error(`${variant.lessonId} has invalid ${key} semantics.`);
    for (const key of [
      "pacingProfile",
      "numberComplexity",
      "challengeMode",
    ] as const)
      if (variant.variantSemantics[key] !== expected[key])
        throw new Error(`${variant.lessonId} has invalid ${key} semantics.`);
    if (variant.workedExamples.length !== expected.workedExamples)
      throw new Error(`${variant.lessonId} has the wrong example structure.`);
    if (variant.challenge.steps.length !== expected.challengeSteps)
      throw new Error(
        `${variant.lessonId} has an incomplete challenge structure.`
      );
    if (
      variant.scenes.reduce(
        (total, scene) => total + scene.plannedDurationSeconds,
        0
      ) !== variant.targetDurationSeconds
    )
      throw new Error(
        `${variant.lessonId} pacing does not match its duration.`
      );
    if (
      !variant.scenes.some((scene) =>
        scene.processCompetencies.includes(variant.processCompetency)
      )
    )
      throw new Error(
        `${variant.lessonId} does not visualize its process competency.`
      );
    const facts = new Map(variant.facts.map((fact) => [fact.factId, fact]));
    const challengeSolution = facts.get(variant.challenge.solutionFactId);
    if (!challengeSolution)
      throw new Error(
        `${variant.lessonId} challenge solution fact is missing.`
      );
    const workedSolutionHashes = variant.workedExamples.map((example) => {
      const fact = facts.get(example.solutionFactId);
      if (!fact)
        throw new Error(`${variant.lessonId} worked solution fact is missing.`);
      return canonicalHash(fact.semantic);
    });
    if (
      workedSolutionHashes.includes(canonicalHash(challengeSolution.semantic))
    )
      throw new Error(
        `${variant.lessonId} repeats a worked example as its challenge.`
      );
    for (const example of [...variant.workedExamples, variant.challenge]) {
      if (example.steps.length === 0 || !facts.has(example.solutionFactId))
        throw new Error(`${variant.lessonId} has no complete solution.`);
      for (const step of example.steps)
        if (!facts.has(step.factId))
          throw new Error(
            `${variant.lessonId} step ${step.stepId} has no fact.`
          );
    }
  }
  if (new Set(variants.map(lessonStructuralSignature)).size !== variants.length)
    throw new Error(
      "Near-duplicate variants differ only in labels, prose, or number material."
    );
}
