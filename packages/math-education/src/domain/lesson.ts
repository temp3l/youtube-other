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
  "integer-domain",
  "fraction-decimal-domain",
  "geometry-measurement-domain",
  "data-diagram-domain",
  "unit-dimension",
  "graph-point",
  "geometry",
  "probability",
  "display-fact",
]);

export const integerDomainEvidenceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("place-value"),
    value: expressionNodeSchema,
    placeValues: z.array(expressionNodeSchema).min(1),
  }),
  z.strictObject({
    mode: z.literal("comparison"),
    left: expressionNodeSchema,
    right: expressionNodeSchema,
    operator: z.enum(["lt", "lte", "gt", "gte", "eq"]),
  }),
  z.strictObject({
    mode: z.literal("rounding"),
    value: expressionNodeSchema,
    place: expressionNodeSchema,
    rule: z.literal("half-up"),
  }),
  z.strictObject({
    mode: z.literal("estimation"),
    operation: z.enum(["add", "subtract", "multiply"]),
    operands: z.array(expressionNodeSchema).min(2),
    roundingPlaces: z.array(expressionNodeSchema).min(2),
    rule: z.literal("half-up"),
  }),
  z.strictObject({
    mode: z.literal("integer-operation"),
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    operands: z.array(expressionNodeSchema).min(2),
  }),
  z.strictObject({
    mode: z.literal("order-of-operations"),
    sourceExpression: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("arithmetic-law"),
    law: z.enum([
      "commutative-add",
      "commutative-multiply",
      "associative-add",
      "associative-multiply",
      "distributive",
    ]),
    operands: z.array(expressionNodeSchema).min(2).max(3),
  }),
  z.strictObject({
    mode: z.literal("text-expression"),
    template: z.enum([
      "sum-of",
      "difference-of",
      "product-of",
      "quotient-of",
      "add-then-multiply",
      "multiply-then-add",
    ]),
    values: z.array(expressionNodeSchema).min(2).max(3),
    interpretationCount: z.literal(1),
  }),
  z.strictObject({
    mode: z.literal("substitution"),
    sourceExpression: expressionNodeSchema,
    variable: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u),
    value: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("divisibility"),
    dividend: expressionNodeSchema,
    divisor: expressionNodeSchema,
    allowedDivisors: z.array(expressionNodeSchema).min(1),
  }),
  z.strictObject({
    mode: z.literal("power"),
    base: expressionNodeSchema,
    exponent: expressionNodeSchema,
  }),
]);

const fractionModelVisualSchema = z.strictObject({
  component: z.literal("fraction-model"),
  totalParts: z.number().int().positive(),
  shadedParts: z.number().int().nonnegative(),
});

const numberLineVisualSchema = z.strictObject({
  component: z.literal("number-line"),
  minimum: expressionNodeSchema,
  maximum: expressionNodeSchema,
  tickStep: expressionNodeSchema,
  point: expressionNodeSchema,
  label: expressionNodeSchema,
});

export const fractionDecimalEvidenceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("fraction-part"),
    fraction: expressionNodeSchema,
    visual: fractionModelVisualSchema,
  }),
  z.strictObject({
    mode: z.literal("fraction-notation"),
    fraction: expressionNodeSchema,
    numerator: expressionNodeSchema,
    denominator: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("number-line"),
    value: expressionNodeSchema,
    visual: numberLineVisualSchema,
  }),
  z.strictObject({
    mode: z.literal("equivalence"),
    left: expressionNodeSchema,
    right: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("scale"),
    operation: z.enum(["expand", "reduce"]),
    source: expressionNodeSchema,
    target: expressionNodeSchema,
    factor: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("decimal-place-value"),
    value: expressionNodeSchema,
    placeValues: z.array(expressionNodeSchema).min(1),
    displayedScale: z.number().int().nonnegative(),
  }),
  z.strictObject({
    mode: z.literal("decimal-comparison"),
    left: expressionNodeSchema,
    right: expressionNodeSchema,
    operator: z.enum(["lt", "lte", "gt", "gte", "eq"]),
  }),
]);

const semanticPointSchema = z.strictObject({
  x: expressionNodeSchema,
  y: expressionNodeSchema,
});
const semanticLineSchema = z.strictObject({
  from: semanticPointSchema,
  to: semanticPointSchema,
});

export const geometryMeasurementEvidenceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("unit-conversion"),
    conversions: z.array(z.strictObject({
      sourceValue: expressionNodeSchema,
      sourceUnit: unitExpressionSchema,
      targetValue: expressionNodeSchema,
      targetUnit: unitExpressionSchema,
    })).min(1),
  }),
  z.strictObject({
    mode: z.literal("rectangle-measure"),
    quantity: z.enum(["perimeter", "area"]),
    width: expressionNodeSchema,
    height: expressionNodeSchema,
    lengthUnit: unitExpressionSchema,
    resultUnit: unitExpressionSchema,
    visual: z.strictObject({
      width: expressionNodeSchema,
      height: expressionNodeSchema,
      scaleMode: z.literal("not-to-scale"),
      visibleLabel: z.literal("nicht maßstabsgetreu"),
      colorIndependentCues: z.array(z.string().min(1)).min(1),
    }),
  }),
  z.strictObject({
    mode: z.literal("spatial-relations"),
    entities: z.array(z.enum(["point", "segment", "line"])).min(1),
    lines: z.array(semanticLineSchema).length(2),
    relation: z.enum(["parallel", "perpendicular"]),
    scaleMode: z.literal("to-scale"),
  }),
  z.strictObject({
    mode: z.literal("angle"),
    degrees: expressionNodeSchema,
    angleType: z.enum(["acute", "right", "obtuse", "straight"]),
    rays: z.tuple([semanticLineSchema, semanticLineSchema]),
    scaleMode: z.literal("to-scale"),
  }),
  z.strictObject({
    mode: z.literal("polygon-classification"),
    classification: z.enum(["right-triangle", "isosceles-triangle", "rectangle", "square", "parallelogram"]),
    vertices: z.array(semanticPointSchema).min(3).max(4),
    scaleMode: z.literal("to-scale"),
  }),
  z.strictObject({
    mode: z.literal("axial-symmetry"),
    axisX: expressionNodeSchema,
    pairs: z.array(z.strictObject({ left: semanticPointSchema, right: semanticPointSchema })).min(1),
    colorIndependentCues: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    mode: z.literal("net-validity"),
    solid: z.enum(["cube", "cuboid"]),
    faces: z.array(z.strictObject({ x: z.number().int(), y: z.number().int(), faceLabel: z.string().min(1) })).length(6),
    colorIndependentCues: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    mode: z.literal("unit-cube-volume"),
    length: expressionNodeSchema,
    width: expressionNodeSchema,
    height: expressionNodeSchema,
    cubeCount: expressionNodeSchema,
  }),
  z.strictObject({
    mode: z.literal("cuboid-volume"),
    length: expressionNodeSchema,
    width: expressionNodeSchema,
    height: expressionNodeSchema,
    lengthUnit: unitExpressionSchema,
    resultUnit: unitExpressionSchema,
    visual: z.strictObject({
      scaleMode: z.literal("not-to-scale"),
      visibleLabel: z.literal("nicht maßstabsgetreu"),
      colorIndependentCues: z.array(z.string().min(1)).min(1),
    }),
  }),
]);

const dataCategorySchema = z.strictObject({
  category: z.string().min(1),
  count: expressionNodeSchema,
  tallyGroups: z.array(z.number().int().min(1).max(5)),
});
const sourceDatasetSchema = z.strictObject({
  datasetId: z.string().regex(/^dataset-[a-z0-9-]+$/u),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  unitLabel: z.string().min(1),
  duplicatePolicy: z.literal("reject"),
  rawValues: z.array(z.string().min(1)).min(1),
  categories: z.array(dataCategorySchema).min(1),
});

export const dataDiagramEvidenceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("tally-list"),
    dataset: sourceDatasetSchema,
    expectedTotal: expressionNodeSchema,
    derivedOrder: z.array(z.string().min(1)).min(1),
    maximumCategory: z.string().min(1),
  }),
  z.strictObject({
    mode: z.literal("bar-chart"),
    dataset: sourceDatasetSchema,
    chart: z.strictObject({
      orientation: z.enum(["column", "bar"]),
      axisOrigin: expressionNodeSchema,
      axisMaximum: expressionNodeSchema,
      tickInterval: expressionNodeSchema,
      unitLabel: z.string().min(1),
      categoryOrder: z.array(z.string().min(1)).min(1),
      bars: z.array(z.strictObject({
        category: z.string().min(1),
        height: expressionNodeSchema,
        categoryFactId: factIdSchema,
        barFactId: factIdSchema,
      })).min(1),
      accessibleEncoding: z.strictObject({
        colorIndependentCue: z.string().min(1),
        visibleValueLabels: z.literal(true),
      }),
    }),
    expectedMaximum: expressionNodeSchema,
  }),
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

const integerDomainVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("integer-domain"),
  sourceExpression: expressionNodeSchema,
  expression: expressionNodeSchema,
  evidence: integerDomainEvidenceSchema,
  critical: z.boolean().default(true),
});

const fractionDecimalVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("fraction-decimal-domain"),
  sourceExpression: expressionNodeSchema,
  expression: expressionNodeSchema,
  evidence: fractionDecimalEvidenceSchema,
  critical: z.boolean().default(true),
});

const geometryMeasurementVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("geometry-measurement-domain"),
  sourceExpression: expressionNodeSchema,
  expression: expressionNodeSchema,
  evidence: geometryMeasurementEvidenceSchema,
  critical: z.boolean().default(true),
});

const dataDiagramVerificationCheckSchema = z.strictObject({
  checkId: z.string().regex(/^check-[a-z0-9-]+$/u),
  kind: z.literal("data-diagram-domain"),
  sourceExpression: expressionNodeSchema,
  expression: expressionNodeSchema,
  evidence: dataDiagramEvidenceSchema,
  critical: z.boolean().default(true),
});

export const verificationCheckSchema = z.discriminatedUnion("kind", [
  genericVerificationCheckSchema,
  integerDomainVerificationCheckSchema,
  fractionDecimalVerificationCheckSchema,
  geometryMeasurementVerificationCheckSchema,
  dataDiagramVerificationCheckSchema,
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
  lineage: z.strictObject({
    contentContractVersion: z.string().min(1),
    sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceTaskId: z.string().regex(/^(?:example|transfer)-[a-z0-9-]+$/u),
  }),
});

export const workedStepSchema = z.strictObject({
  stepId: z.string().regex(/^step-[a-z0-9-]+$/u),
  explanation: z.string().min(1),
  factId: factIdSchema,
});

export const workedExampleSchema = z.strictObject({
  exampleId: z.string().regex(/^(?:example|challenge|transfer)-[a-z0-9-]+$/u),
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
    "bar-chart",
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
