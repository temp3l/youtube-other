import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { mergeCommandOptions } from "./command-option-helpers.js";

describe("command option helpers", () => {
  it("merges ancestor options while preferring local options", () => {
    const program = new Command();
    program.option("--json");
    program.option("--verbose");
    const stories = program.command("stories").option("--profiles <profiles>");
    const production = stories.command("production").option("--limit <limit>");
    const batch = production.command("batch").option("--json");

    program.parse([
      "node",
      "mediaforge",
      "--json",
      "--verbose",
      "stories",
      "--profiles",
      "full",
      "production",
      "--limit",
      "4",
      "batch",
    ]);

    expect(
      mergeCommandOptions(batch, {
        episode: "028-the-man-in-the-attic",
        json: false,
      })
    ).toMatchObject({
      json: false,
      verbose: true,
      profiles: "full",
      limit: "4",
      episode: "028-the-man-in-the-attic",
    });
  });
});
