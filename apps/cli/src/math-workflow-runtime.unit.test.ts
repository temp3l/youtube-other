import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@mediaforge/math-rendering",
  async () => import("../../../packages/math-rendering/src/index.js")
);

import {
  buildCanonicalNarrationSynchronizationFilter,
  CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX,
  CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO,
  CANONICAL_PRIVATE_RENDERER_VERSIONS,
  CANONICAL_PRIVATE_VISUAL_STYLE_VERSION,
  CANONICAL_SPEECH_WORST_CASE_MULTIPLIER,
  estimateCanonicalPaidSpeechCostMicros,
  estimateCanonicalPaidSpeechRemainingCost,
  readCanonicalPaidSpeechUsage,
  selectCanonicalSemanticComponent,
} from "./math-workflow-runtime.js";

describe("canonical math workflow runtime", () => {
  it("meets the grades 5-7 minimum glyph size", () => {
    expect(
      CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX
    ).toBeGreaterThanOrEqual(72);
    expect(CANONICAL_PRIVATE_VISUAL_STYLE_VERSION).toBe(6);
    expect(CANONICAL_PRIVATE_RENDERER_VERSIONS).toEqual({
      svg: "math-svg.v8",
      formula: "math-svg.v2",
      remotion: "math-semantic-keyframe-runner.v6",
    });
  });

  it("preserves overlong narration by tempo-synchronizing before exact padding", () => {
    expect(
      buildCanonicalNarrationSynchronizationFilter({
        sourceDurationSeconds: 356.042,
        targetDurationSeconds: 240,
      })
    ).toEqual({
      filter:
        "atempo=1.485056,loudnorm=I=-17:TP=-2:LRA=11,apad=whole_dur=240,atrim=duration=240",
      tempoRatio: 1.485056,
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
});
