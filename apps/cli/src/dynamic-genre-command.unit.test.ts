import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNeutralDynamicGenreFallback,
  normalizeGenreAnalysisInput,
  type DynamicGenreStructuredOutputProvider,
} from "@mediaforge/dynamic-genre";
import { executeDynamicGenreCommand } from "./dynamic-genre-command.js";

const temporaryDirectories: string[] = [];

async function workspace(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-dynamic-")
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

function validFixture() {
  const input = normalizeGenreAnalysisInput({
    contentType: "completed-story",
    contentId: "episode-fixture",
    revision: "1",
    locale: "en",
    title: "Fixture",
    body: "A calm story about a careful decision.",
  });
  return createNeutralDynamicGenreFallback(input);
}

function provider(value: unknown): DynamicGenreStructuredOutputProvider {
  return {
    analyze: vi.fn(async () => ({
      value,
      providerMetadata: { provider: "fixture", model: "fixture-v1" },
    })),
    repair: vi.fn(async () => ({
      value,
      providerMetadata: { provider: "fixture", model: "fixture-v1" },
    })),
  };
}

describe("dynamic genre CLI application flow", () => {
  it("persists once, reuses an unchanged profile, and recompiles safe overrides", async () => {
    const root = await workspace();
    const inputPath = path.join(root, "story.txt");
    const overridesPath = path.join(root, "overrides.json");
    await fs.writeFile(
      inputPath,
      "A calm story about a careful decision.",
      "utf8"
    );
    await fs.writeFile(
      overridesPath,
      JSON.stringify({ sceneDensity: 0.2 }),
      "utf8"
    );
    const fixture = validFixture();
    const fake = provider({
      creativeBrief: fixture.creativeBrief,
      profile: fixture.profile,
    });
    const createProvider = vi.fn(() => fake);
    const options = {
      input: inputPath,
      contentId: "episode-fixture",
      revision: "1",
      locale: "en",
      budget: "standard" as const,
      outputRoot: root,
      overrides: overridesPath,
    };
    const first = await executeDynamicGenreCommand(options, {
      createProvider,
      now: () => "2026-08-01T10:00:00.000Z",
    });
    const second = await executeDynamicGenreCommand(options, {
      createProvider,
      now: () => "2026-08-01T11:00:00.000Z",
    });
    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(second.resolved.provenance.analysisTimestamp).toBe(
      "2026-08-01T10:00:00.000Z"
    );
    expect(second.resolved.productionConfig.visual.maxScenes).toBeLessThan(24);
    expect(second.resolved.productionConfig.audio.voiceSelection).toBe(
      "system-non-personal-default"
    );
  });

  it("preserves a valid profile when a forced refresh falls back", async () => {
    const root = await workspace();
    const inputPath = path.join(root, "story.txt");
    await fs.writeFile(
      inputPath,
      "A calm story about a careful decision.",
      "utf8"
    );
    const fixture = validFixture();
    await executeDynamicGenreCommand(
      { input: inputPath, contentId: "episode-fixture", outputRoot: root },
      {
        createProvider: () =>
          provider({
            creativeBrief: fixture.creativeBrief,
            profile: fixture.profile,
          }),
      }
    );
    const refreshed = await executeDynamicGenreCommand(
      {
        input: inputPath,
        contentId: "episode-fixture",
        outputRoot: root,
        force: true,
      },
      { createProvider: () => provider({ provider: "inject-me" }) }
    );
    expect(refreshed.cacheStatus).toBe("refresh-preserved");
    expect(
      refreshed.resolved.warnings.map((warning) => warning.code)
    ).toContain("failed-refresh-preserved");
  });

  it("supports a non-persisting profile preview", async () => {
    const root = await workspace();
    const inputPath = path.join(root, "story.txt");
    await fs.writeFile(
      inputPath,
      "A calm story about a careful decision.",
      "utf8"
    );
    const fixture = validFixture();
    const result = await executeDynamicGenreCommand(
      {
        input: inputPath,
        contentId: "episode-fixture",
        outputRoot: root,
        persist: false,
      },
      {
        createProvider: () =>
          provider({
            creativeBrief: fixture.creativeBrief,
            profile: fixture.profile,
          }),
      }
    );
    expect(result.persisted).toBe(false);
    await expect(
      fs.access(
        path.join(result.artifactDirectory, "dynamic-genre-bundle.v1.json")
      )
    ).rejects.toThrow();
  });

  it("deduplicates concurrent analysis and preserves valid state on provider outage", async () => {
    const root = await workspace();
    const inputPath = path.join(root, "story.txt");
    await fs.writeFile(
      inputPath,
      "A calm story about a careful decision.",
      "utf8"
    );
    const fixture = validFixture();
    const fake = provider({
      creativeBrief: fixture.creativeBrief,
      profile: fixture.profile,
    });
    const createProvider = vi.fn(() => fake);
    const options = {
      input: inputPath,
      contentId: "episode-fixture",
      outputRoot: root,
    };
    const [first, second] = await Promise.all([
      executeDynamicGenreCommand(options, { createProvider }),
      executeDynamicGenreCommand(options, { createProvider }),
    ]);
    expect([first.cacheStatus, second.cacheStatus].sort()).toEqual([
      "hit",
      "miss",
    ]);
    expect(createProvider).toHaveBeenCalledTimes(1);

    const preserved = await executeDynamicGenreCommand(
      { ...options, force: true },
      {
        createProvider: () => ({
          analyze: async () => {
            throw new Error("provider offline");
          },
          repair: async () => {
            throw new Error("provider offline");
          },
        }),
      }
    );
    expect(preserved.cacheStatus).toBe("refresh-preserved");
    expect(
      preserved.resolved.warnings.map((warning) => warning.code)
    ).toContain("failed-refresh-preserved");
  });
});
