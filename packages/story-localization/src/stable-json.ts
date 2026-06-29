export const STABLE_JSON_SERIALIZER_VERSION = "stable-json-v1";

type StableValue =
  | null
  | boolean
  | number
  | string
  | readonly StableValue[]
  | { readonly [key: string]: StableValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeStableValue(
  value: unknown,
  seen: Set<object>,
  path: readonly (string | number)[]
): StableValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path.join(".") || "<root>"}.`);
    }
    return value;
  }
  if (typeof value === "undefined") {
    throw new TypeError(`Undefined value at ${path.join(".") || "<root>"}.`);
  }
  if (
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new TypeError(
      `Unsupported value type "${typeof value}" at ${path.join(".") || "<root>"}.`
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError(`Cycle detected at ${path.join(".") || "<root>"}.`);
    }
    seen.add(value);
    try {
      return value.map((entry, index) =>
        normalizeStableValue(entry, seen, [...path, index])
      );
    } finally {
      seen.delete(value);
    }
  }
  if (!isPlainObject(value)) {
    throw new TypeError(
      `Unsupported object value at ${path.join(".") || "<root>"}.`
    );
  }
  if (seen.has(value)) {
    throw new TypeError(`Cycle detected at ${path.join(".") || "<root>"}.`);
  }
  seen.add(value);
  try {
    const normalized: Record<string, StableValue> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeStableValue(
        value[key],
        seen,
        [...path, key]
      );
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function toStableJsonValue(value: unknown): StableValue {
  return normalizeStableValue(value, new Set<object>(), []);
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}
