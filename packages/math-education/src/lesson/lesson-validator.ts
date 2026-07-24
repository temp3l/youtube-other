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

const requiredEducationalSceneFunctions = [
  "hook",
  "objective",
  "model",
  "worked-example",
  "mistake",
  "guided-practice",
  "think-pause",
  "solution",
  "recap",
] as const;

function zeroPositionPattern(display: string): string | null {
  const digits = [...display].filter((character) => /\d/u.test(character));
  if (digits.length === 0) return null;
  const positions = digits.flatMap((digit, index) =>
    digit === "0" ? [index] : []
  );
  return positions.length > 0 ? positions.join(",") : null;
}

export function validateRequiredEducationalPractice(
  lesson: LessonVariantSpecification
): void {
  const sceneFunctions = lesson.scenes.map((scene) => scene.sceneFunction);
  if (
    sceneFunctions.join("\0") !== requiredEducationalSceneFunctions.join("\0")
  )
    throw new Error(
      `${lesson.lessonId} does not use the required educational scene sequence.`
    );

  const facts = new Map(lesson.facts.map((fact) => [fact.factId, fact]));
  const challengeSolution = facts.get(lesson.challenge.solutionFactId);
  if (!challengeSolution)
    throw new Error(
      `${lesson.lessonId} independent-example solution is missing.`
    );
  const independentSourceFactId = lesson.challenge.steps.find(
    (step) => step.factId !== lesson.challenge.solutionFactId
  )?.factId;
  const independentSource = independentSourceFactId
    ? facts.get(independentSourceFactId)
    : undefined;
  if (!independentSource)
    throw new Error(
      `${lesson.lessonId} independent-example source is missing.`
    );
  const challengeTaskHash = independentSource.lineage.sourceContentHash;
  if (
    lesson.workedExamples.some((example) => {
      const sourceFactId = example.steps.find(
        (step) => step.factId !== example.solutionFactId
      )?.factId;
      const source = sourceFactId ? facts.get(sourceFactId) : undefined;
      return source?.lineage.sourceContentHash === challengeTaskHash;
    })
  )
    throw new Error(
      `${lesson.lessonId} repeats a worked example as its independent example.`
    );

  const mistakeScene = lesson.scenes[4]!;
  if (
    mistakeScene.plannedDurationSeconds > 30 ||
    !mistakeScene.factIds.includes(lesson.commonMistake.correctionFactId)
  )
    throw new Error(
      `${lesson.lessonId} must contain a short, fact-bound misconception check.`
    );

  const independentScene = lesson.scenes[5]!;
  const thinkScene = lesson.scenes[6]!;
  const solutionScene = lesson.scenes[7]!;
  if (
    !independentSourceFactId ||
    !thinkScene.factIds.includes(independentSourceFactId) ||
    independentScene.factIds.includes(lesson.challenge.solutionFactId) ||
    thinkScene.factIds.includes(lesson.challenge.solutionFactId) ||
    !solutionScene.factIds.includes(lesson.challenge.solutionFactId)
  )
    throw new Error(
      `${lesson.lessonId} must withhold the independent-example solution until its reveal.`
    );

  const retrievalScene = lesson.scenes[8]!;
  if (retrievalScene.factIds.length !== 0)
    throw new Error(
      `${lesson.lessonId} final retrieval question must not expose answer facts.`
    );

  if (lesson.skillId === "M5-ZO-001") {
    const workedPatterns = lesson.workedExamples.map((example) => {
      const solution = facts.get(example.solutionFactId);
      return solution ? zeroPositionPattern(solution.displayLatex) : null;
    });
    const independentPattern = zeroPositionPattern(
      challengeSolution.displayLatex
    );
    if (
      workedPatterns.some((pattern) => !pattern) ||
      !independentPattern ||
      workedPatterns.includes(independentPattern)
    )
      throw new Error(
        `${lesson.lessonId} independent example must use a different zero pattern.`
      );
  }
}

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
    validateRequiredEducationalPractice(variant);
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
