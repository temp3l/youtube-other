import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerEpisodeCommandsMock = vi.hoisted(() => vi.fn());
const registerShotsCommandsMock = vi.hoisted(() => vi.fn());
const registerStoryLocalizationCommandsMock = vi.hoisted(() => vi.fn());
const registerThumbnailCommandsMock = vi.hoisted(() => vi.fn());
const createExecutionTelemetryMock = vi.hoisted(() =>
  vi.fn(() => ({
    finalize: vi.fn(async () => undefined),
  }))
);
const withExecutionTelemetryMock = vi.hoisted(() =>
  vi.fn(async (_telemetry: unknown, callback: () => Promise<void>) => {
    await callback();
  })
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

vi.mock("./episode-commands.js", () => ({
  registerEpisodeCommands: registerEpisodeCommandsMock,
}));
vi.mock("./shots.js", () => ({
  registerShotsCommands: registerShotsCommandsMock,
}));
vi.mock("./story-localization-commands.js", () => ({
  registerStoryLocalizationCommands: registerStoryLocalizationCommandsMock,
}));
vi.mock("./thumbnail-commands.js", () => ({
  registerThumbnailCommands: registerThumbnailCommandsMock,
}));
vi.mock("@mediaforge/observability", () => ({
  createExecutionTelemetry: createExecutionTelemetryMock,
  createLogger: createLoggerMock,
  currentExecutionTelemetry: vi.fn(() => undefined),
  withExecutionTelemetry: withExecutionTelemetryMock,
}));

describe("CLI application setup", () => {
  const originalArgv = process.argv;
  let parseAsyncSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.resetModules();
    registerEpisodeCommandsMock.mockReset();
    registerShotsCommandsMock.mockReset();
    registerStoryLocalizationCommandsMock.mockReset();
    registerThumbnailCommandsMock.mockReset();
    createExecutionTelemetryMock.mockClear();
    withExecutionTelemetryMock.mockClear();
    process.argv = ["node", "cli"];
    parseAsyncSpy = vi
      .spyOn(Command.prototype, "parseAsync")
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    parseAsyncSpy?.mockRestore();
    process.argv = originalArgv;
  });

  it("registers the active command surfaces when the CLI module boots", async () => {
    await import("./index.js");

    expect(registerEpisodeCommandsMock).toHaveBeenCalledTimes(1);
    expect(registerShotsCommandsMock).toHaveBeenCalledTimes(1);
    expect(registerStoryLocalizationCommandsMock).toHaveBeenCalledTimes(1);
    expect(registerThumbnailCommandsMock).toHaveBeenCalledTimes(1);
    expect(createExecutionTelemetryMock).toHaveBeenCalledTimes(1);
    expect(withExecutionTelemetryMock).toHaveBeenCalledTimes(1);
  });
});
