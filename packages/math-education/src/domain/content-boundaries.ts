import { z } from "zod";

import { mathGradeSchema, mathLanguageSchema } from "./identity.js";

/** Content surfaces are deliberately distinct so planning data cannot be used as learner copy. */
export const internalPlanningTextSchema = z.string().trim().min(1).brand<"InternalPlanningText">();
export const learnerNarrationTextSchema = z.string().trim().min(1).brand<"LearnerNarrationText">();
export const displayTextSchema = z.string().trim().min(1).brand<"DisplayText">();
export const ttsTextSchema = z.string().trim().min(1).brand<"TtsText">();
export const subtitleTextSchema = z.string().trim().min(1).brand<"SubtitleText">();

export type InternalPlanningText = z.infer<typeof internalPlanningTextSchema>;
export type LearnerNarrationText = z.infer<typeof learnerNarrationTextSchema>;
export type DisplayText = z.infer<typeof displayTextSchema>;
export type TtsText = z.infer<typeof ttsTextSchema>;
export type SubtitleText = z.infer<typeof subtitleTextSchema>;

export const internalPlanningText = (value: string): InternalPlanningText =>
  internalPlanningTextSchema.parse(value);
export const learnerNarrationText = (value: string): LearnerNarrationText =>
  learnerNarrationTextSchema.parse(value);
export const displayText = (value: string): DisplayText => displayTextSchema.parse(value);
export const ttsText = (value: string): TtsText => ttsTextSchema.parse(value);
export const subtitleText = (value: string): SubtitleText =>
  subtitleTextSchema.parse(value);

const categoryIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const categoryFrequencySchema = z.strictObject({
  categoryId: categoryIdSchema,
  categoryLabel: displayTextSchema,
  frequency: nonNegativeIntegerSchema,
  unitLabel: displayTextSchema.optional(),
});
export type CategoryFrequency = z.infer<typeof categoryFrequencySchema>;

/** A categorical model keeps display labels attached to each quantity. */
export const categoricalDatasetSchema = z
  .strictObject({
    title: displayTextSchema,
    context: learnerNarrationTextSchema,
    observations: z.array(displayTextSchema).min(1).optional(),
    frequencies: z.array(categoryFrequencySchema).min(1),
    total: nonNegativeIntegerSchema,
    mostFrequentCategoryIds: z.array(categoryIdSchema).min(1),
  })
  .superRefine((dataset, context) => {
    const ids = dataset.frequencies.map((entry) => entry.categoryId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["frequencies"],
        message: "Category IDs must be unique.",
      });
    }
    const total = dataset.frequencies.reduce(
      (sum, entry) => sum + entry.frequency,
      0
    );
    if (dataset.total !== total) {
      context.addIssue({
        code: "custom",
        path: ["total"],
        message: "Total must equal the sum of category frequencies.",
      });
    }
    const highest = Math.max(...dataset.frequencies.map((entry) => entry.frequency));
    const expectedMostFrequent = ids.filter(
      (id) => dataset.frequencies.find((entry) => entry.categoryId === id)?.frequency === highest
    );
    const supplied = dataset.mostFrequentCategoryIds;
    if (
      new Set(supplied).size !== supplied.length ||
      supplied.length !== expectedMostFrequent.length ||
      supplied.some((id) => !expectedMostFrequent.includes(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["mostFrequentCategoryIds"],
        message: "Most frequent category IDs must exactly represent all ties derived from frequencies.",
      });
    }
    if (
      dataset.observations &&
      (dataset.observations.length !== dataset.total ||
        dataset.observations.some(
          (observation) =>
            !dataset.frequencies.some(
              (entry) => entry.categoryLabel === observation
            )
        ))
    ) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Observations must use known category labels and equal the total count.",
      });
    }
  });
export type CategoricalDataset = z.infer<typeof categoricalDatasetSchema>;

export const instructionalScenePurposeSchema = z.enum([
  "hook",
  "learning-objective",
  "concept-explanation",
  "worked-example",
  "misconception-check",
  "guided-practice",
  "independent-practice",
  "solution",
  "summary",
  "retrieval",
]);
export const expectedLearnerActionSchema = z.enum([
  "observe",
  "count",
  "calculate",
  "compare",
  "explain",
  "transfer",
]);

export const didacticIntentSchema = z.strictObject({
  learningObjective: learnerNarrationTextSchema,
  prerequisite: learnerNarrationTextSchema.optional(),
  explanationStrategy: z.enum(["concrete-to-symbolic", "worked-example", "compare-representations"]),
  workedExampleGoal: learnerNarrationTextSchema,
  guidedPracticeGoal: learnerNarrationTextSchema,
  independentPracticeGoal: learnerNarrationTextSchema,
  retrievalQuestion: learnerNarrationTextSchema,
  summaryRule: learnerNarrationTextSchema,
});
export type DidacticIntent = z.infer<typeof didacticIntentSchema>;

export const displaySemanticBindingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("category-frequency"),
    categoryId: categoryIdSchema,
    frequency: nonNegativeIntegerSchema,
  }),
  z.strictObject({ kind: z.literal("total"), total: nonNegativeIntegerSchema }),
  z.strictObject({
    kind: z.literal("most-frequent-category"),
    categoryIds: z.array(categoryIdSchema).min(1),
  }),
]);
export type DisplaySemanticBinding = z.infer<typeof displaySemanticBindingSchema>;

export const expectedAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category-frequency"), categoryId: categoryIdSchema, frequency: nonNegativeIntegerSchema }),
  z.strictObject({ kind: z.literal("total"), total: nonNegativeIntegerSchema }),
  z.strictObject({ kind: z.literal("most-frequent-category"), categoryIds: z.array(categoryIdSchema).min(1) }),
  z.strictObject({ kind: z.literal("explanation"), answer: learnerNarrationTextSchema }),
]);
export type ExpectedAnswer = z.infer<typeof expectedAnswerSchema>;

export const instructionalSceneSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-[a-z0-9-]+$/u),
  purpose: instructionalScenePurposeSchema,
  learnerPrompt: learnerNarrationTextSchema.optional(),
  expectedAction: expectedLearnerActionSchema.optional(),
  expectedAnswer: expectedAnswerSchema.optional(),
  narration: learnerNarrationTextSchema,
  displayText: displayTextSchema,
  displayBindings: z.array(displaySemanticBindingSchema).min(1),
  pauseDurationMs: z.number().int().nonnegative().optional(),
}).superRefine((scene, context) => {
  const isPractice = scene.purpose === "guided-practice" || scene.purpose === "independent-practice";
  if (isPractice && (!scene.learnerPrompt || !scene.expectedAction)) {
    context.addIssue({ code: "custom", path: ["learnerPrompt"], message: "Practice scenes require a learner prompt and expected action." });
  }
  if (scene.purpose === "solution" && !scene.expectedAnswer) {
    context.addIssue({ code: "custom", path: ["expectedAnswer"], message: "Solution scenes require an expected answer." });
  }
});
export type InstructionalScene = z.infer<typeof instructionalSceneSchema>;

/** The learner compiler has no field that can accept planning metadata or diagnostics. */
export const learnerNarrationCompilerInputSchema = z.strictObject({
  locale: mathLanguageSchema,
  grade: mathGradeSchema,
  canonicalDataset: categoricalDatasetSchema,
  didacticIntent: didacticIntentSchema,
  scenes: z.array(instructionalSceneSchema).min(1),
});
export type LearnerNarrationCompilerInput = z.infer<
  typeof learnerNarrationCompilerInputSchema
>;
