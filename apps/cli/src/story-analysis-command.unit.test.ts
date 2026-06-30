import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeStoryProductionMock = vi.hoisted(() => vi.fn());
const resolveStoryProductionAnalysisSourceMock = vi.hoisted(() => vi.fn());
const resolveStoryProductionAnalysisStatusMock = vi.hoisted(() => vi.fn());
const createOpenAiStoryClientWithOptionsMock = vi.hoisted(() => vi.fn(() => ({
  responses: {},
})));

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: "/tmp/workspace",
    logLevel: "info",
    openAiValidatorModel: "gpt-5.4-mini",
    openAiValidatorReasoningEffort: "medium",
    openAiValidatorMaxOutputTokens: 6000,
    openAiStoryModel: "gpt-5.5",
    openAiCompatibleApiKey: "test-key",
  })),
}));

vi.mock("@mediaforge/story-localization", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/story-localization")>(
    "@mediaforge/story-localization"
  );
  return {
    ...actual,
    analyzeStoryProduction: analyzeStoryProductionMock,
    resolveStoryProductionAnalysisSource: resolveStoryProductionAnalysisSourceMock,
    resolveStoryProductionAnalysisStatus: resolveStoryProductionAnalysisStatusMock,
    createOpenAiStoryClientWithOptions: createOpenAiStoryClientWithOptionsMock,
  };
});

const { registerStoryAnalysisCommand } = await import("./story-analysis-command.js");

describe("story analysis command", () => {
  beforeEach(() => {
    analyzeStoryProductionMock.mockReset();
    resolveStoryProductionAnalysisSourceMock.mockReset();
    resolveStoryProductionAnalysisStatusMock.mockReset();
    createOpenAiStoryClientWithOptionsMock.mockClear();
    process.exitCode = undefined;
  });

  it("registers analyze, inspect, and status under stories", () => {
    const program = new Command();
    const stories = program.command("stories");
    registerStoryAnalysisCommand(stories);
    expect(stories.commands.map((command) => command.name()).sort()).toEqual([
      "analyze",
      "inspect",
      "status",
    ]);
  });

  it("prints JSON for stories analyze and sets exit code on gate failure", async () => {
    analyzeStoryProductionMock.mockResolvedValueOnce({
      artifact: {
        episode: "014",
        episodeSlug: "014-demo",
        language: "en",
        locale: "en-US",
        format: "full",
        pass: false,
        verdict: "REVISION_REQUIRED",
      },
      report: "ignored",
      exitCode: 1,
      cacheStatus: "miss",
    });
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });
    const program = new Command();
    registerStoryAnalysisCommand(program.command("stories"));
    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "analyze",
      "--episode",
      "014-demo",
      "--json",
    ]);
    stdoutSpy.mockRestore();
    expect(JSON.parse(writes.join(""))).toMatchObject({
      episode: "014",
      episodeSlug: "014-demo",
      pass: false,
      verdict: "REVISION_REQUIRED",
    });
    expect(process.exitCode).toBe(1);
  });
});
