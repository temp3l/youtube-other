import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadMathRuntimeConfig,
  mathRuntimeConfigSchema,
} from "./math-config.js";

describe("math runtime config", () => {
  it("uses an isolated default workspace without changing episode config", () => {
    expect(loadMathRuntimeConfig({}, "/repo")).toEqual({
      workspaceDir: path.resolve("/repo/math-episodes"),
      brandConfigPath: path.resolve("/repo/config/math-brand.json"),
      enabled: true,
      renderingEnabled: true,
      publishingEnabled: false,
    });
  });

  it("rejects unknown fields and malformed flags", () => {
    expect(() =>
      mathRuntimeConfigSchema.parse({ workspaceDir: "x", extra: true })
    ).toThrow();
    expect(() =>
      loadMathRuntimeConfig({ MEDIAFORGE_MATH_ENABLED: "maybe" }, "/repo")
    ).toThrow(/MEDIAFORGE_MATH_ENABLED/u);
  });
});
