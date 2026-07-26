import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSemanticRasterBatches,
  resolveRemotionEntryPoint,
} from "./remotion-runner.js";

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

describe("createSemanticRasterBatches", () => {
  it("bounds worker lifetime without crossing scene boundaries", () => {
    const jobs = [
      ...Array.from({ length: 10 }, (_, index) => ({
        sceneId: "scene-a",
        index,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        sceneId: "scene-b",
        index,
      })),
    ];

    expect(createSemanticRasterBatches(jobs, 8)).toEqual([
      jobs.slice(0, 8),
      jobs.slice(8, 10),
      jobs.slice(10, 13),
    ]);
  });

  it("rejects an invalid batch size", () => {
    expect(() => createSemanticRasterBatches([], 0)).toThrow(
      "Semantic raster batch size must be a positive integer."
    );
  });
});
