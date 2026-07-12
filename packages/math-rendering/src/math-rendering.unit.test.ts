import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLessonVariant,
  canonicalHash,
  lessonVariantSpecificationSchema,
  loadCurriculumRelease,
  localizeNarration,
  localizedNarrationSchema,
  type LessonVariantSpecification,
  type LocalizedNarration,
} from "@mediaforge/math-education";
import {
  assertTimingSynchronization,
  createNarrationDrivenTiming,
  timingManifestSchema,
  type NarrationAudioTiming,
} from "../../math-education/src/lesson/timing.js";
import { loadTeacherPose, validateTeacherAssets } from "./assets/teacher.js";
import {
  Formula,
  renderSemanticComponent,
  type BoundMathValue,
  type SemanticMathComponent,
} from "./components/math-components.js";
import { cacheSemanticSvg } from "./components/svg-cache.js";
import {
  createMathComposition,
  createReadyMathComposition,
  type MathSceneAsset,
} from "./composition/composition.js";
import { createRemotionRenderFingerprint } from "./composition/remotion-runner.js";
import {
  assertProviderFreeFactBindings,
  type ProviderFreeMediaRequest,
} from "./provider-free-media.js";
import {
  grades57Profile,
  grades810Profile,
  validateMathLayout,
  validateSafeAreaAndReadability,
} from "./profiles/profiles.js";
import {
  assertMathMediaReady,
  findPacketContinuityIssues,
} from "./quality/media-qa.js";

const hash = "a".repeat(64);
const integer = (factId: string, value: string): BoundMathValue => ({
  factId,
  expression: { kind: "integer", value },
});

function narration(): LocalizedNarration {
  const resolvedFacts = Array.from({ length: 9 }, (_, index) => ({
    factId: `fact-${index + 1}`,
    semanticHash: hash,
    display: String(index + 1),
    spoken: String(index + 1),
    latex: String(index + 1),
  }));
  const content = {
    artifactVersion: "math-narration.v2" as const,
    language: "de" as const,
    region: "DE" as const,
    lessonId: "m5-test-001-standard",
    variant: "standard" as const,
    objectiveHash: hash,
    factLockHash: hash,
    glossaryVersion: "math-glossary.v1" as const,
    glossaryHash: hash,
    resolvedFacts,
    segments: resolvedFacts.map((fact, index) => ({
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sceneFunction:
        index === 6 ? "think-pause" : index === 7 ? "solution" : "model",
      tokenizedText: `Wert [[fact:${fact.factId}]].`,
      displayText: `Wert ${fact.display}.`,
      spokenText: `Wert ${fact.spoken}.`,
      factIds: [fact.factId],
    })),
  };
  return localizedNarrationSchema.parse({
    ...content,
    contentHash: canonicalHash(content),
  });
}

function audio(duration = 20): NarrationAudioTiming[] {
  return narration().segments.map((segment) => ({
    segmentId: segment.segmentId,
    sceneId: segment.sceneId,
    durationSeconds: duration,
  }));
}

function audioForTotal(durationSeconds: 180 | 300): NarrationAudioTiming[] {
  const localized = narration();
  const commonDuration = Math.floor(durationSeconds / 9);
  return localized.segments.map((segment, index) => ({
    segmentId: segment.segmentId,
    sceneId: segment.sceneId,
    durationSeconds:
      index === localized.segments.length - 1
        ? durationSeconds - commonDuration * 8
        : commonDuration,
  }));
}

async function factBindingFixture(): Promise<{
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
  scenes: ProviderFreeMediaRequest["scenes"];
}> {
  const release = await loadCurriculumRelease(
    "packages/math-education/data/curriculum/v1"
  );
  const base = buildLessonVariant(
    release.skills.find((skill) => skill.skillId === "M5-ZO-001")!,
    "standard"
  );
  const scalarSemantic = (value: string) => ({
    kind: "scalar" as const,
    expression: { kind: "integer" as const, value },
  });
  const measurementSemantic = {
    kind: "measurement" as const,
    value: { kind: "integer" as const, value: "8" },
    unit: {
      symbol: "cm",
      scale: { numerator: "1", denominator: "100" },
      dimensions: { length: 1 },
    },
  };
  const graphFacts = [
    { factId: "graph-x-min", semantic: scalarSemantic("0") },
    { factId: "graph-x-max", semantic: scalarSemantic("10") },
    { factId: "graph-y-min", semantic: scalarSemantic("0") },
    { factId: "graph-y-max", semantic: scalarSemantic("10") },
    {
      factId: "graph-point",
      semantic: {
        kind: "tuple" as const,
        values: [scalarSemantic("2"), scalarSemantic("4")],
      },
    },
  ];
  const addedFacts = [
    {
      factId: "rendered-measurement",
      semantic: measurementSemantic,
      displayLatex: "8\\,\\mathrm{cm}",
      checkIds: ["check-rendered-measurement"],
    },
    ...graphFacts.map((fact) => ({
      ...fact,
      displayLatex: fact.factId === "graph-point" ? "(2,4)" : fact.semantic.kind === "scalar" ? fact.semantic.expression.value : "",
      checkIds: [`check-${fact.factId}`],
    })),
  ];
  const addedChecks: LessonVariantSpecification["checks"] = [
    {
      checkId: "check-rendered-measurement",
      kind: "unit-dimension",
      expression: measurementSemantic.value,
      expected: measurementSemantic,
      actualUnit: measurementSemantic.unit,
      critical: true,
    },
    ...graphFacts.map((fact) => ({
      checkId: `check-${fact.factId}`,
      kind: "display-fact" as const,
      expression:
        fact.semantic.kind === "scalar"
          ? fact.semantic.expression
          : {
              kind: "tuple" as const,
              items: fact.semantic.values.map((value) => value.expression),
            },
      expected: fact.semantic,
      critical: true,
    })),
  ];
  const { contentHash: _contentHash, ...baseContent } = base;
  const draft = {
    ...baseContent,
    facts: [...base.facts, ...addedFacts],
    checks: [...base.checks, ...addedChecks],
    scenes: base.scenes.map((scene, index) =>
      index === 0
        ? { ...scene, factIds: ["rendered-measurement"] }
        : index === 1
          ? { ...scene, factIds: graphFacts.map((fact) => fact.factId) }
          : scene
    ),
  };
  const lesson = lessonVariantSpecificationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
  const localized = localizeNarration(lesson, "de");
  const scenes = lesson.scenes.map(
    (scene, index): ProviderFreeMediaRequest["scenes"][number] => {
      if (index === 0)
        return {
          sceneId: scene.sceneId,
          component: {
            kind: "measurement",
            measurements: [
              {
                factId: "rendered-measurement",
                value: measurementSemantic.value,
                unit: measurementSemantic.unit,
              },
            ],
          },
        };
      if (index === 1)
        return {
          sceneId: scene.sceneId,
          component: {
            kind: "graph",
            xMinimum: integer("graph-x-min", "0"),
            xMaximum: integer("graph-x-max", "10"),
            yMinimum: integer("graph-y-min", "0"),
            yMaximum: integer("graph-y-max", "10"),
            points: [
              {
                factId: "graph-point",
                x: { kind: "integer", value: "2" },
                y: { kind: "integer", value: "4" },
              },
            ],
          },
        };
      const fact = lesson.facts.find(
        (candidate) => candidate.factId === scene.factIds[0]
      );
      if (!fact || fact.semantic.kind !== "scalar")
        throw new Error(`Missing scalar fixture fact for ${scene.sceneId}.`);
      return {
        sceneId: scene.sceneId,
        component: {
          kind: "formula",
          value: {
            factId: fact.factId,
            expression: fact.semantic.expression,
          },
        },
      };
    }
  );
  return { lesson, narration: localized, scenes };
}

function boundaryTiming(durationSeconds: number) {
  const totalFrames = durationSeconds * 30;
  const perScene = Math.floor(totalFrames / 9);
  let cursor = 0;
  return {
    artifactVersion: "math-timing.v1" as const,
    fps: 30 as const,
    durationSeconds,
    scenes: Array.from({ length: 9 }, (_, index) => {
      const startFrame = cursor;
      const endFrame = index === 8 ? totalFrames : startFrame + perScene;
      cursor = endFrame;
      return {
        sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
        startFrame,
        endFrame,
        segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
        cueFrames: [],
      };
    }),
  };
}

describe("semantic math visual contracts", () => {
  it("renders every required semantic family with fact-bound values and stable hashes", () => {
    const inputs: SemanticMathComponent[] = [
      { kind: "formula", value: integer("formula-value", "12") },
      {
        kind: "number-line",
        minimum: integer("line-min", "0"),
        maximum: integer("line-max", "10"),
        markers: [integer("line-point", "4")],
      },
      {
        kind: "graph",
        xMinimum: integer("graph-x-min", "0"),
        xMaximum: integer("graph-x-max", "10"),
        yMinimum: integer("graph-y-min", "0"),
        yMaximum: integer("graph-y-max", "10"),
        points: [
          {
            factId: "graph-point",
            x: { kind: "integer", value: "2" },
            y: { kind: "integer", value: "4" },
          },
        ],
      },
      {
        kind: "geometry",
        shape: "rectangle",
        measurements: [integer("side-a", "4"), integer("side-b", "7")],
      },
      {
        kind: "table",
        columnLabels: ["A", "B"],
        rows: [[integer("cell-a", "2"), integer("cell-b", "3")]],
      },
      {
        kind: "measurement",
        measurements: [
          {
            factId: "length-value",
            value: { kind: "integer", value: "8" },
            unit: {
              symbol: "cm",
              scale: { numerator: "1", denominator: "100" },
              dimensions: { length: 1 },
            },
          },
        ],
      },
      {
        kind: "probability",
        nodes: ["Start", "Ziel"],
        branches: [
          {
            from: 0,
            to: 1,
            probability: {
              factId: "probability-value",
              expression: {
                kind: "rational",
                numerator: "1",
                denominator: "2",
              },
            },
          },
        ],
      },
    ];
    for (const input of inputs) {
      const first = renderSemanticComponent(input);
      const second = renderSemanticComponent(input);
      expect(first.svgHash).toBe(second.svgHash);
      expect(first.cacheKey).toBe(second.cacheKey);
      for (const factId of first.factIds)
        expect(first.svg).toContain(`data-fact-id="${factId}"`);
    }
  });

  it("accepts AST only and fails missing, invalid, or unbound components", () => {
    expect(() =>
      renderSemanticComponent({ kind: "number-line", markers: [] })
    ).toThrow();
    expect(() =>
      renderSemanticComponent({
        kind: "number-line",
        minimum: integer("line-min", "0"),
        maximum: integer("line-max", "1"),
        markers: [integer("outside-marker", "2")],
      })
    ).toThrow(/outside/u);
    expect(() =>
      renderSemanticComponent({
        kind: "formula",
        value: integer("safe-value", "3"),
        latex: "\\htmlClass{attack}{x}",
      })
    ).toThrow();
    expect(() =>
      renderSemanticComponent({
        kind: "graph",
        xMinimum: integer("x-min", "0"),
        xMaximum: integer("x-max", "1"),
        yMinimum: integer("y-min", "0"),
        yMaximum: integer("y-max", "1"),
        points: [
          {
            factId: "bad-point",
            x: { kind: "integer", value: "2" },
            y: { kind: "integer", value: "1" },
          },
        ],
      })
    ).toThrow(/outside/u);
    expect(() =>
      renderSemanticComponent({
        kind: "geometry",
        shape: "rectangle",
        measurements: [integer("only-side", "2")],
      })
    ).toThrow(/exactly 2/u);
    expect(() =>
      renderSemanticComponent({
        kind: "table",
        columnLabels: ["Column 1"],
        rows: [[integer("table-value", "1")]],
      })
    ).toThrow(/mathematical values/u);
    expect(() =>
      renderSemanticComponent({
        kind: "measurement",
        measurements: [
          {
            factId: "dimensionless-measurement",
            value: { kind: "integer", value: "3" },
            unit: {
              symbol: "invalid",
              scale: { numerator: "1", denominator: "1" },
              dimensions: {},
            },
          },
        ],
      })
    ).toThrow(/unit dimension/u);
    expect(() =>
      renderSemanticComponent({
        kind: "probability",
        nodes: ["Start", "Links", "Rechts"],
        branches: [
          {
            from: 0,
            to: 1,
            probability: integer("probability-a", "1"),
          },
          {
            from: 0,
            to: 2,
            probability: {
              factId: "probability-b",
              expression: {
                kind: "rational",
                numerator: "1",
                denominator: "2",
              },
            },
          },
        ],
      })
    ).toThrow(/total more than one/u);
  });

  it("writes and reuses cache-keyed SVG only when its content hash matches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-svg-cache-"));
    try {
      const input: SemanticMathComponent = {
        kind: "formula",
        value: integer("cache-value", "42"),
      };
      const first = await cacheSemanticSvg(root, input);
      const second = await cacheSemanticSvg(root, input);
      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(second.svgHash).toBe(first.svgHash);
      expect(Formula({ value: integer("cache-value", "42") }).svgHash).toBe(
        first.svgHash
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("renders non-formula AST labels readably and reports actual minimum glyph size", () => {
    const table = renderSemanticComponent({
      kind: "table",
      columnLabels: ["Wert"],
      rows: [
        [
          {
            factId: "fraction-value",
            expression: {
              kind: "quotient",
              left: {
                kind: "sum",
                operands: [
                  { kind: "integer", value: "1" },
                  { kind: "integer", value: "2" },
                ],
              },
              right: { kind: "integer", value: "3" },
            },
          },
        ],
      ],
    });
    expect(table.svg).not.toContain("\\frac");
    expect(table.svg).toContain("÷");
    expect(table.svg).toContain("(1 + 2)");

    const probability = renderSemanticComponent({
      kind: "probability",
      nodes: ["Start", "Ziel"],
      branches: [
        {
          from: 0,
          to: 1,
          probability: {
            factId: "branch-half",
            expression: {
              kind: "rational",
              numerator: "1",
              denominator: "2",
            },
          },
        },
      ],
    });
    expect(probability.minimumGlyphPx).toBe(72);
    expect(probability.svg).not.toContain('font-size="44"');
  });

  it("binds component values to hash-valid locked lesson semantics and exact scenes", async () => {
    const fixture = await factBindingFixture();
    expect(() => assertProviderFreeFactBindings(fixture)).not.toThrow();

    const scalarMismatch = structuredClone(fixture);
    const scalarComponent = scalarMismatch.scenes[2]!.component;
    if (scalarComponent.kind !== "formula") throw new Error("Fixture mismatch.");
    scalarComponent.value.expression = { kind: "integer", value: "999" };
    expect(() => assertProviderFreeFactBindings(scalarMismatch)).toThrow(
      /different exact semantics/u
    );

    const unitMismatch = structuredClone(fixture);
    const measurement = unitMismatch.scenes[0]!.component;
    if (measurement.kind !== "measurement") throw new Error("Fixture mismatch.");
    measurement.measurements[0]!.unit = {
      symbol: "s",
      scale: { numerator: "1", denominator: "1" },
      dimensions: { time: 1 },
    };
    expect(() => assertProviderFreeFactBindings(unitMismatch)).toThrow(
      /different exact semantics/u
    );

    const crossScene = structuredClone(fixture);
    const remoteFact = fixture.lesson.facts.find(
      (fact) => fact.factId === fixture.lesson.scenes[7]!.factIds[0]
    );
    if (!remoteFact || remoteFact.semantic.kind !== "scalar")
      throw new Error("Fixture mismatch.");
    crossScene.scenes[2]!.component = {
      kind: "formula",
      value: {
        factId: remoteFact.factId,
        expression: remoteFact.semantic.expression,
      },
    };
    expect(() => assertProviderFreeFactBindings(crossScene)).toThrow(
      /outside its locked scene/u
    );

    const graphMismatch = structuredClone(fixture);
    const graph = graphMismatch.scenes[1]!.component;
    if (graph.kind !== "graph") throw new Error("Fixture mismatch.");
    graph.points[0]!.y = { kind: "integer", value: "5" };
    expect(() => assertProviderFreeFactBindings(graphMismatch)).toThrow(
      /different exact semantics/u
    );

    const duplicate = structuredClone(fixture);
    const duplicateGraph = duplicate.scenes[1]!.component;
    if (duplicateGraph.kind !== "graph") throw new Error("Fixture mismatch.");
    duplicateGraph.xMaximum.factId = duplicateGraph.xMinimum.factId;
    expect(() => assertProviderFreeFactBindings(duplicate)).toThrow(
      /duplicate fact binding/u
    );

    const missing = structuredClone(fixture);
    const missingFormula = missing.scenes[2]!.component;
    if (missingFormula.kind !== "formula") throw new Error("Fixture mismatch.");
    missingFormula.value.factId = "missing-fact";
    expect(() => assertProviderFreeFactBindings(missing)).toThrow(
      /outside its locked scene|missing fact/u
    );
  });
});

describe("timing, teacher, and readiness gates", () => {
  it("reflows from actual narration audio and blocks cue drift", () => {
    const localized = narration();
    const timings = audio();
    const result = createNarrationDrivenTiming(localized, timings);
    expect(result.durationSeconds).toBe(180);
    expect(result.scenes[0]?.startFrame).toBe(0);
    expect(result.scenes[8]?.endFrame).toBe(5400);
    expect(() =>
      assertTimingSynchronization(
        result,
        timings,
        localized.segments.map((segment) => segment.factIds.length)
      )
    ).not.toThrow();
    const drifted = structuredClone(result);
    drifted.scenes[0]!.cueFrames[0]! += 5;
    expect(() =>
      assertTimingSynchronization(
        drifted,
        timings,
        localized.segments.map((segment) => segment.factIds.length)
      )
    ).toThrow(/drift/u);

    const skewed = structuredClone(result);
    skewed.scenes[0]!.endFrame += 1;
    skewed.scenes[1]!.startFrame += 1;
    skewed.scenes[1]!.cueFrames = skewed.scenes[1]!.cueFrames.map(
      (frame) => frame + 1
    );
    expect(timingManifestSchema.safeParse(skewed).success).toBe(true);
    expect(() =>
      assertTimingSynchronization(
        skewed,
        timings,
        localized.segments.map((segment) => segment.factIds.length)
      )
    ).toThrow(/scene span/u);
    expect(() =>
      assertTimingSynchronization(
        result,
        timings,
        localized.segments.map((segment) => segment.factIds.length),
        Number.POSITIVE_INFINITY
      )
    ).toThrow(/finite/u);
  });

  it("enforces inclusive 180/300 duration boundaries", () => {
    expect(timingManifestSchema.safeParse(boundaryTiming(179)).success).toBe(
      false
    );
    expect(timingManifestSchema.safeParse(boundaryTiming(180)).success).toBe(
      true
    );
    expect(timingManifestSchema.safeParse(boundaryTiming(300)).success).toBe(
      true
    );
    expect(timingManifestSchema.safeParse(boundaryTiming(301)).success).toBe(
      false
    );
    expect(() =>
      createMathComposition("too-short", boundaryTiming(179))
    ).toThrow();
    for (const duration of [180, 300] as const) {
      const localized = narration();
      const timings = audioForTotal(duration);
      const synchronized = createNarrationDrivenTiming(localized, timings);
      expect(synchronized.durationSeconds).toBe(duration);
      expect(() =>
        assertTimingSynchronization(
          synchronized,
          timings,
          localized.segments.map((segment) => segment.factIds.length)
        )
      ).not.toThrow();
    }
  });

  it("blocks unsafe or unreadable layouts for both age profiles", () => {
    expect(() =>
      validateMathLayout(grades57Profile, 3, 72, 0.25)
    ).not.toThrow();
    expect(() => validateMathLayout(grades810Profile, 5, 58, 0)).not.toThrow();
    expect(() =>
      validateSafeAreaAndReadability(
        grades57Profile,
        { x: 95, y: 54, width: 1728, height: 972 },
        72
      )
    ).toThrow(/safe area/u);
    expect(() =>
      validateSafeAreaAndReadability(
        grades810Profile,
        { x: 96, y: 54, width: 1728, height: 972 },
        57
      )
    ).toThrow(/readable/u);
  });

  it("requires teacher assets and caps both area and timeline presence at 25 percent", async () => {
    await expect(
      validateTeacherAssets("assets/math-teacher/alex/v1/manifest.json")
    ).resolves.toBeUndefined();
    await expect(
      loadTeacherPose(
        "assets/math-teacher/alex/v1/manifest.json",
        "missing",
        0.2
      )
    ).rejects.toThrow(/pose is missing/u);
    await expect(
      loadTeacherPose("/definitely/missing/teacher.json", "neutral", 0.2)
    ).rejects.toThrow(/manifest is missing/u);
    await expect(
      loadTeacherPose(
        "assets/math-teacher/alex/v1/manifest.json",
        "neutral",
        0.26
      )
    ).rejects.toThrow(/25 percent/u);

    const timing = timingManifestSchema.parse(boundaryTiming(180));
    const base: MathSceneAsset[] = timing.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      svgPath: "/tmp/not-read-by-contract.svg",
      svgHash: hash,
      minimumGlyphPx: 72,
      bounds: { x: 96, y: 54, width: 1728, height: 972 },
    }));
    expect(() =>
      createReadyMathComposition(
        "missing",
        timing,
        "grades-5-7-v1",
        base.slice(1)
      )
    ).toThrow(/requires one/u);
    const tooPresent = base.map((scene, index) =>
      index < 3
        ? { ...scene, teacher: { poseId: "neutral", areaRatio: 0.2 } }
        : scene
    );
    expect(() =>
      createReadyMathComposition("teacher", timing, "grades-5-7-v1", tooPresent)
    ).toThrow(/presence/u);
  });

  it("fingerprints the deterministic local runner contract", () => {
    const input = {
      durationInFrames: 5400,
      sceneHashes: [hash],
      frameRanges: [
        { sceneId: "scene-001", startFrame: 0, endFrame: 5400 },
      ],
      audioHash: hash,
      bundleHash: hash,
    };
    expect(createRemotionRenderFingerprint(input)).toBe(
      createRemotionRenderFingerprint(input)
    );
    expect(
      createRemotionRenderFingerprint({ ...input, durationInFrames: 9000 })
    ).not.toBe(createRemotionRenderFingerprint(input));
    expect(
      createRemotionRenderFingerprint({
        ...input,
        frameRanges: [
          { sceneId: "scene-001", startFrame: 0, endFrame: 5399 },
        ],
      })
    ).not.toBe(createRemotionRenderFingerprint(input));
  });

  it("validates DTS continuity without rejecting reordered presentation timestamps", () => {
    const reorderedPackets = [
      {
        stream_index: 0,
        dts_time: "-0.066667",
        pts_time: "0.000000",
        duration_time: "0.033333",
      },
      {
        stream_index: 0,
        dts_time: "-0.033334",
        pts_time: "0.066667",
        duration_time: "0.033333",
      },
      {
        stream_index: 0,
        dts_time: "-0.000001",
        pts_time: "0.033333",
        duration_time: "0.033333",
      },
      {
        stream_index: 0,
        dts_time: "0.033332",
        pts_time: "0.100000",
        duration_time: "0.033333",
      },
    ];
    expect(
      findPacketContinuityIssues(
        reorderedPackets,
        0,
        2 / 30,
        "Video",
        0.133333
      )
    ).toEqual([]);
    expect(
      findPacketContinuityIssues(
        [
          reorderedPackets[0]!,
          { ...reorderedPackets[1]!, dts_time: "0.200000" },
        ],
        0,
        2 / 30,
        "Video",
        0.233333
      ).join(" ")
    ).toMatch(/gap/u);
  });

  it("does not treat unavailable packet continuity evidence as ready", () => {
    expect(() =>
      assertMathMediaReady({
        artifactVersion: "math-media-validation.v1",
        valid: true,
        filePath: "/tmp/not-read-by-readiness.mp4",
        sha256: hash,
        width: 1920,
        height: 1080,
        fps: 30,
        durationSeconds: 180,
        videoCodec: "h264",
        audioCodec: "aac",
        continuityChecked: false,
        corruptionScanPassed: true,
        issues: [],
      })
    ).toThrow(/continuity evidence/u);
  });
});
