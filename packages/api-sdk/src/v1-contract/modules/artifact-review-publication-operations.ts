import type { SdkV1OperationContract } from "../types.js";

export const artifactSdkV1Operations = {
  getAsset: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}",
    successStatus: "200",
    responseSchema: "Asset",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  listAssets: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/assets",
    successStatus: "200",
    responseSchema: "AssetPage",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  listValidations: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/validations",
    successStatus: "200",
    responseSchema: "ValidationPage",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;

export const reviewSdkV1Operations = {
  getApprovalChallenge: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/approval-challenges/{challenge}",
    successStatus: "200",
    responseSchema: "ApprovalChallenge",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  recordApproval: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/approvals",
    successStatus: "202",
    responseSchema: "ApprovalAccepted",
    requestSchema: "ApprovalInput",
    requiredHeaders: ["IdempotencyKey", "IfMatch"],
    problemResponses: true,
  },
  revokeApproval: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/approvals/{approval}:revoke",
    successStatus: "200",
    responseSchema: "ApprovalRevoked",
    requestSchema: "ApprovalRevocationInput",
    requiredHeaders: ["IdempotencyKey", "IfMatch"],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;

export const publicationSdkV1Operations = {
  getPublication: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/publications/{publication}",
    successStatus: "200",
    responseSchema: "Publication",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;
