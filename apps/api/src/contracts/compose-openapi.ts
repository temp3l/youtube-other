import { artifactReviewPublicationOpenApiPaths } from "./modules/artifact-review-publication-paths.js";
import { contentOpenApiPaths } from "./modules/content-paths.js";
import { platformOpenApiPaths } from "./modules/platform-paths.js";
import { speechOpenApiPaths } from "./modules/speech-paths.js";
import { workflowOpenApiPaths } from "./modules/workflow-paths.js";
import { openApiComponents } from "./openapi-components.js";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Mediaforge API",
    version: "1.0.0",
    description: "Versioned API for asynchronous media production workflows.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  security: [{ BearerAuth: [] }],
  paths: {
    ...platformOpenApiPaths,
    ...contentOpenApiPaths,
    ...workflowOpenApiPaths,
    ...artifactReviewPublicationOpenApiPaths,
    ...speechOpenApiPaths,
  },
  ...openApiComponents,
} as const;
