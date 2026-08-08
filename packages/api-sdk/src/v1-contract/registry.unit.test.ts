import { describe, expect, it } from "vitest";

import { SDK_V1_OPERATION_MODULES, SDK_V1_OPERATIONS } from "./registry.js";

describe("SDK v1 contract registry", () => {
  it("registers every operation exactly once across modules", () => {
    const fromModules = SDK_V1_OPERATION_MODULES.flatMap((module) =>
      Object.keys(module.operations)
    );
    expect(fromModules.sort()).toEqual(Object.keys(SDK_V1_OPERATIONS).sort());
    expect(new Set(fromModules).size).toBe(fromModules.length);
  });
});
