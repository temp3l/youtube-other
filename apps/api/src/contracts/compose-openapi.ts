import { openApiComponents } from "./openapi-components.js";
import { OPENAPI_PATH_MODULES } from "./openapi-registry.js";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Mediaforge API",
    version: "1.0.0",
    description: "Versioned API for asynchronous media production workflows.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  security: [{ BearerAuth: [] }],
  paths: Object.assign({}, ...OPENAPI_PATH_MODULES.map((module) => module.paths)),
  ...openApiComponents,
} as const;
