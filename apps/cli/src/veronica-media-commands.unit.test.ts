import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerVeronicaMediaCommands } from "./veronica-media-commands.js";

describe("veronica media commands", () => {
  it("registers pilot and validate subcommands", () => {
    const program = new Command();
    registerVeronicaMediaCommands(program);
    const veronica = program.commands.find((command) => command.name() === "veronica-media");
    expect(veronica?.commands.map((command) => command.name())).toEqual([
      "pilot",
      "validate",
    ]);
  });
});
