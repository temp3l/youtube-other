import katex from "katex";
import { z } from "zod";
import { hashText } from "@mediaforge/shared";
import {
  canonicalHash,
  expressionNodeSchema,
  expressionToLatex,
  unitExpressionSchema,
  type ExpressionNode,
} from "@mediaforge/math-education";

export const MATH_SVG_RENDERER_VERSION = "math-svg.v6";
export const MATH_FONT_PROFILE = "katex-0.17.0-system-sans-v1";

const factIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u);
const boundMathValueSchema = z.strictObject({
  factId: factIdSchema,
  expression: expressionNodeSchema,
});
const pointValueSchema = z.strictObject({
  factId: factIdSchema,
  x: expressionNodeSchema,
  y: expressionNodeSchema,
});
const nonMathematicalLabelSchema = z
  .string()
  .min(1)
  .max(24)
  .regex(
    /^\p{L}[\p{L}\p{M}\s-]*$/u,
    "Unbound labels cannot contain mathematical values."
  );
const boundMeasurementSchema = z.strictObject({
  factId: factIdSchema,
  value: expressionNodeSchema,
  unit: unitExpressionSchema.superRefine((unit, context) => {
    const dimensions = Object.values(unit.dimensions);
    if (dimensions.length === 0 || dimensions.every((power) => power === 0))
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "A displayed measurement requires a non-zero unit dimension.",
      });
  }),
});
const boundDisplayFactSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("scalar"),
    factId: factIdSchema,
    expression: expressionNodeSchema,
    display: z.string().min(1).max(120).optional(),
  }),
  z.strictObject({
    kind: z.literal("measurement"),
    factId: factIdSchema,
    value: expressionNodeSchema,
    unit: unitExpressionSchema,
    display: z.string().min(1).max(120).optional(),
  }),
]);

export const formulaComponentSchema = z.strictObject({
  kind: z.literal("formula"),
  value: boundMathValueSchema,
});
export const numberLineComponentSchema = z.strictObject({
  kind: z.literal("number-line"),
  minimum: boundMathValueSchema,
  maximum: boundMathValueSchema,
  markers: z.array(boundMathValueSchema).min(1).max(8),
});
export const graphComponentSchema = z.strictObject({
  kind: z.literal("graph"),
  xMinimum: boundMathValueSchema,
  xMaximum: boundMathValueSchema,
  yMinimum: boundMathValueSchema,
  yMaximum: boundMathValueSchema,
  points: z.array(pointValueSchema).min(1).max(8),
});
const semanticLineValueSchema = z.strictObject({
  factId: factIdSchema,
  from: z.strictObject({ x: expressionNodeSchema, y: expressionNodeSchema }),
  to: z.strictObject({ x: expressionNodeSchema, y: expressionNodeSchema }),
});
const geometryRelationClaimSchema = z.strictObject({
  factId: factIdSchema,
  kind: z.enum(["parallel", "perpendicular"]),
  lineFactIds: z.tuple([factIdSchema, factIdSchema]),
  colorIndependentCue: z.string().min(1),
});
export const geometryComponentSchema = z
  .strictObject({
    kind: z.literal("geometry"),
    shape: z.enum(["rectangle", "triangle", "circle", "right-triangle"]),
    measurements: z.array(boundMathValueSchema).min(1).max(5),
    semanticLines: z.array(semanticLineValueSchema).max(4).optional(),
    relationClaims: z.array(geometryRelationClaimSchema).max(4).optional(),
    scaleMode: z.enum(["to-scale", "not-to-scale"]).optional(),
    visibleScaleLabel: z.literal("nicht maßstabsgetreu").optional(),
    accessibleDescription: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.scaleMode === "not-to-scale" && !value.visibleScaleLabel)
      context.addIssue({
        code: "custom",
        path: ["visibleScaleLabel"],
        message: "A non-scale geometry diagram requires a visible label.",
      });
    if ((value.semanticLines?.length ?? 0) > 0 && !value.accessibleDescription)
      context.addIssue({
        code: "custom",
        path: ["accessibleDescription"],
        message: "Semantic geometry requires an accessible description.",
      });
    const lineIds = new Set(
      value.semanticLines?.map((line) => line.factId) ?? []
    );
    for (const claim of value.relationClaims ?? [])
      if (claim.lineFactIds.some((lineId) => !lineIds.has(lineId)))
        context.addIssue({
          code: "custom",
          path: ["relationClaims", claim.factId],
          message: "Geometry relation references an unknown semantic line.",
        });
  });
export const tableComponentSchema = z.strictObject({
  kind: z.literal("table"),
  columnLabels: z.array(nonMathematicalLabelSchema).min(1).max(4),
  rows: z.array(z.array(boundMathValueSchema).min(1).max(4)).min(1).max(4),
});
export const barChartComponentSchema = z.strictObject({
  kind: z.literal("bar-chart"),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  verifierCheckId: z.string().regex(/^check-[a-z0-9-]+$/u),
  orientation: z.enum(["column", "bar"]),
  axis: z.strictObject({
    origin: boundMathValueSchema,
    maximum: boundMathValueSchema,
    tickInterval: boundMathValueSchema,
    unitLabel: nonMathematicalLabelSchema,
  }),
  bars: z
    .array(
      z.strictObject({
        category: nonMathematicalLabelSchema,
        categoryFactId: factIdSchema,
        value: boundMathValueSchema,
        pattern: z.enum(["solid", "diagonal", "dots"]),
      })
    )
    .min(1)
    .max(8),
  accessibleEncoding: z.strictObject({
    colorIndependentCue: z.string().min(1),
    visibleValueLabels: z.literal(true),
  }),
});
export const measurementComponentSchema = z.strictObject({
  kind: z.literal("measurement"),
  measurements: z.array(boundMeasurementSchema).min(1).max(5),
});
export const probabilityComponentSchema = z.strictObject({
  kind: z.literal("probability"),
  nodes: z.array(nonMathematicalLabelSchema).min(2).max(7),
  branches: z
    .array(
      z.strictObject({
        from: z.number().int().nonnegative(),
        to: z.number().int().positive(),
        probability: boundMathValueSchema,
      })
    )
    .min(1)
    .max(8),
});
export const lessonBoardComponentSchema = z.strictObject({
  kind: z.literal("lesson-board"),
  title: z.string().min(1).max(48),
  body: z.string().min(1).max(180),
  prompt: z.string().min(1).max(96),
});
export const factStackComponentSchema = z.strictObject({
  kind: z.literal("fact-stack"),
  title: z.string().min(1).max(48),
  facts: z.array(boundDisplayFactSchema).min(1).max(4),
});
export const placeValueChartComponentSchema = z.strictObject({
  kind: z.literal("place-value-chart"),
  source: boundMathValueSchema,
});
export const numberLineFocusComponentSchema = z.strictObject({
  kind: z.literal("number-line-focus"),
  focus: boundMathValueSchema,
});
export const tallyTableComponentSchema = z
  .strictObject({
    kind: z.literal("tally-table"),
    dataset: boundMathValueSchema,
    rows: z
      .array(
        z.strictObject({
          category: nonMathematicalLabelSchema,
          count: boundMathValueSchema,
        })
      )
      .min(1)
      .max(4),
  })
  .superRefine((value, context) => {
    if (
      value.dataset.expression.kind !== "tuple" ||
      value.dataset.expression.items.length !== value.rows.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["dataset"],
        message: "A tally table requires one dataset tuple value per row.",
      });
      return;
    }
    for (const [index, row] of value.rows.entries()) {
      if (
        canonicalHash(value.dataset.expression.items[index]) !==
        canonicalHash(row.count.expression)
      )
        context.addIssue({
          code: "custom",
          path: ["rows", index, "count"],
          message: "Tally count differs from its verifier-bound dataset tuple.",
        });
    }
  });

export const semanticMathComponentSchema = z.discriminatedUnion("kind", [
  formulaComponentSchema,
  numberLineComponentSchema,
  graphComponentSchema,
  geometryComponentSchema,
  tableComponentSchema,
  barChartComponentSchema,
  measurementComponentSchema,
  probabilityComponentSchema,
  lessonBoardComponentSchema,
  factStackComponentSchema,
  placeValueChartComponentSchema,
  numberLineFocusComponentSchema,
  tallyTableComponentSchema,
]);
export type SemanticMathComponent = z.infer<typeof semanticMathComponentSchema>;
export type BoundMathValue = z.infer<typeof boundMathValueSchema>;
export type PointValue = z.infer<typeof pointValueSchema>;

export interface VisualComponentResult {
  component: SemanticMathComponent["kind"];
  factIds: readonly string[];
  svg: string;
  svgHash: string;
  cacheKey: string;
  minimumGlyphPx: number;
  bounds: { x: number; y: number; width: number; height: number };
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SAFE_BOUNDS = { x: 96, y: 54, width: 1728, height: 972 } as const;

function textBounds(
  text: string,
  x: number,
  baseline: number,
  anchor: "start" | "middle" | "end" = "middle",
  fontSize = 72
): Bounds {
  // One em per code point plus vertical leading is conservative for the fixed sans profile.
  const width = Math.max(fontSize, Array.from(text).length * fontSize);
  const left =
    anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { x: left, y: baseline - fontSize, width, height: fontSize * 1.25 };
}

function unionBounds(bounds: readonly Bounds[]): Bounds {
  if (bounds.length === 0)
    throw new Error("Math visual bounds cannot be established.");
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  const result = { x: left, y: top, width: right - left, height: bottom - top };
  if (
    result.x < SAFE_BOUNDS.x ||
    result.y < SAFE_BOUNDS.y ||
    result.x + result.width > SAFE_BOUNDS.x + SAFE_BOUNDS.width ||
    result.y + result.height > SAFE_BOUNDS.y + SAFE_BOUNDS.height
  )
    throw new Error("Semantic SVG labels overflow the render-safe area.");
  return result;
}

function expressionBounds(
  value: BoundMathValue,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end" = "middle"
): Bounds {
  return textBounds(expressionToSvgText(value.expression), x, y, anchor);
}

function componentBounds(input: SemanticMathComponent): Bounds {
  if (
    input.kind === "lesson-board" ||
    input.kind === "fact-stack" ||
    input.kind === "place-value-chart" ||
    input.kind === "number-line-focus" ||
    input.kind === "tally-table"
  )
    return { x: 160, y: 100, width: 1600, height: 780 };
  if (input.kind === "formula")
    return { x: 160, y: 220, width: 1600, height: 640 };
  if (input.kind === "number-line") {
    const minimum = literalNumber(input.minimum.expression);
    const maximum = literalNumber(input.maximum.expression);
    const x = (value: number) =>
      180 + ((value - minimum) / (maximum - minimum)) * 1560;
    return unionBounds([
      { x: 176, y: 446, width: 1568, height: 188 },
      expressionBounds(input.minimum, 180, 450),
      expressionBounds(input.maximum, 1740, 450),
      ...input.markers.map((marker) =>
        expressionBounds(marker, x(literalNumber(marker.expression)), 650)
      ),
    ]);
  }
  if (input.kind === "graph") {
    const xMin = literalNumber(input.xMinimum.expression);
    const xMax = literalNumber(input.xMaximum.expression);
    const yMin = literalNumber(input.yMinimum.expression);
    const yMax = literalNumber(input.yMaximum.expression);
    const x = (value: number) => 240 + ((value - xMin) / (xMax - xMin)) * 1440;
    const y = (value: number) => 850 - ((value - yMin) / (yMax - yMin)) * 650;
    return unionBounds([
      { x: 237, y: 197, width: 1446, height: 656 },
      expressionBounds(input.xMinimum, 240, 950),
      expressionBounds(input.xMaximum, 1680, 950),
      expressionBounds(input.yMinimum, 180, 850),
      expressionBounds(input.yMaximum, 180, 220),
      ...input.points.map((point) =>
        textBounds(
          `(${expressionToSvgText(point.x)}, ${expressionToSvgText(point.y)})`,
          x(literalNumber(point.x)) + 28,
          y(literalNumber(point.y)) - 24,
          "start"
        )
      ),
    ]);
  }
  if (input.kind === "geometry")
    return unionBounds([
      { x: 412, y: 202, width: 1096, height: 636 },
      ...input.measurements.map((measurement, index) =>
        expressionBounds(
          measurement,
          600 + (index % 3) * 360,
          930 - Math.floor(index / 3) * 110
        )
      ),
    ]);
  if (input.kind === "table") {
    const width = 1440 / input.columnLabels.length;
    const height = 700 / (input.rows.length + 1);
    const labels = [
      ...input.columnLabels.map((label, index) =>
        textBounds(label, 240 + width * (index + 0.5), 230 + height / 2)
      ),
      ...input.rows.flatMap((row, rowIndex) =>
        row.map((cell, columnIndex) =>
          expressionBounds(
            cell,
            240 + width * (columnIndex + 0.5),
            230 + height * (rowIndex + 1.6)
          )
        )
      ),
    ];
    if (
      labels.some((bound) => bound.width > width - 24 || bound.height > height)
    )
      throw new Error("Semantic table content is unreadable within its cell.");
    return unionBounds([
      {
        x: 238,
        y: 178,
        width: 1444,
        height: height * (input.rows.length + 1) + 4,
      },
      ...labels,
    ]);
  }
  if (input.kind === "bar-chart")
    return { x: 180, y: 110, width: 1560, height: 900 };
  if (input.kind === "measurement")
    return unionBounds(
      input.measurements.flatMap((measurement, index) => {
        const y =
          250 + index * (600 / Math.max(1, input.measurements.length - 1));
        const symbol =
          measurement.unit.angle === "degree" ? "°" : measurement.unit.symbol;
        return [
          { x: 354, y: y - 6, width: 1072, height: 12 },
          textBounds(
            `${expressionToSvgText(measurement.value)} ${symbol}`,
            1550,
            y + 20
          ),
        ];
      })
    );
  const nodeX = (index: number) =>
    420 + (index * 1080) / Math.max(1, input.nodes.length - 1);
  const nodeY = (index: number) => 300 + (index % 2) * 440;
  return unionBounds([
    ...input.nodes.flatMap((label, index) => [
      { x: nodeX(index) - 59, y: nodeY(index) - 59, width: 118, height: 118 },
      textBounds(label, nodeX(index), nodeY(index) + 24),
    ]),
    ...input.branches.map((branch) =>
      expressionBounds(
        branch.probability,
        (nodeX(branch.from) + nodeX(branch.to)) / 2,
        (nodeY(branch.from) + nodeY(branch.to)) / 2 - 28
      )
    ),
  ]);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function literalNumber(expression: ExpressionNode): number {
  switch (expression.kind) {
    case "integer":
      return Number(expression.value);
    case "rational":
      return Number(expression.numerator) / Number(expression.denominator);
    case "decimal":
      return Number(expression.unscaled) / 10 ** expression.scale;
    case "negate":
      return -literalNumber(expression.operand);
    default:
      throw new Error(
        `Diagram coordinates require an exact numeric literal AST; received ${expression.kind}.`
      );
  }
}

function expressionToSvgText(expression: ExpressionNode): string {
  switch (expression.kind) {
    case "integer":
      return expression.value;
    case "rational":
      return `${expression.numerator}/${expression.denominator}`;
    case "decimal": {
      const sign = expression.unscaled.startsWith("-") ? "-" : "";
      const digits = expression.unscaled
        .replace("-", "")
        .padStart(expression.scale + 1, "0");
      const whole = digits.slice(0, -expression.scale || undefined);
      const fractional =
        expression.scale > 0 ? `.${digits.slice(-expression.scale)}` : "";
      return `${sign}${whole}${fractional}`;
    }
    case "constant":
      return expression.name === "pi" ? "π" : "e";
    case "symbol":
      return expression.name;
    case "negate":
      return `−(${expressionToSvgText(expression.operand)})`;
    case "sum":
      return `(${expression.operands.map(expressionToSvgText).join(" + ")})`;
    case "product":
      return `(${expression.operands.map(expressionToSvgText).join(" × ")})`;
    case "quotient":
      return `(${expressionToSvgText(expression.left)}) ÷ (${expressionToSvgText(expression.right)})`;
    case "power":
      return `(${expressionToSvgText(expression.left)})^(${expressionToSvgText(expression.right)})`;
    case "root":
      return `√[${expressionToSvgText(expression.degree)}](${expressionToSvgText(expression.radicand)})`;
    case "function":
      return `${expression.name}(${expression.args.map(expressionToSvgText).join(", ")})`;
    case "relation":
      return `${expressionToSvgText(expression.left)} ${{ eq: "=", lt: "<", lte: "≤", gt: ">", gte: "≥" }[expression.operator]} ${expressionToSvgText(expression.right)}`;
    case "tuple":
      return `(${expression.items.map(expressionToSvgText).join(", ")})`;
    case "set":
      return `{${expression.items.map(expressionToSvgText).join(", ")}}`;
    case "matrix":
      return `[${expression.items.map(expressionToSvgText).join(", ")}]`;
  }
}

function exactInteger(expression: ExpressionNode): bigint {
  switch (expression.kind) {
    case "integer":
      return BigInt(expression.value);
    case "negate":
      return -exactInteger(expression.operand);
    case "sum":
      return expression.operands.reduce(
        (total, operand) => total + exactInteger(operand),
        0n
      );
    case "product":
      return expression.operands.reduce(
        (total, operand) => total * exactInteger(operand),
        1n
      );
    default:
      throw new Error(
        `This board requires an exact integer expression; received ${expression.kind}.`
      );
  }
}

function wrappedText(value: string, maximumCharacters: number): string[] {
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maximumCharacters)
      lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 3);
}

function chalkStep(
  stepId: string,
  bounds: { x: number; y: number; width: number; height: number },
  factId?: string
): string {
  return `data-chalk-step="${stepId}" data-chalk-box="${bounds.x},${bounds.y},${bounds.width},${bounds.height}"${factId ? ` data-fact-id="${factId}"` : ""}`;
}

function factIds(input: SemanticMathComponent): string[] {
  switch (input.kind) {
    case "formula":
      return [input.value.factId];
    case "number-line":
      return [
        input.minimum.factId,
        input.maximum.factId,
        ...input.markers.map((marker) => marker.factId),
      ];
    case "graph":
      return [
        input.xMinimum.factId,
        input.xMaximum.factId,
        input.yMinimum.factId,
        input.yMaximum.factId,
        ...input.points.map((point) => point.factId),
      ];
    case "geometry":
      return [
        ...input.measurements.map((measurement) => measurement.factId),
        ...(input.semanticLines ?? []).map((line) => line.factId),
        ...(input.relationClaims ?? []).map((claim) => claim.factId),
      ];
    case "measurement":
      return input.measurements.map((measurement) => measurement.factId);
    case "table":
      return input.rows.flatMap((row) => row.map((cell) => cell.factId));
    case "bar-chart":
      return [
        input.axis.origin.factId,
        input.axis.maximum.factId,
        input.axis.tickInterval.factId,
        ...input.bars.flatMap((bar) => [bar.categoryFactId, bar.value.factId]),
      ];
    case "probability":
      return input.branches.map((branch) => branch.probability.factId);
    case "lesson-board":
      return [];
    case "fact-stack":
      return input.facts.map((fact) => fact.factId);
    case "place-value-chart":
      return [input.source.factId];
    case "number-line-focus":
      return [input.focus.factId];
    case "tally-table":
      return [
        input.dataset.factId,
        ...input.rows.map((row) => row.count.factId),
      ];
  }
}

function mathText(
  value: BoundMathValue,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end" = "middle",
  fontSize = 72
): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#14213d" data-fact-id="${value.factId}">${escapeXml(expressionToSvgText(value.expression))}</text>`;
}

function measurementText(
  measurement: z.infer<typeof boundMeasurementSchema>,
  x: number,
  y: number
): string {
  if (/\\|[{}]/u.test(measurement.unit.symbol))
    throw new Error(
      "Measurement unit symbols cannot contain rendering commands."
    );
  const symbol =
    measurement.unit.angle === "degree" ? "°" : measurement.unit.symbol;
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d" data-fact-id="${measurement.factId}">${escapeXml(`${expressionToSvgText(measurement.value)} ${symbol}`)}</text>`;
}

function wrapSvg(
  input: SemanticMathComponent,
  body: string,
  minimumGlyphPx: number
): VisualComponentResult {
  const ids = factIds(input);
  if (ids.length === 0 && input.kind !== "lesson-board")
    throw new Error(
      "A semantic component must display at least one fact-bound value."
    );
  const cacheKey = canonicalHash({
    rendererVersion:
      input.kind === "formula" ? "math-svg.v2" : MATH_SVG_RENDERER_VERSION,
    fontProfile: MATH_FONT_PROFILE,
    input,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" role="img" data-component="${input.kind}" data-cache-key="${cacheKey}"><rect width="1920" height="1080" fill="#f8fafc"/><g data-safe-area="96,54,1728,972">${body}</g></svg>`;
  const bounds = componentBounds(input);
  return {
    component: input.kind,
    factIds: ids,
    svg,
    svgHash: hashText(svg),
    cacheKey,
    minimumGlyphPx,
    bounds,
  };
}

function renderFormula(
  input: z.infer<typeof formulaComponentSchema>
): VisualComponentResult {
  const latex = expressionToLatex(input.value.expression);
  const markup = katex.renderToString(latex, {
    throwOnError: true,
    strict: "error",
    trust: false,
    output: "html",
  });
  return wrapSvg(
    input,
    `<foreignObject x="160" y="220" width="1600" height="640"><div xmlns="http://www.w3.org/1999/xhtml" data-fact-id="${input.value.factId}" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:112px;color:#14213d">${markup}</div></foreignObject>`,
    112
  );
}

function renderNumberLine(
  input: z.infer<typeof numberLineComponentSchema>
): VisualComponentResult {
  const minimum = literalNumber(input.minimum.expression);
  const maximum = literalNumber(input.maximum.expression);
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum >= maximum
  )
    throw new Error(
      "Number-line bounds must be finite and strictly increasing."
    );
  const x = (value: number) =>
    180 + ((value - minimum) / (maximum - minimum)) * 1560;
  const markers = input.markers
    .map((marker) => {
      const position = literalNumber(marker.expression);
      if (position < minimum || position > maximum)
        throw new Error(
          `Number-line marker ${marker.factId} is outside its bounds.`
        );
      const markerX = x(position);
      return `<circle cx="${markerX}" cy="540" r="20" fill="#f59e0b" data-fact-id="${marker.factId}"/>${mathText(marker, markerX, 650)}`;
    })
    .join("");
  return wrapSvg(
    input,
    `<line x1="180" y1="540" x2="1740" y2="540" stroke="#14213d" stroke-width="8"/>${mathText(input.minimum, 180, 450)}${mathText(input.maximum, 1740, 450)}${markers}`,
    72
  );
}

function renderGraph(
  input: z.infer<typeof graphComponentSchema>
): VisualComponentResult {
  const xMin = literalNumber(input.xMinimum.expression);
  const xMax = literalNumber(input.xMaximum.expression);
  const yMin = literalNumber(input.yMinimum.expression);
  const yMax = literalNumber(input.yMaximum.expression);
  if (
    ![xMin, xMax, yMin, yMax].every(Number.isFinite) ||
    xMin >= xMax ||
    yMin >= yMax
  )
    throw new Error("Graph bounds must be strictly increasing.");
  const x = (value: number) => 240 + ((value - xMin) / (xMax - xMin)) * 1440;
  const y = (value: number) => 850 - ((value - yMin) / (yMax - yMin)) * 650;
  const points = input.points
    .map((point) => {
      const pointX = literalNumber(point.x);
      const pointY = literalNumber(point.y);
      if (pointX < xMin || pointX > xMax || pointY < yMin || pointY > yMax)
        throw new Error(
          `Graph point ${point.factId} is outside its declared domain.`
        );
      return `<circle cx="${x(pointX)}" cy="${y(pointY)}" r="18" fill="#dc2626" data-fact-id="${point.factId}"/><text x="${x(pointX) + 28}" y="${y(pointY) - 24}" font-family="Arial, sans-serif" font-size="72" fill="#14213d" data-fact-id="${point.factId}">${escapeXml(`(${expressionToSvgText(point.x)}, ${expressionToSvgText(point.y)})`)}</text>`;
    })
    .join("");
  return wrapSvg(
    input,
    `<path d="M240 850H1680M240 200V850" stroke="#14213d" stroke-width="6"/>${mathText(input.xMinimum, 240, 950)}${mathText(input.xMaximum, 1680, 950)}${mathText(input.yMinimum, 180, 850)}${mathText(input.yMaximum, 180, 220)}${points}`,
    72
  );
}

function geometryPath(
  shape: z.infer<typeof geometryComponentSchema>["shape"]
): string {
  switch (shape) {
    case "rectangle":
      return '<rect x="420" y="250" width="1080" height="580" fill="#dbeafe" stroke="#14213d" stroke-width="8"/>';
    case "triangle":
      return '<path d="M420 830L960 230L1500 830Z" fill="#dbeafe" stroke="#14213d" stroke-width="8"/>';
    case "circle":
      return '<circle cx="960" cy="540" r="330" fill="#dbeafe" stroke="#14213d" stroke-width="8"/>';
    case "right-triangle":
      return '<path d="M480 830V280L1500 830Z" fill="#dbeafe" stroke="#14213d" stroke-width="8"/>';
  }
}

function renderGeometry(
  input: z.infer<typeof geometryComponentSchema>
): VisualComponentResult {
  const expectedMeasurements =
    input.shape === "circle" ? 1 : input.shape === "rectangle" ? 2 : 2;
  const tupleMeasurement =
    input.shape === "rectangle" &&
    input.measurements.length === 1 &&
    input.measurements[0]?.expression.kind === "tuple" &&
    input.measurements[0].expression.items.length === 2
      ? input.measurements[0]
      : null;
  if (!tupleMeasurement && input.measurements.length !== expectedMeasurements)
    throw new Error(
      `${input.shape} geometry requires exactly ${expectedMeasurements} semantic measurements.`
    );
  if (tupleMeasurement) {
    const tupleExpression = tupleMeasurement.expression;
    if (tupleExpression.kind !== "tuple")
      throw new Error("Rectangle tuple dimensions changed during rendering.");
    const [width, height] = tupleExpression.items;
    if (!width || !height)
      throw new Error("Rectangle tuple dimensions are incomplete.");
    const factId = tupleMeasurement.factId;
    const body = [
      `<rect x="420" y="250" width="1080" height="580" rx="8" fill="#dbeafe" opacity="0.2" ${chalkStep("geometry-fill", { x: 420, y: 250, width: 1080, height: 580 }, factId)}/>`,
      `<line x1="420" y1="250" x2="1500" y2="250" stroke="#14213d" stroke-width="9" ${chalkStep("geometry-edge-top", { x: 410, y: 238, width: 1100, height: 24 }, factId)}/>`,
      `<line x1="1500" y1="250" x2="1500" y2="830" stroke="#14213d" stroke-width="9" ${chalkStep("geometry-edge-right", { x: 1488, y: 238, width: 24, height: 604 }, factId)}/>`,
      `<line x1="1500" y1="830" x2="420" y2="830" stroke="#14213d" stroke-width="9" ${chalkStep("geometry-edge-bottom", { x: 410, y: 818, width: 1100, height: 24 }, factId)}/>`,
      `<line x1="420" y1="830" x2="420" y2="250" stroke="#14213d" stroke-width="9" ${chalkStep("geometry-edge-left", { x: 408, y: 238, width: 24, height: 604 }, factId)}/>`,
      `<g ${chalkStep("geometry-width-label", { x: 740, y: 840, width: 440, height: 90 }, factId)}><text x="960" y="910" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(`${expressionToSvgText(width)} cm`)}</text></g>`,
      `<g ${chalkStep("geometry-height-label", { x: 1505, y: 470, width: 220, height: 100 }, factId)}><text x="1580" y="555" text-anchor="start" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(`${expressionToSvgText(height)} cm`)}</text></g>`,
      `<g ${chalkStep("geometry-perimeter-trace", { x: 400, y: 230, width: 1120, height: 620 }, factId)}><rect x="400" y="230" width="1120" height="620" rx="18" fill="none" stroke="#f59e0b" stroke-width="13" stroke-dasharray="26 18"/></g>`,
      input.visibleScaleLabel
        ? `<g ${chalkStep("geometry-scale-label", { x: 520, y: 80, width: 880, height: 95 })}><text x="960" y="155" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(input.visibleScaleLabel)}</text></g>`
        : "",
    ].join("");
    return wrapSvg(input, body, 72);
  }
  const labels = input.measurements
    .map((measurement, index) =>
      mathText(
        measurement,
        600 + (index % 3) * 360,
        930 - Math.floor(index / 3) * 110
      )
    )
    .join("");
  const linesById = new Map(
    (input.semanticLines ?? []).map((line) => [line.factId, line])
  );
  const relations = (input.relationClaims ?? [])
    .map((claim, index) => {
      const [firstId, secondId] = claim.lineFactIds;
      const first = linesById.get(firstId)!;
      const second = linesById.get(secondId)!;
      const direction = (line: z.infer<typeof semanticLineValueSchema>) =>
        [
          literalNumber(line.to.x) - literalNumber(line.from.x),
          literalNumber(line.to.y) - literalNumber(line.from.y),
        ] as const;
      const a = direction(first);
      const b = direction(second);
      const valid =
        claim.kind === "parallel"
          ? a[0] * b[1] - a[1] * b[0] === 0
          : a[0] * b[0] + a[1] * b[1] === 0;
      if (!valid)
        throw new Error(
          `Semantic geometry contradicts ${claim.kind} claim ${claim.factId}.`
        );
      return `<text x="960" y="${130 + index * 72}" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="#14213d" data-fact-id="${claim.factId}">${escapeXml(`${claim.kind}: ${claim.colorIndependentCue}`)}</text>`;
    })
    .join("");
  const scaleLabel = input.visibleScaleLabel
    ? `<text x="960" y="1010" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="#14213d">${input.visibleScaleLabel}</text>`
    : "";
  const description = input.accessibleDescription
    ? `<title>${escapeXml(input.accessibleDescription)}</title>`
    : "";
  return wrapSvg(
    input,
    `${description}${geometryPath(input.shape)}${labels}${relations}${scaleLabel}`,
    72
  );
}

function renderTable(
  input: z.infer<typeof tableComponentSchema>
): VisualComponentResult {
  if (input.rows.some((row) => row.length !== input.columnLabels.length))
    throw new Error(
      "Every semantic table row must match the declared columns."
    );
  const width = 1440 / input.columnLabels.length;
  const height = 700 / (input.rows.length + 1);
  const headers = input.columnLabels
    .map(
      (label, index) =>
        `<text x="${240 + width * (index + 0.5)}" y="${230 + height / 2}" text-anchor="middle" font-size="72" font-weight="700">${escapeXml(label)}</text>`
    )
    .join("");
  const cells = input.rows
    .flatMap((row, rowIndex) =>
      row.map((cell, columnIndex) =>
        mathText(
          cell,
          240 + width * (columnIndex + 0.5),
          230 + height * (rowIndex + 1.6)
        )
      )
    )
    .join("");
  const lines = Array.from(
    { length: input.rows.length + 2 },
    (_, index) =>
      `<line x1="240" y1="${180 + height * index}" x2="1680" y2="${180 + height * index}" stroke="#64748b" stroke-width="4"/>`
  ).join("");
  return wrapSvg(input, `${lines}${headers}${cells}`, 72);
}

function renderBarChart(
  input: z.infer<typeof barChartComponentSchema>
): VisualComponentResult {
  const origin = literalNumber(input.axis.origin.expression);
  const maximum = literalNumber(input.axis.maximum.expression);
  const tick = literalNumber(input.axis.tickInterval.expression);
  if (origin !== 0) throw new Error("Count charts must visibly start at zero.");
  if (
    !Number.isInteger(maximum) ||
    !Number.isInteger(tick) ||
    maximum <= 0 ||
    tick <= 0 ||
    maximum % tick !== 0
  )
    throw new Error(
      "Bar-chart bounds require a positive consistent integer scale."
    );
  const categories = input.bars.map((bar) => bar.category);
  if (new Set(categories).size !== categories.length)
    throw new Error("Bar-chart categories must be unique.");
  const values = input.bars.map((bar) => literalNumber(bar.value.expression));
  if (
    values.some(
      (value) => !Number.isInteger(value) || value < 0 || value > maximum
    )
  )
    throw new Error(
      "Bar-chart values must be non-negative integer counts within the axis."
    );
  if (Math.max(...values) === 0)
    throw new Error("Zero-only bar charts are unsupported.");
  const patterns = `<defs><pattern id="diagonal" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 16L16 0" stroke="#14213d" stroke-width="4"/></pattern><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="4" fill="#14213d"/></pattern></defs>`;
  const axis = `<path d="M260 850H1660M260 850V160" stroke="#14213d" stroke-width="8"/>${mathText(input.axis.origin, 220, 880)}${mathText(input.axis.maximum, 220, 185)}${mathText(input.axis.tickInterval, 1500, 980)}<text x="960" y="105" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" fill="#14213d">${escapeXml(input.axis.unitLabel)}</text>`;
  const bars = input.bars
    .map((bar, index) => {
      const value = values[index]!;
      const fill = bar.pattern === "solid" ? "#93c5fd" : `url(#${bar.pattern})`;
      if (input.orientation === "column") {
        const width = 240;
        const x =
          340 + index * (1240 / Math.max(1, input.bars.length - 1)) - width / 2;
        const height = (value / maximum) * 650;
        return `<rect x="${x}" y="${850 - height}" width="${width}" height="${height}" fill="${fill}" stroke="#14213d" stroke-width="5" data-fact-id="${bar.value.factId}"/><text x="${x + width / 2}" y="${900}" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" data-fact-id="${bar.categoryFactId}">${escapeXml(bar.category)}</text>${mathText(bar.value, x + width / 2, 820 - height)}`;
      }
      const y = 250 + index * (520 / Math.max(1, input.bars.length - 1));
      const width = (value / maximum) * 1200;
      return `<rect x="360" y="${y - 55}" width="${width}" height="110" fill="${fill}" stroke="#14213d" stroke-width="5" data-fact-id="${bar.value.factId}"/><text x="300" y="${y + 18}" text-anchor="end" font-family="Arial, sans-serif" font-size="54" data-fact-id="${bar.categoryFactId}">${escapeXml(bar.category)}</text>${mathText(bar.value, 390 + width, y + 18, "start", 54)}`;
    })
    .join("");
  const title = `<title>${escapeXml(`Diagramm ${input.datasetHash}; ${input.accessibleEncoding.colorIndependentCue}`)}</title>`;
  return wrapSvg(input, `${title}${patterns}${axis}${bars}`, 72);
}

function renderMeasurement(
  input: z.infer<typeof measurementComponentSchema>
): VisualComponentResult {
  const labels = input.measurements
    .map((measurement, index) => {
      const y =
        250 + index * (600 / Math.max(1, input.measurements.length - 1));
      return `<line x1="360" y1="${y}" x2="1420" y2="${y}" stroke="#0f766e" stroke-width="12" data-fact-id="${measurement.factId}"/>${measurementText(measurement, 1550, y + 20)}`;
    })
    .join("");
  return wrapSvg(input, labels, 72);
}

function renderProbability(
  input: z.infer<typeof probabilityComponentSchema>
): VisualComponentResult {
  for (const branch of input.branches)
    if (
      branch.from >= input.nodes.length ||
      branch.to >= input.nodes.length ||
      branch.from >= branch.to
    )
      throw new Error(
        "Probability branches must reference forward, existing nodes."
      );
  const branchKeys = new Set<string>();
  const outgoingTotals = new Map<number, number>();
  for (const branch of input.branches) {
    const branchKey = `${branch.from}:${branch.to}`;
    if (branchKeys.has(branchKey))
      throw new Error("Probability branches must be unique.");
    branchKeys.add(branchKey);
    const probability = literalNumber(branch.probability.expression);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1)
      throw new Error(
        "Probability branch values must remain between zero and one."
      );
    const total = (outgoingTotals.get(branch.from) ?? 0) + probability;
    if (total > 1 + Number.EPSILON)
      throw new Error(
        "Probability branches from one node cannot total more than one."
      );
    outgoingTotals.set(branch.from, total);
  }
  const nodeX = (index: number) =>
    420 + (index * 1080) / Math.max(1, input.nodes.length - 1);
  const nodeY = (index: number) => 300 + (index % 2) * 440;
  const branches = input.branches
    .map((branch) => {
      const fromX = nodeX(branch.from);
      const fromY = nodeY(branch.from);
      const toX = nodeX(branch.to);
      const toY = nodeY(branch.to);
      return `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="#14213d" stroke-width="6" data-fact-id="${branch.probability.factId}"/>${mathText(branch.probability, (fromX + toX) / 2, (fromY + toY) / 2 - 28)}`;
    })
    .join("");
  const nodes = input.nodes
    .map(
      (label, index) =>
        `<circle cx="${nodeX(index)}" cy="${nodeY(index)}" r="54" fill="#dbeafe" stroke="#14213d" stroke-width="5"/><text x="${nodeX(index)}" y="${nodeY(index) + 24}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(label)}</text>`
    )
    .join("");
  return wrapSvg(input, `${branches}${nodes}`, 72);
}

function renderLessonBoard(
  input: z.infer<typeof lessonBoardComponentSchema>
): VisualComponentResult {
  const lines = wrappedText(input.body, 42);
  const body = [
    `<g ${chalkStep("lesson-title", { x: 200, y: 130, width: 1520, height: 100 })}><text x="960" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="76" font-weight="700" fill="#14213d">${escapeXml(input.title)}</text></g>`,
    `<path d="M430 255 Q960 230 1490 255" fill="none" stroke="#f59e0b" stroke-width="9" ${chalkStep("lesson-title-rule", { x: 420, y: 225, width: 1080, height: 55 })}/>`,
    ...lines.map(
      (line, index) =>
        `<g ${chalkStep(`lesson-body-${index + 1}`, { x: 180, y: 320 + index * 105, width: 1560, height: 95 })}><text x="960" y="${400 + index * 105}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(line)}</text></g>`
    ),
    `<g ${chalkStep("lesson-prompt-box", { x: 260, y: 680, width: 1400, height: 180 })}><rect x="260" y="680" width="1400" height="180" rx="28" fill="#dbeafe" opacity="0.24" stroke="#14213d" stroke-width="6"/>${wrappedText(
      input.prompt,
      34
    )
      .slice(0, 2)
      .map(
        (line, index) =>
          `<text x="960" y="${755 + index * 78}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(line)}</text>`
      )
      .join("")}</g>`,
  ].join("");
  return wrapSvg(input, body, 72);
}

function displayFactText(fact: z.infer<typeof boundDisplayFactSchema>): string {
  const display =
    fact.display ??
    (fact.kind === "scalar"
      ? expressionToSvgText(fact.expression)
      : `${expressionToSvgText(fact.value)} ${
          fact.unit.angle === "degree" ? "°" : fact.unit.symbol
        }`);
  return display
    .replace(/\s*([+=×÷])\s*/gu, " $1 ")
    .replace(/\s+/gu, " ")
    .trim();
}

function renderFactStack(
  input: z.infer<typeof factStackComponentSchema>
): VisualComponentResult {
  const single = input.facts.length === 1;
  const longSingleFact =
    single && displayFactText(input.facts[0]!).length > 24;
  const compact = input.facts.length >= 3;
  const cardHeight = compact ? 128 : 160;
  const rowGap = single ? 0 : compact ? 25 : 85;
  const firstTop = single ? 270 : 240;
  const rowHeight = cardHeight + rowGap;
  const rows = input.facts
    .map((fact, index) => {
      const y = firstTop + index * rowHeight;
      const emphasized = index === input.facts.length - 1;
      const display = displayFactText(fact);
      const width = single ? (longSingleFact ? 1500 : 1180) : 1380;
      const x = (1920 - width) / 2;
      const baseline = y + (single ? 108 : compact ? 91 : 106);
      const fontSize = single
        ? longSingleFact
          ? 72
          : 96
        : compact
          ? 72
          : 78;
      return `<g ${chalkStep(`fact-frame-${index + 1}`, { x, y, width, height: cardHeight })}><rect x="${x}" y="${y}" width="${width}" height="${cardHeight}" rx="24" fill="${emphasized ? "#dbeafe" : "none"}" opacity="${emphasized ? "0.24" : "1"}" stroke="${emphasized ? "#f59e0b" : "#64748b"}" stroke-width="${emphasized ? "8" : "4"}"/></g><g ${chalkStep(`fact-value-${index + 1}`, { x: x + 50, y: y + 14, width: width - 100, height: cardHeight - 28 }, fact.factId)}><text x="${x + 70}" y="${baseline}" text-anchor="start" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#14213d"><tspan font-size="72" font-weight="700">${index + 1}.</tspan><tspan dx="44">${escapeXml(display)}</tspan></text></g>`;
    })
    .join("");
  const connectors = Array.from(
    { length: Math.max(0, input.facts.length - 1) },
    (_, index) => {
      const top = firstTop + index * rowHeight + cardHeight + 8;
      const bottom = firstTop + (index + 1) * rowHeight - 8;
      const arrow = Math.max(top + 20, bottom);
      return `<path d="M960 ${top} V${arrow} M935 ${arrow - 24} L960 ${arrow} L985 ${arrow - 24}" fill="none" stroke="#f59e0b" stroke-width="7" ${chalkStep(`fact-connector-${index + 1}`, { x: 925, y: top, width: 70, height: Math.max(40, arrow - top + 8) })}/>`;
    }
  ).join("");
  const finalFact = input.facts.at(-1)!;
  const check =
    input.facts.length >= 3
      ? {
          path: "M1580 145 L1610 175 L1670 100",
          bounds: { x: 1560, y: 82, width: 130, height: 115 },
        }
      : {
          path: "M1420 750 L1470 800 L1570 690",
          bounds: { x: 1400, y: 670, width: 190, height: 150 },
        };
  const body = `<g ${chalkStep("fact-stack-title", { x: 220, y: 70, width: 1480, height: 90 })}><text x="960" y="145" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">${escapeXml(input.title)}</text></g><path d="M560 190 Q960 171 1360 190" fill="none" stroke="#f59e0b" stroke-width="7" ${chalkStep("fact-stack-rule", { x: 550, y: 165, width: 820, height: 45 })}/>${rows}${connectors}<path d="${check.path}" fill="none" stroke="#f59e0b" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" ${chalkStep("fact-stack-check", check.bounds, finalFact.factId)}/>`;
  return wrapSvg(input, body, single ? (longSingleFact ? 72 : 96) : 72);
}

function renderPlaceValueChart(
  input: z.infer<typeof placeValueChartComponentSchema>
): VisualComponentResult {
  const value = exactInteger(input.source.expression);
  if (value < 0n || value > 999_999_999n)
    throw new Error(
      "Place-value charts support non-negative values up to nine digits."
    );
  const rawDigits = value.toString();
  const columnCount = Math.max(6, rawDigits.length);
  const labels = ["HM", "ZM", "M", "HT", "ZT", "T", "H", "Z", "E"].slice(
    9 - columnCount
  );
  const digits = rawDigits.padStart(columnCount, "0").split("");
  const width = 1440 / columnCount;
  const gridX = 240;
  const headerY = 250;
  const rowY = 395;
  const headers = labels
    .map(
      (label, index) =>
        `<text x="${gridX + width * (index + 0.5)}" y="335" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">${label}</text>`
    )
    .join("");
  const grid = [
    `<rect x="${gridX}" y="${headerY}" width="1440" height="300" fill="none" stroke="#14213d" stroke-width="6"/>`,
    `<line x1="${gridX}" y1="${rowY}" x2="${gridX + 1440}" y2="${rowY}" stroke="#14213d" stroke-width="5"/>`,
    ...Array.from(
      { length: columnCount - 1 },
      (_, index) =>
        `<line x1="${gridX + width * (index + 1)}" y1="${headerY}" x2="${gridX + width * (index + 1)}" y2="${headerY + 300}" stroke="#64748b" stroke-width="4"/>`
    ),
  ].join("");
  const digitMarkup = digits
    .map(
      (digit, index) =>
        `<g ${chalkStep(`place-digit-${index + 1}`, { x: gridX + width * index, y: rowY, width, height: 155 }, input.source.factId)}><text x="${gridX + width * (index + 0.5)}" y="505" text-anchor="middle" font-family="Arial, sans-serif" font-size="94" fill="#14213d">${digit}</text></g>`
    )
    .join("");
  const expression = `${expressionToSvgText(input.source.expression)} = ${value.toString()}`;
  const body = [
    `<g ${chalkStep("place-title", { x: 300, y: 105, width: 1320, height: 90 })}><text x="960" y="175" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">Stellenwerttafel</text></g>`,
    `<g ${chalkStep("place-grid", { x: gridX, y: headerY, width: 1440, height: 300 }, input.source.factId)}>${grid}</g>`,
    `<g ${chalkStep("place-headers", { x: gridX, y: headerY, width: 1440, height: 145 })}>${headers}</g>`,
    digitMarkup,
    `<g ${chalkStep("place-equation", { x: 220, y: 635, width: 1480, height: 140 }, input.source.factId)}><text x="960" y="740" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(expression)}</text></g>`,
    `<g ${chalkStep("place-zero-note", { x: 350, y: 785, width: 1220, height: 80 })}><text x="960" y="850" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#f59e0b">Nullen sichern den Stellenwert.</text></g>`,
  ].join("");
  return wrapSvg(input, body, 72);
}

function renderNumberLineFocus(
  input: z.infer<typeof numberLineFocusComponentSchema>
): VisualComponentResult {
  const exact = exactInteger(input.focus.expression);
  const value = Number(exact);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      "Focused number lines require a non-negative safe integer."
    );
  const magnitude = Math.max(1, 10 ** Math.max(0, String(value).length - 2));
  const lower = Math.max(
    0,
    Math.floor(value / magnitude) * magnitude - 2 * magnitude
  );
  const upper = lower + 4 * magnitude;
  const x = (current: number) =>
    300 + ((current - lower) / (upper - lower)) * 1320;
  const tickMarkup = Array.from({ length: 5 }, (_, index) => {
    const tickValue = lower + index * magnitude;
    const tickX = x(tickValue);
    return `<g ${chalkStep(`number-tick-${index + 1}`, { x: tickX - 105, y: 430, width: 210, height: 180 }, input.focus.factId)}><line x1="${tickX}" y1="470" x2="${tickX}" y2="540" stroke="#14213d" stroke-width="7"/><text x="${tickX}" y="635" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${tickValue}</text></g>`;
  }).join("");
  const focusX = x(value);
  const body = [
    `<g ${chalkStep("number-title", { x: 260, y: 120, width: 1400, height: 95 })}><text x="960" y="195" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">Orientierung am Zahlenstrahl</text></g>`,
    `<line x1="300" y1="505" x2="1620" y2="505" stroke="#14213d" stroke-width="10" ${chalkStep("number-axis", { x: 290, y: 490, width: 1340, height: 30 }, input.focus.factId)}/>`,
    tickMarkup,
    `<g ${chalkStep("number-focus", { x: focusX - 48, y: 390, width: 96, height: 150 }, input.focus.factId)}><circle cx="${focusX}" cy="505" r="28" fill="#f59e0b" stroke="#14213d" stroke-width="7"/><path d="M${focusX} 420V465" stroke="#f59e0b" stroke-width="9"/></g>`,
    `<g ${chalkStep("number-equation", { x: 260, y: 690, width: 1400, height: 135 }, input.focus.factId)}><rect x="260" y="690" width="1400" height="135" rx="24" fill="#dbeafe" opacity="0.22" stroke="#64748b" stroke-width="4"/><text x="960" y="780" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(`${expressionToSvgText(input.focus.expression)} = ${exact.toString()}`)}</text></g>`,
  ].join("");
  return wrapSvg(input, body, 72);
}

function renderTallyTable(
  input: z.infer<typeof tallyTableComponentSchema>
): VisualComponentResult {
  const tableX = 220;
  const top = 310;
  const rowHeight = 135;
  const categoryWidth = 400;
  const tallyWidth = 760;
  const countWidth = 320;
  const totalWidth = categoryWidth + tallyWidth + countWidth;
  const headers = [
    ["Kategorie", tableX + categoryWidth / 2],
    ["Strichliste", tableX + categoryWidth + tallyWidth / 2],
    ["Anzahl", tableX + categoryWidth + tallyWidth + countWidth / 2],
  ]
    .map(
      ([label, center]) =>
        `<text x="${center}" y="${top + 88}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">${label}</text>`
    )
    .join("");
  const horizontal = Array.from(
    { length: input.rows.length + 2 },
    (_, index) =>
      `<line x1="${tableX}" y1="${top + rowHeight * index}" x2="${tableX + totalWidth}" y2="${top + rowHeight * index}" stroke="#64748b" stroke-width="4"/>`
  ).join("");
  const vertical = [
    tableX,
    tableX + categoryWidth,
    tableX + categoryWidth + tallyWidth,
    tableX + totalWidth,
  ]
    .map(
      (lineX) =>
        `<line x1="${lineX}" y1="${top}" x2="${lineX}" y2="${top + rowHeight * (input.rows.length + 1)}" stroke="#64748b" stroke-width="4"/>`
    )
    .join("");
  const rows = input.rows
    .map((row, rowIndex) => {
      const count = Number(exactInteger(row.count.expression));
      if (!Number.isInteger(count) || count < 0 || count > 20)
        throw new Error(
          "Tally rows support integer counts from zero through twenty."
        );
      const centerY = top + rowHeight * (rowIndex + 1.5);
      const marks = Array.from({ length: count }, (_, markIndex) => {
        const group = Math.floor(markIndex / 5);
        const within = markIndex % 5;
        const groupX = tableX + categoryWidth + 95 + group * 185;
        if (within === 4)
          return `<line x1="${groupX - 8}" y1="${centerY + 42}" x2="${groupX + 118}" y2="${centerY - 42}" stroke="#14213d" stroke-width="10" stroke-linecap="round" ${chalkStep(`tally-${rowIndex + 1}-${markIndex + 1}`, { x: groupX - 18, y: centerY - 52, width: 146, height: 104 }, row.count.factId)}/>`;
        const markX = groupX + within * 28;
        return `<line x1="${markX}" y1="${centerY - 42}" x2="${markX}" y2="${centerY + 42}" stroke="#14213d" stroke-width="9" stroke-linecap="round" ${chalkStep(`tally-${rowIndex + 1}-${markIndex + 1}`, { x: markX - 10, y: centerY - 52, width: 20, height: 104 }, row.count.factId)}/>`;
      }).join("");
      return `<g ${chalkStep(`tally-category-${rowIndex + 1}`, { x: tableX + 20, y: centerY - 55, width: categoryWidth - 40, height: 110 })}><text x="${tableX + 45}" y="${centerY + 24}" text-anchor="start" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(row.category)}</text></g>${marks}<g ${chalkStep(`tally-count-${rowIndex + 1}`, { x: tableX + categoryWidth + tallyWidth, y: centerY - 55, width: countWidth, height: 110 }, row.count.factId)}><text x="${tableX + categoryWidth + tallyWidth + countWidth / 2}" y="${centerY + 24}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${count}</text></g>`;
    })
    .join("");
  const body = [
    `<g ${chalkStep("tally-title", { x: 260, y: 80, width: 1400, height: 90 })}><text x="960" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#14213d">Strichliste aufbauen</text></g>`,
    `<g ${chalkStep("tally-dataset", { x: 260, y: 170, width: 1400, height: 100 }, input.dataset.factId)}><text x="960" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d">${escapeXml(`Datensatz: ${expressionToSvgText(input.dataset.expression)}`)}</text></g>`,
    `<g ${chalkStep("tally-grid", { x: tableX, y: top, width: totalWidth, height: rowHeight * (input.rows.length + 1) })}>${horizontal}${vertical}</g>`,
    `<g ${chalkStep("tally-headers", { x: tableX, y: top, width: totalWidth, height: rowHeight })}>${headers}</g>`,
    rows,
  ].join("");
  return wrapSvg(input, body, 72);
}

export function renderSemanticComponent(raw: unknown): VisualComponentResult {
  const input = semanticMathComponentSchema.parse(raw);
  switch (input.kind) {
    case "formula":
      return renderFormula(input);
    case "number-line":
      return renderNumberLine(input);
    case "graph":
      return renderGraph(input);
    case "geometry":
      return renderGeometry(input);
    case "table":
      return renderTable(input);
    case "bar-chart":
      return renderBarChart(input);
    case "measurement":
      return renderMeasurement(input);
    case "probability":
      return renderProbability(input);
    case "lesson-board":
      return renderLessonBoard(input);
    case "fact-stack":
      return renderFactStack(input);
    case "place-value-chart":
      return renderPlaceValueChart(input);
    case "number-line-focus":
      return renderNumberLineFocus(input);
    case "tally-table":
      return renderTallyTable(input);
  }
}

export const Formula = (
  input: Omit<z.infer<typeof formulaComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "formula", ...input });
export const NumberLine = (
  input: Omit<z.infer<typeof numberLineComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "number-line", ...input });
export const FunctionGraph = (
  input: Omit<z.infer<typeof graphComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "graph", ...input });
export const GeometryFigure = (
  input: Omit<z.infer<typeof geometryComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "geometry", ...input });
export const DataTable = (
  input: Omit<z.infer<typeof tableComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "table", ...input });
export const BarChart = (
  input: Omit<z.infer<typeof barChartComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "bar-chart", ...input });
export const MeasurementDiagram = (
  input: Omit<z.infer<typeof measurementComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "measurement", ...input });
export const ProbabilityTree = (
  input: Omit<z.infer<typeof probabilityComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "probability", ...input });
export const LessonBoard = (
  input: Omit<z.infer<typeof lessonBoardComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "lesson-board", ...input });
export const FactStack = (
  input: Omit<z.infer<typeof factStackComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "fact-stack", ...input });
export const PlaceValueChart = (
  input: Omit<z.infer<typeof placeValueChartComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "place-value-chart", ...input });
export const NumberLineFocus = (
  input: Omit<z.infer<typeof numberLineFocusComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "number-line-focus", ...input });
export const TallyTable = (
  input: Omit<z.infer<typeof tallyTableComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "tally-table", ...input });
