import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildFactLock,
  canonicalHash,
  canonicalJson,
  lessonVariantSpecificationSchema,
  loadWorkflowManifest,
  localizedNarrationSchema,
  mathVisualPlanSchema,
  readAuthoritativeStageArtifact,
  type MathLanguage,
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
import { loadTeacherManifest, loadTeacherPose } from "./assets/teacher.js";
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
  component: semanticMathComponentSchema,
  teacher: teacherComponentSchema.omit({ kind: true }).optional(),
});
export const providerFreeMediaRequestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  targetDurationSeconds: z.union([
    z.literal(180),
    z.literal(240),
    z.literal(300),
  ]),
  lessonRoot: z.string().min(1),
  lessonId: z.string().min(1),
  variant: z.enum(["foundation", "standard", "challenge"]),
  language: z.enum(["de", "en", "es", "fr", "pt"]),
  scenes: z.array(providerFreeSceneSchema).length(9),
  teacherManifestPath: z.string().min(1).optional(),
  outputDir: z.string().min(1),
  browserExecutable: z.string().min(1).optional(),
  mediaScope: z.literal("private-simulation").default("private-simulation"),
  visualStrategy: z.literal("static-board").default("static-board"),
});
export type ProviderFreeMediaRequest = z.input<
  typeof providerFreeMediaRequestSchema
>;

type MathVisualPlan = z.infer<typeof mathVisualPlanSchema>;

export function createMathCaption(text: string): {
  text: string;
  lines: string[];
  fontSizePx: 48;
} {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0 || normalized.length > 180)
    throw new Error(
      "Caption text is empty or exceeds the readable overlay budget."
    );
  const lines: string[] = [];
  let current = "";
  for (const word of normalized.split(" ")) {
    if (word.length > 60)
      throw new Error(
        "Caption contains a word wider than the readable overlay budget."
      );
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 60) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0 || lines.length > 3)
    throw new Error("Caption overflow exceeds three readable lines.");
  return { text: normalized, lines, fontSizePx: 48 };
}

export async function assertSafeMediaOutputDirectory(
  outputDir: string
): Promise<void> {
  let cursor = path.resolve(outputDir);
  while (true) {
    const stat = await fs.lstat(cursor).catch(() => null);
    if (stat) {
      if (stat.isSymbolicLink())
        throw new Error(
          `Unsafe media output path contains a symlink: ${cursor}`
        );
      if (!stat.isDirectory())
        throw new Error(`Media output ancestor is not a directory: ${cursor}`);
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export async function loadProviderFreeMediaInputs(
  request: ProviderFreeMediaRequest
): Promise<{
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
  visualPlan: MathVisualPlan;
}> {
  const lessonRoot = path.resolve(request.lessonRoot);
  const manifest = await loadWorkflowManifest(
    path.join(lessonRoot, "manifest.json")
  );
  if (!manifest || manifest.lessonId !== request.lessonId)
    throw new Error(
      "Provider-free media requires the lesson's authoritative workflow manifest."
    );
  const lesson = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "lesson-spec",
    relativePath: "canonical/lesson-spec.json",
    schemaVersion: "lesson-spec.v1",
    schema: lessonVariantSpecificationSchema,
  });
  const language: MathLanguage = request.language;
  const narration = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: language === "de" ? "canonical-narration" : "localization",
    relativePath:
      language === "de"
        ? "canonical/narration.de.json"
        : `locales/${language}/narration.json`,
    schemaVersion: "math-narration.v2",
    schema: localizedNarrationSchema,
  });
  const visualPlan = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "visual-assets",
    relativePath: `locales/${language}/visual-plan.json`,
    schemaVersion: "math-visual-plan.v1",
    schema: mathVisualPlanSchema,
  });
  if (
    lesson.lessonId !== request.lessonId ||
    lesson.variant !== request.variant ||
    lesson.targetDurationSeconds !== request.targetDurationSeconds ||
    narration.language !== language ||
    visualPlan.profile !== request.profile
  )
    throw new Error(
      "Authoritative media artifacts do not match the requested lesson identity."
    );
  return { lesson, narration, visualPlan };
}

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
      return [component.minimum, component.maximum, ...component.markers].map(
        (value) => ({
          factId: value.factId,
          semantic: scalar(value.expression),
        })
      );
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
    case "bar-chart":
      return [
        ...[
          component.axis.origin,
          component.axis.maximum,
          component.axis.tickInterval,
        ].map((value) => ({
          factId: value.factId,
          semantic: scalar(value.expression),
        })),
        ...component.bars.flatMap((bar) => [
          {
            factId: bar.categoryFactId,
            semantic: scalar(bar.value.expression),
          },
          { factId: bar.value.factId, semantic: scalar(bar.value.expression) },
        ]),
      ];
    case "probability":
      return component.branches.map((branch) => ({
        factId: branch.probability.factId,
        semantic: scalar(branch.probability.expression),
      }));
    case "lesson-board":
      return [];
    case "fact-stack":
      return component.facts.map((fact) => ({
        factId: fact.factId,
        semantic:
          fact.kind === "scalar"
            ? scalar(fact.expression)
            : {
                kind: "measurement" as const,
                value: fact.value,
                unit: fact.unit,
              },
      }));
    case "place-value-chart":
      return [
        {
          factId: component.source.factId,
          semantic: scalar(component.source.expression),
        },
      ];
    case "place-value-activity":
      return component.values.map((value) => ({
        factId: value.factId,
        semantic: scalar(value.expression),
      }));
    case "number-line-focus":
      return [
        {
          factId: component.focus.factId,
          semantic: scalar(component.focus.expression),
        },
      ];
    case "tally-table":
      return [
        {
          factId: component.dataset.factId,
          semantic: scalar(component.dataset.expression),
        },
        ...component.rows.map((row) => ({
          factId: row.count.factId,
          semantic: scalar(row.count.expression),
        })),
      ];
  }
}

const factBindingInputSchema = z.strictObject({
  lesson: lessonVariantSpecificationSchema,
  narration: localizedNarrationSchema,
  scenes: z.array(providerFreeSceneSchema).length(9),
  visualPlan: mathVisualPlanSchema,
});

function exactList(values: readonly string[]): string {
  return values.join("\0");
}

export function assertProviderFreeFactBindings(raw: {
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
  scenes: ProviderFreeMediaRequest["scenes"];
  visualPlan: MathVisualPlan;
}): void {
  const { lesson, narration, scenes, visualPlan } =
    factBindingInputSchema.parse(raw);
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
    throw new Error(
      "Provider-free media narration does not match its locked lesson."
    );

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
    if (!upstream || resolved.semanticHash !== canonicalHash(upstream.semantic))
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
    throw new Error(
      "Provider-free media scene or segment identities are duplicated."
    );

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
      throw new Error(
        `Media scene/narration/lesson mismatch at ${scene.sceneId}.`
      );
    if (
      new Set(lessonScene.factIds).size !== lessonScene.factIds.length ||
      exactList(lessonScene.factIds) !== exactList(narrationSegment.factIds)
    )
      throw new Error(
        `Scene ${scene.sceneId} fact membership is duplicated or differs from its locked narration.`
      );
    if (lessonScene.factIds.some((factId) => !lessonFacts.has(factId)))
      throw new Error(
        `Scene ${scene.sceneId} references an unknown lesson fact.`
      );
    const bindings = componentFactBindings(scene.component);
    const displayedIds = bindings.map((binding) => binding.factId);
    if (new Set(displayedIds).size !== displayedIds.length)
      throw new Error(
        `Scene ${scene.sceneId} displays a duplicate fact binding.`
      );
    if (exactList(displayedIds) !== exactList(lessonScene.factIds))
      throw new Error(
        `Scene ${scene.sceneId} must display every locked fact exactly once and no extras.`
      );
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
    const planned = visualPlan.scenes[index]!;
    if (
      planned.sceneId !== scene.sceneId ||
      exactList(planned.factIds) !== exactList(lessonScene.factIds) ||
      exactList(planned.factIds) !== exactList(narrationSegment.factIds) ||
      exactList(planned.factIds) !== exactList(displayedIds)
    )
      throw new Error(
        `Scene ${scene.sceneId} differs from its authoritative visual plan.`
      );
    const compatibleKinds: Record<
      MathVisualPlan["scenes"][number]["component"],
      readonly SemanticMathComponent["kind"][]
    > = {
      formula: [
        "formula",
        "fact-stack",
        "lesson-board",
        "place-value-activity",
      ],
      "place-value-chart": [
        "table",
        "place-value-chart",
        "place-value-activity",
      ],
      "fraction-model": ["formula", "number-line"],
      "number-line": [
        "number-line",
        "number-line-focus",
        "place-value-activity",
      ],
      "coordinate-plane": ["graph"],
      "function-graph": ["graph"],
      geometry: ["geometry"],
      measurement: ["measurement"],
      "data-table": ["table", "tally-table"],
      "bar-chart": ["bar-chart"],
      "probability-tree": ["probability"],
      teacher: [
        "formula",
        "fact-stack",
        "lesson-board",
        "place-value-activity",
      ],
    };
    if (!compatibleKinds[planned.component].includes(scene.component.kind))
      throw new Error(
        `Scene ${scene.sceneId} component is incompatible with its visual plan.`
      );
    if ((planned.component === "teacher") !== Boolean(scene.teacher))
      throw new Error(
        `Scene ${scene.sceneId} teacher overlay differs from its visual plan.`
      );
  }
}

async function cacheTeacherSvg(args: {
  cacheDir: string;
  manifestPath: string;
  poseId: string;
  areaRatio: number;
  base: Awaited<ReturnType<typeof cacheSemanticSvg>>;
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
    baseSvgHash: args.base.svgHash,
    renderer: "math-teacher-overlay.v2",
  });
  const svg = args.base.svg.replace(
    "</svg>",
    `<image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml;base64,${Buffer.from(pose.svg, "utf8").toString("base64")}"/></svg>`
  );
  const svgHash = hashText(svg);
  const svgPath = path.join(args.cacheDir, `${key}.svg`);
  await fs.mkdir(args.cacheDir, { recursive: true });
  if ((await hashFile(svgPath).catch(() => null)) !== svgHash)
    await writeBinaryAtomic(svgPath, Buffer.from(svg, "utf8"));
  return {
    sceneId: "scene-000",
    svgPath,
    svgHash,
    minimumGlyphPx: args.base.minimumGlyphPx,
    bounds: {
      x: Math.min(args.base.bounds.x, x),
      y: Math.min(args.base.bounds.y, y),
      width:
        Math.max(args.base.bounds.x + args.base.bounds.width, x + width) -
        Math.min(args.base.bounds.x, x),
      height:
        Math.max(args.base.bounds.y + args.base.bounds.height, y + height) -
        Math.min(args.base.bounds.y, y),
    },
    teacher: { poseId: args.poseId, areaRatio: args.areaRatio },
  };
}

export async function createProviderFreeMediaSlice(
  raw: ProviderFreeMediaRequest
) {
  const request = providerFreeMediaRequestSchema.parse(raw);
  const outputDir = path.resolve(request.outputDir);
  await assertSafeMediaOutputDirectory(outputDir);
  const visualCacheDir = path.join(outputDir, "visual-cache");
  const { lesson, narration, visualPlan } =
    await loadProviderFreeMediaInputs(request);
  assertProviderFreeFactBindings({
    lesson,
    narration,
    scenes: request.scenes,
    visualPlan,
  });
  for (const scene of request.scenes)
    if (scene.teacher && !request.teacherManifestPath)
      throw new Error(
        `Teacher scene ${scene.sceneId} requires a teacher manifest.`
      );
  const teacherManifest = request.teacherManifestPath
    ? await loadTeacherManifest(request.teacherManifestPath)
    : null;
  if (
    teacherManifest?.assetVersion === "alex.v1-placeholder" &&
    request.mediaScope !== "private-simulation"
  )
    throw new Error(
      "Placeholder teacher artwork is restricted to private simulation media."
    );
  const scenes: MathSceneAsset[] = [];
  for (const [index, scene] of request.scenes.entries()) {
    const narrationSegment = narration.segments[index];
    if (!narrationSegment || narrationSegment.sceneId !== scene.sceneId)
      throw new Error(`Media scene/narration mismatch at ${scene.sceneId}.`);
    const cached = await cacheSemanticSvg(visualCacheDir, scene.component);
    const caption = createMathCaption(narrationSegment.displayText);
    if (scene.teacher) {
      const asset = await cacheTeacherSvg({
        cacheDir: visualCacheDir,
        manifestPath: request.teacherManifestPath!,
        poseId: scene.teacher.poseId,
        areaRatio: scene.teacher.areaRatio,
        base: cached,
      });
      scenes.push({ ...asset, sceneId: scene.sceneId, caption });
      continue;
    }
    scenes.push({
      sceneId: scene.sceneId,
      svgPath: cached.filePath,
      svgHash: cached.svgHash,
      minimumGlyphPx: cached.minimumGlyphPx,
      bounds: cached.bounds,
      caption,
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
    identity: {
      lessonId: lesson.lessonId,
      skillId: lesson.skillId,
      language: narration.language,
      variant: lesson.variant,
    },
    publication: {
      scope: request.mediaScope,
      publishReady: false as const,
      blockers:
        teacherManifest?.assetVersion === "alex.v1-placeholder"
          ? ["placeholder-teacher-artwork-not-approved-for-public-release"]
          : ["private-simulation-media-not-approved-for-public-release"],
    },
    visualStrategy: {
      requested: request.visualStrategy,
      rendered: "static-board" as const,
      silentlyDowngraded: false as const,
    },
    timingHash: canonicalHash(timing),
    audioHash: audio.masterAudioSha256,
    audioDurationSeconds: audio.durationSeconds,
    sceneHashes: scenes.map((scene) => scene.svgHash),
    orderedSceneIds: scenes.map((scene) => scene.sceneId),
    captionHash: canonicalHash(scenes.map((scene) => scene.caption)),
    captionCount: scenes.filter((scene) => scene.caption).length,
    frameCount: timing.scenes.at(-1)?.endFrame ?? 0,
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
