import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerMathCommands } from "./math-commands.js";

describe("math speech CLI", () => {
  it("registers discoverable natural-teacher generation and comparison options", () => {
    const program = new Command();
    registerMathCommands(program);
    const math = program.commands.find((command) => command.name() === "math");
    const speech = math?.commands.find((command) => command.name() === "speech");
    const generate = speech?.commands.find((command) => command.name() === "generate");
    const compare = speech?.commands.find((command) => command.name() === "compare");
    expect(generate).toBeDefined();
    expect(compare).toBeDefined();
    expect(generate?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--speech-profile",
        "--speech-voice",
        "--speech-rate",
        "--speech-candidates",
        "--speech-selection",
        "--regenerate-speech",
        "--speech-dry-run",
      ])
    );
    expect(
      generate?.options.find((option) => option.long === "--speech-profile")
        ?.defaultValue
    ).toBe("education-natural-teacher");
  });
});
