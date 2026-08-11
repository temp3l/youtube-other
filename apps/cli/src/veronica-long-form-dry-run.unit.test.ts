import { createHash } from "node:crypto";
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
const l01PlanPath = path.join(fixtureRoot, "visual-review/plans/l01.visual-plan.json");
const l01NarrationPath = path.join(fixtureRoot, "long/en/01-why-being-good-at-your-job-isnt-enough.md");

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

  it("packages compact, listening, and forensic modes without changing semantic artifacts", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-review-pack-modes-"));
    const episodeDir = path.join(workspaceRoot, "l02");
    const sourcePlan = JSON.parse(await fs.readFile(planPath, "utf8")) as { readonly scenes: readonly { readonly startMs: number; readonly durationMs: number }[] };
    const finalScene = sourcePlan.scenes.at(-1);
    if (!finalScene) throw new Error("L02 fixture has no scenes.");
    await writeOfflineWav(path.join(episodeDir, "locales/en/full/audio/narration.wav"), finalScene.startMs + finalScene.durationMs);
    await preparePositioningProductionEpisode({ workspaceRoot, episodeId: "l02", language: "en", variant: "full", planPath, scriptPath: narrationPath });
    const semanticPlanHash = createHash("sha256").update(await fs.readFile(path.join(episodeDir, "source/pre-image-semantic-plan.v1.json"))).digest("hex");
    const compact = await createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant: "full" });
    const listening = await createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant: "full", reviewPackMode: "listening" });
    const forensic = await createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant: "full", reviewPackMode: "forensic" });
    const compactManifest = JSON.parse(await fs.readFile(compact.manifestPath, "utf8")) as { readonly reviewPackMode: string; readonly canonicalAudioEmbedded: boolean; readonly reviewAudioPreviewEmbedded: boolean; readonly canonicalAudioSha256: string; readonly packFileHashes: Readonly<Record<string, string>> };
    const compactIntegrity = JSON.parse(await fs.readFile(path.join(compact.packDir, "audio-integrity.json"), "utf8")) as { readonly audioPrepackageValidationStatus: string; readonly timingIntegrityStatus: string; readonly decodedDurationSeconds: number };
    const listeningIntegrity = JSON.parse(await fs.readFile(path.join(listening.packDir, "audio-integrity.json"), "utf8")) as { readonly reviewAudioPreview: { readonly embedded: boolean; readonly canonical: boolean; readonly sourceCanonicalAudioSha256: string; readonly durationDifferenceSeconds: number } };
    expect(compact.reviewPackMode).toBe("compact");
    expect(compactManifest).toMatchObject({ reviewPackMode: "compact", canonicalAudioEmbedded: false, reviewAudioPreviewEmbedded: false });
    await expect(fs.access(path.join(compact.packDir, "narration.wav"))).rejects.toThrow();
    expect(compactIntegrity).toMatchObject({ audioPrepackageValidationStatus: "PASS", timingIntegrityStatus: "PASS" });
    expect(compactIntegrity.decodedDurationSeconds).toBeCloseTo((finalScene.startMs + finalScene.durationMs) / 1_000, 3);
    expect(compactManifest.packFileHashes).not.toHaveProperty("narration.wav");
    expect(await fs.readFile(compact.readmePath, "utf8")).toContain("WAV intentionally omitted");
    expect(await fs.readFile(path.join(listening.packDir, "narration-review.opus"))).toBeDefined();
    expect(listeningIntegrity.reviewAudioPreview).toMatchObject({ embedded: true, canonical: false, sourceCanonicalAudioSha256: compactManifest.canonicalAudioSha256 });
    expect(listeningIntegrity.reviewAudioPreview.durationDifferenceSeconds).toBeLessThanOrEqual(0.05);
    expect(await fs.readFile(path.join(forensic.packDir, "narration.wav"))).toBeDefined();
    expect(createHash("sha256").update(await fs.readFile(path.join(forensic.packDir, "narration.wav"))).digest("hex")).toBe(compactManifest.canonicalAudioSha256);
    expect(createHash("sha256").update(await fs.readFile(path.join(episodeDir, "source/pre-image-semantic-plan.v1.json"))).digest("hex")).toBe(semanticPlanHash);
    expect(new Set([compact.zipPath, listening.zipPath, forensic.zipPath]).size).toBe(3);
  }, 30_000);

  it("fails closed when canonical audio is unavailable for compact validation", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-missing-review-audio-"));
    await expect(createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant: "full" })).rejects.toThrow("CANONICAL_AUDIO_UNAVAILABLE_FOR_PREPACKAGE_VALIDATION");
  });
});

describe("Veronica L01 full semantic remediation", () => {
  it("rebuilds a provider-blocked human review pack with zero semantic blockers", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-l01-full-"));
    const episodeDir = path.join(workspaceRoot, "l01");
    await writeOfflineWav(path.join(episodeDir, "locales/en/full/audio/narration.wav"), 412_800);
    await preparePositioningProductionEpisode({
      workspaceRoot,
      episodeId: "l01",
      language: "en",
      variant: "full",
      planPath: l01PlanPath,
      scriptPath: l01NarrationPath,
    });
    const reviewPack = await createVeronicaPreImageReviewPack({ episodeDir, language: "en", variant: "full" });
    const [planRaw, reviewsRaw, timingRaw, eventsRaw, reviewRequest, providerPrompts, providerPromptsJson, episodeProviderPrompts, episodeProviderPromptsJson, manifestRaw] = await Promise.all([
      fs.readFile(path.join(episodeDir, "source/pre-image-semantic-plan.v1.json"), "utf8"),
      fs.readFile(path.join(episodeDir, "shared/pre-image-semantic-reviews.v1.json"), "utf8"),
      fs.readFile(path.join(episodeDir, "locales/en/full/canonical-timing.v1.json"), "utf8"),
      fs.readFile(path.join(episodeDir, "locales/en/full/retimed-visual-events.json"), "utf8"),
      fs.readFile(reviewPack.promptPath, "utf8"),
      fs.readFile(path.join(reviewPack.packDir, "provider-image-prompts.md"), "utf8"),
      fs.readFile(path.join(reviewPack.packDir, "provider-image-prompts.v1.json"), "utf8"),
      fs.readFile(path.join(episodeDir, "locales/en/full/image-prompts/provider-image-prompts.md"), "utf8"),
      fs.readFile(path.join(episodeDir, "locales/en/full/image-prompts/provider-image-prompts.v1.json"), "utf8"),
      fs.readFile(reviewPack.manifestPath, "utf8"),
    ]);
    const plan = JSON.parse(planRaw) as {
      readonly scenes: readonly { readonly sceneId: string; readonly visibleThesis: string; readonly stateComplexity: string; readonly eventIds: readonly string[]; readonly treatment: { readonly diagram: unknown; readonly actionOwnerRole?: string; readonly treatmentHash: string } }[];
      readonly assets: readonly { readonly assetId: string; readonly sceneId: string; readonly semanticPurpose: string; readonly prompt: string }[];
      readonly diagrams: readonly unknown[];
      readonly visualEvents: readonly { readonly eventId: string; readonly sceneId: string; readonly assetId: string; readonly startMs: number; readonly durationMs: number }[];
      readonly assetReuseDecisions: readonly { readonly decision?: string }[];
      readonly diversityMetrics: { readonly viewerVisibleFamilies: readonly unknown[] };
    };
    const reviews = JSON.parse(reviewsRaw) as { readonly reviews: readonly { readonly sceneId: string; readonly findings: readonly { readonly severity: string }[] }[] };
    const timing = JSON.parse(timingRaw) as { readonly narrationDurationSeconds: number; readonly timingSource: string };
    const events = JSON.parse(eventsRaw) as { readonly events: readonly { readonly startMs: number; readonly durationMs: number }[] };
    const manifest = JSON.parse(manifestRaw) as { readonly providerRequestsAllowed: boolean; readonly narrationDiagnostic: { readonly mode: string; readonly wordCount: number }; readonly packFileHashes: Readonly<Record<string, string>> };
    expect(providerPrompts).toBe(episodeProviderPrompts);
    expect(providerPromptsJson).toBe(episodeProviderPromptsJson);
    expect(JSON.parse(providerPromptsJson)).toMatchObject({ schemaVersion: "veronica-provider-image-prompts.v1" });
    expect(reviews.reviews.flatMap((review) => review.findings).filter((finding) => finding.severity === "blocker" || finding.severity === "error")).toHaveLength(0);
    expect(plan.scenes).toHaveLength(8);
    expect(plan.scenes.every((scene) => scene.visibleThesis.trim().length >= 28)).toBe(true);
    expect(plan.scenes.find((scene) => scene.sceneId === "L01-V03")?.visibleThesis).toMatch(/doorway.*broader/iu);
    expect(plan.assets.length).toBeGreaterThan(plan.scenes.length);
    expect(plan.assets.filter((asset) => plan.scenes.find((scene) => scene.sceneId === asset.sceneId)?.stateComplexity === "MULTI_STATE_REQUIRED").length).toBeGreaterThan(4);
    expect(plan.diagrams).toHaveLength(0);
    expect(plan.scenes.every((scene) => scene.treatment.diagram === null && scene.eventIds.every((eventId) => plan.visualEvents.some((event) => event.eventId === eventId)))).toBe(true);
    expect(plan.assets.every((asset) => asset.semanticPurpose === plan.scenes.find((scene) => scene.sceneId === asset.sceneId)?.visibleThesis)).toBe(true);
    expect(plan.assetReuseDecisions.some((decision) => decision.decision === "AUTO_REUSE_APPROVED")).toBe(false);
    expect(plan.diversityMetrics.viewerVisibleFamilies).toHaveLength(8);
    expect(timing).toEqual(expect.objectContaining({ narrationDurationSeconds: 412.8, timingSource: "proportional-total-audio-reconciliation" }));
    const finalEvent = events.events.at(-1);
    expect(finalEvent ? (finalEvent.startMs + finalEvent.durationMs) / 1_000 : 0).toBe(412.8);
    expect(reviewRequest).toContain("full / long-form 16:9");
    expect(reviewRequest).not.toContain("Review this Short");
    expect(reviewRequest).not.toContain("9:16 readability");
    expect(providerPrompts).not.toContain("Visible thesis:.");
    expect(providerPrompts).toContain("UNAPPROVED — DO NOT SUBMIT");
    expect(providerPrompts).toContain("Sequence asset 2 of 2");
    expect(manifest).toEqual(expect.objectContaining({ providerRequestsAllowed: false, narrationDiagnostic: expect.objectContaining({ mode: "full-current-policy", wordCount: 998 }) }));
    for (const [fileName, expectedHash] of Object.entries(manifest.packFileHashes)) {
      const actualHash = createHash("sha256").update(await fs.readFile(path.join(reviewPack.packDir, fileName))).digest("hex");
      expect(actualHash).toBe(expectedHash);
    }
  });
});
