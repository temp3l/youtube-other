import path from "node:path";
import { FilterBuilderError } from "./types.js";

const SAFE_COLOR_PATTERN =
  /^(?:#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?|[A-Za-z][A-Za-z0-9_-]{0,31})(?:@[0-9]+(?:\.[0-9]+)?)?$/u;

export function escapeFilterValue(value: string): string {
  return value.replace(/[\\':,\x5b\x5d\n\r%]/gu, (character) => {
    switch (character) {
      case "\\":
        return "\\\\";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      default:
        return `\\${character}`;
    }
  });
}

export function escapeDrawTextValue(value: string): string {
  return escapeFilterValue(value);
}

export function escapeSubtitlePathForSceneCompatibility(value: string): string {
  return value.replace(/:/gu, "\\:");
}

export function validateLocalPath(
  operationKind: string,
  field: string,
  value: string
): void {
  if (value.trim().length === 0) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a non-empty local path",
    });
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a local path, not a URL",
    });
  }
  if (path.isAbsolute(value) || value.startsWith(".")) {
    return;
  }
  if (value.includes("/") || value.includes("\\")) {
    return;
  }
}

export function validateColor(
  operationKind: string,
  field: string,
  value: string
): void {
  if (!SAFE_COLOR_PATTERN.test(value)) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a named FFmpeg color or #RRGGBB/#RRGGBBAA value",
    });
  }
}
