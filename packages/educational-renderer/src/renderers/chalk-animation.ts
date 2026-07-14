import type { NormalizedRenderProfile, VisualScene } from "../contracts.js";
import { buildFormulaLayoutPlan, type FormulaLayoutPlan, type FormulaVisualOp } from "./formula-svg.js";

export const CHALK_RENDERER_VERSION = "svg-chalk.v3";
type ChalkAnimatedScene = Extract<VisualScene, { type: "equation" | "equation-transformation" }>;
type ChalkFrame = { readonly svg: string; readonly durationMs: number };
type ChalkTextOp = { readonly text: string; readonly x: number; readonly y: number; readonly fontSize: number; readonly semantic: "cue" | "operator" | "equals"; readonly tipX: number; readonly tipY: number };

const configuredFontFamily = "renderer-font";
const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const text = (x: number, y: number, value: string, size: number, anchor = "middle", fill = "#f8fafc", weight = 400): string => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="${configuredFontFamily}" font-size="${size}" font-weight="${weight}">${escape(value)}</text>`;
const hashUnit = (seed: number, salt: number): number => {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const wobble = (seed: number, amount: number, salt: number): number => (hashUnit(seed, salt) - .5) * amount;
const classifyCue = (character: string): ChalkTextOp["semantic"] => character === "=" ? "equals" : "+-−×÷·≤≥≠±↓".includes(character) ? "operator" : "cue";
const transformPoint = (plan: FormulaLayoutPlan, x: number, y: number): { x: number; y: number } => ({ x: plan.translateX + x * plan.scale, y: plan.translateY + y * plan.scale });
const fontUrl = (fontFile: string): string => `file://${fontFile.replaceAll("%", "%25").replaceAll("#", "%23").replaceAll(" ", "%20")}`;

export function isChalkAnimatedScene(scene: VisualScene): scene is ChalkAnimatedScene {
  return (scene.type === "equation" || scene.type === "equation-transformation") && scene.animation?.mode === "chalk-write";
}
function renderChalkFormulaOp(op: FormulaVisualOp, index: number, fill: string): string {
  const offsetX = wobble(index, 1.8, 1);
  const offsetY = wobble(index, 1.3, 2);
  if (op.kind === "text") {
    return `<g fill="${fill}" opacity=".96">`
      + `<text x="${op.x + offsetX}" y="${op.y + offsetY}" font-family="${configuredFontFamily}" font-size="${op.fontSize}" font-weight="600">${escape(op.text)}</text>`
      + `<text x="${op.x + wobble(index, 2.4, 3)}" y="${op.y + wobble(index, 1.8, 4)}" font-family="${configuredFontFamily}" font-size="${op.fontSize}" font-weight="600" opacity=".35">${escape(op.text)}</text>`
      + `<text x="${op.x + wobble(index, 1.5, 5)}" y="${op.y + wobble(index, 1.2, 6)}" font-family="${configuredFontFamily}" font-size="${op.fontSize}" font-weight="600" opacity=".22">${escape(op.text)}</text>`
      + `</g>`;
  }
  return `<g fill="none" stroke="${fill}" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="${op.d}" stroke-width="${op.strokeWidth}" opacity=".95"/>`
    + `<path d="${op.d}" stroke-width="${op.strokeWidth * 1.22}" opacity=".26" transform="translate(${wobble(index, 1.4, 7)} ${wobble(index, 1.1, 8)})"/>`
    + `<path d="${op.d}" stroke-width="${op.strokeWidth * .82}" opacity=".32" stroke-dasharray="${Math.max(4, op.strokeWidth * 1.6)} ${Math.max(3, op.strokeWidth)}"/>`
    + `</g>`;
}
function renderCueOp(op: ChalkTextOp, index: number, fill: string): string {
  return `<g fill="${fill}" opacity=".95">`
    + `<text x="${op.x + wobble(index, 1.4, 9)}" y="${op.y + wobble(index, 1.1, 10)}" font-family="${configuredFontFamily}" font-size="${op.fontSize}" font-weight="600">${escape(op.text)}</text>`
    + `<text x="${op.x + wobble(index, 1.8, 11)}" y="${op.y + wobble(index, 1.5, 12)}" font-family="${configuredFontFamily}" font-size="${op.fontSize}" font-weight="600" opacity=".28">${escape(op.text)}</text>`
    + `</g>`;
}
function renderTip(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">`
    + `<path d="M -24 -12 L 4 -4 L 18 0 L 4 4 L -24 12 Q -40 0 -24 -12" fill="#f8fafc" opacity=".9"/>`
    + `<path d="M 18 0 L 32 0" stroke="#fde68a" stroke-width="5" stroke-linecap="round"/>`
    + `<circle cx="34" cy="0" r="4" fill="#fde68a" opacity=".95"/>`
    + `<circle cx="40" cy="-3" r="1.8" fill="#fef3c7" opacity=".65"/>`
    + `<circle cx="41" cy="3" r="1.4" fill="#fef3c7" opacity=".55"/>`
    + `</g>`;
}
function renderFormulaSubset(plan: FormulaLayoutPlan, visible: number, fill: string, tipFallback: { x: number; y: number }): { markup: string; tip: { x: number; y: number } } {
  const visibleOps = plan.ops.slice(0, visible);
  const tipOp = visibleOps.at(-1);
  const tip = tipOp ? transformPoint(plan, tipOp.tipX, tipOp.tipY) : tipFallback;
  const body = visibleOps.map((op, index) => renderChalkFormulaOp(op, index, fill)).join("");
  return { markup: `<g transform="translate(${plan.translateX} ${plan.translateY}) scale(${plan.scale})">${body}</g>`, tip };
}
function buildCuePlan(value: string, centerX: number, y: number, fontSize: number): readonly ChalkTextOp[] {
  const characters = Array.from(value);
  const advance = fontSize * .58;
  const totalWidth = characters.length * advance;
  let cursor = centerX - totalWidth / 2;
  return characters.map((character) => {
    const op: ChalkTextOp = { text: character, x: cursor, y, fontSize, semantic: classifyCue(character), tipX: cursor + advance * .88, tipY: y - fontSize * .18 };
    cursor += advance;
    return op;
  });
}
function durationWeight(index: number, semantic: string): number {
  const base = semantic === "equals" ? 3.2 : semantic === "fraction-bar" ? 3.4 : semantic === "radical" ? 2.8 : semantic === "operator" ? 2.4 : semantic === "cue" ? 1.6 : 1.4;
  return base + hashUnit(index + 1, 13) * 1.25;
}
function distributeDurations(totalMs: number, frameRate: number, weights: readonly number[]): number[] {
  const totalFrames = Math.max(weights.length, Math.round(totalMs * frameRate / 1_000));
  const sum = weights.reduce((left, right) => left + right, 0);
  const frames = weights.map((weight) => Math.max(1, Math.floor(totalFrames * (weight / sum))));
  let delta = totalFrames - frames.reduce((left, right) => left + right, 0);
  let index = 0;
  while (delta !== 0 && frames.length > 0) {
    const at = index % frames.length;
    const current = frames[at];
    if (current === undefined) break;
    if (delta > 0) { frames[at] = current + 1; delta -= 1; }
    else if (current > 1) { frames[at] = current - 1; delta += 1; }
    index += 1;
  }
  let elapsedFrames = 0;
  let elapsedMs = 0;
  return frames.map((count, frameIndex) => {
    elapsedFrames += count;
    const endMs =
      frameIndex === frames.length - 1
        ? totalMs
        : Math.round((elapsedFrames / totalFrames) * totalMs);
    const durationMs = endMs - elapsedMs;
    elapsedMs = endMs;
    return durationMs;
  });
}
function sceneShell(profile: NormalizedRenderProfile, fontFile: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 ${profile.width} ${profile.height}">`
    + `<style>@font-face{font-family:${configuredFontFamily};src:url('${fontUrl(fontFile)}')}</style>`
    + `<rect width="100%" height="100%" fill="#07111f"/>`
    + `<circle cx="${profile.width*.92}" cy="${profile.height*.1}" r="${Math.min(profile.width,profile.height)*.18}" fill="#0c4a6e" opacity=".25"/>`
    + body
    + `</svg>`;
}
function buildEquationFrames(scene: Extract<ChalkAnimatedScene, { type: "equation" }>, profile: NormalizedRenderProfile, fontFile: string, animationDurationMs = scene.durationMs): readonly ChalkFrame[] {
  const center = profile.width / 2;
  const titleSize = Math.round(Math.min(profile.width / 14, profile.height / 10));
  const bodySize = Math.round(Math.min(profile.width / 24, profile.height / 17));
  const plan = buildFormulaLayoutPlan(scene.equation, center, profile.height * .54, titleSize, profile.width * .62);
  const weights: number[] = [];
  const states: Array<{ visibleFormulaOps: number }> = [];
  for (const [index, op] of plan.ops.entries()) {
    states.push({ visibleFormulaOps: index + 1 });
    weights.push(durationWeight(index, op.semantic));
    if (op.semantic !== "glyph") {
      states.push({ visibleFormulaOps: index + 1 });
      weights.push(durationWeight(index + 101, op.semantic) * .85);
    }
  }
  const durations = distributeDurations(animationDurationMs, profile.frameRate, weights);
  return states.map((state, index) => {
    const subset = renderFormulaSubset(plan, state.visibleFormulaOps, "#f8fafc", { x: center, y: profile.height * .54 });
    const completed = state.visibleFormulaOps === plan.ops.length;
    const body = `${scene.label ? text(center, profile.height*0.25, scene.label, bodySize, "middle", "#7dd3fc") : ""}`
      + `<rect x="${profile.width*0.14}" y="${profile.height*0.34}" width="${profile.width*0.72}" height="${profile.height*0.3}" rx="24" fill="#172554" stroke="#38bdf8" stroke-width="3"/>`
      + subset.markup
      + renderTip(subset.tip.x + 8, subset.tip.y - 4)
      + (completed && scene.highlight ? text(center, profile.height*0.76, scene.highlight, bodySize*.8, "middle", "#fde68a") : "");
    return { svg: sceneShell(profile, fontFile, body), durationMs: durations[index]! };
  });
}
function buildTransformationFrames(scene: Extract<ChalkAnimatedScene, { type: "equation-transformation" }>, profile: NormalizedRenderProfile, fontFile: string, animationDurationMs = scene.durationMs): readonly ChalkFrame[] {
  type TransformationState = { readonly kind: "equation-transformation"; readonly visibleFromOps: number; readonly visibleCueOps: number; readonly visibleToOps: number };
  const center = profile.width / 2;
  const titleSize = Math.round(Math.min(profile.width / 14, profile.height / 10));
  const bodySize = Math.round(Math.min(profile.width / 24, profile.height / 17));
  const fromPlan = buildFormulaLayoutPlan(scene.from, center, profile.height * .25, titleSize * .75, profile.width * .72);
  const cuePlan = buildCuePlan(`↓  ${scene.operation}`, center, profile.height * .44, bodySize);
  const toPlan = buildFormulaLayoutPlan(scene.to, center, profile.height * .68, titleSize, profile.width * .72);
  const steps: Array<{ readonly state: TransformationState; readonly durationMs: number }> = [];
  const weights: number[] = [];
  for (const [index, op] of fromPlan.ops.entries()) {
    steps.push({ state: { kind: "equation-transformation", visibleFromOps: index + 1, visibleCueOps: 0, visibleToOps: 0 }, durationMs: 0 });
    weights.push(durationWeight(index, op.semantic));
    if (op.semantic !== "glyph") { steps.push({ state: { kind: "equation-transformation", visibleFromOps: index + 1, visibleCueOps: 0, visibleToOps: 0 }, durationMs: 0 }); weights.push(durationWeight(index + 131, op.semantic) * .9); }
  }
  steps.push({ state: { kind: "equation-transformation", visibleFromOps: fromPlan.ops.length, visibleCueOps: 0, visibleToOps: 0 }, durationMs: 0 });
  weights.push(3.2);
  for (const [index, op] of cuePlan.entries()) {
    steps.push({ state: { kind: "equation-transformation", visibleFromOps: fromPlan.ops.length, visibleCueOps: index + 1, visibleToOps: 0 }, durationMs: 0 });
    weights.push(durationWeight(index + 201, op.semantic));
  }
  steps.push({ state: { kind: "equation-transformation", visibleFromOps: fromPlan.ops.length, visibleCueOps: cuePlan.length, visibleToOps: 0 }, durationMs: 0 });
  weights.push(2.8);
  for (const [index, op] of toPlan.ops.entries()) {
    steps.push({ state: { kind: "equation-transformation", visibleFromOps: fromPlan.ops.length, visibleCueOps: cuePlan.length, visibleToOps: index + 1 }, durationMs: 0 });
    weights.push(durationWeight(index + 301, op.semantic));
    if (op.semantic !== "glyph") { steps.push({ state: { kind: "equation-transformation", visibleFromOps: fromPlan.ops.length, visibleCueOps: cuePlan.length, visibleToOps: index + 1 }, durationMs: 0 }); weights.push(durationWeight(index + 401, op.semantic) * .82); }
  }
  const durations = distributeDurations(animationDurationMs, profile.frameRate, weights);
  return steps.map((step, index) => {
    const state = step.state;
    const from = renderFormulaSubset(fromPlan, state.visibleFromOps, "#cbd5e1", { x: center, y: profile.height * .25 });
    const cueVisible = cuePlan.slice(0, state.visibleCueOps);
    const cueMarkup = cueVisible.map((op, cueIndex) => renderCueOp(op, cueIndex, "#fde68a")).join("");
    const cueTip = cueVisible.at(-1) ? { x: cueVisible.at(-1)!.tipX, y: cueVisible.at(-1)!.tipY } : null;
    const to = renderFormulaSubset(toPlan, state.visibleToOps, "#7dd3fc", { x: center, y: profile.height * .68 });
    const tip = state.visibleToOps > 0 ? to.tip : cueTip ?? from.tip;
    const completed = state.visibleFromOps === fromPlan.ops.length && state.visibleCueOps === cuePlan.length && state.visibleToOps === toPlan.ops.length;
    const body = from.markup
      + cueMarkup
      + to.markup
      + renderTip(tip.x + 8, tip.y - 4)
      + (completed && scene.highlight ? text(center, profile.height*0.84, scene.highlight, bodySize*.75, "middle", "#fda4af") : "");
    return { svg: sceneShell(profile, fontFile, body), durationMs: durations[index]! };
  });
}
export function renderChalkAnimationFrames(scene: ChalkAnimatedScene, profile: NormalizedRenderProfile, fontFile: string): readonly ChalkFrame[] {
  const timing = scene.animation?.timing;
  const writingDurationMs = timing
    ? timing.writingEndMs - timing.writingStartMs
    : scene.durationMs;
  const writingFrames = scene.type === "equation"
    ? buildEquationFrames(scene, profile, fontFile, writingDurationMs)
    : buildTransformationFrames(scene, profile, fontFile, writingDurationMs);
  if (!timing) return writingFrames;
  const frames: ChalkFrame[] = [];
  if (timing.writingStartMs > 0) {
    frames.push({
      svg: sceneShell(profile, fontFile, ""),
      durationMs: timing.writingStartMs,
    });
  }
  frames.push(...writingFrames);
  const completedHoldMs = scene.durationMs - timing.writingEndMs;
  const completed = writingFrames.at(-1);
  if (completed && completedHoldMs > 0) {
    frames.push({ svg: completed.svg, durationMs: completedHoldMs });
  }
  return frames;
}
