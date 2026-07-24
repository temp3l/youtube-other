import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { resolveRemotionEntryPoint } from "./remotion-runner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { force: true, recursive: true })
    )
  );
});

describe("resolveRemotionEntryPoint", () => {
  it("prefers the compiled JavaScript entry in packaged output", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-remotion-entry-")
    );
    temporaryDirectories.push(directory);
    const javascriptEntry = path.join(directory, "remotion-entry.js");
    await Promise.all([
      fs.writeFile(javascriptEntry, "export {};\n"),
      fs.writeFile(path.join(directory, "remotion-entry.tsx"), "export {};\n"),
    ]);

    await expect(
      resolveRemotionEntryPoint(
        pathToFileURL(path.join(directory, "remotion-runner.js")).href
      )
    ).resolves.toBe(javascriptEntry);
  });
});
