import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { buildHistoryVisualPlanV35 } from "./visual-planner-v35.js";
import {
  buildDeterministicVisualDirectionFallbackV1,
  buildVisualDirectionResolverInputV1,
  loadPersistedHistoricalVisualDirectionV1,
  resolveHistoryVisualDirectionArtifactPathV1,
} from "./history-visual-direction-v1.js";
import {
  getOrResolvePersistedHistoricalVisualDirectionV1,
  readVisualDirectionProviderResolutionCallCount,
  resetVisualDirectionResolverStateForTests,
} from "./history-visual-direction-resolver-v1.js";

const roots: string[] = [];
afterEach(async () => {
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

async function episodeDirWithPlan(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-visual-direction-"));
  roots.push(root);
  const plan = buildFixturePlan();
  const historyDir = path.join(root, "source", "history-v3.5");
  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(path.join(historyDir, "plan.json"), JSON.stringify(plan));
  return root;
}

describe("history visual direction resolver v1", () => {
  it("resolves once, persists, and reuses without additional provider calls", async () => {
    const episodeDir = await episodeDirWithPlan();
    const plan = buildFixturePlan();
    const provider = async () => buildDeterministicVisualDirectionFallbackV1(
      buildVisualDirectionResolverInputV1({ plan })
    );
    const first = await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      resolveWithProvider: provider,
    });
    expect(readVisualDirectionProviderResolutionCallCount()).toBe(1);
    const persisted = await loadPersistedHistoricalVisualDirectionV1(episodeDir);
    expect(persisted?.provenance.semanticInputFingerprint).toBe(
      first.provenance.semanticInputFingerprint
    );
    await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      resolveWithProvider: provider,
    });
    expect(readVisualDirectionProviderResolutionCallCount()).toBe(1);
  });

  it("reuses persisted profile across image-plan style reruns", async () => {
    const episodeDir = await episodeDirWithPlan();
    const plan = buildFixturePlan();
    let calls = 0;
    const provider = async () => {
      calls += 1;
      return buildDeterministicVisualDirectionFallbackV1(
        buildVisualDirectionResolverInputV1({ plan })
      );
    };
    await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      resolveWithProvider: provider,
    });
    await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      resolveWithProvider: provider,
    });
    expect(calls).toBe(1);
  });

  it("refreshes only when explicitly requested", async () => {
    const episodeDir = await episodeDirWithPlan();
    const plan = buildFixturePlan();
    let calls = 0;
    const provider = async () => {
      calls += 1;
      return buildDeterministicVisualDirectionFallbackV1(
        buildVisualDirectionResolverInputV1({ plan })
      );
    };
    await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      resolveWithProvider: provider,
    });
    await getOrResolvePersistedHistoricalVisualDirectionV1({
      episodeDir,
      plan,
      refresh: true,
      resolveWithProvider: provider,
    });
    expect(calls).toBe(2);
  });

  it("deduplicates concurrent first-time resolution to one provider call", async () => {
    const episodeDir = await episodeDirWithPlan();
    const plan = buildFixturePlan();
    let calls = 0;
    const provider = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return buildDeterministicVisualDirectionFallbackV1(
        buildVisualDirectionResolverInputV1({ plan })
      );
    };
    await Promise.all(
      Array.from({ length: 20 }, () =>
        getOrResolvePersistedHistoricalVisualDirectionV1({
          episodeDir,
          plan,
          resolveWithProvider: provider,
        })
      )
    );
    expect(calls).toBe(1);
    const artifactPath = resolveHistoryVisualDirectionArtifactPathV1(episodeDir);
    await expect(fs.access(artifactPath)).resolves.toBeUndefined();
  });

  it("uses deterministic fallback for ancient history without photographic semantics", async () => {
    const episodeId = "history-youtube-history-ancient-rome-fall";
    const narration = normalizeHistoryNarrationV33({
      episodeId,
      rawScript:
        "In AD 410, Rome faced crisis as the Western Roman Empire weakened.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId,
      narration,
      authorityMode: "trusted-script",
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId,
      title: "Fall of Rome",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    const fallback = buildDeterministicVisualDirectionFallbackV1(
      buildVisualDirectionResolverInputV1({ plan })
    );
    expect(fallback.global.aestheticDirection.representation).toBe(
      "documentary-reconstruction"
    );
    expect(fallback.global.cameraDirection.cameraEraInterpretation).toContain(
      "virtual lens terminology only"
    );
  });
});
