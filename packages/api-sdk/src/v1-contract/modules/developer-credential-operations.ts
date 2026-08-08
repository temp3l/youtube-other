import type { SdkV1OperationContract } from "../types.js";

export const developerCredentialSdkV1Operations = {
  issueApiCredential: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/api-credentials",
    successStatus: "201",
    responseSchema: "ApiCredentialIssueResult",
    requestSchema: "ApiCredentialIssueInput",
    requiredHeaders: ["IdempotencyKey"],
    problemResponses: true,
  },
  listApiCredentials: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/api-credentials",
    successStatus: "200",
    responseSchema: "ApiCredentialPage",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  getApiCredential: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/api-credentials/{key}",
    successStatus: "200",
    responseSchema: "ApiCredentialRecord",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  revokeApiCredential: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/api-credentials/{key}:revoke",
    successStatus: "200",
    responseSchema: "ApiCredentialRecord",
    requestSchema: "ApiCredentialRevokeInput",
    requiredHeaders: ["IfMatch"],
    problemResponses: true,
  },
  getDeveloperJourneyExamples: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/developer-journey-examples",
    successStatus: "200",
    responseSchema: "DeveloperJourneyExamples",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;
