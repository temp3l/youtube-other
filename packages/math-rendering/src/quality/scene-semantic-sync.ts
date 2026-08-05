import {
  mathVisualPlanSchema,
  type LessonVariantSpecification,
  type LocalizedNarration,
  type TimingManifest,
} from "@mediaforge/math-education";
import type { z } from "zod";

export const MATH_SCENE_SEMANTIC_SYNC_VERSION = "math-scene-semantic-sync.v1" as const;

export type SceneSemanticSyncCode =
  | "VISUAL_PLAN_SCHEMA_INVALID"
  | "SCENE_ORDER_MISMATCH"
  | "NARRATION_FACT_ORDER_MISMATCH"
  | "VISUAL_FACT_ORDER_MISMATCH"
  | "UNKNOWN_FACT"
  | "FACT_TOKEN_MISSING"
  | "FACT_SUBSTITUTION_MISSING"
  | "TASK_SOLUTION_MISMATCH"
  | "TIMING_SCENE_ORDER_MISMATCH"
  | "TIMING_SEGMENT_MISMATCH"
  | "TIMING_CUE_COUNT_MISMATCH";

export interface SceneSemanticSyncIssue {
  readonly code: SceneSemanticSyncCode;
  readonly sceneId?: string;
  readonly factId?: string;
  readonly message: string;
}

export interface SceneSemanticSyncReport {
  readonly validatorVersion: typeof MATH_SCENE_SEMANTIC_SYNC_VERSION;
  readonly valid: boolean;
  readonly issues: readonly SceneSemanticSyncIssue[];
}

export interface SceneSemanticSyncInput {
  readonly lesson: LessonVariantSpecification;
  readonly narration: LocalizedNarration;
  readonly visualPlan: z.input<typeof mathVisualPlanSchema>;
  readonly timing?: TimingManifest;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function issue(
  issues: SceneSemanticSyncIssue[],
  code: SceneSemanticSyncCode,
  message: string,
  sceneId?: string,
  factId?: string
): void {
  issues.push({ code, message, ...(sceneId ? { sceneId } : {}), ...(factId ? { factId } : {}) });
}

/**
 * An opt-in validator for v1 artefacts. It reports semantic disagreement without
 * changing rendering, cache, or artefact compatibility behavior.
 */
export function validateMathSceneSemanticSync(
  input: SceneSemanticSyncInput
): SceneSemanticSyncReport {
  const issues: SceneSemanticSyncIssue[] = [];
  const visualPlanResult = mathVisualPlanSchema.safeParse(input.visualPlan);
  if (!visualPlanResult.success) {
    issue(issues, "VISUAL_PLAN_SCHEMA_INVALID", "Visual plan does not satisfy the v1 contract.");
    return { validatorVersion: MATH_SCENE_SEMANTIC_SYNC_VERSION, valid: false, issues };
  }
  const visualPlan = visualPlanResult.data;
  const knownFacts = new Set(input.lesson.facts.map((fact) => fact.factId));
  const resolvedFacts = new Map(
    input.narration.resolvedFacts.map((fact) => [fact.factId, fact])
  );

  if (input.lesson.scenes.length !== input.narration.segments.length ||
      input.lesson.scenes.length !== visualPlan.scenes.length) {
    issue(issues, "SCENE_ORDER_MISMATCH", "Lesson, narration, and visual plan must have the same scene count.");
  }

  for (const [index, lessonScene] of input.lesson.scenes.entries()) {
    const narrationSegment = input.narration.segments[index];
    const visualScene = visualPlan.scenes[index];
    if (
      narrationSegment?.sceneId !== lessonScene.sceneId ||
      visualScene?.sceneId !== lessonScene.sceneId
    ) {
      issue(issues, "SCENE_ORDER_MISMATCH", "Scene IDs must match the lesson order.", lessonScene.sceneId);
    }
    if (!narrationSegment || !visualScene) continue;

    if (!sameOrder(narrationSegment.factIds, lessonScene.factIds)) {
      issue(issues, "NARRATION_FACT_ORDER_MISMATCH", "Narration fact IDs must match the current lesson scene in order.", lessonScene.sceneId);
    }
    if (!sameOrder(visualScene.factIds, lessonScene.factIds)) {
      issue(issues, "VISUAL_FACT_ORDER_MISMATCH", "Visual-plan fact IDs must match the current lesson scene in order.", lessonScene.sceneId);
    }
    for (const factId of [...narrationSegment.factIds, ...visualScene.factIds]) {
      if (!knownFacts.has(factId)) {
        issue(issues, "UNKNOWN_FACT", "Narration or visual plan references a fact not defined by the lesson.", lessonScene.sceneId, factId);
      }
    }
    for (const factId of lessonScene.factIds) {
      const token = `[[fact:${factId}]]`;
      if (!narrationSegment.tokenizedText.includes(token)) {
        issue(issues, "FACT_TOKEN_MISSING", "Tokenized narration does not contain its bound fact token.", lessonScene.sceneId, factId);
      }
      const resolved = resolvedFacts.get(factId);
      if (
        !resolved ||
        !narrationSegment.displayText.includes(resolved.display) ||
        !narrationSegment.spokenText.includes(resolved.spoken)
      ) {
        issue(issues, "FACT_SUBSTITUTION_MISSING", "Display or spoken narration does not contain the resolved bound fact.", lessonScene.sceneId, factId);
      }
    }
  }

  const solutionScene = input.lesson.scenes.find((scene) => scene.sceneFunction === "solution");
  if (!solutionScene?.factIds.includes(input.lesson.challenge.solutionFactId)) {
    issue(issues, "TASK_SOLUTION_MISMATCH", "The solution scene must expose the challenge solution fact.", solutionScene?.sceneId, input.lesson.challenge.solutionFactId);
  }

  if (input.timing) {
    if (input.timing.scenes.length !== input.lesson.scenes.length) {
      issue(issues, "TIMING_SCENE_ORDER_MISMATCH", "Timing must contain one entry for every lesson scene.");
    }
    for (const [index, lessonScene] of input.lesson.scenes.entries()) {
      const timingScene = input.timing.scenes[index];
      const narrationSegment = input.narration.segments[index];
      if (timingScene?.sceneId !== lessonScene.sceneId) {
        issue(issues, "TIMING_SCENE_ORDER_MISMATCH", "Timing scene IDs must match lesson order.", lessonScene.sceneId);
      }
      if (timingScene?.segmentId !== narrationSegment?.segmentId) {
        issue(issues, "TIMING_SEGMENT_MISMATCH", "Timing segment ID must match narration segment.", lessonScene.sceneId);
      }
      if (timingScene && timingScene.cueFrames.length !== lessonScene.factIds.length) {
        issue(issues, "TIMING_CUE_COUNT_MISMATCH", "Timing cue count must equal the number of bound scene facts.", lessonScene.sceneId);
      }
    }
  }
  return { validatorVersion: MATH_SCENE_SEMANTIC_SYNC_VERSION, valid: issues.length === 0, issues };
}

export function assertMathSceneSemanticSync(input: SceneSemanticSyncInput): void {
  const report = validateMathSceneSemanticSync(input);
  if (!report.valid) {
    throw new Error(
      `Math scene semantic synchronization failed: ${report.issues.map((entry) => entry.code).join(", ")}`
    );
  }
}
