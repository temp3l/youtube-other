import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerMathCommands } from "./math-commands.js";

vi.mock("@mediaforge/math-education", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await import("../../../packages/math-education/src/curriculum/release.js")),
  ...(await import("../../../packages/math-education/src/orchestration/batch-planner.js")),
  ...(await import("../../../packages/math-education/src/orchestration/math-workspace-paths.js")),
}));

describe("math commands", () => {
  it("registers an additive top-level command and approved subcommands", () => {
    const program = new Command();
    registerMathCommands(program);
    const math = program.commands.find((command) => command.name() === "math");
    expect(math).toBeDefined();
    expect(math?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining([
        "curriculum",
        "lesson",
        "production",
        "batch",
        "verify",
        "quality",
        "metadata",
        "status",
        "publish",
      ])
    );
  });

  it("keeps curriculum import dry-run read-only", async () => {
    const skillsPath = "packages/math-education/data/curriculum/v1/skills.json";
    const before = await fs.readFile(skillsPath, "utf8");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const program = new Command();
      registerMathCommands(program);
      await program.parseAsync([
        "node",
        "test",
        "math",
        "curriculum",
        "import",
        "--dry-run",
      ]);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"matchesNormalizedRelease": true')
      );
      expect(await fs.readFile(skillsPath, "utf8")).toBe(before);
    } finally {
      stdout.mockRestore();
    }
  });

  it("excludes unsupported lesson capabilities when creating a batch", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-cli-batch-")
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      const program = new Command();
      registerMathCommands(program);
      await program.parseAsync([
        "node",
        "test",
        "math",
        "batch",
        "create",
        "--grade",
        "5",
        "--variant",
        "standard",
        "--language",
        "de",
        "--workspace",
        workspace,
      ]);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"itemCount": 3')
      );
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"excludedCount": 34')
      );
      const files = await fs.readdir(path.join(workspace, "state", "batches"));
      expect(files).toHaveLength(1);
    } finally {
      stdout.mockRestore();
    }
  });
});
