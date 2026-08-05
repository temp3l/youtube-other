import {
  injectStableChalkMaterial,
  renderNaturalChalkGroup,
  renderNaturalChalkText,
  segmentChalkGraphemes,
} from "./natural-chalk.js";

export const MATH_SEMANTIC_CHALK_VERSION = "math-semantic-chalk.v7" as const;
export const MATH_SEMANTIC_CHALK_MAX_STATIC_INTERVAL_FRAMES = 225;
const MATH_SEMANTIC_CHALK_PREFERRED_STEP_FRAMES = 180;

export interface SemanticChalkStep {
  readonly key: string;
  readonly factId: string | null;
  readonly durationWeight: number;
  readonly pauseAfterFrames: number;
}

export interface SemanticChalkCue {
  readonly factId: string;
  readonly frame: number;
}

export interface SemanticChalkStepTiming {
  readonly stepKey: string;
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface SemanticChalkFrame {
  readonly svgMarkup: string;
  readonly revealing: boolean;
  readonly activeStep: number;
  readonly activeStepKey: string | null;
  readonly activeFactId: string | null;
  readonly stepProgress: number;
  readonly activeBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

const revealableElement =
  "g|text|path|line|circle|ellipse|polygon|polyline|rect|foreignObject";

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "u"))?.[1] ?? null;
}

function positiveAttribute(
  tag: string,
  name: string,
  fallback: number
): number {
  const value = Number(attribute(tag, name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeAttribute(
  tag: string,
  name: string,
  fallback: number
): number {
  const value = Number(attribute(tag, name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, "u");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return tag.endsWith("/>")
    ? `${tag.slice(0, -2)} ${name}="${value}"/>`
    : `${tag.slice(0, -1)} ${name}="${value}">`;
}

export function extractSemanticChalkSteps(
  svgMarkup: string
): SemanticChalkStep[] {
  const explicit = [
    ...svgMarkup.matchAll(
      new RegExp(
        `<(?:${revealableElement})\\b[^>]*data-chalk-step="([a-z0-9-]+)"[^>]*>`,
        "gu"
      )
    ),
  ].map((match) => ({
    key: `step:${match[1]}`,
    factId: attribute(match[0], "data-fact-id"),
    durationWeight: positiveAttribute(match[0], "data-chalk-weight", 1),
    pauseAfterFrames: Math.round(
      nonNegativeAttribute(match[0], "data-chalk-pause", 0)
    ),
  }));
  if (explicit.length > 0) {
    const seen = new Set<string>();
    return explicit.filter((step) => {
      if (seen.has(step.key)) return false;
      seen.add(step.key);
      return true;
    });
  }

  const factIds = [
    ...new Set(
      [...svgMarkup.matchAll(/data-fact-id="([a-z0-9-]+)"/gu)]
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    ),
  ];
  if (factIds.length > 0)
    return factIds.map((factId) => ({
      key: `fact:${factId}`,
      factId,
      durationWeight: 1,
      pauseAfterFrames: 0,
    }));
  return /<(?:text|foreignObject)\b/iu.test(svgMarkup)
    ? [
        {
          key: "__unbound-text__",
          factId: null,
          durationWeight: 1,
          pauseAfterFrames: 0,
        },
      ]
    : [];
}

function stepMarkup(svgMarkup: string, step: SemanticChalkStep): string {
  if (step.key === "__unbound-text__") return svgMarkup;
  const selector = step.key.startsWith("step:")
    ? `data-chalk-step="${step.key.slice(5)}"`
    : `data-fact-id="${step.factId ?? ""}"`;
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const group = svgMarkup.match(
    new RegExp(`<g\\b[^>]*${escaped}[^>]*>([\\s\\S]*?)<\\/g>`, "u")
  )?.[1];
  if (group) return group;
  return (
    svgMarkup.match(
      new RegExp(
        `<(?:text|path|line|circle|ellipse|polygon|polyline|rect)\\b[^>]*${escaped}[^>]*(?:>[\\s\\S]*?<\\/text>|\\/>)`,
        "u"
      )
    )?.[0] ?? ""
  );
}

export function semanticChalkStepSampleCount(args: {
  readonly svgMarkup: string;
  readonly step: SemanticChalkStep;
  readonly durationFrames: number;
}): number {
  const markup = stepMarkup(args.svgMarkup, args.step);
  const glyphCount = [...markup.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/giu)]
    .map((match) =>
      match[1]
        ?.replace(/<[^>]+>/gu, "")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&#160;", " ")
    )
    .filter((text): text is string => text !== undefined)
    .reduce((count, text) => count + segmentChalkGraphemes(text).length, 0);
  const shapeCount = (
    markup.match(/<(?:path|line|circle|ellipse|polygon|polyline|rect)\b/giu) ??
    []
  ).length;
  const desired = Math.max(8, glyphCount, shapeCount * 8);
  return Math.max(1, Math.min(36, args.durationFrames, desired));
}

export function semanticChalkWritingFrames(
  sceneFrames: number,
  stepCount = 1
): number {
  if (stepCount <= 0) return 0;
  const finalDwellFrames = Math.min(
    MATH_SEMANTIC_CHALK_MAX_STATIC_INTERVAL_FRAMES,
    Math.max(36, Math.floor(sceneFrames * 0.12), sceneFrames - stepCount * 180)
  );
  return Math.max(1, sceneFrames - finalDwellFrames);
}

export function createSemanticChalkSchedule(args: {
  readonly steps: readonly SemanticChalkStep[];
  readonly sceneFrames: number;
  readonly cues?: readonly SemanticChalkCue[];
  readonly writingEndFrame?: number;
}): SemanticChalkStepTiming[] {
  if (args.steps.length === 0) return [];
  const writingFrames = Math.max(
    1,
    Math.min(
      args.sceneFrames - 1,
      args.writingEndFrame ??
        semanticChalkWritingFrames(args.sceneFrames, args.steps.length)
    )
  );
  const cueByFact = new Map(
    (args.cues ?? []).map((cue) => [
      cue.factId,
      Math.max(0, Math.min(writingFrames - 1, cue.frame)),
    ])
  );
  const indexesByFact = new Map<string, number[]>();
  for (const [index, step] of args.steps.entries()) {
    if (!step.factId) continue;
    const indexes = indexesByFact.get(step.factId) ?? [];
    indexes.push(index);
    indexesByFact.set(step.factId, indexes);
  }
  const minimumSpacing = Math.max(
    1,
    Math.min(18, Math.floor(writingFrames / Math.max(1, args.steps.length * 2)))
  );
  const cueSpacing = Math.max(
    minimumSpacing,
    Math.min(45, Math.floor(writingFrames / Math.max(1, args.steps.length)))
  );
  const totalPauseFrames = Math.min(
    Math.floor(writingFrames * 0.24),
    args.steps.reduce(
      (total, step) => total + Math.min(45, step.pauseAfterFrames),
      0
    )
  );
  const weightedWritingFrames = Math.max(
    args.steps.length,
    writingFrames - totalPauseFrames
  );
  const totalWeight = args.steps.reduce(
    (total, step) => total + step.durationWeight,
    0
  );
  let accumulatedWeight = 0;
  let accumulatedPause = 0;
  const starts: number[] = [];
  for (const [index, step] of args.steps.entries()) {
    const base = Math.floor(
      accumulatedPause +
        (accumulatedWeight * weightedWritingFrames) / totalWeight
    );
    const cue = step.factId ? cueByFact.get(step.factId) : undefined;
    const factIndexes = step.factId
      ? indexesByFact.get(step.factId)
      : undefined;
    let desired = base;
    if (cue !== undefined && factIndexes) {
      const ordinal = factIndexes.indexOf(index);
      const cueAligned =
        cue -
        ((factIndexes.length - 1) * cueSpacing) / 2 +
        ordinal * cueSpacing;
      desired = Math.round(base * 0.45 + cueAligned * 0.55);
    }
    const earliest =
      index === 0 ? 0 : (starts[index - 1] ?? 0) + minimumSpacing;
    const latest =
      writingFrames - 1 - (args.steps.length - index - 1) * minimumSpacing;
    const maximumFromPrevious =
      index === 0
        ? 0
        : (starts[index - 1] ?? 0) + MATH_SEMANTIC_CHALK_PREFERRED_STEP_FRAMES;
    starts.push(
      Math.max(earliest, Math.min(latest, maximumFromPrevious, desired))
    );
    accumulatedWeight += step.durationWeight;
    accumulatedPause += Math.min(45, step.pauseAfterFrames);
  }
  if (
    writingFrames <=
    args.steps.length * MATH_SEMANTIC_CHALK_MAX_STATIC_INTERVAL_FRAMES
  ) {
    const maximumStepFrames =
      writingFrames <=
      args.steps.length * MATH_SEMANTIC_CHALK_PREFERRED_STEP_FRAMES
        ? MATH_SEMANTIC_CHALK_PREFERRED_STEP_FRAMES
        : MATH_SEMANTIC_CHALK_MAX_STATIC_INTERVAL_FRAMES;
    let following = writingFrames;
    for (let index = starts.length - 1; index >= 1; index -= 1) {
      starts[index] = Math.max(
        starts[index] ?? 0,
        following - maximumStepFrames
      );
      following = starts[index]!;
    }
  }
  return args.steps.map((step, index) => {
    const startFrame = starts[index] ?? 0;
    const followingStart = starts[index + 1] ?? writingFrames;
    const pause = Math.min(
      step.pauseAfterFrames,
      Math.max(0, followingStart - startFrame - 1)
    );
    return {
      stepKey: step.key,
      startFrame,
      endFrame: Math.max(startFrame + 1, followingStart - pause),
    };
  });
}

function boundsForStep(
  svgMarkup: string,
  step: SemanticChalkStep,
  activeStep: number
): SemanticChalkFrame["activeBounds"] {
  const selector =
    step.key === "__unbound-text__"
      ? "<(?:text|foreignObject)\\b[^>]*>"
      : step.key.startsWith("step:")
        ? `<[^>]+data-chalk-step="${step.key.slice(5)}"[^>]*>`
        : `<[^>]+data-fact-id="${step.factId ?? ""}"[^>]*>`;
  const tag = svgMarkup.match(new RegExp(selector, "u"))?.[0];
  const declared = attribute(tag ?? "", "data-chalk-box")
    ?.split(",")
    .map(Number);
  if (
    declared?.length === 4 &&
    declared.every((value) => Number.isFinite(value))
  )
    return {
      x: declared[0]!,
      y: declared[1]!,
      width: Math.max(1, declared[2]!),
      height: Math.max(1, declared[3]!),
    };
  const numeric = (name: string): number | undefined => {
    const parsed = Number(attribute(tag ?? "", name));
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const x = numeric("x") ?? numeric("cx") ?? 280;
  const y = numeric("y") ?? numeric("cy") ?? 260 + activeStep * 90;
  return {
    x: Math.max(96, numeric("x") ?? x - 80),
    y: Math.max(54, numeric("y") ?? y - 100),
    width: Math.min(1728, numeric("width") ?? 1_360),
    height: Math.min(820, numeric("height") ?? 150),
  };
}

function stepKeyForTag(
  tag: string,
  steps: readonly SemanticChalkStep[]
): string | null {
  const explicit = attribute(tag, "data-chalk-step");
  if (explicit) return `step:${explicit}`;
  const factId = attribute(tag, "data-fact-id");
  if (factId && steps.some((step) => step.key === `fact:${factId}`))
    return `fact:${factId}`;
  if (
    steps.some((step) => step.key === "__unbound-text__") &&
    /^<(?:text|foreignObject)\b/iu.test(tag) &&
    !factId
  )
    return "__unbound-text__";
  return null;
}

function progressiveElement(openingTag: string, progress: number): string {
  const shape = /^<(path|line|circle|ellipse|polygon|polyline|rect)\b/iu.test(
    openingTag
  );
  const hasStroke =
    attribute(openingTag, "stroke") !== null &&
    attribute(openingTag, "stroke") !== "none";
  let result = setAttribute(openingTag, "opacity", "1");
  if (shape && hasStroke) {
    result = setAttribute(result, "pathLength", "1");
    result = setAttribute(result, "stroke-dasharray", "1");
    result = setAttribute(
      result,
      "stroke-dashoffset",
      String(Math.max(0, 1 - progress))
    );
    if (
      attribute(result, "fill") !== null &&
      attribute(result, "fill") !== "none"
    )
      result = setAttribute(result, "fill-opacity", String(progress * 0.3));
    return result;
  }
  if (/^<g\b/iu.test(result)) return result;
  result = setAttribute(result, "stroke-linecap", "round");
  result = setAttribute(result, "stroke-linejoin", "round");
  result = setAttribute(result, "stroke-dasharray", "11 7");
  result = setAttribute(
    result,
    "stroke-dashoffset",
    String((1 - progress) * 42)
  );
  result = setAttribute(
    result,
    "fill-opacity",
    String(Math.min(0.3, progress))
  );
  return setAttribute(result, "data-chalk-fallback", "token-grain");
}

function activeMarkup(args: {
  readonly svgMarkup: string;
  readonly step: SemanticChalkStep;
  readonly progress: number;
}): string {
  const seed = `${MATH_SEMANTIC_CHALK_VERSION}:${args.step.key}`;
  const selector =
    args.step.key === "__unbound-text__"
      ? null
      : args.step.key.startsWith("step:")
        ? `data-chalk-step="${args.step.key.slice(5)}"`
        : `data-fact-id="${args.step.factId ?? ""}"`;
  if (selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const groupPattern = new RegExp(
      `(<g\\b[^>]*${escaped}[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      "u"
    );
    if (groupPattern.test(args.svgMarkup))
      return args.svgMarkup.replace(
        groupPattern,
        (_match, opening: string, inner: string, closing: string) =>
          `${opening}${renderNaturalChalkGroup({
            markup: inner,
            progress: args.progress,
            seed,
          })}${closing}`
      );
    const textPattern = new RegExp(
      `(<text\\b[^>]*${escaped}[^>]*>)([\\s\\S]*?)(<\\/text>)`,
      "u"
    );
    if (textPattern.test(args.svgMarkup))
      return args.svgMarkup.replace(
        textPattern,
        (_match, opening: string, inner: string) =>
          renderNaturalChalkText({
            openingTag: opening,
            innerMarkup: inner,
            progress: args.progress,
            seed,
          })
      );
    return args.svgMarkup;
  }
  const unboundText =
    /(<text\b(?![^>]*data-fact-id)[^>]*>)([\s\S]*?)(<\/text>)/iu;
  return args.svgMarkup.replace(
    unboundText,
    (_match, opening: string, inner: string) =>
      renderNaturalChalkText({
        openingTag: opening,
        innerMarkup: inner,
        progress: args.progress,
        seed,
      })
  );
}

function applyVisibility(args: {
  readonly svgMarkup: string;
  readonly steps: readonly SemanticChalkStep[];
  readonly completedStepKeys: ReadonlySet<string>;
  readonly activeStepKey: string | null;
  readonly activeProgress: number;
}): string {
  let result = args.svgMarkup.replace(
    new RegExp(`<(?:${revealableElement})\\b[^>]*\\/?>`, "gu"),
    (openingTag) => {
      const key = stepKeyForTag(openingTag, args.steps);
      if (!key || args.completedStepKeys.has(key)) return openingTag;
      if (key === args.activeStepKey)
        return progressiveElement(openingTag, args.activeProgress);
      return setAttribute(openingTag, "opacity", "0");
    }
  );
  return result;
}

export function renderSemanticChalkFrame(args: {
  readonly svgMarkup: string;
  readonly steps: readonly SemanticChalkStep[];
  readonly localFrame: number;
  readonly sceneFrames: number;
  readonly cues?: readonly SemanticChalkCue[];
  readonly schedule?: readonly SemanticChalkStepTiming[];
}): SemanticChalkFrame {
  if (args.steps.length === 0) {
    return {
      svgMarkup: args.svgMarkup,
      revealing: false,
      activeStep: 0,
      activeStepKey: null,
      activeFactId: null,
      stepProgress: 1,
      activeBounds: null,
    };
  }
  const schedule =
    args.schedule ??
    createSemanticChalkSchedule({
      steps: args.steps,
      sceneFrames: args.sceneFrames,
      ...(args.cues ? { cues: args.cues } : {}),
    });
  const boundedFrame = Math.max(0, Math.min(args.sceneFrames, args.localFrame));
  const activeIndex = schedule.findIndex(
    (timing) =>
      boundedFrame >= timing.startFrame && boundedFrame < timing.endFrame
  );
  const completed = new Set(
    schedule
      .filter((timing) => boundedFrame >= timing.endFrame)
      .map((timing) => timing.stepKey)
  );
  const activeTiming = activeIndex >= 0 ? schedule[activeIndex] : null;
  const activeStep = activeIndex >= 0 ? activeIndex : args.steps.length - 1;
  const active = activeIndex >= 0 ? (args.steps[activeIndex] ?? null) : null;
  const progress = activeTiming
    ? Math.max(
        0,
        Math.min(
          1,
          (boundedFrame - activeTiming.startFrame) /
            Math.max(1, activeTiming.endFrame - activeTiming.startFrame)
        )
      )
    : 1;
  const activeBounds = active
    ? boundsForStep(args.svgMarkup, active, activeStep)
    : null;
  const naturalMarkup = args.steps.reduce((markup, step) => {
    const stepProgress = completed.has(step.key)
      ? 1
      : step.key === active?.key
        ? progress
        : null;
    return stepProgress === null
      ? markup
      : activeMarkup({
          svgMarkup: markup,
          step,
          progress: stepProgress,
        });
  }, args.svgMarkup);
  return {
    svgMarkup: injectStableChalkMaterial(
      applyVisibility({
        svgMarkup: naturalMarkup,
        steps: args.steps,
        completedStepKeys: completed,
        activeStepKey: active?.key ?? null,
        activeProgress: progress,
      }),
      MATH_SEMANTIC_CHALK_VERSION
    ),
    revealing: Boolean(activeTiming),
    activeStep,
    activeStepKey: active?.key ?? null,
    activeFactId: active?.factId ?? null,
    stepProgress: progress,
    activeBounds,
  };
}
