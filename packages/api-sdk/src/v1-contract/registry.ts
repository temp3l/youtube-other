import { artifactLineageSdkV1Operations } from "./modules/artifact-lineage-operations.js";
import { artifactSdkV1Operations, publicationSdkV1Operations, reviewSdkV1Operations } from "./modules/artifact-review-publication-operations.js";
import { contentSdkV1Operations } from "./modules/content-operations.js";
import { developerCredentialSdkV1Operations } from "./modules/developer-credential-operations.js";
import { lifecycleSdkV1Operations } from "./modules/lifecycle-operations.js";
import { webhookSdkV1Operations } from "./modules/webhook-operations.js";
import { localizationSdkV1Operations } from "./modules/localization-operations.js";
import { platformSdkV1Operations } from "./modules/platform-operations.js";
import { publicationPreparationSdkV1Operations } from "./modules/publication-operations.js";
import { workflowSdkV1Operations } from "./modules/workflow-operations.js";
import type { SdkV1OperationContract, SdkV1OperationModule } from "./types.js";

/** Disjoint SDK operation modules. Later YSAAS tasks extend assigned modules only. */
export const SDK_V1_OPERATION_MODULES: readonly SdkV1OperationModule[] = [
  { id: "platform", owner: "platform", operations: platformSdkV1Operations },
  {
    id: "developer-credential",
    owner: "developer",
    operations: developerCredentialSdkV1Operations,
  },
  { id: "webhook", owner: "developer", operations: webhookSdkV1Operations },
  {
    id: "lifecycle",
    owner: "lifecycle",
    operations: lifecycleSdkV1Operations,
  },
  { id: "content", owner: "content", operations: contentSdkV1Operations },
  { id: "workflow", owner: "workflow", operations: workflowSdkV1Operations },
  {
    id: "artifact-lineage",
    owner: "artifact",
    operations: artifactLineageSdkV1Operations,
  },
  {
    id: "artifact",
    owner: "artifact",
    operations: artifactSdkV1Operations,
  },
  { id: "review", owner: "review", operations: reviewSdkV1Operations },
  {
    id: "localization",
    owner: "localization",
    operations: localizationSdkV1Operations,
  },
  {
    id: "publication",
    owner: "publication",
    operations: {
      ...publicationSdkV1Operations,
      ...publicationPreparationSdkV1Operations,
    },
  },
];

export const SDK_V1_OPERATION_OWNERSHIP: Readonly<
  Record<SdkV1OperationModule["owner"], readonly string[]>
> = {
  platform: ["YSAAS-010", "YSAAS-011"],
  content: ["YSAAS-005", "YSAAS-015"],
  workflow: ["YSAAS-005", "YSAAS-007"],
  artifact: ["YSAAS-006"],
  review: ["YSAAS-007"],
  localization: ["YSAAS-008"],
  publication: ["YSAAS-013", "YSAAS-014"],
  speech: ["YSAAS-010"],
  developer: ["YSAAS-011", "YSAAS-012"],
  lifecycle: ["YSAAS-015", "YSAAS-016"],
};

function mergeOperations(
  modules: readonly SdkV1OperationModule[]
): Readonly<Record<string, SdkV1OperationContract>> {
  return modules.reduce<Record<string, SdkV1OperationContract>>(
    (accumulator, module) => {
      for (const [operationId, contract] of Object.entries(module.operations)) {
        if (accumulator[operationId] !== undefined) {
          throw new Error(
            `Duplicate SDK operation registration: ${operationId}`
          );
        }
        accumulator[operationId] = contract;
      }
      return accumulator;
    },
    {}
  );
}

export const SDK_V1_OPERATIONS = mergeOperations(
  SDK_V1_OPERATION_MODULES
) as typeof platformSdkV1Operations &
  typeof developerCredentialSdkV1Operations &
  typeof webhookSdkV1Operations &
  typeof lifecycleSdkV1Operations &
  typeof contentSdkV1Operations &
  typeof workflowSdkV1Operations &
  typeof artifactLineageSdkV1Operations &
  typeof artifactSdkV1Operations &
  typeof reviewSdkV1Operations &
  typeof publicationSdkV1Operations;
