import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptStoryProductionArtifactsToStoryIR,
  fullStoryOutputConstraintsSchema,
} from "./story-artifact-model.js";
import { buildCharacterRenameMap } from "./character-rename.service.js";
import {
  buildFullStoryContract,
  computeStoryIrContentHash,
} from "./full-story-contract.js";
import { getLanguageProfile } from "./language-profiles.js";
import { compileLocalizedFullStoryPrompt } from "./localization-prompt-builder.js";
import {
  buildLocalizationHorrorAffectProjection,
  buildLocalizationHorrorAffectProjectionLineage,
  explainLocalizationHorrorAffectProjectionStaleness,
  validateLocalizationHorrorAffectProjection,
} from "./localization-horror-affect-projection.js";
import {
  analyzeStorySource,
  buildOriginalityReview,
  buildRetentionPlan,
  buildStoryBible,
} from "./story-production.js";
import { compileFullStoryPrompt } from "./story-prompt-compiler.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sourceFile = path.join(
  repoRoot,
  "content-ideas",
  "content",
  "dark-truth-episodes-multilingual-production-pack",
  "002-even-killers-can-lick",
  "en",
  "002-even-killers-can-lick-en-full.md"
);
const canonicalFingerprint = "f".repeat(64);

async function fixture() {
  const sourceStory = await parseCanonicalSourceStory(sourceFile);
  const canonicalFacts = extractCanonicalStoryFacts(sourceStory);
  const analysis = analyzeStorySource(sourceStory, canonicalFacts);
  const bible = buildStoryBible(sourceStory, canonicalFacts, analysis);
  const productionContext = {
    analysis,
    bible,
    originalityReview: buildOriginalityReview(
      sourceStory,
      canonicalFacts,
      analysis
    ),
    retentionPlan: buildRetentionPlan(sourceStory, bible),
  };
  const storyIr = adaptStoryProductionArtifactsToStoryIR({
    parsed: sourceStory,
    facts: canonicalFacts,
    ...productionContext,
  });
  const characterRenameMap = buildCharacterRenameMap({
    episodeId: sourceStory.episodeNumber,
    sourceHash: sourceStory.sourceHash,
    canonicalFacts,
    storyIr,
  });
  const outputConstraints = fullStoryOutputConstraintsSchema.parse({
    variant: "full",
    targetWordRange: { min: 900, max: 2200 },
    targetNarrationWpm: 190,
    targetDuration: { minSeconds: 330, maxSeconds: 660 },
  });
  const contractResult = buildFullStoryContract({
    storyIr,
    artifactIdentity: {
      episodeNumber: sourceStory.episodeNumber,
      episodeSlug: sourceStory.slug,
      language: "en",
      locale: "en-US",
      variant: "full",
    },
    outputConstraints,
    characterRenameMap,
    lineage: {
      kind: "story-ir-only",
      storyIrHash: computeStoryIrContentHash(storyIr),
      reason: "test-fixture",
    },
  });
  if (!contractResult.ok) {
    throw new Error("Fixture full-story contract did not build.");
  }
  const canonical = compileFullStoryPrompt({
    language: "en",
    adaptationMode: "retention-optimized",
    sourceStory,
    canonicalFacts,
    storyIr,
    characterRenameMap,
    productionContext,
    horrorAffectRolloutMode: "enforce",
  });
  if (!canonical.horrorAffectPlan?.validation.valid) {
    throw new Error("Fixture horror affect plan is not valid.");
  }
  const projection = buildLocalizationHorrorAffectProjection({
    plan: canonical.horrorAffectPlan,
    contract: contractResult.contract,
    canonicalFingerprint,
  });
  return {
    sourceStory,
    canonicalFacts,
    productionContext,
    characterRenameMap,
    contract: contractResult.contract,
    plan: canonical.horrorAffectPlan,
    projection,
  };
}

describe("localization horror affect projection", () => {
  it("builds a compact stable chain with accepted semantic IDs", async () => {
    const first = await fixture();
    const second = await fixture();

    expect(first.projection).toEqual(second.projection);
    expect(
      validateLocalizationHorrorAffectProjection(first.projection)
    ).toEqual([]);
    expect(first.projection.semanticIds).toEqual(
      expect.objectContaining({
        questionId: first.plan.openQuestions[0]?.id,
        responseIds: expect.any(Array),
        ruleId: expect.stringMatching(/^rule:beat-/u),
        costId: expect.stringMatching(/^cost:beat-/u),
        climaxId: expect.stringMatching(/^climax:beat-/u),
        payoffId: expect.stringMatching(/^payoff:beat-/u),
      })
    );
    expect(first.projection.parent.planHash).toBe(first.plan.planHash);
    expect(first.projection.parent.canonicalFingerprint).toBe(
      canonicalFingerprint
    );
  });

  it("enforces meaning and evidence without requiring literal English phrasing", async () => {
    const value = await fixture();
    const compiled = compileLocalizedFullStoryPrompt({
      languageProfile: getLanguageProfile("de"),
      adaptationMode: "retention-optimized",
      sourceStory: value.sourceStory,
      canonicalFacts: value.canonicalFacts,
      characterRenameMap: value.characterRenameMap,
      horrorAffectRolloutMode: "enforce",
      parentHorrorAffectPlan: value.plan,
      parentFullContract: value.contract,
      parentCanonicalFingerprint: canonicalFingerprint,
      productionContext: value.productionContext,
    });

    expect(compiled.user).toContain("## Localized Horror Affect Preservation");
    expect(compiled.user).toContain(value.projection.semanticIds.questionId);
    expect(compiled.user).toContain(
      "Syntax, cadence, idiom, sentence boundaries, and paragraph rhythm may change naturally"
    );
    expect(compiled.user).toContain(
      "Return one affectPreservation transition entry"
    );
    expect(compiled.responseSchema.name).toBe(
      "localized_full_affect_narration_package"
    );
    expect(compiled.localizationHorrorAffectProjection).toEqual(
      value.projection
    );
  });

  it("compiles byte-equivalent sync and batch localization requests", async () => {
    const value = await fixture();
    const compileRequest = () =>
      compileLocalizedFullStoryPrompt({
        languageProfile: getLanguageProfile("es"),
        adaptationMode: "retention-optimized",
        sourceStory: value.sourceStory,
        canonicalFacts: value.canonicalFacts,
        characterRenameMap: value.characterRenameMap,
        horrorAffectRolloutMode: "enforce",
        parentHorrorAffectPlan: value.plan,
        parentFullContract: value.contract,
        parentCanonicalFingerprint: canonicalFingerprint,
        productionContext: value.productionContext,
      });
    const sync = compileRequest();
    const batch = compileRequest();

    expect({
      system: sync.system,
      user: sync.user,
      schema: sync.responseSchema.fingerprint,
      prompt: sync.promptFingerprint,
      projection: sync.localizationHorrorAffectProjection?.projectionHash,
    }).toEqual({
      system: batch.system,
      user: batch.user,
      schema: batch.responseSchema.fingerprint,
      prompt: batch.promptFingerprint,
      projection: batch.localizationHorrorAffectProjection?.projectionHash,
    });
  });

  it.each(["off", "shadow"] as const)(
    "keeps %s localized prompt, schema, and cache fingerprint compatible",
    async (mode) => {
      const value = await fixture();
      const baseline = compileFullStoryPrompt({
        language: "de",
        adaptationMode: "retention-optimized",
        sourceStory: value.sourceStory,
        canonicalFacts: value.canonicalFacts,
        characterRenameMap: value.characterRenameMap,
        horrorAffectRolloutMode: mode,
        productionContext: value.productionContext,
      });
      const compiled = compileLocalizedFullStoryPrompt({
        languageProfile: getLanguageProfile("de"),
        adaptationMode: "retention-optimized",
        sourceStory: value.sourceStory,
        canonicalFacts: value.canonicalFacts,
        characterRenameMap: value.characterRenameMap,
        horrorAffectRolloutMode: mode,
        parentHorrorAffectPlan: value.plan,
        parentFullContract: value.contract,
        parentCanonicalFingerprint: canonicalFingerprint,
        productionContext: value.productionContext,
      });

      expect(compiled.system).toBe(baseline.system);
      expect(compiled.user).toBe(baseline.user);
      expect(compiled.promptFingerprint).toBe(baseline.promptFingerprint);
      expect(compiled.responseSchema.fingerprint).toBe(
        baseline.responseSchema.fingerprint
      );
      expect(compiled.localizationHorrorAffectProjection).toBeUndefined();
    }
  );

  it("explains stale localized artifacts from parent-plan lineage", async () => {
    const value = await fixture();
    const expected = buildLocalizationHorrorAffectProjectionLineage(
      value.projection
    );
    const persisted = {
      ...expected,
      parentPlanHash: "0".repeat(64),
    };

    expect(
      explainLocalizationHorrorAffectProjectionStaleness({
        persisted,
        expected,
      })
    ).toEqual([
      expect.objectContaining({
        code: "parent-plan-hash-changed",
        expected: value.plan.planHash,
      }),
    ]);
  });
});
