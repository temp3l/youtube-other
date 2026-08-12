import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  registerVeronicaMediaCommands,
  resolveVeronicaPaidQaAuthorization,
} from "./veronica-media-commands.js";

describe("veronica media commands", () => {
  it("applies format-aware paid-QA ceilings only after explicit authorization", () => {
    expect(resolveVeronicaPaidQaAuthorization({}, "short")).toBeUndefined();
    expect(
      resolveVeronicaPaidQaAuthorization(
        { allowPaidOpenaiQa: true },
        "short"
      )
    ).toEqual({
      maxProviderCalls: 6,
      maxEstimatedCostUsd: 0.4,
      maxFlagshipCallsPerPack: 1,
      maxEstimatedInputTokens: 60_000,
      maxEstimatedOutputTokens: 20_000,
    });
    expect(
      resolveVeronicaPaidQaAuthorization(
        { allowPaidOpenaiQa: true },
        "full"
      )
    ).toEqual({
      maxProviderCalls: 10,
      maxEstimatedCostUsd: 0.6,
      maxFlagshipCallsPerPack: 1,
      maxEstimatedInputTokens: 150_000,
      maxEstimatedOutputTokens: 40_000,
    });
    expect(
      resolveVeronicaPaidQaAuthorization(
        { allowPaidOpenaiQa: true, maxProviderCalls: 2 },
        "full"
      )?.maxProviderCalls
    ).toBe(2);
  });

  it("registers the isolated Veronica media subcommands", () => {
    const program = new Command();
    registerVeronicaMediaCommands(program);
    const veronica = program.commands.find((command) => command.name() === "veronica-media");
    const sourcePack = veronica?.commands.find((command) => command.name() === "source-pack");
    expect(veronica?.commands.map((command) => command.name())).toEqual([
      "source-pack",
      "metadata",
      "prepare-production",
      "source-grounded-qa",
      "remediate-pre-image",
      "plan-visual-density",
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
    expect(sourcePack?.commands.map((command) => command.name())).toEqual([
      "prepare",
      "prepare-full-transcripted",
    ]);
    const images = veronica?.commands.find((command) => command.name() === "images");
    const preparation = veronica?.commands.find((command) => command.name() === "prepare-production");
    const sourceGroundedQa = veronica?.commands.find((command) => command.name() === "source-grounded-qa");
    expect(preparation?.options.map((option) => option.flags)).toContain("-L, --language <code>");
    expect(images?.commands.map((command) => command.name())).toEqual([
      "derive-image-prompts",
      "inspect-image-prompts",
      "review-pack",
      "generate",
    ]);
    const imageGenerate = images?.commands.find((command) => command.name() === "generate");
    const reviewPack = images?.commands.find((command) => command.name() === "review-pack");
    expect(imageGenerate?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--mode",
        "--concurrency",
        "--max-batch-size",
        "--refresh-image-prompt-brief",
      ]),
    );
    expect(reviewPack?.options.find((option) => option.long === "--review-pack-mode")?.defaultValue).toBe("compact");
    expect(preparation?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--allow-paid-openai-qa",
        "--max-provider-calls",
        "--max-estimated-cost-usd",
        "--max-flagship-calls-per-pack",
        "--max-estimated-input-tokens",
        "--max-estimated-output-tokens",
        "--max-automatic-remediation-rounds",
      ]),
    );
    expect(sourceGroundedQa?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--allow-paid-openai-qa",
        "--max-provider-calls",
        "--max-estimated-cost-usd",
      ]),
    );
    expect(sourceGroundedQa?.options.find((option) => option.long === "--max-provider-calls")?.description).toContain("Short 6; full 10");
    expect(sourceGroundedQa?.options.find((option) => option.long === "--max-estimated-output-tokens")?.description).toContain("Short 20000; full 40000");
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
