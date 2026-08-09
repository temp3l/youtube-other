import {
  authenticatedErrors,
  episodeParameters,
  json,
  parameter,
  requestIdParameter,
  response,
  responseHeader,
} from "../openapi-helpers.js";

export const localizationOpenApiPaths = {
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives":
    {
      get: {
        operationId: "listLocalizationDerivatives",
        description:
          "Lists locale derivatives linked to a root episode. Requires `content.read`.",
        parameters: episodeParameters,
        responses: {
          "200": {
            description: "Localization derivative page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("LocalizationDerivativePage"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
      post: {
        operationId: "createLocalizationDerivative",
        description:
          "Creates a locale derivative with immutable source linkage. Requires `content.write`.",
        parameters: [
          ...episodeParameters,
          parameter("IdempotencyKey"),
        ],
        requestBody: {
          required: true,
          content: json("LocalizationDerivativeCreateInput"),
        },
        responses: {
          "201": {
            description: "Localization derivative created",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("LocalizationDerivativeRecord"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "412": response("PreconditionFailed"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives:preflight":
    {
      post: {
        operationId: "evaluateLocalizationPreflight",
        description:
          "Evaluates locale/variant admission for a derivative. Requires `content.read`.",
        parameters: episodeParameters,
        requestBody: {
          required: true,
          content: json("LocalizationPreflightInput"),
        },
        responses: {
          "200": {
            description: "Localization preflight result",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("LocalizationPreflightResult"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives/{derivative}:compare":
    {
      get: {
        operationId: "compareLocalizationDerivative",
        description:
          "Compares a derivative against its current source revision. Requires `content.read`.",
        parameters: [
          ...episodeParameters,
          parameter("LocalizationDerivativeId"),
        ],
        responses: {
          "200": {
            description: "Localization comparison",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("LocalizationComparison"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives/{derivative}:retry":
    {
      post: {
        operationId: "retryLocalizationDerivative",
        description:
          "Retries a failed or blocked derivative workflow. Requires `content.write`.",
        parameters: [
          ...episodeParameters,
          parameter("LocalizationDerivativeId"),
        ],
        responses: {
          "200": {
            description: "Localization derivative retry accepted",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("LocalizationDerivativeRecord"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
          "412": response("PreconditionFailed"),
        },
      },
    },
};
