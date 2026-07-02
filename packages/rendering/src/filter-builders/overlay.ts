import {
  assertNonNegativeNumber,
  assertUnitInterval,
  formatNumber,
  formatSeconds,
} from "./formatting.js";
import { validateLocalPath } from "./escape.js";
import { FilterBuilderError, type OverlayOperation } from "./types.js";

export function buildOverlayFilter(operation: OverlayOperation): string {
  assertNonNegativeNumber("overlay", "xPx", operation.xPx);
  assertNonNegativeNumber("overlay", "yPx", operation.yPx);
  if (operation.assetPath !== undefined) {
    validateLocalPath("overlay", "assetPath", operation.assetPath);
  }
  const args = [`x=${formatNumber(operation.xPx)}`, `y=${formatNumber(operation.yPx)}`];
  if (operation.startSeconds !== undefined || operation.endSeconds !== undefined) {
    if (
      operation.startSeconds === undefined ||
      operation.endSeconds === undefined
    ) {
      throw new FilterBuilderError({
        operationKind: "overlay",
        field: "timing",
        expected: "both startSeconds and endSeconds for timed overlays",
      });
    }
    assertNonNegativeNumber("overlay", "startSeconds", operation.startSeconds);
    assertNonNegativeNumber("overlay", "endSeconds", operation.endSeconds);
    if (operation.endSeconds < operation.startSeconds) {
      throw new FilterBuilderError({
        operationKind: "overlay",
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
  if (operation.opacity !== undefined) {
    assertUnitInterval("overlay", "opacity", operation.opacity);
  }
  return `overlay=${args.join(":")}`;
}
