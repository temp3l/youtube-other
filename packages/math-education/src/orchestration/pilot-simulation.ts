import fs from "node:fs/promises";
import path from "node:path";
import { createMathCorrelationId } from "@mediaforge/observability";
import { writeJsonAtomic } from "@mediaforge/shared";
import { loadCurriculumRelease } from "../curriculum/release.js";
import {
  buildAllLessonVariants,
  buildLessonVariant,
} from "../lesson/variant-builder.js";
import { validateVariantDifferentiation } from "../lesson/lesson-validator.js";
import { createMetadataTimingEvidence, createTimingManifest } from "../lesson/timing.js";
import { localizeNarration } from "../localization/localization.js";
import {
  assertLocalizedDisplayVerification,
  localizedDisplayChecks,
} from "../localization/display-verification.js";
import { loadMathGlossary } from "../localization/glossary.js";
import { MATH_SPEECH_FORMAT_VERSION } from "../localization/tts-lexicon.js";
import {
  createMathMetadataEvidence,
  createMetadataWorkflowEvidence,
  createReviewedMetadataContext,
  generateMathMetadata,
  mathPlaylistCatalog,
  MATH_PLAYLIST_CATALOG_VERSION,
} from "../metadata/math-metadata.js";
import { deriveMathQuality, qualityCheck, mathQualityReportSchema } from "./quality-gate.js";
import {
  createVerifierRequest,
  SympyVerifierAdapter,
} from "../verification/sympy-adapter.js";
import { assertFactCoverage } from "../verification/fact-coverage-gate.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { verifierResponseSchema } from "../verification/protocol-schemas.js";
import { MathWorkspacePathResolver } from "./math-workspace-paths.js";
import { type MathArtifactSchemaVersion } from "./artifact-schemas.js";
import {
  MATH_LANGUAGES,
  type LessonVariant,
  type MathLanguage,
} from "../domain/index.js";
import {
  createArtifactLineage,
  loadWorkflowManifest,
  MATH_STAGES,
  outputsAreValid,
  readAuthoritativeStageArtifact,
  saveWorkflowManifest,
  stageFingerprint,
  withMathFileLock,
  type MathStage,
  type WorkflowManifest,
} from "./workflow.js";

export interface PilotSimulationOptions {
  workspaceDir: string;
  repositoryRoot: string;
  skillId?: string;
  variant?: LessonVariant;
  languages?: readonly MathLanguage[];
  pythonExecutable?: string;
  resume?: boolean;
}
export interface PilotSimulationResult {
  lessonId: string;
  workspaceDir: string;
  status: string;
  cached: boolean;
  paidProviderCalled: false;
  artifactPaths: readonly string[];
}

async function runPilotSimulationUnlocked(
  options: PilotSimulationOptions
): Promise<PilotSimulationResult> {
  const root = path.resolve(options.workspaceDir);
  const repositoryRoot = path.resolve(options.repositoryRoot);
  if (root === path.resolve(repositoryRoot, "math-episodes"))
    throw new Error(
      "Simulation requires an explicit non-production workspace."
    );
  const skillId = options.skillId ?? "M5-ZO-001";
  const variant = options.variant ?? "standard";
  const languages = options.languages ?? MATH_LANGUAGES;
  const curriculum = await loadCurriculumRelease(
    path.join(repositoryRoot, "packages/math-education/data/curriculum/v1")
  );
  const skill = curriculum.skills.find((item) => item.skillId === skillId);
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);
  const allVariants = buildAllLessonVariants(skill);
  validateVariantDifferentiation(allVariants);
  const lesson = buildLessonVariant(skill, variant);
  const lessonRoot = path.join(root, lesson.lessonId);
  const lessonPaths = new MathWorkspacePathResolver(lessonRoot);
  const manifestPath = path.join(lessonRoot, "manifest.json");
  const existing = await loadWorkflowManifest(manifestPath);
  const stageFingerprints = new Map<MathStage, string>();
  const stageParents = new Map<MathStage, string[]>();
  const stageCorrelationId = (stage: MathStage) =>
    createMathCorrelationId({
      releaseId: curriculum.release.releaseId,
      skillId,
      lessonId: lesson.lessonId,
      variant,
      stage,
    });
  let parents = [curriculum.releaseHash];
  const canonicalNarrationFingerprint = canonicalHash({
    localizationVersion: "locked-facts.v2",
    speechFormatVersion: MATH_SPEECH_FORMAT_VERSION,
    glossaryHash: loadMathGlossary("de").glossaryHash,
  });
  const localeFingerprint = canonicalHash({
    localizationVersion: "locked-facts.v2",
    speechFormatVersion: MATH_SPEECH_FORMAT_VERSION,
    glossaries: languages.map((language) => ({
      language,
      hash: loadMathGlossary(language).glossaryHash,
    })),
  });
  for (const stage of MATH_STAGES) {
    stageParents.set(stage, parents);
    const fingerprint = stageFingerprint(stage, parents, {
      curriculumReleaseHash: curriculum.releaseHash,
      lessonContentHash: lesson.contentHash,
      languages,
      variant,
      ...(MATH_STAGES.indexOf(stage) >=
      MATH_STAGES.indexOf("canonical-narration")
        ? { canonicalNarrationFingerprint }
        : {}),
      ...(MATH_STAGES.indexOf(stage) >= MATH_STAGES.indexOf("localization")
        ? { localeFingerprint }
        : {}),
      ...(MATH_STAGES.indexOf(stage) >= MATH_STAGES.indexOf("metadata-playlists")
        ? {
            metadataVersion: "math-metadata.v2",
            playlistCatalogVersion: MATH_PLAYLIST_CATALOG_VERSION,
            thumbnailSpecVersion: "math-thumbnail-spec.v2",
            thumbnailRendererVersion: "math-thumbnail-renderer.v3",
            brandPolicyVersion: "math-brand-policy.v1",
            publishPacketVersion: "math-publish-dry-run.v2",
          }
        : {}),
    });
    stageFingerprints.set(stage, fingerprint);
    parents = [fingerprint];
  }
  const outputStages = new Set<MathStage>([
    "curriculum-import",
    "lesson-spec",
    "math-verification",
    "canonical-narration",
    "localization",
    "scene-timing",
    "visual-assets",
    "metadata-playlists",
    "quality-gate",
  ]);
  let invalidFrom = 0;
  if (options.resume && existing) {
    invalidFrom = MATH_STAGES.length;
    for (const [index, stage] of MATH_STAGES.entries()) {
      const record = existing.stages.find(
        (candidate) => candidate.stage === stage
      );
      const fingerprintMatches =
        record?.fingerprint === stageFingerprints.get(stage);
      const expectedTerminalStatus =
        stage === "publish"
          ? record?.status === "blocked"
          : stage === "tts" || stage === "render"
            ? record?.status === "skipped"
            : record?.status === "succeeded" || record?.status === "cached";
      const valid =
        Boolean(record && fingerprintMatches && expectedTerminalStatus) &&
        (!outputStages.has(stage) ||
          (await outputsAreValid(lessonRoot, record!)));
      if (!valid) {
        invalidFrom = index;
        break;
      }
    }
  }
  if (options.resume && existing && invalidFrom === MATH_STAGES.length) {
    const quality = await readAuthoritativeStageArtifact({
      root: lessonRoot,
      manifest: existing,
      stage: "quality-gate",
      relativePath: "canonical/quality.json",
      schemaVersion: "math-quality.v2",
      schema: mathQualityReportSchema,
    });
    return {
      lessonId: lesson.lessonId,
      workspaceDir: root,
      status: quality.status,
      cached: true,
      paidProviderCalled: false,
      artifactPaths: existing.stages.flatMap((stage) =>
        stage.outputArtifacts.map((artifact) => artifact.relativePath)
      ),
    };
  }
  await fs.mkdir(path.join(lessonRoot, "canonical"), { recursive: true });
  await fs.mkdir(path.join(lessonRoot, "state"), { recursive: true });
  const shouldWrite = (stage: MathStage) =>
    MATH_STAGES.indexOf(stage) >= invalidFrom;
  const outputs: Array<{
    relativePath: string;
    stage: MathStage;
    schemaVersion: MathArtifactSchemaVersion;
  }> = [];
  const write = async (
    relative: string,
    value: unknown,
    stage: MathStage,
    schemaVersion: MathArtifactSchemaVersion
  ) => {
    if (!shouldWrite(stage)) return;
    const filePath = path.join(lessonRoot, relative);
    await lessonPaths.assertWritable(filePath);
    await writeJsonAtomic(filePath, value);
    outputs.push({ relativePath: relative, stage, schemaVersion });
  };
  await write(
    "canonical/skill.json",
    skill,
    "curriculum-import",
    "curriculum-skill.v1"
  );
  await write(
    "canonical/lesson-variants.json",
    allVariants,
    "lesson-spec",
    "lesson-variants.v1"
  );
  await write(
    "canonical/lesson-spec.json",
    lesson,
    "lesson-spec",
    "lesson-spec.v1"
  );
  const verification = shouldWrite("math-verification")
    ? await new SympyVerifierAdapter({
        workerRoot: path.join(repositoryRoot, "python/math-verifier"),
        ...(options.pythonExecutable
          ? { pythonExecutable: options.pythonExecutable }
          : {}),
      }).verify(
        createVerifierRequest(`${lesson.lessonId}-simulation`, lesson.checks)
      )
    : verifierResponseSchema.parse(
        await lessonPaths.readJson(
          path.join(lessonRoot, "canonical", "verification.json")
        )
      );
  assertFactCoverage(lesson, verification);
  await write(
    "canonical/verification.json",
    verification,
    "math-verification",
    "math-verifier.v3"
  );
  const canonicalNarration = localizeNarration(lesson, "de");
  await write(
    "canonical/narration.de.json",
    canonicalNarration,
    "canonical-narration",
    "math-narration.v2"
  );
  for (const language of languages) {
    const narration =
      language === "de"
        ? canonicalNarration
        : localizeNarration(lesson, language);
    const displayChecks = localizedDisplayChecks(lesson, narration);
    const displayVerification = shouldWrite("localization")
      ? await new SympyVerifierAdapter({
          workerRoot: path.join(repositoryRoot, "python/math-verifier"),
          ...(options.pythonExecutable
            ? { pythonExecutable: options.pythonExecutable }
            : {}),
        }).verify(
          createVerifierRequest(
            `${lesson.lessonId}-${language}-display`,
            displayChecks
          )
        )
      : verifierResponseSchema.parse(
          await lessonPaths.readJson(
            path.join(
              lessonRoot,
              "locales",
              language,
              "display-verification.json"
            )
          )
        );
    assertLocalizedDisplayVerification(displayChecks, displayVerification);
    const timing = createTimingManifest(lesson, narration);
    const metadataTimingEvidence = createMetadataTimingEvidence(
      lesson,
      narration,
      timing
    );
    const metadata = generateMathMetadata({
      reviewedContext: createReviewedMetadataContext(curriculum, skill.skillId),
      skill,
      lesson,
      localization: narration,
      timingEvidence: metadataTimingEvidence,
      workflowEvidence: createMetadataWorkflowEvidence({
        lesson,
        localization: narration,
        timingEvidence: metadataTimingEvidence,
        parentFingerprints: {
          lesson: [stageParents.get("lesson-spec")![0]!],
          localization: [stageParents.get("localization")![0]!],
          timing: [stageParents.get("scene-timing")![0]!],
          output: [stageParents.get("metadata-playlists")![0]!],
        },
      }),
      evidence: createMathMetadataEvidence(skill, lesson, narration),
      catalog: mathPlaylistCatalog,
    });
    await write(
      `locales/${language}/narration.json`,
      narration,
      "localization",
      "math-narration.v2"
    );
    await write(
      `locales/${language}/display-verification.json`,
      displayVerification,
      "localization",
      "math-verifier.v3"
    );
    await write(
      `locales/${language}/timing.json`,
      timing,
      "scene-timing",
      "math-timing.v1"
    );
    await write(
      `locales/${language}/visual-plan.json`,
      {
        artifactVersion: "math-visual-plan.v1",
        profile: skill.canonicalGrade <= 7 ? "grades-5-7-v1" : "grades-8-10-v1",
        scenes: lesson.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          component: scene.visualComponent,
          factIds: scene.factIds,
          teacherAssetVersion: "alex.v1-placeholder",
        })),
      },
      "visual-assets",
      "math-visual-plan.v1"
    );
    await write(
      `locales/${language}/metadata.json`,
      metadata,
      "metadata-playlists",
      "math-metadata.v2"
    );
    await write(
      `locales/${language}/playlist-catalog.json`,
      mathPlaylistCatalog,
      "metadata-playlists",
      "math-playlist-catalog.v1"
    );
  }
  const evidenceHash = (label: string) => canonicalHash({ lessonId: lesson.lessonId, label });
  const quality = deriveMathQuality({
    contractVersion: "math-quality-contract.v2",
    lessonId: lesson.lessonId,
    selectedLocales: [...languages],
    checks: [
      qualityCheck({ checkId: "curriculum", ready: curriculum.readyForProduction, evidenceHash: evidenceHash("curriculum"), message: "Reviewed curriculum evidence." }),
      qualityCheck({ checkId: "mathematics", ready: verification.status === "passed", evidenceHash: evidenceHash("mathematics"), message: "Independent mathematical verification evidence." }),
      qualityCheck({ checkId: "localization", ready: true, evidenceHash: evidenceHash("localization"), assessedLocales: languages, message: "Every selected locale has locked, verified evidence." }),
      qualityCheck({ checkId: "timing", ready: true, evidenceHash: evidenceHash("timing"), message: "Selected locale timelines are valid." }),
      qualityCheck({ checkId: "audio", ready: false, message: "Simulation skipped final audio generation and QA." }),
      qualityCheck({ checkId: "render", ready: false, message: "Simulation skipped final MP4 rendering." }),
      qualityCheck({ checkId: "media-qa-packet", ready: false, message: "Simulation has no validated media-QA packet." }),
      qualityCheck({ checkId: "final-media", ready: false, message: "No schema- and hash-valid final media QA evidence exists." }),
      qualityCheck({ checkId: "publish-packet", ready: false, message: "No final media, approved teacher thumbnail, brand policy, or strict publish preflight exists." }),
      qualityCheck({ checkId: "content-review", ready: true, evidenceHash: evidenceHash("content-review"), message: "No revision blocker was recorded." }),
      qualityCheck({ checkId: "minor-edit-review", ready: true, evidenceHash: evidenceHash("minor-edit-review"), message: "No minor-edit condition was recorded." }),
    ],
  });
  await write(
    "canonical/quality.json",
    quality,
    "quality-gate",
    "math-quality.v2"
  );
  const retainedArtifacts =
    existing?.stages
      .filter((record) => MATH_STAGES.indexOf(record.stage) < invalidFrom)
      .flatMap((record) => record.outputArtifacts) ?? [];
  const createdArtifacts = await Promise.all(
    outputs.map(({ relativePath, stage, schemaVersion }) => {
      const producer =
        stage === "lesson-spec" && schemaVersion === "lesson-spec.v1"
          ? { producer: "lesson-specification-builder", producerVersion: "reviewed-fixtures.v1" }
          : stage === "math-verification" && schemaVersion === "math-verifier.v3"
            ? { producer: "sympy-verifier-adapter", producerVersion: "3.0.0" }
            : stage === "localization" && schemaVersion === "math-narration.v2"
              ? { producer: "locked-fact-localizer", producerVersion: "locked-facts.v2" }
              : stage === "localization" && schemaVersion === "math-verifier.v3"
                ? { producer: "sympy-verifier-adapter", producerVersion: "3.0.0" }
                : stage === "metadata-playlists" && schemaVersion === "math-metadata.v2"
                  ? { producer: "math-metadata-generator", producerVersion: "math-metadata-generator.v3" }
                  : {};
      return createArtifactLineage({
        root: lessonRoot,
        relativePath,
        schemaVersion,
        parentHashes: stageParents.get(stage)!,
        producedBy: stage,
        ...producer,
      });
    })
  );
  const outputArtifacts = [...retainedArtifacts, ...createdArtifacts];
  const now = new Date().toISOString();
  const stageOutputs = (stage: MathStage) =>
    outputArtifacts.filter((artifact) => artifact.producedBy === stage);
  const manifest: WorkflowManifest = {
    artifactVersion: "math-workflow.v2",
    lessonId: lesson.lessonId,
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage, index) => {
      const previous = existing?.stages.find(
        (record) => record.stage === stage
      );
      if (index < invalidFrom && previous)
        return {
          ...previous,
          status:
            previous.status === "succeeded"
              ? ("cached" as const)
              : previous.status,
        };
      return {
        stage,
        correlationId: previous?.correlationId ?? stageCorrelationId(stage),
        status:
          stage === "publish"
            ? ("blocked" as const)
            : ["tts", "render"].includes(stage)
              ? ("skipped" as const)
              : ("succeeded" as const),
        fingerprint: stageFingerprints.get(stage)!,
        parentFingerprints: stageParents.get(stage)!,
        outputArtifacts: stageOutputs(stage),
        updatedAt: now,
        ...(stage === "publish"
          ? { error: "Dry-run manifest only; publishing dispatch is disabled." }
          : {}),
      };
    }),
    failures: existing?.failures ?? [],
  };
  await saveWorkflowManifest(manifestPath, manifest);
  return {
    lessonId: lesson.lessonId,
    workspaceDir: root,
    status: quality.status,
    cached: false,
    paidProviderCalled: false,
    artifactPaths: outputArtifacts.map((output) => output.relativePath),
  };
}

export async function runPilotSimulation(
  options: PilotSimulationOptions
): Promise<PilotSimulationResult> {
  const root = path.resolve(options.workspaceDir);
  const lockName = `${options.skillId ?? "M5-ZO-001"}-${options.variant ?? "standard"}-${(options.languages ?? MATH_LANGUAGES).join("-")}.lock`;
  return withMathFileLock(path.join(root, "state", "locks", lockName), () =>
    runPilotSimulationUnlocked(options)
  );
}
