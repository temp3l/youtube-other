import { FilterBuilderError } from "./types.js";

export function assertFiniteNumber(
  operationKind: string,
  field: string,
  value: number
): void {
  if (!Number.isFinite(value)) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a finite number",
    });
  }
}

export function assertPositiveNumber(
  operationKind: string,
  field: string,
  value: number
): void {
  assertFiniteNumber(operationKind, field, value);
  if (value <= 0) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a positive number",
    });
  }
}

export function assertNonNegativeNumber(
  operationKind: string,
  field: string,
  value: number
): void {
  assertFiniteNumber(operationKind, field, value);
  if (value < 0) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a non-negative number",
    });
  }
}

export function assertPositiveInteger(
  operationKind: string,
  field: string,
  value: number
): void {
  assertPositiveNumber(operationKind, field, value);
  if (!Number.isInteger(value)) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a positive integer",
    });
  }
}

export function assertUnitInterval(
  operationKind: string,
  field: string,
  value: number
): void {
  assertFiniteNumber(operationKind, field, value);
  if (value < 0 || value > 1) {
    throw new FilterBuilderError({
      operationKind,
      field,
      expected: "a finite value in [0, 1]",
    });
  }
}

export function formatNumber(value: number): string {
  assertFiniteNumber("number", "value", value);
  if (Object.is(value, -0)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value
    .toFixed(6)
    .replace(/0+$/u, "")
    .replace(/\.$/u, "");
}

export function formatSeconds(value: number): string {
  assertNonNegativeNumber("time", "seconds", value);
  return formatNumber(value);
}
