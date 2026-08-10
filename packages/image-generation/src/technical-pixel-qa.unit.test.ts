import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectTechnicalImagePixels,
  resolveTechnicalPixelQaPolicy,
} from "./technical-pixel-qa.js";

const temporaryDirectories: string[] = [];

async function temporaryImage(name: string, input: sharp.Sharp): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-qa-"));
  temporaryDirectories.push(directory);
  const target = path.join(directory, name);
  await input.png().toFile(target);
  return target;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("shared technical pixel QA", () => {
  it("accepts a valid raster and detects aspect-ratio errors", async () => {
    const image = await temporaryImage(
      "valid.png",
      sharp({ create: { width: 900, height: 1600, channels: 3, background: { r: 20, g: 30, b: 40 } } }).composite([
        { input: Buffer.from("<svg><rect width='450' height='800' fill='#ef4444'/></svg>") },
      ]),
    );
    await expect(
      inspectTechnicalImagePixels({
        imagePath: image,
        expectedAspectRatio: "9:16",
        policy: resolveTechnicalPixelQaPolicy("history"),
      }),
    ).resolves.toMatchObject({ passed: true, findings: [] });
    await expect(
      inspectTechnicalImagePixels({
        imagePath: image,
        expectedAspectRatio: "16:9",
        policy: resolveTechnicalPixelQaPolicy("dark-truth"),
      }),
    ).resolves.toMatchObject({ passed: false, findings: [{ code: "IMAGE_DIMENSIONS_UNEXPECTED" }] });
  });

  it("fails corrupt and near-empty images under adopted genre policies", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-qa-"));
    temporaryDirectories.push(directory);
    const corrupt = path.join(directory, "corrupt.png");
    await fs.writeFile(corrupt, "not an image");
    await expect(
      inspectTechnicalImagePixels({ imagePath: corrupt, policy: resolveTechnicalPixelQaPolicy("history") }),
    ).resolves.toMatchObject({ passed: false, findings: [{ code: "IMAGE_UNREADABLE" }] });

    const uniform = await temporaryImage(
      "uniform.png",
      sharp({ create: { width: 900, height: 1600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }),
    );
    await expect(
      inspectTechnicalImagePixels({ imagePath: uniform, policy: resolveTechnicalPixelQaPolicy("dark-truth") }),
    ).resolves.toMatchObject({
      passed: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: "IMAGE_EMPTY_OR_UNIFORM" })]),
    });
  });
});
