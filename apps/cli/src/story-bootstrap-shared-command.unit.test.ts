import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const commandEpisodeBootstrapCharactersMock = vi.hoisted(() => vi.fn());
const commandEpisodeSyncCharactersMock = vi.hoisted(() => vi.fn());

vi.mock("./episode-commands.js", () => ({
  commandEpisodeBootstrapCharacters: commandEpisodeBootstrapCharactersMock,
  commandEpisodeSyncCharacters: commandEpisodeSyncCharactersMock,
}));

const { registerStoryLocalizationCommands } = await import("./story-localization-commands.js");

describe("story bootstrap shared command", () => {
  beforeEach(() => {
    commandEpisodeBootstrapCharactersMock.mockReset();
    commandEpisodeSyncCharactersMock.mockReset();
  });

  it("exposes a stories alias for bootstrapping shared character assets", async () => {
    const program = new Command();
    registerStoryLocalizationCommands(program);
    const stories = program.commands.find((command) => command.name() === "stories");
    expect(stories).toBeDefined();
    const bootstrapShared = stories?.commands.find((command) => command.name() === "bootstrap-shared");
    expect(bootstrapShared).toBeDefined();
    const flags = bootstrapShared?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode <number-or-slug>");
    expect(flags).toContain("--source <path>");
    expect(flags).toContain("--output-root <path>");
    expect(flags).toContain("--approve");
    expect(flags).toContain("--force");
  });

  it("forwards options to the episode bootstrap implementation", async () => {
    commandEpisodeBootstrapCharactersMock.mockResolvedValueOnce(undefined);
    const program = new Command();
    registerStoryLocalizationCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "bootstrap-shared",
      "--episode",
      "011-the-black-eyed-children",
      "--source",
      "content-ideas/content/dark-truth-episodes-optimized",
      "--output-root",
      "episodes",
      "--approve",
      "--force",
      "--json",
      "--verbose",
    ]);

    expect(commandEpisodeBootstrapCharactersMock).toHaveBeenCalledTimes(1);
    expect(commandEpisodeBootstrapCharactersMock.mock.calls[0]?.[0]).toMatchObject({
      episode: "011-the-black-eyed-children",
      source: "content-ideas/content/dark-truth-episodes-optimized",
      outputRoot: "episodes",
      approve: true,
      force: true,
      json: true,
      verbose: true,
    });
  });

  it("exposes a stories alias for syncing only the shared character map", async () => {
    const program = new Command();
    registerStoryLocalizationCommands(program);
    const stories = program.commands.find((command) => command.name() === "stories");
    expect(stories).toBeDefined();
    const syncCharacters = stories?.commands.find((command) => command.name() === "sync-characters");
    expect(syncCharacters).toBeDefined();
    const flags = syncCharacters?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode <number-or-slug>");
    expect(flags).toContain("--source <path>");
    expect(flags).toContain("--output-root <path>");
    expect(flags).toContain("--force");
    expect(flags).toContain("--json");
    expect(flags).toContain("--verbose");
  });

  it("forwards options to the episode sync implementation", async () => {
    commandEpisodeSyncCharactersMock.mockResolvedValueOnce(undefined);
    const program = new Command();
    registerStoryLocalizationCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "sync-characters",
      "--episode",
      "011-the-black-eyed-children",
      "--source",
      "content-ideas/content/dark-truth-episodes-optimized",
      "--output-root",
      "episodes",
      "--force",
      "--json",
      "--verbose",
    ]);

    expect(commandEpisodeSyncCharactersMock).toHaveBeenCalledTimes(1);
    expect(commandEpisodeSyncCharactersMock.mock.calls[0]?.[0]).toMatchObject({
      episode: "011-the-black-eyed-children",
      source: "content-ideas/content/dark-truth-episodes-optimized",
      outputRoot: "episodes",
      force: true,
      json: true,
      verbose: true,
    });
  });
});
