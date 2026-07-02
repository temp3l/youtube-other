import {
  assertPositiveInteger,
  assertPositiveNumber,
  assertUnitInterval,
  formatNumber,
} from "./formatting.js";
import { FilterBuilderError, type ZoomPanOperation } from "./types.js";

export function zoomPanFrameCount(input: {
  readonly durationSeconds: number;
  readonly fps: number;
}): number {
  assertPositiveNumber("zoompan", "durationSeconds", input.durationSeconds);
  assertPositiveNumber("zoompan", "fps", input.fps);
  return Math.max(1, Math.round(input.durationSeconds * input.fps));
}

export function buildZoomPanFilter(operation: ZoomPanOperation): string {
  assertPositiveInteger("zoompan", "outputWidthPx", operation.outputWidthPx);
  assertPositiveInteger("zoompan", "outputHeightPx", operation.outputHeightPx);
  assertPositiveNumber("zoompan", "startZoom", operation.startZoom);
  assertPositiveNumber("zoompan", "endZoom", operation.endZoom);
  if (operation.startZoom < 1 || operation.endZoom < 1) {
    throw new FilterBuilderError({
      operationKind: "zoompan",
      field: "zoom",
      expected: "startZoom and endZoom greater than or equal to 1",
    });
  }
  assertUnitInterval("zoompan", "startCenter.x", operation.startCenter.x);
  assertUnitInterval("zoompan", "startCenter.y", operation.startCenter.y);
  assertUnitInterval("zoompan", "endCenter.x", operation.endCenter.x);
  assertUnitInterval("zoompan", "endCenter.y", operation.endCenter.y);

  const frames = zoomPanFrameCount(operation);
  const denominator = Math.max(1, frames - 1);
  const progress = `on/${denominator}`;
  const zoom = `${formatNumber(operation.startZoom)}+(${formatNumber(
    operation.endZoom - operation.startZoom
  )})*${progress}`;
  const centerX = `${formatNumber(operation.startCenter.x)}+(${formatNumber(
    operation.endCenter.x - operation.startCenter.x
  )})*${progress}`;
  const centerY = `${formatNumber(operation.startCenter.y)}+(${formatNumber(
    operation.endCenter.y - operation.startCenter.y
  )})*${progress}`;
  const x = `max(0,min(iw-iw/zoom,(${centerX})*iw-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,(${centerY})*ih-ih/zoom/2))`;

  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${operation.outputWidthPx}x${operation.outputHeightPx}:fps=${formatNumber(operation.fps)}`;
}
