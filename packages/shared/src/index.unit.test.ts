import { describe, expect, it } from "vitest";
import { collapseRepeatedTokenRuns, sceneFilename, secondsToSrtTimestamp, slugify } from "./index.js";

describe("shared helpers", () => {
  it("slugifies text deterministically", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("formats scene filenames deterministically", () => {
    expect(sceneFilename(1, 0, 9, "16:9")).toBe("scene-001__000000-000009__16x9.png");
  });

  it("formats SRT timestamps", () => {
    expect(secondsToSrtTimestamp(12.345)).toBe("00:00:12,345");
  });

  it("collapses repeated token runs conservatively", () => {
    expect(
      collapseRepeatedTokenRuns("Open your fridge right now. Open your fridge right now. A can of soda.")
    ).toBe("Open your fridge right now. A can of soda.");
  });
});
