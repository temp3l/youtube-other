import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  registerHistoryCommands,
  type HistoryCommandDependencies,
} from "./history-commands.js";

function dependencies(): HistoryCommandDependencies {
  return {
    listHistoryPresets: vi.fn(() => [{ id: "civilization-rise-fall" }]),
    inspectHistoryContentPack: vi.fn(async (packPath: string) => ({ packPath })),
    validateHistoryContentPack: vi.fn(async (request) => ({ request })),
    importHistoryContentPack: vi.fn(async (request) => ({ request })),
  };
}

async function execute(
  program: Command,
  args: readonly string[]
): Promise<unknown> {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    await program.parseAsync(["node", "mediaforge", ...args]);
    return JSON.parse(writes.join(""));
  } finally {
    spy.mockRestore();
  }
}

describe("history commands", () => {
  it("registers additive History and content-pack command groups", () => {
    const program = new Command();
    registerHistoryCommands(program, dependencies());
    expect(program.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["history", "content-pack"])
    );
    expect(
      program.commands.find((command) => command.name() === "content-pack")?.commands.map((command) => command.name())
    ).toEqual(["inspect", "validate", "import"]);
  });

  it("passes strict History validation to the offline service", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, ["content-pack", "validate", "pack", "--strict", "--json"]);
    expect(services.validateHistoryContentPack).toHaveBeenCalledWith({
      packPath: "pack",
      genre: "history",
      mode: "strict",
    });
  });

  it("uses lenient dry-run imports with collect-errors by default", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    const result = await execute(program, ["content-pack", "import", "pack", "--lenient", "--dry-run", "--json"]);
    expect(result).toMatchObject({ request: { mode: "lenient", dryRun: true } });
    expect(services.importHistoryContentPack).toHaveBeenCalledWith({
      packPath: "pack",
      genre: "history",
      mode: "lenient",
      dryRun: true,
      failureMode: "collect-errors",
    });
  });

  it("honors dry-run inherited from the canonical root command", async () => {
    const services = dependencies();
    const program = new Command().option("--dry-run");
    registerHistoryCommands(program, services);
    await execute(program, ["--dry-run", "content-pack", "import", "pack"]);
    expect(services.importHistoryContentPack).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    );
  });

  it("rejects incompatible genre and conflicting import flags", async () => {
    const program = new Command().exitOverride();
    registerHistoryCommands(program, dependencies());
    await expect(program.parseAsync(["node", "mediaforge", "content-pack", "import", "pack", "--genre", "horror"])).rejects.toThrow("require --genre history");
    await expect(program.parseAsync(["node", "mediaforge", "content-pack", "import", "pack", "--fail-fast", "--collect-errors"])).rejects.toThrow("either --fail-fast or --collect-errors");
  });
});
