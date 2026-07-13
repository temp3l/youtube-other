import { z } from "zod";
import {
  expressionNodeSchema,
  exactValueSchema,
  geometryEvidenceSchema,
  graphEvidenceSchema,
  measurementExactValueSchema,
  probabilityEvidenceSchema,
  scalarExactValueSchema,
  unitExpressionSchema,
} from "./math-ast.js";
import {
  factIdSchema,
  lessonIdSchema,
  lessonVariantSchema,
  skillIdSchema,
} from "./identity.js";
import { processCompetencySchema } from "./curriculum.js";

export const verificationCheckKindSchema = z.enum([
  "evaluate",
  "equivalent",
  "solve",
  "unit-dimension",
  "graph-point",
  "geometry",
  "probability",
  "display-fact",
]);

const genericVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.enum(["evaluate", "equivalent", "solve", "display-fact"]),
  expression: expressionNodeSchema,
  expected: exactValueSchema,
  secondaryExpression: expressionNodeSchema.optional(),
  solutionDomain: z.literal("real").optional(),
  assumptions: z.array(z.string().min(1)).optional(),
  tolerance: expressionNodeSchema.optional(),
  critical: z.boolean().default(true),
});

const unitVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("unit-dimension"),
  expression: expressionNodeSchema,
  expected: measurementExactValueSchema,
  actualUnit: unitExpressionSchema,
  critical: z.boolean().default(true),
});

const graphVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("graph-point"),
  expression: expressionNodeSchema,
  expected: scalarExactValueSchema,
  graph: graphEvidenceSchema,
  critical: z.boolean().default(true),
});

const geometryVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("geometry"),
  expression: expressionNodeSchema,
  expected: scalarExactValueSchema,
  geometry: geometryEvidenceSchema,
  critical: z.boolean().default(true),
});

const probabilityVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("probability"),
  expression: expressionNodeSchema,
  expected: scalarExactValueSchema,
  probability: probabilityEvidenceSchema,
  critical: z.boolean().default(true),
});

export const verificationCheckSchema = z.discriminatedUnion("kind", [
  genericVerificationCheckSchema,
  unitVerificationCheckSchema,
  graphVerificationCheckSchema,
  geometryVerificationCheckSchema,
  probabilityVerificationCheckSchema,
]);

export const lessonFactSchema = z.strictObject({
  factId: factIdSchema,
  semantic: exactValueSchema,
  displayLatex: z.string().min(1),
  checkIds: z.array(z.string().regex(/^check-[a-z0-9-]+$/u)).min(1),
});

export const workedStepSchema = z.strictObject({
  stepId: z.string().regex(/^step-[a-z0-9-]+$/u),
  explanation: z.string().min(1),
  factId: factIdSchema,
});

export const workedExampleSchema = z.strictObject({
  exampleId: z.string().regex(/^(?:example|challenge)-[a-z0-9-]+$/u),
  prompt: z.string().min(1),
  steps: z.array(workedStepSchema).min(1),
  solutionFactId: factIdSchema,
});

export const sceneFunctionSchema = z.enum([
  "hook",
  "objective",
  "model",
  "worked-example",
  "mistake",
  "guided-practice",
  "think-pause",
  "solution",
  "recap",
]);

export const lessonSceneSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  sceneFunction: sceneFunctionSchema,
  factIds: z.array(factIdSchema),
  processCompetencies: z.array(processCompetencySchema),
  visualComponent: z.enum([
    "formula",
    "place-value-chart",
    "fraction-model",
    "number-line",
    "coordinate-plane",
    "function-graph",
    "geometry",
    "measurement",
    "data-table",
    "probability-tree",
    "teacher",
  ]),
  plannedDurationSeconds: z.number().positive(),
});

export const lessonVariantSpecificationSchema = z.strictObject({
  artifactVersion: z.literal("lesson-spec.v1"),
  lessonId: lessonIdSchema,
  skillId: skillIdSchema,
  variant: lessonVariantSchema,
  learningObjective: z.string().min(1),
  promise: z.string().min(1),
  targetAudience: z.string().min(1),
  scaffolding: z.enum(["high", "moderate", "low"]),
  abstraction: z.enum(["concrete", "mixed", "symbolic"]),
  reasoningDepth: z.enum(["guided", "independent", "transfer"]),
  variantSemantics: z.strictObject({
    pacingProfile: z.enum(["slowed", "balanced", "compressed"]),
    numberComplexity: z.enum(["bounded", "grade-level", "extended"]),
    challengeMode: z.enum([
      "guided-application",
      "independent-application",
      "novel-transfer",
    ]),
    representationSequence: z
      .array(lessonSceneSchema.shape.visualComponent)
      .min(2),
  }),
  processCompetency: processCompetencySchema,
  workedExamples: z.array(workedExampleSchema).min(1),
  commonMistake: z.strictObject({
    description: z.string().min(1),
    correctionFactId: factIdSchema,
  }),
  challenge: workedExampleSchema,
  facts: z.array(lessonFactSchema).min(1),
  checks: z.array(verificationCheckSchema).min(1),
  scenes: z.array(lessonSceneSchema).length(9),
  targetDurationSeconds: z.union([
    z.literal(180),
    z.literal(240),
    z.literal(300),
  ]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type VerificationCheck = z.infer<typeof verificationCheckSchema>;
export type LessonVariantSpecification = z.infer<
  typeof lessonVariantSpecificationSchema
>;
