#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { JSDOM } from "jsdom";

const repoRoot = path.resolve(import.meta.dirname, "..");
const diagramsDir = path.join(repoRoot, "docs", "diagrams");
const renderedDir = path.join(diagramsDir, "rendered");
const required = [
  "story-to-video-overview.mmd",
  "story-to-video-detailed.mmd",
  "story-to-video-sequence.mmd",
  "story-artifact-lineage.mmd",
  "story-stage-state-machine.mmd",
];

async function ensureFilesExist(fileNames) {
  for (const fileName of fileNames) {
    const filePath = path.join(diagramsDir, fileName);
    await fs.access(filePath);
  }
}

async function resolveMermaidModulePath() {
  const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
  const entries = await fs.readdir(pnpmDir);
  const mermaidDir = entries.find((entry) => entry.startsWith("mermaid@"));
  if (!mermaidDir) {
    throw new Error(
      "Unable to locate the Mermaid package in node_modules/.pnpm."
    );
  }
  return path.join(
    pnpmDir,
    mermaidDir,
    "node_modules",
    "mermaid",
    "dist",
    "mermaid.esm.mjs"
  );
}

function installDomPolyfills(dom) {
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  for (const key of [
    "Element",
    "SVGElement",
    "SVGGraphicsElement",
    "HTMLElement",
    "Node",
    "CSSStyleSheet",
    "DOMParser",
    "XMLSerializer",
  ]) {
    global[key] = window[key];
  }
  global.getComputedStyle = window.getComputedStyle;
  const bbox = function bbox() {
    const lines = String(this.textContent ?? "")
      .split(/\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 3);
    const width = Math.max(24, longest * 7);
    const height = Math.max(20, lines.length * 18);
    return {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    };
  };
  window.SVGElement.prototype.getBBox = bbox;
  window.SVGElement.prototype.getComputedTextLength = function getLength() {
    const lines = String(this.textContent ?? "")
      .split(/\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 3);
    return Math.max(24, longest * 7);
  };
  window.SVGElement.prototype.getCTM = function getCTM() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  };
}

async function renderSvg(mermaidModulePath, sourceText, renderId) {
  const dom = new JSDOM("<body></body>", { pretendToBeVisual: true });
  installDomPolyfills(dom);
  const mermaid = await import(mermaidModulePath);
  mermaid.default.initialize({
    startOnLoad: false,
    securityLevel: "loose",
  });
  const { svg } = await mermaid.default.render(renderId, sourceText);
  return svg;
}

function normalizeSvgBounds(svg) {
  const translatePattern = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/gu;
  let maxX = 0;
  let maxY = 0;
  for (const match of svg.matchAll(translatePattern)) {
    const x = Number(match[1] ?? 0);
    const y = Number(match[2] ?? 0);
    if (Number.isFinite(x)) {
      maxX = Math.max(maxX, x);
    }
    if (Number.isFinite(y)) {
      maxY = Math.max(maxY, y);
    }
  }
  const width = Math.max(800, Math.ceil(maxX + 400));
  const height = Math.max(600, Math.ceil(maxY + 300));
  return svg
    .replace(/style="max-width:[^"]*"/u, `style="max-width:${width}px;"`)
    .replace(/viewBox="[^"]*"/u, `viewBox="0 0 ${width} ${height}"`)
    .replace(/width="[^"]*"/u, `width="${width}"`)
    .replace(/height="[^"]*"/u, `height="${height}"`);
}

async function main() {
  const mermaidModulePath = await resolveMermaidModulePath();
  await ensureFilesExist(required);
  await fs.mkdir(renderedDir, { recursive: true });

  for (const [index, fileName] of required.entries()) {
    const sourcePath = path.join(diagramsDir, fileName);
    const baseName = fileName.replace(/\.mmd$/u, "");
    const sourceText = await fs.readFile(sourcePath, "utf8");
    const rawSvg = await renderSvg(
      mermaidModulePath,
      sourceText,
      `diagram-${index + 1}`
    );
    const svg = normalizeSvgBounds(rawSvg);
    const svgPath = path.join(renderedDir, `${baseName}.svg`);
    const pngPath = path.join(renderedDir, `${baseName}.png`);
    await fs.writeFile(svgPath, svg, "utf8");
    await sharp(Buffer.from(svg), { limitInputPixels: false })
      .png()
      .toFile(pngPath);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        renderedDir,
        diagrams: required.map((fileName) => ({
          source: path.join("docs", "diagrams", fileName),
          svg: path.join(
            "docs",
            "diagrams",
            "rendered",
            `${fileName.replace(/\.mmd$/u, "")}.svg`
          ),
          png: path.join(
            "docs",
            "diagrams",
            "rendered",
            `${fileName.replace(/\.mmd$/u, "")}.png`
          ),
        })),
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  );
  process.exit(1);
});
