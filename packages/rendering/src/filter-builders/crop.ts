import type { NormalizedCrop } from "@mediaforge/domain";
import {
  assertPositiveInteger,
  assertUnitInterval,
  formatNumber,
} from "./formatting.js";
import { FilterBuilderError, type CropOperation, type CropRectPx } from "./types.js";

function validateCropBounds(operation: CropOperation, xPx: number, yPx: number) {
  if (
    operation.inputWidthPx === undefined ||
    operation.inputHeightPx === undefined
  ) {
    return;
  }
  assertPositiveInteger("crop", "inputWidthPx", operation.inputWidthPx);
  assertPositiveInteger("crop", "inputHeightPx", operation.inputHeightPx);
  if (xPx < 0 || yPx < 0) {
    throw new FilterBuilderError({
      operationKind: "crop",
      field: "position",
      expected: "crop origin inside the input frame",
    });
  }
  if (
    xPx + operation.widthPx > operation.inputWidthPx ||
    yPx + operation.heightPx > operation.inputHeightPx
  ) {
    throw new FilterBuilderError({
      operationKind: "crop",
      field: "position",
      expected: "crop rectangle inside the input frame",
    });
  }
}

export function resolveNormalizedCrop(input: {
  readonly crop: NormalizedCrop;
  readonly inputWidthPx: number;
  readonly inputHeightPx: number;
}): CropRectPx {
  assertPositiveInteger("crop", "inputWidthPx", input.inputWidthPx);
  assertPositiveInteger("crop", "inputHeightPx", input.inputHeightPx);
  assertUnitInterval("crop", "crop.x", input.crop.x);
  assertUnitInterval("crop", "crop.y", input.crop.y);
  assertUnitInterval("crop", "crop.width", input.crop.width);
  assertUnitInterval("crop", "crop.height", input.crop.height);
  if (input.crop.width <= 0 || input.crop.height <= 0) {
    throw new FilterBuilderError({
      operationKind: "crop",
      field: "crop",
      expected: "positive normalized width and height",
    });
  }
  if (input.crop.x + input.crop.width > 1 || input.crop.y + input.crop.height > 1) {
    throw new FilterBuilderError({
      operationKind: "crop",
      field: "crop",
      expected: "normalized crop inside [0, 1] source bounds",
    });
  }
  return {
    x: Math.round(input.crop.x * input.inputWidthPx),
    y: Math.round(input.crop.y * input.inputHeightPx),
    width: Math.round(input.crop.width * input.inputWidthPx),
    height: Math.round(input.crop.height * input.inputHeightPx),
  };
}

export function buildCropFilter(operation: CropOperation): string {
  assertPositiveInteger("crop", "widthPx", operation.widthPx);
  assertPositiveInteger("crop", "heightPx", operation.heightPx);
  switch (operation.position.mode) {
    case "explicit": {
      const xPx = operation.position.xPx;
      const yPx = operation.position.yPx;
      validateCropBounds(operation, xPx, yPx);
      return `crop=${operation.widthPx}:${operation.heightPx}:${formatNumber(xPx)}:${formatNumber(yPx)}`;
    }
    case "center":
      return `crop=${operation.widthPx}:${operation.heightPx}`;
    case "focal": {
      assertUnitInterval("crop", "position.focal.x", operation.position.focal.x);
      assertUnitInterval("crop", "position.focal.y", operation.position.focal.y);
      const x = `max(0,min(iw-${operation.widthPx},${formatNumber(
        operation.position.focal.x
      )}*iw-${formatNumber(operation.widthPx / 2)}))`;
      const y = `max(0,min(ih-${operation.heightPx},${formatNumber(
        operation.position.focal.y
      )}*ih-${formatNumber(operation.heightPx / 2)}))`;
      return `crop=${operation.widthPx}:${operation.heightPx}:${x}:${y}`;
    }
  }
}
