import {
  authenticatedErrors,
  approvalParameters,
  json,
  parameter,
  projectParameters,
  requestIdParameter,
  response,
  responseHeader,
} from "../openapi-helpers.js";

export const reviewOpenApiPaths = {
  "/v1/workspaces/{workspace}/projects/{project}/review-queue": {
    get: {
      operationId: "listReviewQueue",
      description:
        "Lists actionable approval challenges for reviewers. Requires `approval.decide`.",
      parameters: [...projectParameters, requestIdParameter],
      responses: {
        "200": {
          description: "Review queue page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ReviewQueuePage"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/approval-challenges": {
    post: {
      operationId: "submitApprovalChallenge",
      description:
        "Submits a hash-bound approval challenge for review. Requires `content.write`.",
      parameters: [
        ...projectParameters,
        parameter("IdempotencyKey"),
        requestIdParameter,
      ],
      requestBody: {
        required: true,
        content: json("ApprovalChallengeSubmitInput"),
      },
      responses: {
        "201": {
          description: "Approval challenge created",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ApprovalChallenge"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "412": response("PreconditionFailed"),
        "422": response("UnprocessableEntity"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/approval-challenges/{challenge}:claim":
    {
      post: {
        operationId: "claimApprovalChallenge",
        description:
          "Optionally claims an actionable challenge for a reviewer. Requires `approval.decide`.",
        parameters: [
          ...projectParameters,
          parameter("ApprovalChallengeId"),
          requestIdParameter,
        ],
        responses: {
          "200": {
            description: "Claimed review queue item",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("ReviewQueueItem"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/approval-history": {
    get: {
      operationId: "listApprovalHistory",
      description:
        "Lists immutable approval history with current validity projection. Requires `approval.decide`.",
      parameters: [
        ...projectParameters,
        parameter("FilterSubjectId"),
        requestIdParameter,
      ],
      responses: {
        "200": {
          description: "Approval history page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ApprovalHistoryPage"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/approvals/{approval}/validity":
    {
      get: {
        operationId: "getApprovalValidity",
        description:
          "Returns the current validity projection for one approval record. Requires `approval.decide`.",
        parameters: [...approvalParameters, requestIdParameter],
        responses: {
          "200": {
            description: "Approval validity projection",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("ReviewValidity"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
};
