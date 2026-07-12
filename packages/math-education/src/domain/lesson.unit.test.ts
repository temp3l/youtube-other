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
});
