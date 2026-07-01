import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    openAiLocalizationModel: "gpt-5.4-localize",
    openAiLocalizationReasoningEffort: "low",
    openAiLocalizationMaxOutputTokens: 12345,
    openAiValidatorModel: "gpt-5-validator",
    openAiValidatorReasoningEffort: "medium",
    openAiValidatorMaxOutputTokens: 9999,
    openAiMetadataModel: "gpt-5-metadata",
    openAiMetadataReasoningEffort: "high",
    openAiMetadataMaxOutputTokens: 8888,
  })),
}));

import {
  buildBatchConfig,
  buildCommandConfig,
  registerStoryLocalizationCommands,
} from "./story-localization-commands.js";

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
      "analyze",
      "bootstrap-shared",
      "inspect",
      "localize",
      "resume-images",
      "rewrite-full",
      "rewrite-short",
      "status",
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
    expect(docs).toContain("stories analyze");
    expect(docs).toContain("stories:batches verify-index");
    expect(docs).toContain("node apps/cli/dist/index.js episode resume-images");
    expect(docs).not.toContain(
      "node apps/cli/dist/index.js episodes resume-images"
    );
  });

  it("routes localized full model and repair config through localization settings only", async () => {
    const config = await buildCommandConfig({});
    expect(config.model).toBe("gpt-5.4-localize");
    expect(config.reasoningEffort).toBe("low");
    expect(config.maxOutputTokens).toBe(12345);
    expect(config.retryMaxOutputTokens).toBe(12345);
    expect(config.repairModel).toBe("gpt-5.4-localize");
    expect(config.repairReasoningEffort).toBe("low");
    expect(config.repairMaxOutputTokens).toBe(12345);
  });

  it("keeps batch localized full config on the localization fallback family", async () => {
    const config = await buildBatchConfig({});
    expect(config.model).toBe("gpt-5.4-localize");
    expect(config.repairModel).toBe("gpt-5.4-localize");
    expect(config.maxOutputTokens).toBe(12345);
    expect(config.repairMaxOutputTokens).toBe(12345);
  });

  it("normalizes regional Spanish locale input to es", async () => {
    const config = await buildCommandConfig({ languages: "es-419" });
    expect(config.languages).toEqual(["es"]);
  });

  it("rejects legacy sp locale input with an actionable error", async () => {
    await expect(buildCommandConfig({ languages: "sp" })).rejects.toThrow(
      'Use "es" for Spanish.'
    );
  });
});
