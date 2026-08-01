import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packagedCliFreshnessCheck } from "./doctor-freshness.js";

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

  it("makes stale packaged CLI output actionable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-doctor-"));
    const source = path.join(root, "index.ts");
    const packaged = path.join(root, "dist", "index.js");
    await fs.writeFile(source, "source", "utf8");
    const missing = await packagedCliFreshnessCheck({ sourceEntryPath: source, packagedEntryPath: packaged });
    expect(missing).toMatchObject({ status: "missing", detail: expect.stringContaining("build") });
    await fs.mkdir(path.dirname(packaged));
    await fs.writeFile(packaged, "packaged", "utf8");
    await fs.utimes(source, new Date(), new Date(Date.now() + 2_000));
    const stale = await packagedCliFreshnessCheck({ sourceEntryPath: source, packagedEntryPath: packaged });
    expect(stale.detail).toContain("stale");
  });

  it("handles compiled-layout missing source output without throwing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-doctor-dist-"));
    const result = await packagedCliFreshnessCheck({
      sourceEntryPath: path.join(root, "src", "index.ts"),
      packagedEntryPath: path.join(root, "dist", "index.js"),
    });
    expect(result).toMatchObject({ status: "missing", detail: expect.stringContaining("build") });
  });

  afterAll(() => {
    process.argv = originalArgv;
    process.execArgv = originalExecArgv;
  });
});
