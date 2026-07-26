import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalHash,
  canonicalPrivateMediaEvidenceSchema,
} from "@mediaforge/math-education";
import {
  bindMathPortableScene,
  bindMathSceneShardRequest,
  bindMathSceneShardResult,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
  type MathSceneShardRequest,
  type MathSceneShardResult,
} from "@mediaforge/math-rendering";

vi.mock(
  "@mediaforge/math-education",
  async () => import("../../../packages/math-education/src/index.js")
);
vi.mock(
  "@mediaforge/math-rendering",
  async () => import("../../../packages/math-rendering/src/index.js")
);

import {
  buildCanonicalNarrationSynchronizationFilter,
  CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX,
  CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO,
  CANONICAL_PRIVATE_RETRIEVAL_RESPONSE_HOLD_SECONDS,
  CANONICAL_PRIVATE_RENDERER_VERSIONS,
  CANONICAL_PRIVATE_VISUAL_STYLE_VERSION,
  CANONICAL_SPEECH_WORST_CASE_MULTIPLIER,
  deriveCanonicalPaidSpeechRate,
  estimateCanonicalPaidSpeechCostMicros,
  estimateCanonicalPaidSpeechRemainingCost,
  readCanonicalPaidSpeechUsage,
  selectCanonicalSemanticComponent,
} from "./math-workflow-runtime.js";
import {
  createHybridMathSceneShardExecutor,
  MathSceneLaneError,
  runBoundedNoProviderMathSceneCalibration,
  type MathSceneLaneFailureClass,
  type MathSceneLaneRunner,
} from "./math-render-hybrid.js";

const hybridImageId = `sha256:${"a".repeat(64)}`;

async function hybridRequests(): Promise<{
  readonly jobRoot: string;
  readonly requests: readonly MathSceneShardRequest[];
}> {
  const jobRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "math-hybrid-runtime-")
  );
  const inputRoot = path.join(jobRoot, "inputs");
  await fs.mkdir(inputRoot, { recursive: true });
  const requests: MathSceneShardRequest[] = [];
  let startFrame = 0;
  for (let index = 0; index < 9; index += 1) {
    const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g data-chalk-step="${sceneId}"><path d="M0 0H${10 + index}"/></g></svg>`;
    const svgPath = path.join(inputRoot, `${sceneId}.svg`);
    await fs.writeFile(svgPath, svg);
    const svgHash = createHash("sha256").update(svg).digest("hex");
    const frameCount = 120 + index * 120;
    const scene = bindMathPortableScene({
      sceneId,
      order: index,
      startFrame,
      endFrame: startFrame + frameCount,
      expectedFrameCount: frameCount,
      svgRelativePath: `inputs/${sceneId}.svg`,
      svgHash,
      minimumGlyphPx: 72,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      animation: {
        mode: "progressive-chalk-reveal",
        rendererVersion: "math-semantic-chalk.v7",
        cues: [],
        activity: "standard",
      },
      fragmentRelativePath: `fragments/${sceneId}.mp4`,
      encoding: createMathFragmentEncoding("publish"),
      toolchain: createMathRenderToolchainIdentity(hybridImageId),
    });
    startFrame += frameCount;
    requests.push(
      bindMathSceneShardRequest({
        artifactVersion: "math-scene-shard-request.v1",
        jobId: "hybrid-runtime",
        planHash: "b".repeat(64),
        assignmentId: `original-${sceneId}`,
        workRelativePath: "work",
        scenes: [scene],
      })
    );
  }
  return { jobRoot, requests };
}

function fakeShardResult(request: MathSceneShardRequest): MathSceneShardResult {
  const scene = request.scenes[0]!;
  return bindMathSceneShardResult({
    artifactVersion: "math-scene-shard-result.v1",
    jobId: request.jobId,
    planHash: request.planHash,
    assignmentId: request.assignmentId,
    requestHash: request.requestHash,
    fragments: [
      {
        sceneId: scene.sceneId,
        order: scene.order,
        sceneHash: scene.sceneHash,
        svgHash: scene.svgHash,
        relativePath: scene.fragmentRelativePath,
        sha256: String(scene.order + 1)
          .repeat(64)
          .slice(0, 64),
        byteLength: 1_000 + scene.order,
        frameCount: scene.expectedFrameCount,
        width: 1920,
        height: 1080,
        fps: 30,
        pixelFormat: "yuv420p",
        codec: "h264",
        codecProfile: "High",
        timeBase: "1/15360",
        audioStreamCount: 0,
        encoding: scene.encoding,
        toolchain: scene.toolchain,
        renderDurationMs: 5,
        cacheHitCount: 0,
        cacheMissCount: 1,
      },
    ],
  });
}

function calibratedShardResult(
  request: MathSceneShardRequest,
  phases: {
    readonly rasterizationMs: number;
    readonly sceneEncodingMs: number;
  }
): MathSceneShardResult {
  const result = fakeShardResult(request);
  const fragment = result.fragments[0]!;
  const actualCostMs = phases.rasterizationMs + phases.sceneEncodingMs;
  return bindMathSceneShardResult({
    artifactVersion: result.artifactVersion,
    jobId: result.jobId,
    planHash: result.planHash,
    assignmentId: result.assignmentId,
    requestHash: result.requestHash,
    fragments: [
      {
        ...fragment,
        execution: {
          workerId: "calibration",
          predictedCostMs: actualCostMs,
          actualCostMs,
          queueWaitMs: 0,
          peakActiveWork: 1,
          phases: {
            svgGenerationMs: 0,
            rasterizationMs: phases.rasterizationMs,
            sceneEncodingMs: phases.sceneEncodingMs,
            validationMs: 0,
          },
          cache: {
            rasterHits: 0,
            rasterMisses: 1,
            videoHits: 0,
            videoMisses: 1,
          },
        },
      },
    ],
  });
}

function fakeCapability(workerId: "local" | "remote", speed: number) {
  return {
    workerId,
    workerImageId: hybridImageId,
    cpuSlots: 1,
    cache: { raster: true, sceneVideo: true },
    calibration: {
      rasterSamplesPerSecond: speed,
      encodeFramesPerSecond: speed,
      startupLatencyMs: 1,
      ...(workerId === "remote" ? { transferMegabytesPerSecond: 100 } : {}),
    },
  } as const;
}

describe("canonical math workflow runtime", () => {
  it("measures one bounded provider-free calibration shard per lane", async () => {
    const fixture = await hybridRequests();
    const calls = { local: 0, remote: 0 };
    const calibration = await runBoundedNoProviderMathSceneCalibration({
      imageId: hybridImageId,
      requests: fixture.requests,
      context: { jobRoot: fixture.jobRoot },
      localRunner: {
        execute: async (request) => {
          calls.local += 1;
          return {
            result: calibratedShardResult(request, {
              rasterizationMs: 100,
              sceneEncodingMs: 400,
            }),
            transferBytes: 0,
            startupLatencyMs: 7,
          };
        },
      },
      remoteRunner: {
        execute: async (request) => {
          calls.remote += 1;
          return {
            result: calibratedShardResult(request, {
              rasterizationMs: 50,
              sceneEncodingMs: 200,
            }),
            transferBytes: 2_000_000,
            startupLatencyMs: 11,
            transferDurationMs: 100,
          };
        },
      },
    });

    expect(calls).toEqual({ local: 1, remote: 1 });
    expect(calibration.local).toMatchObject({
      encodeFramesPerSecond: 300,
      startupLatencyMs: 7,
    });
    expect(calibration.remote).toMatchObject({
      encodeFramesPerSecond: 1_200,
      startupLatencyMs: 11,
      transferMegabytesPerSecond: 20,
    });
    expect(calibration.local.rasterSamplesPerSecond).toBeGreaterThan(0);
    expect(calibration.remote.rasterSamplesPerSecond).toBeGreaterThan(
      calibration.local.rasterSamplesPerSecond
    );
  });

  it("meets the grades 5-7 minimum glyph size", () => {
    expect(
      CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX
    ).toBeGreaterThanOrEqual(72);
    expect(CANONICAL_PRIVATE_VISUAL_STYLE_VERSION).toBe(6);
    expect(CANONICAL_PRIVATE_RENDERER_VERSIONS).toEqual({
      svg: "math-svg.v8",
      formula: "math-svg.v2",
      remotion: "math-semantic-keyframe-runner.v10",
    });
  });

  it("preserves overlong narration by tempo-synchronizing before exact padding", () => {
    expect(CANONICAL_PRIVATE_RETRIEVAL_RESPONSE_HOLD_SECONDS).toBe(5);
    expect(
      buildCanonicalNarrationSynchronizationFilter({
        sourceDurationSeconds: 356.042,
        targetDurationSeconds: 240,
      })
    ).toEqual({
      filter:
        "atempo=1.515073,loudnorm=I=-17:TP=-2:LRA=11,apad=whole_dur=240,atrim=duration=240",
      tempoRatio: 1.515073,
    });
    expect(
      buildCanonicalNarrationSynchronizationFilter({
        sourceDurationSeconds: 230,
        targetDurationSeconds: 240,
      })
    ).toEqual({
      filter:
        "loudnorm=I=-17:TP=-2:LRA=11,apad=whole_dur=240,atrim=duration=240",
      tempoRatio: 1,
    });
    expect(() =>
      buildCanonicalNarrationSynchronizationFilter({
        sourceDurationSeconds: 500,
        targetDurationSeconds: 240,
      })
    ).toThrow(
      `above the canonical maximum ${CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO}`
    );
  });

  it("uses the longer lesson window for slower canonical speech", () => {
    expect(
      deriveCanonicalPaidSpeechRate({
        words: 344,
        targetDurationSeconds: 240,
      })
    ).toBe(96);
    expect(
      deriveCanonicalPaidSpeechRate({
        words: 344,
        targetDurationSeconds: 300,
      })
    ).toBe(80);
  });

  it("budgets all three bounded speech attempts before provider execution", () => {
    expect(CANONICAL_SPEECH_WORST_CASE_MULTIPLIER).toBe(3);
    expect(
      estimateCanonicalPaidSpeechCostMicros({
        estimatedAudioSeconds: 240,
        inputCharacters: 5_000,
        providerRequests: 9,
      })
    ).toBe(225_000);
    expect(
      estimateCanonicalPaidSpeechRemainingCost({
        targetDurationSeconds: 240,
        planChunks: [
          { chunkId: "one", estimatedDurationMs: 100_000 },
          { chunkId: "two", estimatedDurationMs: 100_000 },
        ],
        dryRunChunks: [
          { chunkId: "one", selected: true, cacheStatus: "hit" },
          { chunkId: "two", selected: true, cacheStatus: "miss" },
        ],
        inputCharacters: 2_500,
        providerRequests: 1,
      })
    ).toEqual({
      estimatedAudioSeconds: 120,
      estimatedCostMicros: 112_500,
    });
  });

  it("reconciles cumulative paid speech usage from sanitized unit logs", async () => {
    const unitRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "canonical-paid-usage-")
    );
    const logRoot = path.join(unitRoot, "debug", "openai-calls");
    await fs.mkdir(logRoot, { recursive: true });
    const writeLog = async (name: string, value: unknown) =>
      fs.writeFile(path.join(logRoot, name), JSON.stringify(value));
    await writeLog("success.json", {
      episodeRoot: unitRoot,
      operation: "speech-generation",
      paidProviderCalled: true,
      request: { input: "abcd" },
      response: { durationSeconds: 2 },
      durationMs: 100,
    });
    await writeLog("failed.json", {
      episodeRoot: unitRoot,
      operation: "speech-generation",
      paidProviderCalled: true,
      request: { input: "xy" },
      error: { message: "provider failure" },
      durationMs: 50,
    });
    await writeLog("pre-dispatch.json", {
      episodeRoot: unitRoot,
      operation: "speech-generation",
      paidProviderCalled: false,
      request: { input: "ignored" },
      durationMs: 1,
    });

    await expect(readCanonicalPaidSpeechUsage(unitRoot)).resolves.toEqual({
      calls: 2,
      characters: 6,
      audioSeconds: 2,
      latencyMs: 150,
      costMicros: 604,
    });
  });

  it("materializes a verifier-bound place-value chart from the exact sum", () => {
    const component = selectCanonicalSemanticComponent("place-value-chart", [
      {
        factId: "example-main-source",
        semantic: {
          kind: "scalar",
          expression: {
            kind: "sum",
            operands: [
              { kind: "integer", value: "700000" },
              { kind: "integer", value: "30000" },
              { kind: "integer", value: "400" },
              { kind: "integer", value: "5" },
            ],
          },
        },
        displayLatex: "700000+30000+400+5",
        checkIds: ["check-example-main"],
        lineage: {
          contentContractVersion: "lesson-content-contract.v1",
          sourceContentHash: "1".repeat(64),
          sourceTaskId: "example-main",
        },
      },
    ]);
    expect(component).toMatchObject({
      kind: "place-value-chart",
      source: { factId: "example-main-source" },
    });
  });

  it("turns the reviewed place-value lesson into a child-facing code activity", () => {
    const component = selectCanonicalSemanticComponent(
      "place-value-chart",
      [
        {
          factId: "transfer-main-source",
          semantic: {
            kind: "scalar",
            expression: {
              kind: "sum",
              operands: [
                { kind: "integer", value: "600000" },
                { kind: "integer", value: "4000" },
                { kind: "integer", value: "70" },
              ],
            },
          },
          displayLatex: "600000+4000+70",
          checkIds: ["check-transfer-main"],
          lineage: {
            contentContractVersion: "lesson-content-contract.v1",
            sourceContentHash: "1".repeat(64),
            sourceTaskId: "transfer-main",
          },
        },
      ],
      {
        title: "Denkpause",
        body: "Stellenwerte lesen",
        prompt: "Löse die Aufgabe.",
        skillId: "M5-ZO-001",
        sceneFunction: "think-pause",
      }
    );

    expect(component).toMatchObject({
      kind: "place-value-activity",
      mode: "challenge",
      title: "Jetzt du",
      values: [{ factId: "transfer-main-source" }],
    });
  });

  it("renders the final place-value scene as an unguided retrieval question", () => {
    const component = selectCanonicalSemanticComponent("formula", [], {
      title: "Zusammenfassung",
      body: "Stellenwerte lesen",
      prompt: "Wiederhole die Regel.",
      skillId: "M5-ZO-001",
      sceneFunction: "recap",
    });

    expect(component).toMatchObject({
      kind: "place-value-activity",
      mode: "recap",
      title: "Abruffrage",
      prompt: "Erkläre das Verfahren ohne zurückzuschauen.",
      values: [],
    });
  });

  it("keeps rectangle dimensions bound to their single verified tuple fact", () => {
    const component = selectCanonicalSemanticComponent("geometry", [
      {
        factId: "example-main-source",
        semantic: {
          kind: "scalar",
          expression: {
            kind: "tuple",
            items: [
              { kind: "integer", value: "8" },
              { kind: "integer", value: "5" },
            ],
          },
        },
        displayLatex: "Rechteck 8 cm × 5 cm",
        checkIds: ["check-example-main"],
        lineage: {
          contentContractVersion: "lesson-content-contract.v1",
          sourceContentHash: "1".repeat(64),
          sourceTaskId: "example-main",
        },
      },
    ]);

    expect(component).toMatchObject({
      kind: "geometry",
      shape: "rectangle",
      measurements: [
        {
          factId: "example-main-source",
          expression: { kind: "tuple" },
        },
      ],
    });
  });

  it("materializes an exact tally table instead of a generic fact board", () => {
    const lineage = {
      contentContractVersion: "lesson-content-contract.v1" as const,
      sourceContentHash: "1".repeat(64),
      sourceTaskId: "example-main",
    };
    const component = selectCanonicalSemanticComponent("data-table", [
      {
        factId: "example-main-source",
        semantic: {
          kind: "scalar",
          expression: {
            kind: "tuple",
            items: [
              { kind: "integer", value: "4" },
              { kind: "integer", value: "3" },
              { kind: "integer", value: "5" },
            ],
          },
        },
        displayLatex: "Apfel 4; Birne 3; Banane 5",
        checkIds: ["check-example-main"],
        lineage,
      },
      ...[
        ["example-category-apfel", "Apfel", "4"],
        ["example-category-birne", "Birne", "3"],
        ["example-category-banane", "Banane", "5"],
      ].map(([factId, category, value]) => ({
        factId: factId!,
        semantic: {
          kind: "scalar" as const,
          expression: { kind: "integer" as const, value: value! },
        },
        displayLatex: `${category}: ${value}`,
        checkIds: ["check-example-main"],
        lineage,
      })),
    ]);

    expect(component).toMatchObject({
      kind: "tally-table",
      dataset: {
        factId: "example-main-source",
        expression: { kind: "tuple" },
      },
      rows: [
        { category: "Apfel", count: { factId: "example-category-apfel" } },
        { category: "Birne", count: { factId: "example-category-birne" } },
        { category: "Banane", count: { factId: "example-category-banane" } },
      ],
    });
  });

  it("keeps legacy media evidence valid and strictly hash-binds optional render execution provenance", () => {
    const mediaPayload = {
      artifactVersion: "math-canonical-private-media.v1" as const,
      identity: {
        lessonId: "m5-zo-001-standard",
        skillId: "M5-ZO-001",
        language: "de" as const,
        variant: "standard" as const,
      },
      provider: {
        mode: "fixture-mock" as const,
        calls: 0 as const,
        characters: 0 as const,
        retries: 0 as const,
        latencyMs: 0 as const,
        costMicros: 0 as const,
      },
      audio: {
        relativePath: "locales/de/audio/narration.wav",
        sha256: "1".repeat(64),
        byteLength: 1_000,
        durationSeconds: 180,
        codec: "pcm_s16le" as const,
        quality: {
          kind: "test-tone" as const,
          audibleNarration: false as const,
          probesPassed: false as const,
        },
      },
      video: {
        relativePath: "locales/de/render/final.mp4",
        sha256: "2".repeat(64),
        byteLength: 2_000,
        validation: {
          valid: true as const,
          width: 1920 as const,
          height: 1080 as const,
          fps: 30 as const,
          durationSeconds: 180,
          videoCodec: "h264" as const,
          audioCodec: "aac",
          continuityChecked: true as const,
          corruptionScanPassed: true as const,
        },
      },
      thumbnail: {
        relativePath: "locales/de/thumbnail.svg",
        sha256: "3".repeat(64),
        byteLength: 300,
        width: 1920 as const,
        height: 1080 as const,
        factId: "fact-1",
        factSemanticHash: "4".repeat(64),
      },
      thumbnailManifest: {
        relativePath: "locales/de/thumbnail.svg.manifest.json",
        sha256: "5".repeat(64),
        byteLength: 400,
      },
      brandPolicy: {
        relativePath: "locales/de/brand-policy.json",
        sha256: "6".repeat(64),
        byteLength: 500,
      },
      captions: {
        count: 9 as const,
        contentHash: "7".repeat(64),
        rendered: true as const,
      },
      visualPlanHash: "8".repeat(64),
      timingHash: "9".repeat(64),
      renderFingerprint: "a".repeat(64),
      visualPresentation: {
        strategy: "progressive-chalk-reveal" as const,
        rendererVersion: "math-semantic-chalk.v7" as const,
      },
      visualValidation: {
        valid: true as const,
        plannedComponentsRealized: true as const,
        genericFallbackUsed: false as const,
        cueCoveragePassed: true as const,
        minimumSceneStepCount: 4,
        maximumStaticIntervalFrames: 225,
      },
      publication: {
        visibility: "private" as const,
        publicReady: false as const,
        blockers: ["private-only"],
      },
    };
    const legacy = {
      ...mediaPayload,
      contentHash: canonicalHash(mediaPayload),
    };
    expect(canonicalPrivateMediaEvidenceSchema.parse(legacy)).toEqual(legacy);

    const renderExecution = {
      artifactVersion: "math-render-execution.v1" as const,
      mode: "local-compatibility" as const,
      planHash: "b".repeat(64),
      renderResultHash: "c".repeat(64),
      toolchain: {
        workerImageId: "local:math-semantic-keyframe-runner.v10",
        remotionRunnerVersion: "math-semantic-keyframe-runner.v10",
        svgRendererVersion: "math-svg.v8",
        semanticChalkVersion: "math-semantic-chalk.v7",
        mediaQaVersion: "math-media-qa.v1",
      },
      scenes: Array.from({ length: 9 }, (_, index) => ({
        sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
        assignmentId: `local-scene-${String(index + 1).padStart(3, "0")}`,
        sourceSvgHash: String(index + 1)
          .repeat(64)
          .slice(0, 64),
        fragmentSha256: String(index + 2)
          .repeat(64)
          .slice(0, 64),
        frameCount: 600,
        renderDurationMs: 100,
        cacheHitCount: 0,
        cacheMissCount: 1,
      })),
      assembly: {
        durationMs: 500,
        narrationMuxCount: 1 as const,
        revealCueVersion: "math-reveal-cue.v1",
        mediaQaVersion: "math-media-qa.v1",
      },
      cacheHitCount: 0,
      cacheMissCount: 9,
    };
    const currentPayload = { ...mediaPayload, renderExecution };
    const current = {
      ...currentPayload,
      contentHash: canonicalHash(currentPayload),
    };
    expect(canonicalPrivateMediaEvidenceSchema.parse(current)).toEqual(current);
    expect(() =>
      canonicalPrivateMediaEvidenceSchema.parse({
        ...current,
        renderExecution: {
          ...current.renderExecution,
          unknown: true,
        },
      })
    ).toThrow();
    expect(() =>
      canonicalPrivateMediaEvidenceSchema.parse({
        ...current,
        renderExecution: {
          ...current.renderExecution,
          planHash: "d".repeat(64),
        },
      })
    ).toThrow(/hash/u);
  });

  it("schedules unequal scene costs by predicted finish, overlaps local and remote lanes, and preserves canonical order", async () => {
    const fixture = await hybridRequests();
    const calls = { local: [] as string[], remote: [] as string[] };
    const runner = (lane: "local" | "remote"): MathSceneLaneRunner => ({
      execute: async (request) => {
        calls[lane].push(request.scenes[0]!.sceneId);
        await new Promise((resolve) => setTimeout(resolve, 8));
        return { result: fakeShardResult(request), transferBytes: 10 };
      },
    });
    const executor = createHybridMathSceneShardExecutor({
      mode: "hybrid",
      imageId: hybridImageId,
      localCapability: fakeCapability("local", 60),
      remoteCapability: fakeCapability("remote", 240),
      localRunner: runner("local"),
      remoteRunner: runner("remote"),
      remoteMaxRetries: 1,
    });
    const results = await executor.executeBatch!(fixture.requests, {
      jobRoot: fixture.jobRoot,
    });
    expect(results.map((result) => result.fragments[0]!.sceneId)).toEqual(
      fixture.requests.map((request) => request.scenes[0]!.sceneId)
    );
    expect(
      new Set(results.map((result) => result.fragments[0]!.sceneId)).size
    ).toBe(9);
    expect(calls.local.length).toBeGreaterThan(0);
    expect(calls.remote.length).toBeGreaterThan(calls.local.length);
    const scheduling = results.map(
      (result) => result.fragments[0]!.execution!.scheduling!
    );
    const local = scheduling.filter((scene) => scene.lane === "local");
    const remote = scheduling.filter((scene) => scene.lane === "remote");
    expect(
      Math.min(...local.map((scene) => scene.actualFinishMs))
    ).toBeGreaterThan(Math.min(...remote.map((scene) => scene.actualStartMs)));
    expect(
      Math.min(...remote.map((scene) => scene.actualFinishMs))
    ).toBeGreaterThan(Math.min(...local.map((scene) => scene.actualStartMs)));
  });

  it.each([
    "ssh",
    "transfer",
    "timeout",
    "capacity",
    "worker-process",
  ] satisfies MathSceneLaneFailureClass[])(
    "retries %s failures within budget and reassigns only the failed scene",
    async (failureClass) => {
      const fixture = await hybridRequests();
      const request = fixture.requests[0]!;
      let remoteCalls = 0;
      let localCalls = 0;
      const executor = createHybridMathSceneShardExecutor({
        mode: "remote",
        imageId: hybridImageId,
        localCapability: fakeCapability("local", 60),
        remoteCapability: fakeCapability("remote", 60),
        localRunner: {
          execute: async (candidate) => {
            localCalls += 1;
            return {
              result: fakeShardResult(candidate),
              transferBytes: 0,
            };
          },
        },
        remoteRunner: {
          execute: async () => {
            remoteCalls += 1;
            throw new MathSceneLaneError(
              failureClass,
              "retryable fixture failure"
            );
          },
        },
        remoteMaxRetries: 1,
      });
      const result = await executor.execute(request, {
        jobRoot: fixture.jobRoot,
      });
      expect(remoteCalls).toBe(2);
      expect(localCalls).toBe(1);
      expect(result.fragments[0]!.execution!.scheduling).toMatchObject({
        lane: "local",
        attempts: 3,
        reassignedFrom: "remote",
        fallbackStatus: "reassigned-local",
      });
    }
  );

  it.each([
    "schema",
    "containment",
    "image-identity",
    "request-identity",
    "dependency-hash",
    "result-hash",
  ] satisfies MathSceneLaneFailureClass[])(
    "fails closed for %s failures without local fallback",
    async (failureClass) => {
      const fixture = await hybridRequests();
      let localCalls = 0;
      const executor = createHybridMathSceneShardExecutor({
        mode: "remote",
        imageId: hybridImageId,
        localCapability: fakeCapability("local", 60),
        remoteCapability: fakeCapability("remote", 60),
        localRunner: {
          execute: async (request) => {
            localCalls += 1;
            return { result: fakeShardResult(request), transferBytes: 0 };
          },
        },
        remoteRunner: {
          execute: async () => {
            throw new MathSceneLaneError(
              failureClass,
              "integrity fixture failure"
            );
          },
        },
        remoteMaxRetries: 2,
      });
      await expect(
        executor.execute(fixture.requests[0]!, {
          jobRoot: fixture.jobRoot,
        })
      ).rejects.toMatchObject({ failureClass });
      expect(localCalls).toBe(0);
    }
  );

  it("reuses a validated fragment without duplicating scene work", async () => {
    const fixture = await hybridRequests();
    let laneCalls = 0;
    const executor = createHybridMathSceneShardExecutor({
      mode: "hybrid",
      imageId: hybridImageId,
      localCapability: fakeCapability("local", 60),
      remoteCapability: fakeCapability("remote", 60),
      localRunner: {
        execute: async (request) => {
          laneCalls += 1;
          return { result: fakeShardResult(request), transferBytes: 0 };
        },
      },
      remoteRunner: {
        execute: async (request) => {
          laneCalls += 1;
          return { result: fakeShardResult(request), transferBytes: 0 };
        },
      },
      remoteMaxRetries: 1,
      reuse: async (request) => fakeShardResult(request),
    });
    const result = await executor.execute(fixture.requests[0]!, {
      jobRoot: fixture.jobRoot,
    });
    expect(laneCalls).toBe(0);
    expect(result.fragments[0]!.execution!.scheduling).toMatchObject({
      cacheStatus: "hit",
      fallbackStatus: "none",
    });
  });
});
