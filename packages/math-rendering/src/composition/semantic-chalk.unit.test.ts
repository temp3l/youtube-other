import { describe, expect, it } from "vitest";

import {
  createSemanticChalkSchedule,
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
} from "./semantic-chalk.js";

describe("semantic chalk frames", () => {
  it("reveals actual verifier-bound elements in declared board order", () => {
    const svg =
      '<svg><rect width="10"/><g data-chalk-step="sum" data-chalk-box="100,100,500,100" data-fact-id="fact-a"><text>12+3</text></g><g data-chalk-step="answer" data-chalk-box="100,250,500,100" data-fact-id="fact-b"><text>15</text></g></svg>';
    const steps = extractSemanticChalkSteps(svg);
    expect(steps).toEqual([
      { key: "step:sum", factId: "fact-a" },
      { key: "step:answer", factId: "fact-b" },
    ]);
    const start = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 0,
      sceneFrames: 600,
    });
    expect(start.svgMarkup).toContain("semantic-chalk-active-clip");
    expect(start.svgMarkup).toMatch(/data-chalk-step="sum"[^>]*clip-path=/u);
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
    expect(complete.svgMarkup).toBe(svg);
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

  it("centres verifier-bound drawing beats around narration cues", () => {
    const steps = [
      { key: "step:title", factId: null },
      { key: "step:grid", factId: null },
      { key: "step:value-a", factId: "fact-a" },
      { key: "step:value-b", factId: "fact-a" },
      { key: "step:result", factId: "fact-b" },
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

  it("uses final dwell time to keep sparse scenes under six seconds per beat", () => {
    const schedule = createSemanticChalkSchedule({
      steps: [
        { key: "step:title", factId: null },
        { key: "step:rule", factId: null },
        { key: "step:body", factId: null },
        { key: "step:prompt", factId: null },
      ],
      sceneFrames: 815,
      cues: [],
    });
    const intervals = [
      ...schedule.map((timing) => timing.endFrame - timing.startFrame),
      815 - schedule.at(-1)!.endFrame,
    ];

    expect(Math.max(...intervals)).toBeLessThanOrEqual(180);
  });
});
