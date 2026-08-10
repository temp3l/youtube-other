import type { TaskFingerprintMaterial } from "@mediaforge/workflow-engine";
import {
  createProductionHardeningTaskMaterial,
  type ProductionVariant,
} from "@mediaforge/shared";

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
  readonly variant?: ProductionVariant;
}): Readonly<Record<string, TaskFingerprintMaterial>> {
  const registry = createDarkTruthTaskRegistry();
  const material: Record<string, TaskFingerprintMaterial> = {};
  const variant = input.variant ?? "full";
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
    const hardening = darkTruthHardeningTaskIds.has(taskId)
      ? createProductionHardeningTaskMaterial({
          taskId,
          genre: "dark-truth",
          variant,
        })
      : {};
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
      ...hardening,
    };
  }
  return material;
}

const darkTruthHardeningTaskIds = new Set<string>([
  "darktruth.shorts-derive",
  "darktruth.quality-shorts",
  "darktruth.shot-plan",
  "darktruth.reference-plan",
  "darktruth.reference-prepare",
  "darktruth.reference-validate",
  "darktruth.scene-images",
  "darktruth.quality-visual-continuity",
  "darktruth.thumbnail-concept",
  "darktruth.thumbnail-generate",
  "darktruth.thumbnail-validate",
  "darktruth.narration-instructions",
  "darktruth.audio-generate",
  "darktruth.audio-validate",
  "darktruth.captions",
  "darktruth.render",
  "darktruth.quality-audiovisual",
  "darktruth.metadata",
  "darktruth.publish-dry-run",
]);
