import type { NormalizedRenderProfile, VisualScene } from "../contracts.js";
import { RendererError } from "../errors.js";
import { renderFormulaSvg, validateFormula } from "./formula-svg.js";

export const SVG_RENDERER_VERSION = "svg-static.v3";
let configuredFontFamily = "renderer-font";
const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const text = (x: number, y: number, value: string, size: number, anchor = "middle", fill = "#f8fafc", weight = 400): string => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="${configuredFontFamily}" font-size="${size}" font-weight="${weight}">${escape(value)}</text>`;
const wrap = (value: string, max = 54): string[] => { const words = value.split(/\s+/u); const lines: string[] = []; let line = ""; for (const word of words) { if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) lines.push(line); return lines.slice(0, 8); };
export { validateFormula } from "./formula-svg.js";
export function normalizeFormula(formula: string): string { return formula.trim().replace(/\r\n?/gu, "\n"); }
function parseLinear(expression: string): { a: number; b: number } {
  const match = /^([-+]?)(?:(\d+(?:\.\d+)?)\*?)?x(?:([-+])(\d+(?:\.\d+)?))?$/u.exec(expression);
  if (!match) throw new RendererError({ code: "INVALID_VISUAL_PLAN", message: `Unsupported graph expression: ${expression}` });
  const sign = match[1] === "-" ? -1 : 1; const coefficient = match[2] === undefined ? 1 : Number(match[2]); const intercept = match[4] === undefined ? 0 : Number(match[4]) * (match[3] === "-" ? -1 : 1);
  return { a: sign * coefficient, b: intercept };
}
function graph(scene: Extract<VisualScene, { type: "coordinate-graph" }>, width: number, height: number): string {
  const portrait = height > width; const left = width * (portrait ? 0.12 : 0.14); const right = width * (portrait ? 0.88 : 0.86); const top = height * (portrait ? 0.25 : 0.16); const bottom = height * (portrait ? 0.72 : 0.82);
  const [xMin, xMax] = scene.xRange; const [yMin, yMax] = scene.yRange; const sx = (x: number): number => left + ((x - xMin) / (xMax - xMin)) * (right - left); const sy = (y: number): number => bottom - ((y - yMin) / (yMax - yMin)) * (bottom - top);
  const gridCount = scene.expensiveGrid ? 40 : 10; let body = "";
  for (let index = 0; index <= gridCount; index += 1) { const gx = left + ((right-left)*index)/gridCount; const gy = top + ((bottom-top)*index)/gridCount; body += `<path d="M ${gx} ${top} V ${bottom} M ${left} ${gy} H ${right}" stroke="#24324a" stroke-width="1"/>`; }
  body += `<path d="M ${left} ${sy(0)} H ${right} M ${sx(0)} ${top} V ${bottom}" stroke="#cbd5e1" stroke-width="3"/>`;
  for (const [index, fn] of scene.functions.entries()) { const parsed = parseLinear(fn.expression); const start = Math.max(xMin, fn.domain[0]); const end = Math.min(xMax, fn.domain[1]); body += `<path d="M ${sx(start)} ${sy(parsed.a*start+parsed.b)} L ${sx(end)} ${sy(parsed.a*end+parsed.b)}" stroke="${fn.color ?? ["#38bdf8", "#fbbf24", "#fb7185", "#4ade80"][index]}" stroke-width="6" fill="none"/>`; }
  for (const point of scene.points) body += `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="8" fill="#fbbf24"/>${point.label ? text(sx(point.x)+14, sy(point.y)-14, point.label, Math.max(18, width/48), "start", "#fde68a") : ""}`;
  if (scene.annotation) body += text(width/2, height*0.91, scene.annotation, Math.max(24, width/36), "middle", "#a5f3fc", 600);
  body += text(right, sy(0)-12, scene.xLabel ?? "x", Math.max(18, width/45), "end") + text(sx(0)+14, top+28, scene.yLabel ?? "y", Math.max(18, width/45), "start"); return body;
}
function sceneBody(scene: VisualScene, width: number, height: number): string {
  const center = width/2; const titleSize = Math.round(Math.min(width/14, height/10)); const bodySize = Math.round(Math.min(width/24, height/17));
  switch (scene.type) {
    case "title": return text(center, height*0.43, scene.title, titleSize, "middle", "#f8fafc", 700) + (scene.subtitle ? text(center, height*0.57, scene.subtitle, bodySize, "middle", "#7dd3fc") : "");
    case "text": { const lines = wrap(scene.text, width > height ? 56 : 28); return (scene.heading ? text(center, height*0.22, scene.heading, titleSize*0.7, "middle", "#7dd3fc", 700) : "") + lines.map((line, index) => text(center, height*(0.42 + index*0.09), line, bodySize)).join("") + (scene.annotation ? text(center, height*0.88, `→ ${scene.annotation}`, bodySize*0.75, "middle", "#fde68a") : ""); }
    case "equation": return (scene.label ? text(center, height*0.25, scene.label, bodySize, "middle", "#7dd3fc") : "") + `<rect x="${width*0.14}" y="${height*0.34}" width="${width*0.72}" height="${height*0.3}" rx="24" fill="#172554" stroke="#38bdf8" stroke-width="3"/>` + renderFormulaSvg(scene.equation, center, height*.54, titleSize, width*.62) + (scene.highlight ? text(center, height*0.76, scene.highlight, bodySize*0.8, "middle", "#fde68a") : "");
    case "equation-transformation": return renderFormulaSvg(scene.from, center, height*.25, titleSize*.75, width*.72, "#cbd5e1") + text(center, height*0.44, `↓  ${scene.operation}`, bodySize, "middle", "#fde68a", 600) + renderFormulaSvg(scene.to, center, height*.68, titleSize, width*.72, "#7dd3fc") + (scene.highlight ? text(center, height*0.84, scene.highlight, bodySize*.75, "middle", "#fda4af") : "");
    case "coordinate-graph": return graph(scene, width, height);
    case "geometry": { const shape = scene.shape === "circle" ? `<circle cx="${center}" cy="${height/2}" r="${Math.min(width,height)*0.22}"/>` : scene.shape === "rectangle" ? `<rect x="${width*.25}" y="${height*.28}" width="${width*.5}" height="${height*.45}"/>` : `<path d="M ${center} ${height*.22} L ${width*.76} ${height*.75} L ${width*.24} ${height*.75} Z"/>`; const positions: ReadonlyArray<readonly [number, number]> = scene.shape === "triangle" ? [[center,height*.18],[width*.78,height*.53],[center,height*.8]] : scene.shape === "rectangle" ? [[center,height*.24],[width*.78,height*.52],[center,height*.78],[width*.22,height*.52]] : [[center,height*.24],[width*.73,height*.5],[center,height*.76],[width*.27,height*.5]]; return `<g fill="none" stroke="#38bdf8" stroke-width="6">${shape}</g>` + scene.labels.map((label,index) => { const position = positions[index % positions.length] ?? [center, height/2]; return text(position[0],position[1],label,bodySize*.6); }).join(""); }
    case "summary": return text(center, height*0.18, scene.title, titleSize*0.75, "middle", "#7dd3fc", 700) + scene.points.map((point,index) => text(width*0.15, height*(0.34+index*0.11), `✓  ${point}`, bodySize*.75, "start")).join("");
  }
}
export function renderSceneSvg(scene: VisualScene, profile: NormalizedRenderProfile, fontFile: string): string {
  configuredFontFamily = "renderer-font";
  const fontUrl = `file://${fontFile.replaceAll("%", "%25").replaceAll("#", "%23").replaceAll(" ", "%20")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 ${profile.width} ${profile.height}"><style>@font-face{font-family:${configuredFontFamily};src:url('${fontUrl}')}</style><rect width="100%" height="100%" fill="#07111f"/><circle cx="${profile.width*.92}" cy="${profile.height*.1}" r="${Math.min(profile.width,profile.height)*.18}" fill="#0c4a6e" opacity=".25"/>${sceneBody(scene, profile.width, profile.height)}</svg>`;
}
