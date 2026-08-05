import { contentLocaleSchema, contentVariantSchema } from "@mediaforge/domain";

import {
  MATH_LANGUAGES,
  MATH_VARIANTS,
  lessonVariantSchema,
  mathLanguageSchema,
} from "./domain/index.js";
import {
  APPROVED_LESSON_SKILL_IDS,
  reviewedLessonFixture,
} from "./lesson/lesson-specification-fixtures.js";
import {
  MATH_TASK_IDS,
  createMathTaskRegistry,
  mathWorkflowDefinition,
} from "./task-registry.js";

export const MATH_PROFILE_FIXTURE_VERSION =
  "math.deterministic-profile-fixture.v1" as const;

export interface MathProfileFixtureTraversal {
  readonly locale: (typeof MATH_LANGUAGES)[number];
  readonly contentVariant: "full" | "short";
  readonly lessonVariant: (typeof MATH_VARIANTS)[number];
  readonly curriculumSkillIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly stateSource: "shared-engine";
  readonly providerCalls: 0;
  readonly status: "passed";
}

export interface MathProfileFixtureResult {
  readonly schemaVersion: typeof MATH_PROFILE_FIXTURE_VERSION;
  readonly workflowRevision: string;
  readonly curriculumScope: readonly string[];
  readonly locales: readonly string[];
  readonly lessonVariants: readonly string[];
  readonly contentVariants: readonly ("full" | "short")[];
  readonly offlineVerification: "math-verifier.v3-fixture-evidence";
  readonly stateSource: "shared-engine";
  readonly traversals: readonly MathProfileFixtureTraversal[];
  readonly providerCalls: 0;
  readonly status: "passed";
}

function assertReviewedFixtures(): void {
  for (const skillId of APPROVED_LESSON_SKILL_IDS) {
    for (const variantInput of MATH_VARIANTS) {
      const variant = lessonVariantSchema.parse(variantInput);
      const fixture = reviewedLessonFixture(skillId, variant);
      if (!fixture) {
        throw new Error(
          `No reviewed deterministic fixture exists for ${skillId}/${variant}.`
        );
      }
      if (
        fixture.sceneDurations.reduce((sum, value) => sum + value, 0) !== 240
      ) {
        throw new Error(
          `Reviewed fixture ${skillId}/${variant} does not preserve the supported lesson length.`
        );
      }
    }
  }
}

export function runMathProfileDeterministicFixture(): MathProfileFixtureResult {
  assertReviewedFixtures();
  const registry = createMathTaskRegistry();
  registry.validateWorkflow(mathWorkflowDefinition);
  const traversals = MATH_LANGUAGES.flatMap((localeInput) => {
    const locale = mathLanguageSchema.parse(contentLocaleSchema.parse(localeInput));
    return (["full", "short"] as const).flatMap((contentVariantInput) => {
      const contentVariant = contentVariantSchema.parse(contentVariantInput);
      return MATH_VARIANTS.map((lessonVariantInput) => {
        const lessonVariant = lessonVariantSchema.parse(lessonVariantInput);
        const completed = new Set<string>();
        const taskIds: string[] = [];
        while (completed.size < MATH_TASK_IDS.length) {
          const next = MATH_TASK_IDS.find(
            (taskId) =>
              !completed.has(taskId) &&
              registry
                .get(taskId)
                .definition.dependencies.every((dependency) =>
                  completed.has(dependency.taskId)
                )
          );
          if (!next) {
            throw new Error(
              `Deterministic ${locale}/${contentVariant}/${lessonVariant} fixture cannot advance through the mathematics DAG.`
            );
          }
          // Provider/manual stages are represented by deterministic accepted
          // evidence. No implementation, renderer, TTS, or publish seam runs.
          completed.add(next);
          taskIds.push(next);
        }
        return {
          locale,
          contentVariant,
          lessonVariant,
          curriculumSkillIds: [...APPROVED_LESSON_SKILL_IDS],
          taskIds,
          stateSource: "shared-engine" as const,
          providerCalls: 0 as const,
          status: "passed" as const,
        };
      });
    });
  });
  return {
    schemaVersion: MATH_PROFILE_FIXTURE_VERSION,
    workflowRevision: mathWorkflowDefinition.revision,
    curriculumScope: [...APPROVED_LESSON_SKILL_IDS],
    locales: [...MATH_LANGUAGES],
    lessonVariants: [...MATH_VARIANTS],
    contentVariants: ["full", "short"],
    offlineVerification: "math-verifier.v3-fixture-evidence",
    stateSource: "shared-engine",
    traversals,
    providerCalls: 0,
    status: "passed",
  };
}
