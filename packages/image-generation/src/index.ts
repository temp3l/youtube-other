import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  type EpisodeManifest,
  imageAssetSchema,
  imagePromptSchema,
  type ImageAsset,
  type ImagePrompt,
  type Scene,
  type ScenePlan
} from "@mediaforge/domain";
import {
  buildSrt,
  contentHash,
  ensureDir,
  fileExists,
  hashFile,
  normalizeWhitespace,
  safeBasename,
  sceneFilename,
  writeJsonAtomic,
  writeTextAtomic
} from "@mediaforge/shared";

export interface PromptTemplateContext {
  readonly GLOBAL_STYLE: string;
  readonly ASPECT_RATIO: "16:9" | "9:16";
  readonly SCENE_NUMBER: number;
  readonly TIMESTAMP_START: string;
  readonly TIMESTAMP_END: string;
  readonly VISUAL_PURPOSE: string;
  readonly SUBJECT: string;
  readonly ACTION: string;
  readonly SETTING: string;
  readonly COMPOSITION: string;
  readonly CAMERA: string;
  readonly LIGHTING: string;
  readonly MOOD: string;
  readonly CONTINUITY: string;
  readonly BRAND_GUIDANCE: string;
  readonly NEGATIVE_PROMPT: string;
}

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fallbackVisualSceneStyle =
  "Custom rough ink-and-paper collage: off-white background, thick uneven charcoal lines, two accent colors, simple expressive people and animals, no borders, bands, frames, stock-photo, or cinematic look.";
export const localSceneNegativePrompt =
  "photorealism, stock photography, borders, bands, frames, dense text, unreadable labels, unrelated dominant objects, watermarks";
const fallbackImagePromptSeed = {
  visualBrief: {
    composition: "Landscape 16:9, one clear focal point, subject large enough to read in one second, uncluttered background.",
    continuityNotes: "Establish the recurring rough hand-drawn visual style.",
    forbiddenElements: ["photorealism", "stock photography", "dense text", "unreadable labels", "unrelated dominant objects", "watermarks"]
  }
};

function loadSceneStyleReference(): string {
  try {
    const visualSceneStyle = readFileSync(path.join(repoRoot, "docs", "templates", "visual-scene-style.md"), "utf8").trim();
    const raw = JSON.parse(readFileSync(path.join(repoRoot, "docs", "templates", "image-prompt.json"), "utf8")) as {
      scenes?: Array<{ visualBrief?: { composition?: string; continuityNotes?: string; forbiddenElements?: string[] } }>;
    };
    const visualBrief = raw.scenes?.[0]?.visualBrief ?? fallbackImagePromptSeed.visualBrief;
    return [
      visualSceneStyle,
      visualBrief.composition ?? "",
      visualBrief.continuityNotes ?? "",
      (visualBrief.forbiddenElements ?? []).join(", ")
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(" ");
  } catch {
    return fallbackVisualSceneStyle;
  }
}

export const localSceneStyle = loadSceneStyleReference();

export const defaultPromptTemplate = [
  "GLOBAL STYLE: {{GLOBAL_STYLE}}",
  "ASPECT RATIO: {{ASPECT_RATIO}}",
  "SCENE: {{SCENE_NUMBER}}",
  "TIMING: {{TIMESTAMP_START}} - {{TIMESTAMP_END}}",
  "PURPOSE: {{VISUAL_PURPOSE}}",
  "SUBJECT: {{SUBJECT}}",
  "ACTION: {{ACTION}}",
  "SETTING: {{SETTING}}",
  "COMPOSITION: {{COMPOSITION}}",
  "CAMERA: {{CAMERA}}",
  "LIGHTING: {{LIGHTING}}",
  "MOOD: {{MOOD}}",
  "CONTINUITY: {{CONTINUITY}}",
  "BRAND GUIDANCE: {{BRAND_GUIDANCE}}",
  "NEGATIVE PROMPT: {{NEGATIVE_PROMPT}}"
].join("\n");

export function renderPromptTemplate(template: string, context: PromptTemplateContext): string {
  const replacements: Record<string, string> = {
    GLOBAL_STYLE: context.GLOBAL_STYLE,
    ASPECT_RATIO: context.ASPECT_RATIO,
    SCENE_NUMBER: String(context.SCENE_NUMBER),
    TIMESTAMP_START: context.TIMESTAMP_START,
    TIMESTAMP_END: context.TIMESTAMP_END,
    VISUAL_PURPOSE: context.VISUAL_PURPOSE,
    SUBJECT: context.SUBJECT,
    ACTION: context.ACTION,
    SETTING: context.SETTING,
    COMPOSITION: context.COMPOSITION,
    CAMERA: context.CAMERA,
    LIGHTING: context.LIGHTING,
    MOOD: context.MOOD,
    CONTINUITY: context.CONTINUITY,
    BRAND_GUIDANCE: context.BRAND_GUIDANCE,
    NEGATIVE_PROMPT: context.NEGATIVE_PROMPT
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/gu, (match, key: string) => replacements[key] ?? match);
}

export function createImagePrompt(scene: Scene, aspectRatio: "16:9" | "9:16", globalStyle: string, brandGuidance: string): ImagePrompt {
  return imagePromptSchema.parse({
    sceneId: scene.id,
    sequenceNumber: scene.sequenceNumber,
    aspectRatio,
    timestampStart: scene.timing.startSeconds,
    timestampEnd: scene.timing.endSeconds,
    visualPurpose: scene.visualPurpose,
    prompt: renderPromptTemplate(defaultPromptTemplate, {
      GLOBAL_STYLE: globalStyle,
      ASPECT_RATIO: aspectRatio,
      SCENE_NUMBER: scene.sequenceNumber,
      TIMESTAMP_START: scene.timing.startSeconds.toFixed(0).padStart(2, "0"),
      TIMESTAMP_END: scene.timing.endSeconds.toFixed(0).padStart(2, "0"),
      VISUAL_PURPOSE: scene.visualPurpose,
      SUBJECT: scene.subject,
      ACTION: scene.action,
      SETTING: scene.setting,
      COMPOSITION: scene.composition,
      CAMERA: scene.cameraFraming,
      LIGHTING: "natural",
      MOOD: scene.mood,
      CONTINUITY: scene.continuityReferences.join("; "),
      BRAND_GUIDANCE: brandGuidance,
      NEGATIVE_PROMPT: scene.negativeConstraints.join(", ")
    }),
    negativePrompt: scene.negativeConstraints.join(", "),
    continuity: scene.continuityReferences.join("; "),
    expectedFilename: sceneFilename(scene.sequenceNumber, scene.timing.startSeconds, scene.timing.endSeconds, aspectRatio)
  });
}

export function createPromptBatch(scenePlan: ScenePlan, aspectRatio: "16:9" | "9:16", globalStyle: string, brandGuidance: string): ImagePrompt[] {
  return scenePlan.scenes.map((scene) => createImagePrompt(scene, aspectRatio, globalStyle, brandGuidance));
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export async function exportSceneWorkbook(
  episodeDir: string,
  prompts: ReadonlyArray<ImagePrompt>,
  options: { readonly batchSize: number; readonly aspectRatio: "16:9" | "9:16"; readonly globalStyle: string }
): Promise<void> {
  const imagesDir = path.join(episodeDir, "images");
  const batchesDir = path.join(imagesDir, "prompt-batches");
  await ensureDir(batchesDir);
  await writeJsonAtomic(path.join(imagesDir, "prompts.json"), {
    aspectRatio: options.aspectRatio,
    globalStyle: options.globalStyle,
    batchSize: options.batchSize,
    prompts
  });
  const rows = prompts
    .map(
      (prompt) => `
        <tr>
          <td><input type="checkbox" /></td>
          <td>${escapeHtml(prompt.sceneId)}</td>
          <td>${escapeHtml(prompt.timestampStart.toFixed(0))} - ${escapeHtml(prompt.timestampEnd.toFixed(0))}</td>
          <td>${escapeHtml(prompt.prompt)}</td>
          <td>${escapeHtml(prompt.negativePrompt)}</td>
          <td>${escapeHtml(prompt.aspectRatio)}</td>
          <td>${escapeHtml(prompt.expectedFilename)}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`
    )
    .join("\n");
  const markdown = [
    "# Scene workbook",
    "",
    `Aspect ratio: ${options.aspectRatio}`,
    `Batch size: ${options.batchSize}`,
    "",
    `Style reference: ${localSceneStyle}`,
    "",
    "| Status | Scene | Timestamp | Prompt | Negative | Aspect | Expected filename | Import | Validation | Rejection |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...prompts.map(
      (prompt) =>
        `| [ ] | ${prompt.sceneId} | ${prompt.timestampStart.toFixed(0)}-${prompt.timestampEnd.toFixed(0)} | ${prompt.prompt} | ${prompt.negativePrompt} | ${prompt.aspectRatio} | ${prompt.expectedFilename} |  |  |  |`
    )
  ].join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Scene workbook</title></head><body><table><thead><tr><th>Status</th><th>Scene</th><th>Timestamp</th><th>Prompt</th><th>Negative</th><th>Aspect</th><th>Expected filename</th><th>Import</th><th>Validation</th><th>Rejection</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  await writeTextAtomic(path.join(imagesDir, "scene-workbook.md"), markdown);
  await writeTextAtomic(path.join(imagesDir, "scene-workbook.html"), html);
  for (let batchIndex = 0; batchIndex < prompts.length; batchIndex += options.batchSize) {
    const batch = prompts.slice(batchIndex, batchIndex + options.batchSize);
    const batchPath = path.join(batchesDir, `batch-${String(batchIndex / options.batchSize + 1).padStart(2, "0")}.json`);
    await writeJsonAtomic(batchPath, { prompts: batch });
  }
}

function hashSeed(value: string): number {
  return value.split("").reduce((accumulator, character) => (accumulator * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function roughLine(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, rng: () => number): string {
  const jitter = () => (rng() - 0.5) * width * 0.18;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const bend = length * (0.08 + rng() * 0.08);
  const control1X = x1 + dx * 0.33 + normalX * bend * (rng() - 0.5);
  const control1Y = y1 + dy * 0.33 + normalY * bend * (rng() - 0.5);
  const control2X = x1 + dx * 0.66 - normalX * bend * (rng() - 0.5);
  const control2Y = y1 + dy * 0.66 - normalY * bend * (rng() - 0.5);
  const primary = `<path d="M ${x1 + jitter()} ${y1 + jitter()} C ${control1X + jitter()} ${control1Y + jitter()} ${control2X + jitter()} ${control2Y + jitter()} ${x2 + jitter()} ${y2 + jitter()}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" fill="none" />`;
  const secondary = `<path d="M ${x1 + jitter()} ${y1 + jitter()} C ${control1X + jitter()} ${control1Y + jitter()} ${control2X + jitter()} ${control2Y + jitter()} ${x2 + jitter()} ${y2 + jitter()}" stroke="${stroke}" stroke-width="${Math.max(1, width - 1)}" stroke-linecap="round" fill="none" opacity="0.55" />`;
  return `${primary}${secondary}`;
}

function circle(cx: number, cy: number, r: number, fill: string, stroke: string, strokeWidth = 0): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ""} />`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string, strokeWidth = 0): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ""} />`;
}

function rect(x: number, y: number, width: number, height: number, fill: string, stroke: string, strokeWidth = 0, rx = 0): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}"${strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ""} />`;
}

function paperTexture(w: number, h: number, rng: () => number): string {
  const dots: string[] = [];
  const dotCount = Math.round((w * h) / 20000);
  for (let index = 0; index < dotCount; index += 1) {
    const x = Math.round(rng() * w);
    const y = Math.round(rng() * h);
    const r = 0.6 + rng() * 1.8;
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(58,49,40,0.06)" />`);
  }
  return dots.join("");
}

function tornEdge(w: number, h: number, rng: () => number): string {
  const fiber = (x1: number, y1: number, x2: number, y2: number): string => roughLine(x1, y1, x2, y2, "rgba(48,40,32,0.12)", 2, rng);
  const margin = Math.min(w, h) * 0.025;
  return [
    fiber(margin, margin * 1.5, margin + 120, margin * 0.7),
    fiber(w - margin - 140, margin * 1.2, w - margin, margin * 1.8),
    fiber(margin + 40, h - margin * 1.6, margin + 170, h - margin * 0.6),
    fiber(w - margin - 180, h - margin * 0.9, w - margin, h - margin * 1.7)
  ].join("");
}

function paperCutout(x: number, y: number, width: number, height: number, fill: string, rng: () => number): string {
  const points: Array<[number, number]> = [];
  const corners: Array<[number, number]> = [
    [x, y],
    [x + width * 0.42, y - height * 0.08],
    [x + width, y + height * 0.06],
    [x + width * 0.94, y + height * 0.55],
    [x + width * 1.02, y + height],
    [x + width * 0.58, y + height * 1.04],
    [x + width * 0.12, y + height * 0.98],
    [x - width * 0.06, y + height * 0.58]
  ];
  for (const [px, py] of corners) {
    points.push([
      px + (rng() - 0.5) * Math.max(6, width * 0.04),
      py + (rng() - 0.5) * Math.max(6, height * 0.04)
    ]);
  }
  const pathParts = [`M ${points[0]![0]} ${points[0]![1]}`];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const controlX = current[0] + (rng() - 0.5) * width * 0.08;
    const controlY = current[1] + (rng() - 0.5) * height * 0.08;
    const endX = (current[0] + next[0]) / 2 + (rng() - 0.5) * width * 0.04;
    const endY = (current[1] + next[1]) / 2 + (rng() - 0.5) * height * 0.04;
    pathParts.push(`Q ${controlX} ${controlY} ${endX} ${endY}`);
  }
  const outline = `<path d="${pathParts.join(" ")} Z" fill="${fill}" opacity="0.32" stroke="#302820" stroke-width="2" stroke-linejoin="round" />`;
  return outline;
}

function scribbleShadow(cx: number, cy: number, scale: number, rng: () => number): string {
  const stroke = "#7d6f61";
  return [
    roughLine(cx - 28 * scale, cy, cx - 10 * scale, cy + 6 * scale, stroke, 3, rng),
    roughLine(cx - 18 * scale, cy + 2 * scale, cx + 4 * scale, cy + 8 * scale, stroke, 3, rng),
    roughLine(cx - 10 * scale, cy + 5 * scale, cx + 20 * scale, cy + 10 * scale, stroke, 3, rng)
  ].join("");
}

function sketchSpark(cx: number, cy: number, scale: number, rng: () => number): string {
  return [
    roughLine(cx - 6 * scale, cy, cx + 6 * scale, cy, "#302820", 3, rng),
    roughLine(cx, cy - 6 * scale, cx, cy + 6 * scale, "#302820", 3, rng),
    roughLine(cx - 5 * scale, cy - 5 * scale, cx + 5 * scale, cy + 5 * scale, "#302820", 2, rng)
  ].join("");
}

function mouseIcon(cx: number, cy: number, scale: number, rng: () => number): string {
  const body = ellipse(cx, cy + 8 * scale, 26 * scale, 16 * scale, "#f5ede3", "#302820", 5);
  const sketchBody = ellipse(cx + 1.8 * scale, cy + 9 * scale, 25 * scale, 15 * scale, "none", "#7d6f61", 2);
  const head = circle(cx - 18 * scale, cy - 4 * scale, 12 * scale, "#f5ede3", "#302820", 5);
  const headSketch = circle(cx - 17 * scale, cy - 3 * scale, 11 * scale, "none", "#7d6f61", 2);
  const earA = circle(cx - 25 * scale, cy - 20 * scale, 5.5 * scale, "#f2d2b9", "#302820", 4);
  const earB = circle(cx - 11 * scale, cy - 18 * scale, 5.5 * scale, "#f2d2b9", "#302820", 4);
  const eye = circle(cx - 21 * scale, cy - 7 * scale, 1.8 * scale, "#302820", "#302820");
  const tail = roughLine(cx + 18 * scale, cy + 12 * scale, cx + 48 * scale, cy + 27 * scale, "#302820", 5, rng);
  const whisker1 = roughLine(cx - 28 * scale, cy - 2 * scale, cx - 42 * scale, cy - 4 * scale, "#302820", 3, rng);
  const whisker2 = roughLine(cx - 28 * scale, cy + 2 * scale, cx - 43 * scale, cy + 9 * scale, "#302820", 3, rng);
  const whisker3 = roughLine(cx - 28 * scale, cy + 6 * scale, cx - 42 * scale, cy + 17 * scale, "#302820", 3, rng);
  const sketchPass = ellipse(cx + 1 * scale, cy + 8 * scale, 25 * scale, 15 * scale, "none", "#7d6f61", 2);
  const paws = [
    roughLine(cx - 9 * scale, cy + 22 * scale, cx - 16 * scale, cy + 31 * scale, "#302820", 3, rng),
    roughLine(cx + 4 * scale, cy + 22 * scale, cx + 12 * scale, cy + 31 * scale, "#302820", 3, rng)
  ];
  return [sketchPass, body, sketchBody, head, headSketch, earA, earB, eye, tail, whisker1, whisker2, whisker3, ...paws, scribbleShadow(cx, cy + 26 * scale, scale * 0.9, rng)].join("");
}

function personIcon(cx: number, cy: number, scale: number, rng: () => number, accent: string): string {
  const head = circle(cx, cy - 34 * scale, 14 * scale, "#f2d2b9", "#302820", 4);
  const headSketch = circle(cx + 1 * scale, cy - 33 * scale, 13 * scale, "none", "#7d6f61", 2);
  const hair = `<path d="M ${cx - 16 * scale} ${cy - 38 * scale} Q ${cx} ${cy - 54 * scale} ${cx + 16 * scale} ${cy - 38 * scale} Q ${cx + 11 * scale} ${cy - 18 * scale} ${cx - 16 * scale} ${cy - 22 * scale} Z" fill="${accent}" opacity="0.82" stroke="#302820" stroke-width="3" />`;
  const hairScribble = roughLine(cx - 10 * scale, cy - 47 * scale, cx + 6 * scale, cy - 49 * scale, "#302820", 2, rng);
  const body = `<path d="M ${cx - 18 * scale} ${cy - 16 * scale} Q ${cx} ${cy - 5 * scale} ${cx + 18 * scale} ${cy - 16 * scale} L ${cx + 14 * scale} ${cy + 26 * scale} Q ${cx} ${cy + 40 * scale} ${cx - 14 * scale} ${cy + 26 * scale} Z" fill="${accent}" opacity="0.7" stroke="#302820" stroke-width="4" />`;
  const bodyPass = `<path d="M ${cx - 17 * scale} ${cy - 15 * scale} Q ${cx} ${cy - 4 * scale} ${cx + 17 * scale} ${cy - 15 * scale} L ${cx + 13 * scale} ${cy + 25 * scale} Q ${cx} ${cy + 38 * scale} ${cx - 13 * scale} ${cy + 25 * scale} Z" fill="none" stroke="#7d6f61" stroke-width="2" />`;
  const armLeft = roughLine(cx - 16 * scale, cy - 5 * scale, cx - 36 * scale, cy + 14 * scale, "#302820", 4, rng);
  const armRight = roughLine(cx + 16 * scale, cy - 5 * scale, cx + 38 * scale, cy + 16 * scale, "#302820", 4, rng);
  const legLeft = roughLine(cx - 6 * scale, cy + 26 * scale, cx - 16 * scale, cy + 58 * scale, "#302820", 4, rng);
  const legRight = roughLine(cx + 7 * scale, cy + 26 * scale, cx + 18 * scale, cy + 58 * scale, "#302820", 4, rng);
  const eye = circle(cx - 5 * scale, cy - 35 * scale, 1.8 * scale, "#302820", "#302820");
  const cheek = roughLine(cx - 3 * scale, cy - 28 * scale, cx + 3 * scale, cy - 27 * scale, "#302820", 2, rng);
  const sketchShadow = scribbleShadow(cx, cy + 34 * scale, scale * 1.1, rng);
  return [bodyPass, sketchShadow, hair, hairScribble, head, headSketch, body, armLeft, armRight, legLeft, legRight, eye, cheek].join("");
}

function childIcon(cx: number, cy: number, scale: number, rng: () => number): string {
  const head = circle(cx, cy - 24 * scale, 10 * scale, "#f2d2b9", "#302820", 4);
  const headSketch = circle(cx + 1 * scale, cy - 23 * scale, 9 * scale, "none", "#7d6f61", 2);
  const dress = `<path d="M ${cx - 12 * scale} ${cy - 12 * scale} L ${cx + 12 * scale} ${cy - 12 * scale} L ${cx + 20 * scale} ${cy + 22 * scale} L ${cx - 20 * scale} ${cy + 22 * scale} Z" fill="#c86937" opacity="0.72" stroke="#302820" stroke-width="4" />`;
  const arms = [
    roughLine(cx - 9 * scale, cy - 4 * scale, cx - 27 * scale, cy + 6 * scale, "#302820", 4, rng),
    roughLine(cx + 9 * scale, cy - 4 * scale, cx + 28 * scale, cy + 3 * scale, "#302820", 4, rng)
  ];
  const legs = [
    roughLine(cx - 5 * scale, cy + 22 * scale, cx - 14 * scale, cy + 46 * scale, "#302820", 4, rng),
    roughLine(cx + 4 * scale, cy + 22 * scale, cx + 14 * scale, cy + 46 * scale, "#302820", 4, rng)
  ];
  return [scribbleShadow(cx, cy + 30 * scale, scale * 0.8, rng), dress, head, headSketch, ...arms, ...legs].join("");
}

function birdIcon(cx: number, cy: number, scale: number, rng: () => number): string {
  const body = ellipse(cx, cy, 18 * scale, 12 * scale, "#f2d2b9", "#302820", 4);
  const bodySketch = ellipse(cx + 1 * scale, cy + 1 * scale, 17 * scale, 11 * scale, "none", "#7d6f61", 2);
  const wing = `<path d="M ${cx - 4 * scale} ${cy} Q ${cx + 10 * scale} ${cy - 12 * scale} ${cx + 18 * scale} ${cy + 4 * scale} Q ${cx + 6 * scale} ${cy + 8 * scale} ${cx - 4 * scale} ${cy} Z" fill="#4a7f73" opacity="0.72" stroke="#302820" stroke-width="3" />`;
  const beak = `<path d="M ${cx + 18 * scale} ${cy - 1 * scale} L ${cx + 30 * scale} ${cy + 3 * scale} L ${cx + 18 * scale} ${cy + 7 * scale} Z" fill="#c86937" stroke="#302820" stroke-width="3" />`;
  const legs = [
    roughLine(cx - 2 * scale, cy + 11 * scale, cx - 5 * scale, cy + 24 * scale, "#302820", 3, rng),
    roughLine(cx + 4 * scale, cy + 11 * scale, cx + 6 * scale, cy + 24 * scale, "#302820", 3, rng)
  ];
  return [scribbleShadow(cx, cy + 18 * scale, scale * 0.8, rng), body, bodySketch, wing, beak, ...legs].join("");
}

function bowlIcon(cx: number, cy: number, scale: number, color: string): string {
  return [
    `<path d="M ${cx - 28 * scale} ${cy} Q ${cx} ${cy + 28 * scale} ${cx + 28 * scale} ${cy} L ${cx - 28 * scale} ${cy} Z" fill="${color}" stroke="#302820" stroke-width="${4 * scale}" stroke-linejoin="round" />`,
    roughLine(cx - 18 * scale, cy + 4 * scale, cx + 18 * scale, cy + 4 * scale, "#fff5d9", 4, () => 0.35),
    `<circle cx="${cx - 8 * scale}" cy="${cy - 6 * scale}" r="${4 * scale}" fill="#fff5d9" />`,
    `<circle cx="${cx + 5 * scale}" cy="${cy - 8 * scale}" r="${3 * scale}" fill="#fff5d9" />`
  ].join("");
}

function cageIcon(cx: number, cy: number, width: number, height: number, rng: () => number): string {
  const x = cx - width / 2;
  const y = cy - height / 2;
  const bars: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const bx = x + (index / 4) * width;
    bars.push(roughLine(bx, y, bx + (rng() - 0.5) * 5, y + height, "#302820", 4, rng));
  }
  return [
    roughLine(x, y, x + width, y + (rng() - 0.5) * 2, "#302820", 4, rng),
    roughLine(x, y + height, x + width, y + height + (rng() - 0.5) * 2, "#302820", 4, rng),
    ...bars
  ].join("");
}

function crackIcon(x1: number, y1: number, x2: number, y2: number, rng: () => number): string {
  const midX = (x1 + x2) / 2 + (rng() - 0.5) * 30;
  const midY = (y1 + y2) / 2 + (rng() - 0.5) * 24;
  return [
    roughLine(x1, y1, midX, midY, "#c86937", 6, rng),
    roughLine(midX, midY, x2, y2, "#c86937", 6, rng),
    roughLine(midX - 12, midY - 20, midX + 16, midY + 10, "#302820", 4, rng)
  ].join("");
}

function clusterDots(cx: number, cy: number, scale: number, rng: () => number): string {
  const dots: string[] = [];
  for (let index = 0; index < 18; index += 1) {
    const dx = (rng() - 0.5) * 120 * scale;
    const dy = (rng() - 0.5) * 80 * scale;
    const r = 3 + rng() * 3;
    dots.push(circle(cx + dx, cy + dy, r, rng() > 0.7 ? "#4a7f73" : "#302820", "#302820", 2));
  }
  return dots.join("");
}

function magnifyingGlass(cx: number, cy: number, scale: number, rng: () => number): string {
  return [
    circle(cx, cy, 24 * scale, "rgba(255,255,255,0.03)", "#302820", 5),
    roughLine(cx + 18 * scale, cy + 18 * scale, cx + 52 * scale, cy + 54 * scale, "#302820", 6, rng)
  ].join("");
}

function nodesAndLinks(cx: number, cy: number, scale: number, rng: () => number): string {
  const nodeA = { x: cx - 34 * scale, y: cy - 18 * scale };
  const nodeB = { x: cx + 32 * scale, y: cy - 24 * scale };
  const nodeC = { x: cx - 2 * scale, y: cy + 28 * scale };
  const nodes = [nodeA, nodeB, nodeC];
  return [
    roughLine(nodeA.x, nodeA.y, nodeB.x, nodeB.y, "#4a7f73", 4, rng),
    roughLine(nodeB.x, nodeB.y, nodeC.x, nodeC.y, "#4a7f73", 4, rng),
    roughLine(nodeC.x, nodeC.y, nodeA.x, nodeA.y, "#4a7f73", 4, rng),
    ...nodes.map((node) => circle(node.x, node.y, 9 * scale, "#c86937", "#302820", 4))
  ].join("");
}

function beakerIcon(cx: number, cy: number, scale: number, rng: () => number): string {
  const outline = [
    roughLine(cx - 20 * scale, cy - 28 * scale, cx - 30 * scale, cy + 34 * scale, "#302820", 5, rng),
    roughLine(cx + 20 * scale, cy - 28 * scale, cx + 30 * scale, cy + 34 * scale, "#302820", 5, rng),
    roughLine(cx - 30 * scale, cy + 34 * scale, cx + 30 * scale, cy + 34 * scale, "#302820", 5, rng),
    roughLine(cx - 18 * scale, cy - 28 * scale, cx + 18 * scale, cy - 28 * scale, "#302820", 5, rng)
  ];
  const liquid = `<path d="M ${cx - 24 * scale} ${cy + 18 * scale} Q ${cx} ${cy + 8 * scale} ${cx + 24 * scale} ${cy + 18 * scale} L ${cx + 24 * scale} ${cy + 32 * scale} L ${cx - 24 * scale} ${cy + 32 * scale} Z" fill="#4a7f73" opacity="0.78" />`;
  return [liquid, ...outline].join("");
}

function warningTriangle(cx: number, cy: number, scale: number): string {
  return `<path d="M ${cx} ${cy - 34 * scale} L ${cx + 30 * scale} ${cy + 20 * scale} L ${cx - 30 * scale} ${cy + 20 * scale} Z" fill="#c86937" stroke="#302820" stroke-width="${5 * scale}" stroke-linejoin="round" />`;
}

function tapeStrip(x: number, y: number, width: number, height: number, rotation: number, fill: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${rotation})"><rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.22}" fill="${fill}" opacity="0.75" /></g>`;
}

function scribbleLabel(x: number, y: number, width: number, rng: () => number): string {
  const lines: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const yOffset = y + index * 10 + (rng() - 0.5) * 2;
    lines.push(roughLine(x, yOffset, x + width, yOffset + (rng() - 0.5) * 2, "#302820", 3, rng));
  }
  return lines.join("");
}

function compositionForScene(scene: Scene, width: number, height: number): string {
  const text = `${scene.subject} ${scene.action} ${scene.setting} ${scene.visualPurpose} ${scene.canonicalNarration}`.toLowerCase();
  const has = (pattern: RegExp): boolean => pattern.test(text);
  const rng = seededRandom(scene.id);
  const w = width;
  const h = height;
  const mouseGroup = mouseIcon(w * 0.37, h * 0.52, Math.min(w, h) / 520, rng);
  const props: string[] = [];
  props.push(paperCutout(w * 0.13, h * 0.16, w * 0.18, h * 0.12, "#f2d2b9", rng));
  props.push(paperCutout(w * 0.66, h * 0.14, w * 0.19, h * 0.11, "#fff5d9", rng));
  props.push(paperCutout(w * 0.10, h * 0.72, w * 0.24, h * 0.11, "#4a7f73", rng));
  props.push(tornEdge(w, h, rng));
  if (has(/mouse|mice|colony|universe|experiment/)) {
    props.push(mouseIcon(w * 0.30, h * 0.58, Math.min(w, h) / 470, rng));
    props.push(mouseGroup);
    props.push(mouseIcon(w * 0.61, h * 0.59, Math.min(w, h) / 540, rng));
    props.push(mouseIcon(w * 0.47, h * 0.63, Math.min(w, h) / 610, rng));
    props.push(personIcon(w * 0.17, h * 0.60, Math.min(w, h) / 500, rng, "#4a7f73"));
    props.push(personIcon(w * 0.78, h * 0.58, Math.min(w, h) / 530, rng, "#c86937"));
    props.push(childIcon(w * 0.12, h * 0.76, Math.min(w, h) / 610, rng));
    props.push(birdIcon(w * 0.84, h * 0.33, Math.min(w, h) / 660, rng));
  }
  if (has(/food|bowl|feed|abundant|resources/)) {
    props.push(bowlIcon(w * 0.70, h * 0.66, Math.min(w, h) / 540, "#4a7f73"));
  }
  if (has(/cage|enclosure|safe|roomy|space|laboratory|lab/)) {
    props.push(cageIcon(w * 0.70, h * 0.42, w * 0.30, h * 0.24, rng));
  }
  if (has(/crowd|population|climbing|aggressive|fight|stress|break|collapse|warning|effect|unravel/)) {
    props.push(crackIcon(w * 0.20, h * 0.28, w * 0.80, h * 0.72, rng));
    props.push(sketchSpark(w * 0.46, h * 0.48, Math.min(w, h) / 700, rng));
  }
  if (has(/look|closely|inspect|evidence|watch/)) {
    props.push(magnifyingGlass(w * 0.54, h * 0.42, Math.min(w, h) / 600, rng));
  }
  if (has(/social|connection|roles|community|structure|belong|trust/)) {
    props.push(nodesAndLinks(w * 0.55, h * 0.56, Math.min(w, h) / 680, rng));
    props.push(personIcon(w * 0.32, h * 0.58, Math.min(w, h) / 580, rng, "#c86937"));
    props.push(personIcon(w * 0.46, h * 0.59, Math.min(w, h) / 600, rng, "#4a7f73"));
    props.push(childIcon(w * 0.70, h * 0.61, Math.min(w, h) / 580, rng));
    props.push(birdIcon(w * 0.20, h * 0.31, Math.min(w, h) / 720, rng));
  }
  if (has(/healthy|groom|clean|beautiful ones|surviv/i)) {
    props.push(circle(w * 0.76, h * 0.30, Math.min(w, h) / 14, "#fff5d9", "#302820", 5));
    props.push(roughLine(w * 0.76, h * 0.22, w * 0.76, h * 0.38, "#302820", 4, rng));
    props.push(personIcon(w * 0.30, h * 0.62, Math.min(w, h) / 620, rng, "#fff5d9"));
    props.push(birdIcon(w * 0.56, h * 0.24, Math.min(w, h) / 720, rng));
  }
  if (has(/warning|lesson|practical|takeaway|relevant|reminder|panic/)) {
    props.push(warningTriangle(w * 0.23, h * 0.63, Math.min(w, h) / 700));
    props.push(sketchSpark(w * 0.23, h * 0.63, Math.min(w, h) / 760, rng));
  }
  if (has(/lab|experiment|calhoun|universe|science/)) {
    props.push(beakerIcon(w * 0.23, h * 0.38, Math.min(w, h) / 680, rng));
    props.push(personIcon(w * 0.24, h * 0.68, Math.min(w, h) / 700, rng, "#c86937"));
    props.push(mouseIcon(w * 0.70, h * 0.70, Math.min(w, h) / 760, rng));
  }
  if (has(/warning|lesson|relevant|reminder|collapse|survival/)) {
    props.push(scribbleLabel(w * 0.18, h * 0.73, w * 0.18, rng));
  }
  props.push(mouseIcon(w * 0.56, h * 0.66, Math.min(w, h) / 620, rng));
  props.push(personIcon(w * 0.52, h * 0.77, Math.min(w, h) / 720, rng, "#4a7f73"));
  return props.join("");
}

export async function createPlaceholderImage(outputPath: string, scene: Scene, aspectRatio: "16:9" | "9:16"): Promise<ImageAsset> {
  const width = aspectRatio === "16:9" ? 1920 : 1080;
  const height = aspectRatio === "16:9" ? 1080 : 1920;
  const rng = seededRandom(`${scene.id}:${scene.timing.startSeconds}:${scene.timing.endSeconds}`);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.02" />
        </feComponentTransfer>
      </filter>
      <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#f3ede2" />
        <stop offset="100%" stop-color="#efe7da" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#paper)"/>
    <rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.18"/>
    ${paperTexture(width, height, rng)}
    ${paperCutout(width * 0.08, height * 0.10, width * 0.28, height * 0.18, "#f2d2b9", rng)}
    ${paperCutout(width * 0.64, height * 0.12, width * 0.22, height * 0.16, "#fff5d9", rng)}
    ${paperCutout(width * 0.16, height * 0.74, width * 0.20, height * 0.12, "#4a7f73", rng)}
    ${compositionForScene(scene, width, height)}
  </svg>`;
  await ensureDir(path.dirname(outputPath));
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Placeholder image generation failed.");
  }
  return imageAssetSchema.parse({
    sceneId: scene.id,
    sourcePath: outputPath,
    renderedPath: outputPath,
    width: metadata.width,
    height: metadata.height,
    mimeType: "image/png",
    checksumSha256: await hashFile(outputPath),
    validated: true
  });
}

export async function importImageAssets(
  episodeDir: string,
  scenePlan: ScenePlan,
  inboxDir: string
): Promise<ImageAsset[]> {
  const generatedDir = path.join(episodeDir, "images", "generated");
  const manifestPath = path.join(inboxDir, "import-manifest.json");
  const imported: ImageAsset[] = [];
  const mapping: Record<string, string> = {};
  if (await fileExists(manifestPath)) {
    const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { mappings?: Record<string, string> };
    if (raw.mappings) {
      Object.assign(mapping, raw.mappings);
    }
  }
  const files = await fs.readdir(inboxDir, { withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile()) {
      continue;
    }
    const absolutePath = path.join(inboxDir, entry.name);
    if (entry.name === "import-manifest.json") {
      continue;
    }
    const expectedScene = scenePlan.scenes.find((scene) => scene.expectedImageFilenames.includes(entry.name) || mapping[entry.name] === scene.id);
    if (!expectedScene) {
      continue;
    }
    await ensureDir(generatedDir);
    const targetPath = path.join(generatedDir, safeBasename(entry.name));
    await fs.copyFile(absolutePath, targetPath);
    const metadata = await sharp(targetPath).metadata();
    if (!metadata.width || !metadata.height) {
      continue;
    }
    imported.push(
      imageAssetSchema.parse({
        sceneId: expectedScene.id,
        sourcePath: absolutePath,
        renderedPath: targetPath,
        width: metadata.width,
        height: metadata.height,
        mimeType: metadata.format ? `image/${metadata.format}` : "image/png",
        checksumSha256: await hashFile(targetPath),
        validated: true
      })
    );
  }
  return imported;
}

export function missingScenes(scenePlan: ScenePlan, assets: ReadonlyArray<ImageAsset>): Scene[] {
  const byScene = new Set(assets.map((asset) => asset.sceneId));
  return scenePlan.scenes.filter((scene) => !byScene.has(scene.id));
}

export function validateImageAssets(scenePlan: ScenePlan, assets: ReadonlyArray<ImageAsset>): { readonly valid: boolean; readonly issues: string[] } {
  const issues: string[] = [];
  const seenChecksums = new Set<string>();
  const expected = new Set(scenePlan.scenes.flatMap((scene) => scene.expectedImageFilenames));
  for (const asset of assets) {
    if (asset.width <= 0 || asset.height <= 0) {
      issues.push(`Invalid dimensions for ${asset.sourcePath}`);
    }
    if (seenChecksums.has(asset.checksumSha256)) {
      issues.push(`Duplicate image content detected for ${asset.sourcePath}`);
    }
    seenChecksums.add(asset.checksumSha256);
    if (!expected.has(path.basename(asset.renderedPath ?? asset.sourcePath))) {
      issues.push(`Unexpected filename for ${asset.sourcePath}`);
    }
  }
  return {
    valid: issues.length === 0 && assets.length === scenePlan.scenes.length,
    issues
  };
}

export function buildSceneWorkbookSummary(prompts: ReadonlyArray<ImagePrompt>): string {
  return prompts
    .map(
      (prompt) =>
        `${prompt.sceneId}: ${prompt.timestampStart.toFixed(0)}-${prompt.timestampEnd.toFixed(0)} => ${prompt.expectedFilename}`
    )
    .join("\n");
}
