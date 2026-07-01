import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShortRewriteRunSummary } from "@mediaforge/story-localization";

const rewriteShortStoriesMock = vi.hoisted(() => vi.fn());
const createOpenAiStoryClientWithOptionsMock = vi.hoisted(() =>
  vi.fn(() => ({
    responses: {
      create: vi.fn(async () => ({
        id: "preflight-response",
        output_text: "{\"ok\":true}",
        output_parsed: { ok: true },
      })),
    },
  }))
);
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
    workspaceDir: "/tmp",
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
    DEFAULT_SHORT_REWRITE_MAX_OUTPUT_TOKENS: 16_000,
    DEFAULT_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS: 25_000,
    DEFAULT_STORY_REWRITE_MODEL: "gpt-5.5",
    DEFAULT_STORY_REWRITE_REASONING_EFFORT: "high",
    SUPPORTED_STORY_LANGUAGES: actual.SUPPORTED_STORY_LANGUAGES,
    rewriteShortStories: rewriteShortStoriesMock,
    createOpenAiStoryClientWithOptions: createOpenAiStoryClientWithOptionsMock,
  };
});

const { registerStoryRewriteShortCommand } = await import("./story-short-rewrite-command.js");

function makeSummary(overrides: Partial<ShortRewriteRunSummary> = {}): ShortRewriteRunSummary {
  return {
    command: "stories rewrite-short",
    runId: "run-1",
    episodeId: "009",
    episodeSlug: "009-the-christmas-doll",
    sourcePath: "/tmp/009-the-christmas-doll/source/script.md",
    sourceSha256: "0".repeat(64),
    promptVersion: "short-rewrite-v1",
    model: "gpt-5-mini",
    languagesRequested: ["de"],
    completed: 1,
    skipped: 0,
    failed: 0,
    inputTokens: 120,
    outputTokens: 80,
    cachedInputTokens: 0,
    reasoningTokens: 5,
    totalTokens: 200,
    estimatedCostUsd: 0.0123,
    generationDurationMs: 1234,
    artifacts: [],
    failures: [],
    dryRun: false,
    ...overrides,
  };
}

describe("story short rewrite command", () => {
  beforeEach(() => {
    rewriteShortStoriesMock.mockReset();
    createOpenAiStoryClientWithOptionsMock.mockClear();
  });

  it("includes the new command and flags in help output", () => {
    const program = new Command();
    const stories = program.command("stories");
    registerStoryRewriteShortCommand(stories);
    const rewriteShort = stories.commands.find((command) => command.name() === "rewrite-short");
    expect(rewriteShort).toBeDefined();
    const flags = rewriteShort?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--languages <comma-separated-codes>");
    expect(flags).toContain("--dry-run");
    expect(flags).toContain("--compatibility-source");
    expect(flags).toContain("--episode-slug <slug>");
    expect(flags).toContain("--max-output-tokens <number>");
    expect(flags).toContain("--retry-max-output-tokens <number>");
    expect(rewriteShort?.description()).toContain("Rewrite an English full-length horror story");
  });

  it("fails fast on OpenAI connectivity problems before rewriting", async () => {
    const failingClient = {
      responses: {
        create: vi.fn(async () => {
          throw {
            name: "Error",
            code: "ECONNREFUSED",
            message: "connect ECONNREFUSED 127.0.0.1:443",
          };
        }),
      },
    };
    createOpenAiStoryClientWithOptionsMock.mockReturnValueOnce(
      failingClient as typeof failingClient
    );
    const program = new Command();
    registerStoryRewriteShortCommand(program.command("stories"));

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "stories",
        "rewrite-short",
        "--input",
        "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
        "--episode-slug",
        "the-christmas-doll",
      ])
    ).rejects.toThrow("Unable to reach OpenAI before short rewrite started");

    expect(rewriteShortStoriesMock).not.toHaveBeenCalled();
    expect(failingClient.responses.create).toHaveBeenCalledTimes(1);
  });

  it("forwards normalized languages to the rewrite service", async () => {
    rewriteShortStoriesMock.mockResolvedValueOnce(makeSummary({ languagesRequested: ["de", "es"] }));
    const program = new Command();
    registerStoryRewriteShortCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-short",
      "--input",
      "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
      "--episode-slug",
      "the-christmas-doll",
        "--languages",
        "de,es,de",
        "--dry-run",
        "--compatibility-source",
        "--json",
      ]);

    expect(rewriteShortStoriesMock).toHaveBeenCalledTimes(1);
    expect(rewriteShortStoriesMock.mock.calls[0]?.[0]).toMatchObject({
      inputPath: "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
      episodeSlug: "the-christmas-doll",
      languages: ["de", "es"],
      model: "gpt-5.5",
      temperature: 0.5,
      reasoningEffort: "high",
      maxOutputTokens: 16000,
      retryMaxOutputTokens: 25000,
      dryRun: true,
      allowSourceInput: true,
      overwrite: false,
      resume: false,
    });
  });

  it("omits temperature from the OpenAI connectivity preflight request", async () => {
    rewriteShortStoriesMock.mockResolvedValueOnce(makeSummary());
    const preflightClient = {
      responses: {
        create: vi.fn(async () => ({
          id: "preflight-response",
          output_text: "{\"ok\":true}",
          output_parsed: { ok: true },
        })),
      },
    };
    createOpenAiStoryClientWithOptionsMock.mockReturnValueOnce(
      preflightClient as typeof preflightClient
    );
    const program = new Command();
    registerStoryRewriteShortCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-short",
      "--input",
      "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
      "--episode-slug",
      "the-christmas-doll",
    ]);

    const preflightRequest = preflightClient.responses.create.mock.calls[0]?.[0];
    expect(preflightRequest).toMatchObject({
      model: "gpt-5.5",
      max_output_tokens: 16,
    });
    expect(preflightRequest).not.toHaveProperty("temperature");
  });

  it("inherits overlapping global flags from the parent program", async () => {
    rewriteShortStoriesMock.mockResolvedValueOnce(makeSummary({ languagesRequested: ["de"] }));
    const program = new Command();
    program.option("--json").option("--verbose").option("--dry-run").option("--language <code>");
    registerStoryRewriteShortCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "--json",
      "--verbose",
      "--dry-run",
      "--language",
      "de",
      "stories",
      "rewrite-short",
      "--input",
      "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
      "--episode-slug",
      "the-christmas-doll",
    ]);

    expect(rewriteShortStoriesMock).toHaveBeenCalledTimes(1);
    expect(rewriteShortStoriesMock.mock.calls[0]?.[0]).toMatchObject({
      episodeSlug: "the-christmas-doll",
      languages: ["de"],
      dryRun: true,
      json: true,
      verbose: true,
    });
  });

  it("rejects mutually exclusive input selectors", async () => {
    const program = new Command();
    registerStoryRewriteShortCommand(program.command("stories"));
    await expect(
      program.parseAsync([
        "node",
        "cli",
        "stories",
        "rewrite-short",
        "--episode",
        "009",
        "--input",
        "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
        "--dry-run",
      ])
    ).rejects.toThrow("--episode and --input are mutually exclusive");
  });

  it("prints per-language failures in the human summary", async () => {
    rewriteShortStoriesMock.mockResolvedValueOnce(
      makeSummary({
        completed: 0,
        failed: 1,
        failures: [
          {
            language: "en",
            message: "Short source extraction retained only 2 beats.",
          },
        ],
      })
    );
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const program = new Command();
    registerStoryRewriteShortCommand(program.command("stories"));

    await program.parseAsync([
      "node",
      "cli",
      "stories",
      "rewrite-short",
      "--input",
      "/tmp/009-the-christmas-doll/source/009-the-christmas-doll-en-full.md",
      "--episode-slug",
      "the-christmas-doll",
      "--dry-run",
    ]);

    const output = writeSpy.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain("Failures:");
    expect(output).toContain("- en: Short source extraction retained only 2 beats.");
    writeSpy.mockRestore();
  });
});
