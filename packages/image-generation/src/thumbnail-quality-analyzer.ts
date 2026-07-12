import sharp from "sharp";

export interface ThumbnailQualityReport {
  readonly passed: boolean;
  readonly contrast: number;
  readonly edgeDensity: number;
  readonly warnings: readonly string[];
}

export async function analyzeThumbnailAtMobileSize(filePath: string): Promise<ThumbnailQualityReport> {
  const preview = sharp(filePath).resize({ width: 160, height: 90, fit: "cover" }).greyscale();
  const stats = await preview.clone().stats();
  const contrast = Number((stats.channels[0]?.stdev ?? 0).toFixed(2));
  const edges = await preview.clone().convolve({ width: 3, height: 3, kernel: [-1,-1,-1,-1,8,-1,-1,-1,-1] }).stats();
  const edgeDensity = Number(((edges.channels[0]?.mean ?? 0) / 255).toFixed(3));
  const warnings: string[] = [];
  if (contrast < 42) warnings.push("low mobile-size contrast");
  if (edgeDensity < 0.025) warnings.push("soft or indistinct focal shapes");
  if (edgeDensity > 0.22) warnings.push("visually cluttered at mobile size");
  return { passed: warnings.length === 0, contrast, edgeDensity, warnings };
}
