import {
  type CurriculumSkill,
  type LessonVariant,
  type LessonVariantSpecification,
  createLessonId,
  lessonVariantSpecificationSchema,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  reviewedLessonFixture,
  type LessonSpecificationFixture,
} from "./lesson-specification-fixtures.js";

export interface LessonSpecificationProvider {
  load(
    skillId: string,
    variant: LessonVariant
  ): LessonSpecificationFixture | null;
}

export const reviewedFixtureLessonProvider: LessonSpecificationProvider = {
  load: reviewedLessonFixture,
};

const variantProfiles = {
  foundation: {
    scaffolding: "high",
    abstraction: "concrete",
    reasoningDepth: "guided",
    pacingProfile: "slowed",
    numberComplexity: "bounded",
    challengeMode: "guided-application",
  },
  standard: {
    scaffolding: "moderate",
    abstraction: "mixed",
    reasoningDepth: "independent",
    pacingProfile: "balanced",
    numberComplexity: "grade-level",
    challengeMode: "independent-application",
  },
  challenge: {
    scaffolding: "low",
    abstraction: "symbolic",
    reasoningDepth: "transfer",
    pacingProfile: "compressed",
    numberComplexity: "extended",
    challengeMode: "novel-transfer",
  },
} as const;

const sceneFunctions = [
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

const integer = (value: string) => ({ kind: "integer" as const, value });
const sum = (parts: readonly string[]) => ({
  kind: "sum" as const,
  operands: parts.map(integer),
});

export function buildLessonVariant(
  skill: CurriculumSkill,
  variant: LessonVariant,
  provider: LessonSpecificationProvider = reviewedFixtureLessonProvider
): LessonVariantSpecification {
  const fixture = provider.load(skill.skillId, variant);
  if (!fixture)
    throw new Error(`Unsupported lesson specification: ${skill.skillId}`);
  if (fixture.skillId !== skill.skillId || fixture.variant !== variant)
    throw new Error("Lesson fixture identity does not match the request.");
  const profile = variantProfiles[variant];
  const facts: Array<{
    factId: string;
    semantic: {
      kind: "scalar";
      expression: ReturnType<typeof integer> | ReturnType<typeof sum>;
    };
    displayLatex: string;
    checkIds: string[];
  }> = [];
  const checks: Array<{
    checkId: string;
    kind: "evaluate";
    expression: ReturnType<typeof sum>;
    expected: { kind: "scalar"; expression: ReturnType<typeof integer> };
    critical: true;
  }> = [];
  const workedExamples = fixture.examples.map((example, index) => {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const valueFactId =
      index === 0 ? "example-number" : `example${suffix}-number`;
    const expressionFactId =
      index === 0 ? "expanded-number" : `example${suffix}-expanded`;
    const checkId = `check-example${suffix}-value`;
    const expression = sum(example.parts);
    facts.push(
      {
        factId: valueFactId,
        semantic: { kind: "scalar", expression: integer(example.value) },
        displayLatex: example.value,
        checkIds: [checkId],
      },
      {
        factId: expressionFactId,
        semantic: { kind: "scalar", expression },
        displayLatex: example.parts.join("+"),
        checkIds: [checkId],
      }
    );
    checks.push({
      checkId,
      kind: "evaluate",
      expression,
      expected: { kind: "scalar", expression: integer(example.value) },
      critical: true,
    });
    return {
      exampleId: `example-reviewed${suffix || "-1"}`,
      prompt: example.prompt,
      steps: [
        {
          stepId: `step-example${suffix || "-1"}-model`,
          explanation: "Stelle die Angaben im passenden Modell dar.",
          factId: expressionFactId,
        },
        {
          stepId: `step-example${suffix || "-1"}-result`,
          explanation: "Berechne und prüfe das Ergebnis.",
          factId: valueFactId,
        },
      ],
      solutionFactId: valueFactId,
    };
  });
  const challengeExpression = sum(fixture.challenge.parts);
  facts.push(
    {
      factId: "challenge-expression",
      semantic: { kind: "scalar", expression: challengeExpression },
      displayLatex: fixture.challenge.parts.join("+"),
      checkIds: ["check-challenge-value"],
    },
    {
      factId: "challenge-solution",
      semantic: {
        kind: "scalar",
        expression: integer(fixture.challenge.value),
      },
      displayLatex: fixture.challenge.value,
      checkIds: ["check-challenge-value"],
    }
  );
  checks.push({
    checkId: "check-challenge-value",
    kind: "evaluate",
    expression: challengeExpression,
    expected: {
      kind: "scalar",
      expression: integer(fixture.challenge.value),
    },
    critical: true,
  });
  const secondExampleFacts =
    fixture.examples.length === 2
      ? ["example-2-expanded", "example-2-number"]
      : [];
  const sceneFacts = [
    [],
    [],
    ["expanded-number"],
    ["expanded-number", "example-number"],
    ["example-number"],
    secondExampleFacts.length > 0
      ? secondExampleFacts
      : ["challenge-expression"],
    ["challenge-expression"],
    ["challenge-solution"],
    ["example-number", "challenge-solution"],
  ];
  const draft = {
    artifactVersion: "lesson-spec.v1" as const,
    lessonId: createLessonId(skill.skillId, variant),
    skillId: skill.skillId,
    variant,
    learningObjective: skill.learningObjective,
    promise: fixture.promise,
    targetAudience: fixture.targetAudience,
    scaffolding: profile.scaffolding,
    abstraction: profile.abstraction,
    reasoningDepth: profile.reasoningDepth,
    variantSemantics: {
      pacingProfile: profile.pacingProfile,
      numberComplexity: profile.numberComplexity,
      challengeMode: profile.challengeMode,
      representationSequence: [fixture.modelVisual, fixture.practiceVisual],
    },
    processCompetency: skill.processCompetencies[0] ?? "REP",
    workedExamples,
    commonMistake: {
      description: fixture.commonMistake,
      correctionFactId: "example-number",
    },
    challenge: {
      exampleId: "challenge-reviewed",
      prompt: fixture.challenge.prompt,
      steps: fixture.challenge.reasoningSteps.map((explanation, index) => ({
        stepId: `step-challenge-${index + 1}`,
        explanation,
        factId:
          index === fixture.challenge.reasoningSteps.length - 1
            ? "challenge-solution"
            : "challenge-expression",
      })),
      solutionFactId: "challenge-solution",
    },
    facts,
    checks,
    scenes: sceneFunctions.map((sceneFunction, index) => ({
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction,
      factIds: sceneFacts[index] ?? [],
      processCompetencies:
        index === 2 || index === 5
          ? [skill.processCompetencies[0] ?? "REP"]
          : [],
      visualComponent:
        index === 2
          ? fixture.modelVisual
          : index === 5
            ? fixture.practiceVisual
            : index === 6
              ? ("teacher" as const)
              : ("formula" as const),
      plannedDurationSeconds: fixture.sceneDurations[index]!,
    })),
    targetDurationSeconds: 240 as const,
  };
  return lessonVariantSpecificationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
}

export function buildAllLessonVariants(
  skill: CurriculumSkill,
  provider: LessonSpecificationProvider = reviewedFixtureLessonProvider
): LessonVariantSpecification[] {
  return (["foundation", "standard", "challenge"] as const).map((variant) =>
    buildLessonVariant(skill, variant, provider)
  );
}
