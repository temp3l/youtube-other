import { describe, expect, it } from "vitest";

import {
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
} from "./semantic-chalk.js";

describe("semantic chalk frames", () => {
  it("reveals complete verifier-bound facts in order without partial claims", () => {
    const svg = '<svg><rect width="10"/><text data-fact-id="fact-a">12+3</text><text data-fact-id="fact-b">15</text></svg>';
    const steps = extractSemanticChalkSteps(svg);
    expect(steps).toEqual(["fact-a", "fact-b"]);
    const start = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 0,
      sceneFrames: 600,
    });
    expect(start.svgMarkup).toContain('data-fact-id="fact-a" opacity="0"');
    const middle = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 90,
      sceneFrames: 600,
    });
    expect(middle.svgMarkup).toContain('data-fact-id="fact-a">12+3</text>');
    expect(middle.svgMarkup).toContain('data-fact-id="fact-b" opacity="0"');
    const complete = renderSemanticChalkFrame({
      svgMarkup: svg,
      steps,
      localFrame: 180,
      sceneFrames: 600,
    });
    expect(complete.svgMarkup).toBe(svg);
  });
});
