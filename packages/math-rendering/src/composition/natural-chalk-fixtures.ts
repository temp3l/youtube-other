import { hashText } from "@mediaforge/shared";

import {
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
} from "./semantic-chalk.js";

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#102b26"/><g data-chalk-step="fixture" data-chalk-box="160,120,1600,840">${body}</g></svg>`;
}

const cases = [
  {
    id: "locale-diacritics",
    body: '<text x="160" y="280" font-size="78" fill="#f4efd8">Äquivalenz · français · español · português</text>',
  },
  {
    id: "repeated-digits-operators",
    body: '<text x="160" y="280" font-size="96" fill="#f4efd8">1000 + 2000 = 3000 × 10 %</text>',
  },
  {
    id: "place-value-table",
    body: '<path d="M260 260H1660M260 460H1660M260 260V620M610 260V620M960 260V620M1310 260V620M1660 260V620" fill="none" stroke="#f4efd8" stroke-width="7"/><text x="330" y="390" font-size="82" fill="#f4efd8">7</text><text x="680" y="390" font-size="82" fill="#f4efd8">0</text><text x="1030" y="390" font-size="82" fill="#f4efd8">4</text>',
  },
  {
    id: "fraction",
    body: '<text x="760" y="370" font-size="96" fill="#f4efd8">3</text><path d="M700 420H920" stroke="#f4efd8" stroke-width="8"/><text x="760" y="540" font-size="96" fill="#f4efd8">4</text>',
  },
  {
    id: "linear-equation",
    body: '<text x="340" y="420" font-size="104" fill="#f4efd8">3x + 5 = 20  →  x = 5</text>',
  },
  {
    id: "coordinate-graph",
    body: '<path d="M300 760H1600M480 900V160M480 720L1420 260" fill="none" stroke="#f4efd8" stroke-width="8"/><text x="1450" y="250" font-size="72" fill="#f4efd8">f(x)=2x+1</text>',
  },
  {
    id: "geometry",
    body: '<path d="M420 760L960 220L1500 760Z" fill="none" stroke="#f4efd8" stroke-width="8"/><path d="M900 760A60 60 0 0 1 942 702" fill="none" stroke="#f4c95d" stroke-width="8"/><text x="940" y="860" font-size="72" fill="#f4efd8">90°</text>',
  },
  {
    id: "upper-grade-formula",
    body: '<text x="300" y="420" font-size="96" fill="#f4efd8">a² + b² = c² · sin(α) = a/c · √x</text>',
  },
] as const;

export interface NaturalChalkGoldenFixture {
  readonly id: string;
  readonly midpointSvg: string;
  readonly completeSvg: string;
  readonly midpointHash: string;
  readonly completeHash: string;
}

export function createNaturalChalkGoldenFixtures(): NaturalChalkGoldenFixture[] {
  return cases.map((fixture) => {
    const source = svg(fixture.body);
    const steps = extractSemanticChalkSteps(source);
    const midpointSvg = renderSemanticChalkFrame({
      svgMarkup: source,
      steps,
      localFrame: 44,
      sceneFrames: 100,
    }).svgMarkup;
    const completeSvg = renderSemanticChalkFrame({
      svgMarkup: source,
      steps,
      localFrame: 100,
      sceneFrames: 100,
    }).svgMarkup;
    return {
      id: fixture.id,
      midpointSvg,
      completeSvg,
      midpointHash: hashText(midpointSvg),
      completeHash: hashText(completeSvg),
    };
  });
}
