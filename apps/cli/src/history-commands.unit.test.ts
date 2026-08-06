import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  registerHistoryCommands,
  type HistoryCommandDependencies,
} from "./history-commands.js";

function dependencies(): HistoryCommandDependencies {
  return {
    listHistoryPresets: vi.fn(() => [{ id: "civilization-rise-fall" }]),
    inspectHistoryContentPack: vi.fn(async (packPath: string) => ({
      packPath,
    })),
    validateHistoryContentPack: vi.fn(async (request) => ({ request })),
    importHistoryContentPack: vi.fn(async (request) => ({ request })),
    planHistoryVisuals: vi.fn(async (request) => ({ request })),
    decideHistoryVisualApproval: vi.fn(async (request) => ({ request })),
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
      program.commands
        .find((command) => command.name() === "content-pack")
        ?.commands.map((command) => command.name())
    ).toEqual(["inspect", "validate", "import"]);
  });

  it("passes strict History validation to the offline service", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "content-pack",
      "validate",
      "pack",
      "--strict",
      "--json",
    ]);
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
    const result = await execute(program, [
      "content-pack",
      "import",
      "pack",
      "--lenient",
      "--dry-run",
      "--json",
    ]);
    expect(result).toMatchObject({
      request: { mode: "lenient", dryRun: true },
    });
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
    await expect(
      program.parseAsync([
        "node",
        "mediaforge",
        "content-pack",
        "import",
        "pack",
        "--genre",
        "horror",
      ])
    ).rejects.toThrow("require --genre history");
    await expect(
      program.parseAsync([
        "node",
        "mediaforge",
        "content-pack",
        "import",
        "pack",
        "--fail-fast",
        "--collect-errors",
      ])
    ).rejects.toThrow("either --fail-fast or --collect-errors");
  });

  it("keeps visual approval commands History-scoped and hash-bound", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "history",
      "visuals",
      "approve",
      "episode-1",
      "--plan-hash",
      "a".repeat(64),
    ]);
    expect(services.decideHistoryVisualApproval).toHaveBeenCalledWith({
      episodeId: "episode-1",
      decision: "APPROVED",
      planHash: "a".repeat(64),
    });
  });

  it("keeps v2 planning and approval explicitly opt-in", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "history",
      "visuals",
      "plan",
      "episode-2",
      "--planner-version",
      "v2",
    ]);
    expect(services.planHistoryVisuals).toHaveBeenCalledWith({
      episodeId: "episode-2",
      plannerVersion: "v2",
    });
    await execute(program, [
      "history",
      "visuals",
      "approve",
      "episode-2",
      "--planner-version",
      "v2",
      "--plan-hash",
      "a".repeat(64),
      "--derivative-hash",
      "b".repeat(64),
    ]);
    expect(services.decideHistoryVisualApproval).toHaveBeenCalledWith({
      episodeId: "episode-2",
      plannerVersion: "v2",
      decision: "APPROVED",
      planHash: "a".repeat(64),
      derivativeHash: "b".repeat(64),
    });
  });

  it("keeps V3.1 planning, approval, and bundle export explicitly opt-in", async () => {
    const services = dependencies();
    Object.assign(services, {
      createHistoryReviewBundleV31: vi.fn(async () => ({})),
    });
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "history",
      "visuals",
      "plan",
      "episode-31",
      "--planner-version",
      "v3.1",
    ]);
    expect(services.planHistoryVisuals).toHaveBeenCalledWith({
      episodeId: "episode-31",
      plannerVersion: "v3.1",
    });
    await execute(program, [
      "history",
      "visuals",
      "review-bundle",
      "episode-31",
      "--planner-version",
      "v3.1",
      "--output",
      "review",
    ]);
    expect(services.createHistoryReviewBundleV31).toHaveBeenCalledWith({
      episodeId: "episode-31",
      output: "review",
    });
  });
});
