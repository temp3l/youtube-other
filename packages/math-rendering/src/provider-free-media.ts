import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildFactLock,
  canonicalHash,
  canonicalJson,
  lessonVariantSpecificationSchema,
  localizedNarrationSchema,
  type ExactValue,
  type LessonVariantSpecification,
  type LocalizedNarration,
} from "@mediaforge/math-education";
import {
  hashFile,
  hashText,
  writeBinaryAtomic,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { generateLocalMockTts } from "./audio/mock-tts.js";
import { loadTeacherPose } from "./assets/teacher.js";
import {
  semanticMathComponentSchema,
  type SemanticMathComponent,
} from "./components/math-components.js";
import { cacheSemanticSvg } from "./components/svg-cache.js";
import { type MathSceneAsset } from "./composition/composition.js";
import { renderProviderFreeMathMedia } from "./composition/remotion-runner.js";

const teacherComponentSchema = z.strictObject({
  kind: z.literal("teacher"),
  poseId: z.string().min(1),
  areaRatio: z.number().positive().max(0.25),
});
const providerFreeSceneSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  component: z.union([semanticMathComponentSchema, teacherComponentSchema]),
});
export const providerFreeMediaRequestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  targetDurationSeconds: z.union([
    z.literal(180),
    z.literal(240),
    z.literal(300),
  ]),
  lesson: lessonVariantSpecificationSchema,
  narration: localizedNarrationSchema,
  scenes: z.array(providerFreeSceneSchema).length(9),
  teacherManifestPath: z.string().min(1).optional(),
  outputDir: z.string().min(1),
  browserExecutable: z.string().min(1).optional(),
});
export type ProviderFreeMediaRequest = z.infer<
  typeof providerFreeMediaRequestSchema
>;

interface ComponentFactBinding {
  factId: string;
  semantic: ExactValue;
}

const scalar = (
  expression: Extract<ExactValue, { kind: "scalar" }>["expression"]
): ExactValue => ({ kind: "scalar", expression });

function componentFactBindings(
  component: SemanticMathComponent
): ComponentFactBinding[] {
  switch (component.kind) {
    case "formula":
      return [
        {
          factId: component.value.factId,
          semantic: scalar(component.value.expression),
        },
      ];
    case "number-line":
      return [
        component.minimum,
        component.maximum,
        ...component.markers,
      ].map((value) => ({
        factId: value.factId,
        semantic: scalar(value.expression),
      }));
    case "graph":
      return [
        ...[
          component.xMinimum,
          component.xMaximum,
          component.yMinimum,
          component.yMaximum,
        ].map((value) => ({
          factId: value.factId,
          semantic: scalar(value.expression),
        })),
        ...component.points.map((point) => ({
          factId: point.factId,
          semantic: {
            kind: "tuple" as const,
            values: [scalar(point.x), scalar(point.y)],
          },
        })),
      ];
    case "geometry":
      return component.measurements.map((value) => ({
        factId: value.factId,
        semantic: scalar(value.expression),
      }));
    case "measurement":
      return component.measurements.map((measurement) => ({
        factId: measurement.factId,
        semantic: {
          kind: "measurement",
          value: measurement.value,
          unit: measurement.unit,
        },
      }));
    case "table":
      return component.rows.flatMap((row) =>
        row.map((value) => ({
          factId: value.factId,
          semantic: scalar(value.expression),
        }))
      );
    case "probability":
      return component.branches.map((branch) => ({
        factId: branch.probability.factId,
        semantic: scalar(branch.probability.expression),
      }));
  }
}

const factBindingInputSchema = z.strictObject({
  lesson: lessonVariantSpecificationSchema,
  narration: localizedNarrationSchema,
  scenes: z.array(providerFreeSceneSchema).length(9),
});

function exactList(values: readonly string[]): string {
  return values.join("\0");
}

export function assertProviderFreeFactBindings(raw: {
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
  scenes: ProviderFreeMediaRequest["scenes"];
}): void {
  const { lesson, narration, scenes } = factBindingInputSchema.parse(raw);
  const { contentHash, ...lessonContent } = lesson;
  if (contentHash !== canonicalHash(lessonContent))
    throw new Error("Provider-free media lesson content hash is invalid.");
  const lock = buildFactLock(lesson);
  if (
    narration.lessonId !== lesson.lessonId ||
    narration.variant !== lesson.variant ||
    narration.objectiveHash !== lock.objectiveHash ||
    narration.factLockHash !== lock.factLockHash
  )
    throw new Error("Provider-free media narration does not match its locked lesson.");

  const lessonFactIds = lesson.facts.map((fact) => fact.factId);
  const resolvedFactIds = narration.resolvedFacts.map((fact) => fact.factId);
  if (
    new Set(lessonFactIds).size !== lessonFactIds.length ||
    new Set(resolvedFactIds).size !== resolvedFactIds.length ||
    lessonFactIds.length !== resolvedFactIds.length ||
    lessonFactIds.some((factId) => !resolvedFactIds.includes(factId))
  )
    throw new Error(
      "Provider-free media fact coverage is missing, duplicated, or unexpected."
    );
  const lessonFacts = new Map(lesson.facts.map((fact) => [fact.factId, fact]));
  for (const resolved of narration.resolvedFacts) {
    const upstream = lessonFacts.get(resolved.factId);
    if (
      !upstream ||
      resolved.semanticHash !== canonicalHash(upstream.semantic)
    )
      throw new Error(
        `Narration fact ${resolved.factId} does not match locked lesson semantics.`
      );
  }

  if (
    new Set(lesson.scenes.map((scene) => scene.sceneId)).size !==
      lesson.scenes.length ||
    new Set(narration.segments.map((segment) => segment.segmentId)).size !==
      narration.segments.length ||
    new Set(narration.segments.map((segment) => segment.sceneId)).size !==
      narration.segments.length
  )
    throw new Error("Provider-free media scene or segment identities are duplicated.");

  for (const [index, scene] of scenes.entries()) {
    const lessonScene = lesson.scenes[index];
    const narrationSegment = narration.segments[index];
    if (
      !lessonScene ||
      !narrationSegment ||
      scene.sceneId !== lessonScene.sceneId ||
      scene.sceneId !== narrationSegment.sceneId ||
      lessonScene.sceneFunction !== narrationSegment.sceneFunction
    )
      throw new Error(`Media scene/narration/lesson mismatch at ${scene.sceneId}.`);
    if (
      new Set(lessonScene.factIds).size !== lessonScene.factIds.length ||
      exactList(lessonScene.factIds) !== exactList(narrationSegment.factIds)
    )
      throw new Error(
        `Scene ${scene.sceneId} fact membership is duplicated or differs from its locked narration.`
      );
    if (lessonScene.factIds.some((factId) => !lessonFacts.has(factId)))
      throw new Error(`Scene ${scene.sceneId} references an unknown lesson fact.`);
    if (scene.component.kind === "teacher") continue;

    const bindings = componentFactBindings(scene.component);
    const displayedIds = bindings.map((binding) => binding.factId);
    if (new Set(displayedIds).size !== displayedIds.length)
      throw new Error(`Scene ${scene.sceneId} displays a duplicate fact binding.`);
    for (const binding of bindings) {
      if (!lessonScene.factIds.includes(binding.factId))
        throw new Error(
          `Scene ${scene.sceneId} displays fact ${binding.factId} outside its locked scene.`
        );
      const upstream = lessonFacts.get(binding.factId);
      if (!upstream)
        throw new Error(
          `Scene ${scene.sceneId} displays missing fact ${binding.factId}.`
        );
      if (canonicalJson(binding.semantic) !== canonicalJson(upstream.semantic))
        throw new Error(
          `Scene ${scene.sceneId} fact ${binding.factId} has different exact semantics.`
        );
    }
  }
}

async function cacheTeacherSvg(args: {
  cacheDir: string;
  manifestPath: string;
  poseId: string;
  areaRatio: number;
}): Promise<MathSceneAsset> {
  const pose = await loadTeacherPose(
    args.manifestPath,
    args.poseId,
    args.areaRatio
  );
  const height = Math.sqrt((args.areaRatio * 1920 * 1080) / (2 / 3));
  const width = (2 / 3) * height;
  const x = 1824 - width;
  const y = 54 + (972 - height) / 2;
  const key = canonicalHash({
    kind: "teacher",
    poseHash: pose.sha256,
    areaRatio: args.areaRatio,
    renderer: "math-teacher-adapter.v1",
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" role="img" data-component="teacher" data-cache-key="${key}"><rect width="1920" height="1080" fill="#f8fafc"/><image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml;base64,${Buffer.from(pose.svg, "utf8").toString("base64")}"/></svg>`;
  const svgHash = hashText(svg);
  const svgPath = path.join(args.cacheDir, `${key}.svg`);
  await fs.mkdir(args.cacheDir, { recursive: true });
  if ((await hashFile(svgPath).catch(() => null)) !== svgHash)
    await writeBinaryAtomic(svgPath, Buffer.from(svg, "utf8"));
  return {
    sceneId: "scene-000",
    svgPath,
    svgHash,
    minimumGlyphPx: 72,
    bounds: { x: 96, y: 54, width: 1728, height: 972 },
    teacher: { poseId: args.poseId, areaRatio: args.areaRatio },
  };
}

export async function createProviderFreeMediaSlice(
  raw: ProviderFreeMediaRequest
) {
  const request = providerFreeMediaRequestSchema.parse(raw);
  const outputDir = path.resolve(request.outputDir);
  const visualCacheDir = path.join(outputDir, "visual-cache");
  const narration: LocalizedNarration = request.narration;
  assertProviderFreeFactBindings({
    lesson: request.lesson,
    narration,
    scenes: request.scenes,
  });
  for (const scene of request.scenes)
    if (scene.component.kind === "teacher" && !request.teacherManifestPath)
      throw new Error(
        `Teacher scene ${scene.sceneId} requires a teacher manifest.`
      );
  const scenes: MathSceneAsset[] = [];
  for (const [index, scene] of request.scenes.entries()) {
    const narrationSegment = narration.segments[index];
    if (!narrationSegment || narrationSegment.sceneId !== scene.sceneId)
      throw new Error(`Media scene/narration mismatch at ${scene.sceneId}.`);
    if (scene.component.kind === "teacher") {
      const asset = await cacheTeacherSvg({
        cacheDir: visualCacheDir,
        manifestPath: request.teacherManifestPath!,
        poseId: scene.component.poseId,
        areaRatio: scene.component.areaRatio,
      });
      scenes.push({ ...asset, sceneId: scene.sceneId });
      continue;
    }
    const cached = await cacheSemanticSvg(visualCacheDir, scene.component);
    scenes.push({
      sceneId: scene.sceneId,
      svgPath: cached.filePath,
      svgHash: cached.svgHash,
      minimumGlyphPx: cached.minimumGlyphPx,
      bounds: { x: 96, y: 54, width: 1728, height: 972 },
    });
  }
  const { artifact: audio, timing } = await generateLocalMockTts({
    narration,
    targetDurationSeconds: request.targetDurationSeconds,
    outputDir: path.join(outputDir, "audio"),
  });
  const outputPath = path.join(outputDir, "video.mp4");
  const render = await renderProviderFreeMathMedia({
    id: request.id,
    timing,
    profile: request.profile,
    scenes,
    audioPath: audio.masterAudioPath,
    outputPath,
    workDir: path.join(outputDir, ".render-work"),
    ...(request.browserExecutable
      ? { browserExecutable: request.browserExecutable }
      : {}),
  });
  await writeJsonAtomic(path.join(outputDir, "timing.json"), timing);
  await writeJsonAtomic(
    path.join(outputDir, "final-media-validation.json"),
    render.validation
  );
  const manifestContent = {
    artifactVersion: "math-provider-free-media.v1" as const,
    paidProviderCalled: false as const,
    narrationHash: narration.contentHash,
    timingHash: canonicalHash(timing),
    audioHash: audio.masterAudioSha256,
    sceneHashes: scenes.map((scene) => scene.svgHash),
    videoPath: outputPath,
    videoHash: await hashFile(outputPath),
    renderFingerprint: render.renderFingerprint,
    validation: render.validation,
  };
  const manifest = {
    ...manifestContent,
    contentHash: canonicalHash(manifestContent),
  };
  await writeJsonAtomic(path.join(outputDir, "render.json"), manifest);
  return { manifest, audio, timing, scenes, validation: render.validation };
}
