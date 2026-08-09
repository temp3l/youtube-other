import { authenticatedErrors, episodeParameters, json, parameter, projectParameters, requestIdParameter, response, responseHeader, workspaceParameters } from "../openapi-helpers.js";
export const contentOpenApiPaths = {
    "/v1/workspaces/{workspace}/projects": {
      get: {
        operationId: "listProjects", description: "Lists workspace projects with a signed cursor. Requires `content.read`.",
        parameters: [...workspaceParameters, parameter("PageSize"), parameter("PageAfter")],
        responses: { "200": { description: "Project page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("ProjectPage") }, "400": response("BadRequest"), ...authenticatedErrors },
      },
      post: {
        operationId: "createProject",
        description: "Requires the `content.write` workspace permission.",
        parameters: workspaceParameters,
        requestBody: { required: true, content: json("ProjectInput") },
        responses: {
          "201": {
            description: "Project created",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("Project"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "409": response("Conflict"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes": {
      get: {
        operationId: "listEpisodes", description: "Lists project episodes with a signed cursor. Requires `content.read`.",
        parameters: [...projectParameters, parameter("PageSize"), parameter("PageAfter"), parameter("EpisodeVisibilityFilter")],
        responses: { "200": { description: "Episode page", headers: { "x-request-id": responseHeader("RequestId") }, content: json("EpisodePage") }, "400": response("BadRequest"), ...authenticatedErrors },
      },
      post: {
        operationId: "createEpisode",
        description: "Requires the `content.write` workspace permission.",
        parameters: projectParameters,
        requestBody: { required: true, content: json("EpisodeInput") },
        responses: {
          "201": {
            description: "Episode created",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("EpisodeCreated"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "404": response("NotFound"),
          "409": response("Conflict"),
          "422": response("UnprocessableEntity"),
        },
      },
    },
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}": {
      get: {
        operationId: "getEpisode",
        description: "Requires the `content.read` workspace permission.",
        parameters: episodeParameters,
        responses: {
          "200": {
            description: "Episode",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("Episode"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
      patch: {
        operationId: "replaceEpisodeContent",
        description:
          "Replaces the complete typed episode content. Requires the `content.write` workspace permission and a current strong ETag.",
        parameters: [...episodeParameters, parameter("IfMatch")],
        requestBody: { required: true, content: json("EpisodeInput") },
        responses: {
          "200": {
            description: "Updated episode",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("Episode"),
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
};
