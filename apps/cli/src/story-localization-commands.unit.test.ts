import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerStoryLocalizationCommands } from "./story-localization-commands.js";

function commandNames(command: Command): string[] {
  return command.commands.map((entry) => entry.name()).sort();
}

describe("story localization command registration", () => {
  it("registers the documented story commands and batch commands", async () => {
    const program = new Command();
    registerStoryLocalizationCommands(program);

    const stories = program.commands.find(
      (command) => command.name() === "stories"
    );
    const batches = program.commands.find(
      (command) => command.name() === "stories:batches"
    );
    expect(stories).toBeDefined();
    expect(batches).toBeDefined();
    expect(commandNames(stories as Command)).toEqual([
      "bootstrap-shared",
      "localize",
      "resume-images",
      "rewrite-full",
      "rewrite-short",
      "sync-characters",
    ]);
    expect(commandNames(batches as Command)).toEqual([
      "cancel",
      "completed",
      "expired",
      "failed",
      "find",
      "import",
      "import-ready",
      "latest",
      "list",
      "pending",
      "ready",
      "rebuild-index",
      "refresh",
      "retry-failed",
      "show",
      "status",
      "verify-index",
    ]);

    const docs = await fs.readFile(path.resolve("docs/cli.md"), "utf8");
    expect(docs).toContain("stories rewrite-full");
    expect(docs).toContain("stories rewrite-short");
    expect(docs).toContain("stories:batches verify-index");
    expect(docs).toContain("node apps/cli/dist/index.js episode resume-images");
    expect(docs).not.toContain(
      "node apps/cli/dist/index.js episodes resume-images"
    );
  });
});
