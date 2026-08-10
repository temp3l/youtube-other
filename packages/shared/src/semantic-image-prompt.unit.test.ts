import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assembleSemanticImagePrompt,
  buildSemanticImagePromptCacheKey,
  deriveSemanticImagePromptBrief,
  semanticImagePromptHash,
  validateSemanticImagePromptBrief,
  type SemanticImagePromptBriefV1,
  type SemanticImagePromptPlanInput,
} from "./semantic-image-prompt.js";

function plan(overrides: Partial<SemanticImagePromptPlanInput> = {}): SemanticImagePromptPlanInput {
  return {
    genre: "veronicaBenini",
    contentId: "L01-S01",
    title: "Being Good Isn't Enough",
    canonicalNarration: "Skill is hidden; buyers choose from visible evidence.",
    format: "short",
    aspectRatio: "9:16",
    sourceSemanticHash: semanticImagePromptHash("canonical meaning"),
    visualPlanHash: semanticImagePromptHash("approved visual plan"),
    genreAdapterVersion: "test-adapter.v1",
    genreVisualDirectionVersion: "test-direction.v1",
    genreContext: {
      genre: "veronicaBenini",
      visualDirectionVersion: "test-direction.v1",
      antiDriftRules: ["avoid generic office imagery"],
    },
    antiDriftRules: ["avoid generic office imagery"],
    assets: [
      {
        assetId: "asset-1",
        beatId: "beat-1",
        narrationBeat: "buyers choose visible evidence",
        currentPrompt: "old prompt",
        approved: {
          narrativePurpose: "proof",
          subject: "buyer and two credible professionals",
          action: "buyer selects visible evidence",
          environment: "consultation table",
          composition: "clear decision triangle",
          camera: "45mm client point of view",
          lighting: "directional daylight",
          props: ["two evidence portfolios"],
          motionOpportunities: ["selection reveal"],
          negativeConstraints: ["no readable text"],
        },
      },
    ],
    ...overrides,
  };
}

function brief(input: SemanticImagePromptPlanInput): SemanticImagePromptBriefV1 {
  return {
    schemaVersion: 1,
    genre: input.genre,
    contentId: input.contentId,
    sourceSemanticHash: input.sourceSemanticHash,
    visualPlanHash: input.visualPlanHash,
    contentThesis: "Buyers choose from visible evidence.",
    viewerPromise: "Understand the decision gap.",
    visualDirection: {
      coreStoryLogic: "hidden competence versus visible evidence",
      emotionalArc: "uncertainty to clear selection",
      realismLevel: "documentary",
      overallVisualLanguage: ["visible business decisions"],
      forbiddenDrift: ["generic office portrait"],
    },
    assets: [
      {
        assetId: "asset-1",
        beatId: "beat-1",
        narrativePurpose: "proof",
        spokenMeaning: "Buyers choose using visible evidence.",
        viewerTakeaway: "Hidden skill alone cannot drive the choice.",
        instantRead: "buyer chooses the option with clear proof",
        visualRelationship: "selection",
        mustShow: ["buyer visibly selecting evidence"],
        mustNotShow: ["unexplained luxury office"],
        subjectRoles: ["buyer", "credible expert"],
        environmentIntent: "real consultation decision",
        actionIntent: "buyer selects the professional with coherent proof",
        objectIntent: ["two contrasting evidence sets"],
        conceptualComposition: "decision triangle",
        relevanceAnchors: ["client selection", "visible evidence"],
        genericDriftRisks: ["thoughtful portrait"],
        generationBasePrompt: "A buyer selects visible evidence while hidden competence loses.",
      },
    ],
    genreContext: input.genreContext,
  };
}

describe("shared semantic image-prompt core", () => {
  it("uses one structured call on a cold cache and zero calls for locale-only reuse", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-prompt-core-"));
    const input = plan();
    const create = vi.fn(async () => ({
      id: "response-1",
      status: "completed",
      output_text: JSON.stringify(brief(input)),
    }));
    const request = {
      plan: input,
      cachePath: path.join(directory, "brief.json"),
      client: { responses: { create } },
      model: "configured-planning-model",
      plannerPromptVersion: "test-prompt.v1",
    } as const;
    const first = await deriveSemanticImagePromptBrief(request);
    const de = await deriveSemanticImagePromptBrief(request);
    const pt = await deriveSemanticImagePromptBrief(request);
    expect(first.cacheStatus).toBe("miss");
    expect(de.cacheStatus).toBe("hit");
    expect(pt.cacheStatus).toBe("hit");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("invalidates canonical meaning and visual treatment but excludes locale/TTS data", () => {
    const baseline = plan();
    const identity = (value: SemanticImagePromptPlanInput) =>
      buildSemanticImagePromptCacheKey({
        plan: value,
        plannerPromptVersion: "test-prompt.v1",
        plannerModel: "configured-planning-model",
      }).cacheKey;
    expect(identity({ ...baseline, sourceSemanticHash: semanticImagePromptHash("changed") })).not.toBe(
      identity(baseline),
    );
    expect(identity({ ...baseline, visualPlanHash: semanticImagePromptHash("changed visual") })).not.toBe(
      identity(baseline),
    );
    expect(Object.keys(baseline)).not.toEqual(
      expect.arrayContaining(["locale", "voice", "ttsProvider", "duration"]),
    );
  });

  it("fails malformed output after bounded retries and blocks generic/text requests", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "semantic-prompt-invalid-"));
    const create = vi.fn(async () => ({ id: "bad", output_text: "{}" }));
    await expect(
      deriveSemanticImagePromptBrief({
        plan: plan(),
        cachePath: path.join(directory, "brief.json"),
        client: { responses: { create } },
        model: "configured-planning-model",
        plannerPromptVersion: "test-prompt.v1",
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_IMAGE_BRIEF_SCHEMA_INVALID" });
    expect(create).toHaveBeenCalledTimes(2);

    const input = plan();
    const invalid = brief(input);
    invalid.assets[0]!.generationBasePrompt =
      "premium cinematic professional woman in a luxury office with readable written text";
    invalid.assets[0]!.spokenMeaning = "premium professional mood";
    invalid.assets[0]!.viewerTakeaway = "professional mood";
    invalid.assets[0]!.instantRead = "thoughtful professional";
    invalid.assets[0]!.environmentIntent = "premium office";
    invalid.assets[0]!.actionIntent = "looks thoughtful";
    invalid.assets[0]!.mustShow = ["professional woman"];
    invalid.assets[0]!.objectIntent = ["stylish desk"];
    invalid.assets[0]!.conceptualComposition = "cinematic portrait";
    invalid.assets[0]!.relevanceAnchors = ["premium office"];
    const codes = validateSemanticImagePromptBrief({ brief: invalid, plan: input }).map(
      (finding) => finding.code,
    );
    expect(codes).toContain("SEMANTIC_IMAGE_BRIEF_TEXT_IN_IMAGE");
    expect(codes).toContain("SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT");
  });

  it("assembles byte-identical prompts with action, camera, lighting, and composition", () => {
    const input = plan();
    const semantic = brief(input).assets[0]!;
    const first = assembleSemanticImagePrompt({
      semantic,
      approved: input.assets[0]!.approved,
      aspectRatio: input.aspectRatio,
      genreStyle: "documentary business realism",
      genreConstraints: input.antiDriftRules,
    });
    const second = assembleSemanticImagePrompt({
      semantic,
      approved: input.assets[0]!.approved,
      aspectRatio: input.aspectRatio,
      genreStyle: "documentary business realism",
      genreConstraints: input.antiDriftRules,
    });
    expect(first).toBe(second);
    expect(semanticImagePromptHash(first)).toBe(semanticImagePromptHash(second));
    expect(first).toContain("buyer selects the professional with coherent proof");
    expect(first).toContain("45mm client point of view");
    expect(first).toContain("directional daylight");
    expect(first).toContain("clear decision triangle");
  });
});
