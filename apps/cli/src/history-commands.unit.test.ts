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

  it("keeps V3.2 planning and approval explicitly opt-in", async () => {
    const services = dependencies();
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "history",
      "visuals",
      "plan",
      "episode-32",
      "--planner-version",
      "v3.2",
    ]);
    expect(services.planHistoryVisuals).toHaveBeenCalledWith({
      episodeId: "episode-32",
      plannerVersion: "v3.2",
    });
    await execute(program, [
      "history",
      "visuals",
      "reject",
      "episode-32",
      "--planner-version",
      "v3.2",
      "--reason",
      "provenance incomplete",
    ]);
    expect(services.decideHistoryVisualApproval).toHaveBeenCalledWith({
      episodeId: "episode-32",
      plannerVersion: "v3.2",
      decision: "REJECTED",
      reason: "provenance incomplete",
    });
  });

  it("keeps V3.2 review bundles explicitly opt-in", async () => {
    const services = dependencies();
    Object.assign(services, { createHistoryReviewBundleV32: vi.fn(async () => ({})) });
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, ["history", "visuals", "review-bundle", "episode-32", "--planner-version", "v3.2", "--output", "review"]);
    expect(services.createHistoryReviewBundleV32).toHaveBeenCalledWith({ episodeId: "episode-32", output: "review" });
  });

  it("exposes explicit resumable V3.3 phases, regeneration, and identified comparison export", async () => {
    const services = dependencies();
    Object.assign(services, {
      createHistoryReviewBundleV33: vi.fn(async () => ({})),
      runHistoryV33Workflow: vi.fn(async (request) => ({ request })),
      createCombinedHistoryApprovalBundleV33: vi.fn(async (request) => ({ request })),
    });
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, [
      "history",
      "v3.3",
      "regenerate",
      "episode-33",
      "--output",
      "review",
      "--reuse-frozen-snapshot",
      "--json",
    ]);
    expect(services.runHistoryV33Workflow).toHaveBeenCalledWith({
      episodeId: "episode-33",
      stage: "export",
      mode: "reuse-frozen-snapshot",
      approvalOutput: "review",
      force: true,
    });
    await execute(program, [
      "history",
      "v3.3",
      "compare",
      "episode-a",
      "episode-b",
      "episode-c",
      "--output",
      "combined",
      "--regenerate",
      "--json",
    ]);
    expect(services.createCombinedHistoryApprovalBundleV33).toHaveBeenCalledWith({
      episodeIds: ["episode-a", "episode-b", "episode-c"],
      output: "combined",
      regenerate: true,
    });
  });

  it("exposes trusted-script authoring commands and promote-to-research-backed gate", async () => {
    const services = dependencies();
    Object.assign(services, {
      getHistoryAuthoringStatus: vi.fn(async (request) => ({ request })),
      runHistoryTrustScriptMigration: vi.fn(async (request) => ({ request })),
      setHistorySourceAuthority: vi.fn(async (request) => ({ request })),
      runHistoryV33Workflow: vi.fn(async (request) => ({ request })),
    });
    const program = new Command();
    registerHistoryCommands(program, services);
    await execute(program, ["history", "authoring", "status", "episode-1", "--json"]);
    expect(services.getHistoryAuthoringStatus).toHaveBeenCalledWith({
      episodeId: "episode-1",
    });
    await execute(program, [
      "history",
      "authoring",
      "trust-script",
      "episode-1",
      "--json",
    ]);
    expect(services.runHistoryTrustScriptMigration).toHaveBeenCalledWith({
      episodeId: "episode-1",
    });
    await execute(program, [
      "history",
      "authoring",
      "set-authority",
      "episode-1",
      "--mode",
      "research-backed",
      "--json",
    ]);
    expect(services.setHistorySourceAuthority).toHaveBeenCalledWith({
      episodeId: "episode-1",
      mode: "research-backed",
    });
    await execute(program, [
      "history",
      "v3.3",
      "extract-claims",
      "episode-1",
      "--live-research",
      "--promote-to-research-backed",
      "--json",
    ]);
    expect(services.runHistoryV33Workflow).toHaveBeenCalledWith({
      episodeId: "episode-1",
      stage: "extract-claims",
      mode: "live-research",
      promoteToResearchBacked: true,
    });
  });
});
