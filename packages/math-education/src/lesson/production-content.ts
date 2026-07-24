import { z } from "zod";
import {
  lessonFactSchema,
  lessonSceneSchema,
  verificationCheckSchema,
  workedExampleSchema,
} from "../domain/lesson.js";
import { skillIdSchema } from "../domain/identity.js";
import { canonicalHash } from "../verification/canonical-json.js";

export const LESSON_CONTENT_CONTRACT_VERSION =
  "lesson-content-contract.v1" as const;
export const NUMBER_OPERATIONS_CONTENT_VERSION =
  "class5-number-operations-standard.v1" as const;
export const FRACTIONS_DECIMALS_CONTENT_VERSION =
  "class5-fractions-decimals-standard.v1" as const;
export const GEOMETRY_MEASUREMENT_CONTENT_VERSION =
  "class5-geometry-measurement-standard.v1" as const;
export const DATA_DIAGRAM_CONTENT_VERSION =
  "class5-data-diagrams-standard.v1" as const;

const lessonContentVersionSchema = z.enum([
  NUMBER_OPERATIONS_CONTENT_VERSION,
  FRACTIONS_DECIMALS_CONTENT_VERSION,
  GEOMETRY_MEASUREMENT_CONTENT_VERSION,
  DATA_DIAGRAM_CONTENT_VERSION,
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const taskIdSchema = z.string().regex(/^(?:example|transfer)-[a-z0-9-]+$/u);

const sourceIdentitySchema = z.strictObject({
  curriculumReleaseId: z.literal("de-gems-5-10-v1"),
  curriculumVersion: z.literal("1.0.0-draft.1"),
  curriculumReleaseHash: z.literal(
    "9afb5e2c0ed7a10628df7f5d1d589739995910900d66b5b479894a3a95360b31"
  ),
  curriculumSkillHash: sha256Schema,
  sourceIds: z.array(z.string().min(1)).min(1),
  sourceSection: z.string().min(1),
  sourceReviewStatus: z.literal("pending"),
});

const formativeCheckSchema = z.strictObject({
  formativeCheckId: z.string().regex(/^formative-[a-z0-9-]+$/u),
  prompt: z.string().min(1),
  factIds: z.array(z.string().min(1)).min(1),
  verifierCheckId: z.string().regex(/^check-[a-z0-9-]+$/u),
  answerFactId: z.string().min(1),
});

const answerKeyEntrySchema = z.strictObject({
  taskId: taskIdSchema,
  sourceTaskHash: sha256Schema,
  solutionFactId: z.string().min(1),
  orderedStepIds: z.array(z.string().min(1)).min(1),
});

const authoredSceneSchema = lessonSceneSchema.extend({
  purpose: z.string().min(1),
});

const lessonContentFieldsSchema = z.strictObject({
  artifactVersion: z.enum([
    "number-operations-lesson-content.v1",
    "fractions-decimals-lesson-content.v1",
    "geometry-measurement-lesson-content.v1",
    "data-diagrams-lesson-content.v1",
  ]),
  contractVersion: z.literal(LESSON_CONTENT_CONTRACT_VERSION),
  contentVersion: lessonContentVersionSchema,
  locale: z.literal("de-DE"),
  skillId: skillIdSchema,
  variant: z.literal("standard"),
  learningObjective: z.string().min(1),
  prerequisiteSkillIds: z.array(skillIdSchema),
  prerequisiteReviewStatus: z.literal("proposed-unreviewed"),
  priorKnowledge: z.array(z.string().min(1)).min(1),
  misconceptions: z
    .array(
      z.strictObject({
        misconceptionId: z.string().regex(/^misconception-[a-z0-9-]+$/u),
        description: z.string().min(1),
        correctionFactId: z.string().min(1),
      })
    )
    .min(1),
  conceptIds: z.tuple([
    z.string().regex(/^[a-z0-9-]+$/u),
    z.string().regex(/^[a-z0-9-]+$/u),
  ]),
  promise: z.string().min(1),
  targetAudience: z.string().min(1),
  modelVisual: lessonSceneSchema.shape.visualComponent,
  practiceVisual: lessonSceneSchema.shape.visualComponent,
  workedExamples: z.array(workedExampleSchema).min(1),
  transferTask: workedExampleSchema,
  formativeChecks: z.array(formativeCheckSchema).min(2),
  answerKey: z.array(answerKeyEntrySchema).min(2),
  facts: z.array(lessonFactSchema).min(4),
  checks: z.array(verificationCheckSchema).min(2),
  scenes: z.array(authoredSceneSchema).length(9),
  expectedDurationSeconds: z.literal(240),
  sourceIdentity: sourceIdentitySchema,
  reviewStatus: z.literal("pending-external-review"),
  contentHash: sha256Schema,
});

export const productionLessonContentSchema =
  lessonContentFieldsSchema.superRefine((value, context) => {
    const { contentHash, ...content } = value;
    if (contentHash !== canonicalHash(content))
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Lesson content hash does not match the authored payload.",
      });

    const unique = (
      values: readonly string[],
      path: (string | number)[],
      label: string
    ): void => {
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path,
          message: `${label} must be unique.`,
        });
    };
    unique(
      value.facts.map((fact) => fact.factId),
      ["facts"],
      "Fact IDs"
    );
    unique(
      value.checks.map((check) => check.checkId),
      ["checks"],
      "Verifier check IDs"
    );
    unique(
      [...value.workedExamples, value.transferTask].flatMap((task) =>
        task.steps.map((step) => step.stepId)
      ),
      ["workedExamples"],
      "Worked-step IDs"
    );

    const facts = new Set(value.facts.map((fact) => fact.factId));
    const checks = new Set(value.checks.map((check) => check.checkId));
    const tasks = new Map(
      [...value.workedExamples, value.transferTask].map((task) => [
        task.exampleId,
        task,
      ])
    );
    for (const fact of value.facts) {
      for (const checkId of fact.checkIds)
        if (!checks.has(checkId))
          context.addIssue({
            code: "custom",
            path: ["facts", fact.factId, "checkIds"],
            message: `Fact ${fact.factId} references unknown check ${checkId}.`,
          });
    }
    for (const task of tasks.values()) {
      if (!facts.has(task.solutionFactId))
        context.addIssue({
          code: "custom",
          path: [task.exampleId, "solutionFactId"],
          message: `Task ${task.exampleId} has no solution fact.`,
        });
      for (const step of task.steps)
        if (!facts.has(step.factId))
          context.addIssue({
            code: "custom",
            path: [task.exampleId, step.stepId],
            message: `Step ${step.stepId} references unknown fact ${step.factId}.`,
          });
    }
    for (const misconception of value.misconceptions)
      if (!facts.has(misconception.correctionFactId))
        context.addIssue({
          code: "custom",
          path: ["misconceptions", misconception.misconceptionId],
          message: "Misconception correction fact is missing.",
        });
    for (const formative of value.formativeChecks) {
      if (
        !checks.has(formative.verifierCheckId) ||
        !facts.has(formative.answerFactId) ||
        formative.factIds.some((factId) => !facts.has(factId))
      )
        context.addIssue({
          code: "custom",
          path: ["formativeChecks", formative.formativeCheckId],
          message: "Formative check has an unknown fact or verifier check.",
        });
    }
    for (const entry of value.answerKey) {
      const task = tasks.get(entry.taskId);
      if (
        !task ||
        entry.solutionFactId !== task.solutionFactId ||
        entry.sourceTaskHash !==
          value.facts.find((fact) => fact.factId === task.steps[0]?.factId)
            ?.lineage.sourceContentHash ||
        entry.orderedStepIds.join("\0") !==
          task.steps.map((step) => step.stepId).join("\0")
      )
        context.addIssue({
          code: "custom",
          path: ["answerKey", entry.taskId],
          message:
            "Answer-key identity or ordered steps do not match the task.",
        });
    }
    for (const scene of value.scenes)
      if (scene.factIds.some((factId) => !facts.has(factId)))
        context.addIssue({
          code: "custom",
          path: ["scenes", scene.sceneId, "factIds"],
          message: "Scene references an unknown fact.",
        });
    const expectedSceneFunctions = [
      "hook",
      "objective",
      "model",
      "worked-example",
      "mistake",
      "guided-practice",
      "think-pause",
      "solution",
      "recap",
    ];
    if (
      value.scenes.map((scene) => scene.sceneFunction).join("\0") !==
      expectedSceneFunctions.join("\0")
    )
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message: "Educational practice scenes are missing or reordered.",
      });
    const mistake = value.misconceptions[0];
    const mistakeScene = value.scenes[4];
    const independentSourceFactId = value.transferTask.steps.find(
      (step) => step.factId !== value.transferTask.solutionFactId
    )?.factId;
    const independentScene = value.scenes[5];
    const thinkScene = value.scenes[6];
    const solutionScene = value.scenes[7];
    const retrievalScene = value.scenes[8];
    if (
      !mistake ||
      !mistakeScene ||
      mistakeScene.plannedDurationSeconds > 30 ||
      !mistakeScene.factIds.includes(mistake.correctionFactId)
    )
      context.addIssue({
        code: "custom",
        path: ["scenes", 4],
        message: "A short, fact-bound misconception check is required.",
      });
    if (
      !independentSourceFactId ||
      !independentScene ||
      !thinkScene ||
      !solutionScene ||
      !thinkScene.factIds.includes(independentSourceFactId) ||
      independentScene.factIds.includes(value.transferTask.solutionFactId) ||
      thinkScene.factIds.includes(value.transferTask.solutionFactId) ||
      !solutionScene.factIds.includes(value.transferTask.solutionFactId)
    )
      context.addIssue({
        code: "custom",
        path: ["scenes", 5],
        message:
          "The second independent example must withhold its answer until the solution scene.",
      });
    if (!retrievalScene || retrievalScene.factIds.length !== 0)
      context.addIssue({
        code: "custom",
        path: ["scenes", 8],
        message:
          "The final retrieval question must not expose immediate answer facts.",
      });
    if (
      value.scenes.reduce(
        (total, scene) => total + scene.plannedDurationSeconds,
        0
      ) !== value.expectedDurationSeconds
    )
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message: "Scene durations do not match the expected lesson duration.",
      });
  });

export type ProductionLessonContent = z.infer<
  typeof productionLessonContentSchema
>;

const reviewEvidenceFieldsSchema = z.strictObject({
  artifactVersion: z.literal("lesson-content-review.v1"),
  contractVersion: z.literal(LESSON_CONTENT_CONTRACT_VERSION),
  contentVersion: lessonContentVersionSchema,
  curriculumReleaseId: z.literal("de-gems-5-10-v1"),
  curriculumVersion: z.string().min(1),
  curriculumReleaseHash: sha256Schema,
  orderedSkillIds: z.array(skillIdSchema).min(1),
  orderedContentHashes: z.array(sha256Schema).min(1),
  contentSetHash: sha256Schema,
  decision: z.literal("APPROVE_EXACT_TARGET"),
  reviewer: z.strictObject({
    stableId: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
    organization: z.string().min(1),
  }),
  reviewedAt: z.string().datetime({ offset: true }),
  externalEvidenceId: z.string().min(1),
  evidenceHash: sha256Schema,
});

export const lessonContentReviewEvidenceSchema =
  reviewEvidenceFieldsSchema.superRefine((value, context) => {
    const { evidenceHash, ...payload } = value;
    if (evidenceHash !== canonicalHash(payload))
      context.addIssue({
        code: "custom",
        path: ["evidenceHash"],
        message: "Review evidence hash does not match its payload.",
      });
    if (
      value.contentSetHash !==
      canonicalHash({
        orderedSkillIds: value.orderedSkillIds,
        orderedContentHashes: value.orderedContentHashes,
      })
    )
      context.addIssue({
        code: "custom",
        path: ["contentSetHash"],
        message: "Review content-set hash does not match the exact target.",
      });
  });

export type LessonContentReviewEvidence = z.infer<
  typeof lessonContentReviewEvidenceSchema
>;

export function lessonContentSetIdentity(
  specifications: readonly ProductionLessonContent[]
) {
  const ordered = [...specifications].sort((left, right) =>
    left.skillId.localeCompare(right.skillId)
  );
  const target = {
    orderedSkillIds: ordered.map((item) => item.skillId),
    orderedContentHashes: ordered.map((item) => item.contentHash),
  };
  return { ...target, contentSetHash: canonicalHash(target) };
}

export function assertExactLessonContentReview(
  specifications: readonly ProductionLessonContent[],
  evidence: unknown
): LessonContentReviewEvidence {
  const parsed = lessonContentReviewEvidenceSchema.parse(evidence);
  const target = lessonContentSetIdentity(specifications);
  if (specifications.length === 0)
    throw new Error("Lesson content review requires a non-empty target.");
  const contentVersions = new Set(
    specifications.map((specification) => specification.contentVersion)
  );
  if (
    contentVersions.size !== 1 ||
    parsed.contentVersion !== specifications[0]?.contentVersion ||
    parsed.curriculumVersion !==
      specifications[0]?.sourceIdentity.curriculumVersion ||
    parsed.curriculumReleaseHash !==
      specifications[0]?.sourceIdentity.curriculumReleaseHash ||
    parsed.orderedSkillIds.join("\0") !== target.orderedSkillIds.join("\0") ||
    parsed.orderedContentHashes.join("\0") !==
      target.orderedContentHashes.join("\0") ||
    parsed.contentSetHash !== target.contentSetHash
  )
    throw new Error(
      "Lesson content review evidence does not approve the exact content target."
    );
  return parsed;
}
