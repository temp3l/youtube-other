import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { VeronicaIngestedAsset } from "../ingestion/secure-ingest.js";
import { createFixturePdf, createFixturePptx } from "../fixtures/pilot.js";
import { rasterizeVeronicaPreparedAssetSynthetic } from "./asset-rasterizer.js";

export type VeronicaRasterMethod =
  | "source-bytes"
  | "pdftoppm"
  | "libreoffice"
  | "synthetic";

export interface VeronicaRasterResult {
  readonly bytes: Uint8Array;
  readonly method: VeronicaRasterMethod;
}

export interface VeronicaRasterInput {
  readonly asset: VeronicaIngestedAsset;
  readonly candidateId: string;
  readonly label: string;
  readonly pageNumber?: number;
  readonly slideNumber?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ExternalRasterToolAvailability {
  readonly pdftoppm: boolean;
  readonly libreoffice: boolean;
}

export function detectExternalRasterTools(): ExternalRasterToolAvailability {
  const probe = (command: string) =>
    spawnSync("which", [command], { encoding: "utf8" }).status === 0;
  return {
    pdftoppm: probe("pdftoppm"),
    libreoffice: probe("soffice") || probe("libreoffice"),
  };
}

function runExternal(
  executable: string,
  args: readonly string[],
  options?: { readonly cwd?: string; readonly timeoutMs?: number },
): { readonly ok: boolean; readonly stderr: string } {
  const result = spawnSync(executable, [...args], {
    encoding: "utf8",
    cwd: options?.cwd,
    timeout: options?.timeoutMs ?? 120_000,
  });
  return {
    ok: result.status === 0 && !result.error,
    stderr: `${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

async function rasterizePdfWithPdftoppm(
  input: VeronicaRasterInput,
  workDir: string,
): Promise<Uint8Array | null> {
  const page = input.pageNumber ?? 1;
  const sourcePath = path.join(workDir, input.asset.originalFilename);
  const outputPrefix = path.join(workDir, "page");
  await fs.writeFile(sourcePath, input.asset.bytes);
  const result = runExternal("pdftoppm", [
    "-png",
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    sourcePath,
    outputPrefix,
  ]);
  if (!result.ok) return null;
  try {
    return await fs.readFile(`${outputPrefix}.png`);
  } catch {
    return null;
  }
}

async function rasterizePptxWithLibreOffice(
  input: VeronicaRasterInput,
  workDir: string,
): Promise<Uint8Array | null> {
  const sourcePath = path.join(workDir, input.asset.originalFilename);
  const outDir = path.join(workDir, "out");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(sourcePath, input.asset.bytes);
  const executable = detectExternalRasterTools().libreoffice
    ? spawnSync("which", ["soffice"], { encoding: "utf8" }).status === 0
      ? "soffice"
      : "libreoffice"
    : "soffice";
  const result = runExternal(
    executable,
    ["--headless", "--convert-to", "png", "--outdir", outDir, sourcePath],
    { cwd: workDir, timeoutMs: 180_000 },
  );
  if (!result.ok) return null;
  const entries = (await fs.readdir(outDir))
    .filter((name) => name.endsWith(".png"))
    .sort();
  if (entries.length === 0) return null;
  const slideIndex = Math.max(0, (input.slideNumber ?? 1) - 1);
  const selected = entries[Math.min(slideIndex, entries.length - 1)];
  if (!selected) return null;
  return fs.readFile(path.join(outDir, selected));
}

export async function rasterizeVeronicaPreparedAsset(
  input: VeronicaRasterInput,
): Promise<VeronicaRasterResult> {
  if (["png", "jpeg", "webp", "svg"].includes(input.asset.mediaKind)) {
    return { bytes: input.asset.bytes, method: "source-bytes" };
  }

  const tools = detectExternalRasterTools();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-raster-"));
  try {
    if (input.asset.mediaKind === "pdf" && tools.pdftoppm) {
      const bytes = await rasterizePdfWithPdftoppm(input, workDir);
      if (bytes) return { bytes, method: "pdftoppm" };
    }
    if (input.asset.mediaKind === "pptx" && tools.libreoffice) {
      const bytes = await rasterizePptxWithLibreOffice(input, workDir);
      if (bytes) return { bytes, method: "libreoffice" };
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  return {
    bytes: rasterizeVeronicaPreparedAssetSynthetic(input),
    method: "synthetic",
  };
}

export async function probeExternalRasterizers(): Promise<{
  readonly tools: ExternalRasterToolAvailability;
  readonly pdfMethod: VeronicaRasterMethod;
  readonly pptxMethod: VeronicaRasterMethod;
}> {
  const tools = detectExternalRasterTools();
  const pdf = await rasterizeVeronicaPreparedAsset({
    asset: {
      assetId: "probe-pdf",
      originalFilename: "probe.pdf",
      mimeType: "application/pdf",
      mediaKind: "pdf",
      checksum: "a".repeat(64),
      byteLength: 0,
      bytes: createFixturePdf(1),
      extractedCandidates: [],
    },
    candidateId: "probe-page-1",
    label: "Page 1",
    pageNumber: 1,
    width: 320,
    height: 180,
  });
  const pptx = await rasterizeVeronicaPreparedAsset({
    asset: {
      assetId: "probe-pptx",
      originalFilename: "probe.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      mediaKind: "pptx",
      checksum: "b".repeat(64),
      byteLength: 0,
      bytes: createFixturePptx(1),
      extractedCandidates: [],
    },
    candidateId: "probe-slide-1",
    label: "Slide 1",
    slideNumber: 1,
    width: 320,
    height: 180,
  });
  return {
    tools,
    pdfMethod: pdf.method,
    pptxMethod: pptx.method,
  };
}
