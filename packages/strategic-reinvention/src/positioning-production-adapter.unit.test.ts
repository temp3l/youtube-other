import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  compilePositioningProductionScenePlan,
  establishVeronicaSourceGroundedQaAdmission,
  expandVeronicaLongFormSemanticScenes,
  isVeronicaDeterministicVisualQaEligible,
  preparePositioningProductionEpisode,
  positioningScenePlanMaterializationReasons,
  positioningProductionPlanSchema,
  remediateExistingVeronicaPreImagePlan,
  runExistingVeronicaSourceGroundedPreImageQa,
} from "./positioning-production-adapter.js";
import { buildVeronicaCanonicalVisualPlan } from "./positioning-visual-planner.js";
import {
  DeterministicVeronicaImagePromptCompiler,
  InMemoryVeronicaImagePromptCompilationCache,
} from "./veronica-image-prompt-compiler.js";
import { finalizeSemanticPlanHash, stableHash } from "./positioning-visual-semantics.js";
import {
  deriveVeronicaSemanticProposition,
  renderVeronicaVisibleThesis,
  visualTreatmentFromProposition,
} from "./veronica-semantic-quality.js";
import {
  CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
  CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION,
  CANONICAL_VISUAL_PLANNING_CONFIGURATION_VERSION,
  VERONICA_CONTENT_PACK_2_ADAPTER_VERSION,
} from "./veronica-content-pack-2-ingestion.js";
import {
  FixtureEpisodeSequenceJudge,
  sourceGroundedPassBeatJudgement,
  sourceGroundedPassJudgement,
  sourceGroundedPassSequence,
  type SourceGroundedSceneJudgePort,
  type SourceGroundedVisualQaPolicy,
} from "./source-grounded-visual-qa.js";
import { sourceGroundedQaExecutionPolicy } from "./source-grounded-qa-scheduler.js";

const qaEpisodeId = "fixture-admission-ready";
const qaEpisodeFiles = [
  "source/pre-image-semantic-plan.v1.json",
  "locales/en/short/scene-plan.json",
  "locales/en/short/script.md",
  "locales/en/short/audio/narration.wav",
  "locales/en/short/canonical-timing.v1.json",
  "locales/en/short/image-prompts/provider-image-prompts.v1.json",
  "shared/source-grounded-qa-admission.v1.json",
] as const;

const fixtureQaPolicy: SourceGroundedVisualQaPolicy = {
  enabled: true,
  // Exercise the production QA identity contract with a local fixture transport;
  // the synthetic artifact set itself is built through current production planners.
  policyIdentity: "veronica-source-grounded-openai-policy.v3:gpt-5.4-mini:low:gpt-5.6-terra:medium:gpt-5.6-sol:medium",
  sceneJudge: { model: "gpt-5.4-mini", reasoningEffort: "low", maxOutputTokens: 800 },
  escalation: { model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 1_800 },
  finalAdjudication: { model: "gpt-5.6-sol", reasoningEffort: "medium", maxOutputTokens: 1_200 },
  remediationAdvisor: { model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 1_200 },
  sequenceJudge: { model: "gpt-5.4-mini", reasoningEffort: "low", maxOutputTokens: 1_000 },
  maxRemediationRounds: 1,
  remediateReview: true,
  execution: sourceGroundedQaExecutionPolicy("INTERACTIVE", { providerMode: "FIXTURE" }),
};

const sceneCompleteFixtureNarration = [
  "The buyer ignores a broad offer when no specific relevant fit is visible in that situation.",
  "The buyer ignores a claimed expertise title and inspects one concrete work example as proof.",
  "The buyer compares that work example with the market problem and its matching solution.",
  "The expert arranges a method and matching package only after the customer problem is clear.",
  "The buyer recognizes their own situation when frustrations, priorities, and prior attempts are arranged into context.",
  "The buyer groups consistent proof signals around one professional until recognition accumulates into a memorable expertise association.",
  "The buyer can recommend a professional to a peer when that professional's concrete proof clearly fits the problem.",
].join("\n\n");

let readyQaTemplateRoot: string;

function oneSecondPcmWav(): Buffer {
  const sampleRate = 8_000;
  const dataSize = sampleRate * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

async function buildCurrentSyntheticVisualPlan(
  outputDir: string,
  episodeId = qaEpisodeId,
) {
  const sourceSha256 = createHash("sha256").update(sceneCompleteFixtureNarration).digest("hex");
  const sourceDocument = {
    locale: "en" as const,
    sourcePath: "fixtures/current-admission-source.md",
    sourceSha256,
    narration: sceneCompleteFixtureNarration,
  };
  const canonical = await buildVeronicaCanonicalVisualPlan({
    outputDir,
    plannerInput: {
      schemaVersion: CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION,
      sourceEpisode: {
        schemaVersion: CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
        ingestionAdapterVersion: VERONICA_CONTENT_PACK_2_ADAPTER_VERSION,
        sourcePackId: "veronica-current-admission-fixture",
        episodeId,
        authoredEpisodeKey: episodeId,
        canonicalSlug: episodeId,
        title: "Visible Evidence Makes Expertise Clear",
        contentProfileId: "veronicabenini",
        format: "short",
        localeSources: [sourceDocument],
        sourceRevisionHash: stableHash(sourceDocument),
        declaredReusableAssets: [],
      },
      locale: "en",
      narration: sourceDocument,
      planningConfiguration: {
        schemaVersion: CANONICAL_VISUAL_PLANNING_CONFIGURATION_VERSION,
        // Seven supported narration units should materialize as seven total
        // visuals (hook included), rather than manufacturing an eighth scene.
        targetWordsPerMinute: 105,
        imageProviderModel: "provider-unbound:text-free-canonical-v1",
        rendererVersion: "ffmpeg-event-compiler.v1",
      },
      declaredReusableAssets: [],
      visualPlanOverride: null,
    },
  });
  const narrationByScene = sceneCompleteFixtureNarration.split(/\n\s*\n/u);
  if (canonical.scenes.length !== narrationByScene.length) {
    throw new Error("FIXTURE_CURRENT_PLANNER_SCENE_COUNT_MISMATCH");
  }
  const scenes = canonical.scenes.map((scene, index) => {
    const narrationAnchor = narrationByScene[index]!;
    const sourceScene = { ...scene, narrationAnchor };
    const proposition = deriveVeronicaSemanticProposition({ scene: sourceScene, narration: narrationAnchor });
    const projected = visualTreatmentFromProposition({
      scene: { ...sourceScene, semanticProposition: proposition },
      proposition,
      preserveEnvironment: false,
    });
    const { treatmentHash: _staleTreatmentHash, ...previousTreatment } = scene.treatment;
    const treatmentWithoutHash = { ...previousTreatment, ...projected };
    const treatment = {
      ...treatmentWithoutHash,
      treatmentHash: stableHash(treatmentWithoutHash),
    };
    const overrideHash = stableHash({ sceneId: scene.sceneId, proposition, projected });
    return {
      ...scene,
      narrationAnchor,
      visibleThesis: renderVeronicaVisibleThesis(proposition),
      newInformation: narrationAnchor,
      treatment,
      semanticProposition: proposition,
      editorialTreatmentOverride: {
        overrideHash,
        appliedAt: "2000-01-01T00:00:00.000Z",
      },
    };
  });
  const base = {
    ...canonical,
    scenes,
    canonicalImagePlanHash: stableHash(scenes.map((scene) => ({
      sceneId: scene.sceneId,
      treatmentHash: scene.treatment.treatmentHash,
      propositionHash: scene.semanticProposition.propositionHash,
    }))),
    semanticPlanCacheKey: stableHash({
      sourceRevisionHash: canonical.sourceRevisionHash,
      scenes: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        treatmentHash: scene.treatment.treatmentHash,
        propositionHash: scene.semanticProposition.propositionHash,
      })),
    }),
  };
  return finalizeSemanticPlanHash({ ...base, planHash: canonical.planHash });
}

async function buildReadyQaTemplate(): Promise<string> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-ready-admission-template-"));
  const episodeRoot = path.join(workspaceRoot, qaEpisodeId);
  const fixtureReferenceRoot = path.join(workspaceRoot, "content-packs", "veronica-character-reference-v1");
  await fs.mkdir(path.dirname(fixtureReferenceRoot), { recursive: true });
  await fs.symlink(path.resolve("content-packs/veronica-character-reference-v1"), fixtureReferenceRoot, "dir");
  await fs.mkdir(path.join(episodeRoot, "source"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages", "short"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "locales", "en", "short", "audio"), { recursive: true });
  const currentPlan = await buildCurrentSyntheticVisualPlan(path.join(workspaceRoot, "current-planner"));
  const repeatedPlan = await buildCurrentSyntheticVisualPlan(path.join(workspaceRoot, "current-planner-repeat"));
  if (currentPlan.planHash !== repeatedPlan.planHash || currentPlan.semanticPlanCacheKey !== repeatedPlan.semanticPlanCacheKey) {
    throw new Error("FIXTURE_CURRENT_PLANNER_NONDETERMINISTIC");
  }
  await fs.writeFile(path.join(episodeRoot, "source", "visual-plan.json"), `${JSON.stringify(currentPlan, null, 2)}\n`);
  await fs.writeFile(path.join(episodeRoot, "languages", "short", "script-en.md"), sceneCompleteFixtureNarration);
  await fs.writeFile(path.join(episodeRoot, "locales", "en", "short", "audio", "narration.wav"), oneSecondPcmWav());
  await preparePositioningProductionEpisode({
    workspaceRoot,
    episodeId: qaEpisodeId,
    language: "en",
    variant: "short",
    imagePromptCompiler: {
      strategy: "deterministic-v1",
      compiler: new DeterministicVeronicaImagePromptCompiler(),
      cache: new InMemoryVeronicaImagePromptCompilationCache(),
      model: { model: "deterministic-template", reasoningEffort: "none", maxOutputTokens: 0 },
    },
  });
  const generatedPlan = positioningProductionPlanSchema.parse(JSON.parse(
    await fs.readFile(path.join(episodeRoot, "source", "pre-image-semantic-plan.v1.json"), "utf8"),
  ));
  const generatedScenes = generatedPlan.scenes;
  if (generatedScenes.length !== 7 || new Set(generatedScenes.map((scene) => scene.narrationAnchor)).size !== generatedScenes.length) {
    throw new Error("FIXTURE_SCENE_NARRATION_COVERAGE_INCOMPLETE");
  }
  if (generatedScenes.some((scene) => !scene.semanticProposition?.evidenceSpans.every((span) => sceneCompleteFixtureNarration.includes(span.text)))) {
    throw new Error("FIXTURE_SOURCE_SPAN_NOT_IN_NARRATION");
  }
  if (!isVeronicaDeterministicVisualQaEligible(generatedPlan as Parameters<typeof isVeronicaDeterministicVisualQaEligible>[0])) {
    throw new Error("FIXTURE_NOT_READY_FOR_ADMISSION");
  }
  await establishVeronicaSourceGroundedQaAdmission({
    workspaceRoot,
    episodeId: qaEpisodeId,
    language: "en",
    variant: "short",
    sourceGroundedVisualQa: {
      policy: fixtureQaPolicy,
      primaryJudge: fixtureQaJudge({ count: 0 }),
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
    },
  });
  return workspaceRoot;
}

async function copyReadyQaEpisode(): Promise<string> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-qa-admission-"));
  for (const relativePath of qaEpisodeFiles) {
    const source = path.join(readyQaTemplateRoot, qaEpisodeId, relativePath);
    const target = path.join(workspaceRoot, qaEpisodeId, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  return workspaceRoot;
}

function fixtureQaJudge(calls: { count: number }): SourceGroundedSceneJudgePort {
  const outputFor = (payload: Parameters<SourceGroundedSceneJudgePort["judge"]>[0]["payload"]) =>
    "beatId" in payload
      ? sourceGroundedPassBeatJudgement()
      : sourceGroundedPassJudgement();
  return {
    async judge({ payload }) {
      calls.count += 1;
      return {
        output: outputFor(payload),
        requestId: `fixture-${calls.count}`,
      };
    },
    async judgeBatch({ items }) {
      calls.count += 1;
      return {
        outputs: items.map((item) => ({
          itemId: item.itemId,
          output: outputFor(item.payload),
        })),
        requestId: `fixture-batch-${calls.count}`,
      };
    },
  };
}

async function runCopiedQaEpisode(workspaceRoot: string, calls: { count: number }) {
  return runExistingVeronicaSourceGroundedPreImageQa({
    workspaceRoot,
    episodeId: qaEpisodeId,
    language: "en",
    variant: "short",
    sourceGroundedVisualQa: {
      policy: fixtureQaPolicy,
      primaryJudge: fixtureQaJudge(calls),
      sequenceJudge: new FixtureEpisodeSequenceJudge(sourceGroundedPassSequence()),
    },
  });
}

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
  beforeAll(async () => {
    readyQaTemplateRoot = await buildReadyQaTemplate();
  }, 60_000);

  it("keeps QA-only execution read-only for canonical artifacts and records the admitted identity", async () => {
    const workspaceRoot = await copyReadyQaEpisode();
    const episodeRoot = path.join(workspaceRoot, qaEpisodeId);
    const protectedPaths = qaEpisodeFiles.map((relativePath) => path.join(episodeRoot, relativePath));
    const before = await Promise.all(protectedPaths.map((candidate) => fs.readFile(candidate)));
    const writes = vi.spyOn(fs, "writeFile");
    const calls = { count: 0 };

    const result = await runCopiedQaEpisode(workspaceRoot, calls);

    const after = await Promise.all(protectedPaths.map((candidate) => fs.readFile(candidate)));
    expect(after).toEqual(before);
    expect(writes.mock.calls
      .map(([candidate]) => String(candidate))
      .filter((candidate) => /^(?:pre-image-semantic-plan|visual-beats|provider-image-prompts|source-grounded-qa-admission)/u.test(path.basename(candidate)))
    ).toEqual([]);
    writes.mockRestore();
    const admission = JSON.parse(await fs.readFile(result.admissionPath, "utf8"));
    const qa = JSON.parse(await fs.readFile(result.qaPath, "utf8"));
    expect(qa.admissionIdentity).toEqual(admission);
    expect(result.admissionIdentity).toEqual(admission);
    expect(calls.count).toBeGreaterThan(0);
  }, 60_000);

  it("rematerializes reviewed treatments before TTS without requiring a narration WAV", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-pre-tts-remediation-"));
    const episodeRoot = path.join(workspaceRoot, qaEpisodeId);
    await fs.cp(path.join(readyQaTemplateRoot, qaEpisodeId), episodeRoot, { recursive: true });
    const referenceRoot = path.join(workspaceRoot, "content-packs", "veronica-character-reference-v1");
    await fs.mkdir(path.dirname(referenceRoot), { recursive: true });
    await fs.symlink(path.resolve("content-packs/veronica-character-reference-v1"), referenceRoot, "dir");
    await fs.rm(path.join(episodeRoot, "locales", "en", "short", "audio", "narration.wav"));
    const planPath = path.join(episodeRoot, "source", "pre-image-semantic-plan.v1.json");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    const overridePath = path.join(workspaceRoot, "override.json");
    await fs.writeFile(overridePath, `${JSON.stringify({
      schemaVersion: "veronica-editorial-treatment-overrides.v1",
      basePlanHash: plan.planHash,
      scenes: [{
        sceneId: plan.scenes[0].sceneId,
        treatment: { lighting: "soft natural editorial daylight" },
      }],
    }, null, 2)}\n`);

    const result = await remediateExistingVeronicaPreImagePlan({
      workspaceRoot,
      episodeId: qaEpisodeId,
      overridePath,
      imagePromptCompiler: {
        strategy: "deterministic-v1",
        compiler: new DeterministicVeronicaImagePromptCompiler(),
        cache: new InMemoryVeronicaImagePromptCompilationCache(),
        model: { model: "deterministic-template", reasoningEffort: "none", maxOutputTokens: 0 },
      },
    });

    expect(result.retimedLocales).toEqual([]);
    const prompts = JSON.parse(await fs.readFile(path.join(episodeRoot, "locales", "en", "short", "image-prompts", "provider-image-prompts.v1.json"), "utf8"));
    expect(prompts.provenance.selectedAudioHash).toBeNull();
  }, 60_000);

  it.each([
    ["semantic plan", "VERONICA_QA_ADMISSION_PRECONDITION_FAILED", async (episodeRoot: string) => {
      const target = path.join(episodeRoot, "source", "pre-image-semantic-plan.v1.json");
      const value = JSON.parse(await fs.readFile(target, "utf8"));
      value.planHash = "f".repeat(64);
      await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    }],
    ["semantic beat artifact", "VERONICA_QA_ADMISSION_PRECONDITION_FAILED", async (episodeRoot: string) => {
      const target = path.join(episodeRoot, "source", "pre-image-semantic-plan.v1.json");
      const value = JSON.parse(await fs.readFile(target, "utf8"));
      value.visualBeatPlan.beatPlanHash = "e".repeat(64);
      await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    }],
    ["provider prompt projection", "VERONICA_QA_ADMISSION_IDENTITY_MISMATCH", async (episodeRoot: string) => {
      const target = path.join(episodeRoot, "locales", "en", "short", "image-prompts", "provider-image-prompts.v1.json");
      const value = JSON.parse(await fs.readFile(target, "utf8"));
      value.artifactHash = "d".repeat(64);
      await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    }],
    ["source narration", "VERONICA_QA_ADMISSION_IDENTITY_MISMATCH", async (episodeRoot: string) => {
      const target = path.join(episodeRoot, "locales", "en", "short", "script.md");
      await fs.appendFile(target, "\n");
    }],
    ["canonical timing", "VERONICA_QA_ADMISSION_IDENTITY_MISMATCH", async (episodeRoot: string) => {
      const target = path.join(episodeRoot, "locales", "en", "short", "canonical-timing.v1.json");
      const value = JSON.parse(await fs.readFile(target, "utf8"));
      value.immutableQaAdmissionDrift = true;
      await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
    }],
    ["selected audio", "VERONICA_QA_ADMISSION_IDENTITY_MISMATCH", async (episodeRoot: string) => {
      const audioPath = path.join(episodeRoot, "locales", "en", "short", "audio", "narration.wav");
      const audio = Buffer.concat([await fs.readFile(audioPath), Buffer.from([0])]);
      await fs.writeFile(audioPath, audio);
      const selectedAudioHash = createHash("sha256").update(audio).digest("hex");
      const timingPath = path.join(episodeRoot, "locales", "en", "short", "canonical-timing.v1.json");
      const timing = JSON.parse(await fs.readFile(timingPath, "utf8"));
      timing.selectedAudioHash = selectedAudioHash;
      await fs.writeFile(timingPath, `${JSON.stringify(timing, null, 2)}\n`);
      const promptsPath = path.join(episodeRoot, "locales", "en", "short", "image-prompts", "provider-image-prompts.v1.json");
      const prompts = JSON.parse(await fs.readFile(promptsPath, "utf8"));
      prompts.provenance.selectedAudioHash = selectedAudioHash;
      await fs.writeFile(promptsPath, `${JSON.stringify(prompts, null, 2)}\n`);
    }],
  ])("blocks %s admission drift before any judge dispatch", async (_name, code, mutate) => {
    const workspaceRoot = await copyReadyQaEpisode();
    await mutate(path.join(workspaceRoot, qaEpisodeId));
    const calls = { count: 0 };

    await expect(runCopiedQaEpisode(workspaceRoot, calls)).rejects.toMatchObject({
      code,
    });
    expect(calls.count).toBe(0);
  });

  it("blocks paid source-grounded QA until every deterministic readiness gate passes", () => {
    const source = plan();
    expect(
      isVeronicaDeterministicVisualQaEligible({
        ...source,
        semanticQuality: { status: "FAIL" },
        providerReadiness: { status: "PASS" },
      } as Parameters<typeof isVeronicaDeterministicVisualQaEligible>[0]),
    ).toBe(false);
    expect(
      isVeronicaDeterministicVisualQaEligible({
        ...source,
        semanticQuality: { status: "PASS" },
        providerReadiness: { status: "PASS" },
      } as Parameters<typeof isVeronicaDeterministicVisualQaEligible>[0]),
    ).toBe(false);
    expect(
      isVeronicaDeterministicVisualQaEligible({
        ...source,
        semanticQuality: { status: "PASS" },
        providerReadiness: { status: "PASS" },
        visualBeatPlan: {
          policyVersion: "fixture+veronica-visual-beat-planner.v4",
          quality: {
            status: "PASS",
            sequenceDiversity: {
              policyVersion: "veronica-sequence-diversity-policy.v2",
              status: "PASS",
            },
          },
        },
      } as Parameters<typeof isVeronicaDeterministicVisualQaEligible>[0]),
    ).toBe(true);
  });

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

  it("uses the primary provider asset consistently for a multi-asset scene wrapper", () => {
    const source = plan();
    const primary = source.assets[0]!;
    const result = compilePositioningProductionScenePlan({
      episodeId: "generic-multi-asset",
      narration: "One scene establishes the cause. Another scene shows the result.",
      plan: positioningProductionPlanSchema.parse({
        ...source,
        assets: [
          ...source.assets,
          { ...primary, prompt: "Text-free 9:16 secondary provider asset." },
        ],
      }),
    });

    expect(result.scenes[0]?.imagePrompt).toBe(primary.prompt);
  });

  it("writes the shared scene plan and locale/variant script used by existing pipelines", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-production-"));
    const episodeId = "l01-s01-being-good-isnt-enough";
    const episodeDir = path.join(workspaceRoot, episodeId);
    const fixtureReferenceRoot = path.join(
      workspaceRoot,
      "content-packs",
      "veronica-character-reference-v1",
    );
    await fs.mkdir(path.dirname(fixtureReferenceRoot), { recursive: true });
    await fs.symlink(
      path.resolve("content-packs/veronica-character-reference-v1"),
      fixtureReferenceRoot,
      "dir",
    );
    const currentPlan = await buildCurrentSyntheticVisualPlan(
      path.join(workspaceRoot, "current-planner"),
      episodeId,
    );
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "languages", "short"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "source", "visual-plan.json"),
      `${JSON.stringify(currentPlan, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(episodeDir, "languages", "short", "script-en.md"),
      sceneCompleteFixtureNarration,
    );
    const result = await preparePositioningProductionEpisode({
      workspaceRoot,
      episodeId,
      language: "en",
      variant: "short",
      imagePromptCompiler: {
        strategy: "deterministic-v1",
        compiler: new DeterministicVeronicaImagePromptCompiler(),
        cache: new InMemoryVeronicaImagePromptCompilationCache(),
        model: {
          model: "deterministic-template",
          reasoningEffort: "none",
          maxOutputTokens: 0,
        },
      },
    });
    expect(result.sceneCount).toBe(currentPlan.scenes.length);
    await expect(fs.stat(result.scenePlanPath)).resolves.toBeDefined();
    await expect(
      fs.readFile(path.join(episodeDir, "locales", "en", "short", "script.md"), "utf8"),
    ).resolves.toBe(sceneCompleteFixtureNarration);
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8")) as {
      sourceMetadata: Record<string, unknown>;
      artifacts: readonly { readonly path: string; readonly kind: string }[];
      scenePlan: ReturnType<typeof compilePositioningProductionScenePlan>;
    };
    expect(manifest.sourceMetadata).toMatchObject({
      genre: "veronicabenini",
      positioningPlanHash: currentPlan.planHash,
      syntheticCreatorLikenessAllowed: false,
      providerImagePromptsArtifactPath: "locales/en/short/image-prompts/provider-image-prompts.v1.json",
      providerImagePromptsMarkdownPath: "locales/en/short/image-prompts/provider-image-prompts.md",
    });
    const promptArtifact = JSON.parse(await fs.readFile(result.providerImagePromptsJsonPath, "utf8")) as {
      readonly promptCount: number;
      readonly prompts: readonly { readonly imagePrompt: string; readonly sameSnapshot: boolean }[];
    };
    expect(promptArtifact.promptCount).toBe(result.sceneCount);
    expect(promptArtifact.prompts.every((prompt) => prompt.sameSnapshot)).toBe(true);
    await expect(fs.readFile(result.providerImagePromptsMarkdownPath, "utf8")).resolves.toContain(promptArtifact.prompts[0]!.imagePrompt);
    expect(manifest.artifacts.filter((artifact) => artifact.kind === "provider-image-prompts").map((artifact) => artifact.path)).toEqual([
      "locales/en/short/image-prompts/provider-image-prompts.v1.json",
      "locales/en/short/image-prompts/provider-image-prompts.md",
    ]);
    const canonical = JSON.parse(await fs.readFile(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), "utf8"));
    expect(positioningScenePlanMaterializationReasons({ plan: canonical, scenePlan: manifest.scenePlan })).toEqual([]);
    expect(manifest.scenePlan.scenes[0]).toMatchObject({
      subject: canonical.scenes[0].treatment.subjectRequirement,
      action: canonical.scenes[0].treatment.action,
      setting: canonical.scenes[0].treatment.environment,
      composition: canonical.scenes[0].treatment.composition,
      cameraFraming: canonical.scenes[0].treatment.camera,
      imagePrompt: canonical.assets[0].prompt,
    });
    expect(canonical.scenes).toHaveLength(7);
    expect(new Set(canonical.scenes.map((scene: { narrationAnchor: string }) => scene.narrationAnchor))).toHaveLength(7);
    expect(canonical.scenes.every((scene: { semanticProposition?: { evidenceSpans: readonly { text: string }[] } }) =>
      scene.semanticProposition?.evidenceSpans.every((span) => sceneCompleteFixtureNarration.includes(span.text)) === true,
    )).toBe(true);
    expect(canonical.visualBeatPlan.quality.sequenceDiversity.status).not.toMatch(/BLOCK|REVIEW_REQUIRED/u);
    expect(canonical.assets.every((asset: { promptCompilation?: { input?: { treatment?: { compositionHierarchy?: { primary: readonly string[]; peripheral: readonly string[] } } } } }) => {
      const hierarchy = asset.promptCompilation?.input?.treatment?.compositionHierarchy;
      return hierarchy !== undefined && hierarchy.primary.every((clause) => !hierarchy.peripheral.includes(clause));
    })).toBe(true);

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
    const finalPlan = JSON.parse(await fs.readFile(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), "utf8")) as {
      format: string;
      cadenceMetrics: { targetRangeSeconds: readonly number[] };
      scenes: readonly {
        narrationAnchor: string;
        startMs: number;
        durationMs: number;
        stateComplexity: string;
        semanticProposition: {
          propositionHash: string;
          actorRole: string;
          stateRelation: string;
          evidenceSpans: readonly { text: string }[];
        };
      }[];
    };
    expect(result.sceneCount).toBe(2);
    expect(finalPlan.format).toBe("long");
    expect(finalPlan.cadenceMetrics.targetRangeSeconds).toEqual([6, 15]);
    expect(finalPlan.scenes.map((scene) => scene.narrationAnchor)).toEqual([
      "A buyer sees evidence.",
      "The expert makes a clearer choice.",
    ]);
    expect(finalPlan.scenes.map((scene) => [scene.startMs, scene.durationMs])).toEqual([
      [0, 5_000],
      [5_000, 5_000],
    ]);
    expect(finalPlan.scenes.map((scene) => scene.stateComplexity)).toEqual([
      "SINGLE_STATE",
      "SINGLE_STATE",
    ]);
    expect(finalPlan.scenes.map((scene) => scene.semanticProposition.stateRelation)).toEqual([
      "STABLE",
      "STABLE",
    ]);
    expect(finalPlan.scenes.map((scene) => scene.semanticProposition.actorRole)).toEqual([
      "buyer",
      "expert",
    ]);
    expect(finalPlan.scenes.map((scene) => scene.semanticProposition.evidenceSpans.map((span) => span.text))).toEqual([
      ["A buyer sees evidence."],
      ["The expert makes a clearer choice."],
    ]);
    expect(new Set(finalPlan.scenes.map((scene) => scene.semanticProposition.propositionHash))).toHaveLength(2);
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
