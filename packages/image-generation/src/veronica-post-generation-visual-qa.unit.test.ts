import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashFile, hashText } from "@mediaforge/shared";
import {
  reviewVeronicaGeneratedImage,
  type VeronicaVisualQaBrief,
  type VeronicaVisualQaEvaluator,
} from "./veronica-post-generation-visual-qa.js";
const brief: VeronicaVisualQaBrief = {
  contentId: "l02-s01",
  assetId: "scene-1",
  locale: "en",
  variant: "short",
  canonicalNarration: "buyers choose clarity",
  spokenMeaning: "buyers choose clarity",
  viewerTakeaway: "clear choice",
  narrativePurpose: "comparison",
  visualRelationship: "decision",
  mustShow: ["buyer chooses"],
  mustNotShow: ["text"],
  relevanceAnchors: ["buyer"],
  genericDriftRisks: ["stock"],
  finalPrompt: "buyer chooses a clear option",
  semanticBriefHash: "a".repeat(64),
  visualDirectionVersion: "veronica.v1",
  visualDirectionRules: ["buyer action"],
};
function evaluator(result: unknown): VeronicaVisualQaEvaluator {
  return {
    model: "vision-test",
    config: { temperature: 0 },
    evaluate: vi.fn(async () => result),
  };
}
async function passing(image: string): Promise<object> {
  const fp = await hashFile(image);
  return {
    schemaVersion: "veronica-post-generation-visual-review.v1",
    contentId: brief.contentId,
    assetId: brief.assetId,
    imageFingerprint: fp,
    semanticBriefHash: brief.semanticBriefHash,
    finalPromptHash: hashText(brief.finalPrompt),
    evaluatorModel: "vision-test",
    evaluatorConfigHash: hashText(JSON.stringify({ temperature: 0 })),
    visualDirectionVersion: brief.visualDirectionVersion,
    createdAt: "2026-08-10T00:00:00.000Z",
    semanticAlignmentScore: 0.9,
    instantReadScore: 0.9,
    buyerActionVisibilityScore: 0.9,
    causeEffectVisibilityScore: 0.9,
    narrationSupportScore: 0.9,
    visualQualityScore: 0.9,
    mustShowCoverage: "pass",
    mustNotShowViolations: [],
    occupationProxyDrift: "none",
    abstractPropDrift: "none",
    genericBusinessStockDrift: "none",
    passivePortraitDrift: "none",
    decorativeConceptDrift: "none",
    textInImageViolation: false,
    syntheticVeronicaLikenessRisk: false,
    visibleBuyerDecision: true,
    visibleHumanAction: true,
    requiresNarrationToDecode: false,
    regenerationRequired: false,
    findings: [],
    failedRequirements: [],
    successfulRequirements: ["buyer chooses"],
    regenerationInstructions: [],
  };
}
describe("Veronica post-generation visual QA", () => {
  it("caches a passing pixel review and invalidates on pixel change", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-qa-"));
    const image = path.join(dir, "image.png");
    await fs.writeFile(image, "one");
    const provider: VeronicaVisualQaEvaluator = {
      model: "vision-test",
      config: { temperature: 0 },
      evaluate: vi.fn(async ({ imagePath }) => passing(imagePath)),
    };
    expect(
      (
        await reviewVeronicaGeneratedImage({
          cacheDir: dir,
          imagePath: image,
          brief,
          evaluator: provider,
        })
      ).approved
    ).toBe(true);
    expect(
      (
        await reviewVeronicaGeneratedImage({
          cacheDir: dir,
          imagePath: image,
          brief,
          evaluator: provider,
        })
      ).cacheStatus
    ).toBe("hit");
    await fs.writeFile(image, "two");
    await reviewVeronicaGeneratedImage({
      cacheDir: dir,
      imagePath: image,
      brief,
      evaluator: provider,
    });
    expect(provider.evaluate).toHaveBeenCalledTimes(2);
  });
  it("fails closed on malformed evaluator output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-qa-"));
    const image = path.join(dir, "image.png");
    await fs.writeFile(image, "one");
    await expect(
      reviewVeronicaGeneratedImage({
        cacheDir: dir,
        imagePath: image,
        brief,
        evaluator: evaluator({}),
      })
    ).rejects.toThrow("malformed");
  });
});

describe("Veronica visual QA cache contract", () => {
  it("invalidates when the semantic brief changes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-qa-semantic-"));
    const image = path.join(dir, "image.png");
    await fs.writeFile(image, "one");
    const provider: VeronicaVisualQaEvaluator = {
      model: "vision-test",
      config: { temperature: 0 },
      evaluate: vi.fn(async ({ imagePath }) => passing(imagePath)),
    };
    await reviewVeronicaGeneratedImage({
      cacheDir: dir,
      imagePath: image,
      brief,
      evaluator: provider,
    });
    await reviewVeronicaGeneratedImage({
      cacheDir: dir,
      imagePath: image,
      brief: { ...brief, semanticBriefHash: "b".repeat(64) },
      evaluator: provider,
    }).catch(() => undefined);
    expect(provider.evaluate).toHaveBeenCalledTimes(2);
  });
});
