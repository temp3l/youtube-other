export type StoryGenerationTask =
  | { readonly taskType: "canonical-narration"; readonly allowedOutput: "narration"; readonly language: "en" }
  | { readonly taskType: "localization"; readonly allowedOutput: "localized-narration"; readonly language: string; readonly canonicalStoryId: string; readonly canonicalRevision: number; readonly canonicalContentHash: string; readonly canonicalContractHash: string }
  | { readonly taskType: "metadata"; readonly allowedOutput: "metadata"; readonly language: string }
  | { readonly taskType: "scene-planning"; readonly allowedOutput: "scene-plan"; readonly language: string }
  | { readonly taskType: "validation"; readonly allowedOutput: "validation-result"; readonly language: string }
  | { readonly taskType: "repair"; readonly allowedOutput: "narration-repair"; readonly language: string; readonly repairIteration: number };

export function taskAllowsMetadata(task: StoryGenerationTask): boolean {
  return task.taskType === "metadata";
}
