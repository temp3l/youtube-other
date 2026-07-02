import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const skippedDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  "docs.bak",
  "output",
  "state",
  "generated-assets",
  "audio",
  "video",
  "images",
  "transcripts",
  "logs",
]);

const sourceExtensions = new Set([
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".sh",
]);

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        files.push(...(await collectSourceFiles(absolutePath)));
      }
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) {
      continue;
    }
    if (/\.(unit|integration|e2e)\.test\.ts$/u.test(entry.name)) {
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

async function readProductionSources(): Promise<
  ReadonlyArray<{ readonly path: string; readonly text: string }>
> {
  const roots = ["apps", "packages", "scripts"].map((sourceRoot) =>
    path.join(repoRoot, sourceRoot)
  );
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  return await Promise.all(
    files.map(async (absolutePath) => ({
      path: path.relative(repoRoot, absolutePath),
      text: await fs.readFile(absolutePath, "utf8"),
    }))
  );
}

describe("OpenAI endpoint routing guard", () => {
  it("keeps media providers away from the Responses API", async () => {
    const mediaProviderPath = /^(packages\/(?:image-generation|speech|transcription)\/src\/|scripts\/openai-generate-scene-image\.sh$)/u;
    const invalidResponsesUsage =
      /responses\.(?:create|parse)|client\.responses|openai\.responses|\/v1\/responses/u;
    const offenders = (await readProductionSources())
      .filter((source) => mediaProviderPath.test(source.path))
      .filter((source) => invalidResponsesUsage.test(source.text))
      .map((source) => source.path);

    expect(offenders).toEqual([]);
  });

  it("keeps media output parsing endpoint-specific", async () => {
    const responseShapePattern = /output\??\.\[0\][\s\S]{0,160}content\??\.\[0\]/u;
    const offenders = (await readProductionSources())
      .filter((source) =>
        /^(packages\/(?:image-generation|speech|transcription)\/src\/)/u.test(
          source.path
        )
      )
      .filter((source) => responseShapePattern.test(source.text))
      .map((source) => source.path);

    expect(offenders).toEqual([]);
  });

  it("retains dedicated endpoint usage in known OpenAI media providers", async () => {
    const sources = new Map(
      (await readProductionSources()).map((source) => [source.path, source.text])
    );

    expect(sources.get("packages/image-generation/src/openai-image.ts")).toContain(
      "client.images.generate"
    );
    expect(
      sources.get("packages/image-generation/src/episode-image-pipeline.ts")
    ).toContain("this.client.images.generate");
    expect(
      sources.get("packages/image-generation/src/thumbnail-image-generator.ts")
    ).toContain("this.client.images.edit");
    expect(sources.get("packages/speech/src/index.ts")).toContain(
      "this.client.audio.speech.create"
    );
    expect(sources.get("packages/speech/src/index.ts")).toContain(
      "/v1/audio/speech"
    );
    expect(sources.get("packages/transcription/src/index.ts")).toContain(
      "audio/transcriptions"
    );
  });
});
