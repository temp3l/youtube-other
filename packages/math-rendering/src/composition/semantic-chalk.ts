export const MATH_SEMANTIC_CHALK_VERSION = "math-semantic-chalk.v3" as const;

export interface SemanticChalkStep {
  readonly key: string;
  readonly factId: string | null;
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
    }));
  return /<(?:text|foreignObject)\b/iu.test(svgMarkup)
    ? [{ key: "__unbound-text__", factId: null }]
    : [];
}

export function semanticChalkWritingFrames(
  sceneFrames: number,
  stepCount = 1
): number {
  if (stepCount <= 0) return 0;
  const finalDwellFrames = Math.min(
    180,
    Math.max(
      36,
      Math.floor(sceneFrames * 0.12),
      sceneFrames - stepCount * 180
    )
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
  const starts: number[] = [];
  for (const [index, step] of args.steps.entries()) {
    const base = Math.floor((index * writingFrames) / args.steps.length);
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
      index === 0 ? 0 : (starts[index - 1] ?? 0) + 180;
    starts.push(
      Math.max(earliest, Math.min(latest, maximumFromPrevious, desired))
    );
  }
  if (writingFrames <= args.steps.length * 180) {
    let following = writingFrames;
    for (let index = starts.length - 1; index >= 1; index -= 1) {
      starts[index] = Math.max(starts[index] ?? 0, following - 180);
      following = starts[index]!;
    }
  }
  return args.steps.map((step, index) => ({
    stepKey: step.key,
    startFrame: starts[index] ?? 0,
    endFrame: starts[index + 1] ?? writingFrames,
  }));
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

function progressiveElement(
  openingTag: string,
  progress: number,
  clipId: string
): string {
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
  return setAttribute(result, "clip-path", `url(#${clipId})`);
}

function applyVisibility(args: {
  readonly svgMarkup: string;
  readonly steps: readonly SemanticChalkStep[];
  readonly completedStepKeys: ReadonlySet<string>;
  readonly activeStepKey: string | null;
  readonly activeProgress: number;
  readonly activeBounds: SemanticChalkFrame["activeBounds"];
}): string {
  const clipId = "semantic-chalk-active-clip";
  let result = args.svgMarkup.replace(
    new RegExp(`<(?:${revealableElement})\\b[^>]*\\/?>`, "gu"),
    (openingTag) => {
      const key = stepKeyForTag(openingTag, args.steps);
      if (!key || args.completedStepKeys.has(key)) return openingTag;
      if (key === args.activeStepKey)
        return progressiveElement(openingTag, args.activeProgress, clipId);
      return setAttribute(openingTag, "opacity", "0");
    }
  );
  if (args.activeStepKey && args.activeBounds) {
    const width = Math.max(0.01, args.activeBounds.width * args.activeProgress);
    const clip = `<defs data-semantic-chalk-clip="true"><clipPath id="${clipId}"><rect x="${args.activeBounds.x}" y="${args.activeBounds.y}" width="${width}" height="${args.activeBounds.height}"/></clipPath></defs>`;
    result = result.replace(/(<svg\b[^>]*>)/u, `$1${clip}`);
  }
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
  return {
    svgMarkup: applyVisibility({
      svgMarkup: args.svgMarkup,
      steps: args.steps,
      completedStepKeys: completed,
      activeStepKey: active?.key ?? null,
      activeProgress: progress,
      activeBounds,
    }),
    revealing: Boolean(activeTiming),
    activeStep,
    activeStepKey: active?.key ?? null,
    activeFactId: active?.factId ?? null,
    stepProgress: progress,
    activeBounds,
  };
}
