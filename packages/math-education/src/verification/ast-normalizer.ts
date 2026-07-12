import { type ExpressionNode, expressionNodeSchema } from "../domain/index.js";
import { canonicalJson } from "./canonical-json.js";

function bigintGcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function normalizeExpression(input: ExpressionNode): ExpressionNode {
  const node = expressionNodeSchema.parse(input);
  switch (node.kind) {
    case "rational": {
      const numerator = BigInt(node.numerator);
      const denominator = BigInt(node.denominator);
      const divisor = bigintGcd(numerator, denominator);
      return {
        kind: "rational",
        numerator: String(numerator / divisor),
        denominator: String(denominator / divisor),
      };
    }
    case "sum":
    case "product":
      return {
        kind: node.kind,
        operands: node.operands
          .map(normalizeExpression)
          .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
      };
    case "negate":
      return { kind: "negate", operand: normalizeExpression(node.operand) };
    case "quotient":
    case "power":
      return {
        kind: node.kind,
        left: normalizeExpression(node.left),
        right: normalizeExpression(node.right),
      };
    case "root":
      return {
        kind: "root",
        radicand: normalizeExpression(node.radicand),
        degree: normalizeExpression(node.degree),
      };
    case "function":
      return {
        kind: "function",
        name: node.name,
        args: node.args.map(normalizeExpression),
      };
    case "relation":
      return {
        kind: "relation",
        operator: node.operator,
        left: normalizeExpression(node.left),
        right: normalizeExpression(node.right),
      };
    case "tuple":
    case "set":
    case "matrix":
      return { kind: node.kind, items: node.items.map(normalizeExpression) };
    default:
      return node;
  }
}
