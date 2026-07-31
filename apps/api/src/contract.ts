import { z } from "zod";

const opaqueId = z.string().min(3).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

export const projectInputSchema = z
  .object({ name: z.string().trim().min(1).max(160), profile: z.enum(["dark_truth", "mathematics_education"]) })
  .strict();
export const episodeInputSchema = z
  .object({
    content: z.discriminatedUnion("type", [
      z.object({ type: z.literal("dark_truth"), version: z.literal("1"), premise: z.string().trim().min(1).max(20_000), storyBibleId: opaqueId, referenceAssetIds: z.array(opaqueId).max(100) }).strict(),
      z.object({ type: z.literal("mathematics_education"), version: z.literal("1"), curriculumSourceId: opaqueId, skillId: opaqueId, grade: z.number().int().min(1).max(13), difficulty: z.enum(["introductory", "standard", "advanced"]), presentationPresetId: opaqueId, audioPresetId: opaqueId }).strict(),
    ]),
  })
  .strict();
export const workflowAdmissionSchema = z
  .object({
    template: z.literal("episode-production"),
    episodeRevision: z.number().int().nonnegative(),
    locales: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)).min(1).max(10),
    variants: z.array(z.enum(["full", "short"])).min(1).max(2),
    approvalMode: z.enum(["required", "automatic"]),
    publicationMode: z.literal("none"),
  })
  .strict();
export const approvalInputSchema = z
  .object({
    challengeId: opaqueId,
    subjectId: opaqueId,
    expectedRevision: z.number().int().nonnegative(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Mediaforge Internal API", version: "1.0.0" },
  paths: {
    "/v1/workspaces/{workspace}/projects": { post: { operationId: "createProject", responses: { "201": { description: "Project created" }, "400": { description: "RFC 9457 problem" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/episodes": { post: { operationId: "createEpisode", responses: { "201": { description: "Episode created" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs": { post: { operationId: "admitWorkflow", responses: { "202": { description: "Workflow accepted" }, "409": { description: "Idempotency conflict" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/workflow-runs/{run}": { get: { operationId: "getWorkflow", responses: { "200": { description: "Workflow status" }, "404": { description: "Not found" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/assets/{asset}": { get: { operationId: "getAsset", responses: { "200": { description: "Asset descriptor" }, "404": { description: "Not found" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/validations": { get: { operationId: "listValidations", responses: { "200": { description: "Validation page" } } } },
    "/v1/workspaces/{workspace}/projects/{project}/approvals": { post: { operationId: "recordApproval", responses: { "202": { description: "Approval accepted" } } } },
  },
} as const;

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type EpisodeInput = z.infer<typeof episodeInputSchema>;
export type WorkflowAdmission = z.infer<typeof workflowAdmissionSchema>;
export type ApprovalInput = z.infer<typeof approvalInputSchema>;
