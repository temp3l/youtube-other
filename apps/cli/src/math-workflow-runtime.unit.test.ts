import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCanonicalNarrationSynchronizationFilter,
  CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX,
  CANONICAL_PRIVATE_NARRATION_MAX_TEMPO_RATIO,
  CANONICAL_SPEECH_WORST_CASE_MULTIPLIER,
  estimateCanonicalPaidSpeechCostMicros,
  estimateCanonicalPaidSpeechRemainingCost,
  readCanonicalPaidSpeechUsage,
  selectCanonicalSemanticComponent,
} from "./math-workflow-runtime.js";

describe("canonical math workflow runtime", () => {
  it("meets the grades 5-7 minimum glyph size", () => {
    expect(CANONICAL_PRIVATE_FACT_BOARD_MINIMUM_GLYPH_PX).toBeGreaterThanOrEqual(
      72
    );
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

  it("keeps a long single verified place-value expression out of table layout", () => {
    const component = selectCanonicalSemanticComponent(
      "place-value-chart",
      [
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
      ]
    );
    expect(component).toMatchObject({
      kind: "formula",
      value: { factId: "example-main-source" },
    });
  });

  it("does not forge a two-measurement rectangle from one tuple fact", () => {
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
        displayLatex: "8\\,\\mathrm{cm}\\times5\\,\\mathrm{cm}",
        checkIds: ["check-example-main"],
        lineage: {
          contentContractVersion: "lesson-content-contract.v1",
          sourceContentHash: "1".repeat(64),
          sourceTaskId: "example-main",
        },
      },
    ]);

    expect(component).toMatchObject({
      kind: "formula",
      value: {
        factId: "example-main-source",
        expression: { kind: "tuple" },
      },
    });
  });
});
