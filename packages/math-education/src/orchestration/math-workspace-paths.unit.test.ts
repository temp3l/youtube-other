import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MathWorkspacePathResolver } from "./math-workspace-paths.js";

describe("math workspace paths", () => {
  it("keeps lesson and locale paths under the isolated root", () => {
    const paths = new MathWorkspacePathResolver("/tmp/math");
    expect(paths.locale("m5-zo-001-standard", "de")).toBe(
      "/tmp/math/m5-zo-001-standard/locales/de"
    );
    expect(() => paths.resolve("..", "episodes")).toThrow(/traversal/u);
  });

  it("rejects symlink escapes for artifact readers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-paths-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "math-outside-"));
    await fs.writeFile(path.join(outside, "manifest.json"), "{}", "utf8");
    await fs.symlink(outside, path.join(root, "m5-zo-001-standard"));
    const paths = new MathWorkspacePathResolver(root);
    await expect(
      paths.readJson(paths.manifest("m5-zo-001-standard"))
    ).rejects.toThrow(/symlink|escape/u);
  });
});
