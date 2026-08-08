import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDeterministicVisualDirectionFallbackV1,
  buildHistoryVisualPlanV35,
  normalizeHistoryNarrationV33,
  readVisualDirectionProviderResolutionCallCount,
  resetVisualDirectionResolverStateForTests,
  structureTrustedScriptClaimsV34,
} from "@mediaforge/history";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrResolveHistoricalVisualDirectionForEpisode } from "./history-visual-direction-bridge-v1.js";
import * as openaiResolver from "./history-visual-direction-openai-v1.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  resetVisualDirectionResolverStateForTests();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

function buildFixturePlan() {
  const episodeId =
    "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";
  const narration = normalizeHistoryNarrationV33({
    episodeId,
    rawScript: `On June 24, 1812, soldiers began crossing the Niemen River into Russia.

Napoleon commanded the largest army Europe had seen.`,
  });
  const structured = structureTrustedScriptClaimsV34({
    episodeId,
    narration,
    authorityMode: "trusted-script",
  });
  return buildHistoryVisualPlanV35({
    episodeId,
    title: "Napoleon's invasion of Russia",
    narration,
    authorityMode: "trusted-script",
    structuredClaims: structured,
  });
}

async function episodeDirWithPlan(): Promise<{
  readonly episodeDir: string;
  readonly episodeId: string;
}> {
  const plan = buildFixturePlan();
  const episodeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "history-visual-direction-bridge-")
  );
  roots.push(episodeDir);
  const historyDir = path.join(episodeDir, "source", "history-v3.5");
  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(path.join(historyDir, "plan.json"), JSON.stringify(plan));
  return { episodeDir, episodeId: plan.episodeId };
}

describe("history visual direction bridge v1", () => {
  it("resolves once through the bridge and reuses the persisted artifact", async () => {
    const openAiSpy = vi
      .spyOn(openaiResolver, "resolveHistoricalVisualDirectionWithOpenAiV1")
      .mockImplementation(async ({ resolverInput }) =>
        buildDeterministicVisualDirectionFallbackV1(resolverInput)
      );
    const { episodeDir, episodeId } = await episodeDirWithPlan();

    await getOrResolveHistoricalVisualDirectionForEpisode({
      episodeDir,
      episodeId,
    });
    expect(openAiSpy).toHaveBeenCalledTimes(1);
    expect(readVisualDirectionProviderResolutionCallCount()).toBe(1);

    await getOrResolveHistoricalVisualDirectionForEpisode({
      episodeDir,
      episodeId,
    });
    expect(openAiSpy).toHaveBeenCalledTimes(1);
    expect(readVisualDirectionProviderResolutionCallCount()).toBe(1);
  });
});
