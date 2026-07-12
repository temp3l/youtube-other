import fs from "node:fs/promises";
import path from "node:path";
import { hashFile, writeBinaryAtomic } from "@mediaforge/shared";
import {
  renderSemanticComponent,
  type SemanticMathComponent,
  type VisualComponentResult,
} from "./math-components.js";

export interface CachedSemanticSvg extends VisualComponentResult {
  filePath: string;
  cacheHit: boolean;
}

export async function cacheSemanticSvg(
  cacheDir: string,
  input: SemanticMathComponent
): Promise<CachedSemanticSvg> {
  const rendered = renderSemanticComponent(input);
  const root = path.resolve(cacheDir);
  const filePath = path.join(root, `${rendered.cacheKey}.svg`);
  await fs.mkdir(root, { recursive: true });
  const existingHash = await hashFile(filePath).catch(() => null);
  if (existingHash === rendered.svgHash)
    return { ...rendered, filePath, cacheHit: true };
  await writeBinaryAtomic(filePath, Buffer.from(rendered.svg, "utf8"));
  if ((await hashFile(filePath)) !== rendered.svgHash)
    throw new Error(`Semantic SVG cache verification failed: ${filePath}`);
  return { ...rendered, filePath, cacheHit: false };
}
