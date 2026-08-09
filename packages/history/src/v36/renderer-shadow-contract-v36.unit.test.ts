import { describe, expect, it } from "vitest";

import { renderSpecIdV36 } from "./renderer-shadow-contract-v36.js";

describe("V3.6 renderer shadow contract", () => {
  it("creates deterministic identity independent of object key order", () => {
    const first = renderSpecIdV36({
      compilerIntentId: "intent-1",
      semanticPayload: { from: "A", to: "B" },
    });
    const second = renderSpecIdV36({
      semanticPayload: { to: "B", from: "A" },
      compilerIntentId: "intent-1",
    });
    expect(first).toBe(second);
  });

  it("keeps render-spec identity separate from compiler identity", () => {
    expect(
      renderSpecIdV36({
        compilerIntentId: "history-compiler-intent-abc",
        semanticPayload: { kind: "causal" },
      })
    ).toMatch(/^history-render-spec-[a-f0-9]{24}$/u);
  });
});
