import {
  authenticatedErrors,
  json,
  parameter,
  requestIdParameter,
  response,
  responseHeader,
  workspaceParameters,
} from "../openapi-helpers.js";

const webhookEndpointParameters = [
  ...workspaceParameters,
  parameter("WebhookEndpointId"),
] as const;

const webhookDeliveryParameters = [
  ...workspaceParameters,
  parameter("WebhookDeliveryId"),
] as const;

export const webhookOpenApiPaths = {
  "/v1/workspaces/{workspace}/webhook-endpoints": {
    post: {
      operationId: "createWebhookEndpoint",
      description:
        "Registers an HTTPS webhook endpoint and returns the signing secret exactly once. Requires `webhook.manage`.",
      parameters: workspaceParameters,
      requestBody: {
        required: true,
        content: json("WebhookEndpointCreateInput"),
      },
      responses: {
        "201": {
          description: "Webhook endpoint created",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("WebhookEndpointCreateResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
      },
    },
    get: {
      operationId: "listWebhookEndpoints",
      description: "Lists webhook endpoints without secrets. Requires `webhook.manage`.",
      parameters: workspaceParameters,
      responses: {
        "200": {
          description: "Webhook endpoint page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("WebhookEndpointPage"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-endpoints/{endpoint}": {
    get: {
      operationId: "getWebhookEndpoint",
      parameters: webhookEndpointParameters,
      responses: {
        "200": {
          description: "Webhook endpoint",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("WebhookEndpointRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
    patch: {
      operationId: "updateWebhookEndpoint",
      description: "Updates URL, filters, or enabled state. Requires `webhook.manage` and If-Match.",
      parameters: [...webhookEndpointParameters, parameter("IfMatch")],
      requestBody: {
        required: true,
        content: json("WebhookEndpointUpdateInput"),
      },
      responses: {
        "200": {
          description: "Webhook endpoint updated",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("WebhookEndpointRecord"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-endpoints/{endpoint}:rotate-secret": {
    post: {
      operationId: "rotateWebhookEndpointSecret",
      description:
        "Rotates the signing secret and returns the new value exactly once. Requires `webhook.manage` and If-Match.",
      parameters: [...webhookEndpointParameters, parameter("IfMatch")],
      requestBody: {
        required: false,
        content: json("WebhookSecretRotateInput"),
      },
      responses: {
        "200": {
          description: "Secret rotated",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("WebhookSecretRotateResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-endpoints/{endpoint}:test": {
    post: {
      operationId: "testWebhookEndpoint",
      description: "Sends a signed test event to the endpoint. Requires `webhook.manage`.",
      parameters: webhookEndpointParameters,
      responses: {
        "200": {
          description: "Test delivery result",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("WebhookTestResult"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-deliveries": {
    get: {
      operationId: "listWebhookDeliveries",
      description: "Lists delivery history with redacted event summaries. Requires `webhook.manage`.",
      parameters: [
        ...workspaceParameters,
        parameter("PageSize"),
        parameter("PageAfter"),
        parameter("FilterEndpointId"),
      ],
      responses: {
        "200": {
          description: "Webhook delivery page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("WebhookDeliveryPage"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-deliveries/{delivery}/attempts": {
    get: {
      operationId: "listWebhookDeliveryAttempts",
      parameters: webhookDeliveryParameters,
      responses: {
        "200": {
          description: "Delivery attempt page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("WebhookDeliveryAttemptPage"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/webhook-deliveries/{delivery}:resend": {
    post: {
      operationId: "resendWebhookDelivery",
      description:
        "Creates a new delivery attempt for the same event identity. Requires `webhook.manage` and If-Match.",
      parameters: [...webhookDeliveryParameters, parameter("IfMatch")],
      responses: {
        "201": {
          description: "Resent delivery",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("WebhookDeliveryRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
};
