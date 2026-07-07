import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("CLI env setup", () => {
  const previousCwd = process.cwd();
  const previousOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    if (previousOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("overrides an inherited OPENAI_API_KEY with the .env value", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-cli-env-"));
    await fs.writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=dotenv-key\n");
    process.env.OPENAI_API_KEY = "shell-key";
    process.chdir(dir);

    await import("./env-setup.js");

    expect(process.env.OPENAI_API_KEY).toBe("dotenv-key");
  });
});
