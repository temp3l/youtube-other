import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildEducationalSpeechPlan,
  educationalSpeechWorkflowLogSchema,
  resolveSpeechDeliveryProfile,
} from "@mediaforge/speech";
import { describe, expect, it } from "vitest";
import { buildMathEducationalNarrationBeats, buildMathPresentationSync } from "./lesson/educational-speech-sync.js";
import { localizeNarration } from "./localization/localization.js";
import { buildLessonVariant } from "./lesson/variant-builder.js";
import { createReviewedCurriculumFixture } from "./testing/reviewed-curriculum-fixture.js";
import { recordMathEducationalSpeechStage } from "./orchestration/educational-speech-workflow.js";
import {
  MATH_STAGES,
  saveWorkflowManifest,
  stageFingerprint,
  workflowManifestSchema,
  type WorkflowManifest,
} from "./orchestration/workflow.js";
import { writeJsonAtomic } from "@mediaforge/shared";

function baseManifest(lessonId: string): WorkflowManifest {
  let previous: string | undefined;
  return workflowManifestSchema.parse({
    artifactVersion: "math-workflow.v2",
    lessonId,
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage) => {
      const parents = previous ? [previous] : [];
      const fingerprint = stageFingerprint(stage, parents, { fixture: true });
      previous = fingerprint;
      return {
        stage,
        status: stage === "tts" ? "skipped" : "succeeded",
        fingerprint,
        parentFingerprints: parents,
        outputArtifacts: [],
        updatedAt: "2026-07-13T10:00:00.000Z",
      };
    }),
    failures: [],
  });
}

describe("math educational speech integration", () => {
  it("maps all nine scenes to typed teaching beats and creates renderer timing", async () => {
    const curriculum = await createReviewedCurriculumFixture(
      await fs.mkdtemp(path.join(os.tmpdir(), "math-speech-release-"))
    );
    const lesson = buildLessonVariant(curriculum.skills[0]!, "standard");
    const narration = localizeNarration(lesson, "en");
    const profile = resolveSpeechDeliveryProfile("education-natural-teacher", "en");
    const plan = buildEducationalSpeechPlan({
      episodeId: lesson.lessonId,
      profile,
      beats: buildMathEducationalNarrationBeats(narration),
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    expect(plan.beats).toHaveLength(9);
    expect(plan.beats.map((beat) => beat.kind)).toEqual([
      "introduction",
      "problem-statement",
      "explanation",
      "calculation-step",
      "warning",
      "guided-practice",
      "think-pause",
      "final-answer",
      "recap",
    ]);
    const workflow = educationalSpeechWorkflowLogSchema.parse({
      schemaVersion: "educational-speech-workflow.v1",
      task: "educational-speech-generate",
      status: "completed",
      provider: "fake",
      model: profile.model,
      voice: profile.voice,
      language: "en",
      speechProfile: profile.id,
      speechProfileVersion: profile.version,
      pronunciationDictionaryVersion: profile.pronunciationDictionaryVersion,
      pronunciationDictionaryFingerprint: plan.pronunciationDictionaryFingerprint,
      inputHash: plan.planFingerprint,
      cacheHit: false,
      cacheHitCount: 0,
      providerRequestCount: plan.chunks.length,
      chunkCount: plan.chunks.length,
      candidateCount: 1,
      startedAt: "2026-07-13T10:00:00.000Z",
      completedAt: "2026-07-13T10:01:00.000Z",
      durationMs: 60_000,
      generatedAudioDurationMs: 60_000,
      postProcessingDurationMs: 1_000,
      exitCode: 0,
      chunks: plan.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        beatIds: chunk.beatIds,
        selectedCandidate: 1,
        plannedPauseKind: chunk.pauseAfter.kind,
        plannedPauseMs: chunk.pauseAfter.durationMs,
        candidates: [{
          chunkId: chunk.chunkId,
          candidateIndex: 1,
          selected: true,
          status: "completed",
          cacheHit: false,
          cacheStatus: "miss",
          outputPath: `${chunk.chunkId}.wav`,
          outputHash: "a".repeat(64),
          durationMs: 60_000 / plan.chunks.length,
          providerDurationMs: 100,
          attemptCount: 1,
          validationStatus: "passed",
        }],
      })),
      warnings: [],
      errors: [],
    });
    const sync = buildMathPresentationSync({ plan, workflow });
    expect(sync.steps).toHaveLength(9);
    expect(sync.steps.every((step) => step.writingNarrationOverlap)).toBe(true);
    expect(sync.steps.at(-1)?.nextStepMayStartAtMs).toBeGreaterThan(0);
  });

  it("records resumable TTS lineage, paid-provider use, timing sync, and downstream invalidation", async () => {
    const curriculum = await createReviewedCurriculumFixture(
      await fs.mkdtemp(path.join(os.tmpdir(), "math-speech-release-"))
    );
    const lesson = buildLessonVariant(curriculum.skills[0]!, "standard");
    const narration = localizeNarration(lesson, "de");
    const profile = resolveSpeechDeliveryProfile("education-natural-teacher", "de");
    const plan = buildEducationalSpeechPlan({
      episodeId: lesson.lessonId,
      profile,
      beats: buildMathEducationalNarrationBeats(narration),
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-speech-workflow-"));
    const workflowRelativePath = "locales/de/audio/educational-speech/workflow-log.json";
    const audioRelativePath = "locales/de/audio/educational-speech/narration.wav";
    const workflow = educationalSpeechWorkflowLogSchema.parse({
      schemaVersion: "educational-speech-workflow.v1",
      task: "educational-speech-generate",
      status: "completed",
      provider: "openai-compatible",
      model: profile.model,
      voice: profile.voice,
      language: "de",
      speechProfile: profile.id,
      speechProfileVersion: profile.version,
      pronunciationDictionaryVersion: profile.pronunciationDictionaryVersion,
      pronunciationDictionaryFingerprint: plan.pronunciationDictionaryFingerprint,
      inputHash: plan.planFingerprint,
      cacheHit: false,
      cacheHitCount: 0,
      providerRequestCount: plan.chunks.length,
      chunkCount: plan.chunks.length,
      candidateCount: 1,
      startedAt: "2026-07-13T10:00:00.000Z",
      completedAt: "2026-07-13T10:01:00.000Z",
      durationMs: 60_000,
      generatedAudioDurationMs: 60_000,
      postProcessingDurationMs: 1_000,
      exitCode: 0,
      chunks: plan.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        beatIds: chunk.beatIds,
        selectedCandidate: 1,
        plannedPauseKind: chunk.pauseAfter.kind,
        plannedPauseMs: chunk.pauseAfter.durationMs,
        candidates: [{
          chunkId: chunk.chunkId,
          candidateIndex: 1,
          selected: true,
          status: "completed",
          cacheHit: false,
          cacheStatus: "miss",
          outputPath: `${chunk.chunkId}.wav`,
          outputHash: "b".repeat(64),
          durationMs: 60_000 / plan.chunks.length,
          providerDurationMs: 100,
          attemptCount: 1,
          validationStatus: "passed",
        }],
      })),
      warnings: [],
      errors: [],
    });
    await writeJsonAtomic(path.join(root, workflowRelativePath), workflow);
    await fs.mkdir(path.dirname(path.join(root, audioRelativePath)), { recursive: true });
    await fs.writeFile(path.join(root, audioRelativePath), Buffer.from("RIFF-valid-fixture"));
    const manifestPath = path.join(root, "manifest.json");
    const manifest = baseManifest(lesson.lessonId);
    await saveWorkflowManifest(manifestPath, manifest);
    const updated = await recordMathEducationalSpeechStage({
      lessonRoot: root,
      manifestPath,
      manifest,
      language: "de",
      skillId: lesson.skillId,
      variant: lesson.variant,
      plan,
      workflow,
      workflowRelativePath,
      audioRelativePath,
      updatedAt: "2026-07-13T10:02:00.000Z",
    });
    expect(updated.paidProviderCalled).toBe(true);
    expect(updated.stages.find((stage) => stage.stage === "tts")?.status).toBe("succeeded");
    expect(updated.stages.find((stage) => stage.stage === "timing-reflow")?.status).toBe("succeeded");
    expect(updated.stages.find((stage) => stage.stage === "render")?.status).toBe("stale");
    expect(updated.stages.find((stage) => stage.stage === "tts")?.outputArtifacts.map((artifact) => artifact.schemaVersion)).toEqual(expect.arrayContaining(["educational-speech.v1", "math-speech-binary.v1"]));
  });
});
