import type { SdkV1OperationContract } from "../types.js";

export const artifactLineageSdkV1Operations = {
  listProductionUnitSnapshots: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units", successStatus: "200", responseSchema: "ProductionUnitSnapshotPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  compareProductionUnitSnapshots: { method: "GET", path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units:compare", successStatus: "200", responseSchema: "ProductionUnitComparisonPage", requestSchema: null, requiredHeaders: [], problemResponses: true },
  previewArtifactInvalidation: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/artifact-invalidation-preview",
    successStatus: "200",
    responseSchema: "ArtifactInvalidationPreview",
    requestSchema: "ArtifactInvalidationPreviewInput",
    requiredHeaders: [],
    problemResponses: true,
  },
  regenerateProductionUnits: {
    method: "POST",
    path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/production-units:regenerate",
    successStatus: "202",
    responseSchema: "ProductionUnitRegenerationAccepted",
    requestSchema: "ProductionUnitRegenerationInput",
    requiredHeaders: ["IdempotencyKey"],
    problemResponses: true,
  },
} as const satisfies Readonly<Record<string, SdkV1OperationContract>>;
