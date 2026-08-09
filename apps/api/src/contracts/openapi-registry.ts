import type { OpenApiPathModule } from "./types.js";
import { artifactLineageOpenApiPaths } from "./modules/artifact-lineage-paths.js";
import { artifactReviewPublicationOpenApiPaths } from "./modules/artifact-review-publication-paths.js";
import { contentOpenApiPaths } from "./modules/content-paths.js";
import { developerCredentialOpenApiPaths } from "./modules/developer-credential-paths.js";
import { lifecycleOpenApiPaths } from "./modules/lifecycle-paths.js";
import { reviewOpenApiPaths } from "./modules/review-paths.js";
import { webhookOpenApiPaths } from "./modules/webhook-paths.js";
import { platformOpenApiPaths } from "./modules/platform-paths.js";
import { speechOpenApiPaths } from "./modules/speech-paths.js";
import { workflowOpenApiPaths } from "./modules/workflow-paths.js";

export const OPENAPI_PATH_MODULES: readonly OpenApiPathModule[] = [
  { id: "platform", owner: "platform", paths: platformOpenApiPaths },
  {
    id: "developer-credential",
    owner: "developer",
    paths: developerCredentialOpenApiPaths,
  },
  { id: "webhook", owner: "developer", paths: webhookOpenApiPaths },
  { id: "lifecycle", owner: "lifecycle", paths: lifecycleOpenApiPaths },
  { id: "content", owner: "content", paths: contentOpenApiPaths },
  { id: "workflow", owner: "workflow", paths: workflowOpenApiPaths },
  {
    id: "artifact-lineage",
    owner: "artifact",
    paths: artifactLineageOpenApiPaths,
  },
  {
    id: "artifact-review-publication",
    owner: "artifact",
    paths: artifactReviewPublicationOpenApiPaths,
  },
  { id: "review", owner: "review", paths: reviewOpenApiPaths },
  { id: "speech", owner: "speech", paths: speechOpenApiPaths },
];

export const OPENAPI_MODULE_OWNERSHIP: Readonly<
  Record<OpenApiPathModule["owner"], readonly string[]>
> = {
  platform: ["YSAAS-010", "YSAAS-011"],
  content: ["YSAAS-005", "YSAAS-015"],
  workflow: ["YSAAS-005", "YSAAS-007"],
  artifact: ["YSAAS-006", "YSAAS-013"],
  review: ["YSAAS-007"],
  publication: ["YSAAS-013", "YSAAS-014"],
  speech: ["YSAAS-010"],
  developer: ["YSAAS-011", "YSAAS-012"],
  lifecycle: ["YSAAS-015", "YSAAS-016"],
};
