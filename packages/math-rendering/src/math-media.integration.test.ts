import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertTimingSynchronization,
  buildLessonVariant,
  canonicalHash,
  createArtifactLineage,
  lessonVariantSpecificationSchema,
  loadCurriculumRelease,
  localizeNarration,
  localizedNarrationSchema,
  MATH_STAGES,
  saveWorkflowManifest,
  type LessonVariantSpecification,
  type LocalizedNarration,
} from "@mediaforge/math-education";
import { runCommand } from "@mediaforge/process-runner";
import { generateLocalMockTts } from "./audio/mock-tts.js";
import { cacheSemanticSvg } from "./components/svg-cache.js";
import { renderLocalRemotionVideo } from "./composition/remotion-runner.js";
import { createProviderFreeMediaSlice } from "./provider-free-media.js";
import { validateMathMediaFile } from "./quality/media-qa.js";

const fixedHash = "b".repeat(64);

function narrationFixture(): LocalizedNarration {
  const resolvedFacts = Array.from({ length: 9 }, (_, index) => ({
    factId: `media-fact-${index + 1}`,
    semanticHash: fixedHash,
    display: String(index + 1),
    spoken: String(index + 1),
    latex: String(index + 1),
  }));
  const content = {
    artifactVersion: "math-narration.v2" as const,
    language: "de" as const,
    region: "DE" as const,
    lessonId: "m5-media-001-standard",
    variant: "standard" as const,
    objectiveHash: fixedHash,
    factLockHash: fixedHash,
    glossaryVersion: "math-glossary.v1" as const,
    glossaryHash: fixedHash,
    resolvedFacts,
    segments: resolvedFacts.map((fact, index) => ({
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction:
        index === 6 ? "think-pause" : index === 7 ? "solution" : "model",
      tokenizedText: `Erkläre [[fact:${fact.factId}]].`,
      displayText: `Erkläre ${fact.display}.`,
      spokenText: `Erkläre den geprüften Wert ${fact.spoken} verständlich.`,
      factIds: [fact.factId],
    })),
  };
  return localizedNarrationSchema.parse({
    ...content,
    contentHash: canonicalHash(content),
  });
}

async function providerBoundaryFixture(root: string): Promise<{
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
  lessonRoot: string;
}> {
  const release = await loadCurriculumRelease(
    "packages/math-education/data/curriculum/v1"
  );
  const base = buildLessonVariant(
    release.skills.find((skill) => skill.skillId === "M5-ZO-001")!,
    "standard"
  );
  const fallbackFact = base.facts.find(
    (fact) => fact.semantic.kind === "scalar"
  );
  if (!fallbackFact) throw new Error("Boundary fixture requires a scalar fact.");
  const { contentHash: _contentHash, ...baseContent } = base;
  const draft = {
    ...baseContent,
    scenes: base.scenes.map((scene) => ({
      ...scene,
      visualComponent: scene.sceneFunction === "think-pause" ? "teacher" as const : "formula" as const,
      factIds:
        scene.factIds.length > 0 ? scene.factIds : [fallbackFact.factId],
    })),
  };
  const lesson = lessonVariantSpecificationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
  const narration = localizeNarration(lesson, "de");
  const lessonRoot = path.join(root, lesson.lessonId);
  const values = [
    { relativePath: "canonical/lesson-spec.json", value: lesson, schemaVersion: "lesson-spec.v1" as const, producedBy: "lesson-spec" as const },
    { relativePath: "canonical/narration.de.json", value: narration, schemaVersion: "math-narration.v2" as const, producedBy: "canonical-narration" as const },
    { relativePath: "locales/de/visual-plan.json", value: {
      artifactVersion: "math-visual-plan.v1",
      profile: "grades-5-7-v1",
      scenes: lesson.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        component: scene.visualComponent,
        factIds: scene.factIds,
        teacherAssetVersion: "alex.v1-placeholder",
      })),
    }, schemaVersion: "math-visual-plan.v1" as const, producedBy: "visual-assets" as const },
  ];
  for (const entry of values) {
    const target = path.join(lessonRoot, entry.relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(entry.value));
  }
  const parent = "a".repeat(64);
  const artifacts = await Promise.all(values.map((entry) => createArtifactLineage({
    root: lessonRoot,
    relativePath: entry.relativePath,
    schemaVersion: entry.schemaVersion,
    parentHashes: [parent],
    producedBy: entry.producedBy,
  })));
  await saveWorkflowManifest(path.join(lessonRoot, "manifest.json"), {
    artifactVersion: "math-workflow.v2",
    lessonId: lesson.lessonId,
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage) => {
      const outputArtifacts = artifacts.filter((artifact) => artifact.producedBy === stage);
      return { stage, status: outputArtifacts.length ? "succeeded" as const : "planned" as const, fingerprint: canonicalHash({ stage }), parentFingerprints: [parent], outputArtifacts, updatedAt: new Date(0).toISOString() };
    }),
    failures: [],
  });
  return { lesson, narration, lessonRoot };
}

describe("provider-free math media integration", () => {
  it("creates cached mock speech, performs a local Remotion render, and rejects corrupt media", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-media-r007-"));
    try {
      const firstAudio = await generateLocalMockTts({
        narration: narrationFixture(),
        targetDurationSeconds: 180,
        outputDir: path.join(root, "audio"),
      });
      expect(firstAudio.artifact.paidProviderCalled).toBe(false);
      expect(firstAudio.artifact.segments).toHaveLength(9);
      expect(firstAudio.timing.durationSeconds).toBe(180);
      const secondAudio = await generateLocalMockTts({
        narration: narrationFixture(),
        targetDurationSeconds: 180,
        outputDir: path.join(root, "audio"),
      });
      expect(
        secondAudio.artifact.segments.every((segment) => segment.cacheHit)
      ).toBe(true);
      expect(secondAudio.artifact.masterAudioSha256).toBe(
        firstAudio.artifact.masterAudioSha256
      );

      const oneSecondAudio = path.join(root, "one-second.wav");
      await runCommand(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          firstAudio.artifact.masterAudioPath,
          "-t",
          "1",
          "-c:a",
          "pcm_s16le",
          oneSecondAudio,
        ],
        { timeoutMs: 30_000 }
      );
      const visual = await cacheSemanticSvg(path.join(root, "visual-cache"), {
        kind: "formula",
        value: {
          factId: "media-fact-1",
          expression: {
            kind: "relation",
            operator: "eq",
            left: { kind: "integer", value: "2" },
            right: { kind: "integer", value: "2" },
          },
        },
      });
      const outputPath = path.join(root, "small-remotion.mp4");
      const render = await renderLocalRemotionVideo({
        durationInFrames: 30,
        scenes: [
          {
            sceneId: "scene-001",
            svgPath: visual.filePath,
            svgHash: visual.svgHash,
            minimumGlyphPx: visual.minimumGlyphPx,
            bounds: visual.bounds,
          },
        ],
        frameRanges: [{ sceneId: "scene-001", startFrame: 0, endFrame: 30 }],
        audioPath: oneSecondAudio,
        outputPath,
        workDir: path.join(root, "render-work"),
        validationDurationRange: { minimum: 0.9, maximum: 1.1 },
      });
      expect(render.renderFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(render.validation).toMatchObject({
        valid: true,
        width: 1920,
        height: 1080,
        fps: 30,
        continuityChecked: true,
        corruptionScanPassed: true,
      });
      expect(render.validation.videoCodec).toBe("h264");
      expect(render.validation.audioCodec).toBe("aac");

      const corruptPath = path.join(root, "corrupt.mp4");
      await fs.copyFile(outputPath, corruptPath);
      await fs.truncate(corruptPath, 128);
      const corrupt = await validateMathMediaFile(corruptPath, {
        minimumDurationSeconds: 0.9,
        maximumDurationSeconds: 1.1,
      });
      expect(corrupt.valid).toBe(false);
      expect(corrupt.issues.join(" ")).toMatch(
        /probe failed|corrupt|moov|Invalid/u
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 300_000);

  it("renders the inclusive 180-second provider-free production boundary", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-media-r007-boundary-")
    );
    const { lesson, narration, lessonRoot } = await providerBoundaryFixture(root);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("External network dispatch is forbidden."));
    try {
      const result = await createProviderFreeMediaSlice({
        id: `${lesson.lessonId}-de`,
        profile: "grades-5-7-v1",
        targetDurationSeconds: 180,
        lessonRoot,
        lessonId: lesson.lessonId,
        variant: lesson.variant,
        language: "de",
        scenes: lesson.scenes.map((scene) => {
          const fact = lesson.facts.find(
            (candidate) => candidate.factId === scene.factIds[0]
          );
          if (!fact || fact.semantic.kind !== "scalar")
            throw new Error(`Boundary fixture is missing ${scene.sceneId}.`);
          return {
            sceneId: scene.sceneId,
            component: {
              kind: "formula" as const,
              value: {
                factId: fact.factId,
                expression: fact.semantic.expression,
              },
            },
            ...(scene.visualComponent === "teacher"
              ? { teacher: { poseId: "think", areaRatio: 0.2 } }
              : {}),
          };
        }),
        teacherManifestPath: "assets/math-teacher/alex/v1/manifest.json",
        outputDir: root,
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.manifest.paidProviderCalled).toBe(false);
      expect(result.audio.paidProviderCalled).toBe(false);
      expect(result.timing.durationSeconds).toBe(180);
      expect(result.timing.scenes[0]?.startFrame).toBe(0);
      expect(result.timing.scenes.at(-1)?.endFrame).toBe(5_400);
      expect(() =>
        assertTimingSynchronization(
          result.timing,
          result.audio.segments.map((segment) => ({
            segmentId: segment.segmentId,
            sceneId: segment.sceneId,
            durationSeconds: segment.durationSeconds,
          })),
          narration.segments.map((segment) => segment.factIds.length)
        )
      ).not.toThrow();
      expect(result.validation).toMatchObject({
        valid: true,
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        continuityChecked: true,
        corruptionScanPassed: true,
      });
      expect(result.validation.durationSeconds).toBeCloseTo(180, 1);
      expect((await fs.stat(result.manifest.videoPath)).size).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 1_200_000);
});
