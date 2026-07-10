import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { onMock, spawnMock } = vi.hoisted(() => ({
  onMock: vi.fn(),
  spawnMock: vi.fn(() => ({
    on: onMock,
  })),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("mediaforge bin", () => {
  const originalArgv = process.argv;
  const originalExecArgv = process.execArgv;

  beforeEach(() => {
    vi.resetModules();
    onMock.mockReset();
    spawnMock.mockClear();
    process.argv = [
      "node",
      "/repo/apps/cli/bin/mediaforge.js",
      "stories",
      "render",
      "validate",
      "--help",
    ];
    process.execArgv = [];
  });

  it("spawns the packaged dist entrypoint and forwards CLI args", async () => {
    await import("../bin/mediaforge.js");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        "--disable-warning=ExperimentalWarning",
        expect.stringMatching(/apps\/cli\/dist\/index\.js$/u),
        "stories",
        "render",
        "validate",
        "--help",
      ])
    );
    expect(options).toMatchObject({
      stdio: "inherit",
      env: process.env,
    });
  });

  afterAll(() => {
    process.argv = originalArgv;
    process.execArgv = originalExecArgv;
  });
});
