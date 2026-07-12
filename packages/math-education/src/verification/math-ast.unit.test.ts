import { describe, expect, it } from "vitest";
import { normalizeExpression } from "./ast-normalizer.js";
import { canonicalHash } from "./canonical-json.js";
import { expressionToLatex } from "./latex-formatter.js";

describe("canonical math AST", () => {
  it("normalizes rational values and commutative expressions", () => {
    expect(
      normalizeExpression({
        kind: "rational",
        numerator: "-4",
        denominator: "6",
      })
    ).toEqual({ kind: "rational", numerator: "-2", denominator: "3" });
    const left = normalizeExpression({
      kind: "sum",
      operands: [
        { kind: "integer", value: "2" },
        { kind: "integer", value: "1" },
      ],
    });
    const right = normalizeExpression({
      kind: "sum",
      operands: [
        { kind: "integer", value: "1" },
        { kind: "integer", value: "2" },
      ],
    });
    expect(canonicalHash(left)).toBe(canonicalHash(right));
  });

  it("preserves noncommutative order and formats controlled LaTeX", () => {
    const a = {
      kind: "quotient" as const,
      left: { kind: "integer" as const, value: "1" },
      right: { kind: "integer" as const, value: "2" },
    };
    const b = { ...a, left: a.right, right: a.left };
    expect(canonicalHash(normalizeExpression(a))).not.toBe(
      canonicalHash(normalizeExpression(b))
    );
    expect(expressionToLatex(a)).toBe("\\frac{1}{2}");
  });
});
