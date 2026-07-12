import katex from "katex";
import {
  expressionToLatex,
  type ExpressionNode,
} from "@mediaforge/math-education";

export interface BoundMathValue {
  factId: string;
  expression: ExpressionNode;
}
export interface PointValue {
  factId: string;
  x: ExpressionNode;
  y: ExpressionNode;
}
export interface VisualComponentResult {
  component: string;
  factIds: readonly string[];
  svg: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function assertFactIds(values: readonly { factId: string }[]): void {
  if (
    values.length === 0 ||
    values.some((value) => !/^[a-z][a-z0-9-]*$/u.test(value.factId))
  )
    throw new Error("Every displayed mathematical value requires a factId.");
}
function svg(
  component: string,
  factIds: readonly string[],
  body: string
): VisualComponentResult {
  return {
    component,
    factIds,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" role="img" data-component="${component}">${body}</svg>`,
  };
}

export function Formula(value: BoundMathValue): VisualComponentResult {
  assertFactIds([value]);
  const latex = expressionToLatex(value.expression);
  const markup = katex.renderToString(latex, {
    throwOnError: true,
    strict: "error",
    trust: false,
    output: "html",
  });
  return svg(
    "Formula",
    [value.factId],
    `<foreignObject x="80" y="80" width="1440" height="540"><div xmlns="http://www.w3.org/1999/xhtml" data-fact-id="${value.factId}" style="font-size:96px;color:#14213d">${markup}</div></foreignObject>`
  );
}

export function EquationSteps(
  values: readonly BoundMathValue[]
): VisualComponentResult {
  assertFactIds(values);
  return svg(
    "EquationSteps",
    values.map((value) => value.factId),
    values
      .map(
        (value, index) =>
          `<text x="120" y="${120 + index * 110}" font-size="72" data-fact-id="${value.factId}">${escapeXml(expressionToLatex(value.expression))}</text>`
      )
      .join("")
  );
}
export function NumberLine(
  values: readonly BoundMathValue[]
): VisualComponentResult {
  assertFactIds(values);
  return svg(
    "NumberLine",
    values.map((value) => value.factId),
    `<line x1="100" y1="350" x2="1500" y2="350" stroke="#14213d" stroke-width="8"/>${values.map((value, index) => `<circle cx="${200 + index * 240}" cy="350" r="18" fill="#fca311" data-fact-id="${value.factId}"/>`).join("")}`
  );
}
export function CoordinatePlane(
  points: readonly PointValue[]
): VisualComponentResult {
  assertFactIds(points);
  return svg(
    "CoordinatePlane",
    points.map((point) => point.factId),
    `<path d="M100 350H1500M800 50V650" stroke="#14213d" stroke-width="5"/>${points.map((point, index) => `<circle cx="${300 + index * 180}" cy="${520 - index * 90}" r="16" fill="#e63946" data-fact-id="${point.factId}"/>`).join("")}`
  );
}
export const FunctionGraph = CoordinatePlane;
export const GeometryFigure = EquationSteps;
export const MeasurementDiagram = EquationSteps;
export const DataTable = EquationSteps;
export const BarChart = EquationSteps;
export const LineChart = CoordinatePlane;
export const PieChart = EquationSteps;
export const BoxPlot = NumberLine;
export const ProbabilityTree = EquationSteps;
export const FourFieldTable = EquationSteps;
export const FractionModel = EquationSteps;
export const PlaceValueChart = EquationSteps;
