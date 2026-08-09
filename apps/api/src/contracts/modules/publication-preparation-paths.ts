import {
  authenticatedErrors,
  episodeParameters,
  json,
  parameter,
  publicationParameters,
  requestIdParameter,
  response,
  responseHeader,
  workspaceParameters,
} from "../openapi-helpers.js";

export const publicationPreparationOpenApiPaths = {
  "/v1/workspaces/{workspace}/publishing-channels": {
    get: {
      operationId: "listPublishingChannels",
      description:
        "Lists tenant-owned publishing channels with safe connection state. Requires `publication.read`. OAuth tokens are never returned.",
      parameters: [...workspaceParameters, requestIdParameter],
      responses: {
        "200": {
          description: "Publishing channel page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("PublishingChannelPage"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/publishing-channels:connect": {
    post: {
      operationId: "beginChannelConnect",
      description:
        "Starts server-side OAuth for channel connection. Requires workspace admin and `channel.credentials.manage`. Returns authorization URL and session metadata only.",
      parameters: [...workspaceParameters, requestIdParameter],
      responses: {
        "200": {
          description: "OAuth session started",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ChannelConnectBeginResult"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/publishing-channels/{channel}": {
    get: {
      operationId: "getPublishingChannel",
      description:
        "Returns safe publishing channel state. Requires `publication.read`.",
      parameters: [
        ...workspaceParameters,
        parameter("PublishingChannelId"),
        requestIdParameter,
      ],
      responses: {
        "200": {
          description: "Publishing channel",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("PublishingChannelRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/publishing-channels/{channel}:disconnect": {
    post: {
      operationId: "disconnectPublishingChannel",
      description:
        "Disconnects a publishing channel. Requires workspace admin, `channel.credentials.manage`, and If-Match.",
      parameters: [
        ...workspaceParameters,
        parameter("PublishingChannelId"),
        parameter("IfMatch"),
        requestIdParameter,
      ],
      responses: {
        "200": {
          description: "Disconnected channel",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("PublishingChannelRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/publication-intents:preflight":
    {
      post: {
        operationId: "evaluatePublicationPreflight",
        description:
          "Evaluates publish-ready gate, metadata, caption, and schedule policy for a publication intent. Requires `publication.schedule`.",
        parameters: [...episodeParameters, requestIdParameter],
        requestBody: {
          required: true,
          content: json("PublicationPreflightInput"),
        },
        responses: {
          "200": {
            description: "Preflight result",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("PublicationPreflightResult"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/publication-intents:prepare":
    {
      post: {
        operationId: "preparePublicationIntent",
        description:
          "Persists metadata revision and immutable publication intent bindings. Requires `publication.schedule` and Idempotency-Key.",
        parameters: [
          ...episodeParameters,
          parameter("IdempotencyKey"),
          requestIdParameter,
        ],
        requestBody: {
          required: true,
          content: json("PublicationPrepareInput"),
        },
        responses: {
          "201": {
            description: "Publication intent prepared",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("PublicationPrepareResult"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "412": response("PreconditionFailed"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/publications/{publication}:cancel":
    {
      post: {
        operationId: "cancelPublicationIntent",
        description:
          "Cancels a pending publication intent. Requires `publication.schedule` and If-Match.",
        parameters: [
          ...publicationParameters,
          parameter("IfMatch"),
          requestIdParameter,
        ],
        responses: {
          "200": {
            description: "Cancelled publication",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("Publication"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
        },
      },
    },
  "/v1/workspaces/{workspace}/projects/{project}/publications/{publication}:updateSchedule":
    {
      post: {
        operationId: "updatePublicationSchedule",
        description:
          "Supersedes a pending publication with a new schedule by cancelling and recording a replacement intent. Requires `publication.schedule` and If-Match.",
        parameters: [
          ...publicationParameters,
          parameter("IfMatch"),
          requestIdParameter,
        ],
        requestBody: {
          required: true,
          content: json("PublicationScheduleUpdateInput"),
        },
        responses: {
          "200": {
            description: "Replacement publication",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("PublicationScheduleUpdateResult"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
        },
      },
    },
};
