import { describe, expect, it } from "vitest";
import { verificationCheckSchema } from "./lesson.js";

const integer = (value: string) => ({ kind: "integer" as const, value });
const scalar = (value: string) => ({
  kind: "scalar" as const,
  expression: integer(value),
});

describe("verificationCheckSchema domain evidence", () => {
  it.each([
    "unit-dimension",
    "graph-point",
    "geometry",
    "probability",
  ] as const)("requires evidence for %s checks", (kind) => {
    expect(
      verificationCheckSchema.safeParse({
        checkId: "check-domain",
        kind,
        expression: integer("1"),
        expected: scalar("1"),
        critical: true,
      }).success
    ).toBe(false);
  });

  it("accepts a complete graph point contract", () => {
    expect(
      verificationCheckSchema.safeParse({
        checkId: "check-graph",
        kind: "graph-point",
        expression: integer("3"),
        expected: scalar("3"),
        graph: {
          mode: "point",
          function: { kind: "symbol", name: "x" },
          variable: "x",
          point: { x: integer("3"), y: integer("3") },
          domain: {
            kind: "interval",
            minimum: integer("0"),
            maximum: integer("10"),
            minimumInclusive: true,
            maximumInclusive: true,
          },
        },
        critical: true,
      }).success
    ).toBe(true);
  });

  it("accepts v3 solve, geometry, and probability domain evidence", () => {
    const x = { kind: "symbol" as const, name: "x" };
    const y = { kind: "symbol" as const, name: "y" };
    expect(
      verificationCheckSchema.safeParse({
        checkId: "check-system",
        kind: "solve",
        solutionDomain: "real",
        expression: {
          kind: "tuple",
          items: [
            {
              kind: "relation",
              operator: "eq",
              left: { kind: "sum", operands: [x, y] },
              right: integer("7"),
            },
          ],
        },
        expected: {
          kind: "finite-set",
          values: [],
        },
        critical: true,
      }).success
    ).toBe(true);
    expect(
      verificationCheckSchema.safeParse({
        checkId: "check-volume",
        kind: "geometry",
        expression: integer("24"),
        expected: scalar("24"),
        geometry: {
          entity: "cuboid",
          formula: "cuboid-volume",
          parameters: {
            length: integer("2"),
            width: integer("3"),
            height: integer("4"),
          },
          assumptions: ["length-positive", "width-positive", "height-positive"],
        },
        critical: true,
      }).success
    ).toBe(true);
    expect(
      verificationCheckSchema.safeParse({
        checkId: "check-four-field",
        kind: "probability",
        expression: integer("20"),
        expected: scalar("20"),
        probability: {
          rule: "four-field-total",
          inputs: [integer("4"), integer("6"), integer("3"), integer("7")],
        },
        critical: true,
      }).success
    ).toBe(true);
  });
});
