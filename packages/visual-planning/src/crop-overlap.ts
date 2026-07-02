import type { NormalizedCrop } from "@mediaforge/domain";

export interface NormalizedRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EffectiveCropResolution {
  readonly cropWidthPx: number;
  readonly cropHeightPx: number;
  readonly outputEquivalentHeightPx: number;
}

const floatTolerance = 1e-12;

/**
 * Returns normalized intersection-over-union for valid normalized crops.
 * Edge-touching rectangles have zero intersection area and therefore IoU 0.
 */
export function normalizedCropIou(
  left: NormalizedCrop,
  right: NormalizedCrop,
): number {
  const intersection = rectangleIntersectionArea(left, right);
  const union = rectangleArea(left) + rectangleArea(right) - intersection;
  if (union <= floatTolerance) {
    return 0;
  }
  return clampUnit(intersection / union);
}

export function rectangleIntersectionArea(
  left: NormalizedRectangle,
  right: NormalizedRectangle,
): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  if (width <= floatTolerance || height <= floatTolerance) {
    return 0;
  }
  return width * height;
}

export function rectanglesOverlap(
  left: NormalizedRectangle,
  right: NormalizedRectangle,
): boolean {
  return rectangleIntersectionArea(left, right) > 0;
}

export function cropContainsRectangleWithMargin(args: {
  readonly crop: NormalizedCrop;
  readonly rectangle: NormalizedRectangle;
  readonly margin: number;
}): boolean {
  const left = args.rectangle.x - args.margin;
  const top = args.rectangle.y - args.margin;
  const right = args.rectangle.x + args.rectangle.width + args.margin;
  const bottom = args.rectangle.y + args.rectangle.height + args.margin;
  return (
    args.crop.x <= left + floatTolerance &&
    args.crop.y <= top + floatTolerance &&
    args.crop.x + args.crop.width >= right - floatTolerance &&
    args.crop.y + args.crop.height >= bottom - floatTolerance
  );
}

export function calculateEffectiveCropResolution(args: {
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly crop: NormalizedCrop;
}): EffectiveCropResolution {
  const cropWidthPx = args.sourceWidthPx * args.crop.width;
  const cropHeightPx = args.sourceHeightPx * args.crop.height;
  return {
    cropWidthPx,
    cropHeightPx,
    outputEquivalentHeightPx: cropHeightPx,
  };
}

function rectangleArea(rectangle: NormalizedRectangle): number {
  return Math.max(0, rectangle.width) * Math.max(0, rectangle.height);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
