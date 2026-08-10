import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { preparePositioningProductionEpisode } from "@mediaforge/strategic-reinvention";
import { describe, expect, it } from "vitest";
import { createVeronicaPreImageReviewPack } from "./veronica-pre-image-review-pack.js";

const fixtureRoot = path.resolve(
  "content-packs/veronica-content-pack-1",
);
const planPath = path.join(fixtureRoot, "visual-review/plans/l02.visual-plan.json");
const narrationPath = path.join(
  fixtureRoot,
  "long/en/02-how-to-find-your-niche-without-making-yourself-too-small.md",
);

async function writeOfflineWav(target: string, durationMs: number): Promise<void> {
  const wav = Buffer.alloc(44 + durationMs);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + durationMs, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(1_000, 24);
  wav.writeUInt32LE(1_000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(durationMs, 40);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, wav);
}

describe("Veronica L02 full non-provider dry run", () => {
  it("materializes the existing long-form fixture without Short pacing or providers", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-l02-full-"));
    const sourcePlan = JSON.parse(await fs.readFile(planPath, "utf8")) as {
      readonly scenes: readonly { readonly startMs: number; readonly durationMs: number }[];
    };
    const finalScene = sourcePlan.scenes.at(-1);
    if (!finalScene) throw new Error("L02 fixture has no scenes.");
    const episodeDir = path.join(workspaceRoot, "l02");
    await writeOfflineWav(
      path.join(episodeDir, "locales/en/full/audio/narration.wav"),
      finalScene.startMs + finalScene.durationMs,
    );
    await preparePositioningProductionEpisode({
      workspaceRoot,
      episodeId: "l02",
      language: "en",
      variant: "full",
      planPath,
      scriptPath: narrationPath,
    });
    const reviewPack = await createVeronicaPreImageReviewPack({
      episodeDir,
      language: "en",
      variant: "full",
    });
    const [plan, timing, packManifest] = await Promise.all([
      fs.readFile(path.join(episodeDir, "source/pre-image-semantic-plan.v1.json"), "utf8"),
      fs.readFile(path.join(episodeDir, "locales/en/full/canonical-timing.v1.json"), "utf8"),
      fs.readFile(reviewPack.manifestPath, "utf8"),
    ]);
    const parsedPlan = JSON.parse(plan) as {
      readonly format: string;
      readonly aspectRatio: string;
      readonly cadenceMetrics: { readonly targetRangeSeconds: readonly number[] };
      readonly continuity: { readonly mode: string };
      readonly diversityMetrics: { readonly viewerVisibleFamilies?: readonly unknown[] };
    };
    const parsedTiming = JSON.parse(timing) as {
      readonly timingSource: string;
      readonly narrationDurationSeconds: number;
    };
    const parsedPack = JSON.parse(packManifest) as {
      readonly providerRequestsAllowed: boolean;
      readonly narrationDiagnostic: { readonly mode: string };
      readonly sources: readonly { readonly name: string }[];
    };
    expect(parsedPlan).toMatchObject({
      format: "long",
      aspectRatio: "16:9",
      cadenceMetrics: { targetRangeSeconds: [6, 15] },
      continuity: { mode: "ensemble-independent" },
    });
    expect(parsedPlan.diversityMetrics.viewerVisibleFamilies).toHaveLength(9);
    expect(parsedTiming.timingSource).toBe("proportional-total-audio-reconciliation");
    expect(parsedTiming.narrationDurationSeconds).toBeGreaterThan(400);
    expect(parsedPack.providerRequestsAllowed).toBe(false);
    expect(parsedPack.narrationDiagnostic.mode).toBe("full-current-policy");
    expect(parsedPack.sources.map((source) => source.name)).not.toContain("pacing-calibration.v1.json");
  });
});
