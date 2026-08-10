import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compilePositioningProductionScenePlan,
  preparePositioningProductionEpisode,
  positioningProductionPlanSchema,
} from "./positioning-production-adapter.js";

function plan() {
  return positioningProductionPlanSchema.parse({
    schemaVersion: "veronicabenini-positioning-visual-plan.v2",
    contentId: "L01-S01",
    format: "short",
    aspectRatio: "9:16",
    scenes: ["HOOK", "PAYOFF"].map((stage, index) => ({
      sceneId: `L01-S01-${stage}`,
      progressionStage: stage,
      narrationAnchor: `${stage.toLowerCase()}-anchor`,
      startMs: index * 5_000,
      durationMs: 5_000,
      treatment: {
        narrativeBeat: `${stage.toLowerCase()}-beat`,
        communicationIntent: index === 0 ? "create-tension" : "deliver-payoff",
        subjectRequirement: index === 0 ? "a client choosing visible proof" : "a clear evidence trail",
        environment: "European editorial studio",
        composition: "vertical editorial composition",
        camera: "45mm point of view",
        lighting: "clean directional daylight",
        action: "the decision becomes visible",
        props: ["portfolio"],
      },
    })),
    assets: ["HOOK", "PAYOFF"].map((stage) => ({
      sceneId: `L01-S01-${stage}`,
      prompt: `Text-free 9:16 editorial treatment for ${stage}.`,
      nativeAspectRatio: "9:16",
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
});
