import path from "node:path";
import type {
  EducationalSpeechPlan,
  EducationalSpeechWorkflowLog,
} from "@mediaforge/speech";
import { writeJsonAtomic } from "@mediaforge/shared";
import type { LessonVariant, MathLanguage } from "../domain/index.js";
import {
  buildMathPresentationSync,
  mathPresentationSyncSchema,
} from "../lesson/educational-speech-sync.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  createArtifactLineage,
  MATH_STAGES,
  saveWorkflowManifest,
  stageFingerprint,
  workflowManifestSchema,
  type MathArtifactLineage,
  type MathStage,
  type MathStageRecord,
  type WorkflowManifest,
} from "./workflow.js";

function localePrefix(language: MathLanguage): string {
  return `locales/${language}/`;
}

export async function recordMathEducationalSpeechStage(input: {
  readonly lessonRoot: string;
  readonly manifestPath: string;
  readonly manifest: WorkflowManifest;
  readonly language: MathLanguage;
  readonly skillId: string;
  readonly variant: LessonVariant;
  readonly plan: EducationalSpeechPlan;
  readonly workflow: EducationalSpeechWorkflowLog;
  readonly workflowRelativePath: string;
  readonly audioRelativePath?: string;
  readonly updatedAt?: string;
}): Promise<WorkflowManifest> {
  const now = input.updatedAt ?? new Date().toISOString();
  const visualStage = input.manifest.stages.find(
    (record) => record.stage === "visual-assets"
  );
  if (!visualStage) throw new Error("Math workflow visual-assets stage is missing.");
  const ttsParents = [visualStage.fingerprint];
  const identity = {
    lessonId: input.manifest.lessonId,
    skillId: input.skillId,
    language: input.language,
    variant: input.variant,
  } as const;
  const priorTts = input.manifest.stages.find((record) => record.stage === "tts");
  const retainedTts =
    priorTts?.outputArtifacts.filter(
      (artifact) => !artifact.relativePath.startsWith(localePrefix(input.language))
    ) ?? [];
  const speechLineage: MathArtifactLineage[] = [
    await createArtifactLineage({
      root: input.lessonRoot,
      relativePath: input.workflowRelativePath,
      schemaVersion: "educational-speech.v1",
      parentHashes: ttsParents,
      producedBy: "tts",
      producer: "educational-speech-pipeline",
      producerVersion: input.workflow.speechProfileVersion,
    }),
  ];
  if (input.workflow.status === "completed" && input.audioRelativePath) {
    speechLineage.push(
      await createArtifactLineage({
        root: input.lessonRoot,
        relativePath: input.audioRelativePath,
        schemaVersion: "math-speech-binary.v1",
        payloadKind: "binary",
        parentHashes: ttsParents,
        producedBy: "tts",
        producer: "educational-speech-pipeline",
        producerVersion: input.workflow.speechProfileVersion,
        identity,
      })
    );
  }
  const ttsOutputs = [...retainedTts, ...speechLineage];
  const ttsFingerprint = stageFingerprint("tts", ttsParents, {
    profile: input.workflow.speechProfile,
    profileVersion: input.workflow.speechProfileVersion,
    language: input.language,
    inputHash: input.workflow.inputHash,
    outputs: ttsOutputs.map((artifact) => ({
      path: artifact.relativePath,
      hash: artifact.contentHash,
    })),
  });
  const syncRelativePath = `locales/${input.language}/audio/educational-speech/presentation-sync.json`;
  let timingOutputs: MathArtifactLineage[] = [];
  let timingStatus: "succeeded" | "blocked" = "blocked";
  let timingError = "Speech generation did not complete.";
  if (input.workflow.status === "completed") {
    const sync = mathPresentationSyncSchema.parse(
      buildMathPresentationSync({ plan: input.plan, workflow: input.workflow })
    );
    await writeJsonAtomic(path.join(input.lessonRoot, syncRelativePath), sync);
    timingStatus = "succeeded";
    timingError = "";
  }
  const timingParents = [ttsFingerprint];
  const priorTiming = input.manifest.stages.find(
    (record) => record.stage === "timing-reflow"
  );
  const retainedTiming = await Promise.all(
    (priorTiming?.outputArtifacts ?? [])
      .filter(
        (artifact) =>
          !artifact.relativePath.startsWith(localePrefix(input.language))
      )
      .map((artifact) =>
        createArtifactLineage({
          root: input.lessonRoot,
          relativePath: artifact.relativePath,
          schemaVersion: artifact.schemaVersion,
          payloadKind: artifact.payloadKind,
          parentHashes: timingParents,
          producedBy: "timing-reflow",
          producer: artifact.producer,
          producerVersion: artifact.producerVersion,
          ...(artifact.identity ? { identity: artifact.identity } : {}),
        })
      )
  );
  if (timingStatus === "succeeded") {
    timingOutputs = [
      ...retainedTiming,
      await createArtifactLineage({
        root: input.lessonRoot,
        relativePath: syncRelativePath,
        schemaVersion: "math-presentation-sync.v1",
        parentHashes: timingParents,
        producedBy: "timing-reflow",
        producer: "chalkboard-speech-synchronizer",
        producerVersion: "chalkboard-speech-synchronizer.v1",
      }),
    ];
  }
  const timingFingerprint = stageFingerprint("timing-reflow", timingParents, {
    language: input.language,
    speechInputHash: input.workflow.inputHash,
    status: timingStatus,
    outputHashes: timingOutputs.map((artifact) => artifact.contentHash),
  });
  const replacements = new Map<MathStage, MathStageRecord>([
    [
      "tts",
      {
        stage: "tts" as const,
        status:
          input.workflow.status === "completed"
            ? ("succeeded" as const)
            : ("failed" as const),
        fingerprint: ttsFingerprint,
        parentFingerprints: ttsParents,
        outputArtifacts: ttsOutputs,
        updatedAt: now,
        ...(input.workflow.status === "completed"
          ? {}
          : { error: input.workflow.errors.join("; ") || "Speech generation failed." }),
      },
    ],
    [
      "timing-reflow",
      {
        stage: "timing-reflow" as const,
        status: timingStatus,
        fingerprint: timingFingerprint,
        parentFingerprints: timingParents,
        outputArtifacts: timingOutputs,
        updatedAt: now,
        ...(timingError ? { error: timingError } : {}),
      },
    ],
  ]);
  let previousFingerprint = timingFingerprint;
  for (const stage of MATH_STAGES.slice(MATH_STAGES.indexOf("render"))) {
    const parents = [previousFingerprint];
    const fingerprint = stageFingerprint(stage, parents, {
      invalidatedBy: "educational-speech-generate",
      language: input.language,
      speechInputHash: input.workflow.inputHash,
    });
    replacements.set(stage, {
      stage,
      status: "stale",
      fingerprint,
      parentFingerprints: parents,
      outputArtifacts: [],
      updatedAt: now,
      error: "Invalidated by educational speech generation.",
    });
    previousFingerprint = fingerprint;
  }
  const manifest = workflowManifestSchema.parse({
    ...input.manifest,
    paidProviderCalled:
      input.manifest.paidProviderCalled ||
      (input.workflow.provider === "openai-compatible" &&
        input.workflow.providerRequestCount > 0),
    stages: input.manifest.stages.map(
      (record) => replacements.get(record.stage) ?? record
    ),
    failures:
      input.workflow.status === "completed"
        ? input.manifest.failures
        : [
            ...input.manifest.failures,
            {
              stage: "tts" as const,
              category: "educational-speech",
              message:
                input.workflow.errors.join("; ") || "Speech generation failed.",
              retryable: false,
              attempts: Math.max(
                1,
                ...input.workflow.chunks.flatMap((chunk) =>
                  chunk.candidates.map((candidate) => candidate.attemptCount)
                )
              ),
              occurredAt: now,
            },
          ],
  });
  // Force a stable parse before atomically replacing the canonical manifest.
  canonicalHash(manifest);
  await saveWorkflowManifest(input.manifestPath, manifest);
  return manifest;
}
