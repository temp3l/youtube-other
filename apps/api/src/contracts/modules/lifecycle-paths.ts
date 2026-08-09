import {
  authenticatedErrors,
  episodeParameters,
  json,
  parameter,
  projectParameters,
  requestIdParameter,
  response,
  responseHeader,
  workspaceParameters,
} from "../openapi-helpers.js";

const productionTemplateParameters = [
  ...workspaceParameters,
  parameter("ProductionTemplateId"),
] as const;

export const lifecycleOpenApiPaths = {
  "/v1/workspaces/{workspace}/production-templates": {
    get: {
      operationId: "listProductionTemplates",
      description:
        "Lists workspace production templates. Requires `content.read`.",
      parameters: workspaceParameters,
      responses: {
        "200": {
          description: "Production template page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ProductionTemplatePage"),
        },
        ...authenticatedErrors,
      },
    },
    post: {
      operationId: "createProductionTemplate",
      description:
        "Creates a versioned production template. Requires `content.write`.",
      parameters: workspaceParameters,
      requestBody: {
        required: true,
        content: json("ProductionTemplateCreateInput"),
      },
      responses: {
        "201": {
          description: "Production template created",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ProductionTemplateRecord"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "422": response("UnprocessableEntity"),
      },
    },
  },
  "/v1/workspaces/{workspace}/production-templates/{template}": {
    get: {
      operationId: "getProductionTemplate",
      description: "Requires `content.read`.",
      parameters: productionTemplateParameters,
      responses: {
        "200": {
          description: "Production template",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ProductionTemplateRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
    patch: {
      operationId: "updateProductionTemplate",
      description:
        "Creates a new template revision. Requires `content.write` and If-Match.",
      parameters: [...productionTemplateParameters, parameter("IfMatch")],
      requestBody: {
        required: true,
        content: json("ProductionTemplateUpdateInput"),
      },
      responses: {
        "200": {
          description: "Production template updated",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("ProductionTemplateRecord"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "422": response("UnprocessableEntity"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/reusable-assets": {
    get: {
      operationId: "listReusableAssets",
      description:
        "Lists policy-eligible reusable assets for the project. Requires `content.read`.",
      parameters: [
        ...projectParameters,
        parameter("PageSize"),
        parameter("PageAfter"),
        parameter("MimeTypeFilter"),
      ],
      responses: {
        "200": {
          description: "Reusable asset page",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ReusableAssetPage"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}:clone": {
    post: {
      operationId: "cloneEpisode",
      description:
        "Clones episode content into a new episode with blank runtime identity. Requires `content.write` and an idempotency key.",
      parameters: [
        ...episodeParameters,
        parameter("IdempotencyKey"),
      ],
      requestBody: {
        required: true,
        content: json("EpisodeCloneInput"),
      },
      responses: {
        "201": {
          description: "Episode cloned",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("EpisodeCloneResult"),
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
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/asset-references": {
    post: {
      operationId: "attachEpisodeAssetReference",
      description:
        "Attaches an immutable asset reference to an episode. Requires `content.write`.",
      parameters: episodeParameters,
      requestBody: {
        required: true,
        content: json("EpisodeAssetReferenceAttachInput"),
      },
      responses: {
        "201": {
          description: "Asset reference attached",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("EpisodeAssetReferenceAttachResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "403": response("Forbidden"),
        "404": response("NotFound"),
        "422": response("UnprocessableEntity"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-template:apply": {
    post: {
      operationId: "applyProductionTemplate",
      description:
        "Pins a production template snapshot to an episode. Requires `content.write`.",
      parameters: episodeParameters,
      requestBody: {
        required: true,
        content: json("ProductionTemplateApplyInput"),
      },
      responses: {
        "200": {
          description: "Production template applied",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ProductionTemplateApplyResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "422": response("UnprocessableEntity"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-template-binding": {
    get: {
      operationId: "getEpisodeProductionTemplateBinding",
      description:
        "Returns the pinned production template binding for an episode. Requires `content.read`.",
      parameters: episodeParameters,
      responses: {
        "200": {
          description: "Pinned production template binding",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("ProductionTemplateApplyResult"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },

  "/v1/workspaces/{workspace}/retention-policy": {
    get: {
      operationId: "getRetentionPolicy",
      description:
        "Returns the effective workspace retention policy or an unresolved status. Requires `workspace.admin`.",
      parameters: workspaceParameters,
      responses: {
        "200": {
          description: "Retention policy",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("RetentionPolicyRecord"),
        },
        ...authenticatedErrors,
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/content-lifecycle": {
    get: {
      operationId: "getEpisodeContentLifecycle",
      description: "Requires `content.read`.",
      parameters: episodeParameters,
      responses: {
        "200": {
          description: "Episode content lifecycle",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("EpisodeContentLifecycleRecord"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}:archive": {
    post: {
      operationId: "archiveEpisode",
      description: "Archives an episode without deleting lineage. Requires `content.write` and If-Match on lifecycle revision.",
      parameters: [...episodeParameters, parameter("IfMatch")],
      requestBody: { required: true, content: json("EpisodeArchiveInput") },
      responses: {
        "200": {
          description: "Episode archived",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("LifecycleTransitionResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}:restore": {
    post: {
      operationId: "restoreEpisode",
      description: "Restores an archived episode without starting workflow. Requires `content.write` and If-Match.",
      parameters: [...episodeParameters, parameter("IfMatch")],
      requestBody: { required: true, content: json("EpisodeRestoreInput") },
      responses: {
        "200": {
          description: "Episode restored",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("LifecycleTransitionResult"),
        },
        "400": response("BadRequest"),
        ...authenticatedErrors,
        "404": response("NotFound"),
        "412": response("PreconditionFailed"),
        "428": response("PreconditionRequired"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/deletion:evaluate": {
    post: {
      operationId: "evaluateEpisodeDeletion",
      description: "Evaluates tombstone deletion blockers and impacts. Requires `workspace.admin`.",
      parameters: episodeParameters,
      responses: {
        "200": {
          description: "Deletion evaluation",
          headers: { "x-request-id": responseHeader("RequestId") },
          content: json("EpisodeDeletionEvaluation"),
        },
        ...authenticatedErrors,
        "404": response("NotFound"),
      },
    },
  },
  "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}:delete": {
    post: {
      operationId: "deleteEpisode",
      description:
        "Tombstones an episode after evaluation. Requires `workspace.admin`, idempotency key, and evaluation token.",
      parameters: [...episodeParameters, parameter("IdempotencyKey")],
      requestBody: { required: true, content: json("EpisodeDeletionInput") },
      responses: {
        "200": {
          description: "Episode tombstoned",
          headers: {
            ETag: responseHeader("ETag"),
            "x-request-id": responseHeader("RequestId"),
          },
          content: json("EpisodeDeletionResult"),
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
} as const;
