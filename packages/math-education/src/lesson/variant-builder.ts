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
import { loadNumberOperationsStandardContent } from "./number-operations-standard-content.js";
import { loadFractionsDecimalsStandardContent } from "./fractions-decimals-standard-content.js";
import { loadGeometryMeasurementStandardContent } from "./geometry-measurement-standard-content.js";
import { loadDataDiagramStandardContent } from "./data-diagrams-standard-content.js";
import { validateRequiredEducationalPractice } from "./lesson-validator.js";

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

export const EDUCATIONAL_LESSON_TARGET_DURATION_SECONDS = 300 as const;

function expandedEducationalSceneDurations(
  durations: readonly number[]
): readonly number[] {
  const scale =
    EDUCATIONAL_LESSON_TARGET_DURATION_SECONDS /
    durations.reduce((total, duration) => total + duration, 0);
  const expanded = durations.map((duration) => duration * scale);
  const misconceptionOverflow = Math.max(0, (expanded[4] ?? 0) - 30);
  if (misconceptionOverflow > 0) {
    expanded[4] = 30;
    expanded[8] = (expanded[8] ?? 0) + misconceptionOverflow;
  }
  expanded[8] =
    (expanded[8] ?? 0) +
    EDUCATIONAL_LESSON_TARGET_DURATION_SECONDS -
    expanded.reduce((total, duration) => total + duration, 0);
  return expanded;
}

const integer = (value: string) => ({ kind: "integer" as const, value });
const sum = (parts: readonly string[]) => ({
  kind: "sum" as const,
  operands: parts.map(integer),
});

function buildProductionStandardLesson(
  skill: CurriculumSkill
): LessonVariantSpecification | null {
  const content =
    loadNumberOperationsStandardContent(skill) ??
    loadFractionsDecimalsStandardContent(skill) ??
    loadGeometryMeasurementStandardContent(skill) ??
    loadDataDiagramStandardContent(skill);
  if (!content) return null;
  const sceneDurations = expandedEducationalSceneDurations(
    content.scenes.map((scene) => scene.plannedDurationSeconds)
  );
  const draft = {
    artifactVersion: "lesson-spec.v1" as const,
    lessonId: createLessonId(skill.skillId, "standard"),
    skillId: skill.skillId,
    variant: "standard" as const,
    learningObjective: content.learningObjective,
    promise: content.promise,
    targetAudience: content.targetAudience,
    scaffolding: "moderate" as const,
    abstraction: "mixed" as const,
    reasoningDepth: "independent" as const,
    variantSemantics: {
      pacingProfile: "balanced" as const,
      numberComplexity: "grade-level" as const,
      challengeMode: "independent-application" as const,
      representationSequence: [content.modelVisual, content.practiceVisual],
    },
    processCompetency: skill.processCompetencies[0] ?? "REP",
    workedExamples: content.workedExamples,
    commonMistake: {
      description: content.misconceptions[0]!.description,
      correctionFactId: content.misconceptions[0]!.correctionFactId,
    },
    challenge: content.transferTask,
    facts: content.facts,
    checks: content.checks,
    scenes: content.scenes.map(
      ({ purpose: _purpose, ...scene }, index) => ({
        ...scene,
        plannedDurationSeconds: sceneDurations[index]!,
      })
    ),
    targetDurationSeconds: EDUCATIONAL_LESSON_TARGET_DURATION_SECONDS,
  };
  return lessonVariantSpecificationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
}

export function buildLessonVariant(
  skill: CurriculumSkill,
  variant: LessonVariant,
  provider: LessonSpecificationProvider = reviewedFixtureLessonProvider
): LessonVariantSpecification {
  if (variant === "standard") {
    const production = buildProductionStandardLesson(skill);
    if (production) {
      validateRequiredEducationalPractice(production);
      return production;
    }
  }
  const fixture = provider.load(skill.skillId, variant);
  if (!fixture)
    throw new Error(`Unsupported lesson specification: ${skill.skillId}`);
  if (fixture.skillId !== skill.skillId || fixture.variant !== variant)
    throw new Error("Lesson fixture identity does not match the request.");
  const sceneDurations = expandedEducationalSceneDurations(
    fixture.sceneDurations
  );
  const profile = variantProfiles[variant];
  const fixtureContentHash = canonicalHash(fixture);
  const facts: Array<{
    factId: string;
    semantic: {
      kind: "scalar";
      expression: ReturnType<typeof integer> | ReturnType<typeof sum>;
    };
    displayLatex: string;
    checkIds: string[];
    lineage: {
      contentContractVersion: string;
      sourceContentHash: string;
      sourceTaskId: string;
    };
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
        lineage: {
          contentContractVersion: "reviewed-fixtures.v1",
          sourceContentHash: fixtureContentHash,
          sourceTaskId: `example-${index + 1}`,
        },
      },
      {
        factId: expressionFactId,
        semantic: { kind: "scalar", expression },
        displayLatex: example.parts.join("+"),
        checkIds: [checkId],
        lineage: {
          contentContractVersion: "reviewed-fixtures.v1",
          sourceContentHash: fixtureContentHash,
          sourceTaskId: `example-${index + 1}`,
        },
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
      lineage: {
        contentContractVersion: "reviewed-fixtures.v1",
        sourceContentHash: fixtureContentHash,
        sourceTaskId: "transfer-challenge",
      },
    },
    {
      factId: "challenge-solution",
      semantic: {
        kind: "scalar",
        expression: integer(fixture.challenge.value),
      },
      displayLatex: fixture.challenge.value,
      checkIds: ["check-challenge-value"],
      lineage: {
        contentContractVersion: "reviewed-fixtures.v1",
        sourceContentHash: fixtureContentHash,
        sourceTaskId: "transfer-challenge",
      },
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
    [],
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
      plannedDurationSeconds: sceneDurations[index]!,
    })),
    targetDurationSeconds: EDUCATIONAL_LESSON_TARGET_DURATION_SECONDS,
  };
  const lesson = lessonVariantSpecificationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
  validateRequiredEducationalPractice(lesson);
  return lesson;
}

export function buildAllLessonVariants(
  skill: CurriculumSkill,
  provider: LessonSpecificationProvider = reviewedFixtureLessonProvider
): LessonVariantSpecification[] {
  return (["foundation", "standard", "challenge"] as const).map((variant) =>
    buildLessonVariant(skill, variant, provider)
  );
}
