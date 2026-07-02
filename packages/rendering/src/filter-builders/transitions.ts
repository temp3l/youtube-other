import {
  assertNonNegativeNumber,
  assertPositiveNumber,
  formatSeconds,
} from "./formatting.js";
import {
  FilterBuilderError,
  type CrossFadeOperation,
  type XfadeTransition,
} from "./types.js";

const XFADE_TRANSITIONS: readonly XfadeTransition[] = [
  "fade",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "slideup",
  "slidedown",
  "circlecrop",
  "rectcrop",
  "distance",
  "fadeblack",
  "fadewhite",
  "dissolve",
] as const;

export function buildCrossFadeFilter(operation: CrossFadeOperation): string {
  if (!XFADE_TRANSITIONS.includes(operation.transition)) {
    throw new FilterBuilderError({
      operationKind: "xfade",
      field: "transition",
      expected: "a supported xfade transition",
    });
  }
  assertPositiveNumber("xfade", "durationSeconds", operation.durationSeconds);
  assertNonNegativeNumber("xfade", "offsetSeconds", operation.offsetSeconds);
  if (
    operation.firstClipDurationSeconds !== undefined &&
    operation.durationSeconds > operation.firstClipDurationSeconds
  ) {
    throw new FilterBuilderError({
      operationKind: "xfade",
      field: "durationSeconds",
      expected: "duration not longer than the known first clip duration",
    });
  }
  return `xfade=transition=${operation.transition}:duration=${formatSeconds(
    operation.durationSeconds
  )}:offset=${formatSeconds(operation.offsetSeconds)}`;
}
