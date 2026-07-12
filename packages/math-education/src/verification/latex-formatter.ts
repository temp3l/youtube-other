import { type ExpressionNode } from "../domain/index.js";

export function expressionToLatex(node: ExpressionNode): string {
  switch (node.kind) {
    case "integer":
      return node.value;
    case "rational":
      return `\\frac{${node.numerator}}{${node.denominator}}`;
    case "decimal": {
      const sign = node.unscaled.startsWith("-") ? "-" : "";
      const digits = node.unscaled
        .replace("-", "")
        .padStart(node.scale + 1, "0");
      return `${sign}${digits.slice(0, -node.scale || undefined)}${node.scale > 0 ? `.${digits.slice(-node.scale)}` : ""}`;
    }
    case "constant":
      return `\\${node.name}`;
    case "symbol":
      return node.name;
    case "negate":
      return `-${expressionToLatex(node.operand)}`;
    case "sum":
      return node.operands.map(expressionToLatex).join(" + ");
    case "product":
      return node.operands.map(expressionToLatex).join(" \\cdot ");
    case "quotient":
      return `\\frac{${expressionToLatex(node.left)}}{${expressionToLatex(node.right)}}`;
    case "power":
      return `{${expressionToLatex(node.left)}}^{${expressionToLatex(node.right)}}`;
    case "root":
      return `\\sqrt[${expressionToLatex(node.degree)}]{${expressionToLatex(node.radicand)}}`;
    case "function":
      return `\\${node.name}(${node.args.map(expressionToLatex).join(",")})`;
    case "relation":
      return `${expressionToLatex(node.left)} ${{ eq: "=", lt: "<", lte: "\\le", gt: ">", gte: "\\ge" }[node.operator]} ${expressionToLatex(node.right)}`;
    case "tuple":
      return `(${node.items.map(expressionToLatex).join(",")})`;
    case "set":
      return `\\{${node.items.map(expressionToLatex).join(",")}\\}`;
    case "matrix":
      return `\\begin{bmatrix}${node.items.map(expressionToLatex).join(" & ")}\\end{bmatrix}`;
  }
}
