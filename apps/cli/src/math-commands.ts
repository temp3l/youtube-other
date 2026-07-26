import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  loadMathRuntimeConfig,
  loadRuntimeConfig,
  type RuntimeConfigOverrides,
} from "@mediaforge/config";
import { workflowInstanceSchema } from "@mediaforge/domain";
import {
  buildAllLessonVariants,
  buildLessonVariant,
  canonicalHash,
  createLessonId,
  createMathTaskRegistry,
  createReviewedCurriculumFixture,
  importCurriculumSeed,
  loadCurriculumRelease,
  loadPrivateOwnerAttestation,
  assertPrivateOwnerCurriculumApproval,
  APPROVED_MATH_NARRATION_PRESET,
  assertProductionLessonCapability,
  mathWorkflowDefinition,
  MathWorkspacePathResolver,
  evaluateMinorEditApproval,
  loadWorkflowManifest,
  mathMinorEditApprovalSchema,
  mathBrandPolicyArtifactSchema,
  mathFinalMediaEvidenceSchema,
  canonicalPrivateMediaEvidenceSchema,
  MATH_EXECUTABLE_TASK_IDS,
  MATH_LOCKED_FACT_NARRATION_VERSION,
  reviewGermanStandardNarration,
  mathMetadataSchema,
  mathPlaylistCatalogSchema,
  mathThumbnailArtifactSchema,
  mathPublishDryRunSchema,
  mathQualityReportSchema,
  planMathBatchItems,
  outputsAreValid,
  buildMathEducationalNarrationBeats,
  recordMathEducationalSpeechStage,
  qualityExitCode,
  readAuthoritativeStageArtifact,
  readAuthoritativeBinaryArtifact,
  lessonVariantSpecificationSchema,
  localizedNarrationSchema,
  localizeNarration,
  withMathFileLock,
  runMathBatch,
  runPilotSimulation,
  validateVariantDifferentiation,
  type LessonVariant,
  type MathBatchItem,
  type MathLanguage,
} from "@mediaforge/math-education";
import { writeJsonAtomic } from "@mediaforge/shared";
import {
  buildEducationalSpeechPlan,
  classifyEducationalSpeechError,
  educationalNarrationBeatSchema,
  educationalSpeechLanguageSchema,
  generateEducationalSpeech,
  loadEducationalPronunciationDictionary,
  MockSpeechProvider,
  OpenAiCompatibleSpeechProvider,
  resolveSpeechDeliveryProfile,
  speechDeliveryProfileIdSchema,
  type SpeechProvider,
} from "@mediaforge/speech";
import { createNaturalChalkGoldenFixtures } from "@mediaforge/math-rendering";
import {
  BatchCoordinator,
  BatchStore,
  createDeterministicBatchItemId,
  normalizeWorkflowError,
  type BatchPlanInput,
  type BatchWorkItem,
} from "@mediaforge/workflow-engine";
import {
  CANONICAL_OPENAI_SPEECH_PRICING_VERSION,
  CANONICAL_PRIVATE_NARRATION_SYNC_VERSION,
  createCanonicalMathOperator,
  deriveCanonicalPaidSpeechRate,
  estimateCanonicalPaidSpeechRemainingCost,
  materializeCanonicalPrivateMedia,
  materializeCanonicalPrivateSpeech,
  readCanonicalPaidSpeechUsage,
  type CanonicalPaidSpeechConfiguration,
} from "./math-workflow-runtime.js";
import {
  createMathWorkflowRenderExecution,
  type MathHybridSceneEvent,
  type MathRenderExecutorMode,
  type MathWorkflowRenderExecution,
} from "./math-render-hybrid.js";
import {
  checkMathRemoteWorker,
  cleanupMathRemoteJobs,
  deployMathRemoteWorker,
  inspectMathRemoteLogs,
  inspectMathRemoteStatus,
  parseMathRemoteSettings,
} from "./math-render-remote.js";
import {
  MathPrivateBatchScheduler,
  type MathBatchWorkflowOperator,
} from "./math-private-batch-scheduler.js";

interface MathSelectionOptions {
  skill?: string;
  grade?: string;
  variant?: LessonVariant;
  language?: MathLanguage;
  workspace?: string;
  simulate?: boolean;
  private?: boolean;
  resume?: boolean;
  dryRun?: boolean;
  python?: string;
  openAiBaseUrl?: string;
  openAiApiKey?: string;
  openAiSpeechModel?: string;
  openAiSpeechVoice?: string;
  ttsProvider?: "mock" | "openai-compatible";
  paidSpeech?: boolean;
  maxProviderCostUsd?: number;
  maxProviderCostPerLessonUsd?: number;
  canonicalFirst?: boolean;
  renderExecutor?: MathRenderExecutorMode;
}

interface MathSpeechOptions extends MathSelectionOptions {
  lesson: string;
  workspace: string;
  language: MathLanguage;
  speechProfile: string;
  speechVoice?: string;
  speechRate: number;
  speechCandidates: 1 | 2 | 3;
  speechSelection?: string[];
  regenerateSpeech?: boolean;
  speechDryRun?: boolean;
}

interface MathSpeechCompareOptions extends MathSelectionOptions {
  language: MathLanguage;
  output: string;
  fixture?: string;
  speechVoice?: string;
  speechRate: number;
  speechDryRun?: boolean;
}

export class MathCliSemanticError extends Error {
  readonly exitCode = 3 as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MathCliSemanticError";
  }
}

function repositoryRoot(): string {
  return process.cwd();
}

function isPathWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function repositoryLocalMathPipelineRoot(root = repositoryRoot()): string {
  return path.join(root, ".cache", "math-pipeline");
}

export function isApprovedPrivateMathWorkspace(
  workspacePath: string,
  root = repositoryRoot()
): boolean {
  const workspace = path.resolve(workspacePath);
  const resolvedRoot = path.resolve(root);
  return (
    !isPathWithin(resolvedRoot, workspace) ||
    isPathWithin(repositoryLocalMathPipelineRoot(resolvedRoot), workspace)
  );
}

async function importedCurriculumSeed() {
  const root = repositoryRoot();
  const markdown = await fs.readFile(
    path.join(root, "docs/mathe/curriculum/03-machine-readable-seed.md"),
    "utf8"
  );
  return importCurriculumSeed(markdown);
}
async function curriculum() {
  return loadCurriculumRelease(
    path.join(repositoryRoot(), "packages/math-education/data/curriculum/v1")
  );
}
function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseSpeechRate(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 80 || parsed > 220)
    throw new Error(
      "--speech-rate must be between 80 and 220 words per minute."
    );
  return parsed;
}

function parseSpeechCandidates(value: string): 1 | 2 | 3 {
  const parsed = Number(value);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3)
    throw new Error("--speech-candidates must be 1, 2, or 3.");
  return parsed;
}

function parseSpeechSelection(
  values: readonly string[] | undefined
): Readonly<Record<string, 1 | 2 | 3>> {
  const result: Record<string, 1 | 2 | 3> = {};
  for (const value of values ?? []) {
    const match = /^(narr-chunk-\d{3,})=([123])$/u.exec(value);
    if (!match?.[1] || !match[2])
      throw new Error(
        `Invalid --speech-selection ${value}; use narr-chunk-001=2.`
      );
    result[match[1]] = match[2] === "1" ? 1 : match[2] === "2" ? 2 : 3;
  }
  return result;
}

function mathSpeechRuntimeOverrides(
  options: MathSelectionOptions
): RuntimeConfigOverrides {
  return {
    ...(options.ttsProvider ? { ttsProvider: options.ttsProvider } : {}),
    ...(options.openAiBaseUrl
      ? { openAiCompatibleBaseUrl: options.openAiBaseUrl }
      : {}),
    ...(options.openAiApiKey
      ? { openAiCompatibleApiKey: options.openAiApiKey }
      : {}),
    ...(options.openAiSpeechModel
      ? { openAiSpeechModel: options.openAiSpeechModel }
      : {}),
    ...(options.openAiSpeechVoice
      ? { openAiSpeechVoice: options.openAiSpeechVoice }
      : {}),
  };
}

function parseProviderCostUsd(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error(
      "--max-provider-cost-usd must be greater than 0 and no more than 100."
    );
  }
  return parsed;
}

function parseProviderCostPerLessonUsd(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error(
      "--max-provider-cost-per-lesson-usd must be greater than 0 and no more than 100."
    );
  }
  return parsed;
}

const CANONICAL_PINNED_SPEECH_MODEL = APPROVED_MATH_NARRATION_PRESET.model;

interface CanonicalPaidSpeechEstimate {
  readonly chunks: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly calls: number;
  readonly characters: number;
  readonly estimatedAudioSeconds: number;
  readonly estimatedCostMicros: number;
  readonly newCostEstimateMicros: number;
  readonly priorCostMicros: number;
  readonly words: number;
  readonly targetWordsPerMinute: number;
  readonly providerSpeed: number;
  readonly model: string;
  readonly voice: string;
  readonly speechProfileVersion: string;
}

interface CanonicalPaidSpeechPreflight {
  readonly configuration: Omit<
    CanonicalPaidSpeechConfiguration,
    "approvedCeilingMicros"
  >;
  readonly estimate: CanonicalPaidSpeechEstimate;
  readonly providerCredentialConfigured: boolean;
}

async function canonicalPaidSpeechPreflight(input: {
  readonly skillId: string;
  readonly lessonVariant: LessonVariant;
  readonly language: MathLanguage;
  readonly workspace?: string;
  readonly requireProvider: boolean;
  readonly options: MathSelectionOptions;
  readonly curriculumRelease?: Awaited<ReturnType<typeof curriculum>>;
}): Promise<CanonicalPaidSpeechPreflight> {
  if (input.lessonVariant !== "standard" || input.language !== "de") {
    throw new Error("Canonical paid speech is restricted to standard/de.");
  }
  const release = input.curriculumRelease ?? (await curriculum());
  const skill = release.skills.find(
    (candidate) => candidate.skillId === input.skillId
  );
  if (!skill) throw new Error(`Unknown curriculum skill: ${input.skillId}`);
  const lesson = buildLessonVariant(skill, input.lessonVariant);
  const narration = localizeNarration(lesson, input.language);
  const words = narration.segments.reduce(
    (total, segment) =>
      total + segment.spokenText.trim().split(/\s+/u).filter(Boolean).length,
    0
  );
  const targetWordsPerMinute = deriveCanonicalPaidSpeechRate({
    words,
    targetDurationSeconds: lesson.targetDurationSeconds,
  });
  const runtime = await loadRuntimeConfig(
    mathSpeechRuntimeOverrides(input.options)
  );
  const profile = resolveSpeechDeliveryProfile(
    "education-natural-teacher",
    input.language,
    {
      model: CANONICAL_PINNED_SPEECH_MODEL,
      voice: APPROVED_MATH_NARRATION_PRESET.voice,
      targetWordsPerMinute,
      providerSpeed: APPROVED_MATH_NARRATION_PRESET.providerSpeed,
    }
  );
  const pronunciationDictionaries =
    await loadEducationalPronunciationDictionary({
      repositoryRoot: repositoryRoot(),
      profile,
    });
  const plan = buildEducationalSpeechPlan({
    episodeId: createLessonId(input.skillId, input.lessonVariant),
    profile,
    beats: buildMathEducationalNarrationBeats(narration),
    pronunciationDictionaries,
  });
  const outputRoot = path.join(
    input.workspace ?? "/tmp/mediaforge-math-paid-plan",
    createLessonId(input.skillId, input.lessonVariant),
    "locales/de/audio/educational-speech"
  );
  const dryRun = await generateEducationalSpeech({
    plan,
    profile,
    pronunciationDictionaries,
    providerId: "openai-compatible",
    providerBaseUrlIdentity: runtime.openAiCompatibleBaseUrl
      ? new URL(runtime.openAiCompatibleBaseUrl).origin
      : "openai-default",
    outputRoot,
    candidateCount: 1,
    dryRun: true,
    maxAttempts: 3,
  });
  if (dryRun.status !== "dry-run")
    throw new Error("Speech plan was not dry-run.");
  const remainingEstimate = estimateCanonicalPaidSpeechRemainingCost({
    targetDurationSeconds: lesson.targetDurationSeconds,
    planChunks: plan.chunks,
    dryRunChunks: dryRun.dryRun.chunks,
    inputCharacters: dryRun.dryRun.estimatedInputCharacters,
    providerRequests: dryRun.dryRun.estimatedProviderRequests,
  });
  const unitRoot = path.join(
    input.workspace ?? "/tmp/mediaforge-math-paid-plan",
    createLessonId(input.skillId, input.lessonVariant)
  );
  const priorUsage = await readCanonicalPaidSpeechUsage(unitRoot);
  const estimatedCostMicros =
    priorUsage.costMicros + remainingEstimate.estimatedCostMicros;
  if (input.requireProvider && !runtime.openAiCompatibleApiKey) {
    throw new Error("Canonical paid speech requires an OpenAI API key.");
  }
  const provider = new OpenAiCompatibleSpeechProvider({
    apiKey: runtime.openAiCompatibleApiKey ?? "preflight-no-provider-key",
    ...(runtime.openAiCompatibleBaseUrl
      ? { baseUrl: runtime.openAiCompatibleBaseUrl }
      : {}),
    ...(runtime.openAiCompatibleOrganization
      ? { organization: runtime.openAiCompatibleOrganization }
      : {}),
    ...(runtime.openAiCompatibleProject
      ? { project: runtime.openAiCompatibleProject }
      : {}),
    model: profile.model,
    voice: profile.voice,
    instructions: profile.instructions,
    speed: profile.providerSpeed,
    responseFormat: profile.postProcessingPolicy.outputFormat,
  });
  return {
    configuration: {
      provider,
      providerBaseUrlIdentity: runtime.openAiCompatibleBaseUrl
        ? new URL(runtime.openAiCompatibleBaseUrl).origin
        : "openai-default",
      profile,
      pronunciationDictionaries,
      pricingVersion: CANONICAL_OPENAI_SPEECH_PRICING_VERSION,
    },
    providerCredentialConfigured: Boolean(runtime.openAiCompatibleApiKey),
    estimate: {
      chunks: dryRun.dryRun.chunks.filter((chunk) => chunk.selected).length,
      cacheHits: dryRun.dryRun.chunks.filter(
        (chunk) => chunk.selected && chunk.cacheStatus === "hit"
      ).length,
      cacheMisses: dryRun.dryRun.chunks.filter(
        (chunk) => chunk.selected && chunk.cacheStatus !== "hit"
      ).length,
      calls: dryRun.dryRun.estimatedProviderRequests,
      characters: dryRun.dryRun.estimatedInputCharacters,
      estimatedAudioSeconds: remainingEstimate.estimatedAudioSeconds,
      estimatedCostMicros,
      newCostEstimateMicros: remainingEstimate.estimatedCostMicros,
      priorCostMicros: priorUsage.costMicros,
      words,
      targetWordsPerMinute,
      providerSpeed: profile.providerSpeed,
      model: profile.model,
      voice: profile.voice,
      speechProfileVersion: profile.version,
    },
  };
}

async function canonicalPaidSpeechSetup(input: {
  readonly skillId: string;
  readonly lessonVariant: LessonVariant;
  readonly language: MathLanguage;
  readonly ceilingMicros: number;
  readonly workspace?: string;
  readonly requireProvider: boolean;
  readonly options: MathSelectionOptions;
}): Promise<{
  readonly configuration: CanonicalPaidSpeechConfiguration;
  readonly estimate: CanonicalPaidSpeechEstimate & {
    readonly remainingBudgetMicros: number;
  };
}> {
  const preflight = await canonicalPaidSpeechPreflight(input);
  if (preflight.estimate.estimatedCostMicros > input.ceilingMicros) {
    throw new Error(
      `Estimated provider cost USD ${(preflight.estimate.estimatedCostMicros / 1_000_000).toFixed(6)} exceeds the hard ceiling USD ${(input.ceilingMicros / 1_000_000).toFixed(6)}.`
    );
  }
  return {
    configuration: {
      ...preflight.configuration,
      approvedCeilingMicros: input.ceilingMicros,
    },
    estimate: {
      ...preflight.estimate,
      remainingBudgetMicros:
        input.ceilingMicros - preflight.estimate.priorCostMicros,
    },
  };
}

async function runMathSpeechGenerate(
  options: MathSpeechOptions
): Promise<void> {
  const profileId = speechDeliveryProfileIdSchema.parse(options.speechProfile);
  const paths = new MathWorkspacePathResolver(options.workspace);
  const lessonRoot = paths.lesson(options.lesson);
  const manifestPath = paths.manifest(options.lesson);
  const manifest = await loadWorkflowManifest(manifestPath);
  if (!manifest || manifest.lessonId !== options.lesson)
    throw new Error(
      `Missing or identity-mismatched workflow manifest for ${options.lesson}.`
    );
  const narrationRelativePath = `locales/${options.language}/narration.json`;
  const narration = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "localization",
    relativePath: narrationRelativePath,
    schemaVersion: "math-narration.v2",
    schema: localizedNarrationSchema,
  });
  const lesson = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "lesson-spec",
    relativePath: "canonical/lesson-spec.json",
    schemaVersion: "lesson-spec.v1",
    schema: lessonVariantSpecificationSchema,
  });
  if (
    narration.language !== options.language ||
    narration.lessonId !== options.lesson ||
    lesson.lessonId !== options.lesson
  )
    throw new Error(
      "Educational speech inputs do not match the requested lesson/language."
    );
  const runtime = await loadRuntimeConfig(mathSpeechRuntimeOverrides(options));
  const model =
    runtime.openAiSpeechModel ??
    runtime.openAiCompatibleModel ??
    "gpt-4o-mini-tts";
  const configuredVoice =
    options.speechVoice ??
    runtime.openAiSpeechVoice ??
    runtime.openAiCompatibleTtsVoice;
  const profile = resolveSpeechDeliveryProfile(profileId, options.language, {
    model,
    ...(configuredVoice ? { voice: configuredVoice } : {}),
    targetWordsPerMinute: options.speechRate,
  });
  const dictionaries = await loadEducationalPronunciationDictionary({
    repositoryRoot: repositoryRoot(),
    profile,
  });
  const plan = buildEducationalSpeechPlan({
    episodeId: options.lesson,
    profile,
    beats: buildMathEducationalNarrationBeats(narration),
    pronunciationDictionaries: dictionaries,
  });
  const outputRoot = path.join(
    paths.locale(options.lesson, options.language),
    "audio",
    "educational-speech"
  );
  const compatibilityOutputPath = path.join(
    paths.locale(options.lesson, options.language),
    "audio",
    "narration.wav"
  );
  const providerId =
    runtime.ttsProvider === "openai-compatible"
      ? ("openai-compatible" as const)
      : ("mock" as const);
  let provider: SpeechProvider | undefined;
  if (!options.speechDryRun) {
    if (runtime.ttsProvider === "openai-compatible") {
      if (!runtime.openAiCompatibleApiKey)
        throw new Error(
          "OpenAI educational speech requires an API key; use --speech-dry-run to inspect without a call."
        );
      provider = new OpenAiCompatibleSpeechProvider({
        apiKey: runtime.openAiCompatibleApiKey,
        ...(runtime.openAiCompatibleBaseUrl
          ? { baseUrl: runtime.openAiCompatibleBaseUrl }
          : {}),
        ...(runtime.openAiCompatibleOrganization
          ? { organization: runtime.openAiCompatibleOrganization }
          : {}),
        ...(runtime.openAiCompatibleProject
          ? { project: runtime.openAiCompatibleProject }
          : {}),
        model: profile.model,
        voice: profile.voice,
        instructions: profile.instructions,
        speed: profile.providerSpeed,
        responseFormat: profile.postProcessingPolicy.outputFormat,
      });
    } else {
      provider = new MockSpeechProvider();
    }
  }
  const candidateSelection = parseSpeechSelection(options.speechSelection);
  const generate = () =>
    generateEducationalSpeech({
      plan,
      profile,
      pronunciationDictionaries: dictionaries,
      providerId,
      ...(provider ? { provider } : {}),
      providerBaseUrlIdentity: runtime.openAiCompatibleBaseUrl
        ? new URL(runtime.openAiCompatibleBaseUrl).origin
        : "openai-default",
      outputRoot,
      compatibilityOutputPath,
      candidateCount: options.speechCandidates,
      candidateSelection,
      regenerate: options.regenerateSpeech ?? false,
      dryRun: options.speechDryRun ?? false,
    });
  const workflowRelativePath = path
    .relative(lessonRoot, path.join(outputRoot, "workflow-log.json"))
    .replace(/\\/gu, "/");
  const audioRelativePath = path
    .relative(lessonRoot, path.join(outputRoot, "narration.wav"))
    .replace(/\\/gu, "/");
  const result = options.speechDryRun
    ? await generate()
    : await withMathFileLock(
        path.join(
          lessonRoot,
          "state",
          "locks",
          `educational-speech-${options.language}.lock`
        ),
        async () => {
          const latestManifest = await loadWorkflowManifest(manifestPath);
          if (!latestManifest || latestManifest.lessonId !== options.lesson)
            throw new Error(
              `Workflow manifest changed before speech generation for ${options.lesson}.`
            );
          const generated = await generate();
          if (generated.status !== "dry-run") {
            await recordMathEducationalSpeechStage({
              lessonRoot,
              manifestPath,
              manifest: latestManifest,
              language: options.language,
              skillId: lesson.skillId,
              variant: lesson.variant,
              plan,
              workflow: generated.workflow,
              workflowRelativePath,
              ...(generated.status === "completed"
                ? { audioRelativePath }
                : {}),
            });
          }
          return generated;
        }
      );
  if (result.status === "dry-run") {
    print({ dryRun: true, providerCalls: 0, writes: 0, ...result.dryRun });
    return;
  }
  if (result.status === "failed") process.exitCode = 1;
  print({
    status: result.status,
    provider: result.workflow.provider,
    model: result.workflow.model,
    voice: result.workflow.voice,
    language: result.workflow.language,
    speechProfile: result.workflow.speechProfile,
    speechProfileVersion: result.workflow.speechProfileVersion,
    cacheHit: result.workflow.cacheHit,
    chunkCount: result.workflow.chunkCount,
    candidateCount: result.workflow.candidateCount,
    outputPath: result.outputPath,
    workflowPath: path.join(outputRoot, "workflow-log.json"),
    warnings: result.workflow.warnings,
    errors: result.workflow.errors,
  });
}

async function runMathSpeechCompare(
  options: MathSpeechCompareOptions
): Promise<void> {
  const language = educationalSpeechLanguageSchema.parse(options.language);
  if (language !== "en" && language !== "de" && !options.fixture)
    throw new Error(
      "The bundled listening comparison fixture is available only for en and de; use --fixture for other languages."
    );
  const fixturePath = path.resolve(
    options.fixture ??
      path.join(
        repositoryRoot(),
        "fixtures",
        "educational-speech",
        `natural-teacher-${language}.json`
      )
  );
  const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as {
    language?: unknown;
    fixtureVersion?: unknown;
    beats?: unknown;
  };
  if (
    rawFixture.language !== language ||
    rawFixture.fixtureVersion !== "educational-speech-listening.v1"
  )
    throw new Error(`Listening fixture identity does not match ${language}.`);
  const beats = educationalNarrationBeatSchema
    .array()
    .min(1)
    .parse(rawFixture.beats);
  const runtime = await loadRuntimeConfig(mathSpeechRuntimeOverrides(options));
  const model =
    runtime.openAiSpeechModel ??
    runtime.openAiCompatibleModel ??
    "gpt-4o-mini-tts";
  const configuredVoice =
    options.speechVoice ??
    runtime.openAiSpeechVoice ??
    runtime.openAiCompatibleTtsVoice;
  const providerId =
    runtime.ttsProvider === "openai-compatible"
      ? ("openai-compatible" as const)
      : ("mock" as const);
  const outputRoot = path.resolve(options.output);
  const generateProfile = async (
    profileId: "education-legacy-baseline" | "education-natural-teacher",
    subdirectory: string
  ) => {
    const profile = resolveSpeechDeliveryProfile(profileId, language, {
      model,
      ...(configuredVoice ? { voice: configuredVoice } : {}),
      targetWordsPerMinute: options.speechRate,
    });
    const dictionaries =
      profileId === "education-natural-teacher"
        ? await loadEducationalPronunciationDictionary({
            repositoryRoot: repositoryRoot(),
            profile,
          })
        : [];
    const plan = buildEducationalSpeechPlan({
      episodeId: `speech-comparison-${language}`,
      profile,
      beats,
      pronunciationDictionaries: dictionaries,
    });
    let provider: SpeechProvider | undefined;
    if (!options.speechDryRun) {
      if (runtime.ttsProvider === "openai-compatible") {
        if (!runtime.openAiCompatibleApiKey)
          throw new Error(
            "OpenAI comparison generation requires an API key; use --speech-dry-run for a free preview."
          );
        provider = new OpenAiCompatibleSpeechProvider({
          apiKey: runtime.openAiCompatibleApiKey,
          ...(runtime.openAiCompatibleBaseUrl
            ? { baseUrl: runtime.openAiCompatibleBaseUrl }
            : {}),
          ...(runtime.openAiCompatibleOrganization
            ? { organization: runtime.openAiCompatibleOrganization }
            : {}),
          ...(runtime.openAiCompatibleProject
            ? { project: runtime.openAiCompatibleProject }
            : {}),
          model: profile.model,
          voice: profile.voice,
          instructions: profile.instructions,
          speed: profile.providerSpeed,
          responseFormat: profile.postProcessingPolicy.outputFormat,
        });
      } else {
        provider = new MockSpeechProvider();
      }
    }
    return generateEducationalSpeech({
      plan,
      profile,
      pronunciationDictionaries: dictionaries,
      providerId,
      ...(provider ? { provider } : {}),
      providerBaseUrlIdentity: runtime.openAiCompatibleBaseUrl
        ? new URL(runtime.openAiCompatibleBaseUrl).origin
        : "openai-default",
      outputRoot: path.join(outputRoot, subdirectory),
      candidateCount: 1,
      dryRun: options.speechDryRun ?? false,
    });
  };
  const baseline = await generateProfile(
    "education-legacy-baseline",
    "legacy-baseline"
  );
  const natural = await generateProfile(
    "education-natural-teacher",
    "natural-teacher"
  );
  if (baseline.status === "failed" || natural.status === "failed")
    process.exitCode = 1;
  print({
    fixture: fixturePath,
    language,
    dryRun: options.speechDryRun ?? false,
    costNotice:
      "Comparison generation runs the same text twice and can incur approximately twice the uncached TTS cost.",
    baseline,
    natural,
  });
}
function selection(command: Command): MathSelectionOptions {
  return command.optsWithGlobals<MathSelectionOptions>();
}

function parseMathRenderExecutor(value: string): MathRenderExecutorMode {
  if (value === "local" || value === "remote" || value === "hybrid")
    return value;
  throw new Error(
    `Invalid math render executor ${value}; expected local, remote, or hybrid.`
  );
}

async function canonicalMathRenderExecution(
  options: MathSelectionOptions,
  workspace: string,
  observer?: (event: MathHybridSceneEvent) => void | Promise<void>
): Promise<MathWorkflowRenderExecution> {
  const config = await loadRuntimeConfig(
    options.renderExecutor ? { mathRenderExecutor: options.renderExecutor } : {}
  );
  return createMathWorkflowRenderExecution({
    config,
    repositoryRoot: repositoryRoot(),
    workspaceRoot: workspace,
    ...(options.renderExecutor ? { explicitMode: options.renderExecutor } : {}),
    ...(observer ? { observer } : {}),
  });
}
function requireSimulationWorkspace(options: MathSelectionOptions): string {
  if (!options.simulate)
    throw new Error(
      "Math generation requires --simulate unless paid providers are explicitly enabled by a future reviewed implementation."
    );
  if (!options.workspace)
    throw new Error(
      "Math simulation requires an explicit --workspace outside the production workspace."
    );
  return options.workspace;
}
async function simulate(options: MathSelectionOptions) {
  return runPilotSimulation({
    repositoryRoot: repositoryRoot(),
    workspaceDir: requireSimulationWorkspace(options),
    skillId: options.skill ?? "M5-ZO-001",
    variant: options.variant ?? "standard",
    ...(options.language ? { languages: [options.language] } : {}),
    ...(options.python ? { pythonExecutable: options.python } : {}),
    ...(options.resume === undefined ? {} : { resume: options.resume }),
  });
}

function canonicalSimulationCurriculumRoot(workspace: string): string {
  return path.join(
    path.resolve(workspace),
    "state",
    "simulation-curriculum-v1"
  );
}
async function ensureCanonicalSimulationCurriculum(
  workspace: string,
  write: boolean
): Promise<string> {
  const root = canonicalSimulationCurriculumRoot(workspace);
  try {
    await fs.access(path.join(root, "release.json"));
  } catch (error) {
    if (!write) {
      throw new Error(
        `Canonical simulation curriculum fixture is missing: ${root}`,
        { cause: error }
      );
    }
    await createReviewedCurriculumFixture(
      root,
      path.resolve("packages/math-education/data/curriculum/v1"),
      { preserveSkillIdentity: true }
    );
  }
  return root;
}
async function canonicalSimulationOperator(input: {
  readonly workspace: string;
  readonly skillId: string;
  readonly lessonVariant: LessonVariant;
  readonly language: MathLanguage;
  readonly python?: string;
  readonly initializeFixture: boolean;
}) {
  const lessonId = createLessonId(input.skillId, input.lessonVariant);
  return createCanonicalMathOperator({
    repositoryRoot: repositoryRoot(),
    workspaceRoot: path.resolve(input.workspace),
    unitId: lessonId,
    skillId: input.skillId,
    lessonVariant: input.lessonVariant,
    locale: input.language,
    contentVariant: "full",
    curriculumRoot: await ensureCanonicalSimulationCurriculum(
      input.workspace,
      input.initializeFixture
    ),
    simulation: true,
    providerMode: "fixture-mock",
    authorizeProvider: true,
    ...(input.python ? { pythonExecutable: input.python } : {}),
  });
}
async function runCanonicalSimulation(
  options: MathSelectionOptions,
  resume: boolean
) {
  const workspace = requireSimulationWorkspace(options);
  const skillId = options.skill ?? "M5-ZO-001";
  const lessonVariant = options.variant ?? "standard";
  const language = options.language ?? "de";
  const operator = await canonicalSimulationOperator({
    workspace,
    skillId,
    lessonVariant,
    language,
    ...(options.python ? { python: options.python } : {}),
    initializeFixture: true,
  });
  if (resume) {
    await operator.reconcile();
    const before = await operator.status();
    if (before.tasks.some((task) => task.persistedStatus === "interrupted")) {
      await operator.resume();
    } else if (before.tasks.some((task) => task.persistedStatus === "failed")) {
      await operator.retryFailed();
    }
  }
  const ready = await operator.status();
  const publishDryRunSucceeded = ready.tasks.some(
    (task) =>
      task.taskId === "math.publish-dry-run" &&
      task.persistedStatus === "succeeded"
  );
  const results =
    ready.nextTaskId === null && publishDryRunSucceeded
      ? []
      : await operator.runNext({ continue: true });
  const status = await operator.status();
  return {
    lessonId: createLessonId(skillId, lessonVariant),
    workspaceDir: path.resolve(workspace),
    status:
      status.tasks.find((task) => task.taskId === "math.publish-dry-run")
        ?.persistedStatus ?? "pending",
    cached: results.length === 0 || results.every((result) => result.cacheHit),
    paidProviderCalled: false,
    stateSource: "workflow-operator",
    results,
    workflow: status,
  };
}
function requirePrivateWorkspace(options: MathSelectionOptions): string {
  if (!options.private)
    throw new Error(
      "Canonical private production requires the explicit --private flag."
    );
  if (!options.workspace)
    throw new Error(
      "Private production requires an explicit --workspace path."
    );
  const workspace = path.resolve(options.workspace);
  if (!isApprovedPrivateMathWorkspace(workspace)) {
    throw new Error(
      "Private production workspace must be outside tracked source or inside .cache/math-pipeline."
    );
  }
  return workspace;
}
async function createCanonicalPrivateProductionRuntime(
  options: MathSelectionOptions,
  preparedRenderExecution?: MathWorkflowRenderExecution
) {
  const workspace = requirePrivateWorkspace(options);
  const release = await curriculum();
  const m5Order = release.graph.order.filter((skillId) =>
    skillId.startsWith("M5-")
  );
  if (m5Order.length !== 37 || new Set(m5Order).size !== 37) {
    throw new Error(
      "Canonical Class 5 order must contain exactly 37 unique skills."
    );
  }
  const firstSkillId = m5Order[0];
  if (!firstSkillId) throw new Error("Canonical Class 5 order is empty.");
  if (
    options.canonicalFirst &&
    options.skill !== undefined &&
    options.skill !== firstSkillId
  ) {
    throw new Error(
      `--canonical-first selected ${firstSkillId}; caller-supplied ${options.skill} is not authoritative.`
    );
  }
  const skillId = options.canonicalFirst
    ? firstSkillId
    : (options.skill ?? firstSkillId);
  const lessonVariant = options.variant ?? "standard";
  const language = options.language ?? "de";
  if (lessonVariant !== "standard" || language !== "de") {
    throw new Error(
      "Owner-attested private production is restricted to standard/de."
    );
  }
  if (options.maxProviderCostUsd !== undefined && !options.paidSpeech) {
    throw new Error(
      "--max-provider-cost-usd is only valid together with --paid-speech."
    );
  }
  if (options.paidSpeech && options.maxProviderCostUsd === undefined) {
    throw new Error(
      "Canonical paid speech requires --max-provider-cost-usd <USD>."
    );
  }
  const paidSetup = options.paidSpeech
    ? await canonicalPaidSpeechSetup({
        skillId,
        lessonVariant,
        language,
        ceilingMicros: Math.round(options.maxProviderCostUsd! * 1_000_000),
        workspace,
        requireProvider: true,
        options,
      })
    : undefined;
  const renderExecution =
    preparedRenderExecution ??
    (await canonicalMathRenderExecution(options, workspace));
  const operator = await createCanonicalMathOperator({
    repositoryRoot: repositoryRoot(),
    workspaceRoot: workspace,
    unitId: createLessonId(skillId, lessonVariant),
    skillId,
    lessonVariant,
    locale: language,
    contentVariant: "full",
    simulation: false,
    releaseVisibility: "private",
    providerMode: paidSetup ? "provider" : "fixture-mock",
    authorizeProvider: true,
    privateMediaMaterializer: (input) =>
      materializeCanonicalPrivateMedia(input, {
        mode: renderExecution.mode,
        ...(renderExecution.sceneShardExecutor
          ? { sceneShardExecutor: renderExecution.sceneShardExecutor }
          : {}),
      }),
    ...(paidSetup
      ? {
          providerConfigurationFingerprint: canonicalHash({
            provider: "openai-compatible",
            model: paidSetup.estimate.model,
            voice: paidSetup.estimate.voice,
            targetWordsPerMinute: paidSetup.estimate.targetWordsPerMinute,
            providerSpeed: paidSetup.estimate.providerSpeed,
            speechProfileVersion: paidSetup.estimate.speechProfileVersion,
            pricingVersion: paidSetup.configuration.pricingVersion,
            narrationSynchronizationVersion:
              CANONICAL_PRIVATE_NARRATION_SYNC_VERSION,
            approvedCeilingMicros:
              paidSetup.configuration.approvedCeilingMicros,
          }),
          privateSpeechMaterializer: (
            input: Parameters<typeof materializeCanonicalPrivateSpeech>[0]
          ) =>
            materializeCanonicalPrivateSpeech(input, paidSetup.configuration),
        }
      : {}),
    ...(options.python ? { pythonExecutable: options.python } : {}),
  });
  return {
    workspace,
    skillId,
    lessonVariant,
    language,
    paidSetup,
    operator,
  };
}

async function runCanonicalPrivateProduction(
  options: MathSelectionOptions,
  resume: boolean,
  preparedRenderExecution?: MathWorkflowRenderExecution
) {
  const {
    workspace,
    skillId,
    lessonVariant,
    language,
    paidSetup,
    operator,
  } = await createCanonicalPrivateProductionRuntime(
    options,
    preparedRenderExecution
  );
  if (resume) {
    await operator.reconcile();
    const before = await operator.status();
    if (before.tasks.some((task) => task.persistedStatus === "interrupted")) {
      await operator.resume();
    } else if (before.tasks.some((task) => task.persistedStatus === "failed")) {
      await operator.retryFailed();
    }
  }
  const ready = await operator.status();
  const publishDryRunSucceeded = ready.tasks.some(
    (task) =>
      task.taskId === "math.publish-dry-run" &&
      task.persistedStatus === "succeeded"
  );
  const results =
    ready.nextTaskId === null && publishDryRunSucceeded
      ? []
      : await operator.runNext({ continue: true });
  const workflow = await operator.status();
  const mediaPath = path.join(
    workspace,
    createLessonId(skillId, lessonVariant),
    `locales/${language}/final-media.json`
  );
  const media = await fs
    .readFile(mediaPath, "utf8")
    .then((value) =>
      canonicalPrivateMediaEvidenceSchema.parse(JSON.parse(value))
    )
    .catch(() => undefined);
  const provider =
    media && typeof media.provider === "object"
      ? (media.provider as {
          mode?: string;
          calls?: number;
          characters?: number;
          retries?: number;
          latencyMs?: number;
          costMicros?: number;
        })
      : undefined;
  return {
    lessonId: createLessonId(skillId, lessonVariant),
    workspaceDir: workspace,
    visibility: "private",
    status:
      workflow.tasks.find((task) => task.taskId === "math.publish-dry-run")
        ?.persistedStatus ?? "pending",
    cached: results.length === 0 || results.every((result) => result.cacheHit),
    paidProviderCalled: (provider?.calls ?? 0) > 0,
    providerCalls: provider?.calls ?? 0,
    providerCharacters: provider?.characters ?? 0,
    providerRetries: provider?.retries ?? 0,
    providerLatencyMs: provider?.latencyMs ?? 0,
    costMicros: provider?.costMicros ?? 0,
    approvedCeilingMicros: paidSetup?.configuration.approvedCeilingMicros ?? 0,
    preflightEstimate: paidSetup?.estimate,
    stateSource: "workflow-operator",
    results,
    workflow,
  };
}

const CANONICAL_PRIVATE_BATCH_CONCURRENCY = 1;
const CANONICAL_PRIVATE_BATCH_RETRY_LIMIT = 2;
const CANONICAL_PRIVATE_BATCH_RATE_LIMIT_PER_SECOND = 0.05;
const CANONICAL_PRIVATE_BATCH_REQUIRED_DISK_BYTES = 2_147_483_648;

interface CanonicalPrivateBatchItemPlan {
  readonly skillId: string;
  readonly lessonId: string;
  readonly lessonSpecificationHash: string;
  readonly narrationHash: string;
  readonly narrationReviewHash: string;
  readonly verifierCheckCount: number;
  readonly targetDurationSeconds: number;
  readonly speech: CanonicalPaidSpeechEstimate;
}

interface CanonicalPrivateBatchPreflight {
  readonly status:
    | "READY_FOR_PRIVATE_BATCH"
    | "BLOCKED_PROVIDER_CONFIGURATION"
    | "BLOCKED_WORKSPACE_CAPACITY";
  readonly batchId: string;
  readonly workspace: string;
  readonly release: {
    readonly releaseId: string;
    readonly curriculumVersion: string;
    readonly status: string;
    readonly releaseHash: string;
  };
  readonly curriculumApprovalHash: string;
  readonly orderedSkillIds: readonly string[];
  readonly items: readonly CanonicalPrivateBatchItemPlan[];
  readonly itemCount: number;
  readonly excludedCount: number;
  readonly providerCredentialConfigured: boolean;
  readonly totals: {
    readonly workflowTaskCount: number;
    readonly workflowCacheHits: number;
    readonly workflowCacheMisses: number;
    readonly speechChunks: number;
    readonly speechCacheHits: number;
    readonly speechCacheMisses: number;
    readonly plannedProviderCalls: number;
    readonly expectedSpeechCharacters: number;
    readonly expectedAudioDurationSeconds: number;
    readonly estimatedUncachedAudioSeconds: number;
    readonly priorProviderCostMicros: number;
    readonly estimatedNewProviderCostMicros: number;
    readonly estimatedProviderCostMicros: number;
    readonly maximumLessonCostMicros: number;
  };
  readonly requiredApproval: {
    readonly paidProviderAuthorized: false;
    readonly recommendedPerLessonCeilingMicros: number;
    readonly recommendedTotalCeilingMicros: number;
    readonly exactInstruction: string;
  };
  readonly executionPolicy: {
    readonly concurrency: number;
    readonly rateLimitPerSecond: number;
    readonly retryLimit: number;
    readonly maximumProviderAttemptsPerSpeechChunk: number;
  };
  readonly workspaceEvidence: {
    readonly configuredArtifactRoot: string;
    readonly realArtifactRoot: string;
    readonly writable: true;
    readonly separateFromTrackedSource: true;
    readonly containedUnitCount: number;
    readonly collisionFree: boolean;
    readonly existingUnitCount: number;
    readonly reusableUnitCount: number;
    readonly batchStateExists: boolean;
    readonly availableDiskBytes: number;
    readonly requiredDiskBytes: number;
  };
  readonly privacy: {
    readonly outputVisibility: "private";
    readonly livePublishingAvailable: false;
    readonly remoteMutationAvailable: false;
    readonly channelOAuthUsed: false;
    readonly plannedRemoteMutations: 0;
  };
  readonly versions: {
    readonly workflow: string;
    readonly narration: string;
    readonly verifierProtocol: "math-verifier.v3";
    readonly renderer: "math-semantic-keyframe-runner.v8";
    readonly visualStyle: "math.educational-visual-style.v1";
    readonly metadata: "math-metadata.v1";
    readonly speechProfile: string;
    readonly speechModel: string;
    readonly pricing: typeof CANONICAL_OPENAI_SPEECH_PRICING_VERSION;
    readonly narrationSynchronization: typeof CANONICAL_PRIVATE_NARRATION_SYNC_VERSION;
  };
  readonly dryRun: true;
  readonly writes: 0;
  readonly subprocesses: 0;
  readonly providerCallsSubmitted: 0;
}

function roundedCeilingMicros(value: number): number {
  return Math.ceil(value / 1_000) * 1_000;
}

function privateBatchStateRoot(workspace: string): string {
  return path.join(workspace, "state", "canonical-batches");
}

async function canonicalPrivateBatchWorkspaceEvidence(
  workspace: string,
  lessonIds: readonly string[]
): Promise<CanonicalPrivateBatchPreflight["workspaceEvidence"]> {
  const configuredArtifactRoot = path.resolve(workspace);
  await fs.access(configuredArtifactRoot, fsConstants.W_OK);
  const [realArtifactRoot, realRepositoryRoot] = await Promise.all([
    fs.realpath(configuredArtifactRoot),
    fs.realpath(repositoryRoot()),
  ]);
  const sourceRelation = path.relative(realRepositoryRoot, realArtifactRoot);
  if (
    sourceRelation === "" ||
    (!sourceRelation.startsWith("..") && !path.isAbsolute(sourceRelation))
  ) {
    const configuredLocalRoot = repositoryLocalMathPipelineRoot();
    const localRootStat = await fs.lstat(configuredLocalRoot).catch(() => null);
    if (!localRootStat?.isDirectory() || localRootStat.isSymbolicLink())
      throw new Error(
        "Repository-local private production requires a real .cache/math-pipeline directory."
      );
    const realLocalRoot = await fs.realpath(configuredLocalRoot);
    if (!isPathWithin(realLocalRoot, realArtifactRoot))
      throw new Error(
        "Private production workspace must be separate from tracked source or contained by .cache/math-pipeline."
      );
  }
  const unitRoots = lessonIds.map((lessonId) =>
    path.join(realArtifactRoot, lessonId)
  );
  if (
    unitRoots.some(
      (unitRoot, index) =>
        path.relative(realArtifactRoot, unitRoot) !== lessonIds[index]
    )
  ) {
    throw new Error(
      "Private batch unit path escaped the configured workspace."
    );
  }
  const reusableUnits = await Promise.all(
    unitRoots.map(async (unitRoot, index) => {
      const lessonId = lessonIds[index]!;
      const unitStat = await fs.lstat(unitRoot).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (!unitStat) return false;
      if (!unitStat.isDirectory() || unitStat.isSymbolicLink()) {
        throw new Error(
          `Existing private batch unit ${lessonId} is not a reusable directory.`
        );
      }
      const realUnitRoot = await fs.realpath(unitRoot);
      if (path.relative(realArtifactRoot, realUnitRoot) !== lessonId) {
        throw new Error(
          `Existing private batch unit ${lessonId} escaped the configured workspace.`
        );
      }
      const statePath = path.join(
        realUnitRoot,
        "state",
        "workflow",
        "math.production",
        "state.json"
      );
      const stateStat = await fs.lstat(statePath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (!stateStat?.isFile() || stateStat.isSymbolicLink()) {
        throw new Error(
          `Existing private batch unit ${lessonId} has no reusable canonical workflow state.`
        );
      }
      const realStatePath = await fs.realpath(statePath);
      const stateRelation = path.relative(realUnitRoot, realStatePath);
      if (stateRelation.startsWith("..") || path.isAbsolute(stateRelation)) {
        throw new Error(
          `Existing private batch unit ${lessonId} has workflow state outside its unit root.`
        );
      }
      const parsed = workflowInstanceSchema.safeParse(
        JSON.parse(await fs.readFile(realStatePath, "utf8")) as unknown
      );
      if (
        !parsed.success ||
        parsed.data.workflowId !== "math.production" ||
        parsed.data.unitId !== lessonId ||
        parsed.data.profileId !== "mathematics-education" ||
        parsed.data.locale !== "de" ||
        parsed.data.variant !== "full"
      ) {
        throw new Error(
          `Existing private batch unit ${lessonId} has incompatible workflow identity.`
        );
      }
      return true;
    })
  );
  const batchStateRoot = privateBatchStateRoot(realArtifactRoot);
  const batchStateStat = await fs
    .lstat(batchStateRoot)
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
  if (
    batchStateStat &&
    (!batchStateStat.isDirectory() || batchStateStat.isSymbolicLink())
  ) {
    throw new Error(
      "Existing private batch coordinator state is not a reusable directory."
    );
  }
  if (batchStateStat) {
    const realBatchStateRoot = await fs.realpath(batchStateRoot);
    if (
      path.relative(realArtifactRoot, realBatchStateRoot) !==
      path.relative(realArtifactRoot, batchStateRoot)
    ) {
      throw new Error(
        "Existing private batch coordinator state escaped the configured workspace."
      );
    }
  }
  const existingUnitCount = reusableUnits.filter(Boolean).length;
  const disk = await fs.statfs(realArtifactRoot);
  return {
    configuredArtifactRoot,
    realArtifactRoot,
    writable: true,
    separateFromTrackedSource: true,
    containedUnitCount: unitRoots.length,
    collisionFree: true,
    existingUnitCount,
    reusableUnitCount: existingUnitCount,
    batchStateExists: batchStateStat !== null,
    availableDiskBytes: disk.bavail * disk.bsize,
    requiredDiskBytes: CANONICAL_PRIVATE_BATCH_REQUIRED_DISK_BYTES,
  };
}

function canonicalPrivateBatchInput(
  preflight: Omit<CanonicalPrivateBatchPreflight, "batchId"> & {
    readonly batchId?: string;
  },
  execute?: (item: CanonicalPrivateBatchItemPlan) => BatchWorkItem["execute"]
): BatchPlanInput {
  const speechModel = preflight.versions.speechModel;
  return {
    profileId: "mathematics-education",
    provider: "openai-compatible",
    model: speechModel,
    operation: "math.private-class5-production",
    executionMode: "sync",
    configuration: {
      concurrency: CANONICAL_PRIVATE_BATCH_CONCURRENCY,
      retryLimit: CANONICAL_PRIVATE_BATCH_RETRY_LIMIT,
      rateLimitPerSecond: CANONICAL_PRIVATE_BATCH_RATE_LIMIT_PER_SECOND,
    },
    items: preflight.items.map((item) => ({
      key: `${item.skillId}:standard:de`,
      taskId: "math.publish-dry-run",
      unitId: item.lessonId,
      locale: "de",
      variant: "full",
      fingerprint: canonicalHash({
        releaseHash: preflight.release.releaseHash,
        curriculumApprovalHash: preflight.curriculumApprovalHash,
        skillId: item.skillId,
        lessonSpecificationHash: item.lessonSpecificationHash,
        narrationHash: item.narrationHash,
        narrationReviewHash: item.narrationReviewHash,
        versions: preflight.versions,
      }),
      groupKey: `openai-compatible:${speechModel}:de:standard`,
      revisions: {
        workflow: preflight.versions.workflow,
        narration: preflight.versions.narration,
        verifier: preflight.versions.verifierProtocol,
        renderer: preflight.versions.renderer,
        visualStyle: preflight.versions.visualStyle,
        metadata: preflight.versions.metadata,
        speechProfile: preflight.versions.speechProfile,
        speechModel,
        pricing: preflight.versions.pricing,
      },
      execute: execute
        ? execute(item)
        : async () => ({ outputArtifacts: [], warnings: [] }),
      classifyError: classifyCanonicalPrivateBatchError,
    })),
  };
}

function classifyCanonicalPrivateBatchError(error: unknown): {
  readonly retryable: boolean;
  readonly code: string;
} {
  const speech = classifyEducationalSpeechError(error);
  const normalized = normalizeWorkflowError(error);
  return {
    retryable:
      speech.classification === "unknown"
        ? normalized.retryable
        : speech.retryable,
    code:
      speech.classification === "unknown"
        ? normalized.code
        : `MATH_SPEECH_${speech.classification
            .replaceAll("-", "_")
            .toUpperCase()}`,
  };
}

async function canonicalPrivateBatchPreflight(
  options: MathSelectionOptions,
  requireProvider: boolean,
  requireExistingBatch = false
): Promise<CanonicalPrivateBatchPreflight> {
  const workspace = requirePrivateWorkspace(options);
  if (Number(options.grade ?? "5") !== 5) {
    throw new Error(
      "Canonical private batch production is restricted to grade 5."
    );
  }
  const lessonVariant = options.variant ?? "standard";
  const language = options.language ?? "de";
  if (lessonVariant !== "standard" || language !== "de") {
    throw new Error(
      "Canonical private batch production is restricted to standard/de."
    );
  }
  if (!options.paidSpeech) {
    throw new Error(
      "Canonical private batch planning requires --paid-speech to estimate the reviewed speech path."
    );
  }
  const release = await curriculum();
  const orderedSkillIds = release.graph.order.filter((skillId) =>
    skillId.startsWith("M5-")
  );
  if (orderedSkillIds.length !== 37 || new Set(orderedSkillIds).size !== 37) {
    throw new Error(
      "Canonical Class 5 order must contain exactly 37 unique skills."
    );
  }
  const byId = new Map(release.skills.map((skill) => [skill.skillId, skill]));
  const orderedSkills = orderedSkillIds.map((skillId) => {
    const skill = byId.get(skillId);
    if (!skill) throw new Error(`Missing canonical Class 5 skill: ${skillId}`);
    return skill;
  });
  const planned = planMathBatchItems({
    skills: orderedSkills,
    variant: lessonVariant,
    language,
    capabilityMode: "private-production",
  });
  if (planned.items.length !== 37 || planned.excluded.length !== 0) {
    throw new Error(
      `Private production capability mismatch: ${planned.items.length} planned, ${planned.excluded.length} excluded.`
    );
  }
  const attestation = await loadPrivateOwnerAttestation(
    path.join(
      repositoryRoot(),
      "packages/math-education/data/reviews/v1/private-owner-attestation.json"
    )
  );
  const workspaceEvidence = await canonicalPrivateBatchWorkspaceEvidence(
    workspace,
    orderedSkills.map((skill) => createLessonId(skill.skillId, lessonVariant))
  );
  const itemPlans = await Promise.all(
    orderedSkills.map(async (skill) => {
      assertPrivateOwnerCurriculumApproval(attestation, release, skill.skillId);
      assertProductionLessonCapability(
        skill.skillId,
        lessonVariant,
        attestation,
        "private"
      );
      const lesson = buildLessonVariant(skill, lessonVariant);
      const narration = localizeNarration(lesson, language);
      const narrationReview = reviewGermanStandardNarration({
        lesson,
        narration,
      });
      const paid = await canonicalPaidSpeechPreflight({
        skillId: skill.skillId,
        lessonVariant,
        language,
        workspace,
        requireProvider,
        options,
        curriculumRelease: release,
      });
      return {
        plan: {
          skillId: skill.skillId,
          lessonId: createLessonId(skill.skillId, lessonVariant),
          lessonSpecificationHash: lesson.contentHash,
          narrationHash: narration.contentHash,
          narrationReviewHash: narrationReview.contentHash,
          verifierCheckCount: lesson.checks.length,
          targetDurationSeconds: lesson.targetDurationSeconds,
          speech: paid.estimate,
        } satisfies CanonicalPrivateBatchItemPlan,
        providerCredentialConfigured: paid.providerCredentialConfigured,
      };
    })
  );
  const items = itemPlans.map((item) => item.plan);
  const providerCredentialConfigured = itemPlans.every(
    (item) => item.providerCredentialConfigured
  );
  const sum = (
    selector: (item: CanonicalPrivateBatchItemPlan) => number
  ): number => items.reduce((total, item) => total + selector(item), 0);
  const totals = {
    workflowTaskCount: items.length * MATH_EXECUTABLE_TASK_IDS.length,
    workflowCacheHits: 0,
    workflowCacheMisses: items.length * MATH_EXECUTABLE_TASK_IDS.length,
    speechChunks: sum((item) => item.speech.chunks),
    speechCacheHits: sum((item) => item.speech.cacheHits),
    speechCacheMisses: sum((item) => item.speech.cacheMisses),
    plannedProviderCalls: sum((item) => item.speech.calls),
    expectedSpeechCharacters: sum((item) => item.speech.characters),
    expectedAudioDurationSeconds: sum((item) => item.targetDurationSeconds),
    estimatedUncachedAudioSeconds: sum(
      (item) => item.speech.estimatedAudioSeconds
    ),
    priorProviderCostMicros: sum((item) => item.speech.priorCostMicros),
    estimatedNewProviderCostMicros: sum(
      (item) => item.speech.newCostEstimateMicros
    ),
    estimatedProviderCostMicros: sum((item) => item.speech.estimatedCostMicros),
    maximumLessonCostMicros: Math.max(
      ...items.map((item) => item.speech.estimatedCostMicros)
    ),
  };
  const recommendedPerLessonCeilingMicros = roundedCeilingMicros(
    totals.maximumLessonCostMicros
  );
  const recommendedTotalCeilingMicros = roundedCeilingMicros(
    totals.estimatedProviderCostMicros
  );
  const versions = {
    workflow: mathWorkflowDefinition.revision,
    narration: MATH_LOCKED_FACT_NARRATION_VERSION,
    verifierProtocol: "math-verifier.v3" as const,
    renderer: "math-semantic-keyframe-runner.v8" as const,
    visualStyle: "math.educational-visual-style.v1" as const,
    metadata: "math-metadata.v1" as const,
    speechProfile: items[0]!.speech.speechProfileVersion,
    speechModel: items[0]!.speech.model,
    pricing: CANONICAL_OPENAI_SPEECH_PRICING_VERSION,
    narrationSynchronization: CANONICAL_PRIVATE_NARRATION_SYNC_VERSION,
  };
  const withoutBatchId = {
    status: !providerCredentialConfigured
      ? ("BLOCKED_PROVIDER_CONFIGURATION" as const)
      : workspaceEvidence.availableDiskBytes <
          workspaceEvidence.requiredDiskBytes
        ? ("BLOCKED_WORKSPACE_CAPACITY" as const)
        : ("READY_FOR_PRIVATE_BATCH" as const),
    workspace,
    release: {
      releaseId: release.release.releaseId,
      curriculumVersion: release.release.curriculumVersion,
      status: release.release.status,
      releaseHash: release.releaseHash,
    },
    curriculumApprovalHash: attestation.evidenceHash,
    orderedSkillIds,
    items,
    itemCount: items.length,
    excludedCount: planned.excluded.length,
    providerCredentialConfigured,
    totals,
    requiredApproval: {
      paidProviderAuthorized: false as const,
      recommendedPerLessonCeilingMicros,
      recommendedTotalCeilingMicros,
      exactInstruction:
        `Approve paid German speech for the canonical 37-lesson Class 5 standard/de private batch only, ` +
        `with a hard ceiling of USD ${(recommendedPerLessonCeilingMicros / 1_000_000).toFixed(3)} per lesson ` +
        `and USD ${(recommendedTotalCeilingMicros / 1_000_000).toFixed(3)} total.`,
    },
    executionPolicy: {
      concurrency: CANONICAL_PRIVATE_BATCH_CONCURRENCY,
      rateLimitPerSecond: CANONICAL_PRIVATE_BATCH_RATE_LIMIT_PER_SECOND,
      retryLimit: CANONICAL_PRIVATE_BATCH_RETRY_LIMIT,
      maximumProviderAttemptsPerSpeechChunk: 3,
    },
    workspaceEvidence,
    privacy: {
      outputVisibility: "private" as const,
      livePublishingAvailable: false as const,
      remoteMutationAvailable: false as const,
      channelOAuthUsed: false as const,
      plannedRemoteMutations: 0 as const,
    },
    versions,
    dryRun: true as const,
    writes: 0 as const,
    subprocesses: 0 as const,
    providerCallsSubmitted: 0 as const,
  };
  const manifest = new BatchCoordinator({
    root: privateBatchStateRoot(workspace),
  }).createManifest(canonicalPrivateBatchInput(withoutBatchId));
  if (requireExistingBatch) {
    const existing = await new BatchStore(
      privateBatchStateRoot(workspace)
    ).read(manifest.id);
    if (
      existing.items.map((item) => item.unitId).join("\0") !==
      manifest.items.map((item) => item.unitId).join("\0")
    ) {
      throw new Error(
        "Existing private batch state does not match the canonical Class 5 plan."
      );
    }
  }
  return {
    ...withoutBatchId,
    batchId: manifest.id,
  };
}

async function readCanonicalPrivateBatchUsage(
  workspace: string,
  items: readonly CanonicalPrivateBatchItemPlan[]
): Promise<number> {
  const usage = await Promise.all(
    items.map((item) =>
      readCanonicalPaidSpeechUsage(path.join(workspace, item.lessonId))
    )
  );
  return usage.reduce((total, item) => total + item.costMicros, 0);
}

async function runCanonicalPrivateBatch(
  options: MathSelectionOptions,
  resume: boolean
) {
  if (
    options.maxProviderCostUsd === undefined ||
    options.maxProviderCostPerLessonUsd === undefined
  ) {
    throw new Error(
      "Canonical private batch execution requires aggregate --max-provider-cost-usd and --max-provider-cost-per-lesson-usd ceilings."
    );
  }
  const totalCeilingUsd = options.maxProviderCostUsd;
  const perLessonCeilingUsd = options.maxProviderCostPerLessonUsd;
  const totalCeilingMicros = Math.round(totalCeilingUsd * 1_000_000);
  const perLessonCeilingMicros = Math.round(perLessonCeilingUsd * 1_000_000);
  const preflight = await canonicalPrivateBatchPreflight(options, true, resume);
  if (preflight.totals.estimatedProviderCostMicros > totalCeilingMicros) {
    throw new Error(
      `Estimated batch provider cost USD ${(preflight.totals.estimatedProviderCostMicros / 1_000_000).toFixed(6)} exceeds the aggregate hard ceiling USD ${(totalCeilingMicros / 1_000_000).toFixed(6)}.`
    );
  }
  const overPerLesson = preflight.items.find(
    (item) => item.speech.estimatedCostMicros > perLessonCeilingMicros
  );
  if (overPerLesson) {
    throw new Error(
      `${overPerLesson.skillId} estimated provider cost USD ${(overPerLesson.speech.estimatedCostMicros / 1_000_000).toFixed(6)} exceeds the per-lesson hard ceiling USD ${(perLessonCeilingMicros / 1_000_000).toFixed(6)}.`
    );
  }
  let scheduler: MathPrivateBatchScheduler | undefined;
  const renderExecution = await canonicalMathRenderExecution(
    options,
    preflight.workspace,
    async (event) => {
      if (!scheduler) return;
      const relative = path.relative(preflight.workspace, event.jobRoot);
      const unitId = relative.split(path.sep)[0];
      if (!unitId || unitId === ".." || path.isAbsolute(relative)) {
        throw new Error("Hybrid scene event escaped the private workspace.");
      }
      await scheduler.recordSceneEvent({
        unitId,
        sceneId: event.sceneId,
        status: event.status,
        requestFingerprint: event.requestFingerprint,
        ...(event.assignmentId ? { assignmentId: event.assignmentId } : {}),
        ...(event.lane ? { lane: event.lane } : {}),
        ...(event.remoteJobId ? { remoteJobId: event.remoteJobId } : {}),
        ...(event.attempt ? { attempt: event.attempt } : {}),
        ...(event.reassigned ? { reassigned: true } : {}),
      });
    }
  );
  const baseInput = canonicalPrivateBatchInput(preflight);
  const workByUnit = new Map(
    baseInput.items.map((work) => [work.unitId, work])
  );
  const costBeforeByUnit = new Map<string, number>();
  scheduler = new MathPrivateBatchScheduler({
    batchId: preflight.batchId,
    stateRoot: privateBatchStateRoot(preflight.workspace),
    maxRenderReadyLessons: renderExecution.mode === "local" ? 1 : 2,
    paidSpeechStartsPerSecond: CANONICAL_PRIVATE_BATCH_RATE_LIMIT_PER_SECOND,
    classifyError: classifyCanonicalPrivateBatchError,
    items: preflight.items.map((item) => {
      const work = workByUnit.get(item.lessonId)!;
      return {
        batchItemId: createDeterministicBatchItemId(work),
        unitId: item.lessonId,
        requestFingerprint: work.fingerprint,
        sharedImageId: renderExecution.imageId ?? "local:canonical-math-v8",
        createOperator: async () =>
          (
            await createCanonicalPrivateProductionRuntime(
              {
                ...options,
                skill: item.skillId,
                grade: "5",
                variant: "standard",
                language: "de",
                private: true,
                paidSpeech: true,
                maxProviderCostUsd: perLessonCeilingUsd,
              },
              renderExecution
            )
          ).operator as MathBatchWorkflowOperator,
      };
    }),
    beforePaidSpeech: async (unitId) => {
      const item = preflight.items.find(
        (candidate) => candidate.lessonId === unitId
      )!;
      const costBefore = await readCanonicalPrivateBatchUsage(
        preflight.workspace,
        preflight.items
      );
      if (costBefore + item.speech.newCostEstimateMicros > totalCeilingMicros) {
        throw new Error(
          `Aggregate cost gate blocks ${item.skillId}: prior usage plus the remaining worst-case estimate exceeds the approved ceiling.`
        );
      }
      costBeforeByUnit.set(unitId, costBefore);
    },
    afterPaidSpeech: async () => {
      const costAfter = await readCanonicalPrivateBatchUsage(
        preflight.workspace,
        preflight.items
      );
      if (costAfter > totalCeilingMicros) {
        throw new Error(
          `Aggregate provider usage USD ${(costAfter / 1_000_000).toFixed(6)} exceeded the approved ceiling.`
        );
      }
    },
  });
  const stagedInput = canonicalPrivateBatchInput(
    preflight,
    (item) => async () => {
      await scheduler!.runUnit(item.lessonId, true);
      const costAfter = await readCanonicalPrivateBatchUsage(
        preflight.workspace,
        preflight.items
      );
      return {
        outputArtifacts: [],
        warnings: [
          "Private-only output; placeholder artwork remains a public-release blocker.",
        ],
        telemetry: {
          provider: "openai-compatible",
          model: item.speech.model,
          cacheStatus: "miss" as const,
          cost: {
            estimatedMicros: item.speech.newCostEstimateMicros,
            actualMicros: Math.max(
              0,
              costAfter - (costBeforeByUnit.get(item.lessonId) ?? costAfter)
            ),
            currency: "USD" as const,
          },
          revisions: {
            workflow: preflight.versions.workflow,
            speechProfile: preflight.versions.speechProfile,
            pricing: preflight.versions.pricing,
          },
        },
      };
    }
  );
  const input: BatchPlanInput = {
    ...stagedInput,
    configuration: {
      concurrency: renderExecution.mode === "local" ? 1 : 3,
      retryLimit: stagedInput.configuration.retryLimit,
    },
  };
  const coordinator = new BatchCoordinator({
    root: privateBatchStateRoot(preflight.workspace),
  });
  const manifest = await coordinator.run(input);
  const actualCostMicros = await readCanonicalPrivateBatchUsage(
    preflight.workspace,
    preflight.items
  );
  if (actualCostMicros > totalCeilingMicros) {
    throw new Error(
      "Canonical private batch aggregate cost ceiling was exceeded."
    );
  }
  process.exitCode =
    manifest.status === "succeeded" ? 0 : manifest.status === "partial" ? 2 : 3;
  return {
    batchId: manifest.id,
    status: manifest.status,
    workspace: preflight.workspace,
    itemCount: preflight.itemCount,
    approvedPerLessonCeilingMicros: perLessonCeilingMicros,
    approvedTotalCeilingMicros: totalCeilingMicros,
    actualCostMicros,
    privacy: preflight.privacy,
    manifest,
  };
}

async function canonicalProductionStatus(
  workspace: string,
  lessonIds: readonly string[]
) {
  const curriculumRoot = await ensureCanonicalSimulationCurriculum(
    workspace,
    false
  );
  const statuses = await Promise.all(
    lessonIds.map(async (lessonId) => {
      const match =
        /^(m\d+)-([a-z]{2})-(\d{3})-(foundation|standard|challenge)$/u.exec(
          lessonId
        );
      if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
        throw new Error(`Invalid canonical math lesson ID: ${lessonId}`);
      }
      const operator = await createCanonicalMathOperator({
        repositoryRoot: repositoryRoot(),
        workspaceRoot: path.resolve(workspace),
        unitId: lessonId,
        skillId: `${match[1]}-${match[2]}-${match[3]}`.toUpperCase(),
        lessonVariant: match[4] as LessonVariant,
        locale: "de",
        contentVariant: "full",
        curriculumRoot,
        simulation: true,
        providerMode: "fixture-mock",
        authorizeProvider: true,
      });
      return { lessonId, ...(await operator.status()) };
    })
  );
  return statuses.length === 1 ? statuses[0] : { results: statuses };
}
async function authoritativeQuality(workspace: string, lessonId: string) {
  const paths = new MathWorkspacePathResolver(workspace);
  const lessonRoot = paths.lesson(lessonId);
  const manifest = await loadWorkflowManifest(paths.manifest(lessonId));
  if (!manifest || manifest.lessonId !== lessonId)
    throw new Error(
      `Missing or identity-mismatched workflow manifest for ${lessonId}.`
    );
  const relativePath = "canonical/quality.json";
  const report = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "quality-gate",
    relativePath,
    schemaVersion: "math-quality.v2",
    schema: mathQualityReportSchema,
  });
  if (report.lessonId !== lessonId || report.lessonId !== manifest.lessonId)
    throw new Error(
      `Quality report identity does not match requested lesson ${lessonId}.`
    );
  const stage = manifest.stages.find(
    (record) => record.stage === "quality-gate"
  )!;
  const lineage = stage.outputArtifacts.find(
    (artifact) => artifact.relativePath === relativePath
  )!;
  const approvalLineage = stage.outputArtifacts.find(
    (artifact) =>
      artifact.relativePath === "canonical/minor-edit-approval.json" &&
      artifact.schemaVersion === "math-minor-approval.v1"
  );
  const approval = approvalLineage
    ? await readAuthoritativeStageArtifact({
        root: lessonRoot,
        manifest,
        stage: "quality-gate",
        relativePath: approvalLineage.relativePath,
        schemaVersion: "math-minor-approval.v1",
        schema: mathMinorEditApprovalSchema,
      })
    : undefined;
  const approvalResult = evaluateMinorEditApproval({
    report,
    qualityRelativePath: relativePath,
    qualityContentHash: lineage.contentHash,
    approval,
  });
  return {
    lessonId,
    derivedStatus: report.status,
    blockers: report.blockers,
    selectedScope: { locales: report.selectedLocales },
    approval: approvalResult,
    permissions: {
      renderPreflightAllowed: report.renderPreflightAllowed,
      finalMediaReady: report.finalMediaReady,
      publishAllowed:
        report.publishableWithoutApproval || approvalResult.approved,
    },
    report,
  };
}

async function printQualitySelection(
  workspace: string,
  lessonIds: readonly string[]
) {
  try {
    const results = await Promise.all(
      lessonIds.map((lessonId) => authoritativeQuality(workspace, lessonId))
    );
    process.exitCode = qualityExitCode(
      results.map((result) => result.derivedStatus)
    );
    print(
      results.length === 1
        ? results[0]
        : { results, exitCode: process.exitCode }
    );
  } catch (error) {
    process.exitCode = 1;
    throw error;
  }
}

export function registerMathCommands(program: Command): void {
  const mathDefaults = loadMathRuntimeConfig(process.env, repositoryRoot());
  const math = program
    .command("math")
    .description("Deterministic mathematics education pipeline");
  const renderer = math
    .command("renderer")
    .description("Inspect and render deterministic mathematics fixtures");
  const remoteRenderer = renderer
    .command("remote")
    .description("Operate the immutable SSH math scene worker");
  remoteRenderer
    .command("deploy")
    .description("Build, transfer, load, and verify one immutable worker image")
    .action(async () => {
      const settings = parseMathRemoteSettings(await loadRuntimeConfig());
      const receipt = await deployMathRemoteWorker({
        settings,
        repositoryRoot: repositoryRoot(),
      });
      print({
        deployed: true,
        imageId: receipt.imageId,
        architecture: receipt.architecture,
        repositoryRevision: receipt.repositoryRevision,
      });
    });
  remoteRenderer
    .command("check")
    .description(
      "Verify SSH, Docker, resources, permissions, and shared image ID"
    )
    .action(async () => {
      const settings = parseMathRemoteSettings(await loadRuntimeConfig());
      print(
        await checkMathRemoteWorker({
          settings,
          repositoryRoot: repositoryRoot(),
        })
      );
    });
  remoteRenderer
    .command("status")
    .description("Inspect schema-recognized math remote jobs")
    .option("--job <job-id>", "inspect one exact locally generated job ID")
    .action(async (options: { job?: string }) => {
      const settings = parseMathRemoteSettings(await loadRuntimeConfig());
      print(
        await inspectMathRemoteStatus({
          settings,
          ...(options.job ? { jobId: options.job } : {}),
        })
      );
    });
  remoteRenderer
    .command("logs <job-id>")
    .description("Read bounded structured logs for one exact math job")
    .action(async (jobId: string) => {
      const settings = parseMathRemoteSettings(await loadRuntimeConfig());
      print(await inspectMathRemoteLogs({ settings, jobId }));
    });
  remoteRenderer
    .command("cleanup")
    .description("Remove only old, completed, schema-recognized math jobs")
    .action(async () => {
      const settings = parseMathRemoteSettings(await loadRuntimeConfig());
      await cleanupMathRemoteJobs({ settings });
      print({
        cleaned: true,
        retentionHours: settings.transport.cleanupMaxAgeHours,
      });
    });
  renderer
    .command("fixture <fixture>")
    .description("Render a deterministic renderer fixture")
    .option(
      "--output <path>",
      "repository-local fixture output directory",
      ".cache/math-pipeline/natural-chalk-fixtures"
    )
    .action(async (fixture: string, options: { output: string }) => {
      if (fixture !== "natural-chalk")
        throw new Error(`Unknown mathematics renderer fixture: ${fixture}`);
      const output = path.resolve(options.output);
      if (!isApprovedPrivateMathWorkspace(output))
        throw new Error(
          "Math renderer fixtures must stay under .cache/math-pipeline/ or outside the repository."
        );
      await fs.mkdir(output, { recursive: true });
      const fixtures = createNaturalChalkGoldenFixtures();
      await Promise.all(
        fixtures.flatMap((item) => [
          fs.writeFile(
            path.join(output, `${item.id}-midpoint.svg`),
            item.midpointSvg,
            "utf8"
          ),
          fs.writeFile(
            path.join(output, `${item.id}-complete.svg`),
            item.completeSvg,
            "utf8"
          ),
        ])
      );
      await writeJsonAtomic(path.join(output, "manifest.json"), {
        artifactVersion: "math-natural-chalk-fixtures.v1",
        rendererVersion: "math-semantic-chalk.v7",
        fixtures: fixtures.map(({ id, midpointHash, completeHash }) => ({
          id,
          midpointHash,
          completeHash,
        })),
      });
      print({
        output,
        fixtureCount: fixtures.length,
        rendererVersion: "math-semantic-chalk.v7",
      });
    });
  const speech = math
    .command("speech")
    .description("Generate natural, board-synchronized educational narration");
  speech
    .command("generate")
    .requiredOption("--lesson <lesson-id>")
    .requiredOption("--workspace <path>")
    .option("--language <language>", "de, en, es, fr, pt", "de")
    .option(
      "--speech-profile <profile>",
      "typed educational delivery profile",
      mathDefaults.educationalSpeechProfile
    )
    .option("--speech-voice <voice>", "override the configured TTS voice")
    .option(
      "--speech-rate <wpm>",
      "target educational words per minute (80-220)",
      parseSpeechRate,
      mathDefaults.educationalSpeechRateWpm
    )
    .option(
      "--speech-candidates <count>",
      "generate 1-3 candidates for high-value lesson sections",
      parseSpeechCandidates,
      mathDefaults.educationalSpeechCandidates
    )
    .option(
      "--speech-selection <chunk=candidate...>",
      "explicit candidate selection, for example narr-chunk-001=2"
    )
    .option("--regenerate-speech", "bypass compatible speech cache entries")
    .option(
      "--speech-dry-run",
      "print requests, cache state, output paths, and pauses without writes or provider calls"
    )
    .action(async (_opts: unknown, command: Command) =>
      runMathSpeechGenerate(command.optsWithGlobals<MathSpeechOptions>())
    );
  speech
    .command("compare")
    .description(
      "Generate legacy-baseline and natural-teacher listening samples"
    )
    .requiredOption("--output <path>", "comparison output directory")
    .option("--language <language>", "English or German fixture", "en")
    .option("--fixture <path>", "override the versioned listening fixture")
    .option("--speech-voice <voice>", "use the same voice for both samples")
    .option(
      "--speech-rate <wpm>",
      "use the same target rate for both samples",
      parseSpeechRate,
      150
    )
    .option(
      "--speech-dry-run",
      "show both comparison plans without writes or provider calls"
    )
    .action(async (_opts: unknown, command: Command) =>
      runMathSpeechCompare(command.optsWithGlobals<MathSpeechCompareOptions>())
    );
  const curriculumCommand = math
    .command("curriculum")
    .description("Import and inspect the versioned math curriculum");
  curriculumCommand
    .command("import")
    .option("--dry-run", "validate without writing normalized data")
    .action(async (_opts, command) => {
      const result = await importedCurriculumSeed();
      const options = selection(command);
      const target = path.join(
        repositoryRoot(),
        "packages/math-education/data/curriculum/v1/skills.json"
      );
      if (!options.dryRun)
        throw new Error(
          "Curriculum import writes require an atomic reviewed release migration; use --dry-run."
        );
      const normalized = await curriculum();
      print({
        structurallyValid: true,
        dryRun: true,
        skillCount: result.skills.length,
        releaseHash: result.releaseHash,
        matchesNormalizedRelease: result.releaseHash === normalized.releaseHash,
        outputPath: target,
      });
    });
  curriculumCommand.command("validate").action(async () => {
    const result = await curriculum();
    print({
      structurallyValid: true,
      readyForProduction: result.readyForProduction,
      releaseStatus: result.release.status,
      skillCount: result.skills.length,
      sourceCount: result.registry.sources.length,
      incompleteProvenanceCount: result.provenance.incompleteSkillIds.length,
      graphNodes: result.graph.order.length,
      graphEdges: result.prerequisites.edges.length,
      disconnectedSkillIds: result.graph.disconnectedSkillIds,
      releaseHash: result.releaseHash,
    });
  });
  curriculumCommand
    .command("list")
    .option("--grade <grade>", "grade 5-10", "5")
    .action(async (opts: { grade: string }) => {
      const grade = Number(opts.grade);
      const result = await curriculum();
      print(result.skills.filter((skill) => skill.canonicalGrade === grade));
    });
  curriculumCommand
    .command("inspect")
    .requiredOption("--skill <skill-id>")
    .action(async (opts: { skill: string }) => {
      const result = await curriculum();
      const skill = result.skills.find((item) => item.skillId === opts.skill);
      if (!skill) throw new Error(`Unknown skill: ${opts.skill}`);
      print(skill);
    });
  curriculumCommand.command("graph").action(async () => {
    const result = await curriculum();
    print({
      order: result.graph.order,
      edges: result.prerequisites.edges,
      disconnectedSkillIds: result.graph.disconnectedSkillIds,
      reviewStatus: result.prerequisites.reviewStatus,
    });
  });

  const lesson = math
    .command("lesson")
    .description("Plan or simulate a lesson");
  lesson
    .command("plan")
    .requiredOption("--skill <skill-id>")
    .option(
      "--variant <variant>",
      "foundation, standard, challenge",
      "standard"
    )
    .action(async (opts: { skill: string; variant: LessonVariant }) => {
      const result = await curriculum();
      const skill = result.skills.find((item) => item.skillId === opts.skill);
      if (!skill) throw new Error(`Unknown skill: ${opts.skill}`);
      const variants = buildAllLessonVariants(skill);
      validateVariantDifferentiation(variants);
      print(
        opts.variant
          ? variants.find((item) => item.variant === opts.variant)
          : variants
      );
    });
  lesson
    .command("generate")
    .requiredOption("--skill <skill-id>")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "de, en, es, fr, pt")
    .option("--simulate")
    .option("--workspace <path>")
    .option("--python <path>")
    .action(async (_opts, command) =>
      print(await simulate(selection(command)))
    );

  const production = math
    .command("production")
    .description("Plan and run resumable math production");
  production
    .command("plan")
    .option("--skill <skill-id>", "skill id", "M5-ZO-001")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "target language", "de")
    .option("--private", "plan owner-attested private production")
    .option("--workspace <path>", "private generated-artifact workspace")
    .option(
      "--canonical-first",
      "derive and enforce the first Class 5 skill from the reviewed DAG"
    )
    .option("--paid-speech", "plan paid natural German speech")
    .option(
      "--max-provider-cost-usd <usd>",
      "hard provider-cost ceiling in USD",
      parseProviderCostUsd
    )
    .action(async (_opts, command) => {
      const options = selection(command);
      const registry = createMathTaskRegistry();
      const curriculum = await loadCurriculumRelease(
        path.join(
          repositoryRoot(),
          "packages/math-education/data/curriculum/v1"
        )
      );
      const m5Order = curriculum.graph.order.filter((skillId) =>
        skillId.startsWith("M5-")
      );
      if (m5Order.length !== 37 || new Set(m5Order).size !== 37) {
        throw new Error(
          "Canonical Class 5 order must contain exactly 37 unique skills."
        );
      }
      const firstSkillId = m5Order[0];
      if (!firstSkillId) throw new Error("Canonical Class 5 order is empty.");
      if (
        options.canonicalFirst &&
        options.skill !== undefined &&
        options.skill !== firstSkillId
      ) {
        throw new Error(
          `--canonical-first selected ${firstSkillId}; caller-supplied ${options.skill} is not authoritative.`
        );
      }
      const skillId = options.canonicalFirst
        ? firstSkillId
        : (options.skill ?? firstSkillId);
      const selectedSkill = curriculum.skills.find(
        (skill) => skill.skillId === skillId
      );
      if (!selectedSkill) throw new Error(`Unknown skill: ${skillId}`);
      const lessonSpecification = buildLessonVariant(
        selectedSkill,
        options.variant ?? "standard"
      );
      const narration = localizeNarration(
        lessonSpecification,
        options.language ?? "de"
      );
      const narrationReview =
        (options.variant === undefined || options.variant === "standard") &&
        (options.language === undefined || options.language === "de")
          ? reviewGermanStandardNarration({
              lesson: lessonSpecification,
              narration,
            })
          : undefined;
      const attestation = options.private
        ? await loadPrivateOwnerAttestation(
            path.join(
              repositoryRoot(),
              "packages/math-education/data/reviews/v1/private-owner-attestation.json"
            )
          )
        : undefined;
      if (attestation) {
        assertPrivateOwnerCurriculumApproval(attestation, curriculum, skillId);
      }
      if (options.maxProviderCostUsd !== undefined && !options.paidSpeech) {
        throw new Error(
          "--max-provider-cost-usd is only valid together with --paid-speech."
        );
      }
      if (options.paidSpeech && options.maxProviderCostUsd === undefined) {
        throw new Error(
          "Canonical paid speech planning requires --max-provider-cost-usd <USD>."
        );
      }
      if (options.paidSpeech && !options.private) {
        throw new Error("Canonical paid speech planning requires --private.");
      }
      if (options.paidSpeech && !options.workspace) {
        throw new Error(
          "Canonical paid speech planning requires an explicit --workspace."
        );
      }
      const workspaceEvidence = options.workspace
        ? await (async () => {
            const configuredArtifactRoot = path.resolve(options.workspace!);
            const sourceRelation = path.relative(
              repositoryRoot(),
              configuredArtifactRoot
            );
            if (
              sourceRelation === "" ||
              (!sourceRelation.startsWith("..") &&
                !path.isAbsolute(sourceRelation))
            ) {
              throw new Error(
                "Private production workspace must be separate from tracked source."
              );
            }
            const parent = path.dirname(configuredArtifactRoot);
            await fs.access(parent, fsConstants.W_OK);
            const unitRoot = path.join(
              configuredArtifactRoot,
              createLessonId(skillId, options.variant ?? "standard")
            );
            const collisionFree = await fs
              .access(unitRoot)
              .then(() => false)
              .catch(() => true);
            const disk = await fs.statfs(parent);
            return {
              configuredArtifactRoot,
              outputWorkspace: unitRoot,
              writable: true,
              separateFromTrackedSource: true,
              underConfiguredArtifactRoot:
                path.relative(configuredArtifactRoot, unitRoot) ===
                createLessonId(skillId, options.variant ?? "standard"),
              collisionFree,
              availableDiskBytes: disk.bavail * disk.bsize,
              requiredDiskBytes: 2_147_483_648,
            };
          })()
        : undefined;
      const paidSetup = options.paidSpeech
        ? await canonicalPaidSpeechSetup({
            skillId,
            lessonVariant: options.variant ?? "standard",
            language: options.language ?? "de",
            ceilingMicros: Math.round(options.maxProviderCostUsd! * 1_000_000),
            ...(options.workspace ? { workspace: options.workspace } : {}),
            requireProvider: false,
            options,
          })
        : undefined;
      print({
        dryRun: true,
        writes: 0,
        subprocesses: 0,
        providers: paidSetup?.estimate.calls ?? 0,
        selection: {
          skill: skillId,
          grade: 5,
          variant: options.variant ?? "standard",
          language: options.language ?? "de",
        },
        plannedItems: [
          {
            skill: skillId,
            variant: options.variant ?? "standard",
            language: options.language ?? "de",
          },
        ],
        plannedItemCount: 1,
        canonicalClass5Order: m5Order,
        canonicalClass5SkillCount: m5Order.length,
        canonicalFirstSkill: firstSkillId,
        selectedIsCanonicalFirst: skillId === firstSkillId,
        selectionRationale:
          skillId === firstSkillId
            ? "First node in the canonical stable topological order with configured seed-order tie breaking."
            : "Explicit non-M2-010A operator selection.",
        reviewedPrerequisiteSkillIds: selectedSkill.prerequisiteIds,
        release: {
          releaseId: curriculum.release.releaseId,
          curriculumVersion: curriculum.release.curriculumVersion,
          status: curriculum.release.status,
          releaseHash: curriculum.releaseHash,
        },
        lessonSpecificationHash: lessonSpecification.contentHash,
        narrationHash: narration.contentHash,
        narrationReviewHash: narrationReview?.contentHash,
        workflowId: mathWorkflowDefinition.id,
        workflowRevision: mathWorkflowDefinition.revision,
        visibility: options.private ? "private" : "simulation",
        curriculumApprovalHash: attestation?.evidenceHash,
        paidProviderExecutionConfigured: Boolean(paidSetup),
        paidProviderAuthorized: false,
        approvalRequiredBeforeRun: Boolean(paidSetup),
        expectedSpeechCharacters: paidSetup?.estimate.characters ?? 0,
        expectedSpeechDurationSeconds:
          paidSetup?.estimate.estimatedAudioSeconds ?? 0,
        estimatedProviderCostMicros:
          paidSetup?.estimate.estimatedCostMicros ?? 0,
        estimatedNewProviderCostMicros:
          paidSetup?.estimate.newCostEstimateMicros ?? 0,
        priorProviderCostMicros: paidSetup?.estimate.priorCostMicros ?? 0,
        remainingProviderBudgetMicros:
          paidSetup?.estimate.remainingBudgetMicros ?? 0,
        approvedHardCeilingMicros:
          paidSetup?.configuration.approvedCeilingMicros ?? 0,
        providerConfiguration: paidSetup
          ? {
              provider: "openai-compatible",
              model: paidSetup.estimate.model,
              voice: paidSetup.estimate.voice,
              targetWordsPerMinute: paidSetup.estimate.targetWordsPerMinute,
              providerSpeed: paidSetup.estimate.providerSpeed,
              speechProfileVersion: paidSetup.estimate.speechProfileVersion,
              pricingVersion: paidSetup.configuration.pricingVersion,
              narrationSynchronizationVersion:
                CANONICAL_PRIVATE_NARRATION_SYNC_VERSION,
              candidateCount: 1,
              maximumAttempts: 3,
              concurrency: 1,
              backoff: "educational-speech-provider-default-bounded",
            }
          : undefined,
        cache: {
          hits: 0,
          misses: MATH_EXECUTABLE_TASK_IDS.length,
          decision:
            "preflight-only; executable cache is revalidated at run time",
        },
        executionPolicy: {
          concurrency: 1,
          rateLimit: "provider account tier plus one in-flight speech request",
          retries: paidSetup ? 2 : 0,
          maximumAttempts: paidSetup ? 3 : 1,
          backoff: paidSetup
            ? "educational-speech-provider-default-bounded"
            : "none",
          diskRequirementBytes: 2_147_483_648,
          workspace: options.workspace ? path.resolve(options.workspace) : null,
        },
        workspaceEvidence,
        privacy: {
          outputVisibility: "private",
          livePublishingAvailable: false,
          remoteMutationAvailable: false,
          channelOAuthUsed: false,
          plannedRemoteMutations: 0,
        },
        versions: {
          narration: MATH_LOCKED_FACT_NARRATION_VERSION,
          narrationReview: "math-german-narration-review.v1",
          verifierProtocol: "math-verifier.v3",
          verifier: "3.0.0",
          renderer: "math-semantic-keyframe-runner.v8",
          chalkRenderer: "math-semantic-chalk.v7",
          visualStyle: "math.educational-visual-style.v1",
          metadata: "math-metadata.v1",
          speechProfile: paidSetup?.estimate.speechProfileVersion ?? null,
          speechModel: paidSetup?.estimate.model ?? null,
          pricing: paidSetup?.configuration.pricingVersion ?? null,
        },
        executableTaskCount: MATH_EXECUTABLE_TASK_IDS.length,
        taskIds: MATH_EXECUTABLE_TASK_IDS,
        unavailableLiveTasks: ["math.publish-approval", "math.publish"],
        otherClass5Lessons: {
          count: 36,
          plannedProviderCalls: 0,
          plannedMutations: 0,
        },
        stages: MATH_EXECUTABLE_TASK_IDS.map((taskId) => ({
          taskId,
          implementationOwner: registry.explain(taskId).implementationOwner,
        })),
      });
    });
  for (const name of ["run", "resume"] as const)
    production
      .command(name)
      .option("--skill <skill-id>", "skill id", "M5-ZO-001")
      .option("--variant <variant>", "lesson variant", "standard")
      .option("--language <language>")
      .option("--simulate")
      .option("--private", "owner-attested provider-free private production")
      .option(
        "--canonical-first",
        "derive and enforce the first Class 5 skill from the reviewed DAG"
      )
      .option("--paid-speech", "use paid natural German speech")
      .option(
        "--render-executor <mode>",
        "math scene executor: local, remote, or hybrid",
        parseMathRenderExecutor
      )
      .option(
        "--max-provider-cost-usd <usd>",
        "hard provider-cost ceiling in USD",
        parseProviderCostUsd
      )
      .requiredOption("--workspace <path>")
      .option("--python <path>")
      .action(async (_opts, command) =>
        print(
          await (selection(command).private
            ? runCanonicalPrivateProduction(
                selection(command),
                name === "resume"
              )
            : runCanonicalSimulation(selection(command), name === "resume"))
        )
      );
  for (const name of ["status", "inspect"] as const)
    production
      .command(name)
      .requiredOption("--lesson <lesson-id...>")
      .requiredOption("--workspace <path>")
      .action(async (opts: { lesson: string[]; workspace: string }) =>
        print(await canonicalProductionStatus(opts.workspace, opts.lesson))
      );

  const batch = math
    .command("batch")
    .description("Plan and run isolated canonical math batch items");
  const configurePrivateBatchSelection = (command: Command) =>
    command
      .option("--grade <grade>", "canonical grade", "5")
      .option("--variant <variant>", "lesson variant", "standard")
      .option("--language <language>", "target language", "de")
      .option("--private", "owner-attested private production")
      .option("--paid-speech", "plan or run paid natural German speech")
      .requiredOption("--workspace <path>", "private artifact workspace")
      .option("--python <path>");
  configurePrivateBatchSelection(batch.command("plan"))
    .description("Side-effect-free canonical Class 5 private batch preflight")
    .action(async (_opts, command) =>
      print(await canonicalPrivateBatchPreflight(selection(command), false))
    );
  for (const name of ["run", "resume"] as const) {
    configurePrivateBatchSelection(batch.command(name))
      .description(
        `${name === "run" ? "Run" : "Resume"} the canonical Class 5 private batch`
      )
      .requiredOption(
        "--max-provider-cost-usd <usd>",
        "aggregate hard provider-cost ceiling in USD",
        parseProviderCostUsd
      )
      .requiredOption(
        "--max-provider-cost-per-lesson-usd <usd>",
        "per-lesson hard provider-cost ceiling in USD",
        parseProviderCostPerLessonUsd
      )
      .option(
        "--render-executor <mode>",
        "math scene executor: local, remote, or hybrid",
        parseMathRenderExecutor
      )
      .action(async (_opts, command) =>
        print(
          await runCanonicalPrivateBatch(selection(command), name === "resume")
        )
      );
  }
  batch
    .command("status")
    .requiredOption("--batch-id <id>")
    .requiredOption("--workspace <path>")
    .option("--private")
    .action(
      async (options: {
        batchId: string;
        workspace: string;
        private?: boolean;
      }) => {
        const workspace = requirePrivateWorkspace(options);
        print(
          await new BatchStore(privateBatchStateRoot(workspace)).read(
            options.batchId
          )
        );
      }
    );
  batch
    .command("cancel")
    .requiredOption("--batch-id <id>")
    .requiredOption("--reason <text>")
    .requiredOption("--workspace <path>")
    .option("--private")
    .action(
      async (options: {
        batchId: string;
        reason: string;
        workspace: string;
        private?: boolean;
      }) => {
        const workspace = requirePrivateWorkspace(options);
        print(
          await new BatchCoordinator({
            root: privateBatchStateRoot(workspace),
          }).cancel(options.batchId, options.reason)
        );
      }
    );
  batch
    .command("create")
    .option("--grade <grade>", "grade 5-10", "5")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "target language", "de")
    .requiredOption("--workspace <path>")
    .action(
      async (opts: {
        grade: string;
        variant: LessonVariant;
        language: MathLanguage;
        workspace: string;
      }) => {
        const result = await curriculum();
        const selectedSkills = result.skills.filter(
          (skill) => skill.canonicalGrade === Number(opts.grade)
        );
        const { items, excluded } = planMathBatchItems({
          skills: selectedSkills,
          variant: opts.variant,
          language: opts.language,
        });
        const batchId = `math-${opts.grade}-${opts.variant}-${opts.language}-${canonicalHash(items).slice(0, 12)}`;
        const paths = new MathWorkspacePathResolver(opts.workspace);
        const filePath = paths.resolve("state", "batches", `${batchId}.json`);
        await paths.assertWritable(filePath);
        await writeJsonAtomic(filePath, {
          artifactVersion: "math-batch.v1",
          batchId,
          items,
          excluded,
        });
        print({
          batchId,
          itemCount: items.length,
          excludedCount: excluded.length,
          path: filePath,
        });
      }
    );
  batch
    .command("process")
    .argument("<batch-id>")
    .requiredOption("--workspace <path>")
    .option("--simulate")
    .option("--python <path>")
    .action(
      async (
        batchId: string,
        opts: { workspace: string; simulate?: boolean; python?: string }
      ) => {
        if (!opts.simulate)
          throw new Error("Batch processing currently requires --simulate.");
        const paths = new MathWorkspacePathResolver(opts.workspace);
        const batchPath = paths.resolve("state", "batches", `${batchId}.json`);
        const raw = (await paths.readJson(batchPath)) as {
          items?: MathBatchItem[];
        };
        if (!Array.isArray(raw.items))
          throw new Error(`Invalid batch manifest: ${batchPath}`);
        const report = await runMathBatch(
          batchId,
          raw.items,
          async (item) => {
            await runPilotSimulation({
              repositoryRoot: repositoryRoot(),
              workspaceDir: opts.workspace,
              skillId: item.skillId,
              variant: item.variant,
              languages: [item.language],
              ...(opts.python ? { pythonExecutable: opts.python } : {}),
              resume: true,
            });
          },
          {
            retryBudget: 0,
            checkpointPath: paths.resolve(
              "state",
              "batches",
              `${batchId}.report.json`
            ),
          }
        );
        process.exitCode = report.exitCode;
        print(report);
      }
    );

  math
    .command("verify")
    .requiredOption("--skill <skill-id>")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--simulate")
    .requiredOption("--workspace <path>")
    .option("--python <path>")
    .action(async (_opts, command) =>
      print(await simulate(selection(command)))
    );
  const quality = math
    .command("quality")
    .description("Inspect the derived, fail-closed math quality status");
  quality
    .command("check")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .action(async (opts: { lesson: string[]; workspace: string }) =>
      printQualitySelection(opts.workspace, opts.lesson)
    );
  const metadata = math
    .command("metadata")
    .description("Inspect generated math metadata");
  metadata
    .command("generate")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .option("--language <language>", "target language", "de")
    .action(
      async (opts: { lesson: string; workspace: string; language: string }) => {
        const paths = new MathWorkspacePathResolver(opts.workspace);
        print(
          await paths.readJson(
            path.join(paths.locale(opts.lesson, opts.language), "metadata.json")
          )
        );
      }
    );
  math
    .command("status")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .action(async (opts: { lesson: string[]; workspace: string }) =>
      printQualitySelection(opts.workspace, opts.lesson)
    );
  math
    .command("publish")
    .requiredOption("--lesson <lesson-id>")
    .requiredOption("--workspace <path>")
    .option("--language <language>", "target language", "de")
    .option("--dry-run", "publishing is only available as a dry run")
    .action(
      async (
        _opts: { lesson: string; workspace: string; language: string },
        command: Command
      ) => {
        const opts = command.optsWithGlobals<{
          lesson: string;
          workspace: string;
          language: string;
          dryRun?: boolean;
        }>();
        if (!opts.dryRun) {
          process.exitCode = 1;
          throw new Error("Math publish requires --dry-run.");
        }
        try {
          const quality = await authoritativeQuality(
            opts.workspace,
            opts.lesson
          );
          if (!quality.permissions.publishAllowed) {
            throw new MathCliSemanticError(
              `Publishing blocked: ${quality.derivedStatus}.`
            );
          }
          if (
            !quality.report.selectedLocales.includes(
              opts.language as MathLanguage
            )
          )
            throw new Error(
              `Publish language ${opts.language} is outside the authoritative quality scope.`
            );
          const paths = new MathWorkspacePathResolver(opts.workspace);
          const manifest = await loadWorkflowManifest(
            paths.manifest(opts.lesson)
          );
          if (!manifest || manifest.lessonId !== opts.lesson)
            throw new Error(
              `Missing or identity-mismatched workflow manifest for ${opts.lesson}.`
            );
          const localeRoot = `locales/${opts.language}`;
          const metadataRelativePath = `${localeRoot}/metadata.json`;
          const catalogRelativePath = `${localeRoot}/playlist-catalog.json`;
          const thumbnailRelativePath = `${localeRoot}/thumbnail.svg.manifest.json`;
          const policyRelativePath = `${localeRoot}/brand-policy.json`;
          const relativePath = `${localeRoot}/publish-dry-run.json`;
          const metadataStageRecord = manifest.stages.find(
            (stage) => stage.stage === "metadata-playlists"
          )!;
          for (const required of [
            [catalogRelativePath, "math-playlist-catalog.v1"],
            [policyRelativePath, "math-brand-policy.v1"],
          ] as const) {
            const count = metadataStageRecord.outputArtifacts.filter(
              (artifact) =>
                artifact.relativePath === required[0] &&
                artifact.schemaVersion === required[1]
            ).length;
            if (count !== 1)
              throw new MathCliSemanticError(
                `PUBLISH_BLOCKED: missing or duplicate ${required[0]}.`
              );
          }
          const metadata = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: metadataRelativePath,
            schemaVersion: "math-metadata.v2",
            schema: mathMetadataSchema,
          });
          const catalog = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: catalogRelativePath,
            schemaVersion: "math-playlist-catalog.v1",
            schema: mathPlaylistCatalogSchema,
          });
          const thumbnail = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: thumbnailRelativePath,
            schemaVersion: "math-thumbnail.v1",
            schema: mathThumbnailArtifactSchema,
          });
          const rawPolicy = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: policyRelativePath,
            schemaVersion: "math-brand-policy.v1",
            schema: mathBrandPolicyArtifactSchema,
          });
          const policy = rawPolicy;
          const languages = policy.channels.map(
            (candidate) => candidate.language
          );
          const requiredLanguages = ["de", "en", "es", "fr", "pt"];
          if (
            new Set(languages).size !== languages.length ||
            requiredLanguages.some(
              (language) => !languages.includes(language as MathLanguage)
            ) ||
            new Set(policy.channels.map((candidate) => candidate.channelId))
              .size !== policy.channels.length ||
            policy.channels.some((candidate) => {
              const ids = Object.values(candidate.playlists);
              return new Set(ids).size !== ids.length;
            })
          )
            throw new MathCliSemanticError(
              "PUBLISH_BLOCKED: duplicate math channel policy."
            );
          const channel = policy.channels.find(
            (candidate) => candidate.language === opts.language
          );
          if (!channel)
            throw new MathCliSemanticError(
              `PUBLISH_BLOCKED: missing channel policy for ${opts.language}.`
            );
          const packet = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath,
            schemaVersion: "math-publish-dry-run.v2",
            schema: mathPublishDryRunSchema,
          });
          const canonicalQualityPath = "canonical/quality.json";
          const canonicalFinalEvidencePath = `${localeRoot}/final-media.json`;
          const canonicalFinalMediaPath = `${localeRoot}/render/final.mp4`;
          if (
            packet.quality.path !== canonicalQualityPath ||
            packet.finalMedia.evidencePath !== canonicalFinalEvidencePath ||
            packet.finalMedia.mediaPath !== canonicalFinalMediaPath
          )
            throw new Error(
              "Publish packet uses a non-canonical quality or final-media path."
            );
          const finalMedia = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "render",
            relativePath: packet.finalMedia.evidencePath,
            schemaVersion: "math-final-media.v1",
            schema: mathFinalMediaEvidenceSchema,
          });
          if (
            packet.identity.lessonId !== opts.lesson ||
            packet.identity.lessonId !== manifest.lessonId ||
            packet.identity.language !== opts.language ||
            metadata.identity.lessonId !== opts.lesson ||
            metadata.identity.language !== opts.language ||
            thumbnail.identity.lessonId !== opts.lesson ||
            thumbnail.identity.language !== opts.language ||
            finalMedia.identity.lessonId !== opts.lesson ||
            finalMedia.identity.language !== opts.language
          )
            throw new Error(
              `Publish packet identity does not match ${opts.lesson}/${opts.language}.`
            );
          const lessonRoot = paths.lesson(opts.lesson);
          const metadataStage = manifest.stages.find(
            (stage) => stage.stage === "metadata-playlists"
          )!;
          const lineageHash = (artifactPath: string) => {
            const matches = metadataStage.outputArtifacts.filter(
              (artifact) => artifact.relativePath === artifactPath
            );
            if (matches.length !== 1)
              throw new Error(
                `Expected exactly one authoritative ${artifactPath}.`
              );
            return matches[0]!.contentHash;
          };
          for (const stageName of new Set(
            Object.values(thumbnail.sourceLineage).map((source) => source.stage)
          )) {
            const sourceStage = manifest.stages.find(
              (candidate) => candidate.stage === stageName
            );
            if (
              !sourceStage ||
              !(await outputsAreValid(lessonRoot, sourceStage))
            )
              throw new Error(
                `Thumbnail source stage ${stageName} is stale or invalid.`
              );
          }
          const thumbnailSourceLineageValid = Object.values(
            thumbnail.sourceLineage
          ).every((source) => {
            const stage = manifest.stages.find(
              (candidate) => candidate.stage === source.stage
            );
            const matches =
              stage?.outputArtifacts.filter(
                (artifact) =>
                  artifact.relativePath === source.relativePath &&
                  artifact.schemaVersion === source.schemaVersion &&
                  artifact.producedBy === source.stage &&
                  artifact.producer === source.producer &&
                  artifact.producerVersion === source.producerVersion &&
                  artifact.contentHash === source.contentHash &&
                  canonicalHash(artifact.parentHashes) ===
                    canonicalHash(source.parentFingerprints)
              ) ?? [];
            return matches.length === 1;
          });
          const thumbnailAssetRelativePath = path.posix.join(
            localeRoot,
            thumbnail.outputPath
          );
          const thumbnailAsset = await readAuthoritativeBinaryArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: thumbnailAssetRelativePath,
            schemaVersion: "math-thumbnail-binary.v1",
            expectedIdentity: {
              lessonId: opts.lesson,
              skillId: metadata.identity.skillId,
              language: opts.language as MathLanguage,
              variant: metadata.identity.variant,
            },
            producer: "math-thumbnail-renderer",
            producerVersion: "math-thumbnail-renderer.v3",
          });
          const finalMediaAsset = await readAuthoritativeBinaryArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "render",
            relativePath: finalMedia.mediaPath,
            schemaVersion: "math-final-media-binary.v1",
            expectedIdentity: {
              lessonId: opts.lesson,
              skillId: metadata.identity.skillId,
              language: opts.language as MathLanguage,
              variant: metadata.identity.variant,
            },
            producer: "provider-free-media",
            producerVersion: "provider-free-media.v1",
          });
          const qualityMatches = manifest.stages
            .find((stage) => stage.stage === "quality-gate")!
            .outputArtifacts.filter(
              (artifact) =>
                artifact.relativePath === canonicalQualityPath &&
                artifact.schemaVersion === "math-quality.v2"
            );
          if (qualityMatches.length !== 1)
            throw new Error(
              "Expected exactly one canonical workflow-owned quality artifact."
            );
          const qualityHash = qualityMatches[0]!.contentHash;
          const expectedPlaylistIds = metadata.playlists.map((playlist) => {
            const catalogEntries = catalog.entries.filter(
              (entry) =>
                entry.key === playlist.key && entry.kind === playlist.kind
            );
            if (
              catalogEntries.length !== 1 ||
              catalogEntries[0]!.localizedNames[
                opts.language as MathLanguage
              ] !== playlist.localizedName
            )
              throw new MathCliSemanticError(
                `PUBLISH_BLOCKED: catalog mismatch for ${playlist.key}.`
              );
            const playlistId = channel.playlists[playlist.key];
            if (!playlistId)
              throw new MathCliSemanticError(
                `PUBLISH_BLOCKED: unmapped playlist ${playlist.key}.`
              );
            return { key: playlist.key, kind: playlist.kind, playlistId };
          });
          const packetBound = {
            identity: packet.identity,
            metadata: packet.metadata,
            thumbnail: packet.thumbnail,
            finalMedia: packet.finalMedia,
            quality: packet.quality,
            brandPolicy: packet.brandPolicy,
            channelId: packet.channelId,
            privacyStatus: packet.privacyStatus,
            madeForKids: packet.madeForKids,
            containsSyntheticMedia: packet.containsSyntheticMedia,
            playlistAssignments: packet.playlistAssignments,
            blockers: packet.blockers,
          };
          const hashesMatch =
            packet.metadata.path === metadataRelativePath &&
            packet.metadata.contentHash === canonicalHash(metadata) &&
            packet.thumbnail.manifestPath === thumbnailRelativePath &&
            packet.thumbnail.manifestHash ===
              lineageHash(thumbnailRelativePath) &&
            packet.thumbnail.assetPath === thumbnailAssetRelativePath &&
            packet.thumbnail.assetHash === thumbnail.contentHash &&
            packet.thumbnail.assetHash === thumbnailAsset.contentHash &&
            thumbnail.byteLength === thumbnailAsset.byteLength &&
            packet.finalMedia.evidencePath === canonicalFinalEvidencePath &&
            packet.finalMedia.evidenceHash === canonicalHash(finalMedia) &&
            packet.finalMedia.mediaPath === canonicalFinalMediaPath &&
            packet.finalMedia.mediaPath === finalMedia.mediaPath &&
            packet.finalMedia.mediaHash === finalMedia.mediaHash &&
            finalMedia.mediaHash === finalMediaAsset.contentHash &&
            packet.finalMedia.qualityEvidenceHash === qualityHash &&
            finalMedia.qualityEvidenceHash === qualityHash &&
            packet.quality.contentHash === qualityHash &&
            packet.brandPolicy.path === policyRelativePath &&
            packet.brandPolicy.contentHash ===
              lineageHash(policyRelativePath) &&
            packet.channelId === channel.channelId &&
            packet.privacyStatus === policy.privacyStatus &&
            packet.madeForKids === policy.madeForKids &&
            packet.containsSyntheticMedia === policy.containsSyntheticMedia &&
            metadata.catalogHash === canonicalHash(catalog) &&
            thumbnail.inputHashes.metadata === canonicalHash(metadata) &&
            thumbnail.inputHashes.lessonContent ===
              metadata.identity.lessonContentHash &&
            thumbnail.factId === metadata.thumbnail.formulaFactId &&
            thumbnailSourceLineageValid &&
            thumbnail.sourceLineage.lesson.relativePath ===
              "canonical/lesson-spec.json" &&
            thumbnail.sourceLineage.verification.relativePath ===
              "canonical/verification.json" &&
            thumbnail.sourceLineage.localization.relativePath ===
              `${localeRoot}/narration.json` &&
            thumbnail.sourceLineage.localizedVerification.relativePath ===
              `${localeRoot}/display-verification.json` &&
            thumbnail.sourceLineage.metadata.relativePath ===
              metadataRelativePath &&
            canonicalHash(packet.playlistAssignments) ===
              canonicalHash(expectedPlaylistIds) &&
            packet.requestFingerprint === canonicalHash(packetBound);
          if (!hashesMatch)
            throw new Error(
              "Publish preflight artifact hashes or policy bindings do not match authoritative inputs."
            );
          if (
            thumbnail.teacherVersion.includes("placeholder") ||
            thumbnail.artwork.status !== "approved-publish-artwork" ||
            !thumbnail.artwork.publishReady ||
            thumbnail.artwork.blockers.length > 0
          )
            throw new MathCliSemanticError(
              "PUBLISH_BLOCKED: placeholder teacher thumbnail is not publish-ready."
            );
          print({
            status: "PREFLIGHT_VALID",
            lessonId: opts.lesson,
            language: opts.language,
            channelId: channel.channelId,
            privacyStatus: "private",
            playlistAssignments: expectedPlaylistIds,
            authoritative: {
              metadata: packet.metadata,
              thumbnail: packet.thumbnail,
              finalMedia: packet.finalMedia,
              quality: packet.quality,
              brandPolicy: packet.brandPolicy,
            },
            blockers: [],
            dispatchAllowed: false,
            paidProviderCalled: false,
            networkCalls: 0,
            mutations: 0,
          });
        } catch (error) {
          process.exitCode =
            error instanceof MathCliSemanticError ? error.exitCode : 1;
          throw error;
        }
      }
    );
}
