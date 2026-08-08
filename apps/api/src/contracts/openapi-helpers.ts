export const schema = (name: string) =>
  ({ $ref: `#/components/schemas/${name}` }) as const;
export const parameter = (name: string) =>
  ({ $ref: `#/components/parameters/${name}` }) as const;
export const response = (name: string) =>
  ({ $ref: `#/components/responses/${name}` }) as const;
export const responseHeader = (name: string) =>
  ({ $ref: `#/components/headers/${name}` }) as const;
export const json = (name: string) =>
  ({ "application/json": { schema: schema(name) } }) as const;

export const requestIdParameter = parameter("RequestId");
export const workspaceParameters = [
  parameter("WorkspaceId"),
  requestIdParameter,
] as const;
export const projectParameters = [
  parameter("WorkspaceId"),
  parameter("ProjectId"),
  requestIdParameter,
] as const;
export const episodeParameters = [
  ...projectParameters,
  parameter("EpisodeId"),
] as const;
export const workflowParameters = [
  ...projectParameters,
  parameter("WorkflowRunId"),
] as const;
export const jobParameters = [...projectParameters, parameter("JobId")] as const;
export const assetParameters = [...projectParameters, parameter("AssetId")] as const;
export const publicationParameters = [
  ...projectParameters,
  parameter("PublicationId"),
] as const;
export const approvalParameters = [
  ...projectParameters,
  parameter("ApprovalId"),
] as const;
export const authenticatedErrors = {
  "401": response("Unauthorized"),
  "403": response("Forbidden"),
} as const;
