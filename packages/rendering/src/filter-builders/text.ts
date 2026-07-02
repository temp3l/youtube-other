import {
  assertNonNegativeNumber,
  assertPositiveInteger,
  assertUnitInterval,
  formatNumber,
  formatSeconds,
} from "./formatting.js";
import {
  escapeDrawTextValue,
  validateColor,
  validateLocalPath,
} from "./escape.js";
import { FilterBuilderError, type DrawTextOperation } from "./types.js";

export function buildDrawTextFilter(operation: DrawTextOperation): string {
  if (operation.text.length === 0) {
    throw new FilterBuilderError({
      operationKind: "drawtext",
      field: "text",
      expected: "non-empty text",
    });
  }
  assertNonNegativeNumber("drawtext", "xPx", operation.xPx);
  assertNonNegativeNumber("drawtext", "yPx", operation.yPx);
  assertPositiveInteger("drawtext", "fontSizePx", operation.fontSizePx);
  validateColor("drawtext", "fontColor", operation.fontColor);

  const args = [
    `text='${escapeDrawTextValue(operation.text)}'`,
    `x=${formatNumber(operation.xPx)}`,
    `y=${formatNumber(operation.yPx)}`,
    `fontsize=${operation.fontSizePx}`,
    `fontcolor=${operation.fontColor}`,
  ];
  if (operation.fontFile !== undefined) {
    validateLocalPath("drawtext", "fontFile", operation.fontFile);
    args.push(`fontfile='${escapeDrawTextValue(operation.fontFile)}'`);
  }
  if (operation.box !== undefined) {
    validateColor("drawtext", "box.color", operation.box.color);
    assertUnitInterval("drawtext", "box.opacity", operation.box.opacity);
    args.push("box=1");
    args.push(
      `boxcolor=${operation.box.color}@${formatNumber(operation.box.opacity)}`
    );
    if (operation.box.borderWidthPx !== undefined) {
      assertNonNegativeNumber(
        "drawtext",
        "box.borderWidthPx",
        operation.box.borderWidthPx
      );
      args.push(`boxborderw=${formatNumber(operation.box.borderWidthPx)}`);
    }
  }
  if (
    operation.startSeconds !== undefined ||
    operation.endSeconds !== undefined
  ) {
    if (
      operation.startSeconds === undefined ||
      operation.endSeconds === undefined
    ) {
      throw new FilterBuilderError({
        operationKind: "drawtext",
        field: "timing",
        expected: "both startSeconds and endSeconds when timing is enabled",
      });
    }
    assertNonNegativeNumber("drawtext", "startSeconds", operation.startSeconds);
    assertNonNegativeNumber("drawtext", "endSeconds", operation.endSeconds);
    if (operation.endSeconds < operation.startSeconds) {
      throw new FilterBuilderError({
        operationKind: "drawtext",
        field: "endSeconds",
        expected: "a value greater than or equal to startSeconds",
      });
    }
    args.push(
      `enable='between(t,${formatSeconds(operation.startSeconds)},${formatSeconds(
        operation.endSeconds
      )})'`
    );
  }
  return `drawtext=${args.join(":")}`;
}
