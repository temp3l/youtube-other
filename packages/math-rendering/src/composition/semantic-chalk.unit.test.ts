import { describe, expect, it } from "vitest";

import {
  createSemanticChalkSchedule,
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
  semanticChalkStepSampleCount,
} from "./semantic-chalk.js";
import { segmentChalkGraphemes } from "./natural-chalk.js";

describe("semantic chalk frames", () => {
  it("reveals actual verifier-bound elements in declared board order", () => {
    const svg =
      '<svg><rect width="10"/><g data-chalk-step="sum" data-chalk-box="100,100,500,100" data-fact-id="fact-a"><text>12+3</text></g><g data-chalk-step="answer" data-chalk-box="100,250,500,100" data-fact-id="fact-b"><text>15</text></g></svg>';
    const steps = extractSemanticChalkSteps(svg);
    expect(steps).toEqual([
      {
        key: "step:sum",
        factId: "fact-a",
        durationWeight: 1,
        pauseAfterFrames: 0,
      },
      {
        key: "step:answer",
        factId: "fact-b",
        durationWeight: 1,
        pauseAfterFrames: 0,
      },
    ]);
    const start = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 0,
      sceneFrames: 600,
    });
    expect(start.svgMarkup).toContain("data-natural-chalk-material");
    expect(start.svgMarkup).toContain("data-natural-chalk-text");
    expect(start.svgMarkup).toContain("data-chalk-glyph");
    expect(start.svgMarkup).toContain('data-chalk-state="pending"');
    expect(start.svgMarkup).toContain('visibility="hidden"');
    expect(start.svgMarkup).not.toContain("clip-path");
    expect(start.svgMarkup).not.toContain("<clipPath");
    expect(start.svgMarkup).toMatch(
      /data-chalk-step="answer"[^>]*opacity="0"/u
    );

    const second = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 300,
      sceneFrames: 600,
    });
    expect(second.svgMarkup).toContain(
      'data-chalk-step="sum" data-chalk-box="100,100,500,100" data-fact-id="fact-a"'
    );
    expect(second.activeFactId).toBe("fact-b");

    const complete = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 600,
      sceneFrames: 600,
    });
    expect(complete.svgMarkup).toContain("data-natural-chalk-material");
    expect(complete.svgMarkup).toContain('data-chalk-state="complete"');
    expect(complete.svgMarkup).not.toContain('data-chalk-state="pending"');
    expect(complete.svgMarkup).not.toContain(">12+3</text>");
  });

  it("draws geometric strokes instead of adding a generic underline", () => {
    const svg =
      '<svg><line x1="100" y1="100" x2="800" y2="100" stroke="#14213d" data-chalk-step="edge" data-chalk-box="90,90,720,20" data-fact-id="shape"/></svg>';
    const steps = extractSemanticChalkSteps(svg);
    const frame = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 30,
      sceneFrames: 300,
    });
    expect(frame.svgMarkup).toContain('pathLength="1"');
    expect(frame.svgMarkup).toContain('stroke-dasharray="1"');
    expect(frame.svgMarkup).not.toContain("semantic-chalk-writing");
  });

  it("samples long text at grapheme boundaries without unbounded raster work", () => {
    const svg =
      '<svg><g data-chalk-step="title"><text>Wo gehören die Nullen hin?</text></g><g data-chalk-step="line"><path d="M0 0H100"/></g></svg>';
    const steps = extractSemanticChalkSteps(svg);

    expect(
      semanticChalkStepSampleCount({
        svgMarkup: svg,
        step: steps[0]!,
        durationFrames: 180,
      })
    ).toBe(segmentChalkGraphemes("Wo gehören die Nullen hin?").length);
    expect(
      semanticChalkStepSampleCount({
        svgMarkup: svg,
        step: steps[1]!,
        durationFrames: 5,
      })
    ).toBe(5);
    expect(
      semanticChalkStepSampleCount({
        svgMarkup:
          '<svg><g data-chalk-step="title"><text>abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz</text></g></svg>',
        step: {
          key: "step:title",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
        durationFrames: 180,
      })
    ).toBe(36);
  });

  it("centres verifier-bound drawing beats around narration cues", () => {
    const steps = [
      {
        key: "step:title",
        factId: null,
        durationWeight: 0.5,
        pauseAfterFrames: 0,
      },
      {
        key: "step:grid",
        factId: null,
        durationWeight: 1,
        pauseAfterFrames: 0,
      },
      {
        key: "step:value-a",
        factId: "fact-a",
        durationWeight: 1,
        pauseAfterFrames: 12,
      },
      {
        key: "step:value-b",
        factId: "fact-a",
        durationWeight: 1.5,
        pauseAfterFrames: 0,
      },
      {
        key: "step:result",
        factId: "fact-b",
        durationWeight: 1.2,
        pauseAfterFrames: 0,
      },
    ] as const;
    const schedule = createSemanticChalkSchedule({
      steps,
      sceneFrames: 900,
      cues: [
        { factId: "fact-a", frame: 420 },
        { factId: "fact-b", frame: 690 },
      ],
    });
    const midpoint = (index: number) =>
      ((schedule[index]?.startFrame ?? 0) + (schedule[index]?.endFrame ?? 0)) /
      2;
    expect(Math.abs(midpoint(2) - 420)).toBeLessThanOrEqual(180);
    expect(Math.abs(midpoint(4) - 690)).toBeLessThanOrEqual(180);
    expect(
      Math.max(...schedule.map((timing) => timing.endFrame - timing.startFrame))
    ).toBeLessThanOrEqual(180);
  });

  it("keeps the M5-ZO-002 objective scene within the render guard ceiling", () => {
    const schedule = createSemanticChalkSchedule({
      steps: [
        {
          key: "step:title",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
        {
          key: "step:rule",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
        {
          key: "step:body",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
        {
          key: "step:prompt",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
      ],
      sceneFrames: 1_048,
      cues: [],
    });
    const intervals = [
      ...schedule.map((timing) => timing.endFrame - timing.startFrame),
      1_048 - schedule.at(-1)!.endFrame,
    ];

    expect(Math.max(...intervals)).toBeLessThanOrEqual(225);
  });

  it("uses declared chalk weights and leaves a short thinking pause", () => {
    const steps = extractSemanticChalkSteps(
      '<svg><g data-chalk-step="heading" data-chalk-weight="0.5"></g><g data-chalk-step="zero" data-chalk-weight="1.7" data-chalk-pause="18"></g><g data-chalk-step="repair"></g></svg>'
    );
    const schedule = createSemanticChalkSchedule({
      steps,
      sceneFrames: 480,
    });

    expect(steps[1]).toMatchObject({
      durationWeight: 1.7,
      pauseAfterFrames: 18,
    });
    expect(schedule[1]!.endFrame - schedule[1]!.startFrame).toBeGreaterThan(
      schedule[0]!.endFrame - schedule[0]!.startFrame
    );
    expect(schedule[2]!.startFrame - schedule[1]!.endFrame).toBe(18);
  });
});
