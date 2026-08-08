import { authenticatedErrors, json, parameter, requestIdParameter, response, responseHeader, workspaceParameters } from "../openapi-helpers.js";
export const platformOpenApiPaths = {
    "/health/live": {
      get: {
        operationId: "getLiveness",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": {
            description: "Process is live",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("HealthStatus"),
          },
        },
      },
    },
    "/health/ready": {
      get: {
        operationId: "getReadiness",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": {
            description: "Dependencies are ready",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("HealthStatus"),
          },
          "503": {
            description: "Dependencies are unavailable",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("HealthStatus"),
          },
        },
      },
    },
    "/v1/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        security: [],
        parameters: [requestIdParameter],
        responses: {
          "200": {
            description: "OpenAPI 3.1 contract",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("OpenApiDocument"),
          },
        },
      },
    },
    "/v1/workspaces/{workspace}/quota": {
      get: {
        operationId: "getQuota",
        description:
          "Requires the `usage.read` workspace permission. Returns 404 when no quota policy is configured.",
        parameters: workspaceParameters,
        responses: {
          "200": {
            description: "Configured workspace quota status",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("WorkspaceQuotaStatus"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/usage-records": {
      get: {
        operationId: "listUsageRecords",
        description:
          "Requires the `usage.read` workspace permission. Supports optional filters for subject, operation, unit, attempt, and occurred time range.",
        parameters: [
          ...workspaceParameters,
          parameter("PageSize"),
          parameter("PageAfter"),
          parameter("FilterSubjectId"),
          parameter("FilterOperation"),
          parameter("FilterUnit"),
          parameter("FilterAttemptId"),
          parameter("FilterOccurredAfter"),
          parameter("FilterOccurredBefore"),
        ],
        responses: {
          "200": {
            description: "Usage ledger page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("UsageRecordPage"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/provider-health": {
      get: {
        operationId: "listProviderHealth",
        description:
          "Lists advisory provider health for configured integrations. Requires `usage.read`.",
        parameters: workspaceParameters,
        responses: {
          "200": {
            description: "Provider health page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("ProviderHealthPage"),
          },
          ...authenticatedErrors,
        },
      },
    },
    "/v1/workspaces/{workspace}/audit-events": {
      get: {
        operationId: "listAuditEvents",
        description: "Requires the `audit.read` workspace permission.",
        parameters: [
          ...workspaceParameters,
          parameter("PageSize"),
          parameter("PageAfter"),
        ],
        responses: {
          "200": {
            description: "Immutable audit event page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("AuditEventPage"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
};
