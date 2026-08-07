import { describe, expect, it } from "vitest";
import { detectLayoutOverflow } from "./translation.js";

describe("detectLayoutOverflow", () => {
  it("flags character and line overflow for approval", () => {
    const short = detectLayoutOverflow({ text: "ok", maxCharacters: 10 });
    expect(short.overflow).toBe(false);
    expect(short.requiresApproval).toBe(false);

    const long = detectLayoutOverflow({ text: "x".repeat(20), maxCharacters: 10 });
    expect(long.overflow).toBe(true);
    expect(long.requiresApproval).toBe(true);

    const multiline = detectLayoutOverflow({
      text: "line one\nline two\nline three",
      maxCharacters: 100,
      maxLines: 2,
    });
    expect(multiline.lineCount).toBe(3);
    expect(multiline.overflow).toBe(true);
  });
});
