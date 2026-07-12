import { describe, expect, it } from "vitest";
import {
  createLessonId,
  exactValueSchema,
  expressionNodeSchema,
  seedSkillSchema,
} from "./index.js";

describe("math domain schemas", () => {
  it("creates stable lesson ids", () => {
    expect(createLessonId("M5-ZO-001", "standard")).toBe("m5-zo-001-standard");
  });

  it("keeps integers, rationals and decimals exact", () => {
    expect(
      expressionNodeSchema.parse({
        kind: "integer",
        value: "900719925474099312345",
      })
    ).toBeTruthy();
    expect(
      expressionNodeSchema.parse({
        kind: "rational",
        numerator: "-2",
        denominator: "3",
      })
    ).toBeTruthy();
    expect(
      expressionNodeSchema.parse({ kind: "decimal", unscaled: "125", scale: 2 })
    ).toBeTruthy();
    expect(() =>
      expressionNodeSchema.parse({
        kind: "rational",
        numerator: "1",
        denominator: "0",
      })
    ).toThrow();
    expect(() =>
      expressionNodeSchema.parse({ kind: "decimal", unscaled: 1.25, scale: 2 })
    ).toThrow();
  });

  it("requires explicit tolerances for approximations", () => {
    expect(
      exactValueSchema.parse({
        kind: "approximation",
        exact: { kind: "constant", name: "pi" },
        displayed: "3.14",
        tolerance: { kind: "rational", numerator: "1", denominator: "100" },
      })
    ).toBeTruthy();
  });

  it("rejects unknown curriculum fields", () => {
    expect(() =>
      seedSkillSchema.parse({ id: "M5-ZO-001", grade: 5, extra: true })
    ).toThrow();
  });
});
