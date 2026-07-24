export const MATH_SEMANTIC_CHALK_VERSION = "math-semantic-chalk.v2" as const;

export interface SemanticChalkFrame {
  readonly svgMarkup: string;
  readonly revealing: boolean;
  readonly activeStep: number;
  readonly activeFactId: string | null;
  readonly stepProgress: number;
  readonly guide: {
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
  } | null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function extractSemanticChalkSteps(svgMarkup: string): string[] {
  const factIds = unique(
    [...svgMarkup.matchAll(/data-fact-id="([a-z0-9-]+)"/gu)]
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value))
  );
  if (factIds.length > 0) return factIds;
  return /<(?:text|foreignObject)\b/iu.test(svgMarkup)
    ? ["__unbound-text__"]
    : [];
}

function hideElement(openingTag: string): string {
  return openingTag.endsWith("/>")
    ? `${openingTag.slice(0, -2)} opacity="0"/>`
    : `${openingTag.slice(0, -1)} opacity="0">`;
}

function applyVisibility(
  svgMarkup: string,
  steps: readonly string[],
  visibleSteps: number
): string {
  const visible = new Set(steps.slice(0, visibleSteps));
  let result = svgMarkup.replace(
    /<(?:text|path|line|circle|ellipse|polygon|polyline|rect|foreignObject)\b[^>]*data-fact-id="([a-z0-9-]+)"[^>]*\/?>/gu,
    (openingTag, factId: string) =>
      visible.has(factId) ? openingTag : hideElement(openingTag)
  );
  if (steps.includes("__unbound-text__") && !visible.has("__unbound-text__")) {
    result = result.replace(
      /<(?:text|foreignObject)\b(?![^>]*data-fact-id=)[^>]*\/?>/gu,
      (openingTag) => hideElement(openingTag)
    );
  }
  return result;
}

function chalkGuide(
  svgMarkup: string,
  factId: string,
  activeStep: number
): SemanticChalkFrame["guide"] {
  if (factId === "__unbound-text__") {
    return { x1: 320, x2: 1600, y: 610 };
  }
  const tag = svgMarkup.match(
    new RegExp(`<[^>]+data-fact-id="${factId}"[^>]*>`, "u")
  )?.[0];
  const attribute = (name: string): number | undefined => {
    const value = tag?.match(new RegExp(`\\b${name}="(-?\\d+(?:\\.\\d+)?)"`, "u"))?.[1];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const x = attribute("x") ?? attribute("cx") ?? 320;
  const y = attribute("y") ?? attribute("cy") ?? 360 + activeStep * 150;
  const width = attribute("width") ?? 1_200;
  return {
    x1: Math.max(180, x - (attribute("cx") === undefined ? 0 : 420)),
    x2: Math.min(1_740, x + Math.max(720, width)),
    y: Math.min(820, Math.max(180, y + 34)),
  };
}

export function semanticChalkWritingFrames(sceneFrames: number): number {
  return Math.min(
    180,
    Math.max(75, Math.floor(sceneFrames * 0.34))
  );
}

export function renderSemanticChalkFrame(args: {
  readonly svgMarkup: string;
  readonly steps: readonly string[];
  readonly localFrame: number;
  readonly sceneFrames: number;
}): SemanticChalkFrame {
  const writingFrames = semanticChalkWritingFrames(args.sceneFrames);
  if (args.steps.length === 0) {
    return {
      svgMarkup: args.svgMarkup,
      revealing: false,
      activeStep: 0,
      activeFactId: null,
      stepProgress: 1,
      guide: null,
    };
  }
  const boundedFrame = Math.max(0, Math.min(writingFrames, args.localFrame));
  const scaled = (boundedFrame / writingFrames) * args.steps.length;
  const visibleSteps = Math.min(args.steps.length, Math.floor(scaled));
  const activeStep = Math.min(args.steps.length - 1, visibleSteps);
  const activeFactId = args.steps[activeStep] ?? null;
  return {
    svgMarkup: applyVisibility(args.svgMarkup, args.steps, visibleSteps),
    revealing: args.localFrame >= 0 && args.localFrame < writingFrames,
    activeStep,
    activeFactId,
    stepProgress: Math.max(0, Math.min(1, scaled - visibleSteps)),
    guide: activeFactId
      ? chalkGuide(args.svgMarkup, activeFactId, activeStep)
      : null,
  };
}
