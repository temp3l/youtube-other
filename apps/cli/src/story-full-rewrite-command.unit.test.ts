import { Command } from "commander";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const localizeStoryEpisodeMock = vi.hoisted(() => vi.fn());
const createStoryLocalizationConfigMock = vi.hoisted(() => vi.fn((config) => config));
const createOpenAiStoryClientWithOptionsMock = vi.hoisted(() => vi.fn());
const materializeCanonicalSourceStoryMock = vi.hoisted(() => vi.fn());
const createLoggerMock = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return vi.fn(() => logger);
});

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: "/tmp/workspace",
    logLevel: "info",
    openAiStoryModel: "gpt-5.5",
    openAiStoryTemperature: 0.5,
    openAiStoryReasoningEffort: "high",
    openAiMetadataModel: "gpt-5.4-mini",
    openAiMetadataReasoningEffort: "low",
    openAiCompatibleModel: "gpt-4.1-mini",
    openAiCompatibleApiKey: "test-key",
    openAiCompatibleBaseUrl: undefined,
  })),
}));

vi.mock("@mediaforge/observability", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/observability")>(
    "@mediaforge/observability"
  );
  return {
    ...actual,
    createLogger: createLoggerMock,
  };
});

vi.mock("@mediaforge/story-localization", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/story-localization")>(
    "@mediaforge/story-localization"
  );
  return {
    ...actual,
    DEFAULT_FULL_REWRITE_MAX_OUTPUT_TOKENS: 25_000,
    DEFAULT_FULL_REWRITE_RETRY_MAX_OUTPUT_TOKENS: 25_000,
    DEFAULT_STORY_REWRITE_MODEL: "gpt-5.5",
    DEFAULT_STORY_REWRITE_REASONING_EFFORT: "high",
    createStoryLocalizationConfig: createStoryLocalizationConfigMock,
    createOpenAiStoryClientWithOptions: createOpenAiStoryClientWithOptionsMock,
    localizeStoryEpisode: localizeStoryEpisodeMock,
    materializeCanonicalSourceStory: materializeCanonicalSourceStoryMock,
  };
});

const { registerStoryRewriteFullCommand } = await import("./story-full-rewrite-command.js");

describe("story full rewrite command", () => {
  beforeEach(() => {
    localizeStoryEpisodeMock.mockReset();
    createStoryLocalizationConfigMock.mockClear();
    createOpenAiStoryClientWithOptionsMock.mockClear();
    materializeCanonicalSourceStoryMock.mockReset();
  });

  it("includes the full rewrite command and slug bootstrap flag", () => {
    const program = new Command();
    const stories = program.command("stories");
    registerStoryRewriteFullCommand(stories);
    const rewriteFull = stories.commands.find((command) => command.name() === "rewrite-full");
    expect(rewriteFull).toBeDefined();
    const flags = rewriteFull?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode-slug <slug>");
    expect(flags).toContain("--input <path>");
    expect(rewriteFull?.description()).toContain("optimized full");
  });

  it("runs rewrite-full in full-only mode and enables debug payload export", async () => {
    const sourcePath = path.resolve(
      import.meta.dirname,
      "../../..",
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack",
      "002-even-killers-can-lick",
      "en",
      "002-even-killers-can-lick-en-full.md"
    );
    localizeStoryEpisodeMock.mockResolvedValueOnce({
      episodeNumber: "002",
      slug: "002-even-killers-can-lick",
      sourceFile: sourcePath,
      copiedEnglishFull: "/tmp/workspace/002-even-killers-can-lick/script.md",
      generatedFiles: ["/tmp/workspace/002-even-killers-can-lick/script.md"],
      skippedFiles: [],
      cacheHit: false,
      repairAttempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: null,
    });

    const program = new Command();
    registerStoryRewriteFullCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-full",
      "--input",
      sourcePath,
      "--episode-slug",
      "the-christmas-doll",
      "--languages",
      "de",
      "--verbose",
    ]);

    expect(createStoryLocalizationConfigMock).toHaveBeenCalledTimes(1);
    expect(createStoryLocalizationConfigMock.mock.calls[0]?.[0]).toMatchObject({
      includeEnglishShort: false,
      includeLocalizedShorts: false,
      debugOutputs: true,
      debugPrefix: "stories-rewrite-full",
      resume: false,
      timeoutMs: 180000,
      maxOutputTokens: 25000,
      retryMaxOutputTokens: 25000,
      languages: ["de"],
      model: "gpt-5.5",
      temperature: 0.5,
      reasoningEffort: "high",
    });
    expect(localizeStoryEpisodeMock).toHaveBeenCalledTimes(1);
  });

  it("inherits overlapping global flags from the parent program", async () => {
    const sourcePath = path.resolve(
      import.meta.dirname,
      "../../..",
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack",
      "002-even-killers-can-lick",
      "en",
      "002-even-killers-can-lick-en-full.md"
    );
    const program = new Command();
    program.option("--json").option("--verbose").option("--dry-run").option("--language <code>");
    registerStoryRewriteFullCommand(program.command("stories"));
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });

    await program.parseAsync([
      "node",
      "cli",
      "--json",
      "--verbose",
      "--dry-run",
      "--language",
      "de",
      "stories",
      "rewrite-full",
      "--input",
      sourcePath,
      "--episode-slug",
      "the-christmas-doll",
    ]);

    stdoutSpy.mockRestore();
    const payload = JSON.parse(writes.join(""));
    expect(payload).toMatchObject({
      dryRun: true,
      plannedOutputs: {
        localized: [
          {
            language: "de",
          },
        ],
      },
    });
  });

  it("reports canonical and compatibility English full paths during dry-run planning", async () => {
    const sourcePath = path.resolve(
      import.meta.dirname,
      "../../..",
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack",
      "002-even-killers-can-lick",
      "en",
      "002-even-killers-can-lick-en-full.md"
    );
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });

    const program = new Command();
    registerStoryRewriteFullCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-full",
      "--input",
      sourcePath,
      "--episode-slug",
      "the-christmas-doll",
      "--languages",
      "de",
      "--dry-run",
    ]);

    stdoutSpy.mockRestore();
    const payload = JSON.parse(writes.join(""));
    expect(payload).toMatchObject({
      dryRun: true,
      plannedOutputs: {
        englishFull: {
          canonical: path.join(
            "/tmp/workspace",
            "002-the-christmas-doll",
            "en",
            "full",
            "script.md"
          ),
          compatibility: path.join(
            "/tmp/workspace",
            "002-the-christmas-doll",
            "script.md"
          ),
        },
      },
    });
    expect(localizeStoryEpisodeMock).not.toHaveBeenCalled();
  });

  it("normalizes regional Spanish locale input to es", async () => {
    const sourcePath = path.resolve(
      import.meta.dirname,
      "../../..",
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack",
      "002-even-killers-can-lick",
      "en",
      "002-even-killers-can-lick-en-full.md"
    );
    localizeStoryEpisodeMock.mockResolvedValueOnce({
      episodeNumber: "002",
      slug: "002-even-killers-can-lick",
      sourceFile: sourcePath,
      copiedEnglishFull: "/tmp/workspace/002-even-killers-can-lick/script.md",
      generatedFiles: ["/tmp/workspace/002-even-killers-can-lick/script.md"],
      skippedFiles: [],
      cacheHit: false,
      repairAttempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: null,
    });

    const program = new Command();
    registerStoryRewriteFullCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-full",
      "--input",
      sourcePath,
      "--episode-slug",
      "the-christmas-doll",
      "--languages",
      "es-419",
    ]);

    expect(createStoryLocalizationConfigMock.mock.calls[0]?.[0]).toMatchObject({
      languages: ["es"],
    });
  });

  it("rejects legacy sp locale input with an actionable error", async () => {
    const sourcePath = path.resolve(
      import.meta.dirname,
      "../../..",
      "content-ideas",
      "content",
      "dark-truth-episodes-multilingual-production-pack",
      "002-even-killers-can-lick",
      "en",
      "002-even-killers-can-lick-en-full.md"
    );
    const program = new Command();
    registerStoryRewriteFullCommand(program.command("stories"));

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "stories",
        "rewrite-full",
        "--input",
        sourcePath,
        "--episode-slug",
        "the-christmas-doll",
        "--languages",
        "sp-SP",
      ])
    ).rejects.toThrow('Use "es" for Spanish.');

    expect(createStoryLocalizationConfigMock).not.toHaveBeenCalled();
  });
});
