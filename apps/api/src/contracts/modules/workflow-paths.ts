import { authenticatedErrors, episodeParameters, jobParameters, json, parameter, projectParameters, requestIdParameter, response, responseHeader, workflowParameters, workspaceParameters } from "../openapi-helpers.js";
export const workflowOpenApiPaths = {
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-state": {
      get: {
        operationId: "getEpisodeProductionState",
        description:
          "Returns the canonical episode production projection, including durable gates and permitted actions. Requires `content.read`.",
        parameters: episodeParameters,
        responses: {
          "200": {
            description: "Canonical episode production state",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("EpisodeProductionState"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/workflow-portfolio": {
      get: {
        operationId: "listWorkflowPortfolio",
        description:
          "Lists tenant-scoped workflow portfolio entries with safe recovery metadata. Requires `content.read`.",
        parameters: [
          ...workspaceParameters,
          parameter("PageCursor"),
          parameter("PageSize"),
          parameter("FilterProjectId"),
          parameter("FilterProfileId"),
          parameter("FilterLocale"),
          parameter("FilterRunStatus"),
          parameter("FilterJobStatus"),
        ],
        responses: {
          "200": {
            description: "Workflow portfolio page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("WorkflowPortfolioPage"),
          },
          ...authenticatedErrors,
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs":
      {
        post: {
          operationId: "admitWorkflow",
          description: "Requires the `workflow.start` workspace permission.",
          parameters: [...episodeParameters, parameter("IdempotencyKey")],
          requestBody: { required: true, content: json("WorkflowAdmission") },
          responses: {
            "202": {
              description: "Workflow accepted",
              headers: {
                Location: responseHeader("Location"),
                "Retry-After": responseHeader("RetryAfter"),
                ETag: responseHeader("ETag"),
                "x-request-id": responseHeader("RequestId"),
              },
              content: json("WorkflowCommandAccepted"),
            },
            "400": response("BadRequest"),
            ...authenticatedErrors,
            "404": response("NotFound"),
            "409": response("Conflict"),
            "422": response("UnprocessableEntity"),
            "428": response("PreconditionRequired"),
            "429": response("TooManyRequests"),
            "503": response("Unavailable"),
          },
        },
      },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}": {
      get: {
        operationId: "getWorkflow",
        description: "Requires the `content.read` workspace permission.",
        parameters: workflowParameters,
        responses: {
          "200": {
            description: "Workflow status",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("WorkflowRun"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}/steps": {
      get: {
        operationId: "listWorkflowSteps",
        description: "Requires the `content.read` workspace permission.",
        parameters: workflowParameters,
        responses: {
          "200": {
            description: "Workflow step summaries",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("WorkflowStepPage"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:cancel":
      {
        post: {
          operationId: "cancelWorkflow",
          description: "Requires the `workflow.cancel` workspace permission.",
          parameters: [...workflowParameters, parameter("IfMatch")],
          responses: {
            "202": {
              description: "Cancellation accepted",
              headers: {
                Location: responseHeader("Location"),
                "Retry-After": responseHeader("RetryAfter"),
                ETag: responseHeader("ETag"),
                "x-request-id": responseHeader("RequestId"),
              },
              content: json("WorkflowCommandAccepted"),
            },
            ...authenticatedErrors,
            "404": response("NotFound"),
            "409": response("Conflict"),
            "412": response("PreconditionFailed"),
            "428": response("PreconditionRequired"),
          },
        },
      },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}:resume":
      {
        post: {
          operationId: "resumeWorkflow",
          description: "Requires the `workflow.start` workspace permission.",
          parameters: [
            ...workflowParameters,
            parameter("IfMatch"),
            parameter("IdempotencyKey"),
          ],
          responses: {
            "202": {
              description: "Resume accepted",
              headers: {
                Location: responseHeader("Location"),
                "Retry-After": responseHeader("RetryAfter"),
                ETag: responseHeader("ETag"),
                "x-request-id": responseHeader("RequestId"),
              },
              content: json("WorkflowCommandAccepted"),
            },
            ...authenticatedErrors,
            "404": response("NotFound"),
            "409": response("Conflict"),
            "412": response("PreconditionFailed"),
            "428": response("PreconditionRequired"),
            "429": response("TooManyRequests"),
            "503": response("Unavailable"),
          },
        },
      },
    "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}": {
      get: {
        operationId: "getJob",
        description: "Requires the `content.read` workspace permission.",
        parameters: jobParameters,
        responses: {
          "200": {
            description: "Job status",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("Job"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
};
