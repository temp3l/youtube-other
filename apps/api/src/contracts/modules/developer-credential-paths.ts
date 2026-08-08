import {
  authenticatedErrors,
  json,
  parameter,
  requestIdParameter,
  response,
  responseHeader,
  workspaceParameters,
} from "../openapi-helpers.js";

const apiCredentialParameters = [
  ...workspaceParameters,
  parameter("ApiCredentialId"),
] as const;

export const developerCredentialOpenApiPaths = {
  "/v1/workspaces/{workspace}/api-credentials": {
    post: {
      operationId: "issueApiCredential",
      description:
        "Issues a named service credential and returns the secret exactly once. Requires `workspace.admin` and an idempotency key.",
      parameters: [...workspaceParameters, parameter("IdempotencyKey")],
      requestBody: {
        required: true,
        content: json("ApiCredentialIssueInput"),
      },
      responses: {
        "201": {
          description: "Credential issued",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ApiCredentialIssueResult"),
        },
        "200": {
          description: "Idempotent replay of a prior issue",
          headers: {
            ETag: responseHeader("ETag"),
            "Idempotency-Replayed": responseHeader("IdempotencyReplayed"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ApiCredentialIssueResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "409": response("Conflict"),
        "428": response("PreconditionRequired"),
      },
    },
    get: {
      operationId: "listApiCredentials",
      description:
        "Lists workspace API credentials without secrets. Requires `workspace.admin`.",
      parameters: workspaceParameters,
      responses: {
        "200": {
          description: "Credential page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ApiCredentialPage"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/api-credentials/{key}": {
    get: {
      operationId: "getApiCredential",
      description:
        "Returns one credential record without secrets. Requires `workspace.admin`.",
      parameters: apiCredentialParameters,
      responses: {
        "200": {
          description: "Credential record",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ApiCredentialRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/api-credentials/{key}:revoke": {
    post: {
      operationId: "revokeApiCredential",
      description:
        "Revokes a credential. Requires `workspace.admin` and a current strong ETag.",
      parameters: [...apiCredentialParameters, parameter("IfMatch")],
      requestBody: {
        required: true,
        content: json("ApiCredentialRevokeInput"),
      },
      responses: {
        "200": {
          description: "Credential revoked",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ApiCredentialRecord"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/developer-journey-examples": {
    get: {
      operationId: "getDeveloperJourneyExamples",
      description:
        "Returns canonical create → workflow → review → result examples derived from OpenAPI/SDK contracts.",
      parameters: workspaceParameters,
      responses: {
        "200": {
          description: "Developer journey examples",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("DeveloperJourneyExamples"),
        },
        ...authenticatedErrors,
      },
    },
  },
};
