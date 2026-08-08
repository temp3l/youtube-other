import { describe, expect, it } from "vitest";

import { openApiDocument } from "./compose-openapi.js";
import { OPENAPI_PATH_MODULES } from "./openapi-registry.js";

describe("OpenAPI contract registry", () => {
  it("composes modular path ownership without duplicate routes", () => {
    const merged = OPENAPI_PATH_MODULES.flatMap((module) =>
      Object.keys(module.paths)
    );
    expect(merged.sort()).toEqual(Object.keys(openApiDocument.paths).sort());
    expect(new Set(merged).size).toBe(merged.length);
  });
});
