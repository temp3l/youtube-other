import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { providerPromptInternalLanguageReasons } from "./veronica-semantic-quality.js";
import { buildVeronicaUnifiedV3SemanticPlan, validateVeronicaUnifiedV3Portfolio } from "./veronica-unified-v3-semantic-plan.js";
import {
  veronicaAuthoredSceneBundleSchema,
  veronicaThumbnailDirectionSchema,
  veronicaVisualDirectionPackSchema,
} from "./veronica-unified-v3-visual-direction.js";

const repositoryRoot = path.resolve(".");
const packRoot = path.join(repositoryRoot, "content-packs", "veronica-unified-content-pack-v3");
const outputRoot = path.join(os.tmpdir(), `veronica-v3-direction-tranche-${process.pid}`);

const selected = [
  { id: "pos-l01-s01", title: "Being Good Isn't Enough", format: "short", wpm: 155, source: "content/shorts/en/pos-l01-s01-being-good-isnt-enough.md" },
  { id: "pos-l01-s02", title: "Expertise Vs Perception", format: "short", wpm: 155, source: "content/shorts/en/pos-l01-s02-expertise-vs-perception.md" },
  { id: "osc-l05", title: "Stop Improving The Marketing Fix The Product", format: "long", wpm: 150, source: "content/long/en/osc-05-stop-improving-the-marketing-fix-the-product.md" },
] as const;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function authoredDirection(storyId: string) {
  const [visualRaw, positioningRaw, oscRaw, thumbnailsRaw] = await Promise.all([
    fs.readFile(path.join(packRoot, "visual-direction.v1.json"), "utf8"),
    fs.readFile(path.join(packRoot, "scene-directions", "positioning.json"), "utf8"),
    fs.readFile(path.join(packRoot, "scene-directions", "osc.json"), "utf8"),
    fs.readFile(path.join(packRoot, "scene-directions", "thumbnails.json"), "utf8"),
  ]);
  const visual = veronicaVisualDirectionPackSchema.parse(JSON.parse(visualRaw) as unknown);
  const bundles = [
    ...((JSON.parse(positioningRaw) as { bundles: unknown[] }).bundles),
    ...(JSON.parse(oscRaw) as unknown[]),
  ].map((entry) => veronicaAuthoredSceneBundleSchema.parse(entry));
  const thumbnailEntries = veronicaThumbnailDirectionSchema.array().parse(
    (JSON.parse(thumbnailsRaw) as { storyId: string }[]).map(({ storyId: _storyId, ...thumbnail }) => thumbnail),
  );
  const thumbnailRaw = JSON.parse(thumbnailsRaw) as Array<{ storyId: string } & Record<string, unknown>>;
  const direction = visual.stories.find((entry) => entry.storyId === storyId);
  const scenes = bundles.find((entry) => entry.storyId === storyId)?.scenes;
  const thumbnailEntry = thumbnailRaw.find((entry) => entry.storyId === storyId);
  const thumbnail = thumbnailEntry
    ? veronicaThumbnailDirectionSchema.parse((({ storyId: _storyId, ...value }) => value)(thumbnailEntry))
    : undefined;
  expect(thumbnailEntries).toHaveLength(54);
  expect(direction).toBeDefined();
  expect(scenes).toBeDefined();
  expect(thumbnail).toBeDefined();
  return { ...direction!, authoredScenes: scenes!, thumbnail: thumbnail! };
}

describe("Veronica direct scene-direction tranche", () => {
  it("accepts and compiles the next three canonical story bundles without synthetic prompt language", async () => {
    const plans = await Promise.all(selected.map(async (story) => {
      const narration = await fs.readFile(path.join(packRoot, story.source), "utf8");
      const direction = await authoredDirection(story.id);
      const sourceHash = hash(narration);
      const plan = await buildVeronicaUnifiedV3SemanticPlan({
        outputDir: path.join(outputRoot, story.id),
        plannerInput: {
          schemaVersion: "veronica-canonical-source-planner-input.v1",
          locale: "en",
          narration: { locale: "en", sourcePath: story.source, sourceSha256: sourceHash, narration },
          sourceEpisode: {
            schemaVersion: "veronica-canonical-source-episode.v1",
            ingestionAdapterVersion: "veronica-unified-v3-scene-direction-tranche.v1",
            sourcePackId: "veronica-unified-content-pack-v3",
            episodeId: story.id,
            authoredEpisodeKey: story.id,
            canonicalSlug: story.id,
            title: story.title,
            contentProfileId: "veronicabenini",
            format: story.format,
            canonicalLocale: "en",
            contentHash: sourceHash,
            seriesEpisodeId: story.id === "osc-l05" ? "veronica-episode-03" : "veronica-episode-02",
            seriesEpisodeOrder: story.id === "osc-l05" ? 3 : 2,
            seriesSlot: story.id === "pos-l01-s01" ? "short-a" : story.id === "pos-l01-s02" ? "short-b" : "long",
            relatedStoryIds: ["osc-l01", "osc-s01a"],
            readiness: "CANONICAL_READY",
            localeSources: [{ locale: "en", sourcePath: story.source, sourceSha256: sourceHash, narration }],
            sourceRevisionHash: hash(`${story.id}:${sourceHash}`),
            visualDirectionHash: hash(JSON.stringify(direction)),
            visualDirection: direction,
            declaredReusableAssets: [],
          },
          planningConfiguration: {
            schemaVersion: "veronica-canonical-visual-planning-configuration.v1",
            targetWordsPerMinute: story.wpm,
            imageProviderModel: "provider-unbound:text-free-canonical-v1",
            rendererVersion: "ffmpeg-event-compiler.v1",
          },
          declaredReusableAssets: [],
          visualPlanOverride: null,
        },
      });
      expect(plan.scenes).toHaveLength(direction.authoredScenes.length);
      expect(plan.assets).toHaveLength(direction.authoredScenes.length);
      expect(plan.validation).toMatchObject({ status: "pass", findings: [] });
      for (const asset of plan.assets) {
        expect(providerPromptInternalLanguageReasons(asset.prompt)).toEqual([]);
        expect(asset.prompt).not.toMatch(/evidence arrangement|working material|narration span|visualize the narrated change|make this narration span visually legible/iu);
      }
      return plan;
    }));
    if (process.env.MEDIAFORGE_VERONICA_PROMPT_AUDIT_PATH) {
      await fs.writeFile(
        process.env.MEDIAFORGE_VERONICA_PROMPT_AUDIT_PATH,
        JSON.stringify(plans.flatMap((plan) => plan.assets.map((asset) => ({ storyId: plan.contentId, sceneId: asset.sceneId, prompt: asset.prompt }))), null, 2),
      );
    }
    const portfolio = validateVeronicaUnifiedV3Portfolio(plans);
    expect(portfolio.findings.filter((finding) => finding.severity === "blocker")).toEqual([]);
  });
});

afterAll(async () => {
  await fs.rm(outputRoot, { recursive: true, force: true });
});
