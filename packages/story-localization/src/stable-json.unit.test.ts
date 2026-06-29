import { describe, expect, it } from "vitest";
import {
  STABLE_JSON_SERIALIZER_VERSION,
  stableSerialize,
} from "./stable-json.js";

describe("stable json", () => {
  it("serializes object keys deterministically", () => {
    expect(stableSerialize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts nested object keys while preserving array order", () => {
    expect(
      stableSerialize({
        items: [{ b: 2, a: 1 }, { d: 4, c: 3 }],
      })
    ).toBe('{"items":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });

  it("normalizes unicode strings to NFC", () => {
    expect(stableSerialize({ value: "e\u0301" })).toBe(
      stableSerialize({ value: "\u00e9" })
    );
  });

  it("does not mutate inputs", () => {
    const input = { nested: { b: "e\u0301", a: 1 } };
    const before = JSON.stringify(input);
    stableSerialize(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("rejects undefined values", () => {
    expect(() => stableSerialize({ value: undefined })).toThrow(/Undefined value/u);
  });

  it("rejects non-finite numbers", () => {
    expect(() => stableSerialize({ value: Number.NaN })).toThrow(/Non-finite/u);
  });

  it("rejects cycles", () => {
    const input: Record<string, unknown> = {};
    input.self = input;
    expect(() => stableSerialize(input)).toThrow(/Cycle detected/u);
  });

  it("rejects unsupported runtime values", () => {
    expect(() => stableSerialize(new Date())).toThrow(/Unsupported object/u);
  });

  it("exposes a stable serializer version", () => {
    expect(STABLE_JSON_SERIALIZER_VERSION).toBe("stable-json-v1");
  });
});
