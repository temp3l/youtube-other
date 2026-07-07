import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  addRenderMotionOptions,
  buildMotionRenderConfigFromCli,
} from "./render-motion-options.js";

describe("render motion CLI options", () => {
  it("adds render-motion flags to help output", () => {
    const command = addRenderMotionOptions(new Command("render"));
    const help = command.helpInformation();

    expect(help).toContain("--motion-render-preset <presetId>");
    expect(help).toContain("--motion-mode <off|safe|cinematic|shorts>");
    expect(help).toContain("--motion-debug");
  });

  it("builds config for a valid explicit render preset", () => {
    const config = buildMotionRenderConfigFromCli({
      motion: true,
      motionMode: "cinematic",
      motionSeed: "episode-022",
      motionDebug: true,
      motionRenderPreset: "doc_slow_push_in",
    });

    expect(config).toMatchObject({
      enabled: true,
      mode: "cinematic",
      seed: "episode-022",
      debug: true,
      explicitPresetId: "doc_slow_push_in",
    });
  });

  it("rejects invalid preset names clearly", () => {
    expect(() =>
      buildMotionRenderConfigFromCli({ motionRenderPreset: "not-a-preset" })
    ).toThrow("Unsupported motion render preset: not-a-preset");
  });

  it("does not add or consume the visual-retention motion-preset flag", () => {
    const command = addRenderMotionOptions(new Command("render"));
    const optionNames = command.options.map((option) => option.long);

    expect(optionNames).toContain("--motion-render-preset");
    expect(optionNames).not.toContain("--motion-preset");
  });

  it("lets no-motion override other render-motion flags", () => {
    const config = buildMotionRenderConfigFromCli({
      motion: false,
      motionMode: "cinematic",
      motionRenderPreset: "doc_slow_push_in",
    });

    expect(config).toMatchObject({
      enabled: false,
      mode: "cinematic",
      explicitPresetId: "doc_slow_push_in",
    });
  });
});
