import { type ExpressionNode, type MathLanguage } from "../domain/index.js";
import { expressionToLatex } from "../verification/latex-formatter.js";
import {
  localeProfiles,
  speechLexicon,
  spokenDigit,
  spokenUnit,
} from "./tts-lexicon.js";

export interface FormattedMath {
  display: string;
  spoken: string;
  latex: string;
}

function groupedInteger(value: string, language: MathLanguage): string {
  return new Intl.NumberFormat(localeProfiles[language].intl, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(BigInt(value));
}

function decimalParts(unscaled: string, scale: number): [string, string] {
  const negative = unscaled.startsWith("-");
  const digits = unscaled.replace("-", "").padStart(scale + 1, "0");
  const whole = `${negative ? "-" : ""}${digits.slice(0, -scale || undefined)}`;
  return [whole, scale === 0 ? "" : digits.slice(-scale)];
}

function spokenInteger(value: string, language: MathLanguage): string {
  const words = speechLexicon(language);
  const negative = value.startsWith("-");
  const digits = value.replace("-", "").replace(/^0+(?=\d)/u, "");
  const spoken = digits
    .split("")
    .map((digit) => spokenDigit(digit, language))
    .join(" ");
  return negative ? `${words.minus} ${spoken}` : spoken;
}

function displayExpression(
  node: ExpressionNode,
  language: MathLanguage
): string {
  switch (node.kind) {
    case "integer":
      return groupedInteger(node.value, language);
    case "decimal": {
      const [whole, fractional] = decimalParts(node.unscaled, node.scale);
      if (!fractional) return groupedInteger(whole, language);
      const separator = ["de", "es", "fr", "pt"].includes(language) ? "," : ".";
      return `${groupedInteger(whole, language)}${separator}${fractional}`;
    }
    case "rational":
      return `${groupedInteger(node.numerator, language)}/${groupedInteger(node.denominator, language)}`;
    case "negate":
      return `−${displayExpression(node.operand, language)}`;
    case "sum":
      return node.operands
        .map((item) => displayExpression(item, language))
        .join(" + ");
    case "product":
      return node.operands
        .map((item) => displayExpression(item, language))
        .join(" × ");
    case "quotient":
      return `${displayExpression(node.left, language)} ÷ ${displayExpression(node.right, language)}`;
    case "power":
      return `${displayExpression(node.left, language)}^${displayExpression(node.right, language)}`;
    case "root":
      return `√[${displayExpression(node.degree, language)}] ${displayExpression(node.radicand, language)}`;
    case "relation":
      return `${displayExpression(node.left, language)} ${{ eq: "=", lt: "<", lte: "≤", gt: ">", gte: "≥" }[node.operator]} ${displayExpression(node.right, language)}`;
    case "constant":
      return node.name === "pi" ? "π" : "e";
    case "symbol":
      return node.name;
    case "function":
      return `${node.name}(${node.args.map((item) => displayExpression(item, language)).join(", ")})`;
    case "tuple":
      return `(${node.items.map((item) => displayExpression(item, language)).join(", ")})`;
    case "set":
      return `{${node.items.map((item) => displayExpression(item, language)).join(", ")}}`;
    case "matrix":
      return `[${node.items.map((item) => displayExpression(item, language)).join(", ")}]`;
  }
}

function spokenExpression(
  node: ExpressionNode,
  language: MathLanguage
): string {
  const words = speechLexicon(language);
  switch (node.kind) {
    case "integer":
      return spokenInteger(node.value, language);
    case "decimal": {
      const [whole, fractional] = decimalParts(node.unscaled, node.scale);
      return fractional
        ? `${spokenInteger(whole, language)} ${words.decimal} ${fractional
            .split("")
            .map((digit) => spokenDigit(digit, language))
            .join(" ")}`
        : spokenInteger(whole, language);
    }
    case "rational":
      return `${spokenInteger(node.numerator, language)} ${words.fraction} ${spokenInteger(node.denominator, language)}`;
    case "negate":
      return `${words.minus} ${spokenExpression(node.operand, language)}`;
    case "sum":
      return node.operands
        .map((item) => spokenExpression(item, language))
        .join(` ${words.plus} `);
    case "product":
      return node.operands
        .map((item) => spokenExpression(item, language))
        .join(` ${words.times} `);
    case "quotient":
      return `${spokenExpression(node.left, language)} ${words.dividedBy} ${spokenExpression(node.right, language)}`;
    case "power":
      return `${spokenExpression(node.left, language)} ${words.power} ${spokenExpression(node.right, language)}`;
    case "root":
      return `${spokenExpression(node.degree, language)} ${words.root} ${spokenExpression(node.radicand, language)}`;
    case "relation":
      return `${spokenExpression(node.left, language)} ${{ eq: words.equals, lt: words.lt, lte: words.lte, gt: words.gt, gte: words.gte }[node.operator]} ${spokenExpression(node.right, language)}`;
    case "constant":
      return node.name === "pi" ? "pi" : "e";
    case "symbol":
      if (language === "de" && node.name === "x") return "x";
      throw new Error(
        `No reviewed ${language} spoken form for symbol ${node.name}.`
      );
    case "function":
      throw new Error(
        `No reviewed ${language} spoken form for function ${node.name}.`
      );
    case "tuple":
    case "set":
    case "matrix":
      return node.items
        .map((item) => spokenExpression(item, language))
        .join(", ");
  }
}

export function formatExpression(
  expression: ExpressionNode,
  language: MathLanguage
): FormattedMath {
  return {
    display: displayExpression(expression, language),
    spoken: spokenExpression(expression, language),
    latex: expressionToLatex(expression),
  };
}

export function formatMeasurement(
  value: ExpressionNode,
  unit: { symbol: string; angle?: "degree" | "radian" | undefined },
  language: MathLanguage
): FormattedMath {
  const formatted = formatExpression(value, language);
  const symbol = unit.angle === "degree" ? "°" : unit.symbol;
  const singular =
    (value.kind === "integer" && value.value === "1") ||
    (value.kind === "decimal" && BigInt(value.unscaled) === 10n ** BigInt(value.scale));
  return {
    display: `${formatted.display} ${symbol}`,
    spoken: `${formatted.spoken} ${spokenUnit(unit.angle ?? unit.symbol, language, singular)}`,
    latex: `${formatted.latex}\\,\\mathrm{${symbol}}`,
  };
}

export const formatExactInteger = groupedInteger;
