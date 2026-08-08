import {
  authenticatedErrors,
  episodeParameters,
  json,
  parameter,
  projectParameters,
  requestIdParameter,
  response,
  responseHeader,
  schema,
} from "../openapi-helpers.js";

export const artifactLineageOpenApiPaths = {
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/artifact-invalidation-preview":
    {
      post: {
        operationId: "previewArtifactInvalidation",
        description:
          "Previews production-unit invalidation and gate evidence updates for proposed upstream changes. Requires `content.read`.",
        parameters: [...episodeParameters],
        requestBody: {
          required: true,
          content: json("ArtifactInvalidationPreviewInput"),
        },
        responses: {
          "200": {
            description: "Invalidation preview",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("ArtifactInvalidationPreview"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units:regenerate":
    {
      post: {
        operationId: "regenerateProductionUnits",
        description:
          "Queues scoped regeneration for invalidated production units. Requires `content.write` and an idempotency key.",
        parameters: [
          ...episodeParameters,
          parameter("IdempotencyKey"),
        ],
        requestBody: {
          required: true,
          content: json("ProductionUnitRegenerationInput"),
        },
        responses: {
          "202": {
            description: "Regeneration accepted",
            headers: {
              Location: responseHeader("Location"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("ProductionUnitRegenerationAccepted"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "422": response("UnprocessableEntity"),
          "428": response("PreconditionRequired"),
        },
      },
    },
} as const;
