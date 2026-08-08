import { authenticatedErrors, json, parameter, requestIdParameter, response, responseHeader, workspaceParameters } from "../openapi-helpers.js";
export const speechOpenApiPaths = {
    "/v1/workspaces/{workspace}/speech/estimates": {
      post: {
        operationId: "estimateSpeech",
        description:
          "Resolves the effective voice profile and estimates provider usage. Requires the `content.read` workspace permission.",
        parameters: workspaceParameters,
        requestBody: { required: true, content: json("SpeechEstimateInput") },
        responses: {
          "200": {
            description:
              "Safe estimate; provider authentication material and narration are excluded.",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("SpeechEstimate"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "503": response("Unavailable"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/generations": {
      post: {
        operationId: "createSpeechGeneration",
        description:
          "Creates or reuses a speech generation through the shared application service. Requires `content.write` and an idempotency key.",
        parameters: [...workspaceParameters, parameter("IdempotencyKey")],
        requestBody: { required: true, content: json("SpeechGenerationInput") },
        responses: {
          "202": {
            description: "Generation accepted",
            headers: {
              Location: responseHeader("Location"),
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechGeneration"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
          "428": response("PreconditionRequired"),
          "503": response("Unavailable"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/generations/{generation}": {
      get: {
        operationId: "getSpeechGeneration",
        description:
          "Returns safe generation state. Requires the `content.read` workspace permission.",
        parameters: [...workspaceParameters, parameter("SpeechGenerationId")],
        responses: {
          "200": {
            description: "Generation status",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechGeneration"),
          },
          ...authenticatedErrors,
          "404": response("NotFound"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/generations/{generation}:retry": {
      post: {
        operationId: "retrySpeechGeneration",
        description:
          "Retries only an explicitly retryable generation. Requires the `content.write` workspace permission.",
        parameters: [...workspaceParameters, parameter("SpeechGenerationId")],
        responses: {
          "202": {
            description: "Retry accepted",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechGeneration"),
          },
          ...authenticatedErrors,
          "409": response("Conflict"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/generations/{generation}:cancel": {
      post: {
        operationId: "cancelSpeechGeneration",
        description:
          "Requests cancellation through the shared application service. Requires the `content.write` workspace permission.",
        parameters: [...workspaceParameters, parameter("SpeechGenerationId")],
        responses: {
          "202": {
            description: "Cancellation accepted",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechGeneration"),
          },
          ...authenticatedErrors,
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/profiles": {
      get: {
        operationId: "listSpeechProfiles",
        description:
          "Lists safe, redacted voice profile metadata. Requires the `content.read` workspace permission.",
        parameters: workspaceParameters,
        responses: {
          "200": {
            description: "Profiles",
            headers: { "x-request-id": responseHeader("RequestId") },
            content: json("SpeechProfilePage"),
          },
          ...authenticatedErrors,
        },
      },
      post: {
        operationId: "createSpeechProfile",
        description:
          "Creates a logical voice profile; provider authentication material is never accepted. Requires the `content.write` workspace permission.",
        parameters: workspaceParameters,
        requestBody: { required: true, content: json("SpeechProfileInput") },
        responses: {
          "201": {
            description: "Profile created",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechProfile"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/profiles/{profile}/versions": {
      post: {
        operationId: "createSpeechProfileVersion",
        description:
          "Creates an immutable draft version. Requires the `content.write` workspace permission.",
        parameters: [...workspaceParameters, parameter("SpeechProfileId")],
        requestBody: {
          required: true,
          content: json("SpeechProfileVersionInput"),
        },
        responses: {
          "201": {
            description: "Draft version created",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechProfileVersion"),
          },
          "400": response("BadRequest"),
          ...authenticatedErrors,
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/profile-versions/{version}:validate": {
      post: {
        operationId: "validateSpeechProfileVersion",
        description:
          "Validates provider configuration and consent without generating audio. Requires the `content.write` workspace permission.",
        parameters: [
          ...workspaceParameters,
          parameter("SpeechProfileVersionId"),
        ],
        responses: {
          "200": {
            description: "Validation result",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechProfileVersion"),
          },
          ...authenticatedErrors,
          "422": response("UnprocessableEntity"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/profile-versions/{version}/activate": {
      post: {
        operationId: "activateSpeechProfileVersion",
        description:
          "Activates a validated immutable profile version. Requires `content.write` and a current strong ETag.",
        parameters: [
          ...workspaceParameters,
          parameter("SpeechProfileVersionId"),
          parameter("IfMatch"),
        ],
        responses: {
          "200": {
            description: "Activated profile version",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechProfileVersion"),
          },
          ...authenticatedErrors,
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
        },
      },
    },
    "/v1/workspaces/{workspace}/speech/profile-versions/{version}:deprecate": {
      post: {
        operationId: "deprecateSpeechProfileVersion",
        description:
          "Deprecates an immutable profile version for future resolution while preserving pinned generation history. Requires `content.write` and a current strong ETag.",
        parameters: [
          ...workspaceParameters,
          parameter("SpeechProfileVersionId"),
          parameter("IfMatch"),
        ],
        responses: {
          "200": {
            description: "Deprecated profile version",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechProfileVersion"),
          },
          ...authenticatedErrors,
          "412": response("PreconditionFailed"),
          "428": response("PreconditionRequired"),
        },
      },
    },
    "/v1/workspaces/{workspace}/genres/{genre}/speech-policy": {
      put: {
        operationId: "setGenreSpeechPolicy",
        description:
          "Sets a genre default profile version. Requires `content.write` and a current strong ETag.",
        parameters: [
          ...workspaceParameters,
          parameter("GenreId"),
          parameter("IfMatch"),
        ],
        requestBody: {
          required: true,
          content: json("SpeechProfileReference"),
        },
        responses: {
          "200": {
            description: "Policy updated",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechPolicy"),
          },
          ...authenticatedErrors,
          "412": response("PreconditionFailed"),
        },
      },
    },
    "/v1/workspaces/{workspace}/videos/{video}/speech-override": {
      put: {
        operationId: "setVideoSpeechOverride",
        description:
          "Sets an explicit video profile override or restores the genre default. Requires `content.write` and a current strong ETag.",
        parameters: [
          ...workspaceParameters,
          parameter("VideoId"),
          parameter("IfMatch"),
        ],
        requestBody: {
          required: true,
          content: json("VideoSpeechOverrideInput"),
        },
        responses: {
          "200": {
            description: "Override updated",
            headers: {
              ETag: responseHeader("ETag"),
              "x-request-id": responseHeader("RequestId"),
            },
            content: json("SpeechPolicy"),
          },
          ...authenticatedErrors,
          "412": response("PreconditionFailed"),
        },
      },
    },
};
