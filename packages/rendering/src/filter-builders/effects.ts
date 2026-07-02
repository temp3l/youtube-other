import {
  assertFiniteNumber,
  assertNonNegativeNumber,
  assertPositiveNumber,
  assertUnitInterval,
  formatNumber,
  formatSeconds,
} from "./formatting.js";
import { validateColor } from "./escape.js";
import {
  FilterBuilderError,
  type BoxBlurOperation,
  type EqOperation,
  type FadeOperation,
  type FormatOperation,
  type NoiseOperation,
  type PixelFormat,
  type RotateOperation,
  type SetPtsOperation,
  type VignetteOperation,
} from "./types.js";

const PIXEL_FORMATS: readonly PixelFormat[] = [
  "yuv420p",
  "rgba",
  "rgb24",
  "yuva420p",
] as const;

export function buildBoxBlurFilter(operation: BoxBlurOperation): string {
  assertPositiveNumber("boxblur", "radius", operation.radius);
  if (operation.radius > 100) {
    throw new FilterBuilderError({
      operationKind: "boxblur",
      field: "radius",
      expected: "a radius no greater than 100",
    });
  }
  const power = operation.power ?? 1;
  assertPositiveNumber("boxblur", "power", power);
  if (power > 10) {
    throw new FilterBuilderError({
      operationKind: "boxblur",
      field: "power",
      expected: "a power no greater than 10",
    });
  }
  return `boxblur=${formatNumber(operation.radius)}:${formatNumber(power)}`;
}

export function buildEqFilter(operation: EqOperation): string {
  const args: string[] = [];
  if (operation.brightness !== undefined) {
    assertFiniteNumber("eq", "brightness", operation.brightness);
    if (operation.brightness < -1 || operation.brightness > 1) {
      throw new FilterBuilderError({
        operationKind: "eq",
        field: "brightness",
        expected: "a value in [-1, 1]",
      });
    }
    args.push(`brightness=${formatNumber(operation.brightness)}`);
  }
  if (operation.contrast !== undefined) {
    assertFiniteNumber("eq", "contrast", operation.contrast);
    if (operation.contrast < 0 || operation.contrast > 3) {
      throw new FilterBuilderError({
        operationKind: "eq",
        field: "contrast",
        expected: "a value in [0, 3]",
      });
    }
    args.push(`contrast=${formatNumber(operation.contrast)}`);
  }
  if (operation.saturation !== undefined) {
    assertFiniteNumber("eq", "saturation", operation.saturation);
    if (operation.saturation < 0 || operation.saturation > 3) {
      throw new FilterBuilderError({
        operationKind: "eq",
        field: "saturation",
        expected: "a value in [0, 3]",
      });
    }
    args.push(`saturation=${formatNumber(operation.saturation)}`);
  }
  if (operation.gamma !== undefined) {
    assertFiniteNumber("eq", "gamma", operation.gamma);
    if (operation.gamma < 0.1 || operation.gamma > 10) {
      throw new FilterBuilderError({
        operationKind: "eq",
        field: "gamma",
        expected: "a value in [0.1, 10]",
      });
    }
    args.push(`gamma=${formatNumber(operation.gamma)}`);
  }
  if (args.length === 0) {
    throw new FilterBuilderError({
      operationKind: "eq",
      field: "parameters",
      expected: "at least one color adjustment",
    });
  }
  return `eq=${args.join(":")}`;
}

export function buildNoiseFilter(operation: NoiseOperation): string {
  assertUnitInterval("noise", "strength", operation.strength);
  const allStrength = Math.round(operation.strength * 100);
  const flags = operation.temporal === true ? "t" : "u";
  return `noise=alls=${allStrength}:allf=${flags}`;
}

export function buildVignetteFilter(operation: VignetteOperation): string {
  const angle = operation.angle ?? Math.PI / 5;
  assertPositiveNumber("vignette", "angle", angle);
  return `vignette=angle=${formatNumber(angle)}`;
}

export function buildFadeFilter(operation: FadeOperation): string {
  assertNonNegativeNumber("fade", "startSeconds", operation.startSeconds);
  assertPositiveNumber("fade", "durationSeconds", operation.durationSeconds);
  const color =
    operation.color === undefined
      ? ""
      : (() => {
          validateColor("fade", "color", operation.color);
          return `:color=${operation.color}`;
        })();
  return `fade=t=${operation.direction}:st=${formatSeconds(
    operation.startSeconds
  )}:d=${formatSeconds(operation.durationSeconds)}${color}`;
}

export function buildSetPtsFilter(operation: SetPtsOperation): string {
  switch (operation.mode) {
    case "reset":
      return "setpts=PTS-STARTPTS";
    case "offset":
      assertFiniteNumber("setpts", "offsetSeconds", operation.offsetSeconds);
      return `setpts=PTS-STARTPTS+${formatNumber(operation.offsetSeconds)}/TB`;
    case "scale":
      assertPositiveNumber("setpts", "factor", operation.factor);
      return `setpts=${formatNumber(operation.factor)}*PTS`;
  }
}

export function buildRotateFilter(operation: RotateOperation): string {
  assertFiniteNumber("rotate", "angleDegrees", operation.angleDegrees);
  if (operation.angleDegrees < -45 || operation.angleDegrees > 45) {
    throw new FilterBuilderError({
      operationKind: "rotate",
      field: "angleDegrees",
      expected: "a constrained angle in degrees within [-45, 45]",
    });
  }
  const args = [`${formatNumber(operation.angleDegrees)}*PI/180`];
  if (operation.expandOutput === true) {
    args.push("ow=rotw(iw)", "oh=roth(ih)");
  }
  if (operation.fillColor !== undefined) {
    validateColor("rotate", "fillColor", operation.fillColor);
    args.push(`fillcolor=${operation.fillColor}`);
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
        operationKind: "rotate",
        field: "timing",
        expected: "both startSeconds and endSeconds when timing is enabled",
      });
    }
    assertNonNegativeNumber("rotate", "startSeconds", operation.startSeconds);
    assertNonNegativeNumber("rotate", "endSeconds", operation.endSeconds);
    if (operation.endSeconds < operation.startSeconds) {
      throw new FilterBuilderError({
        operationKind: "rotate",
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
  return `rotate=${args.join(":")}`;
}

export function buildFormatFilter(operation: FormatOperation): string {
  if (!PIXEL_FORMATS.includes(operation.pixelFormat)) {
    throw new FilterBuilderError({
      operationKind: "format",
      field: "pixelFormat",
      expected: "a supported pixel format",
    });
  }
  return `format=${operation.pixelFormat}`;
}
