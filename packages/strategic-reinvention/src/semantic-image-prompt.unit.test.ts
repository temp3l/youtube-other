import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS,
  SEMANTIC_IMAGE_PROMPT_NORMAL_MAX_WORDS,
  SEMANTIC_IMAGE_PROMPT_NORMAL_MIN_WORDS,
  semanticImagePromptBriefV1Schema,
  type SemanticImagePromptBriefV1,
} from "@mediaforge/shared";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import {
  VERONICA_SEMANTIC_ANTI_DRIFT_RULES,
  VERONICA_VISUAL_DIRECTION_VERSION,
  assembleVeronicaNegativeConstraints,
  assembleVeronicaSemanticImagePrompts,
  buildVeronicaSemanticImagePromptPlanInput,
  deriveVeronicaSemanticImagePromptBrief,
  validateVeronicaSemanticImagePromptBrief,
} from "./semantic-image-prompt.js";

const fixtureRoot = path.resolve("content-packs/veronica-content-pack-1");

async function loadFixture() {
  const [planRaw, narration, semanticRaw] = await Promise.all([
    fs.readFile(path.join(fixtureRoot, "visual-review/plans/l01-s01.visual-plan.json"), "utf8"),
    fs.readFile(path.join(fixtureRoot, "shorts/en/l01-s01-being-good-isnt-enough.md"), "utf8"),
    fs.readFile(
      path.resolve(
        "packages/strategic-reinvention/src/fixtures/l01-s01-semantic-image-prompt.v1.json",
      ),
      "utf8",
    ),
  ]);
  return {
    plan: JSON.parse(planRaw) as PositioningVisualPlanV2,
    narration,
    semantics: semanticImagePromptBriefV1Schema.parse(JSON.parse(semanticRaw) as unknown),
  };
}

function brief(
  normalized: ReturnType<typeof buildVeronicaSemanticImagePromptPlanInput>,
  fixture: Awaited<ReturnType<typeof loadFixture>>["semantics"],
): SemanticImagePromptBriefV1 {
  const sourceById = new Map(fixture.assets.map((asset) => [asset.assetId, asset]));
  return {
    ...fixture,
    contentId: normalized.contentId,
    sourceSemanticHash: normalized.sourceSemanticHash,
    visualPlanHash: normalized.visualPlanHash,
    assets: normalized.assets.map((asset) => {
      const source = sourceById.get(asset.assetId);
      if (!source) throw new Error(`Missing fixture semantics for ${asset.assetId}.`);
      return {
        ...source,
        beatId: asset.beatId,
      };
    }),
    genreContext: {
      genre: "veronicaBenini",
      visualDirectionVersion: VERONICA_VISUAL_DIRECTION_VERSION,
      antiDriftRules: [...VERONICA_SEMANTIC_ANTI_DRIFT_RULES],
    },
  };
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).length;
}

describe("Veronica semantic image-prompt adapter", () => {
  it("derives L01-S01 once and preserves all five narration meanings across locales", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const create = vi.fn(async () => ({
      id: "l01-s01-fixture",
      status: "completed",
      output_text: JSON.stringify(output),
    }));
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-semantic-"));
    const request = {
      episodeDir,
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
      client: { responses: { create } },
      model: "configured-planning-model",
    } as const;
    const first = await deriveVeronicaSemanticImagePromptBrief(request);
    for (const _locale of ["de", "it", "fr", "pt"] as const) {
      await deriveVeronicaSemanticImagePromptBrief(request);
    }
    expect(first.cacheStatus).toBe("miss");
    expect(create).toHaveBeenCalledTimes(1);
    expect(first.artifact.brief.assets).toHaveLength(5);
    expect(first.artifact.brief.assets.map((asset) => asset.visualRelationship)).toEqual([
      "decision",
      "hidden-vs-visible",
      "evidence",
      "comparison",
      "transformation",
    ]);
    expect(first.artifact.brief.assets.map((asset) => asset.viewerTakeaway).join(" ")).toMatch(
      /client decision.*hidden.*visible signals.*recognizable competence.*makes real expertise legible/iu,
    );
  });

  it("projects semantic action plus compatible camera, composition, and lighting deterministically", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const first = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output });
    const second = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output });
    expect(first).toEqual(second);
    fixture.plan.scenes.forEach((scene, index) => {
      const prompt = first[index]?.prompt ?? "";
      expect(prompt).toContain(output.assets[index]!.actionIntent);
      expect(prompt).toContain(output.assets[index]!.conceptualComposition.split(";")[0]!);
      expect(prompt).toContain(scene.treatment.camera.split(";").at(-1)!);
      expect(prompt).toContain(scene.treatment.lighting);
      expect(prompt).toContain("native 9:16 composition");
      expect(prompt).toContain("No readable text of any kind");
      expect(prompt).not.toContain("…");
    });
  });

  it("narrows V01 to a reusable professional evaluation context", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const semantic = output.assets.find((asset) => asset.assetId === "l01-s01-v01-base")!;
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output })
      .find((asset) => asset.assetId === semantic.assetId)!.prompt;
    expect(`${semantic.environmentIntent} ${prompt}`).not.toMatch(
      /hospitality space|restaurant|boutique|gallery/iu,
    );
    expect(prompt).toMatch(/occupation-neutral professional consultation setting/iu);
    expect(prompt).toMatch(/prospective client/iu);
    expect(prompt).toMatch(/cannot directly inspect the skill/iu);
  });

  it("turns V03 into an immediate business comparison and lets semantics beat legacy abstraction", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const semantic = output.assets.find((asset) => asset.assetId === "l01-s01-v03-base")!;
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output })
      .find((asset) => asset.assetId === semantic.assetId)!.prompt;
    expect(prompt).not.toMatch(
      /reflection installation|artifact archive|mirror plane|memory tokens|silhouette cards/iu,
    );
    expect(prompt).not.toMatch(/nonbinary creative director/iu);
    expect(prompt).toMatch(/two equally credible professionals/iu);
    expect(prompt).toMatch(/hidden competence|difficult-to-(?:read|interpret)/iu);
    expect(prompt).toMatch(/coherent(?:, easy-to-recognize)? proof|coherent proof portfolio/iu);
    expect(prompt).toMatch(/buyer immediately understands.*struggling to (?:read|interpret)/iu);
    expect(prompt).toContain("58mm medium-wide comparison frame");
    expect(prompt).toContain("medium-wide three-person comparison");
  });

  it("removes unsupported demographic specificity while retaining the material occupation", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    output.assets[0]!.subjectRoles = ["young Italian female marketing consultant"];
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output })[0]!.prompt;
    expect(prompt).toContain("credible marketing professional");
    expect(prompt).not.toMatch(/young|Italian|female/iu);
  });

  it("retains subject specificity required by approved continuity", async () => {
    const fixture = await loadFixture();
    const continuityPlan = structuredClone(fixture.plan) as PositioningVisualPlanV2;
    const firstAsset = continuityPlan.assets[0]!;
    (continuityPlan as { continuity: PositioningVisualPlanV2["continuity"] }).continuity = {
      mode: "persistent-protagonist",
      identityId: "approved-character",
      identityFingerprint: "approved-character-fingerprint",
      appearance: {
        ageBand: "young",
        genderPresentation: "female",
        hair: "approved",
        wardrobeAnchor: "approved",
      },
      referencePolicy: "reuse-only-for-linked-scenes",
      linkedSceneIds: [continuityPlan.scenes[0]!.sceneId],
    };
    (continuityPlan as { assets: PositioningVisualPlanV2["assets"] }).assets = continuityPlan.assets.map(
      (asset) =>
        asset.assetId === firstAsset.assetId
          ? { ...asset, subjectIdentityId: "approved-character" }
          : asset,
    );
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: continuityPlan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    output.assets[0]!.subjectRoles = ["young Italian female marketing consultant"];
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: continuityPlan, brief: output })[0]!.prompt;
    expect(prompt).toContain("young Italian female marketing consultant");
  });

  it("renders one deterministic text-free and generic-drift constraint block", () => {
    const first = assembleVeronicaNegativeConstraints({
      semanticBrief: ["generic editorial mood", "no readable text, letters, numbers, logos, UI, or watermarks"],
      genreAdapter: ["Avoid generic luxury or editorial imagery that does not explain the narration."],
      visualTreatment: ["unexplained luxury objects", "No captions, subtitles, labels, letters, numbers, logos, watermarks, fake UI copy, or readable generated text"],
      textFreePolicy: ["no readable text of any kind"],
    });
    const second = assembleVeronicaNegativeConstraints({
      semanticBrief: ["generic editorial mood", "no readable text, letters, numbers, logos, UI, or watermarks"],
      genreAdapter: ["Avoid generic luxury or editorial imagery that does not explain the narration."],
      visualTreatment: ["unexplained luxury objects", "No captions, subtitles, labels, letters, numbers, logos, watermarks, fake UI copy, or readable generated text"],
      textFreePolicy: ["no readable text of any kind"],
    });
    expect(first).toEqual(second);
    expect(first.constraints).toEqual([
      "Avoid generic editorial/luxury mood, prestige settings, decorative display props, symbolic installations, and contemplative portraits unless directly required by the narration beat.",
    ]);
    expect(first.textFreeConstraint).toBe(
      "No readable text of any kind: no captions, subtitles, labels, letters, numbers, logos, watermarks, or fake UI copy.",
    );
  });

  it("flags occupation-proxy drift and projects generic positioning beats to neutral business evidence", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const hiddenExpertise = output.assets.find((asset) => asset.assetId === "l01-s01-v01-base")!;
    hiddenExpertise.environmentIntent = "architecture design studio with material boards";
    hiddenExpertise.objectIntent = ["building renderings", "construction plans", "material samples"];
    hiddenExpertise.generationBasePrompt =
      "An architecture portfolio review makes hidden expertise visible through construction plans.";
    expect(
      validateVeronicaSemanticImagePromptBrief({ brief: output, plan: normalized }).map(
        (finding) => finding.code,
      ),
    ).toContain("OCCUPATION_PROXY_DRIFT");
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output })
      .find((asset) => asset.assetId === hiddenExpertise.assetId)!.prompt;
    expect(prompt).toMatch(/limited visible evidence summaries|structured proof cards/iu);
    expect(prompt).not.toMatch(
      /architecture|building renderings|construction plans|material boards|material samples|design studio/iu,
    );
  });

  it("flags creative-portfolio proxy drift and replaces it with neutral proof signals", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const hiddenExpertise = output.assets.find((asset) => asset.assetId === "l01-s01-v01-base")!;
    hiddenExpertise.environmentIntent = "creative studio review with an image-presentation wall";
    hiddenExpertise.objectIntent = ["photographic contact sheets", "photo grid", "moodboard"];
    hiddenExpertise.generationBasePrompt =
      "A creative portfolio review uses contact sheets and image-heavy presentation boards as proof.";
    expect(
      validateVeronicaSemanticImagePromptBrief({ brief: output, plan: normalized }).map(
        (finding) => finding.code,
      ),
    ).toContain("CREATIVE_PORTFOLIO_PROXY_DRIFT");
    const prompt = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output })
      .find((asset) => asset.assetId === hiddenExpertise.assetId)!.prompt;
    expect(prompt).toMatch(/restricted line of sight|cannot directly inspect/iu);
    expect(prompt).toMatch(/simplified text-free external proof summaries/iu);
    expect(prompt).not.toMatch(
      /contact sheets?|photo(?:graphy)? grids?|moodboards?|lookbooks?|creative (?:studio|portfolio|review)|image-presentation wall/iu,
    );
  });

  it("keeps scenes 002, 004, and 005 occupation-neutral while preserving their business meaning", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const prompts = new Map(
      assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: brief(normalized, fixture.semantics) })
        .map((asset) => [asset.assetId, asset.prompt] as const),
    );
    const proxyTerms =
      /architecture|interior design|construction|workshop|craft|material (?:samples?|boards?)|building renderings|design studio|field-work|service counter/iu;
    const scene002 = prompts.get("l01-s01-v01-base")!;
    expect(scene002).toMatch(/hidden|cannot directly inspect|cannot be directly measured/iu);
    expect(scene002).toMatch(/visible evidence|proof (?:cards|summaries)/iu);
    expect(scene002).not.toMatch(proxyTerms);
    const scene004 = prompts.get("l01-s01-v03-base")!;
    expect(scene004).toMatch(/two equally credible professionals/iu);
    expect(scene004).toMatch(/difficult-to-(?:read|interpret)/iu);
    expect(scene004).toMatch(/coherent proof/iu);
    expect(scene004).toMatch(/buyer immediately understands|clearer option/iu);
    expect(scene004).not.toMatch(proxyTerms);
    const scene005 = prompts.get("l01-s01-v04-base")!;
    expect(scene005).toMatch(/Positioning makes real competence visible/iu);
    expect(scene005).toMatch(/clear reason to choose|confidently selects/iu);
    expect(scene005).toMatch(/confident buyer selection gesture/iu);
    expect(scene005).not.toMatch(proxyTerms);
    for (const prompt of [scene002, scene004, scene005]) {
      expect(wordCount(prompt)).toBeLessThanOrEqual(SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS);
      expect(prompt).toContain("No readable text of any kind");
    }
  });

  it("retains all five L01-S01 narration meanings in final prompts", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const prompts = assembleVeronicaSemanticImagePrompts({
      plan: fixture.plan,
      brief: brief(normalized, fixture.semantics),
    }).map((asset) => asset.prompt);
    expect(prompts).toHaveLength(5);
    expect(prompts[0]).toMatch(/better expert.*lose the client.*clearer competitor/iu);
    expect(prompts[1]).toMatch(/cannot directly see expertise|skill itself is hidden/iu);
    expect(prompts[2]).toMatch(/visible signals|offer.*website structure.*reputation.*recommendations/iu);
    expect(prompts[3]).toMatch(/being an expert.*perceived as an expert|real competence.*recognizable competence/iu);
    expect(prompts[4]).toMatch(/positioning makes real competence visible|makes real expertise legible/iu);
  });

  it("structurally compacts a verbose live-style brief into bounded provider prompts", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = structuredClone(brief(normalized, fixture.semantics));
    for (const asset of output.assets) {
      asset.spokenMeaning +=
        " The same narration meaning should remain visible through a concrete client decision. Decorative production detail must stay subordinate to that business consequence.";
      asset.viewerTakeaway +=
        " A mobile viewer should understand this consequence immediately. The evidence relationship must remain explicit even without audio.";
      asset.mustShow = asset.mustShow.map(
        (value) => `${value}. Preserve this exact semantic role before adding secondary scene detail`,
      );
      asset.actionIntent +=
        " The people visibly react to the evidence in the same frame. Their behavior makes the choice legible without explanatory copy.";
      asset.generationBasePrompt +=
        " Repeat the narration-aligned cause and effect through concrete behavior. Keep every secondary object plausible and subordinate. Avoid ornamental staging that competes with the buyer's decision.";
      asset.environmentIntent +=
        " The location supports the decision rather than becoming the subject. Background activity remains believable and restrained.";
      asset.conceptualComposition +=
        " Preserve clear foreground, middle-ground, and background responsibilities. Maintain fast portrait-format readability.";
      asset.genericDriftRisks = [
        ...asset.genericDriftRisks,
        "decorative editorial staging that obscures the client decision",
        "secondary objects that repeat evidence without adding meaning",
      ];
    }
    const prompts = assembleVeronicaSemanticImagePrompts({ plan: fixture.plan, brief: output });
    for (const { prompt } of prompts) {
      expect(wordCount(prompt)).toBeGreaterThanOrEqual(SEMANTIC_IMAGE_PROMPT_NORMAL_MIN_WORDS);
      expect(wordCount(prompt)).toBeLessThanOrEqual(SEMANTIC_IMAGE_PROMPT_NORMAL_MAX_WORDS);
      expect(prompt).not.toContain("…");
    }
    for (const assetId of ["l01-s01-v01-base", "l01-s01-v03-base"]) {
      const prompt = prompts.find((asset) => asset.assetId === assetId)!.prompt;
      expect(wordCount(prompt)).toBeLessThanOrEqual(SEMANTIC_IMAGE_PROMPT_ABSOLUTE_MAX_WORDS);
    }
  });

  it("blocks narration-unrequired abstract Veronica treatments", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    const comparison = output.assets.find((asset) => asset.assetId === "l01-s01-v03-base")!;
    comparison.environmentIntent = "reflection installation and artifact archive zone";
    comparison.objectIntent = ["mirror plane", "memory tokens"];
    expect(
      validateVeronicaSemanticImagePromptBrief({ brief: output, plan: normalized }).map(
        (finding) => finding.code,
      ),
    ).toContain("VERONICA_SEMANTIC_PROMPT_ABSTRACT_TREATMENT");
  });

  it("blocks positioning imagery that is generic mood without business meaning", async () => {
    const fixture = await loadFixture();
    const normalized = buildVeronicaSemanticImagePromptPlanInput({
      plan: fixture.plan,
      canonicalNarration: fixture.narration,
    });
    const output = brief(normalized, fixture.semantics);
    output.assets[0]!.spokenMeaning = "premium mood";
    output.assets[0]!.viewerTakeaway = "professional mood";
    output.assets[0]!.actionIntent = "looks thoughtful";
    output.assets[0]!.mustShow = ["luxury office"];
    output.assets[0]!.relevanceAnchors = ["fashion editorial"];
    output.assets[0]!.generationBasePrompt = "premium thoughtful consultant in a luxury office";
    expect(
      validateVeronicaSemanticImagePromptBrief({ brief: output, plan: normalized }).map(
        (finding) => finding.code,
      ),
    ).toContain("SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT");
  });
});
