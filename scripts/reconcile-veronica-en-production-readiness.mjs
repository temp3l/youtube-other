#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());
const episodesRoot = path.join(repositoryRoot, "episodes");
const reportsRoot = path.join(repositoryRoot, "docs", "reports", "codex-runs");
const costReservationPaths = (await fs.readdir(reportsRoot).catch(() => []))
  .filter((name) => name.endsWith("-reservation.json"))
  .sort()
  .map((name) => path.posix.join("docs/reports/codex-runs", name));
const generatedAt = new Date().toISOString();
const targetWpm = 155;
const originalBudgetCeilingEur = 2.5;
const additionalBudgetAuthorizationUsd = 2.5;
const ecbUsdPerEur = 1.154;
const conversionSafetyMultiplier = 1.1;
const conservativeEurPerUsd = (1 / ecbUsdPerEur) * conversionSafetyMultiplier;
const additionalBudgetAuthorizationEur = additionalBudgetAuthorizationUsd * conservativeEurPerUsd;
const budgetCeilingEur = Number(
  (originalBudgetCeilingEur + additionalBudgetAuthorizationEur).toFixed(6),
);

const sourceRoots = [
  {
    pack: "veronica-content-pack-2",
    variant: "short",
    directory: "content-packs/vero/veronica-content-pack-2/shorts/en",
    episodeId: (base) => base,
  },
  {
    pack: "veronica-content-pack-2",
    variant: "full",
    directory: "content-packs/vero/veronica-content-pack-2/long/en",
    episodeId: (base) => base,
  },
  {
    pack: "veronica-stories-editorial-master-v5",
    variant: "short",
    directory: "content-packs/vero/veronica-stories-editorial-master-v5/shorts/en",
    episodeId: (base) => base,
  },
  {
    pack: "veronica-stories-editorial-master-v5",
    variant: "full",
    directory: "content-packs/vero/veronica-stories-editorial-master-v5/long/en",
    episodeId: (base) => `l${base}`,
  },
];

const supersededArtifacts = [
  {
    path: "docs/reports/codex-runs/2026-08-12-veronica-en-preimage-portfolio-census.json",
    reason: "Predates complete 01A QA and classifies three stale v5 narration chains as missing-input-only.",
  },
  {
    path: "docs/reports/codex-runs/2026-08-12-veronica-en-preimage-portfolio-census.md",
    reason: "Human-readable projection of the superseded census JSON.",
  },
  {
    path: "docs/reports/codex-runs/2026-08-12-veronica-en-portfolio-combined-run.json",
    reason: "Correct for its bounded run, but not a global historical cost ledger and not the latest full source/provenance census.",
  },
  {
    path: "docs/reports/codex-runs/2026-08-12-veronica-en-portfolio-combined-run.md",
    reason: "Human-readable projection of the superseded bounded-run state.",
  },
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function wordCount(text) {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fileHash(filePath) {
  try {
    return sha256(await fs.readFile(filePath));
  } catch {
    return null;
  }
}

async function fileWordCount(filePath) {
  try {
    return wordCount(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function discoverSources() {
  const discovered = [];
  for (const root of sourceRoots) {
    const absoluteDirectory = path.join(repositoryRoot, root.directory);
    const names = (await fs.readdir(absoluteDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
    for (const name of names) {
      const base = name.slice(0, -3);
      const sourcePath = path.posix.join(root.directory, name);
      const bytes = await fs.readFile(path.join(repositoryRoot, sourcePath));
      discovered.push({
        episodeId: root.episodeId(base),
        pack: root.pack,
        variant: root.variant,
        locale: "en",
        sourcePath,
        sourceHash: sha256(bytes),
        sourceWordCount: wordCount(bytes.toString("utf8")),
        sourceBytes: bytes.length,
      });
    }
  }
  return discovered.sort((left, right) =>
    left.pack.localeCompare(right.pack) ||
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.episodeId.localeCompare(right.episodeId),
  );
}

async function latestReviewState(episodeDir, variant) {
  const root = path.join(episodeDir, "review-packs", "pre-image", `en-${variant}`);
  const latest = await readJson(path.join(root, "latest.json"));
  if (!latest?.packDir) return null;
  const packDir = path.join(root, latest.packDir);
  const manifestPath = path.join(packDir, "review-manifest.json");
  const encodingDecisionPath = path.join(
    packDir,
    "human-visual-encoding-decision.v1.json",
  );
  const diagramPrototypePath = path.join(
    packDir,
    "prototypes",
    "s02-b01-deterministic-diagram-prototype.v1.json",
  );
  const hookPrototypePath = path.join(
    packDir,
    "prototypes",
    "hook-b04-deterministic-diagram-prototype.v1.json",
  );
  const hookV2PrototypePath = path.join(
    packDir,
    "prototypes",
    "hook-b04-deterministic-diagram-prototype.v2.json",
  );
  const hookV3PrototypePath = path.join(
    packDir,
    "prototypes",
    "hook-b04-deterministic-diagram-prototype.v3.json",
  );
  const hookV4PrototypePath = path.join(
    packDir,
    "prototypes",
    "hook-b04-deterministic-diagram-prototype.v4.json",
  );
  const [manifest, manifestSha256, approval, approvalSha256, encodingDecision, encodingDecisionSha256] = await Promise.all([
    readJson(manifestPath),
    fileHash(manifestPath),
    readJson(path.join(packDir, "human-pre-image-approval.v1.json")),
    fileHash(path.join(packDir, "human-pre-image-approval.v1.json")),
    readJson(encodingDecisionPath),
    fileHash(encodingDecisionPath),
  ]);
  const diagramPrototype = await readJson(diagramPrototypePath);
  const hookPrototype = await readJson(hookPrototypePath);
  const hookV2Prototype = await readJson(hookV2PrototypePath);
  const hookV3Prototype = await readJson(hookV3PrototypePath);
  const hookV4Prototype = await readJson(hookV4PrototypePath);
  const [hookV2PrototypeSha256, hookV2SvgSha256, hookV2PngSha256] = await Promise.all([
    fileHash(hookV2PrototypePath),
    hookV2Prototype?.artifacts?.svgPath
      ? fileHash(path.join(packDir, hookV2Prototype.artifacts.svgPath))
      : null,
    hookV2Prototype?.artifacts?.pngPath
      ? fileHash(path.join(packDir, hookV2Prototype.artifacts.pngPath))
      : null,
  ]);
  const [hookV3PrototypeSha256, hookV3SvgSha256, hookV3PngSha256] = await Promise.all([
    fileHash(hookV3PrototypePath),
    hookV3Prototype?.artifacts?.svgPath
      ? fileHash(path.join(packDir, hookV3Prototype.artifacts.svgPath))
      : null,
    hookV3Prototype?.artifacts?.pngPath
      ? fileHash(path.join(packDir, hookV3Prototype.artifacts.pngPath))
      : null,
  ]);
  const [hookV4PrototypeSha256, hookV4SvgSha256, hookV4PngSha256] = await Promise.all([
    fileHash(hookV4PrototypePath),
    hookV4Prototype?.artifacts?.svgPath
      ? fileHash(path.join(packDir, hookV4Prototype.artifacts.svgPath))
      : null,
    hookV4Prototype?.artifacts?.pngPath
      ? fileHash(path.join(packDir, hookV4Prototype.artifacts.pngPath))
      : null,
  ]);
  const [hookPrototypeSha256, hookSvgSha256, hookPngSha256] = await Promise.all([
    fileHash(hookPrototypePath),
    hookPrototype?.artifacts?.svgPath
      ? fileHash(path.join(packDir, hookPrototype.artifacts.svgPath))
      : null,
    hookPrototype?.artifacts?.pngPath
      ? fileHash(path.join(packDir, hookPrototype.artifacts.pngPath))
      : null,
  ]);
  const diagramAdoptionPath = diagramPrototype?.sceneId
    ? path.join(
        episodeDir,
        "state",
        "image-generation",
        "deterministic-adoptions",
        `${diagramPrototype.sceneId}.json`,
      )
    : null;
  const diagramAdoption = diagramAdoptionPath
    ? await readJson(diagramAdoptionPath)
    : null;
  const diagramAdoptionSha256 = diagramAdoptionPath
    ? await fileHash(diagramAdoptionPath)
    : null;
  const hookAdoptionPath = hookPrototype?.sceneId
    ? path.join(
        episodeDir,
        "state",
        "image-generation",
        "deterministic-adoptions",
        `${hookPrototype.sceneId}.json`,
      )
    : null;
  const hookAdoption = hookAdoptionPath ? await readJson(hookAdoptionPath) : null;
  const hookAdoptionSha256 = hookAdoptionPath
    ? await fileHash(hookAdoptionPath)
    : null;
  const [diagramPrototypeSha256, diagramSvgSha256, diagramPngSha256] = await Promise.all([
    fileHash(diagramPrototypePath),
    diagramPrototype?.artifacts?.svgPath
      ? fileHash(path.join(packDir, diagramPrototype.artifacts.svgPath))
      : null,
    diagramPrototype?.artifacts?.pngPath
      ? fileHash(path.join(packDir, diagramPrototype.artifacts.pngPath))
      : null,
  ]);
  return {
    manifest,
    manifestSha256,
    approval,
    approvalSha256,
    encodingDecision,
    encodingDecisionSha256,
    encodingDecisionPath: path.relative(repositoryRoot, encodingDecisionPath),
    diagramPrototype,
    diagramPrototypeSha256,
    diagramSvgSha256,
    diagramPngSha256,
    diagramPrototypePath: path.relative(repositoryRoot, diagramPrototypePath),
    hookPrototype,
    hookPrototypeSha256,
    hookSvgSha256,
    hookPngSha256,
    hookPrototypePath: path.relative(repositoryRoot, hookPrototypePath),
    hookV2Prototype,
    hookV2PrototypeSha256,
    hookV2SvgSha256,
    hookV2PngSha256,
    hookV2PrototypePath: path.relative(repositoryRoot, hookV2PrototypePath),
    hookV3Prototype,
    hookV3PrototypeSha256,
    hookV3SvgSha256,
    hookV3PngSha256,
    hookV3PrototypePath: path.relative(repositoryRoot, hookV3PrototypePath),
    hookV4Prototype,
    hookV4PrototypeSha256,
    hookV4SvgSha256,
    hookV4PngSha256,
    hookV4PrototypePath: path.relative(repositoryRoot, hookV4PrototypePath),
    hookAdoption,
    hookAdoptionSha256,
    hookAdoptionPath: hookAdoptionPath
      ? path.relative(repositoryRoot, hookAdoptionPath)
      : null,
    diagramAdoption,
    diagramAdoptionSha256,
    diagramAdoptionPath: diagramAdoptionPath
      ? path.relative(repositoryRoot, diagramAdoptionPath)
      : null,
  };
}

async function generatedImageState(episodeDir) {
  const manifestDir = path.join(episodeDir, "state", "image-generation", "manifests");
  const names = (await fs.readdir(manifestDir).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const generated = [];
  for (const name of names) {
    const manifest = await readJson(path.join(manifestDir, name));
    if (manifest?.status !== "generated" || !manifest.outputPath || !manifest.outputSha256) continue;
    if (await fileHash(manifest.outputPath) !== manifest.outputSha256) continue;
    generated.push({
      sceneId: manifest.sceneId,
      outputPath: path.relative(repositoryRoot, manifest.outputPath),
      outputSha256: manifest.outputSha256,
      model: manifest.model,
      generatedAt: manifest.generatedAt,
    });
  }
  return generated;
}

function isImageQaApproved(review) {
  const severe = [
    review.occupationProxyDrift,
    review.abstractPropDrift,
    review.genericBusinessStockDrift,
    review.passivePortraitDrift,
    review.decorativeConceptDrift,
  ].includes("severe");
  return review.regenerationRequired === false &&
    review.textInImageViolation === false &&
    review.syntheticVeronicaLikenessRisk === false &&
    !severe &&
    review.mustShowCoverage === "pass" &&
    Array.isArray(review.mustNotShowViolations) && review.mustNotShowViolations.length === 0 &&
    review.requiresNarrationToDecode === false &&
    review.semanticAlignmentScore >= 0.8 &&
    review.instantReadScore >= 0.75 &&
    review.narrationSupportScore >= 0.8;
}

async function currentImageQaState(episodeDir, images) {
  const qaDir = path.join(episodeDir, "state", "image-generation", "veronica-post-generation-visual-qa");
  const reviews = [];
  for (const name of (await fs.readdir(qaDir).catch(() => [])).filter((entry) => entry.endsWith(".json")).sort()) {
    const absoluteReviewPath = path.join(qaDir, name);
    const review = await readJson(absoluteReviewPath);
    if (!review) continue;
    const image = images.find((candidate) => candidate.sceneId === review.assetId && candidate.outputSha256 === review.imageFingerprint);
    if (!image) continue;
    reviews.push({
      sceneId: image.sceneId,
      imageSha256: image.outputSha256,
      approved: isImageQaApproved(review),
      reviewPath: path.posix.join(path.relative(repositoryRoot, qaDir), name),
      reviewSha256: await fileHash(absoluteReviewPath),
      semanticBriefHash: review.semanticBriefHash,
      finalPromptHash: review.finalPromptHash,
      scores: {
        semanticAlignment: review.semanticAlignmentScore,
        instantRead: review.instantReadScore,
        narrationSupport: review.narrationSupportScore,
      },
      mustShowCoverage: review.mustShowCoverage,
      failedRequirements: review.failedRequirements ?? [],
      regenerationInstructions: review.regenerationInstructions ?? [],
    });
  }
  return {
    evaluated: reviews.length,
    approved: reviews.filter((review) => review.approved).length,
    rejected: reviews.filter((review) => !review.approved).length,
    state: reviews.some((review) => !review.approved)
      ? "FAIL"
      : reviews.length === images.length && images.length > 0
        ? "PASS"
        : reviews.length > 0
          ? "PARTIAL"
          : "NOT_RUN",
    reviews,
  };
}

async function imageQaReviewByArtifactHash(episodeDir, expectedSha256) {
  if (!expectedSha256) return null;
  const qaDir = path.join(episodeDir, "state", "image-generation", "veronica-post-generation-visual-qa");
  for (const name of (await fs.readdir(qaDir).catch(() => [])).filter((entry) => entry.endsWith(".json")).sort()) {
    const absoluteReviewPath = path.join(qaDir, name);
    if (await fileHash(absoluteReviewPath) !== expectedSha256) continue;
    const review = await readJson(absoluteReviewPath);
    if (!review) return null;
    return {
      sceneId: review.assetId,
      imageSha256: review.imageFingerprint,
      reviewSha256: expectedSha256,
      semanticBriefHash: review.semanticBriefHash,
      finalPromptHash: review.finalPromptHash,
      approved: isImageQaApproved(review),
    };
  }
  return null;
}

async function authorizedPixelHashes(episodeId) {
  const hashes = new Set();
  for (const reservationPath of costReservationPaths) {
    const reservation = await readJson(path.join(repositoryRoot, reservationPath));
    if (reservation?.episodeId !== episodeId) continue;
    for (const asset of reservation.authorizedAssets ?? []) {
      if (asset && typeof asset === "object" && typeof asset.imageSha256 === "string") {
        hashes.add(asset.imageSha256);
      }
    }
    if (typeof reservation.generatedImageSha256 === "string") {
      hashes.add(reservation.generatedImageSha256);
    }
  }
  return hashes;
}

async function consumedEncodingDecisionResult(input) {
  for (const reservationPath of costReservationPaths) {
    const reservation = await readJson(path.join(repositoryRoot, reservationPath));
    if (
      reservation?.episodeId === input.episodeId &&
      typeof reservation.status === "string" &&
      reservation.status.startsWith("CONSUMED_") &&
      reservation.authorizedAsset?.encodingDecisionSha256 === input.encodingDecisionSha256 &&
      reservation.generatedImageSha256 === input.imageSha256
    ) {
      return {
        reservationPath,
        result: reservation.result ?? null,
        reviewArtifact: reservation.reviewArtifact ?? null,
      };
    }
  }
  return null;
}

function qaState(qa, sourceHash) {
  if (!qa || qa.admissionIdentity?.sourceSha256 !== sourceHash) return "NOT_CURRENT";
  const scenesPass = Array.isArray(qa.scenes) && qa.scenes.length > 0 && qa.scenes.every((entry) => entry.judgement?.verdict === "PASS");
  const beatsPass = Array.isArray(qa.beats) && qa.beats.length > 0 && qa.beats.every((entry) => entry.judgement?.verdict === "PASS");
  return scenesPass && beatsPass && qa.sequence?.verdict === "PASS" ? "PASS" : "BLOCK";
}

async function inspectEpisode(source) {
  const episodeDir = path.join(episodesRoot, source.episodeId);
  const scriptPath = path.join(
    episodeDir,
    "languages",
    ...(source.variant === "short" ? ["short"] : []),
    "script-en.md",
  );
  const localeDir = path.join(episodeDir, "locales", "en", source.variant);
  const audioPath = path.join(localeDir, "audio", "narration.wav");
  const timingPath = path.join(localeDir, "canonical-timing.v1.json");
  const plannerInputPath = path.join(episodeDir, "source", "visual-planner-input.v1.json");
  const planPath = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const promptPath = path.join(localeDir, "image-prompts", "provider-image-prompts.v1.json");
  const admissionPath = path.join(episodeDir, "shared", "source-grounded-qa-admission.v1.json");
  const qaPath = path.join(episodeDir, "shared", "source-grounded-visual-qa.v1.json");
  const manifestPath = path.join(episodeDir, "manifest.json");
  const [workspace, scriptHash, workspaceScriptWordCount, audioHash, timingHash, plannerInput, plan, semanticPlanHash, promptPresent, admission, qa, timing, reviewState, generatedImages] = await Promise.all([
    exists(episodeDir),
    fileHash(scriptPath),
    fileWordCount(scriptPath),
    fileHash(audioPath),
    fileHash(timingPath),
    readJson(plannerInputPath),
    readJson(planPath),
    fileHash(planPath),
    exists(promptPath),
    readJson(admissionPath),
    readJson(qaPath),
    readJson(timingPath),
    latestReviewState(episodeDir, source.variant),
    generatedImageState(episodeDir),
  ]);
  const review = reviewState?.manifest ?? null;
  const approvedPixelHashes = await authorizedPixelHashes(source.episodeId);
  const humanApprovalCurrent = Boolean(
    reviewState?.approval?.decision === "approved" &&
    reviewState.approval.reviewManifestSha256 === reviewState.manifestSha256,
  );
  const planPresent = Boolean(plan);
  const deterministicPlanReady = Boolean(
    plan?.validation?.status === "pass" &&
    plan?.semanticQuality?.status === "PASS" &&
    plan?.providerReadiness?.status === "PASS",
  );
  const sourceMappingCurrent = scriptHash === source.sourceHash;
  const atomicTimingCurrent = Boolean(
    timing &&
    audioHash &&
    timing.narrationHash === source.sourceHash &&
    timing.selectedAudioHash === audioHash,
  );
  const hasDownstreamState = Boolean(scriptHash || audioHash || timingHash || planPresent || admission || qa);
  const staleProvenance = hasDownstreamState && (!sourceMappingCurrent || (audioHash && timingHash && !atomicTimingCurrent));
  const hasCurrentProductionInputs = Boolean(audioHash && timingHash && atomicTimingCurrent && sourceMappingCurrent);
  const currentQaState = qaState(qa, source.sourceHash);
  const preImageReady = hasCurrentProductionInputs && currentQaState === "PASS" && review?.overallPackValidity === true;
  const currentGeneratedImages = preImageReady
    ? generatedImages.filter((image) => approvedPixelHashes.size === 0 || approvedPixelHashes.has(image.outputSha256))
    : [];
  const invalidatedGeneratedImages = preImageReady
    ? generatedImages.filter((image) => approvedPixelHashes.size > 0 && !approvedPixelHashes.has(image.outputSha256))
    : [];
  const imageCount = currentGeneratedImages.length;
  const imageQa = await currentImageQaState(episodeDir, currentGeneratedImages);
  const encodingDecision = reviewState?.encodingDecision ?? null;
  const currentEncodingSceneReview = imageQa.reviews.find(
    (entry) => entry.sceneId === encodingDecision?.sceneId,
  );
  const encodingReview = await imageQaReviewByArtifactHash(
    episodeDir,
    encodingDecision?.bindings?.failedReviewSha256,
  );
  const visualEncodingDecisionCurrent = Boolean(
    encodingDecision?.decision === "approved" &&
    encodingDecision.episodeId === source.episodeId &&
    encodingDecision.language === source.locale &&
    encodingDecision.variant === source.variant &&
    encodingDecision.bindings?.sourceSha256 === source.sourceHash &&
    encodingDecision.bindings?.semanticPlanSha256 === semanticPlanHash &&
    encodingDecision.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    encodingDecision.bindings?.humanApprovalSha256 === reviewState?.approvalSha256 &&
    encodingDecision.bindings?.failedReviewSha256 === encodingReview?.reviewSha256 &&
    encodingDecision.bindings?.rejectedImageSha256 === encodingReview?.imageSha256 &&
    encodingDecision.bindings?.semanticBriefHash === encodingReview?.semanticBriefHash &&
    encodingDecision.bindings?.failedPromptHash === encodingReview?.finalPromptHash
  );
  const consumedEncodingResult = encodingDecision && reviewState?.encodingDecisionSha256
    ? await consumedEncodingDecisionResult({
        episodeId: source.episodeId,
        encodingDecisionSha256: reviewState.encodingDecisionSha256,
        imageSha256: currentEncodingSceneReview?.imageSha256,
      })
    : null;
  const diagramPrototype = reviewState?.diagramPrototype ?? null;
  const prototypeFailedReview = await imageQaReviewByArtifactHash(
    episodeDir,
    diagramPrototype?.provenance?.failedProviderReviewSha256,
  );
  const hookPrototype = reviewState?.hookPrototype ?? null;
  const hookV2Prototype = reviewState?.hookV2Prototype ?? null;
  const hookV3Prototype = reviewState?.hookV3Prototype ?? null;
  const hookV4Prototype = reviewState?.hookV4Prototype ?? null;
  const hookFailedReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookPrototype?.provenance?.failedProviderReviewSha256,
  );
  const hookAdjacentReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookPrototype?.provenance?.approvedAdjacentReviewSha256,
  );
  const hookImage = currentGeneratedImages.find(
    (entry) => entry.sceneId === hookPrototype?.sceneId,
  );
  const hookAdoption = reviewState?.hookAdoption ?? null;
  const hookAdoptedReview = imageQa.reviews.find(
    (entry) =>
      entry.sceneId === hookAdoption?.sceneId &&
      entry.imageSha256 === hookAdoption?.bindings?.pngSha256,
  );
  const hookAdoptionCurrent = Boolean(
    hookAdoption?.status === "ADOPTED_PENDING_QA" &&
    hookAdoption.episodeId === source.episodeId &&
    hookAdoption.language === source.locale &&
    hookAdoption.variant === source.variant &&
    hookAdoption.bindings?.prototypeManifestSha256 === reviewState?.hookPrototypeSha256 &&
    hookAdoption.bindings?.sourceSha256 === source.sourceHash &&
    hookAdoption.bindings?.semanticPlanSha256 === semanticPlanHash &&
    hookAdoption.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookAdoption.bindings?.failedProviderImageSha256 === hookFailedReview?.imageSha256 &&
    hookAdoption.bindings?.failedProviderReviewSha256 === hookFailedReview?.reviewSha256 &&
    hookAdoption.bindings?.semanticBriefHash === hookFailedReview?.semanticBriefHash &&
    hookAdoption.bindings?.svgSha256 === reviewState?.hookSvgSha256 &&
    hookAdoption.bindings?.pngSha256 === reviewState?.hookPngSha256 &&
    hookImage?.outputSha256 === hookAdoption.bindings?.pngSha256 &&
    hookAdoption.effects?.imageGenerationProviderCalls === 0 &&
    hookAdoption.effects?.automaticRetries === 0
  );
  const hookV2FailedReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV2Prototype?.provenance?.failedCanonicalReviewSha256,
  );
  const hookV2AdjacentReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV2Prototype?.provenance?.approvedAdjacentReviewSha256,
  );
  const hookV2AdoptedReview = imageQa.reviews.find(
    (entry) =>
      entry.sceneId === hookAdoption?.sceneId &&
      entry.imageSha256 === hookV2Prototype?.artifacts?.pngSha256,
  );
  const hookV2SupersededAdoptionSha256 = hookAdoption?.adopted?.supersededAdoptionPath
    ? await fileHash(hookAdoption.adopted.supersededAdoptionPath)
    : null;
  const hookV2AdoptionCurrent = Boolean(
    hookAdoption?.status === "ADOPTED_PENDING_QA" &&
    hookAdoption.episodeId === source.episodeId &&
    hookAdoption.language === source.locale &&
    hookAdoption.variant === source.variant &&
    hookAdoption.bindings?.prototypeManifestSha256 === reviewState?.hookV2PrototypeSha256 &&
    hookAdoption.bindings?.sourceSha256 === source.sourceHash &&
    hookAdoption.bindings?.semanticPlanSha256 === semanticPlanHash &&
    hookAdoption.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookAdoption.bindings?.failedProviderImageSha256 === hookV2FailedReview?.imageSha256 &&
    hookAdoption.bindings?.failedProviderReviewSha256 === hookV2FailedReview?.reviewSha256 &&
    hookAdoption.bindings?.semanticBriefHash === hookV2FailedReview?.semanticBriefHash &&
    hookAdoption.bindings?.previousManifestSha256 === hookV2Prototype?.provenance?.currentSceneManifestSha256 &&
    hookAdoption.bindings?.previousAdoptionSha256 === hookV2Prototype?.provenance?.currentAdoptionSha256 &&
    hookV2SupersededAdoptionSha256 === hookAdoption.bindings?.previousAdoptionSha256 &&
    hookAdoption.bindings?.svgSha256 === reviewState?.hookV2SvgSha256 &&
    hookAdoption.bindings?.pngSha256 === reviewState?.hookV2PngSha256 &&
    hookImage?.outputSha256 === hookAdoption.bindings?.pngSha256 &&
    hookAdoption.effects?.imageGenerationProviderCalls === 0 &&
    hookAdoption.effects?.qaProviderCalls === 0 &&
    hookAdoption.effects?.automaticRetries === 0
  );
  const hookV2PrototypeCurrent = Boolean(
    hookV2Prototype?.schemaVersion === "veronica-deterministic-visual-prototype.v2" &&
    hookV2Prototype.status === "PENDING_EXACT_HASH_MODALITY_REVIEW" &&
    hookV2Prototype.canonicalAssetReplaced === false &&
    hookV2Prototype.episodeId === source.episodeId &&
    hookV2Prototype.language === source.locale &&
    hookV2Prototype.variant === source.variant &&
    !hookV2AdoptionCurrent &&
    hookV2Prototype.provenance?.sourceSha256 === source.sourceHash &&
    hookV2Prototype.provenance?.semanticPlanSha256 === semanticPlanHash &&
    hookV2Prototype.provenance?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookV2Prototype.provenance?.currentSceneManifestSha256 === await fileHash(path.join(episodeDir, "state", "image-generation", "manifests", `${hookV2Prototype.sceneId}.json`)) &&
    hookV2Prototype.provenance?.currentAdoptionSha256 === reviewState?.hookAdoptionSha256 &&
    hookV2Prototype.provenance?.failedCanonicalImageSha256 === hookImage?.outputSha256 &&
    hookV2Prototype.provenance?.failedCanonicalImageSha256 === hookV2FailedReview?.imageSha256 &&
    hookV2Prototype.provenance?.failedCanonicalReviewSha256 === hookV2FailedReview?.reviewSha256 &&
    hookV2Prototype.provenance?.semanticBriefHash === hookV2FailedReview?.semanticBriefHash &&
    hookV2Prototype.provenance?.approvedAdjacentImageSha256 === hookV2AdjacentReview?.imageSha256 &&
    hookV2Prototype.provenance?.approvedAdjacentReviewSha256 === hookV2AdjacentReview?.reviewSha256 &&
    hookV2AdjacentReview?.approved === true &&
    hookV2Prototype.artifacts?.svgSha256 === reviewState?.hookV2SvgSha256 &&
    hookV2Prototype.artifacts?.pngSha256 === reviewState?.hookV2PngSha256 &&
    hookV2Prototype.localChecks?.providerCalls === 0 &&
    hookV2Prototype.localChecks?.paidQaCalls === 0
  );
  const hookV3FailedReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV3Prototype?.provenance?.failedCanonicalReviewSha256,
  );
  const hookV3AdjacentReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV3Prototype?.provenance?.approvedAdjacentReviewSha256,
  );
  const hookV3AdoptedReview = imageQa.reviews.find(
    (entry) =>
      entry.sceneId === hookAdoption?.sceneId &&
      entry.imageSha256 === hookV3Prototype?.artifacts?.pngSha256,
  );
  const hookV3SupersededAdoptionSha256 = hookAdoption?.adopted?.supersededAdoptionPath
    ? await fileHash(hookAdoption.adopted.supersededAdoptionPath)
    : null;
  const hookV3AdoptionCurrent = Boolean(
    hookAdoption?.status === "ADOPTED_PENDING_QA" &&
    hookAdoption.episodeId === source.episodeId &&
    hookAdoption.language === source.locale &&
    hookAdoption.variant === source.variant &&
    hookAdoption.bindings?.prototypeManifestSha256 === reviewState?.hookV3PrototypeSha256 &&
    hookAdoption.bindings?.sourceSha256 === source.sourceHash &&
    hookAdoption.bindings?.semanticPlanSha256 === semanticPlanHash &&
    hookAdoption.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookAdoption.bindings?.failedProviderImageSha256 === hookV3FailedReview?.imageSha256 &&
    hookAdoption.bindings?.failedProviderReviewSha256 === hookV3FailedReview?.reviewSha256 &&
    hookAdoption.bindings?.semanticBriefHash === hookV3FailedReview?.semanticBriefHash &&
    hookAdoption.bindings?.previousManifestSha256 === hookV3Prototype?.provenance?.currentSceneManifestSha256 &&
    hookAdoption.bindings?.previousAdoptionSha256 === hookV3Prototype?.provenance?.currentAdoptionSha256 &&
    hookV3SupersededAdoptionSha256 === hookAdoption.bindings?.previousAdoptionSha256 &&
    hookAdoption.bindings?.svgSha256 === reviewState?.hookV3SvgSha256 &&
    hookAdoption.bindings?.pngSha256 === reviewState?.hookV3PngSha256 &&
    hookImage?.outputSha256 === hookAdoption.bindings?.pngSha256 &&
    hookAdoption.effects?.imageGenerationProviderCalls === 0 &&
    hookAdoption.effects?.qaProviderCalls === 0 &&
    hookAdoption.effects?.automaticRetries === 0
  );
  const hookV3PrototypeCurrent = Boolean(
    hookV3Prototype?.schemaVersion === "veronica-deterministic-visual-prototype.v3" &&
    hookV3Prototype.status === "PENDING_EXACT_HASH_MODALITY_REVIEW" &&
    hookV3Prototype.canonicalAssetReplaced === false &&
    hookV3Prototype.episodeId === source.episodeId &&
    hookV3Prototype.language === source.locale &&
    hookV3Prototype.variant === source.variant &&
    !hookV3AdoptionCurrent &&
    hookV3Prototype.provenance?.sourceSha256 === source.sourceHash &&
    hookV3Prototype.provenance?.semanticPlanSha256 === semanticPlanHash &&
    hookV3Prototype.provenance?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookV3Prototype.provenance?.currentSceneManifestSha256 === await fileHash(path.join(episodeDir, "state", "image-generation", "manifests", `${hookV3Prototype.sceneId}.json`)) &&
    hookV3Prototype.provenance?.currentAdoptionSha256 === reviewState?.hookAdoptionSha256 &&
    hookV3Prototype.provenance?.failedCanonicalImageSha256 === hookImage?.outputSha256 &&
    hookV3Prototype.provenance?.failedCanonicalImageSha256 === hookV3FailedReview?.imageSha256 &&
    hookV3Prototype.provenance?.failedCanonicalReviewSha256 === hookV3FailedReview?.reviewSha256 &&
    hookV3Prototype.provenance?.semanticBriefHash === hookV3FailedReview?.semanticBriefHash &&
    hookV3Prototype.provenance?.approvedAdjacentImageSha256 === hookV3AdjacentReview?.imageSha256 &&
    hookV3Prototype.provenance?.approvedAdjacentReviewSha256 === hookV3AdjacentReview?.reviewSha256 &&
    hookV3AdjacentReview?.approved === true &&
    hookV3Prototype.artifacts?.svgSha256 === reviewState?.hookV3SvgSha256 &&
    hookV3Prototype.artifacts?.pngSha256 === reviewState?.hookV3PngSha256 &&
    hookV3Prototype.localChecks?.providerCalls === 0 &&
    hookV3Prototype.localChecks?.paidQaCalls === 0
  );
  const hookV4FailedReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV4Prototype?.provenance?.failedCanonicalReviewSha256,
  );
  const hookV4AdjacentReview = await imageQaReviewByArtifactHash(
    episodeDir,
    hookV4Prototype?.provenance?.approvedAdjacentReviewSha256,
  );
  const hookV4AdoptedReview = imageQa.reviews.find(
    (entry) =>
      entry.sceneId === hookAdoption?.sceneId &&
      entry.imageSha256 === hookV4Prototype?.artifacts?.pngSha256,
  );
  const hookV4SupersededAdoptionSha256 = hookAdoption?.adopted?.supersededAdoptionPath
    ? await fileHash(hookAdoption.adopted.supersededAdoptionPath)
    : null;
  const hookV4AdoptionCurrent = Boolean(
    hookAdoption?.status === "ADOPTED_PENDING_QA" &&
    hookAdoption.episodeId === source.episodeId &&
    hookAdoption.language === source.locale &&
    hookAdoption.variant === source.variant &&
    hookAdoption.bindings?.prototypeManifestSha256 === reviewState?.hookV4PrototypeSha256 &&
    hookAdoption.bindings?.sourceSha256 === source.sourceHash &&
    hookAdoption.bindings?.semanticPlanSha256 === semanticPlanHash &&
    hookAdoption.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookAdoption.bindings?.failedProviderImageSha256 === hookV4FailedReview?.imageSha256 &&
    hookAdoption.bindings?.failedProviderReviewSha256 === hookV4FailedReview?.reviewSha256 &&
    hookAdoption.bindings?.semanticBriefHash === hookV4FailedReview?.semanticBriefHash &&
    hookAdoption.bindings?.previousManifestSha256 === hookV4Prototype?.provenance?.currentSceneManifestSha256 &&
    hookAdoption.bindings?.previousAdoptionSha256 === hookV4Prototype?.provenance?.currentAdoptionSha256 &&
    hookV4SupersededAdoptionSha256 === hookAdoption.bindings?.previousAdoptionSha256 &&
    hookAdoption.bindings?.svgSha256 === reviewState?.hookV4SvgSha256 &&
    hookAdoption.bindings?.pngSha256 === reviewState?.hookV4PngSha256 &&
    hookImage?.outputSha256 === hookAdoption.bindings?.pngSha256 &&
    hookAdoption.effects?.imageGenerationProviderCalls === 0 &&
    hookAdoption.effects?.qaProviderCalls === 0 &&
    hookAdoption.effects?.automaticRetries === 0
  );
  const hookV4PrototypeCurrent = Boolean(
    hookV4Prototype?.schemaVersion === "veronica-deterministic-visual-prototype.v4" &&
    hookV4Prototype.status === "PENDING_EXACT_HASH_MODALITY_REVIEW" &&
    hookV4Prototype.canonicalAssetReplaced === false &&
    hookV4Prototype.episodeId === source.episodeId &&
    hookV4Prototype.language === source.locale &&
    hookV4Prototype.variant === source.variant &&
    !hookV4AdoptionCurrent &&
    hookV4Prototype.provenance?.sourceSha256 === source.sourceHash &&
    hookV4Prototype.provenance?.semanticPlanSha256 === semanticPlanHash &&
    hookV4Prototype.provenance?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    hookV4Prototype.provenance?.currentSceneManifestSha256 === await fileHash(path.join(episodeDir, "state", "image-generation", "manifests", `${hookV4Prototype.sceneId}.json`)) &&
    hookV4Prototype.provenance?.currentAdoptionSha256 === reviewState?.hookAdoptionSha256 &&
    hookV4Prototype.provenance?.failedCanonicalImageSha256 === hookImage?.outputSha256 &&
    hookV4Prototype.provenance?.failedCanonicalImageSha256 === hookV4FailedReview?.imageSha256 &&
    hookV4Prototype.provenance?.failedCanonicalReviewSha256 === hookV4FailedReview?.reviewSha256 &&
    hookV4Prototype.provenance?.semanticBriefHash === hookV4FailedReview?.semanticBriefHash &&
    hookV4Prototype.provenance?.approvedAdjacentImageSha256 === hookV4AdjacentReview?.imageSha256 &&
    hookV4Prototype.provenance?.approvedAdjacentReviewSha256 === hookV4AdjacentReview?.reviewSha256 &&
    hookV4AdjacentReview?.approved === true &&
    hookV4Prototype.artifacts?.svgSha256 === reviewState?.hookV4SvgSha256 &&
    hookV4Prototype.artifacts?.pngSha256 === reviewState?.hookV4PngSha256 &&
    hookV4Prototype.localChecks?.providerCalls === 0 &&
    hookV4Prototype.localChecks?.paidQaCalls === 0
  );
  const hookPrototypeCurrent = Boolean(
    hookPrototype?.schemaVersion === "veronica-deterministic-visual-prototype.v1" &&
    hookPrototype.status === "PENDING_HUMAN_MODALITY_REVIEW" &&
    hookPrototype.canonicalAssetReplaced === false &&
    hookPrototype.episodeId === source.episodeId &&
    hookPrototype.language === source.locale &&
    hookPrototype.variant === source.variant &&
    hookPrototype.provenance?.sourceSha256 === source.sourceHash &&
    hookPrototype.provenance?.semanticPlanSha256 === semanticPlanHash &&
    hookPrototype.provenance?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    !hookAdoptionCurrent &&
    hookPrototype.provenance?.failedProviderImageSha256 === hookImage?.outputSha256 &&
    hookPrototype.provenance?.failedProviderImageSha256 === hookFailedReview?.imageSha256 &&
    hookPrototype.provenance?.failedProviderReviewSha256 === hookFailedReview?.reviewSha256 &&
    hookPrototype.provenance?.semanticBriefHash === hookFailedReview?.semanticBriefHash &&
    hookPrototype.provenance?.approvedAdjacentImageSha256 === hookAdjacentReview?.imageSha256 &&
    hookPrototype.provenance?.approvedAdjacentReviewSha256 === hookAdjacentReview?.reviewSha256 &&
    hookAdjacentReview?.approved === true &&
    hookPrototype.artifacts?.svgSha256 === reviewState?.hookSvgSha256 &&
    hookPrototype.artifacts?.pngSha256 === reviewState?.hookPngSha256 &&
    hookPrototype.localChecks?.providerCalls === 0 &&
    hookPrototype.localChecks?.paidQaCalls === 0
  );
  const diagramPrototypeCurrent = Boolean(
    diagramPrototype?.status === "PENDING_HUMAN_MODALITY_REVIEW" &&
    diagramPrototype.episodeId === source.episodeId &&
    diagramPrototype.language === source.locale &&
    diagramPrototype.variant === source.variant &&
    diagramPrototype.provenance?.sourceSha256 === source.sourceHash &&
    diagramPrototype.provenance?.semanticPlanSha256 === semanticPlanHash &&
    diagramPrototype.provenance?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    diagramPrototype.provenance?.visualEncodingDecisionSha256 === reviewState?.encodingDecisionSha256 &&
    diagramPrototype.provenance?.failedProviderImageSha256 === prototypeFailedReview?.imageSha256 &&
    diagramPrototype.provenance?.failedProviderReviewSha256 === prototypeFailedReview?.reviewSha256 &&
    diagramPrototype.provenance?.semanticBriefHash === prototypeFailedReview?.semanticBriefHash &&
    diagramPrototype.artifacts?.svgSha256 === reviewState?.diagramSvgSha256 &&
    diagramPrototype.artifacts?.pngSha256 === reviewState?.diagramPngSha256 &&
    diagramPrototype.localChecks?.providerCalls === 0 &&
    diagramPrototype.localChecks?.paidQaCalls === 0
  );
  const diagramAdoption = reviewState?.diagramAdoption ?? null;
  const adoptedImage = currentGeneratedImages.find(
    (entry) => entry.sceneId === diagramAdoption?.sceneId,
  );
  const adoptedImageReview = imageQa.reviews.find(
    (entry) =>
      entry.sceneId === diagramAdoption?.sceneId &&
      entry.imageSha256 === diagramAdoption?.bindings?.pngSha256,
  );
  const diagramAdoptionCurrent = Boolean(
    diagramAdoption?.status === "ADOPTED_PENDING_QA" &&
    diagramAdoption.episodeId === source.episodeId &&
    diagramAdoption.language === source.locale &&
    diagramAdoption.variant === source.variant &&
    diagramAdoption.bindings?.prototypeManifestSha256 === reviewState?.diagramPrototypeSha256 &&
    diagramAdoption.bindings?.sourceSha256 === source.sourceHash &&
    diagramAdoption.bindings?.semanticPlanSha256 === semanticPlanHash &&
    diagramAdoption.bindings?.reviewManifestSha256 === reviewState?.manifestSha256 &&
    diagramAdoption.bindings?.visualEncodingDecisionSha256 === reviewState?.encodingDecisionSha256 &&
    diagramAdoption.bindings?.failedProviderImageSha256 === prototypeFailedReview?.imageSha256 &&
    diagramAdoption.bindings?.failedProviderReviewSha256 === prototypeFailedReview?.reviewSha256 &&
    diagramAdoption.bindings?.semanticBriefHash === prototypeFailedReview?.semanticBriefHash &&
    diagramAdoption.bindings?.svgSha256 === reviewState?.diagramSvgSha256 &&
    diagramAdoption.bindings?.pngSha256 === reviewState?.diagramPngSha256 &&
    adoptedImage?.outputSha256 === diagramAdoption.bindings?.pngSha256 &&
    diagramAdoption.effects?.imageGenerationProviderCalls === 0 &&
    diagramAdoption.effects?.automaticRetries === 0
  );
  const expectedImageCount = Array.isArray(plan?.assets) ? plan.assets.length : 0;
  const imageComplete = expectedImageCount > 0 && imageCount === expectedImageCount;
  const expectedDurationSeconds = round((source.sourceWordCount / targetWpm) * 60, 1);
  const conservativeTtsCostUsd = round(
    3 * (expectedDurationSeconds * 0.0003 + source.sourceBytes * 0.0000006),
  );

  let primaryBlocker;
  let blockerClass;
  let deterministicAdmissionState;
  if (source.episodeId === "01a-revenue-is-not-a-good-business" && preImageReady) {
    primaryBlocker = hookV4AdoptionCurrent
      ? hookV4AdoptedReview?.approved
        ? "HOOK_B04_V4_DETERMINISTIC_DIAGRAM_STRICT_QA_PASS"
        : hookV4AdoptedReview
          ? "HOOK_B04_V4_DETERMINISTIC_DIAGRAM_STRICT_QA_FAILED"
          : "HOOK_B04_V4_DETERMINISTIC_DIAGRAM_STRICT_QA_PENDING"
      : hookV4PrototypeCurrent
      ? "HOOK_B04_V4_PROTOTYPE_PENDING_EXACT_HASH_MODALITY_REVIEW"
      : hookV3AdoptionCurrent
      ? hookV3AdoptedReview?.approved
        ? "HOOK_B04_V3_DETERMINISTIC_DIAGRAM_STRICT_QA_PASS"
        : hookV3AdoptedReview
          ? "HOOK_B04_V3_DETERMINISTIC_DIAGRAM_STRICT_QA_FAILED"
          : "HOOK_B04_V3_DETERMINISTIC_DIAGRAM_STRICT_QA_PENDING"
      : hookV3PrototypeCurrent
      ? "HOOK_B04_V3_PROTOTYPE_PENDING_EXACT_HASH_MODALITY_REVIEW"
      : hookV2AdoptionCurrent
      ? hookV2AdoptedReview?.approved
        ? "HOOK_B04_V2_DETERMINISTIC_DIAGRAM_STRICT_QA_PASS"
        : hookV2AdoptedReview
          ? "HOOK_B04_V2_DETERMINISTIC_DIAGRAM_STRICT_QA_FAILED"
          : "HOOK_B04_V2_DETERMINISTIC_DIAGRAM_STRICT_QA_PENDING"
      : hookV2PrototypeCurrent
      ? "HOOK_B04_V2_PROTOTYPE_PENDING_EXACT_HASH_MODALITY_REVIEW"
      : hookAdoptionCurrent
      ? hookAdoptedReview?.approved
        ? "HOOK_B04_DETERMINISTIC_DIAGRAM_STRICT_QA_PASS"
        : hookAdoptedReview
          ? "HOOK_B04_DETERMINISTIC_DIAGRAM_STRICT_QA_FAILED"
          : "HOOK_B04_DETERMINISTIC_DIAGRAM_STRICT_QA_PENDING"
      : hookPrototypeCurrent
      ? "HOOK_B04_DETERMINISTIC_PROTOTYPE_PENDING_HUMAN_MODALITY_REVIEW"
      : diagramAdoptionCurrent
      ? adoptedImageReview?.approved
        ? "CANARY_EXISTING_PIXELS_REQUIRE_REMAINING_STRICT_QA"
        : adoptedImageReview
          ? "DETERMINISTIC_DIAGRAM_ADOPTED_STRICT_QA_FAILED"
          : "DETERMINISTIC_DIAGRAM_ADOPTED_STRICT_QA_PENDING"
      : diagramPrototypeCurrent
      ? "DETERMINISTIC_DIAGRAM_PROTOTYPE_PENDING_HUMAN_MODALITY_REVIEW"
      : invalidatedGeneratedImages.length > 0
      ? "IMAGE_PIXEL_IDENTITY_INVALIDATED_BY_UNAUTHORIZED_GENERATION"
      : imageQa.state === "FAIL"
        ? visualEncodingDecisionCurrent
          ? "IMAGE_CANARY_MATERIAL_QA_FAILURE_ENCODING_APPROVED_PROVIDER_AUTHORIZATION_REQUIRED"
          : consumedEncodingResult
            ? "IMAGE_CANARY_ENCODING_CONSUMED_MATERIAL_QA_FAILURE"
          : "IMAGE_CANARY_MATERIAL_QA_FAILURE"
      : imageCount > 0
        ? "IMAGE_CANARY_QA_RETRY_AUTHORIZATION_REQUIRED"
      : "HUMAN_PRE_IMAGE_APPROVAL_REQUIRED";
    blockerClass = hookV4AdoptionCurrent
      ? hookV4AdoptedReview?.approved
        ? "CONFIGURATION"
        : "EDITORIAL_HUMAN_DECISION"
      : hookV4PrototypeCurrent
      ? "EDITORIAL_HUMAN_DECISION"
      : hookV3AdoptionCurrent
      ? hookV3AdoptedReview?.approved
        ? "CONFIGURATION"
        : "EDITORIAL_HUMAN_DECISION"
      : hookV3PrototypeCurrent
      ? "EDITORIAL_HUMAN_DECISION"
      : hookV2AdoptionCurrent
      ? hookV2AdoptedReview?.approved
        ? "CONFIGURATION"
        : "EDITORIAL_HUMAN_DECISION"
      : hookV2PrototypeCurrent
      ? "EDITORIAL_HUMAN_DECISION"
      : hookAdoptionCurrent
      ? hookAdoptedReview?.approved
        ? "CONFIGURATION"
        : "EDITORIAL_HUMAN_DECISION"
      : hookPrototypeCurrent
      ? "EDITORIAL_HUMAN_DECISION"
      : diagramAdoptionCurrent
      ? adoptedImageReview && !adoptedImageReview.approved
        ? "EPISODE_SPECIFIC"
        : "CONFIGURATION"
      : diagramPrototypeCurrent
      ? "EDITORIAL_HUMAN_DECISION"
      : invalidatedGeneratedImages.length > 0
      ? "PROVENANCE_STALE"
      : imageQa.state === "FAIL"
        ? "EPISODE_SPECIFIC"
      : imageCount > 0
        ? "CONFIGURATION"
        : "EDITORIAL_HUMAN_DECISION";
    deterministicAdmissionState = "PASS";
  } else if (staleProvenance) {
    primaryBlocker = "SOURCE_NARRATION_AUDIO_TIMING_CHAIN_STALE";
    blockerClass = "PROVENANCE_STALE";
    deterministicAdmissionState = "BLOCK";
  } else if (hasCurrentProductionInputs) {
    primaryBlocker = !planPresent
      ? "DETERMINISTIC_VISUAL_PLAN_NOT_MATERIALIZED"
      : !deterministicPlanReady
        ? "DETERMINISTIC_PROVIDER_ADMISSION_FAILED"
        : "SOURCE_GROUNDED_QA_NOT_CURRENT";
    blockerClass = !planPresent
      ? "CONFIGURATION"
      : !deterministicPlanReady
        ? "SYSTEMIC_ALGORITHM"
        : "PROVIDER_UNAVAILABLE";
    deterministicAdmissionState = "BLOCK";
  } else {
    primaryBlocker = !audioHash && !timingHash
      ? "MISSING_NARRATION_AUDIO_AND_TIMING"
      : !audioHash
        ? "MISSING_NARRATION_AUDIO_ATOMIC_TIMING_RENEWAL_REQUIRED"
        : "MISSING_CANONICAL_TIMING";
    blockerClass = "MISSING_PRODUCTION_INPUT";
    deterministicAdmissionState = "BLOCK";
  }

  return {
    episodeId: source.episodeId,
    pack: source.pack,
    variant: source.variant,
    locale: source.locale,
    sourcePath: source.sourcePath,
    sourceHash: source.sourceHash,
    wordCount: source.sourceWordCount,
    workspacePath: path.posix.join("episodes", source.episodeId),
    productionInputStatus: hasCurrentProductionInputs
      ? "CURRENT_ATOMIC_CHAIN"
      : staleProvenance
        ? "STALE_ATOMIC_CHAIN"
        : !audioHash && !timingHash
          ? "MISSING_AUDIO_AND_TIMING"
          : !audioHash
            ? "MISSING_AUDIO_AND_TIMING_RENEWAL"
            : "MISSING_TIMING",
    plannerInputStatus: staleProvenance
      ? "STALE_SOURCE_MAPPING"
      : plannerInput?.narration?.sourceSha256 === source.sourceHash
        ? "CURRENT"
        : plannerInput
          ? "STALE_OR_INCOMPATIBLE"
          : "MISSING",
    visualPlanStatus: preImageReady ? "CURRENT_PASS" : staleProvenance ? "STALE" : planPresent ? deterministicPlanReady ? "CURRENT_PENDING_QA" : "CURRENT_DETERMINISTIC_FAIL" : "MISSING",
    promptReadiness: preImageReady ? "PASS" : promptPresent ? deterministicPlanReady ? "CURRENT_PENDING_QA" : "CURRENT_BLOCKED" : "NOT_AVAILABLE",
    deterministicAdmissionState,
    existingQaState: currentQaState,
    provenanceState: hasCurrentProductionInputs ? "CONSISTENT" : staleProvenance ? "STALE_ATOMIC_CHAIN" : "INCOMPLETE_ATOMIC_CHAIN",
    sourceMappingCurrent,
    workspaceScriptHash: scriptHash,
    workspaceScriptWordCount,
    sourceWordDelta: workspaceScriptWordCount === null ? null : source.sourceWordCount - workspaceScriptWordCount,
    selectedAudioHash: audioHash,
    timingHash,
    timingNarrationHash: timing?.narrationHash ?? null,
    timingSelectedAudioHash: timing?.selectedAudioHash ?? null,
    admissionIdentityHash: admission?.identityHash ?? null,
    admissionSourceHash: admission?.sourceSha256 ?? null,
    durationSeconds: timing?.narrationDurationSeconds ?? null,
    targetWpm,
    expectedDurationSeconds,
    primaryBlocker,
    blockerClass,
    paidWorkRequired:
      blockerClass === "MISSING_PRODUCTION_INPUT" ||
      blockerClass === "PROVENANCE_STALE" ||
      blockerClass === "PROVIDER_UNAVAILABLE" ||
      (blockerClass === "CONFIGURATION" && preImageReady),
    exactPaidOperation: preImageReady
      ? hookV4AdoptionCurrent
        ? hookV4AdoptedReview?.approved
          ? "After explicit paid authorization: one strict QA-only request for current S01-B02 pixels; zero image generation and no retry"
          : "No further paid HOOK-B04 operation justified. Four bounded diagram variants failed strict admission; v4 preserved the successful 19:1 split but the withheld-order consequence still required narration. Human editorial review must choose a different metaphor or accept deferral."
      : hookV4PrototypeCurrent
        ? "No paid operation until the operator approves or rejects exact HOOK-B04 v4 PNG 22731f2fc9b6c84c02c2195d7527e476696106cbb0b0233ad51bdb5c0b6cb5b3; recommended approval, hash-bound chained adoption, then one strict QA-only request"
      : hookV3AdoptionCurrent
        ? hookV3AdoptedReview?.approved
          ? "After explicit paid authorization: one strict QA-only request for current S01-B02 pixels; zero image generation and no retry"
          : "No paid operation justified; HOOK-B04 v3 made the 19:1 cost split legible but strict QA still found the withheld-order stop ambiguous and missed semantic, instant-read, and narration-support thresholds narrowly. Human editorial direction is required before another prototype or QA call."
      : hookV3PrototypeCurrent
        ? "No paid operation until the operator approves or rejects exact HOOK-B04 v3 PNG ed527430bbceac95141d078234d5a145d1976a5607c64311193d75bf570cc72a; recommended approval, hash-bound chained adoption, then one strict QA-only request"
      : hookV2AdoptionCurrent
        ? hookV2AdoptedReview?.approved
          ? "After explicit paid authorization: one strict QA-only request for current S01-B02 pixels; zero image generation and no retry"
          : "No paid operation justified; strict HOOK-B04 v2 QA could not decode the exact 19:1 pellet conservation without narration. Human editorial direction is required before another prototype or QA call."
      : hookV2PrototypeCurrent
        ? "No paid operation until the operator approves or rejects exact HOOK-B04 v2 PNG 4b0d6b2cded1fdc428a898aec798730a9a2af11556e987e9ba23ac251e12adc9; recommended approval, hash-bound adoption, then one strict QA-only request"
      : hookAdoptionCurrent
        ? hookAdoptedReview?.approved
          ? "After explicit paid authorization: one strict QA-only request for current S01-B02 pixels; zero image generation and no retry"
          : "No paid operation justified; strict HOOK-B04 narration support failed at 0.73 despite other admission checks passing. Human editorial direction is required before any new prototype or QA."
      : hookPrototypeCurrent
        ? "No paid operation until the operator approves or rejects exact HOOK-B04 prototype PNG cc10c8772d12f53565fbf2dcb86cc0a264a066baf425e070ba18742660a7bf4a; recommended approval, hash-bound adoption, then one strict QA-only request"
      : diagramAdoptionCurrent
        ? adoptedImageReview?.approved
          ? "After explicit paid authorization: two strict QA-only requests for the existing HOOK-B04 and S01-B02 pixels; zero image generation and no retry"
          : adoptedImageReview
            ? "No paid operation justified; the adopted deterministic diagram failed strict QA and requires human review"
            : "One already-authorized strict QA-only request for the adopted S02-B01 pixels; zero image generation and no retry"
      : diagramPrototypeCurrent
        ? "No paid operation until the operator approves or rejects the exact deterministic diagram prototype; recommended approval then one strict QA-only request"
        : invalidatedGeneratedImages.length > 0
        ? "No paid operation until the operator accepts or rejects the noncanonical S02-B01 replacement pixel; recommended acceptance then exactly three strict QA-only requests"
        : imageQa.state === "FAIL"
          ? visualEncodingDecisionCurrent
            ? "After explicit paid authorization: one S02-B01 image using the hash-bound human-approved conservation encoding, followed by one strict QA request; no automatic retry"
            : consumedEncodingResult
              ? "No paid operation justified; obtain one strategic authorization to switch S02-B01 from photorealistic generation to a deterministic code-native editorial diagram prototype"
            : "No paid operation until one concrete S02-B01 conservation encoding is human-approved and hash-bound"
        : imageCount > 0
        ? "Three QA-only replacement requests for the existing HOOK-B04, S01-B02, and S02-B01 pixels; zero image generation"
        : "After explicit human approval bound to the current review-pack hashes: three-image canary for HOOK-B04, S01-B02, S02-B01"
      : hasCurrentProductionInputs
        ? blockerClass === "SYSTEMIC_ALGORITHM"
          ? "No paid operation is admissible until deterministic semantic/provider readiness passes"
          : blockerClass === "PROVIDER_UNAVAILABLE"
            ? "One bounded source-grounded scene/beat/sequence QA run after durable EUR reservation"
            : "No paid operation required; materialize the provider-free canonical visual plan and run deterministic admission"
        : "No provider dispatch authorized; ingest supplied-human narration, or obtain separate synthetic-narration approval, then derive timing",
    imageApprovalState: humanApprovalCurrent ? "HUMAN_HASH_BOUND_APPROVED" : "NOT_APPROVED",
    fullyPreImageReady: preImageReady,
    imageComplete,
    imageCount,
    expectedImageCount,
    generatedImages: currentGeneratedImages,
    invalidatedGeneratedImages,
    imageQa,
    visualEncodingDecision: encodingDecision
      ? {
          state: visualEncodingDecisionCurrent
            ? "CURRENT_APPROVED"
            : consumedEncodingResult
              ? "CONSUMED_CURRENT_RESULT"
              : "STALE_OR_INVALID",
          path: reviewState.encodingDecisionPath,
          sha256: reviewState.encodingDecisionSha256,
          visualBeatId: encodingDecision.visualBeatId,
          authorizationReference: encodingDecision.authorizationReference,
          ...(consumedEncodingResult ? { consumedResult: consumedEncodingResult } : {}),
        }
      : { state: "MISSING" },
    deterministicDiagramPrototype: diagramPrototype
      ? {
          state: diagramAdoptionCurrent
            ? adoptedImageReview?.approved
              ? "ADOPTED_STRICT_QA_PASS"
              : adoptedImageReview
                ? "ADOPTED_STRICT_QA_FAIL"
                : "ADOPTED_STRICT_QA_PENDING"
            : diagramPrototypeCurrent
              ? "CURRENT_PENDING_HUMAN_MODALITY_REVIEW"
            : "STALE_OR_INVALID",
          path: reviewState.diagramPrototypePath,
          sha256: reviewState.diagramPrototypeSha256,
          svgSha256: reviewState.diagramSvgSha256,
          pngSha256: reviewState.diagramPngSha256,
          canonicalAssetReplaced: diagramPrototype.canonicalAssetReplaced,
          localChecks: diagramPrototype.localChecks,
          ...(diagramAdoption
            ? {
                adoptionPath: reviewState.diagramAdoptionPath,
                adoptionSha256: reviewState.diagramAdoptionSha256,
                adoptedImageSha256: diagramAdoption.bindings?.pngSha256 ?? null,
              }
            : {}),
        }
      : { state: "MISSING" },
    hookDeterministicPrototype: hookPrototype
      ? {
          state: hookAdoptionCurrent
            ? hookAdoptedReview?.approved
              ? "ADOPTED_STRICT_QA_PASS"
              : hookAdoptedReview
                ? "ADOPTED_STRICT_QA_FAIL"
                : "ADOPTED_STRICT_QA_PENDING"
            : hookPrototypeCurrent
              ? "CURRENT_PENDING_HUMAN_MODALITY_REVIEW"
            : "STALE_OR_INVALID",
          path: reviewState.hookPrototypePath,
          sha256: reviewState.hookPrototypeSha256,
          svgSha256: reviewState.hookSvgSha256,
          pngSha256: reviewState.hookPngSha256,
          canonicalAssetReplaced: hookAdoptionCurrent,
          localChecks: hookPrototype.localChecks,
          ...(hookAdoption
            ? {
                adoptionPath: reviewState.hookAdoptionPath,
                adoptionSha256: reviewState.hookAdoptionSha256,
                adoptedImageSha256: hookAdoption.bindings?.pngSha256 ?? null,
              }
            : {}),
        }
      : { state: "MISSING" },
    hookDeterministicPrototypeV2: hookV2Prototype
      ? {
          state: hookV2AdoptionCurrent
            ? hookV2AdoptedReview?.approved
              ? "ADOPTED_STRICT_QA_PASS"
              : hookV2AdoptedReview
                ? "ADOPTED_STRICT_QA_FAIL"
                : "ADOPTED_STRICT_QA_PENDING"
            : hookV2PrototypeCurrent
              ? "CURRENT_PENDING_EXACT_HASH_MODALITY_REVIEW"
              : "STALE_OR_INVALID",
          path: reviewState.hookV2PrototypePath,
          sha256: reviewState.hookV2PrototypeSha256,
          svgSha256: reviewState.hookV2SvgSha256,
          pngSha256: reviewState.hookV2PngSha256,
          canonicalAssetReplaced: hookV2AdoptionCurrent,
          localChecks: hookV2Prototype.localChecks,
          ...(hookV2AdoptionCurrent
            ? {
                adoptionPath: reviewState.hookAdoptionPath,
                adoptionSha256: reviewState.hookAdoptionSha256,
                adoptedImageSha256: hookAdoption.bindings?.pngSha256 ?? null,
                strictQaReview: hookV2AdoptedReview ?? null,
              }
            : {}),
        }
      : { state: "MISSING" },
    hookDeterministicPrototypeV3: hookV3Prototype
      ? {
          state: hookV3AdoptionCurrent
            ? hookV3AdoptedReview?.approved
              ? "ADOPTED_STRICT_QA_PASS"
              : hookV3AdoptedReview
                ? "ADOPTED_STRICT_QA_FAIL"
                : "ADOPTED_STRICT_QA_PENDING"
            : hookV3PrototypeCurrent
              ? "CURRENT_PENDING_EXACT_HASH_MODALITY_REVIEW"
              : "STALE_OR_INVALID",
          path: reviewState.hookV3PrototypePath,
          sha256: reviewState.hookV3PrototypeSha256,
          svgSha256: reviewState.hookV3SvgSha256,
          pngSha256: reviewState.hookV3PngSha256,
          canonicalAssetReplaced: hookV3AdoptionCurrent,
          localChecks: hookV3Prototype.localChecks,
          ...(hookV3AdoptionCurrent
            ? {
                adoptionPath: reviewState.hookAdoptionPath,
                adoptionSha256: reviewState.hookAdoptionSha256,
                adoptedImageSha256: hookAdoption.bindings?.pngSha256 ?? null,
                strictQaReview: hookV3AdoptedReview ?? null,
              }
            : {}),
        }
      : { state: "MISSING" },
    hookDeterministicPrototypeV4: hookV4Prototype
      ? {
          state: hookV4AdoptionCurrent
            ? hookV4AdoptedReview?.approved
              ? "ADOPTED_STRICT_QA_PASS"
              : hookV4AdoptedReview
                ? "ADOPTED_STRICT_QA_FAIL"
                : "ADOPTED_STRICT_QA_PENDING"
            : hookV4PrototypeCurrent
              ? "CURRENT_PENDING_EXACT_HASH_MODALITY_REVIEW"
              : "STALE_OR_INVALID",
          path: reviewState.hookV4PrototypePath,
          sha256: reviewState.hookV4PrototypeSha256,
          svgSha256: reviewState.hookV4SvgSha256,
          pngSha256: reviewState.hookV4PngSha256,
          canonicalAssetReplaced: hookV4AdoptionCurrent,
          localChecks: hookV4Prototype.localChecks,
          ...(hookV4AdoptionCurrent
            ? {
                adoptionPath: reviewState.hookAdoptionPath,
                adoptionSha256: reviewState.hookAdoptionSha256,
                adoptedImageSha256: hookAdoption.bindings?.pngSha256 ?? null,
                strictQaReview: hookV4AdoptedReview ?? null,
              }
            : {}),
        }
      : { state: "MISSING" },
    historicalOrStaleGeneratedImageCount: generatedImages.length - currentGeneratedImages.length,
    narrationRequirement: "SUPPLIED_HUMAN_VOICE_REQUIRED_BY_PROFILE",
    possibleReuse: hasCurrentProductionInputs
      ? planPresent
        ? preImageReady
          ? "CURRENT_NARRATION_AUDIO_TIMING_PLAN_PROMPTS_QA"
          : "CURRENT_NARRATION_AUDIO_TIMING_PLAN_PROMPTS"
        : "CURRENT_NARRATION_AUDIO_TIMING"
      : staleProvenance
        ? "NONE_FROM_NARRATION_AUDIO_TIMING_CHAIN; preserve files as historical evidence only"
        : audioHash
          ? "AUDIO_REUSE_REQUIRES_CURRENT_SOURCE_PROVENANCE_PROOF"
          : "NONE_FOR_MISSING_NARRATION",
    regenerationRequirement: hasCurrentProductionInputs
      ? "NONE"
      : staleProvenance
        ? "SOURCE_TO_NARRATION_TO_SELECTED_AUDIO_TO_TIMING_ATOMIC_RENEWAL"
        : "PROVISION_MISSING_NARRATION_AND_REBUILD_ATOMIC_TIMING_CHAIN",
    estimatedProviderCost: null,
    conservativeSyntheticTtsCostUsd: hasCurrentProductionInputs ? 0 : conservativeTtsCostUsd,
    conservativeSyntheticTtsCostEur: hasCurrentProductionInputs ? 0 : round(conservativeTtsCostUsd * conservativeEurPerUsd),
    syntheticTtsAuthorized: false,
    downstreamInvalidations: hasCurrentProductionInputs
      ? []
      : ["timing", "semantic-plan", "provider-prompts", "admission", "QA-cache"],
    workspace,
  };
}

async function discoverCostSummaryRoots(directory, relative = "episodes") {
  const excluded = new Set(["review-packs", "reviews", "output", "state", "generated-assets", "node_modules"]);
  const roots = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || excluded.has(entry.name)) continue;
    const child = path.join(directory, entry.name);
    if (entry.name === "debug" && await exists(path.join(child, "openai-calls"))) {
      roots.push({ absolute: path.dirname(child), relative: path.posix.dirname(path.posix.join(relative, entry.name)) });
      continue;
    }
    roots.push(...await discoverCostSummaryRoots(child, path.posix.join(relative, entry.name)));
  }
  return roots;
}

async function buildCostLedger() {
  const roots = await discoverCostSummaryRoots(episodesRoot);
  const entries = [];
  for (const root of roots.sort((left, right) => left.relative.localeCompare(right.relative))) {
    const summary = await readJson(path.join(root.absolute, "openai-cost-summary.json"));
    if (!summary) continue;
    entries.push({
      episodeRoot: root.relative,
      provider: "openai",
      paidProviderCalls: summary.calls?.paidProviderCalls ?? 0,
      successfulProviderCalls: summary.calls?.successfulProviderCalls ?? 0,
      failedProviderCalls: summary.calls?.failedProviderCalls ?? 0,
      unpricedProviderCalls: summary.calls?.unpricedProviderCalls ?? 0,
      knownEstimatedCostUsd: summary.knownEstimatedCostUsd ?? 0,
      totalEstimatedCostUsd: summary.totalEstimatedCostUsd ?? null,
      costCoverage: summary.costCoverage ?? "NONE",
      summaryPath: path.posix.join(root.relative, "openai-cost-summary.json"),
      unpricedOperations: Object.entries(summary.byOperation ?? {})
        .filter(([, value]) => value.unpricedProviderCalls > 0)
        .map(([operation, value]) => ({ operation, calls: value.unpricedProviderCalls })),
    });
  }
  const knownEstimatedCostUsd = round(entries.reduce((sum, entry) => sum + entry.knownEstimatedCostUsd, 0));
  const reservations = (await Promise.all(
    costReservationPaths.map((reservationPath) => readJson(path.join(repositoryRoot, reservationPath))),
  )).filter(Boolean);
  const newSpendUsd = round(reservations.reduce(
    (sum, reservation) => sum + (
      reservation.actualCost?.totalCostUsd ??
      reservation.actualCost?.conservativeChargedUsd ??
      0
    ),
    0,
  ));
  const newSpendEur = round(reservations.reduce(
    (sum, reservation) => sum + (
      reservation.actualCost?.canonicalCostEur ??
      reservation.actualCost?.conservativeChargedEur ??
      0
    ),
    0,
  ));
  const historicalCostUsd = round(knownEstimatedCostUsd - newSpendUsd);
  const historicalCostEur = round(historicalCostUsd * conservativeEurPerUsd);
  const loggedUnpricedProviderCalls = entries.reduce((sum, entry) => sum + entry.unpricedProviderCalls, 0);
  const paidProviderCalls = entries.reduce((sum, entry) => sum + entry.paidProviderCalls, 0);
  const failedProviderCalls = entries.reduce((sum, entry) => sum + entry.failedProviderCalls, 0);
  const knownCanonicalCostEur = round(knownEstimatedCostUsd * conservativeEurPerUsd);
  const reconciliationEvidencePath = "docs/reports/codex-runs/2026-08-12-veronica-en-cost-reconciliation-evidence.json";
  const reconciliationEvidence = await readJson(path.join(repositoryRoot, reconciliationEvidencePath));
  const reconciledZeroCostCalls = reconciliationEvidence?.unpricedCalls?.reconciledZeroCostCalls ?? 0;
  const unpricedProviderCalls = Math.max(0, loggedUnpricedProviderCalls - reconciledZeroCostCalls);
  const remainingBudgetEur = round(budgetCeilingEur - knownCanonicalCostEur);
  const reservationsStillHeldEur = round(reservations.reduce((sum, reservation) => sum + (
    reservation.reservationReconciliation?.stillHeldEur ??
    (reservation.status === "HELD" ? reservation.limits?.canonicalCeilingEur ?? 0 : 0)
  ), 0));
  return {
    schemaVersion: "veronica-en-portfolio-cost-ledger.v2",
    generatedAt,
    canonicalCurrency: "EUR",
    budgetCeilingEur,
    budgetAuthorizations: {
      original: { amount: originalBudgetCeilingEur, currency: "EUR" },
      incremental: {
        amount: additionalBudgetAuthorizationUsd,
        currency: "USD",
        conservativeCanonicalAmountEur: round(additionalBudgetAuthorizationEur),
      },
      policy: "The incremental USD allowance is added to, not substituted for, the original EUR ceiling.",
    },
    providerCurrency: "USD",
    conversion: {
      observationDate: "2026-08-11",
      source: "European Central Bank reference rate",
      sourceUrl: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A",
      observedUsdPerEur: ecbUsdPerEur,
      policy: "Convert USD to EUR at ECB reference, then apply a 10% adverse-FX safety multiplier.",
      safetyMultiplier: conversionSafetyMultiplier,
      conservativeEurPerUsd: round(conservativeEurPerUsd, 9),
    },
    historicalSpendEnteringRun: {
      knownEstimatedCostUsd: historicalCostUsd,
      loggedUnpricedProviderCalls,
      reconciledZeroCostCalls,
      outstandingUnpricedProviderCalls: unpricedProviderCalls,
      knownCanonicalCostEur: historicalCostEur,
      exactCanonicalCostEur: null,
    },
    newSpendThisRun: {
      providerRequests: reservations.reduce(
        (sum, reservation) => sum + (
          reservation.activity?.totalProviderRequests ??
          reservation.activity?.providerCalls ??
          0
        ),
        0,
      ),
      successfulPaidProviderCalls: reservations.reduce(
        (sum, reservation) => sum +
          (reservation.activity?.successfulImages ?? 0) +
          (reservation.activity?.successfulImageQa ?? 0) +
          (reservation.activity?.completedEpisodes?.length ?? 0),
        0,
      ),
      rejectedZeroUsageCalls: reservations.reduce((sum, reservation) => sum + (reservation.activity?.providerRejectedImageQa ?? 0) + (reservation.activity?.malformedImageQa ?? 0), 0),
      costUsd: newSpendUsd,
      costEur: newSpendEur,
    },
    cumulativeSpend: {
      knownEstimatedCostUsd,
      knownCanonicalCostEur,
      exactCanonicalCostEur: null,
      accountingStatus: unpricedProviderCalls > 0 ? "BLOCKED_BUDGET_CURRENCY_ACCOUNTING" : "COMPLETE_CONSERVATIVE",
    },
    remainingBudgetEur: unpricedProviderCalls > 0 ? null : remainingBudgetEur,
    conservativeRemainingBudgetEur: unpricedProviderCalls > 0 ? null : round(remainingBudgetEur - reservationsStillHeldEur),
    reservationsStillHeldEur,
    paidProviderCalls,
    failedProviderCalls,
    unpricedProviderCalls,
    reconciliation: {
      evidencePath: reconciliationEvidencePath,
      status: reconciliationEvidence?.result ?? "NOT_ATTEMPTED",
      httpStatus: reconciliationEvidence?.scopeCheck?.httpStatus ?? null,
      missingScope: reconciliationEvidence?.scopeCheck?.missingScope ?? null,
      loggedUnpricedProviderCalls,
      reconciledZeroCostCalls,
      outstandingUnpricedProviderCalls: unpricedProviderCalls,
      canaryEvidencePath: "docs/reports/codex-runs/2026-08-12-veronica-01a-image-canary-cost-evidence.json",
    },
    entries,
  };
}

function provisioningEntry(entry) {
  return {
    episodeId: entry.episodeId,
    sourceHash: entry.sourceHash,
    locale: entry.locale,
    variant: entry.variant,
    wordCount: entry.wordCount,
    targetWpm: entry.targetWpm,
    expectedDurationSeconds: entry.expectedDurationSeconds,
    narrationRequirement: entry.narrationRequirement,
    selectedAudioStatus: entry.selectedAudioHash ? (entry.provenanceState === "CONSISTENT" ? "CURRENT" : "STALE_OR_UNPROVEN") : "MISSING",
    timingStatus: entry.timingHash ? (entry.provenanceState === "CONSISTENT" ? "CURRENT" : "STALE_OR_UNPROVEN") : "MISSING",
    provenanceStatus: entry.provenanceState,
    possibleReuse: entry.possibleReuse,
    regenerationRequirement: entry.regenerationRequirement,
    estimatedProviderCost: entry.estimatedProviderCost,
    conservativeProviderCost: {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      costUsd: entry.conservativeSyntheticTtsCostUsd,
      costEur: entry.conservativeSyntheticTtsCostEur,
      authorized: entry.syntheticTtsAuthorized,
      note: "Planning estimate only; Veronica profile disables synthetic narration without explicit approval.",
    },
    downstreamInvalidations: entry.downstreamInvalidations,
    inputClass: entry.provenanceState === "CONSISTENT"
      ? "REUSABLE_VALID_ASSETS"
      : entry.provenanceState === "STALE_ATOMIC_CHAIN"
        ? "STALE_PROVENANCE"
        : entry.productionInputStatus === "MISSING_TIMING"
          ? "MISSING_TIMING_ONLY"
          : "GENUINELY_MISSING_NARRATION",
  };
}

function censusMarkdown(census) {
  const rows = census.episodes.map((entry) => [
    entry.episodeId,
    entry.variant,
    entry.sourceHash.slice(0, 12),
    entry.wordCount,
    entry.productionInputStatus,
    entry.plannerInputStatus,
    entry.deterministicAdmissionState,
    entry.existingQaState,
    entry.blockerClass,
  ].map((value) => String(value).replaceAll("|", "\\|")).join(" | "));
  return [
    "# Veronica English production-readiness census",
    "",
    `Generated: ${census.generatedAt}`,
    "",
    `Summary: ${census.summary.englishSources} sources; ${census.summary.deterministicPass} deterministic PASS; ${census.summary.deterministicBlock} BLOCK; ${census.summary.fullyPreImageReady} fully pre-image ready; ${census.summary.canaryImagesGenerated} canary images generated; ${census.summary.missingProductionInputs} missing inputs; ${census.summary.staleProvenance} stale provenance; ${census.summary.imageComplete} image-complete.`,
    "",
    "| Episode | Variant | Source hash | Words | Production input | Planner input | Admission | QA | Blocker class |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
    "Superseded artifacts remain preserved; see the JSON census for paths and reasons.",
    "",
  ].join("\n");
}

async function writeJson(relativePath, value) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const sources = await discoverSources();
  const duplicateIds = sources.filter((entry, index) => sources.findIndex((candidate) => candidate.episodeId === entry.episodeId) !== index);
  if (duplicateIds.length > 0) throw new Error(`Duplicate active episode IDs: ${duplicateIds.map((entry) => entry.episodeId).join(", ")}`);
  const episodes = [];
  for (const source of sources) episodes.push(await inspectEpisode(source));
  const costLedger = await buildCostLedger();
  const summary = {
    englishSources: episodes.length,
    deterministicPass: episodes.filter((entry) => entry.deterministicAdmissionState === "PASS").length,
    deterministicBlock: episodes.filter((entry) => entry.deterministicAdmissionState === "BLOCK").length,
    fullyPreImageReady: episodes.filter((entry) => entry.fullyPreImageReady).length,
    imageComplete: episodes.filter((entry) => entry.imageComplete).length,
    missingProductionInputs: episodes.filter((entry) =>
      entry.productionInputStatus !== "CURRENT_ATOMIC_CHAIN" &&
      entry.provenanceState !== "STALE_ATOMIC_CHAIN"
    ).length,
    staleProvenance: episodes.filter((entry) => entry.blockerClass === "PROVENANCE_STALE").length,
    staleAtomicChains: episodes.filter((entry) => entry.provenanceState === "STALE_ATOMIC_CHAIN").length,
    episodeSpecificFailures: episodes.filter((entry) => entry.blockerClass === "EPISODE_SPECIFIC").length,
    editorialHumanDecisions: episodes.filter((entry) => entry.blockerClass === "EDITORIAL_HUMAN_DECISION").length,
    canaryImagesGenerated: episodes.reduce((sum, entry) => sum + entry.imageCount, 0),
  };
  const unexpectedHumanOrEpisodeSpecific = episodes.filter(
    (entry) =>
      ["EPISODE_SPECIFIC", "EDITORIAL_HUMAN_DECISION"].includes(entry.blockerClass) &&
      entry.episodeId !== "01a-revenue-is-not-a-good-business",
  );
  if (
    summary.englishSources !== 48 ||
    summary.deterministicPass !== 1 ||
    summary.staleAtomicChains !== 14 ||
    summary.staleProvenance !== 14 ||
    episodes.some((entry) =>
      entry.productionInputStatus === "CURRENT_ATOMIC_CHAIN" &&
      entry.blockerClass === "MISSING_PRODUCTION_INPUT"
    ) ||
    unexpectedHumanOrEpisodeSpecific.length > 0
  ) {
    throw new Error(`Unexpected portfolio census: ${JSON.stringify(summary)}`);
  }
  const census = {
    schemaVersion: "veronica-en-production-readiness-census.v1",
    generatedAt,
    scope: "Active English Markdown sources discovered from configured Pack 2 and editorial-master-v5 source roots",
    discoveryAuthority: sourceRoots.map(({ pack, variant, directory }) => ({ pack, variant, directory })),
    summary,
    staleArtifactsSuperseded: supersededArtifacts,
    episodes,
  };
  const provisioning = {
    schemaVersion: "veronica-en-production-input-provisioning-manifest.v2",
    generatedAt,
    sourceCensusPath: "docs/reports/codex-runs/2026-08-12-veronica-en-production-readiness-census.json",
    voicePolicy: {
      source: "packages/strategic-reinvention/config/creator.veronica-benini.yaml",
      preferred: "creator-recorded",
      syntheticNarrationEnabled: false,
      syntheticNarrationRequiresExplicitApproval: true,
    },
    summary: {
      entries: episodes.length,
      reusableValidAssets: episodes.filter((entry) => entry.provenanceState === "CONSISTENT").length,
      genuinelyMissingNarration: episodes.filter((entry) =>
        entry.productionInputStatus === "MISSING_AUDIO_AND_TIMING" ||
        entry.productionInputStatus === "MISSING_AUDIO_AND_TIMING_RENEWAL"
      ).length,
      missingTimingOnly: episodes.filter((entry) => entry.productionInputStatus === "MISSING_TIMING").length,
      staleProvenance: summary.staleAtomicChains,
      falseWorkspaceResolverBlockers: 0,
    },
    entries: episodes.map(provisioningEntry),
  };
  const nextTranche = {
    schemaVersion: "veronica-en-next-tranche-plan.v1",
    generatedAt,
    tranche: "EN_SHORT_SEMANTIC_ADMISSION_REPAIR",
    episodes: [
      "03b-the-promise-formula",
      "08b-prospecting-without-being-annoying",
      "02b-stop-posting-where-your-customers-arent",
    ],
    operations: [
      "Preserve the three current source/narration/audio/timing chains and v2.4 derived plans",
      "Remove unsupported doorway/public-threshold motif leakage from source-derived hook/payoff treatments",
      "Extend source-grounded promise/experience semantic mechanisms and explicit transition-state extraction without source edits",
      "Replay 03b first; continue to 08b and 02b only after deterministic semantic and provider readiness pass",
    ],
    providers: [
      { provider: "none", model: "deterministic-template", reasoning: "not-applicable", purpose: "systemic semantic-admission repair", maxRequests: 0 },
    ],
    maxRequests: 0,
    estimatedCostUsd: 0,
    estimatedCostEur: 0,
    conservativeCeilingUsd: 0,
    conservativeCeilingEur: 0,
    successCriteria: [
      "03b validation, semanticQuality, and providerReadiness all pass without source edits",
      "No unsupported cross-episode motif or unresolved promise semantics remain",
      "Current source/audio hashes and measured 57.8-second timing identity remain intact",
      "08b and 02b reproduce the same systemic fix without episode-specific overrides",
    ],
    stopConditions: [
      "The same focused failure survives two targeted fixes",
      "More than three fixtures require edits or an assertion/gate would need weakening",
      "Any provider request is proposed before deterministic readiness",
      "Any source text, selected audio, or current timing identity would be invalidated",
    ],
    authorizationRequired: null,
  };
  const canary = episodes.find((entry) => entry.episodeId === "01a-revenue-is-not-a-good-business");
  const consolidatedRun = {
    schemaVersion: "veronica-en-autonomous-production-readiness-run.v1",
    generatedAt,
    finalState: "BLOCKED_SYSTEMIC",
    portfolio: summary,
    canary01a: {
      sourceHash: canary.sourceHash,
      narrationHash: canary.timingNarrationHash,
      selectedAudioHash: canary.selectedAudioHash,
      timingHash: canary.timingHash,
      durationSeconds: canary.durationSeconds,
      wordsPerMinute: round((canary.wordCount / canary.durationSeconds) * 60, 1),
      deterministicQa: { scenes: "8/8 PASS", beats: "13/13 PASS", sequence: "PASS" },
      paidQa: {
        preImageAcceptedCalls: 6,
        imageQaAttempts: 13,
        imageQaCompletedCalls: 9,
        imageQaApprovedCalls: 1,
        imageQaRejectedOrMalformedZeroUsageCalls: 4,
        model: "gpt-5.4-mini",
      },
      currentReviewPack: { overallValidity: true, humanHashBoundApproval: true },
      imageCanary: "3/3 PIXELS CURRENT; S02-B01 STRICT QA PASS; ADOPTED HOOK-B04 V4 DIAGRAM STRICT QA FAIL; S01-B02 WITHHELD",
      completeImageSet: "NOT_RUN",
      blocker: "Four bounded HOOK-B04 diagram variants failed strict admission. V4 preserved the legible 19:1 output but the separate blocked-order consequence still required narration (semantic 0.66, instant-read 0.62, narration support 0.58). Further automated diagram retries are stopped pending a different human-selected metaphor.",
    },
    systemicRemediation: [
      {
        rootCause: "The narration canary surface used a legacy noncreator dispatch context and the recensus mislabeled current audio/timing chains without visual plans as missing production inputs.",
        change: "Add an exact-authorization, one-call-per-episode narration canary with durable reservation/cache/timing provenance and classify current chains independently from downstream visual-plan state.",
        regression: "veronica-narration-canary focused tests, CLI typecheck/build, exact source/audio/timing hash checks, and recensus invariants",
        result: "PASS; 3/3 requests completed with no retry and all atomic chains are current",
      },
      {
        rootCause: "Paragraph-level source segmentation manufactured generic duration-filler scenes for multi-sentence Shorts.",
        change: "Use sentence-aware balanced source beats and bump the derived-plan identity to v2.4.",
        regression: "visual-plan-resolver focused tests",
        result: "PASS 9/9; 03b/08b/02b plans contain only source-derived scenes",
      },
      {
        rootCause: "Density and adjacency gates treated unresolved sentences and the unclassified 'other' action family as proof of semantic duplication.",
        change: "Count only resolved proposition identities for density and exclude unknown action classifications from equality evidence.",
        regression: "veronica-visual-beats and veronica-sequence-diversity focused tests",
        result: "PASS 22/22; all three provider-free preparation canaries completed",
      },
      {
        rootCause: "Streaming WAV unknown-length sentinels were interpreted as literal audio size, and HELD reservations were omitted from conservative remaining budget.",
        change: "Clamp WAV data to completed bytes, discover reservations dynamically, and subtract HELD canonical ceilings.",
        regression: "Affected-package builds, three timing rematerializations, duration/hash checks, and recensus ledger checks",
        result: "PASS; durations restored to 57.8/65.8/68.2 seconds and the unused QA reservation released in full",
      },
      {
        rootCause: "Reviewed beat overrides were being diversified after review.",
        change: "Lock reviewed beat IDs during deterministic sequence refinement.",
        regression: "veronica-visual-beats and veronica-sequence-diversity focused tests",
        result: "PASS",
      },
      {
        rootCause: "Grounded economic/audience actions collapsed into repeated visual families.",
        change: "Expand proposition-preserving action and presentation families without prompt-only variation.",
        regression: "veronica-sequence-diversity focused tests",
        result: "PASS",
      },
      {
        rootCause: "Prompt hierarchy checks treated negated/per-clause hierarchy language as inversion.",
        change: "Clause-aware hierarchy polarity and negation handling.",
        regression: "veronica-image-prompt-compiler focused tests",
        result: "PASS",
      },
      {
        rootCause: "Malformed strict-schema cache records could suppress an explicitly authorized bounded retry.",
        change: "Require an explicit retry flag and preserve budget limits and audit records.",
        regression: "source-grounded-visual-qa and CLI composition focused tests",
        result: "PASS",
      },
      {
        rootCause: "Legacy remediation ownership and incomplete locale trees could corrupt deterministic materialization.",
        change: "Explicit rebase option, complete-locale checks, and fail-closed persistence.",
        regression: "adapter, CLI, resolver, and visual-beat focused tests",
        result: "PASS",
      },
      {
        rootCause: "The bounded combined-run total was being mistaken for the global historical ledger.",
        change: "Aggregate every durable active/archived call summary and store provider USD plus conservative canonical EUR.",
        regression: "Recensus invariant checks and cost-ledger path reconciliation",
        result: "PASS; 9 failed calls retained and reconciled to USD 0 from zero organization usage in every affected minute",
      },
      {
        rootCause: "The post-generation Responses evaluator sent an unsupported temperature parameter to gpt-5.4-mini.",
        change: "Remove temperature from the evaluator configuration and provider request while retaining reasoning and output-token controls.",
        regression: "Affected-package TypeScript build; provider retry intentionally withheld at the request ceiling.",
        result: "PASS (build); live replacement QA pending authorization",
      },
      {
        rootCause: "The former QA-existing resume route still entered image planning, so plan-hash drift could trigger generation.",
        change: "Route existing-pixel QA through a separate sequential hash-verifying path that never constructs the image generator and forbids force/regeneration.",
        regression: "images-resume-command focused test",
        result: "PASS 7/7",
      },
      {
        rootCause: "A reviewed code-native diagram could not become a canonical scene asset through a resumable, provenance-bound operation.",
        change: "Add one-scene deterministic adoption with strict artifact/source/review bindings, failed-pixel archival, atomic replacement, replay safety, immediate QA-only continuation, and a strict union for scene-specific geometry contracts.",
        regression: "images-resume-command focused adoption test, CLI typecheck/build, and recensus adoption identity assertions",
        result: "PASS 9/9; both legacy stepped-path and generalized radial-funnel provenance remain fail-closed",
      },
      {
        rootCause: "HOOK-B04 provider pixels were portrait-dominant generic business imagery, obscuring the withheld-order and weak-unit-economics consequence.",
        change: "Create one noncanonical text-free radial funnel prototype with exact 20 = 19 cost + 1 retained conservation and a separate withheld prospective order.",
        regression: "SVG/PNG hash, dimension, conservation, subtitle-safe, text/external-asset, and visual-distinction checks",
        result: "PASS locally; exact-hash modality review required before adoption or paid QA",
      },
      {
        rootCause: "HOOK-B04 v1's abstract order disk left narration support below the strict threshold despite passing must-show and causal checks.",
        change: "Replace the abstract disk in a noncanonical v2 prototype with two matching parcel/payment bundles separated by a raised physical stop; retain the radial cost grammar and exact conservation.",
        regression: "V2 SVG/PNG hashes, dimensions, output-pellet conservation, subtitle-safe, text/external-asset, likeness, visual-distinction checks, and chained-adoption focused test",
        result: "PASS locally and adoption provenance current; strict QA FAIL because four similar cost trays obscured the 19:1 relationship",
      },
      {
        rootCause: "HOOK-B04 v2's four similar cost trays communicated peer categories before the intended 19:1 magnitude.",
        change: "Create a noncanonical v3 with one dominant reservoir containing a regular 5 + 5 + 5 + 4 field and one equal-size pellet isolated in a tiny retained container; preserve the successful order and stop geometry.",
        regression: "V3 SVG/PNG hashes, 864x1536 dimensions, 19 + 1 pellet counts, subtitle-safe bounds, no text/external refs, canonical-asset immutability, visual inspection, and recensus identity assertions",
        result: "PASS locally and adopted; strict QA recognized the 19-unit reservoir and one retained unit but narrowly failed because the withheld-order stop remained ambiguous",
      },
      {
        rootCause: "The strict deterministic-adoption union did not yet represent v3's single-reservoir geometry contract.",
        change: "Add a strict v3 schema and route it through the existing chained source/review/adoption/archive checks without weakening any identity or QA gate.",
        regression: "images-resume-command focused test extended through a third chained adoption, CLI typecheck, and CLI build",
        result: "PASS 9/9; canonical v2 adoption and pixels archived; image-provider calls 0",
      },
      {
        rootCause: "HOOK-B04 v3's thin gray stop did not make the withheld second order unmistakable within the strict instant-read window.",
        change: "Create a noncanonical v4 with a wide grounded coral gate, move the matching parcel/payment bundle entirely outside it, reduce hand/arm clutter, and preserve the accepted v3 19:1 output geometry.",
        regression: "V4 hashes, 864x1536 dimensions, exact 19 + 1 count, no text/external refs, canonical-v3 immutability, visual inspection, and recensus identity assertions",
        result: "PASS locally and adopted; strict QA FAIL because the gate/order consequence still required narration, so the automated diagram-iteration loop is stopped",
      },
      {
        rootCause: "The strict deterministic-adoption union did not yet represent v4's grounded-gate geometry contract.",
        change: "Add a strict v4 schema and preserve the same chained source/review/adoption/archive invariants.",
        regression: "images-resume-command focused test extended through four chained versions, CLI typecheck, and CLI build",
        result: "PASS 9/9; canonical v3 adoption and pixels archived; image-provider calls 0",
      },
      {
        rootCause: "The evaluator relied on prompted JSON and did not persist Responses usage evidence.",
        change: "Use strict Responses text.format json_schema and write episode-local pre-dispatch/terminal usage logs.",
        regression: "veronica-post-generation-visual-qa focused test",
        result: "PASS 4/4; verified against official OpenAI structured-output documentation",
      },
      {
        rootCause: "A failed-review remediation could not start directly from persisted QA instructions without spending first on the base prompt.",
        change: "Add a one-scene, hash-bound remediation-review path that preserves rejected pixels, requires force, and forbids automatic retries.",
        regression: "images-resume-command focused test and CLI typecheck/build",
        result: "PASS 8/8; live path dispatched exactly one image and one QA request",
      },
      {
        rootCause: "Materializing a fully rendered provider prompt as the compiler prompt duplicated provider wrappers.",
        change: "Bind review identity to the prior manifest prompt but construct remediation from the canonical compiler prompt.",
        regression: "Focused test assertion added; not rerun after the final one-line correction because the task verification budget was exhausted.",
        result: "SOURCE FIXED; CLI BUILD PASS",
      },
      {
        rootCause: "The approved S02-B01 conservation treatment existed only in conversational state and was not reproducibly bound to production provenance.",
        change: "Persist a strict operator decision artifact and verify source, semantic plan, review pack, human approval, failed review, prompt, and rejected-pixel hashes before prompt materialization.",
        regression: "images-resume-command focused test and recensus identity assertions",
        result: "PASS; decision state CURRENT_APPROVED",
      },
    ],
    providerActivity: {
      thisRun: {
        qa: { requests: 13, completed: 9, approved: 1, materialFailures: 8, providerRejectedOrMalformedZeroUsage: 4 },
        tts: { requests: 3, completed: 3, failed: 0 },
        images: { requests: 6, successful: 6, unauthorizedDuringQaOnly: 1 },
        thumbnails: 0,
        renders: 0,
        publication: 0,
        playlists: 0,
      },
      cacheReuse: { adoptedExistingPixelsCurrent: 3, currentAuthorizedReplacementPixels: 0, narrationCacheHits: 0, qaCacheMisses: 9, retries: 0, reservationsCreated: 13, reservationsReleasedBeforeDispatch: 1, reservationsStillHeld: 0 },
      cumulativeOpenAiPaidCalls: costLedger.paidProviderCalls,
      cumulativeLoggedTerminalFailedCalls: costLedger.failedProviderCalls,
      historicalLoggedUnpricedCalls: costLedger.reconciliation.loggedUnpricedProviderCalls,
      historicalReconciledZeroCostCalls: costLedger.reconciliation.reconciledZeroCostCalls,
      historicalUnpricedCalls: costLedger.unpricedProviderCalls,
    },
    cost: costLedger,
    remainingBlockers: {
      BUDGET_UNAVAILABLE: [],
      PROVENANCE_STALE: [`${summary.staleAtomicChains} source/narration/audio/timing chains require atomic renewal.`],
      MISSING_PRODUCTION_INPUT: [`${summary.missingProductionInputs} episodes genuinely lack a current narration/audio/timing chain.`],
      CONFIGURATION: [],
      SYSTEMIC_ALGORITHM: ["The three narration canaries have current plans but fail deterministic provider admission: unsupported doorway motif leakage and unresolved promise/experience semantics; 08b also has one harmful adjacent repetition."],
      EPISODE_SPECIFIC: [],
      EDITORIAL_HUMAN_DECISION: ["HOOK-B04 needs a different human-selected metaphor; no fifth automated diagram iteration is justified."],
      AUTHORIZATION_BOUNDARY: ["A 03b paid-QA reservation was released in full because deterministic admission stopped dispatch before any provider call."],
    },
    nextAction: nextTranche,
    staleArtifactsSuperseded: supersededArtifacts,
  };
  await Promise.all([
    writeJson("docs/reports/codex-runs/2026-08-12-veronica-en-production-readiness-census.json", census),
    fs.writeFile(path.join(reportsRoot, "2026-08-12-veronica-en-production-readiness-census.md"), censusMarkdown(census), "utf8"),
    writeJson("docs/reports/codex-runs/2026-08-12-veronica-en-production-input-provisioning-manifest-v2.json", provisioning),
    writeJson("docs/reports/codex-runs/2026-08-12-veronica-en-portfolio-cost-ledger.json", costLedger),
    writeJson("docs/reports/codex-runs/2026-08-12-veronica-en-next-tranche-plan.json", nextTranche),
    writeJson("docs/reports/codex-runs/2026-08-12-veronica-en-autonomous-production-readiness-run.json", consolidatedRun),
  ]);
  process.stdout.write(`${JSON.stringify({ summary, cost: costLedger.cumulativeSpend, outputs: 6 }, null, 2)}\n`);
}

await main();
