import type { TaskFingerprintMaterial } from "@mediaforge/workflow-engine";

import type {
  ReferenceImageManifest,
  StoryBibleManifest,
} from "./profile-contracts.js";
import {
  DARK_TRUTH_TASK_IDS,
  createDarkTruthTaskRegistry,
} from "./task-registry.js";

/** Bind exact profile evidence to the tasks that declare it as material input. */
export function createDarkTruthFingerprintMaterial(input: {
  readonly bible: StoryBibleManifest | null;
  readonly references: ReferenceImageManifest | null;
}): Readonly<Record<string, TaskFingerprintMaterial>> {
  const registry = createDarkTruthTaskRegistry();
  const material: Record<string, TaskFingerprintMaterial> = {};
  for (const taskId of DARK_TRUTH_TASK_IDS) {
    const explanation = registry.explain(taskId);
    const bibleBound =
      taskId === "darktruth.episode-bible" ||
      explanation.transitiveDependencies.includes(
        "darktruth.episode-bible" as never
      );
    const referenceBound =
      taskId === "darktruth.reference-prepare" ||
      taskId === "darktruth.reference-validate" ||
      taskId === "darktruth.reference-approval" ||
      explanation.transitiveDependencies.includes(
        "darktruth.reference-prepare" as never
      );
    material[taskId] = {
      ...(input.bible
        ? {
            profile: {
              contractVersion: "darktruth.profile.v1",
              profileRevision: input.bible.profileRevision,
              contentHash: input.bible.contentHash,
            },
            ...(bibleBound ? { bibleRevision: input.bible.revision } : {}),
            visualStyleRevision:
              input.bible.documents.find(
                (document) => document.kind === "visual-style-guide"
              )?.revision ?? input.bible.profileRevision,
            additional: {
              workflowRevision: input.bible.workflowRevision,
              documentBindings: Object.fromEntries(
                input.bible.documents.map((document) => [
                  document.kind,
                  {
                    revision: document.revision,
                    contentHash: document.contentHash,
                  },
                ])
              ),
            },
          }
        : {}),
      ...(input.references && referenceBound
        ? { referenceSetRevision: input.references.revision }
        : {}),
    };
  }
  return material;
}
