#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

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

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function main() {
  const failures = [];
  for (const fileName of required) {
    const sourcePath = path.join(diagramsDir, fileName);
    const baseName = fileName.replace(/\.mmd$/u, "");
    const svgPath = path.join(renderedDir, `${baseName}.svg`);
    const pngPath = path.join(renderedDir, `${baseName}.png`);
    const sourceStat = await statOrNull(sourcePath);
    const svgStat = await statOrNull(svgPath);
    const pngStat = await statOrNull(pngPath);
    if (!sourceStat) {
      failures.push(`Missing diagram source: ${sourcePath}`);
      continue;
    }
    if (!svgStat) {
      failures.push(`Missing rendered SVG: ${svgPath}`);
    }
    if (!pngStat) {
      failures.push(`Missing rendered PNG: ${pngPath}`);
    }
    if (svgStat && sourceStat.mtimeMs > svgStat.mtimeMs) {
      failures.push(`Rendered SVG is stale: ${svgPath}`);
    }
    if (pngStat && sourceStat.mtimeMs > pngStat.mtimeMs) {
      failures.push(`Rendered PNG is stale: ${pngPath}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        checked: required.length,
        renderedDir,
        ok: true,
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
