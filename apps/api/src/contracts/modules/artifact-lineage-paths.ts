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
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/resolved-configuration": {
    get: { operationId: "getEpisodeResolvedConfiguration", description: "Resolves the persisted tenant, profile, and episode configuration. Returns 404 until tenant configuration is provisioned.", parameters: [...episodeParameters], responses: { "200": { description: "Resolved production configuration", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ResolvedProductionConfiguration") }, "404": response("NotFound"), ...authenticatedErrors } },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units": {
    get: {
      operationId: "listProductionUnitSnapshots",
      description: "Lists the current worker-persisted production-unit snapshots for an episode. Requires `content.read`.",
      parameters: [...episodeParameters],
      responses: { "200": { description: "Current production units", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ProductionUnitSnapshotPage") }, "404": response("NotFound"), ...authenticatedErrors },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units:compare": {
    get: {
      operationId: "compareProductionUnitSnapshots",
      description: "Returns current and prior immutable snapshots. Comparison availability is server-declared and false until a diff service is installed. Requires `content.read`.",
      parameters: [...episodeParameters],
      responses: { "200": { description: "Production-unit comparisons", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ProductionUnitComparisonPage") }, "404": response("NotFound"), ...authenticatedErrors },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/artifact-invalidation-preview":
    {
      post: {
        operationId: "previewArtifactInvalidation",
        description:
          "Previews invalidation from worker-persisted production-unit snapshots and proposed upstream changes. Requires `content.read`.",
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
