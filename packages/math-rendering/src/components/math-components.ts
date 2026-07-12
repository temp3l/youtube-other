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

export const MATH_SVG_RENDERER_VERSION = "math-svg.v3";
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
export const geometryComponentSchema = z.strictObject({
  kind: z.literal("geometry"),
  shape: z.enum(["rectangle", "triangle", "circle", "right-triangle"]),
  measurements: z.array(boundMathValueSchema).min(1).max(5),
});
export const tableComponentSchema = z.strictObject({
  kind: z.literal("table"),
  columnLabels: z.array(nonMathematicalLabelSchema).min(1).max(4),
  rows: z.array(z.array(boundMathValueSchema).min(1).max(4)).min(1).max(4),
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

export const semanticMathComponentSchema = z.discriminatedUnion("kind", [
  formulaComponentSchema,
  numberLineComponentSchema,
  graphComponentSchema,
  geometryComponentSchema,
  tableComponentSchema,
  measurementComponentSchema,
  probabilityComponentSchema,
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
    case "measurement":
      return input.measurements.map((measurement) => measurement.factId);
    case "table":
      return input.rows.flatMap((row) => row.map((cell) => cell.factId));
    case "probability":
      return input.branches.map((branch) => branch.probability.factId);
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
    throw new Error("Measurement unit symbols cannot contain rendering commands.");
  const symbol = measurement.unit.angle === "degree" ? "°" : measurement.unit.symbol;
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#14213d" data-fact-id="${measurement.factId}">${escapeXml(`${expressionToSvgText(measurement.value)} ${symbol}`)}</text>`;
}

function wrapSvg(
  input: SemanticMathComponent,
  body: string,
  minimumGlyphPx: number
): VisualComponentResult {
  const ids = factIds(input);
  if (ids.length === 0)
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
  return {
    component: input.kind,
    factIds: ids,
    svg,
    svgHash: hashText(svg),
    cacheKey,
    minimumGlyphPx,
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
    `<path d="M240 850H1680M240 200V850" stroke="#14213d" stroke-width="6"/>${mathText(input.xMinimum, 240, 950)}${mathText(input.xMaximum, 1680, 950)}${mathText(input.yMinimum, 150, 850)}${mathText(input.yMaximum, 150, 220)}${points}`,
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
  if (input.measurements.length !== expectedMeasurements)
    throw new Error(
      `${input.shape} geometry requires exactly ${expectedMeasurements} semantic measurements.`
    );
  const labels = input.measurements
    .map((measurement, index) =>
      mathText(
        measurement,
        600 + (index % 3) * 360,
        930 - Math.floor(index / 3) * 110
      )
    )
    .join("");
  return wrapSvg(input, `${geometryPath(input.shape)}${labels}`, 72);
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
    220 + (index * 1480) / Math.max(1, input.nodes.length - 1);
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
    case "measurement":
      return renderMeasurement(input);
    case "probability":
      return renderProbability(input);
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
export const MeasurementDiagram = (
  input: Omit<z.infer<typeof measurementComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "measurement", ...input });
export const ProbabilityTree = (
  input: Omit<z.infer<typeof probabilityComponentSchema>, "kind">
) => renderSemanticComponent({ kind: "probability", ...input });
