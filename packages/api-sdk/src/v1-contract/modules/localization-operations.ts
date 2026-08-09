import type { SdkV1OperationContract } from "../types.js";

export const localizationSdkV1Operations = {
  listLocalizationDerivatives: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives",
    successStatus: "200",
    responseSchema: "LocalizationDerivativePage",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  createLocalizationDerivative: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives",
    successStatus: "201",
    responseSchema: "LocalizationDerivativeRecord",
    requestSchema: "LocalizationDerivativeCreateInput",
    requiredHeaders: ["IdempotencyKey"],
    problemResponses: true,
  },
  evaluateLocalizationPreflight: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives:preflight",
    successStatus: "200",
    responseSchema: "LocalizationPreflightResult",
    requestSchema: "LocalizationPreflightInput",
    requiredHeaders: [],
    problemResponses: true,
  },
  compareLocalizationDerivative: {
    method: "GET",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives/{derivative}:compare",
    successStatus: "200",
    responseSchema: "LocalizationComparison",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
  retryLocalizationDerivative: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/localization-derivatives/{derivative}:retry",
    successStatus: "200",
    responseSchema: "LocalizationDerivativeRecord",
    requestSchema: null,
    requiredHeaders: [],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;
