import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerVeronicaMediaCommands } from "./veronica-media-commands.js";

describe("veronica media commands", () => {
  it("registers the isolated Veronica media subcommands", () => {
    const program = new Command();
    registerVeronicaMediaCommands(program);
    const veronica = program.commands.find((command) => command.name() === "veronica-media");
    expect(veronica?.commands.map((command) => command.name())).toEqual([
      "metadata",
      "prepare-production",
      "images",
      "speech",
      "pilot",
      "run",
      "plan-positioning-series",
      "plan-positioning-calibration",
      "review-pack",
      "validate",
      "render",
    ]);
    const images = veronica?.commands.find((command) => command.name() === "images");
    expect(images?.commands.map((command) => command.name())).toEqual([
      "derive-image-prompts",
      "inspect-image-prompts",
      "generate",
    ]);
    const imageGenerate = images?.commands.find((command) => command.name() === "generate");
    expect(imageGenerate?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--mode",
        "--concurrency",
        "--max-batch-size",
        "--refresh-image-prompt-brief",
      ]),
    );
    const speech = veronica?.commands.find((command) => command.name() === "speech");
    expect(speech?.commands.map((command) => command.name())).toEqual([
      "plan",
      "generate",
      "validate",
      "status",
    ]);
    expect(
      speech?.commands
        .find((command) => command.name() === "generate")
        ?.options.map((option) => option.long),
    ).toEqual(
      expect.arrayContaining([
        "--all-languages",
        "--all-variants",
        "--concurrency",
      ]),
    );
  });
});
