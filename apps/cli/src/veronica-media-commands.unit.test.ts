import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerVeronicaMediaCommands } from "./veronica-media-commands.js";

describe("veronica media commands", () => {
  it("registers the isolated Veronica media subcommands", () => {
    const program = new Command();
    registerVeronicaMediaCommands(program);
    const veronica = program.commands.find((command) => command.name() === "veronica-media");
    expect(veronica?.commands.map((command) => command.name())).toEqual([
      "pilot",
      "run",
      "plan-positioning-series",
      "review-pack",
      "validate",
      "render",
    ]);
  });
});
