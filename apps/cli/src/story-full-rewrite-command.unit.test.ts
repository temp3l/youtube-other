import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerStoryRewriteFullCommand } from "./story-full-rewrite-command.js";

describe("story full rewrite command", () => {
  it("includes the full rewrite command and slug bootstrap flag", () => {
    const program = new Command();
    const stories = program.command("stories");
    registerStoryRewriteFullCommand(stories);
    const rewriteFull = stories.commands.find((command) => command.name() === "rewrite-full");
    expect(rewriteFull).toBeDefined();
    const flags = rewriteFull?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode-slug <slug>");
    expect(flags).toContain("--input <path>");
    expect(rewriteFull?.description()).toContain("optimized full");
  });
});
