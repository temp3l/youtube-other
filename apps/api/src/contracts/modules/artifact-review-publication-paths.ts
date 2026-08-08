import { authenticatedErrors, approvalParameters, assetParameters, json, parameter, projectParameters, publicationParameters, requestIdParameter, response, responseHeader, workspaceParameters } from "../openapi-helpers.js";
export const artifactReviewPublicationOpenApiPaths = {
    "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}": {
      get: {
        operationId: "getAsset",
        description: "Requires the `content.read` workspace permission.",
        parameters: assetParameters,
        responses: {
          "200": {
            description: "Asset descriptor",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("Asset"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/assets": {
      get: {
        operationId: "listAssets", description: "Lists project asset metadata with a signed cursor. Requires `content.read`.",
        parameters: [...projectParameters, parameter("PageSize"), parameter("PageAfter")],
        responses: { "200": { description: "Asset page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("AssetPage") }, "400": response("BadRequest"), ...authenticatedErrors },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/approval-challenges/{challenge}": {
      get: {
        operationId: "getApprovalChallenge", description: "Returns the exact revision and hash-bound approval challenge. Requires `approval.decide`.",
        parameters: [...projectParameters, parameter("ApprovalChallengeId")],
        responses: { "200": { description: "Approval challenge", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ApprovalChallenge") }, ...authenticatedErrors, "404": response("NotFound") },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/validations": {
      get: {
        operationId: "listValidations",
        description: "Requires the `validation.read` workspace permission.",
        parameters: [
          ...projectParameters,
          parameter("PageSize"),
          parameter("PageAfter"),
        ],
        responses: {
          "200": {
            description: "Validation page",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("ValidationPage"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/publications/{publication}":
      {
        get: {
          operationId: "getPublication",
          description:
            "Returns the durable publication status and immutable public bindings. Requires the `publication.read` workspace permission; execution-only authorization material, fences, recovery identity, receipts, and internal evidence are never returned.",
          parameters: publicationParameters,
          responses: {
            "200": {
              description: "Publication intent state",
              headers: {
                ETag: responseHeader("ETag"),
                "x-request-id": responseHeader("RequestId"),
              },
              content: json("Publication"),
            },
            ...authenticatedErrors,
            "404": response("NotFound"),
          },
        },
      },
    "/v1/workspaces/{workspace}/projects/{project}/approvals": {
      post: {
        operationId: "recordApproval",
        description: "Requires the `approval.decide` workspace permission.",
        parameters: [
          ...projectParameters,
          parameter("IfMatch"),
          parameter("IdempotencyKey"),
        ],
        requestBody: { required: true, content: json("ApprovalInput") },
        responses: {
          "202": {
            description: "Approval accepted",
            headers: {
              Location: responseHeader("Location"),
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("ApprovalAccepted"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "412": response("PreconditionFailed"),
          "422": response("UnprocessableEntity"),
          "428": response("PreconditionRequired"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/approvals/{approval}:revoke":
      {
        post: {
          operationId: "revokeApproval",
          description:
            "Revokes an active approval without changing its original decision or evidence. Requires the `approval.decide` workspace permission, a current strong ETag, and an idempotency key.",
          parameters: [
            ...approvalParameters,
            parameter("IfMatch"),
            parameter("IdempotencyKey"),
          ],
          requestBody: {
            required: true,
            content: json("ApprovalRevocationInput"),
          },
          responses: {
            "200": {
              description: "Approval revoked",
              headers: {
                ETag: responseHeader("ETag"),
                "Idempotency-Replayed": responseHeader("IdempotencyReplayed"),
                "x-request-id": responseHeader("RequestId"),
              },
              content: json("ApprovalRevoked"),
            },
            "400": response("BadRequest"),
            ...authenticatedErrors,
            "404": response("NotFound"),
            "409": response("Conflict"),
            "412": response("PreconditionFailed"),
            "428": response("PreconditionRequired"),
          },
        },
      },
};
