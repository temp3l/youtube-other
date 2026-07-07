import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: "/tmp/story-pipeline-workspace",
  })),
}));

import {
  commandStoriesPipeline,
  registerStoryPipelineCommand,
} from "./story-pipeline-command.js";
import { workflowManifestSchema } from "@mediaforge/story-localization";

function makeOutput() {
  let text = "";
  return {
    stdout: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    read() {
      return text;
    },
  };
}

describe("story pipeline command", () => {
  it("registers under stories", () => {
    const program = new Command();
    const stories = program.command("stories");
    registerStoryPipelineCommand(stories);
    expect(stories.commands.map((command) => command.name())).toContain("pipeline");
  });

  it("prints a valid planned workflow as JSON", async () => {
    const output = makeOutput();
    await commandStoriesPipeline(
      {
        episode: "009-the-christmas-doll",
        locales: "en,es-419",
        formats: "full,short",
        dryRun: true,
        json: true,
      },
      output
    );

    const manifest = workflowManifestSchema.parse(JSON.parse(output.read()));
    expect(manifest.episodeId).toBe("009-the-christmas-doll");
    expect(manifest.locales).toEqual(["en", "es"]);
    expect(manifest.formats).toEqual(["full", "short"]);
    expect(manifest.stages.every((stage) => stage.status === "planned")).toBe(true);
  });

  it("parses --dry-run through the registered command", async () => {
    const program = new Command()
      .option("--dry-run", "global dry run")
      .option("--json", "global JSON output");
    const stories = program.command("stories");
    registerStoryPipelineCommand(stories);
    let output = "";
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        output += String(chunk);
        return true;
      });
    try {
      await program.parseAsync(
        [
          "stories",
          "pipeline",
          "--dry-run",
          "--episode",
          "009-the-christmas-doll",
          "--locales",
          "en,de",
          "--formats",
          "full,short",
          "--json",
        ],
        { from: "user" }
      );
    } finally {
      writeSpy.mockRestore();
    }

    const manifest = workflowManifestSchema.parse(JSON.parse(output));
    expect(manifest.episodeId).toBe("009-the-christmas-doll");
    expect(manifest.locales).toEqual(["en", "de"]);
    expect(manifest.formats).toEqual(["full", "short"]);
  });

  it("rejects legacy sp before planning stages", async () => {
    const output = makeOutput();
    await expect(
      commandStoriesPipeline(
        {
          episode: "009-the-christmas-doll",
          locales: "es,sp",
          formats: "full",
          dryRun: true,
          json: true,
        },
        output
      )
    ).rejects.toThrow('Use "es" for Spanish.');
    expect(output.read()).toBe("");
  });
});
