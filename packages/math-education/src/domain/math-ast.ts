import { z } from "zod";

const integerStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)$/u);
const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/u);

export type ExpressionNode =
  | { kind: "integer"; value: string }
  | { kind: "rational"; numerator: string; denominator: string }
  | { kind: "decimal"; unscaled: string; scale: number }
  | { kind: "constant"; name: "pi" | "e" }
  | { kind: "symbol"; name: string; assumptions?: string[] | undefined }
  | { kind: "negate"; operand: ExpressionNode }
  | { kind: "sum" | "product"; operands: ExpressionNode[] }
  | { kind: "quotient" | "power"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "root"; radicand: ExpressionNode; degree: ExpressionNode }
  | {
      kind: "function";
      name: "abs" | "sin" | "cos" | "tan" | "log";
      args: ExpressionNode[];
    }
  | {
      kind: "relation";
      operator: "eq" | "lt" | "lte" | "gt" | "gte";
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | { kind: "tuple" | "set" | "matrix"; items: ExpressionNode[] };

export const expressionNodeSchema: z.ZodType<ExpressionNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("integer"), value: integerStringSchema }),
    z.strictObject({
      kind: z.literal("rational"),
      numerator: integerStringSchema,
      denominator: positiveIntegerStringSchema,
    }),
    z.strictObject({
      kind: z.literal("decimal"),
      unscaled: integerStringSchema,
      scale: z.number().int().nonnegative(),
    }),
    z.strictObject({ kind: z.literal("constant"), name: z.enum(["pi", "e"]) }),
    z.strictObject({
      kind: z.literal("symbol"),
      name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u),
      assumptions: z.array(z.string().min(1)).optional(),
    }),
    z.strictObject({
      kind: z.literal("negate"),
      operand: expressionNodeSchema,
    }),
    z.strictObject({
      kind: z.enum(["sum", "product"]),
      operands: z.array(expressionNodeSchema).min(2),
    }),
    z.strictObject({
      kind: z.enum(["quotient", "power"]),
      left: expressionNodeSchema,
      right: expressionNodeSchema,
    }),
    z.strictObject({
      kind: z.literal("root"),
      radicand: expressionNodeSchema,
      degree: expressionNodeSchema,
    }),
    z.strictObject({
      kind: z.literal("function"),
      name: z.enum(["abs", "sin", "cos", "tan", "log"]),
      args: z.array(expressionNodeSchema).min(1),
    }),
    z.strictObject({
      kind: z.literal("relation"),
      operator: z.enum(["eq", "lt", "lte", "gt", "gte"]),
      left: expressionNodeSchema,
      right: expressionNodeSchema,
    }),
    z.strictObject({
      kind: z.enum(["tuple", "set", "matrix"]),
      items: z.array(expressionNodeSchema),
    }),
  ])
);

export const unitExpressionSchema = z.strictObject({
  symbol: z.string().min(1),
  scale: z.strictObject({
    numerator: positiveIntegerStringSchema,
    denominator: positiveIntegerStringSchema,
  }),
  dimensions: z.record(z.string(), z.number().int()),
  angle: z.enum(["degree", "radian"]).optional(),
});

export const intervalDomainSchema = z.strictObject({
  kind: z.literal("interval"),
  minimum: expressionNodeSchema,
  maximum: expressionNodeSchema,
  minimumInclusive: z.boolean(),
  maximumInclusive: z.boolean(),
});

const graphPointSchema = z.strictObject({
  x: expressionNodeSchema,
  y: expressionNodeSchema,
});

export const graphEvidenceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("point"),
    function: expressionNodeSchema,
    variable: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u),
    point: graphPointSchema,
    domain: intervalDomainSchema,
  }),
  z.strictObject({
    mode: z.literal("slope"),
    function: expressionNodeSchema,
    variable: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/u),
    from: graphPointSchema,
    to: graphPointSchema,
    domain: intervalDomainSchema,
  }),
]);

export const geometryEvidenceSchema = z.strictObject({
  entity: z.enum(["rectangle", "triangle", "circle", "right-triangle"]),
  formula: z.enum([
    "rectangle-area",
    "rectangle-perimeter",
    "triangle-area",
    "circle-area",
    "circle-circumference",
    "pythagorean-hypotenuse",
  ]),
  parameters: z.record(z.string(), expressionNodeSchema),
  assumptions: z.array(z.string().min(1)).min(1),
});

export const probabilityEvidenceSchema = z.strictObject({
  rule: z.enum([
    "single",
    "sum",
    "path-product",
    "complement",
    "normalization",
  ]),
  inputs: z.array(expressionNodeSchema).min(1),
});

export const scalarExactValueSchema = z.strictObject({
  kind: z.literal("scalar"),
  expression: expressionNodeSchema,
});

export const measurementExactValueSchema = z.strictObject({
  kind: z.literal("measurement"),
  value: expressionNodeSchema,
  unit: unitExpressionSchema,
});

export const exactValueSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    scalarExactValueSchema,
    measurementExactValueSchema,
    z.strictObject({
      kind: z.enum(["finite-set", "tuple"]),
      values: z.array(exactValueSchema),
    }),
    z.strictObject({
      kind: z.literal("approximation"),
      exact: expressionNodeSchema,
      displayed: z.string().min(1),
      tolerance: expressionNodeSchema,
    }),
  ])
);
