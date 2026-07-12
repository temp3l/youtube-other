import { expect, it } from "vitest";
import { RendererError, toRendererErrorData } from "../../src/errors.js";

it("converts unknown failures to stable JSON error data", () => {
  expect(toRendererErrorData(new RendererError({ code: "MISSING_TOOL", message: "missing" }))).toEqual({ code: "MISSING_TOOL", message: "missing" });
  expect(toRendererErrorData({ arbitrary: true })).toEqual({ code: "INTERNAL_ERROR", message: "An unknown renderer failure occurred." });
});
