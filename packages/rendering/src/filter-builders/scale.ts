import { assertPositiveInteger } from "./formatting.js";
import type { PadOperation, ScaleOperation } from "./types.js";

function evenExpression(value: number, forceEven: boolean | undefined): string {
  return forceEven === true ? `trunc(${value}/2)*2` : String(value);
}

export function buildScaleFilter(operation: ScaleOperation): string {
  assertPositiveInteger("scale", "widthPx", operation.widthPx);
  assertPositiveInteger("scale", "heightPx", operation.heightPx);
  const width = evenExpression(operation.widthPx, operation.forceEven);
  const height = evenExpression(operation.heightPx, operation.forceEven);

  switch (operation.mode) {
    case "explicit":
      return `scale=${width}:${height}`;
    case "preserve-aspect":
    case "fit":
    case "contain":
      return `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
    case "fill":
    case "cover":
      return `scale=${width}:${height}:force_original_aspect_ratio=increase`;
  }
}

export function buildPadFilter(operation: PadOperation): string {
  assertPositiveInteger("pad", "widthPx", operation.widthPx);
  assertPositiveInteger("pad", "heightPx", operation.heightPx);
  const x = operation.x === "center" ? "(ow-iw)/2" : String(operation.x);
  const y = operation.y === "center" ? "(oh-ih)/2" : String(operation.y);
  const color = operation.color === undefined ? "" : `:${operation.color}`;
  return `pad=${operation.widthPx}:${operation.heightPx}:${x}:${y}${color}`;
}
