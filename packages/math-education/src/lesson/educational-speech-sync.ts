import {
  educationalNarrationBeatSchema,
  type EducationalNarrationBeat,
  type EducationalSpeechPlan,
  type EducationalSpeechWorkflowLog,
} from "@mediaforge/speech";
import { z } from "zod";
import { sceneFunctionSchema } from "../domain/index.js";
import type { LocalizedNarration } from "../localization/localization.js";

const sceneFunctionToBeatKind = {
  hook: "introduction",
  objective: "problem-statement",
  model: "explanation",
  "worked-example": "calculation-step",
  mistake: "warning",
  "guided-practice": "guided-practice",
  "think-pause": "think-pause",
  solution: "final-answer",
  recap: "recap",
} as const;

export function buildMathEducationalNarrationBeats(
  narration: LocalizedNarration
): readonly EducationalNarrationBeat[] {
  return narration.segments.map((segment) => {
    const sceneFunction = sceneFunctionSchema.parse(segment.sceneFunction);
    return educationalNarrationBeatSchema.parse({
      id: segment.segmentId,
      visualStepId: segment.sceneId,
      kind: sceneFunctionToBeatKind[sceneFunction],
      displayText: segment.displayText,
      spokenText: segment.spokenText,
      writingBehavior: "overlap-narration",
    });
  });
}

export const mathPresentationSyncSchema = z
  .object({
    artifactVersion: z.literal("math-presentation-sync.v1"),
    presetId: z.literal("chalkboard-natural-teacher-v1"),
    speechPlanFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    workflowInputHash: z.string().regex(/^[a-f0-9]{64}$/u),
    language: z.enum(["de", "en", "es", "fr", "pt"]),
    audioDurationMs: z.number().nonnegative(),
    steps: z.array(
      z
        .object({
          beatId: z.string(),
          visualStepId: z.string().optional(),
          displayText: z.string(),
          spokenText: z.string(),
          chunkId: z.string(),
          writingBeginsAtMs: z.number().nonnegative(),
          narrationBeginsAtMs: z.number().nonnegative(),
          writingEndsAtMs: z.number().nonnegative(),
          narrationEndsAtMs: z.number().nonnegative(),
          plannedInspectionPauseMs: z.number().nonnegative(),
          compositionPauseApplied: z.boolean(),
          pauseApplication: z.enum([
            "provider-instruction",
            "audio-composition",
            "none",
          ]),
          inspectionEndsAtMs: z.number().nonnegative(),
          nextStepMayStartAtMs: z.number().nonnegative(),
          writingNarrationOverlap: z.boolean(),
        })
        .strict()
    ),
  })
  .strict()
  .superRefine((value, context) => {
    let previousEnd = 0;
    for (const [index, step] of value.steps.entries()) {
      if (
        step.narrationBeginsAtMs < previousEnd ||
        step.narrationEndsAtMs < step.narrationBeginsAtMs ||
        step.writingEndsAtMs < step.writingBeginsAtMs ||
        step.inspectionEndsAtMs < step.narrationEndsAtMs ||
        step.nextStepMayStartAtMs < step.inspectionEndsAtMs
      ) {
        context.addIssue({
          code: "custom",
          path: ["steps", index],
          message: "Presentation synchronization steps must be ordered and non-negative.",
        });
      }
      previousEnd = step.nextStepMayStartAtMs;
    }
  });
export type MathPresentationSync = z.infer<typeof mathPresentationSyncSchema>;

export function buildMathPresentationSync(input: {
  readonly plan: EducationalSpeechPlan;
  readonly workflow: EducationalSpeechWorkflowLog;
}): MathPresentationSync {
  if (input.workflow.status !== "completed") {
    throw new Error("Presentation synchronization requires completed speech.");
  }
  const selectedDurationByChunk = new Map(
    input.workflow.chunks.map((chunk) => {
      const selected = chunk.candidates.find(
        (candidate) => candidate.candidateIndex === chunk.selectedCandidate
      );
      if (!selected?.durationMs) {
        throw new Error(`Selected candidate duration missing for ${chunk.chunkId}.`);
      }
      return [chunk.chunkId, selected.durationMs] as const;
    })
  );
  const chunkByBeat = new Map(
    input.plan.chunks.flatMap((chunk) =>
      chunk.beatIds.map((beatId) => [beatId, chunk] as const)
    )
  );
  let cursorMs = 0;
  const steps = input.plan.beats.map((beat) => {
    const chunk = chunkByBeat.get(beat.id);
    if (!chunk) throw new Error(`Speech chunk missing for beat ${beat.id}.`);
    const chunkDurationMs = selectedDurationByChunk.get(chunk.chunkId);
    if (!chunkDurationMs) throw new Error(`Speech duration missing for ${chunk.chunkId}.`);
    const chunkBeats = input.plan.beats.filter((candidate) =>
      chunk.beatIds.includes(candidate.id)
    );
    const totalEstimate = chunkBeats.reduce(
      (sum, candidate) => sum + candidate.estimatedDurationMs,
      0
    );
    const narrationDurationMs = Math.max(
      1,
      Math.round(
        chunkDurationMs *
          (beat.estimatedDurationMs / Math.max(1, totalEstimate))
      )
    );
    const isFinalBeatInChunk = chunk.beatIds.at(-1) === beat.id;
    const narrationBeginsAtMs = cursorMs;
    const narrationEndsAtMs = narrationBeginsAtMs + narrationDurationMs;
    const plannedWritingDurationMs = Math.max(
      600,
      Math.min(4_000, Math.round((beat.displayText.length / 18) * 1_000))
    );
    const writingBeginsAtMs = narrationBeginsAtMs;
    const writingEndsAtMs = Math.min(
      narrationEndsAtMs,
      writingBeginsAtMs + plannedWritingDurationMs
    );
    const compositionPauseApplied = isFinalBeatInChunk;
    const appliedPauseMs = compositionPauseApplied
      ? chunk.pauseAfter.durationMs
      : 0;
    const inspectionEndsAtMs = narrationEndsAtMs + appliedPauseMs;
    cursorMs = inspectionEndsAtMs;
    return {
      beatId: beat.id,
      ...(beat.visualStepId ? { visualStepId: beat.visualStepId } : {}),
      displayText: beat.displayText,
      spokenText: beat.ttsText,
      chunkId: chunk.chunkId,
      writingBeginsAtMs,
      narrationBeginsAtMs,
      writingEndsAtMs,
      narrationEndsAtMs,
      plannedInspectionPauseMs: beat.pauseAfter.durationMs,
      compositionPauseApplied,
      pauseApplication: compositionPauseApplied
        ? "audio-composition"
        : beat.pauseAfter.durationMs > 0
          ? "provider-instruction"
          : "none",
      inspectionEndsAtMs,
      nextStepMayStartAtMs: inspectionEndsAtMs,
      writingNarrationOverlap: true,
    };
  });
  return mathPresentationSyncSchema.parse({
    artifactVersion: "math-presentation-sync.v1",
    presetId: "chalkboard-natural-teacher-v1",
    speechPlanFingerprint: input.plan.planFingerprint,
    workflowInputHash: input.workflow.inputHash,
    language: input.plan.language,
    audioDurationMs: input.workflow.generatedAudioDurationMs ?? cursorMs,
    steps,
  });
}
