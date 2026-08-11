import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compilePositioningProductionScenePlan,
  expandVeronicaLongFormSemanticScenes,
  preparePositioningProductionEpisode,
  positioningProductionPlanSchema,
} from "./positioning-production-adapter.js";

function plan(variant: "short" | "full" = "short") {
  const contentId = variant === "short" ? "L01-S01" : "L02";
  return positioningProductionPlanSchema.parse({
    schemaVersion: "veronicabenini-positioning-visual-plan.v2",
    contentId,
    format: variant === "short" ? "short" : "long",
    aspectRatio: variant === "short" ? "9:16" : "16:9",
    scenes: ["HOOK", "PAYOFF"].map((stage, index) => ({
      sceneId: `${contentId}-${stage}`,
      progressionStage: stage,
      narrationAnchor: `${stage.toLowerCase()}-anchor`,
      startMs: index * 5_000,
      durationMs: 5_000,
      treatment: {
        narrativeBeat: `${stage.toLowerCase()}-beat`,
        communicationIntent: index === 0 ? "create-tension" : "deliver-payoff",
        subjectRequirement: index === 0 ? "a client choosing visible proof" : "a clear evidence trail",
        environment: "European editorial studio",
        composition: variant === "short" ? "vertical editorial composition" : "landscape editorial composition",
        camera: "45mm point of view",
        lighting: "clean directional daylight",
        action: index === 0 ? "two alternatives reveal a meaningful contrast" : "a decision maker selects between visible options",
        ...(index === 0 ? {} : { actionOwnerRole: "buyer" as const }),
        strategy: index === 0 ? "comparison-composition" : "client-decision",
        props: ["portfolio"],
      },
    })),
    assets: ["HOOK", "PAYOFF"].map((stage) => ({
      sceneId: `${contentId}-${stage}`,
      prompt: `Text-free ${variant === "short" ? "9:16" : "16:9"} editorial treatment for ${stage}.`,
      nativeAspectRatio: variant === "short" ? "9:16" : "16:9",
      textFree: true,
      textInGeneratedImage: false,
    })),
    validation: { status: "pass" },
    planHash: "a".repeat(64),
  });
}

describe("positioning production adapter", () => {
  it("compiles approved positioning assets into canonical, likeness-safe scenes", () => {
    const result = compilePositioningProductionScenePlan({
      episodeId: "l01-s01-being-good-isnt-enough",
      narration: "Being good is not enough. Make your proof visible.",
      plan: plan(),
    });
    expect(result.scenes.map((scene) => scene.id)).toEqual(["scene-001", "scene-002"]);
    expect(result.scenes[0]?.imagePrompt).toContain("editorial treatment");
    expect(result.scenes[0]?.negativeConstraints).toContain(
      "no depiction or synthetic likeness of Veronica Benini",
    );
    expect(result.scenes.every((scene) => scene.qualityStatus === "semantic-review-required")).toBe(true);
  });

  it("writes the shared scene plan and locale/variant script used by existing pipelines", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-production-"));
    const episodeId = "l01-s01-being-good-isnt-enough";
    const episodeDir = path.join(workspaceRoot, episodeId);
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "languages", "short"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "source", "visual-plan.json"),
      `${JSON.stringify(plan(), null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(episodeDir, "languages", "short", "script-de.md"),
      "Gut zu sein reicht nicht. Zeig den Beweis.",
    );
    const result = await preparePositioningProductionEpisode({
      workspaceRoot,
      episodeId,
      language: "de",
      variant: "short",
    });
    expect(result.sceneCount).toBe(2);
    await expect(fs.stat(result.scenePlanPath)).resolves.toBeDefined();
    await expect(
      fs.readFile(path.join(episodeDir, "locales", "de", "short", "script.md"), "utf8"),
    ).resolves.toContain("Zeig den Beweis");
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8")) as {
      sourceMetadata: Record<string, unknown>;
    };
    expect(manifest.sourceMetadata).toMatchObject({
      genre: "veronicabenini",
      positioningPlanHash: "a".repeat(64),
      syntheticCreatorLikenessAllowed: false,
    });
  });

  it("runs full-form planning through the same semantic finalizer without Short cadence", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-full-production-"));
    const episodeId = "l02-positioning-full";
    const episodeDir = path.join(workspaceRoot, episodeId);
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "languages"), { recursive: true });
    await fs.writeFile(path.join(episodeDir, "source", "visual-plan.json"), `${JSON.stringify(plan("full"), null, 2)}\n`);
    await fs.writeFile(path.join(episodeDir, "languages", "script-en.md"), "A buyer sees evidence. The expert makes a clearer choice.");
    const result = await preparePositioningProductionEpisode({ workspaceRoot, episodeId, language: "en", variant: "full" });
    const finalPlan = JSON.parse(await fs.readFile(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), "utf8")) as { format: string; cadenceMetrics: { targetRangeSeconds: readonly number[] }; scenes: readonly { stateComplexity: string; treatment: { actionOwnerRole?: string } }[] };
    expect(result.sceneCount).toBe(2);
    expect(finalPlan.format).toBe("long");
    expect(finalPlan.cadenceMetrics.targetRangeSeconds).toEqual([6, 15]);
    expect(finalPlan.scenes.map((scene) => scene.stateComplexity)).toContain("DECISIVE_TRANSITION_MOMENT");
    expect(finalPlan.scenes.map((scene) => scene.treatment.actionOwnerRole)).toEqual(["none", "buyer"]);
  });

  it("adds semantic assets when narration changes proposition instead of counting camera-only events", () => {
    const source = plan("full") as unknown as Parameters<typeof expandVeronicaLongFormSemanticScenes>[0]["plan"];
    const narration = [
      "A broad message gives nobody a specific sign of fit.",
      "Concrete customer context reveals the frustration and buying priority.",
      "The response must follow from the recognized problem rather than lead with a package.",
      "Repeated proof makes the expertise easier for another person to remember.",
    ].join("\n\n");
    const expanded = expandVeronicaLongFormSemanticScenes({ plan: source, narration });
    expect(expanded.expanded).toBe(true);
    expect(expanded.plan.scenes.length).toBeGreaterThan(source.scenes.length);
    expect(new Set(expanded.plan.assets.map((asset) => asset.sceneId)).size).toBe(expanded.plan.scenes.length);
    expect(expanded.plan.visualEvents).toEqual([]);
  });

  it("keeps one genuinely stable long-form semantic beat intact", () => {
    const source = plan("full") as unknown as Parameters<typeof expandVeronicaLongFormSemanticScenes>[0]["plan"];
    const narration = "Repeated proof supports one expertise association. Another work example reinforces that same association. The audience remembers the same expertise again.";
    const expanded = expandVeronicaLongFormSemanticScenes({ plan: source, narration });
    expect(expanded.expanded).toBe(false);
    expect(expanded.plan.scenes).toHaveLength(source.scenes.length);
  });
});
