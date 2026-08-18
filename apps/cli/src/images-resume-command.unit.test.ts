import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { hashFile, hashText } from "@mediaforge/shared";
import { createPreImageReviewPack } from "./pre-image-review-pack.js";

let workspaceDir = "";
const imageGenerationMocks = vi.hoisted(() => ({
  generateEpisodeImages: vi.fn(),
}));
const storyLocalizationMocks = vi.hoisted(() => ({
  assertScriptScoreGate: vi.fn(),
}));

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir,
  })),
}));

vi.mock("@mediaforge/image-generation", async () => {
  const actual = await vi.importActual<
    typeof import("@mediaforge/image-generation")
  >("@mediaforge/image-generation");
  return {
    ...actual,
    generateEpisodeImages: imageGenerationMocks.generateEpisodeImages,
  };
});

vi.mock("@mediaforge/story-localization", async () => {
  const actual = await vi.importActual<
    typeof import("@mediaforge/story-localization")
  >("@mediaforge/story-localization");
  return {
    ...actual,
    assertScriptScoreGate: storyLocalizationMocks.assertScriptScoreGate,
  };
});

const {
  adoptVeronicaDeterministicDiagramPrototype,
  assertImageProviderCallCeiling,
  assertVeronicaHierarchicalImageReadiness,
  commandImagesResume,
  loadOrBootstrapEpisodeManifest,
  materializeVeronicaImageAssetScenePlan,
  materializeVeronicaRemediationScenePlan,
  reviewExistingVeronicaImages,
  resolveVeronicaImageAssetSelection,
} =
  await import("./images-resume-command.js");

function makeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "011-the-black-eyed-children",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "Two children stood outside the door.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "establish",
        textRequirement: { required: false },
        subject: "two children",
        action: "stand outside the door",
        setting: "a frozen motel hallway",
        composition: "wide shot with the door centered",
        cameraFraming: "wide",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      },
    ],
  });
}

function makeReconciliationInventory(input: {
  episodeDir: string;
  imagePath: string;
  currentImageSha256: string;
  manifestImageSha256: string;
  debugLogPath: string;
  debugLogSha256: string;
  semanticPromptMateriallyChanged?: boolean;
}) {
  return {
    schemaVersion: "veronica-image-reconciliation-inventory.v1" as const,
    episodeId: path.basename(input.episodeDir),
    generatedAt: "2026-08-17T00:00:00Z",
    requiredAssetCount: 1,
    entries: [{
      assetId: "scene-001",
      sceneId: "scene-001",
      currentProviderPromptHash: "provider-prompt-hash",
      currentSemanticInputHash: "a".repeat(64),
      currentCanonicalFinalPromptHash: hashText("provider prompt"),
      imagePath: input.imagePath,
      currentImageSha256: input.currentImageSha256,
      manifestImageSha256: input.manifestImageSha256,
      manifestPromptHash: "prompt-hash",
      postImageQaInputHash: "qa-input-hash",
      postImageQaResult: {
        verdict: "BLOCK" as const,
        semanticBriefHash: "a".repeat(64),
        finalPromptHash: hashText("provider prompt"),
        evaluatorModel: "vision-test",
        evaluatorConfigHash: "config-hash",
        schemaVersion: "veronica-post-generation-visual-review.v1",
      },
      generationRequestId: "request-1",
      generationAttempt: 2,
      generationRevision: "2026-08-17T00:00:00Z",
      generationDebugLogPath: input.debugLogPath,
      generationDebugLogSha256: input.debugLogSha256,
      generationDebugTimestamp: "2026-08-17T00:00:00Z",
      bytesActuallyChanged: true,
      semanticPromptMateriallyChanged: input.semanticPromptMateriallyChanged ?? false,
      classification: (input.semanticPromptMateriallyChanged ? "C" : "E") as "C" | "E",
      safeReuse: (input.semanticPromptMateriallyChanged ? "no" : "qa-rerun-then-decide") as "no" | "qa-rerun-then-decide",
      retry: {
        providerRequests: 2,
        successfulRequests: 2,
        providerFailures: 0,
        semanticQaFailures: 1,
        technicalFailures: 0,
        duplicatePromptRequests: 0,
        acceptedAttemptNumber: null,
        acceptedImageHashes: [],
        acceptedPixelsLaterInvalidated: false,
      },
    }],
    summary: {
      manifestFileMatches: 0,
      manifestFileMismatches: 1,
      currentPassPixels: 0,
      classifications: {
        CURRENT: 0,
        A: 0,
        B: 0,
        C: input.semanticPromptMateriallyChanged ? 1 : 0,
        D: 0,
        E: input.semanticPromptMateriallyChanged ? 0 : 1,
      },
      historicalProviderRequests: 2,
      duplicatePromptRequests: 0,
    },
  };
}

describe("images resume command", () => {
  it("adopts one generalized deterministic visual resumably without an image-provider call", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-diagram-adoption-"));
    const scene = makeScenePlan();
    const imagePath = path.join(episodeDir, "canonical.png");
    await fs.writeFile(imagePath, "failed-provider-pixels");
    const failedProviderImageSha256 = await hashFile(imagePath);
    const finalPrompt = "failed provider prompt";
    const manifestDir = path.join(episodeDir, "state", "image-generation", "manifests");
    await fs.mkdir(manifestDir, { recursive: true });
    const sceneManifestPath = path.join(manifestDir, "scene-001.json");
    await fs.writeFile(sceneManifestPath, JSON.stringify({
      sceneId: "scene-001",
      promptVersion: 2,
      finalPrompt,
      promptHash: hashText(finalPrompt),
      materialDifferencesFromPrevious: [],
      characterIds: [],
      referenceImages: [],
      model: "gpt-image-2",
      size: "864x1536",
      quality: "low",
      outputPath: imagePath,
      outputSha256: failedProviderImageSha256,
      status: "generated",
      attempts: 1,
    }));
    const previousManifestSha256 = await hashFile(sceneManifestPath);
    const semanticPlanPath = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
    await fs.mkdir(path.dirname(semanticPlanPath), { recursive: true });
    await fs.writeFile(semanticPlanPath, "semantic-plan");
    const sourceSha256 = "c".repeat(64);
    const brief = {
      contentId: "01a-test",
      assetId: "scene-001",
      locale: "en",
      variant: "short" as const,
      canonicalNarration: "Subtract each variable cost from one sale.",
      spokenMeaning: "costs reduce retained value",
      viewerTakeaway: "one sale leaves a smaller remainder",
      narrativePurpose: "explain",
      visualRelationship: "sale minus costs leaves a remainder",
      mustShow: ["one sale", "cost removals", "one remainder"],
      mustNotShow: ["text"],
      relevanceAnchors: ["sale", "cost"],
      genericDriftRisks: ["decoration"],
      finalPrompt,
      visualDirectionRules: ["show causality"],
      semanticBriefHash: "a".repeat(64),
      visualDirectionVersion: "veronica.v1",
    };
    const qaDir = path.join(
      episodeDir,
      "state",
      "image-generation",
      "veronica-post-generation-visual-qa",
    );
    await fs.mkdir(qaDir, { recursive: true });
    const failedReviewPath = path.join(qaDir, "failed.json");
    await fs.writeFile(failedReviewPath, JSON.stringify({
      schemaVersion: "veronica-post-generation-visual-review.v1",
      contentId: brief.contentId,
      assetId: brief.assetId,
      imageFingerprint: failedProviderImageSha256,
      semanticBriefHash: brief.semanticBriefHash,
      finalPromptHash: hashText(finalPrompt),
      evaluatorModel: "gpt-5.4-mini",
      evaluatorConfigHash: "b".repeat(64),
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-12T00:00:00Z",
      semanticAlignmentScore: 0.8,
      instantReadScore: 0.7,
      buyerActionVisibilityScore: 0.8,
      causeEffectVisibilityScore: 0.8,
      narrationSupportScore: 0.8,
      visualQualityScore: 0.8,
      mustShowCoverage: "partial",
      mustNotShowViolations: [],
      occupationProxyDrift: "none",
      abstractPropDrift: "warning",
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
      failedRequirements: ["one remainder"],
      successfulRequirements: ["one sale"],
      regenerationInstructions: ["show one smaller remainder"],
    }));
    const failedProviderReviewSha256 = await hashFile(failedReviewPath);
    const adjacentImageSha256 = "e".repeat(64);
    const adjacentReviewPath = path.join(qaDir, "adjacent-approved.json");
    await fs.writeFile(adjacentReviewPath, JSON.stringify({
      schemaVersion: "veronica-post-generation-visual-review.v1",
      contentId: brief.contentId,
      assetId: "scene-002",
      imageFingerprint: adjacentImageSha256,
      semanticBriefHash: "f".repeat(64),
      finalPromptHash: "1".repeat(64),
      evaluatorModel: "gpt-5.4-mini",
      evaluatorConfigHash: "b".repeat(64),
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-12T00:00:00Z",
      semanticAlignmentScore: 0.9,
      instantReadScore: 0.9,
      buyerActionVisibilityScore: 0.8,
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
      successfulRequirements: ["adjacent thesis"],
      regenerationInstructions: [],
    }));
    const approvedAdjacentReviewSha256 = await hashFile(adjacentReviewPath);
    const packDir = path.join(episodeDir, "review-packs", "pre-image", "en-short", "run-test");
    const prototypesDir = path.join(packDir, "prototypes");
    await fs.mkdir(prototypesDir, { recursive: true });
    const reviewManifestPath = path.join(packDir, "review-manifest.json");
    const humanApprovalPath = path.join(packDir, "human-pre-image-approval.v1.json");
    await fs.writeFile(reviewManifestPath, "review-manifest");
    await fs.writeFile(humanApprovalPath, "human-approval");
    const decisionPath = path.join(packDir, "human-visual-encoding-decision.v1.json");
    await fs.writeFile(decisionPath, JSON.stringify({
      schemaVersion: "veronica-human-visual-encoding-decision.v1",
      episodeId: "01a-test",
      language: "en",
      variant: "short",
      sceneId: "scene-001",
      visualBeatId: "01a-test-S02-B01",
      decision: "approved",
      reviewer: "operator",
      authorizationReference: "operator-message",
      approvedAt: "2026-08-12T00:00:00Z",
      bindings: {
        sourceSha256,
        semanticPlanSha256: await hashFile(semanticPlanPath),
        reviewManifestPath: path.relative(episodeDir, reviewManifestPath),
        reviewManifestSha256: await hashFile(reviewManifestPath),
        humanApprovalPath: path.relative(episodeDir, humanApprovalPath),
        humanApprovalSha256: await hashFile(humanApprovalPath),
        failedReviewSha256: failedProviderReviewSha256,
        rejectedImageSha256: failedProviderImageSha256,
        semanticBriefHash: brief.semanticBriefHash,
        failedPromptHash: hashText(finalPrompt),
      },
      approvedTreatment: {
        visualThesis: "One sale becomes one smaller remainder.",
        composition: "One continuous value path through four gates.",
        mustShow: ["one input", "four removals", "one remainder"],
        mustNotShow: ["text", "duplicate inputs"],
        promptInstructions: ["conserve visible material"],
      },
      scope: "Deterministic encoding only.",
    }));
    const svgPath = path.join(prototypesDir, "diagram.svg");
    const pngPath = path.join(prototypesDir, "diagram.png");
    await fs.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
    const pngBytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngBytes, 0);
    pngBytes.write("IHDR", 12, "ascii");
    pngBytes.writeUInt32BE(864, 16);
    pngBytes.writeUInt32BE(1536, 20);
    await fs.writeFile(pngPath, pngBytes);
    const prototypePath = path.join(prototypesDir, "prototype.json");
    await fs.writeFile(prototypePath, JSON.stringify({
      schemaVersion: "veronica-deterministic-visual-prototype.v1",
      episodeId: "01a-test",
      language: "en",
      variant: "short",
      sceneId: "scene-001",
      visualBeatId: "01a-test-S02-B01",
      status: "PENDING_HUMAN_MODALITY_REVIEW",
      canonicalAssetReplaced: false,
      createdAt: "2026-08-12T00:00:00Z",
      authorizationReference: "operator-message",
      provenance: {
        sourceSha256,
        semanticPlanSha256: await hashFile(semanticPlanPath),
        reviewManifestSha256: await hashFile(reviewManifestPath),
        failedProviderImageSha256,
        failedProviderReviewSha256,
        semanticBriefHash: brief.semanticBriefHash,
        approvedAdjacentImageSha256: adjacentImageSha256,
        approvedAdjacentReviewSha256,
      },
      artifacts: {
        svgPath: "prototypes/diagram.svg",
        svgSha256: await hashFile(svgPath),
        pngPath: "prototypes/diagram.png",
        pngSha256: await hashFile(pngPath),
        renderEngine: "test",
        width: 864,
        height: 1536,
        aspectRatio: "9:16",
      },
      semanticContract: {
        visualThesis: "One completed sale drains value while another order waits.",
        encodingFamily: "radial funnel-and-split",
        causalRelationship: "one sale drains while one prospective order waits",
        mustShow: ["one completed sale", "one remainder", "one withheld order"],
        mustNotShow: ["text", "portrait dominance"],
        materiallyDistinctFrom: [{
          sceneId: "scene-002",
          imageSha256: adjacentImageSha256,
          distinction: "radial funnel versus stepped path",
        }],
      },
      geometryContract: {
        unit: "equal-value-pellet",
        completedSaleInputUnits: 20,
        costDrainGroups: [5, 5, 5, 4],
        totalCostDrainUnits: 19,
        retainedRemainderUnits: 1,
        conservationEquation: "20 = 5 + 5 + 5 + 4 + 1",
        conservationVerified: true,
        completedSalePathCount: 1,
        withheldProspectiveOrderCount: 1,
        withheldProspectiveOrderExcludedFromCompletedSaleConservation: true,
      },
      compositionContract: {
        evidenceBounds: { x: 1, y: 1, width: 100, height: 100 },
        subtitleSafeRegion: { x: 1, y: 1200, width: 100, height: 100 },
        evidenceIntersectsSubtitleSafeRegion: false,
        palette: ["coral"],
        genericHumanAction: "one generic hand",
        portraitDominance: false,
      },
      localChecks: {
        nativeDimensions: "PASS",
        exactConservation: "PASS",
        singleCompletedSalePath: "PASS",
        singleWithheldProspectiveOrder: "PASS",
        subtitleSafeComposition: "PASS",
        materiallyDistinctFromS02B01: "PASS",
        svgTextElementsAbsent: "PASS",
        externalAssetsAbsent: "PASS",
        logosAndUiAbsent: "PASS",
        syntheticCreatorLikenessAbsent: "PASS",
        providerCalls: 0,
        paidQaCalls: 0,
      },
      scope: "Pending exact-hash adoption.",
    }));

    const adoptionInput = {
      episodeId: "01a-test",
      sourceSha256,
      episodeDir,
      scenePlan: scene,
      briefs: [brief],
      prototypeManifestPath: prototypePath,
      authorizationReference: "operator-authorized-cli-invocation:--adopt-veronica-diagram-prototype",
      variant: "short" as const,
    };
    const adopted = await adoptVeronicaDeterministicDiagramPrototype(adoptionInput);
    expect(adopted.imageSha256).toBe(await hashFile(pngPath));
    expect(await hashFile(imagePath)).toBe(adopted.imageSha256);
    expect(await hashFile(path.join(
      episodeDir,
      "state",
      "image-generation",
      "superseded-assets",
      `scene-001.${failedProviderImageSha256}.png`,
    ))).toBe(failedProviderImageSha256);
    expect(JSON.parse(await fs.readFile(sceneManifestPath, "utf8"))).toMatchObject({
      model: "deterministic-svg",
      quality: "deterministic",
      outputSha256: adopted.imageSha256,
      attempts: 0,
    });
    expect(JSON.parse(await fs.readFile(adopted.adoptionPath, "utf8"))).toMatchObject({
      status: "ADOPTED_PENDING_QA",
      bindings: { previousManifestSha256 },
      effects: { imageGenerationProviderCalls: 0, qaProviderCalls: 0, automaticRetries: 0 },
    });
    await expect(adoptVeronicaDeterministicDiagramPrototype(adoptionInput)).resolves.toEqual(adopted);

    const firstAdoptionSha256 = await hashFile(adopted.adoptionPath);
    const firstSceneManifestSha256 = await hashFile(sceneManifestPath);
    const firstSceneManifest = JSON.parse(
      await fs.readFile(sceneManifestPath, "utf8"),
    ) as { finalPrompt: string };
    const firstAdoptionFailurePath = path.join(qaDir, "first-adoption-failed.json");
    await fs.writeFile(firstAdoptionFailurePath, JSON.stringify({
      schemaVersion: "veronica-post-generation-visual-review.v1",
      contentId: brief.contentId,
      assetId: brief.assetId,
      imageFingerprint: adopted.imageSha256,
      semanticBriefHash: brief.semanticBriefHash,
      finalPromptHash: hashText(firstSceneManifest.finalPrompt),
      evaluatorModel: "gpt-5.4-mini",
      evaluatorConfigHash: "b".repeat(64),
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-12T00:00:00Z",
      semanticAlignmentScore: 0.84,
      instantReadScore: 0.78,
      buyerActionVisibilityScore: 0.81,
      causeEffectVisibilityScore: 0.86,
      narrationSupportScore: 0.73,
      visualQualityScore: 0.77,
      mustShowCoverage: "pass",
      mustNotShowViolations: [],
      occupationProxyDrift: "warning",
      abstractPropDrift: "none",
      genericBusinessStockDrift: "warning",
      passivePortraitDrift: "none",
      decorativeConceptDrift: "warning",
      textInImageViolation: false,
      syntheticVeronicaLikenessRisk: false,
      visibleBuyerDecision: true,
      visibleHumanAction: true,
      requiresNarrationToDecode: false,
      regenerationRequired: false,
      findings: [],
      failedRequirements: [],
      successfulRequirements: ["one sale", "one remainder"],
      regenerationInstructions: [],
    }));
    const svgV2Path = path.join(prototypesDir, "diagram-v2.svg");
    const pngV2Path = path.join(prototypesDir, "diagram-v2.png");
    await fs.writeFile(svgV2Path, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>');
    await fs.writeFile(pngV2Path, Buffer.concat([pngBytes, Buffer.from([1])]));
    const prototypeV2Path = path.join(prototypesDir, "prototype-v2.json");
    await fs.writeFile(prototypeV2Path, JSON.stringify({
      schemaVersion: "veronica-deterministic-visual-prototype.v2",
      episodeId: "01a-test",
      language: "en",
      variant: "short",
      sceneId: "scene-001",
      visualBeatId: "01a-test-HOOK-B04",
      status: "PENDING_EXACT_HASH_MODALITY_REVIEW",
      canonicalAssetReplaced: false,
      createdAt: "2026-08-12T00:01:00Z",
      authorizationReference: "operator-v2-message",
      provenance: {
        sourceSha256,
        semanticPlanSha256: await hashFile(semanticPlanPath),
        reviewManifestSha256: await hashFile(reviewManifestPath),
        currentSceneManifestSha256: firstSceneManifestSha256,
        currentAdoptionSha256: firstAdoptionSha256,
        failedCanonicalImageSha256: adopted.imageSha256,
        failedCanonicalReviewSha256: await hashFile(firstAdoptionFailurePath),
        semanticBriefHash: brief.semanticBriefHash,
        approvedAdjacentImageSha256: adjacentImageSha256,
        approvedAdjacentReviewSha256,
      },
      artifacts: {
        svgPath: "prototypes/diagram-v2.svg",
        svgSha256: await hashFile(svgV2Path),
        pngPath: "prototypes/diagram-v2.png",
        pngSha256: await hashFile(pngV2Path),
        renderEngine: "test",
        width: 864,
        height: 1536,
        aspectRatio: "9:16",
      },
      semanticContract: {
        narration: "More orders can make the problem bigger.",
        visualThesis: "One concrete order drains value while a matching order is stopped.",
        encodingFamily: "concrete-order radial funnel-and-split",
        causalRelationship: "one order drains while one matching order waits",
        mustShow: ["one entering order", "one retained unit", "one stopped order"],
        mustNotShow: ["text", "portrait dominance"],
        materiallyDistinctFrom: [{
          sceneId: "scene-002",
          imageSha256: adjacentImageSha256,
          distinction: "radial funnel versus stepped path",
        }],
      },
      geometryContract: {
        unit: "equal-value-output-pellet",
        completedSaleInputUnits: 20,
        costDrainGroups: [5, 5, 5, 4],
        totalCostDrainUnits: 19,
        retainedRemainderUnits: 1,
        conservationEquation: "20 = 5 + 5 + 5 + 4 + 1",
        conservationVerified: true,
        completedOrderBundleCount: 1,
        withheldMatchingOrderBundleCount: 1,
        orderIdentityPaymentEmblemsExcludedFromOutputPelletCount: true,
        withheldOrderExcludedFromCompletedSaleConservation: true,
      },
      compositionContract: {
        evidenceBounds: { x: 1, y: 1, width: 100, height: 100 },
        subtitleSafeRegion: { x: 1, y: 1200, width: 100, height: 100 },
        evidenceIntersectsSubtitleSafeRegion: false,
        palette: ["coral"],
        genericHumanAction: "one generic hand",
        portraitDominance: false,
      },
      localChecks: {
        nativeDimensions: "PASS",
        exactConservation: "PASS",
        singleCompletedOrderBundle: "PASS",
        singleWithheldMatchingOrderBundle: "PASS",
        physicalStopSeparation: "PASS",
        subtitleSafeComposition: "PASS",
        materiallyDistinctFromS02B01: "PASS",
        svgTextElementsAbsent: "PASS",
        externalAssetsAbsent: "PASS",
        logosAndUiAbsent: "PASS",
        syntheticCreatorLikenessAbsent: "PASS",
        providerCalls: 0,
        paidQaCalls: 0,
      },
      scope: "Pending exact-hash v2 adoption.",
    }));
    const adoptedV2 = await adoptVeronicaDeterministicDiagramPrototype({
      ...adoptionInput,
      prototypeManifestPath: prototypeV2Path,
    });
    expect(adoptedV2.imageSha256).toBe(await hashFile(pngV2Path));
    expect(await hashFile(imagePath)).toBe(adoptedV2.imageSha256);
    expect(JSON.parse(await fs.readFile(adoptedV2.adoptionPath, "utf8"))).toMatchObject({
      bindings: {
        previousAdoptionSha256: firstAdoptionSha256,
        previousManifestSha256: firstSceneManifestSha256,
      },
    });
    expect(await hashFile(path.join(
      episodeDir,
      "state",
      "image-generation",
      "superseded-adoptions",
      `scene-001.${firstAdoptionSha256}.json`,
    ))).toBe(firstAdoptionSha256);

    const secondAdoptionSha256 = await hashFile(adoptedV2.adoptionPath);
    const secondSceneManifestSha256 = await hashFile(sceneManifestPath);
    const secondSceneManifest = JSON.parse(
      await fs.readFile(sceneManifestPath, "utf8"),
    ) as { finalPrompt: string };
    const secondAdoptionFailurePath = path.join(qaDir, "second-adoption-failed.json");
    const firstAdoptionFailure = JSON.parse(
      await fs.readFile(firstAdoptionFailurePath, "utf8"),
    ) as Record<string, unknown>;
    await fs.writeFile(secondAdoptionFailurePath, JSON.stringify({
      ...firstAdoptionFailure,
      imageFingerprint: adoptedV2.imageSha256,
      finalPromptHash: hashText(secondSceneManifest.finalPrompt),
      semanticAlignmentScore: 0.62,
      instantReadScore: 0.55,
      narrationSupportScore: 0.48,
      mustShowCoverage: "partial",
      requiresNarrationToDecode: true,
      regenerationRequired: true,
    }));
    const svgV3Path = path.join(prototypesDir, "diagram-v3.svg");
    const pngV3Path = path.join(prototypesDir, "diagram-v3.png");
    await fs.writeFile(svgV3Path, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="3" height="3"/></svg>');
    await fs.writeFile(pngV3Path, Buffer.concat([pngBytes, Buffer.from([2])]));
    const prototypeV2 = JSON.parse(
      await fs.readFile(prototypeV2Path, "utf8"),
    ) as Record<string, unknown> & {
      provenance: Record<string, unknown>;
      artifacts: Record<string, unknown>;
      geometryContract: Record<string, unknown>;
      localChecks: Record<string, unknown>;
    };
    const prototypeV3Path = path.join(prototypesDir, "prototype-v3.json");
    await fs.writeFile(prototypeV3Path, JSON.stringify({
      ...prototypeV2,
      schemaVersion: "veronica-deterministic-visual-prototype.v3",
      createdAt: "2026-08-12T00:02:00Z",
      authorizationReference: "operator-v3-message",
      provenance: {
        ...prototypeV2.provenance,
        currentSceneManifestSha256: secondSceneManifestSha256,
        currentAdoptionSha256: secondAdoptionSha256,
        failedCanonicalImageSha256: adoptedV2.imageSha256,
        failedCanonicalReviewSha256: await hashFile(secondAdoptionFailurePath),
      },
      artifacts: {
        ...prototypeV2.artifacts,
        svgPath: "prototypes/diagram-v3.svg",
        svgSha256: await hashFile(svgV3Path),
        pngPath: "prototypes/diagram-v3.png",
        pngSha256: await hashFile(pngV3Path),
      },
      geometryContract: {
        ...prototypeV2.geometryContract,
        costDrainGroups: [19],
        costDrainRowPattern: [5, 5, 5, 4],
        conservationEquation: "20 = 19 + 1",
        continuousCostReservoirCount: 1,
        retainedContainerCount: 1,
      },
      localChecks: {
        ...prototypeV2.localChecks,
        singleContinuousCostReservoir: "PASS",
        singleRetainedContainer: "PASS",
        materiallyDistinctFromHookV2: "PASS",
      },
      scope: "Pending exact-hash v3 adoption.",
    }));
    const adoptedV3 = await adoptVeronicaDeterministicDiagramPrototype({
      ...adoptionInput,
      prototypeManifestPath: prototypeV3Path,
    });
    expect(adoptedV3.imageSha256).toBe(await hashFile(pngV3Path));
    expect(await hashFile(imagePath)).toBe(adoptedV3.imageSha256);
    expect(JSON.parse(await fs.readFile(adoptedV3.adoptionPath, "utf8"))).toMatchObject({
      bindings: {
        previousAdoptionSha256: secondAdoptionSha256,
        previousManifestSha256: secondSceneManifestSha256,
      },
    });
    expect(await hashFile(path.join(
      episodeDir,
      "state",
      "image-generation",
      "superseded-adoptions",
      `scene-001.${secondAdoptionSha256}.json`,
    ))).toBe(secondAdoptionSha256);

    const thirdAdoptionSha256 = await hashFile(adoptedV3.adoptionPath);
    const thirdSceneManifestSha256 = await hashFile(sceneManifestPath);
    const thirdSceneManifest = JSON.parse(
      await fs.readFile(sceneManifestPath, "utf8"),
    ) as { finalPrompt: string };
    const thirdAdoptionFailurePath = path.join(qaDir, "third-adoption-failed.json");
    await fs.writeFile(thirdAdoptionFailurePath, JSON.stringify({
      ...firstAdoptionFailure,
      imageFingerprint: adoptedV3.imageSha256,
      finalPromptHash: hashText(thirdSceneManifest.finalPrompt),
      semanticAlignmentScore: 0.78,
      instantReadScore: 0.74,
      narrationSupportScore: 0.77,
      mustShowCoverage: "partial",
      requiresNarrationToDecode: false,
      regenerationRequired: false,
    }));
    const svgV4Path = path.join(prototypesDir, "diagram-v4.svg");
    const pngV4Path = path.join(prototypesDir, "diagram-v4.png");
    await fs.writeFile(svgV4Path, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
    await fs.writeFile(pngV4Path, Buffer.concat([pngBytes, Buffer.from([3])]));
    const prototypeV3 = JSON.parse(
      await fs.readFile(prototypeV3Path, "utf8"),
    ) as Record<string, unknown> & {
      provenance: Record<string, unknown>;
      artifacts: Record<string, unknown>;
      geometryContract: Record<string, unknown>;
    };
    const prototypeV4Path = path.join(prototypesDir, "prototype-v4.json");
    await fs.writeFile(prototypeV4Path, JSON.stringify({
      ...prototypeV3,
      schemaVersion: "veronica-deterministic-visual-prototype.v4",
      createdAt: "2026-08-12T00:03:00Z",
      authorizationReference: "operator-v4-message",
      provenance: {
        ...prototypeV3.provenance,
        currentSceneManifestSha256: thirdSceneManifestSha256,
        currentAdoptionSha256: thirdAdoptionSha256,
        failedCanonicalImageSha256: adoptedV3.imageSha256,
        failedCanonicalReviewSha256: await hashFile(thirdAdoptionFailurePath),
      },
      artifacts: {
        ...prototypeV3.artifacts,
        svgPath: "prototypes/diagram-v4.svg",
        svgSha256: await hashFile(svgV4Path),
        pngPath: "prototypes/diagram-v4.png",
        pngSha256: await hashFile(pngV4Path),
      },
      geometryContract: {
        ...prototypeV3.geometryContract,
        wideGroundedGateCount: 1,
        withheldBundleEntirelyOutsideGate: true,
      },
      localChecks: {
        nativeDimensions: "PASS",
        exactConservation: "PASS",
        singleContinuousCostReservoir: "PASS",
        singleRetainedContainer: "PASS",
        singleCompletedOrderBundle: "PASS",
        singleWithheldMatchingOrderBundle: "PASS",
        wideGroundedGate: "PASS",
        withheldBundleEntirelyOutsideGate: "PASS",
        reducedHandArmClutter: "PASS",
        v3OutputGeometryPreserved: "PASS",
        subtitleSafeComposition: "PASS",
        materiallyDistinctFromS02B01: "PASS",
        materiallyDistinctFromHookV3: "PASS",
        svgTextElementsAbsent: "PASS",
        externalAssetsAbsent: "PASS",
        logosAndUiAbsent: "PASS",
        syntheticCreatorLikenessAbsent: "PASS",
        providerCalls: 0,
        paidQaCalls: 0,
      },
      scope: "Pending exact-hash v4 adoption.",
    }));
    const adoptedV4 = await adoptVeronicaDeterministicDiagramPrototype({
      ...adoptionInput,
      prototypeManifestPath: prototypeV4Path,
    });
    expect(adoptedV4.imageSha256).toBe(await hashFile(pngV4Path));
    expect(await hashFile(imagePath)).toBe(adoptedV4.imageSha256);
    expect(JSON.parse(await fs.readFile(adoptedV4.adoptionPath, "utf8"))).toMatchObject({
      bindings: {
        previousAdoptionSha256: thirdAdoptionSha256,
        previousManifestSha256: thirdSceneManifestSha256,
      },
    });
    expect(await hashFile(path.join(
      episodeDir,
      "state",
      "image-generation",
      "superseded-adoptions",
      `scene-001.${thirdAdoptionSha256}.json`,
    ))).toBe(thirdAdoptionSha256);
    expect(imageGenerationMocks.generateEpisodeImages).not.toHaveBeenCalled();
  });

  it("starts a one-scene remediation from a hash-bound failed review and preserves rejected pixels", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-remediation-"));
    const imagePath = path.join(episodeDir, "rejected.png");
    await fs.writeFile(imagePath, "rejected-pixels");
    const imageFingerprint = await hashFile(imagePath);
    await fs.mkdir(
      path.join(episodeDir, "state", "image-generation", "manifests"),
      { recursive: true },
    );
    const compilerPrompt = "Show one sale losing costs and a retained remainder.";
    const finalPrompt = `${compilerPrompt} Provider camera and rights boundary.`;
    await fs.writeFile(
      path.join(episodeDir, "state", "image-generation", "manifests", "scene-001.json"),
      JSON.stringify({
        sceneId: "scene-001",
        promptVersion: 2,
        finalPrompt,
        promptHash: hashText(finalPrompt),
        materialDifferencesFromPrevious: [],
        characterIds: [],
        referenceImages: [],
        model: "gpt-image-2",
        size: "864x1536",
        quality: "low",
        outputPath: imagePath,
        outputSha256: imageFingerprint,
        status: "generated",
        attempts: 1,
      }),
    );
    const brief = {
      contentId: "01a-test",
      assetId: "scene-001",
      locale: "en",
      variant: "short" as const,
      canonicalNarration: "Subtract every cost that increases with one sale.",
      spokenMeaning: "variable costs reduce retained value",
      viewerTakeaway: "one sale leaves a smaller remainder",
      narrativePurpose: "explain",
      visualRelationship: "sale minus costs leaves a remainder",
      mustShow: ["one sale token", "cost stations", "retained remainder"],
      mustNotShow: ["text"],
      relevanceAnchors: ["sale", "cost"],
      genericDriftRisks: ["abstract decoration"],
      finalPrompt: compilerPrompt,
      visualDirectionRules: ["show the relationship"],
      semanticBriefHash: "a".repeat(64),
      visualDirectionVersion: "veronica.v1",
    };
    const reviewPath = path.join(episodeDir, "failed-review.json");
    await fs.writeFile(reviewPath, JSON.stringify({
      schemaVersion: "veronica-post-generation-visual-review.v1",
      contentId: brief.contentId,
      assetId: brief.assetId,
      imageFingerprint,
      semanticBriefHash: brief.semanticBriefHash,
      finalPromptHash: hashText(finalPrompt),
      evaluatorModel: "gpt-5.4-mini",
      evaluatorConfigHash: "b".repeat(64),
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-12T00:00:00Z",
      semanticAlignmentScore: 0.71,
      instantReadScore: 0.62,
      buyerActionVisibilityScore: 0.7,
      causeEffectVisibilityScore: 0.75,
      narrationSupportScore: 0.74,
      visualQualityScore: 0.8,
      mustShowCoverage: "partial",
      mustNotShowViolations: [],
      occupationProxyDrift: "none",
      abstractPropDrift: "warning",
      genericBusinessStockDrift: "warning",
      passivePortraitDrift: "none",
      decorativeConceptDrift: "warning",
      textInImageViolation: false,
      syntheticVeronicaLikenessRisk: false,
      visibleBuyerDecision: true,
      visibleHumanAction: true,
      requiresNarrationToDecode: false,
      regenerationRequired: false,
      findings: [{ code: "SALE_TOKEN_IMPLIED", severity: "warning", message: "One sale is only implied." }],
      failedRequirements: ["one sale token", "retained remainder"],
      successfulRequirements: ["cost sequence"],
      regenerationInstructions: ["Make one sale token unmistakable."],
    }));
    const semanticPlanPath = path.join(
      episodeDir,
      "source",
      "pre-image-semantic-plan.v1.json",
    );
    const reviewManifestPath = path.join(episodeDir, "review", "manifest.json");
    const humanApprovalPath = path.join(episodeDir, "review", "approval.json");
    await fs.mkdir(path.dirname(semanticPlanPath), { recursive: true });
    await fs.mkdir(path.dirname(reviewManifestPath), { recursive: true });
    await fs.writeFile(semanticPlanPath, "semantic-plan");
    await fs.writeFile(reviewManifestPath, "review-manifest");
    await fs.writeFile(humanApprovalPath, "human-approval");
    const decisionPath = path.join(episodeDir, "encoding-decision.json");
    await fs.writeFile(decisionPath, JSON.stringify({
      schemaVersion: "veronica-human-visual-encoding-decision.v1",
      episodeId: "01a-test",
      language: "en",
      variant: "short",
      sceneId: "scene-001",
      visualBeatId: "01a-test-S02-B01",
      decision: "approved",
      reviewer: "operator",
      authorizationReference: "operator-message",
      approvedAt: "2026-08-12T00:00:00Z",
      bindings: {
        sourceSha256: "c".repeat(64),
        semanticPlanSha256: await hashFile(semanticPlanPath),
        reviewManifestPath: "review/manifest.json",
        reviewManifestSha256: await hashFile(reviewManifestPath),
        humanApprovalPath: "review/approval.json",
        humanApprovalSha256: await hashFile(humanApprovalPath),
        failedReviewSha256: await hashFile(reviewPath),
        rejectedImageSha256: imageFingerprint,
        semanticBriefHash: brief.semanticBriefHash,
        failedPromptHash: hashText(finalPrompt),
      },
      approvedTreatment: {
        visualThesis: "One sale becomes a smaller remainder.",
        composition: "One continuous left-to-right lane.",
        mustShow: ["one input block", "one smaller final remnant"],
        mustNotShow: ["extra blocks"],
        promptInstructions: ["Use strict visual conservation."],
      },
      scope: "Prompt materialization only; no provider call.",
    }));

    const plan = await materializeVeronicaRemediationScenePlan({
      episodeId: "01a-test",
      sourceSha256: "c".repeat(64),
      episodeDir,
      scenePlan: makeScenePlan(),
      briefs: [brief],
      reviewPath,
      encodingDecisionPath: decisionPath,
    });

    expect(plan.scenes[0]?.imagePrompt).toContain("SEMANTIC REMEDIATION");
    expect(plan.scenes[0]?.imagePrompt).toContain("Make one sale token unmistakable.");
    expect(plan.scenes[0]?.imagePrompt).not.toContain("Provider camera and rights boundary.");
    expect(plan.scenes[0]?.imagePrompt).toContain(
      "HUMAN-APPROVED CONCRETE ENCODING",
    );
    expect(plan.scenes[0]?.imagePrompt).toContain("strict visual conservation");
    const archivePath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "superseded-assets",
      `scene-001.${imageFingerprint}.png`,
    );
    expect(await hashFile(archivePath)).toBe(imageFingerprint);

    await fs.writeFile(imagePath, "tampered-pixels");
    await expect(materializeVeronicaRemediationScenePlan({
      episodeId: "01a-test",
      sourceSha256: "c".repeat(64),
      episodeDir,
      scenePlan: makeScenePlan(),
      briefs: [brief],
      reviewPath,
      encodingDecisionPath: decisionPath,
    })).rejects.toThrow("VERONICA_REMEDIATION_IMAGE_HASH_MISMATCH:scene-001");
  });

  it("runs existing-pixel Veronica QA without any image-generation fallback", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-qa-only-"));
    const imagePath = path.join(episodeDir, "image.png");
    await fs.writeFile(imagePath, "existing-pixels");
    const imageFingerprint = await hashFile(imagePath);
    const manifestDir = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
    );
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestDir, "scene-001.json"),
      JSON.stringify({
        sceneId: "scene-001",
        promptVersion: 2,
        sceneHash: "scene-hash",
        visualPlanHash: "visual-plan-hash",
        renderability: "direct",
        finalPrompt: "provider prompt",
        providerRequestHash: "provider-request-hash",
        promptHash: "prompt-hash",
        materialDifferencesFromPrevious: [],
        characterIds: [],
        referenceImages: [],
        model: "gpt-image-2",
        size: "864x1536",
        quality: "low",
        outputPath: imagePath,
        outputSha256: imageFingerprint,
        status: "generated",
        attempts: 1,
        generatedAt: "2026-08-12T00:00:00Z",
      }),
    );
    const brief = {
      contentId: "01a-test",
      assetId: "scene-001",
      locale: "en",
      variant: "short" as const,
      canonicalNarration: "Revenue is not margin.",
      spokenMeaning: "costs reduce retained value",
      viewerTakeaway: "sales can retain little value",
      narrativePurpose: "explain",
      visualRelationship: "sale minus costs leaves a remainder",
      mustShow: ["visible remainder"],
      mustNotShow: ["text"],
      relevanceAnchors: ["sale", "cost"],
      genericDriftRisks: ["stock office"],
      finalPrompt: "provider prompt",
      visualDirectionRules: ["show the relationship"],
      semanticBriefHash: "a".repeat(64),
      visualDirectionVersion: "veronica.v1",
    };
    const evaluate = vi.fn(async (input: {
      imageFingerprint: string;
      evaluatorConfigHash: string;
    }) => ({
      schemaVersion: "veronica-post-generation-visual-review.v1",
      contentId: brief.contentId,
      assetId: brief.assetId,
      imageFingerprint: input.imageFingerprint,
      semanticBriefHash: brief.semanticBriefHash,
      finalPromptHash: hashText("provider prompt"),
      evaluatorModel: "vision-test",
      evaluatorConfigHash: input.evaluatorConfigHash,
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-12T00:00:00Z",
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
      successfulRequirements: ["visible remainder"],
      regenerationInstructions: [],
    }));
    const evaluator = { model: "vision-test", config: {}, evaluate };

    expect(
      await reviewExistingVeronicaImages({
        episodeDir,
        scenePlan: makeScenePlan(),
        evaluator,
        briefs: [brief],
      }),
    ).toEqual([
      { sceneId: "scene-001", status: "approved", cacheStatus: "miss" },
    ]);
    expect(imageGenerationMocks.generateEpisodeImages).not.toHaveBeenCalled();

    await fs.writeFile(imagePath, "changed-pixels");
    expect(
      await reviewExistingVeronicaImages({
        episodeDir,
        scenePlan: makeScenePlan(),
        evaluator,
        briefs: [brief],
      }),
    ).toEqual([
      {
        sceneId: "scene-001",
        status: "failed",
        error: "QA_EXISTING_IMAGE_HASH_MISMATCH:scene-001",
      },
    ]);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("reconciles linked stale manifests, freezes PASS pixels, and rejects material local prompt changes", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "vero-reconcile-"));
    const imagePath = path.join(episodeDir, "image.png");
    await fs.writeFile(imagePath, "retry-pixels");
    const currentImageSha256 = await hashFile(imagePath);
    const staleImageSha256 = "b".repeat(64);
    const manifestDir = path.join(episodeDir, "state", "image-generation", "manifests");
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(path.join(manifestDir, "scene-001.json"), JSON.stringify({
      sceneId: "scene-001",
      promptVersion: 2,
      sceneHash: "scene-hash",
      visualPlanHash: "visual-plan-hash",
      renderability: "direct",
      finalPrompt: "provider prompt",
      providerRequestHash: "provider-request-hash",
      promptHash: "prompt-hash",
      materialDifferencesFromPrevious: [],
      characterIds: [],
      referenceImages: [],
      model: "gpt-image-2",
      size: "864x1536",
      quality: "low",
      outputPath: imagePath,
      outputSha256: staleImageSha256,
      status: "generated",
      attempts: 1,
      generatedAt: "2026-08-12T00:00:00Z",
    }));
    const debugLogPath = path.join(episodeDir, "debug", "openai-calls", "generation.json");
    await fs.mkdir(path.dirname(debugLogPath), { recursive: true });
    await fs.writeFile(debugLogPath, JSON.stringify({ requestId: "request-1" }));
    const debugLogSha256 = await hashFile(debugLogPath);
    const inventoryPath = path.join(episodeDir, "inventory.json");
    const inventory = makeReconciliationInventory({
      episodeDir,
      imagePath,
      currentImageSha256,
      manifestImageSha256: staleImageSha256,
      debugLogPath: path.relative(episodeDir, debugLogPath),
      debugLogSha256,
    });
    await fs.writeFile(inventoryPath, JSON.stringify(inventory));
    const brief = {
      contentId: "03b-test",
      assetId: "scene-001",
      locale: "en",
      variant: "short" as const,
      canonicalNarration: "A useful promise becomes an experienced result.",
      spokenMeaning: "a buyer experiences the promised result",
      viewerTakeaway: "the buyer can act",
      narrativePurpose: "explain",
      visualRelationship: "removed obstacle enables buyer action",
      mustShow: ["buyer action"],
      mustNotShow: ["text"],
      relevanceAnchors: ["buyer", "result"],
      genericDriftRisks: ["stock office"],
      finalPrompt: "provider prompt",
      visualDirectionRules: ["show cause and consequence"],
      semanticBriefHash: "a".repeat(64),
      visualDirectionVersion: "veronica.v1",
    };
    const evaluate = vi.fn(async (input: { imageFingerprint: string; evaluatorConfigHash: string }) => ({
      schemaVersion: "veronica-post-generation-visual-review.v1" as const,
      contentId: brief.contentId,
      assetId: brief.assetId,
      imageFingerprint: input.imageFingerprint,
      semanticBriefHash: brief.semanticBriefHash,
      finalPromptHash: hashText("provider prompt"),
      evaluatorModel: "vision-test",
      evaluatorConfigHash: input.evaluatorConfigHash,
      visualDirectionVersion: brief.visualDirectionVersion,
      createdAt: "2026-08-17T00:00:00Z",
      semanticAlignmentScore: 0.91,
      instantReadScore: 0.9,
      buyerActionVisibilityScore: 0.9,
      causeEffectVisibilityScore: 0.9,
      narrationSupportScore: 0.9,
      visualQualityScore: 0.9,
      mustShowCoverage: "pass" as const,
      mustNotShowViolations: [],
      occupationProxyDrift: "none" as const,
      abstractPropDrift: "none" as const,
      genericBusinessStockDrift: "none" as const,
      passivePortraitDrift: "none" as const,
      decorativeConceptDrift: "none" as const,
      textInImageViolation: false,
      syntheticVeronicaLikenessRisk: false,
      visibleBuyerDecision: true,
      visibleHumanAction: true,
      requiresNarrationToDecode: false,
      regenerationRequired: false,
      findings: [],
      failedRequirements: [],
      successfulRequirements: ["buyer action"],
      regenerationInstructions: [],
    }));
    const evaluator = { model: "vision-test", config: {}, evaluate };

    expect(await reviewExistingVeronicaImages({
      episodeDir,
      scenePlan: makeScenePlan(),
      evaluator,
      briefs: [brief],
      reconciliationInventory: inventory,
      reconciliationInventoryPath: inventoryPath,
    })).toEqual([{
      sceneId: "scene-001",
      status: "approved",
      cacheStatus: "miss",
      manifestReconciled: true,
      reconciliationClassification: "E",
    }]);
    const repairedManifest = JSON.parse(await fs.readFile(
      path.join(manifestDir, "scene-001.json"),
      "utf8",
    )) as { outputSha256: string };
    expect(repairedManifest.outputSha256).toBe(currentImageSha256);
    await expect(fs.stat(path.join(
      episodeDir,
      "state",
      "image-generation",
      "accepted-image-bindings",
      "scene-001.json",
    ))).resolves.toBeDefined();

    expect(await reviewExistingVeronicaImages({
      episodeDir,
      scenePlan: makeScenePlan(),
      evaluator,
      briefs: [brief],
    })).toEqual([{ sceneId: "scene-001", status: "approved", cacheStatus: "hit" }]);
    expect(imageGenerationMocks.generateEpisodeImages).not.toHaveBeenCalled();

    await fs.writeFile(imagePath, "materially-changed-pixels");
    const changedSha256 = await hashFile(imagePath);
    const changedInventory = makeReconciliationInventory({
      episodeDir,
      imagePath,
      currentImageSha256: changedSha256,
      manifestImageSha256: currentImageSha256,
      debugLogPath: path.relative(episodeDir, debugLogPath),
      debugLogSha256,
      semanticPromptMateriallyChanged: true,
    });
    expect(await reviewExistingVeronicaImages({
      episodeDir,
      scenePlan: makeScenePlan(),
      evaluator,
      briefs: [brief],
      reconciliationInventory: changedInventory,
      reconciliationInventoryPath: inventoryPath,
    })).toEqual([{
      sceneId: "scene-001",
      status: "failed",
      error: "QA_EXISTING_RECONCILIATION_UNSAFE:scene-001",
    }]);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("materializes and selects beat-scoped Veronica image assets without prompt substitution", () => {
    const parent = makeScenePlan();
    const promptA = "Exact provider prompt A";
    const promptB = "Exact provider prompt B";
    const compilation = (assetId: string, beatId: string, prompt: string) => ({
      inputHash: assetId.padEnd(64, "a").slice(0, 64),
      input: {
        narrationBeat: `Narration ${beatId}`,
        visualBeat: {
          beatId,
          coreMeaning: `Meaning ${beatId}`,
          viewerShouldUnderstand: `Understand ${beatId}`,
          action: `Action ${beatId}`,
        },
        treatment: {
          visualPurpose: "progression",
          subject: "operator and evidence",
          environment: "neutral evidence field",
          composition: "foreground and background zones",
          camera: "vertical documentary view",
          lighting: "soft daylight",
          emotionalState: "restrained",
          negativeConstraints: ["no readable text"],
          requiredEvidence: ["evidence"],
          forbiddenEvidence: ["logo"],
        },
        constraints: { providerSpecificConstraints: ["native 9:16"] },
        referenceAssets: [],
      },
      result: { imagePrompt: prompt },
    });
    const plan = {
      scenes: [{ sceneId: "semantic-001", semanticProposition: { narrationClaim: "claim", consequence: "result" }, visibleThesis: "thesis", treatment: { communicationIntent: "intent" } }],
      assets: [
        { assetId: "asset-beat-01", sceneId: "semantic-001", visualBeatId: "beat-01", nativeAspectRatio: "9:16", prompt: promptA, promptCompilation: compilation("asset-beat-01", "beat-01", promptA) },
        { assetId: "asset-beat-02", sceneId: "semantic-001", visualBeatId: "beat-02", nativeAspectRatio: "9:16", prompt: promptB, promptCompilation: compilation("asset-beat-02", "beat-02", promptB) },
      ],
      visualEvents: [
        { assetId: "asset-beat-01", startMs: 0, durationMs: 2_000 },
        { assetId: "asset-beat-02", startMs: 2_000, durationMs: 2_000 },
      ],
    } as never;
    const materialized = materializeVeronicaImageAssetScenePlan({
      plan,
      scenePlan: parent,
    });
    expect(materialized.scenes.map((scene) => scene.id)).toEqual([
      "scene-001",
      "scene-002",
    ]);
    expect(materialized.scenes.map((scene) => scene.imagePrompt)).toEqual([
      promptA,
      promptB,
    ]);
    expect(materialized.scenes[1]?.timing).toEqual({
      startSeconds: 2,
      endSeconds: 4,
    });
    expect(
      resolveVeronicaImageAssetSelection({
        plan,
        selections: ["beat-02"],
      }),
    ).toEqual(["scene-002"]);
    expect(
      assertImageProviderCallCeiling({
        sceneCount: 3,
        maxRegenerationAttempts: 0,
        maxProviderCalls: 3,
      }),
    ).toBe(3);
    expect(() =>
      assertImageProviderCallCeiling({
        sceneCount: 3,
        maxRegenerationAttempts: 1,
        maxProviderCalls: 3,
      }),
    ).toThrow("IMAGE_PROVIDER_CALL_CEILING_EXCEEDED:6:3");
  });

  it("does not let a prompt-level pass bypass hierarchical Veronica readiness", () => {
    expect(() => assertVeronicaHierarchicalImageReadiness({
      validation: { status: "pass" }, providerReadiness: { status: "PASS" },
      hierarchicalReadiness: { providerCandidate: false },
    } as never)).toThrow("VERONICA_HIERARCHICAL_PRE_IMAGE_READINESS_REQUIRED");
    expect(() =>
      assertVeronicaHierarchicalImageReadiness(
        {
          validation: { status: "pass" },
          providerReadiness: { status: "PASS" },
          hierarchicalReadiness: { providerCandidate: false },
        } as never,
        { currentApprovedReviewPack: true },
      ),
    ).not.toThrow();
  });

  beforeEach(() => {
    workspaceDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-images-resume-")
    );
    imageGenerationMocks.generateEpisodeImages.mockReset();
    imageGenerationMocks.generateEpisodeImages.mockResolvedValue([]);
    storyLocalizationMocks.assertScriptScoreGate.mockReset();
    storyLocalizationMocks.assertScriptScoreGate.mockResolvedValue(undefined);
  });

  it("bootstraps a missing episode manifest from the local episode folder", async () => {
    const episodeDir = path.join(workspaceDir, "011-the-black-eyed-children");
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "source", "011-the-black-eyed-children-en-full.md"),
      "# Episode 011\n\n## Audio Generation Instructions\n\n- Keep the tone restrained.\n\n# Narration Script\n\nTwo children stood outside the door."
    );
    await fs.writeFile(
      path.join(episodeDir, "shared", "scenes.json"),
      `${JSON.stringify(makeScenePlan(), null, 2)}\n`
    );
    const result = await loadOrBootstrapEpisodeManifest({
      episode: "011-the-black-eyed-children",
    });

    expect(result.created).toBe(true);
    expect(result.manifestPath).toBe(path.join(episodeDir, "manifest.json"));
    expect(result.manifest.scenePlan?.sourceId).toBe(
      "011-the-black-eyed-children"
    );
    expect(await fs.stat(result.manifestPath)).toBeTruthy();

    const second = await loadOrBootstrapEpisodeManifest({
      episode: "011-the-black-eyed-children",
    });

    expect(second.created).toBe(false);
    expect(second.manifest.scenePlan?.scenes).toHaveLength(1);
  });

  it("documents the canonical singular episode resume command example", async () => {
    const docsPath = path.resolve("docs/cli.md");
    const docs = await fs.readFile(docsPath, "utf8");

    expect(docs).toContain("node apps/cli/dist/index.js episode resume-images");
    expect(docs).not.toContain(
      "node apps/cli/dist/index.js episodes resume-images"
    );
    expect(docs).toContain(
      "npm run mediaforge -- episode resume-images --episode <episode-id> --concurrency 2"
    );
  });

  it("runs the resume path with the requested concurrency and reports the summary", async () => {
    const episodeDir = path.join(workspaceDir, "011-the-black-eyed-children");
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "languages"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "audio"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "source", "011-the-black-eyed-children-en-full.md"),
      "# Episode 011\n\n## Audio Generation Instructions\n\n- Keep the tone restrained.\n\n# Narration Script\n\nTwo children stood outside the door."
    );
    await fs.writeFile(
      path.join(episodeDir, "shared", "scenes.json"),
      `${JSON.stringify(makeScenePlan(), null, 2)}\n`
    );
    await fs.writeFile(path.join(episodeDir, "languages", "script-en.md"), "Two children stood outside the door.");
    await fs.writeFile(path.join(episodeDir, "audio", "narration.wav"), Buffer.alloc(44));
    await loadOrBootstrapEpisodeManifest({ episode: "011-the-black-eyed-children" });
    await createPreImageReviewPack({
      episodeDir,
      language: "en",
      variant: "full",
      genre: "dark-truth",
    });
    imageGenerationMocks.generateEpisodeImages.mockResolvedValueOnce([
      {
        episodeId: "011-the-black-eyed-children",
        sceneId: "scene-001",
        manifestPath: path.join(
          episodeDir,
          "state",
          "image-generation",
          "manifests",
          "scene-001.json"
        ),
        outputPath: path.join(
          episodeDir,
          "shared",
          "images",
          "generated",
          "scene-001__000000-000004__16x9.png"
        ),
        status: "generated",
      },
    ]);

    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let output = "";

    try {
      await commandImagesResume({
        episode: "011-the-black-eyed-children",
        concurrency: 2,
        allowUnapprovedCharacterReferences: true,
      });
      output = String(stdout.mock.calls.map((call) => call[0]).join(""));
    } finally {
      stdout.mockRestore();
    }

    expect(imageGenerationMocks.generateEpisodeImages).toHaveBeenCalledTimes(1);
    expect(storyLocalizationMocks.assertScriptScoreGate).toHaveBeenCalledWith({
      outputRoot: workspaceDir,
      episode: "011-the-black-eyed-children",
      locale: "en",
      format: "full",
    });
    expect(imageGenerationMocks.generateEpisodeImages.mock.calls[0]?.[0]).toBe(
      episodeDir
    );
    expect(imageGenerationMocks.generateEpisodeImages.mock.calls[0]?.[1]).toBe(
      "011-the-black-eyed-children"
    );
    expect(
      imageGenerationMocks.generateEpisodeImages.mock.calls[0]?.[3]
    ).toMatchObject({
      concurrency: 2,
      allowUnapprovedCharacterReferences: true,
    });
    expect(output).toContain("Generated: 1");
  });

  it("does not retry non-retryable persisted image failures unless forced", async () => {
    const episodeDir = path.join(workspaceDir, "011-the-black-eyed-children");
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.mkdir(
      path.join(episodeDir, "state", "image-generation", "manifests"),
      { recursive: true }
    );
    await fs.mkdir(
      path.join(episodeDir, "state", "image-generation", "failures"),
      { recursive: true }
    );
    await fs.writeFile(
      path.join(episodeDir, "source", "011-the-black-eyed-children-en-full.md"),
      "# Episode 011\n\n# Narration Script\n\nTwo children stood outside the door."
    );
    await fs.writeFile(
      path.join(episodeDir, "shared", "scenes.json"),
      `${JSON.stringify(makeScenePlan(), null, 2)}\n`
    );
    await fs.mkdir(path.join(episodeDir, "languages"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "audio"), { recursive: true });
    await fs.writeFile(path.join(episodeDir, "languages", "script-en.md"), "Two children stood outside the door.");
    await fs.writeFile(path.join(episodeDir, "audio", "narration.wav"), Buffer.alloc(44));
    await loadOrBootstrapEpisodeManifest({ episode: "011-the-black-eyed-children" });
    await createPreImageReviewPack({
      episodeDir,
      language: "en",
      variant: "full",
      genre: "dark-truth",
    });
    const outputPath = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      "scene-001__000000-000004__16x9.png"
    );
    await fs.writeFile(
      path.join(
        episodeDir,
        "state",
        "image-generation",
        "manifests",
        "scene-001.json"
      ),
      JSON.stringify(
        {
          sceneId: "scene-001",
          promptVersion: 1,
          finalPrompt: "failed prompt",
          promptHash: "prompt-hash",
          materialDifferencesFromPrevious: [],
          characterIds: [],
          referenceImages: [],
          model: "gpt-image-2",
          size: "1536x1024",
          quality: "medium",
          outputPath,
          status: "failed",
          attempts: 1,
          error: {
            message: "content policy rejected the image",
            retryable: false,
          },
        },
        null,
        2
      )
    );
    await fs.writeFile(
      path.join(
        episodeDir,
        "state",
        "image-generation",
        "failures",
        "scene-001.json"
      ),
      JSON.stringify(
        {
          sceneId: "scene-001",
          stage: "provider",
          category: "provider-safety-rejection",
          outputPath,
          message: "content policy rejected the image",
          retryable: false,
          attempts: 1,
          recordedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    imageGenerationMocks.generateEpisodeImages.mockResolvedValueOnce([]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let output = "";

    try {
      await commandImagesResume({
        episode: "011-the-black-eyed-children",
      });
      output = String(stdout.mock.calls.map((call) => call[0]).join(""));
    } finally {
      stdout.mockRestore();
    }

    expect(imageGenerationMocks.generateEpisodeImages).toHaveBeenCalledTimes(1);
    expect(
      imageGenerationMocks.generateEpisodeImages.mock.calls[0]?.[2].scenes
    ).toHaveLength(0);
    expect(output).toContain("Skipped non-retryable failures: 1");
  });
});
