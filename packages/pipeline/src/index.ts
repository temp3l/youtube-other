import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type CleanedTranscript,
  type EpisodeId,
  type EpisodeManifest,
  episodeManifestSchema,
  type ImageAsset,
  type PipelineRun,
  type PipelineRunId,
  type PublishingMetadata,
  type RewrittenScript,
  type ScenePlan,
  type SourceMedia,
  type SourceMetadata,
  type Transcript,
  normalizedTranscriptSchema,
  transcriptSchema,
} from "@mediaforge/domain";
import {
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "@mediaforge/config";
import { createLogger } from "@mediaforge/observability";
import {
  createPersistence,
  type SQLitePersistence,
} from "@mediaforge/persistence";
import {
  LocalFileSourceAdapter,
  createLocalSourceMetadata,
} from "@mediaforge/source-ingestion";
import {
  ConservativeScriptRewriter,
  OpenAiCompatibleScriptRewriter,
} from "@mediaforge/rewriting";
import {
  ConservativeTranscriptCleaner,
  OpenAiCompatibleTranscriptCleaner,
} from "@mediaforge/transcript-cleaning";
import { OneToOneScenePlanner } from "@mediaforge/scene-planning";
import {
  MockSpeechProvider,
  OpenAiCompatibleSpeechProvider,
  loadSpeechVoiceSettings,
} from "@mediaforge/speech";
import { buildCaptionPack } from "@mediaforge/alignment";
import {
  createPlaceholderImage,
  createPromptBatch,
  exportSceneWorkbook,
  localSceneNegativePrompt,
  localSceneStyle,
  missingScenes,
  validateImageAssets,
} from "@mediaforge/image-generation";
import {
  generateYoutubeMetadataForTarget,
  YOUTUBE_METADATA_PROMPT_VERSION,
  type YoutubeMetadata,
} from "@mediaforge/metadata";
import {
  FFmpegVideoRenderer,
  HybridFFmpegVideoRenderer,
  type RemoteRenderSettings,
  validateRenderedVideo,
} from "@mediaforge/rendering";
import {
  buildSrt,
  ensureDir,
  ensureEpisodeWorkspace,
  fileExists,
  hashFile,
  hashText,
  createEpisodePathResolver,
  normalizeLocaleCode,
  slugify,
  type EpisodeId as SharedEpisodeId,
  type LocaleCode,
  type EpisodePathResolver,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  MockTranscriptionProvider,
  OpenAiCompatibleTranscriptionProvider,
  WhisperCppTranscriptionProvider,
} from "@mediaforge/transcription";
import { runCommandJson } from "@mediaforge/process-runner";

export type PipelineStage =
  | "inspect-source"
  | "acquire-transcript"
  | "extract-or-normalize-audio"
  | "transcribe-source-if-needed"
  | "clean-transcript"
  | "rewrite-script"
  | "extract-and-check-claims"
  | "plan-scenes"
  | "synthesize-scene-audio"
  | "concatenate-audio"
  | "align-final-audio"
  | "reconcile-canonical-caption-text"
  | "create-captions"
  | "create-image-prompts"
  | "export-openart-batches"
  | "import-image-assets"
  | "validate-image-assets"
  | "generate-publishing-metadata"
  | "render-video"
  | "validate-output"
  | "package-results";

export interface CreateEpisodeOptions {
  filePath?: string;
  url?: string;
  transcriptPath?: string;
  slug?: string;
  title?: string;
}

export interface RunPipelineOptions {
  readonly fromStage?: PipelineStage;
  readonly untilStage?: PipelineStage;
  readonly sceneId?: string;
  readonly sceneLimit?: number;
  readonly missingScenesOnly?: boolean;
  readonly outputProfile?: "youtube" | "vertical";
  readonly json?: boolean;
}

export interface PipelineSummary {
  readonly episodeId: EpisodeId;
  readonly slug: string;
  readonly manifestPath: string;
  readonly outputPaths: string[];
  readonly warnings: string[];
}

export interface MediaForgeEnvironment {
  readonly config: RuntimeConfig;
  readonly db: SQLitePersistence;
  readonly logger: ReturnType<typeof createLogger>;
}

const stageOrder: PipelineStage[] = [
  "inspect-source",
  "acquire-transcript",
  "extract-or-normalize-audio",
  "transcribe-source-if-needed",
  "clean-transcript",
  "rewrite-script",
  "extract-and-check-claims",
  "plan-scenes",
  "synthesize-scene-audio",
  "concatenate-audio",
  "align-final-audio",
  "reconcile-canonical-caption-text",
  "create-captions",
  "create-image-prompts",
  "export-openart-batches",
  "import-image-assets",
  "validate-image-assets",
  "render-video",
  "validate-output",
  "generate-publishing-metadata",
  "package-results",
];

function nowIso(): string {
  return new Date().toISOString();
}

async function loadManifest(
  manifestPath: string
): Promise<EpisodeManifest | null> {
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  return episodeManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
  );
}

async function saveManifest(
  manifestPath: string,
  manifest: EpisodeManifest
): Promise<void> {
  await writeJsonAtomic(manifestPath, manifest);
}

function createEmptyManifest(
  episodeId: EpisodeId,
  slug: string,
  source: EpisodeManifest["source"]
): EpisodeManifest {
  const timestamp = nowIso();
  return episodeManifestSchema.parse({
    episodeId,
    slug,
    source,
    images: [],
    artifacts: [],
    pipelineRuns: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function episodeDir(workspaceDir: string, slug: string): string {
  return path.join(workspaceDir, slug);
}

interface SceneAudioManifest {
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneHash: string;
  readonly promptHash: string;
  readonly voiceProfileHash: string;
  readonly outputPath: string;
  readonly outputSha256: string;
  readonly durationSeconds: number;
  readonly generatedAt: string;
}

function sceneAudioManifestPath(outputPath: string): string {
  return outputPath.replace(/\.wav$/u, ".json");
}

function buildSceneHash(scene: {
  id: string;
  sequenceNumber: number;
  sourceSegmentIds: readonly string[];
  canonicalNarration: string;
  timing: { startSeconds: number; endSeconds: number };
}): string {
  return hashText(
    JSON.stringify({
      id: scene.id,
      sequenceNumber: scene.sequenceNumber,
      sourceSegmentIds: scene.sourceSegmentIds,
      canonicalNarration: scene.canonicalNarration,
      timing: scene.timing,
    })
  );
}

function buildScenePromptHash(
  scene: { canonicalNarration: string; estimatedDurationSeconds: number },
  voiceProfile: {
    id: string;
    label: string;
    gender: string;
    style: string;
    paceWpm: number;
    providerVoiceId?: string | undefined;
  }
): string {
  return hashText(
    JSON.stringify({
      canonicalNarration: scene.canonicalNarration,
      estimatedDurationSeconds: scene.estimatedDurationSeconds,
      voiceProfile,
    })
  );
}

async function loadSceneAudioManifest(
  filePath: string
): Promise<SceneAudioManifest | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<SceneAudioManifest>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.sceneId !== "string" ||
    typeof value.sceneHash !== "string" ||
    typeof value.promptHash !== "string" ||
    typeof value.voiceProfileHash !== "string" ||
    typeof value.outputPath !== "string" ||
    typeof value.outputSha256 !== "string" ||
    typeof value.durationSeconds !== "number" ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }
  return value as SceneAudioManifest;
}

function localizedTranscriptArtifactPaths(
  episodeDirPath: string,
  language: string
): string[] {
  const safeLanguage = slugify(language);
  return [
    path.join(
      episodeDirPath,
      "locales",
      safeLanguage,
      "full",
      "transcript",
      "original-transcript.json"
    ),
    path.join(
      episodeDirPath,
      "locales",
      safeLanguage,
      "full",
      "transcript",
      "transcript.json"
    ),
    path.join(
      episodeDirPath,
      "audio",
      `whisper-transcript-${safeLanguage}.json`
    ),
    path.join(episodeDirPath, "transcript", `transcript-${safeLanguage}.json`),
  ];
}

async function loadLocalizedTranscriptArtifact(
  episodeDirPath: string,
  language: string
): Promise<Transcript | null> {
  for (const candidate of localizedTranscriptArtifactPaths(
    episodeDirPath,
    language
  )) {
    if (!(await fileExists(candidate))) {
      continue;
    }
    const raw = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
    const normalized = normalizedTranscriptSchema.safeParse(raw);
    if (normalized.success) {
      return transcriptSchema.parse({
        sourceId: normalized.data.sourceId,
        language: normalized.data.language,
        text: normalized.data.text,
        segments: normalized.data.segments,
        words: normalized.data.words,
      });
    }
    const transcript = transcriptSchema.safeParse(raw);
    if (transcript.success) {
      return transcript.data;
    }
  }
  return null;
}

function createEpisodeId(slug: string): EpisodeId {
  return slugify(slug).slice(0, 64) as EpisodeId;
}

function copySourceToWorkspace(
  sourcePath: string,
  targetDir: string
): Promise<string> {
  return fs
    .copyFile(
      sourcePath,
      path.join(targetDir, `source-media${path.extname(sourcePath)}`)
    )
    .then(() =>
      path.join(targetDir, `source-media${path.extname(sourcePath)}`)
    );
}

function resolveEpisodeRelativePath(
  episodeDirPath: string,
  candidatePath: string | undefined
): string | undefined {
  if (!candidatePath) {
    return undefined;
  }
  return path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(episodeDirPath, candidatePath);
}

export class MediaForgePipeline {
  public readonly cleaner;
  public readonly rewriter;
  public readonly planner = new OneToOneScenePlanner();
  public readonly speech;
  public readonly transcription;
  public readonly renderer: FFmpegVideoRenderer;
  public readonly sourceAdapter = new LocalFileSourceAdapter();
  private readonly speechSettings;
  private readonly paths: EpisodePathResolver;

  public constructor(public readonly environment: MediaForgeEnvironment) {
    const config = environment.config;
    this.paths = createEpisodePathResolver(config.workspaceDir);
    this.speechSettings = loadSpeechVoiceSettings({
      ...(config.speechVoicePreset ? { preset: config.speechVoicePreset } : {}),
      ...(config.scriptLanguage ? { language: config.scriptLanguage } : {}),
    });
    this.cleaner =
      config.textProvider === "openai-compatible" &&
      config.openAiCompatibleBaseUrl &&
      config.openAiCompatibleApiKey &&
      config.openAiCompatibleModel
        ? new OpenAiCompatibleTranscriptCleaner({
            baseUrl: config.openAiCompatibleBaseUrl,
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization
              ? { organization: config.openAiCompatibleOrganization }
              : {}),
            ...(config.openAiCompatibleProject
              ? { project: config.openAiCompatibleProject }
              : {}),
            model: config.openAiCompatibleModel,
          })
        : new ConservativeTranscriptCleaner();
    this.rewriter =
      config.textProvider === "openai-compatible" &&
      config.openAiCompatibleBaseUrl &&
      config.openAiCompatibleApiKey &&
      config.openAiCompatibleModel
        ? new OpenAiCompatibleScriptRewriter({
            baseUrl: config.openAiCompatibleBaseUrl,
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization
              ? { organization: config.openAiCompatibleOrganization }
              : {}),
            ...(config.openAiCompatibleProject
              ? { project: config.openAiCompatibleProject }
              : {}),
            model: config.openAiCompatibleModel,
          })
        : new ConservativeScriptRewriter();
    this.speech =
      config.ttsProvider === "openai-compatible" &&
      config.openAiCompatibleApiKey
        ? new OpenAiCompatibleSpeechProvider({
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization
              ? { organization: config.openAiCompatibleOrganization }
              : {}),
            ...(config.openAiCompatibleProject
              ? { project: config.openAiCompatibleProject }
              : {}),
            model:
              config.openAiSpeechModel ??
              config.openAiCompatibleModel ??
              "gpt-4o-mini-tts",
            voice:
              config.openAiSpeechVoice ??
              config.openAiCompatibleTtsVoice ??
              "onyx",
            ...(this.speechSettings.preset
              ? { preset: this.speechSettings.preset }
              : {}),
            ...(this.speechSettings.speed !== undefined
              ? { speed: this.speechSettings.speed }
              : {}),
            ...(this.speechSettings.language
              ? { language: this.speechSettings.language }
              : {}),
            ...(config.openAiCompatibleBaseUrl
              ? { baseUrl: config.openAiCompatibleBaseUrl }
              : {}),
          })
        : new MockSpeechProvider();
    this.transcription =
      config.transcriptionProvider === "openai-compatible" &&
      config.openAiCompatibleApiKey
        ? (() => {
            const transcriptionOptions: {
              apiKey: string;
              baseUrl?: string;
              model?: string;
              language?: string;
              prompt?: string;
            } = {
              apiKey: config.openAiCompatibleApiKey,
            };
            if (config.openAiCompatibleBaseUrl) {
              transcriptionOptions.baseUrl = config.openAiCompatibleBaseUrl;
            }
            transcriptionOptions.model =
              config.openAiTranscriptionModel ?? "whisper-1";
            const transcriptionLanguage =
              config.openAiTranscriptionLanguage ?? config.scriptLanguage;
            if (transcriptionLanguage) {
              transcriptionOptions.language = transcriptionLanguage;
            }
            if (config.openAiTranscriptionPrompt) {
              transcriptionOptions.prompt = config.openAiTranscriptionPrompt;
            }
            return new OpenAiCompatibleTranscriptionProvider(
              transcriptionOptions
            );
          })()
        : config.transcriptionProvider === "whisper.cpp" && config.whisperModel
          ? new WhisperCppTranscriptionProvider({
              whisperBin: config.whisperBin,
              whisperModel: config.whisperModel,
              language: config.whisperLanguage,
              threads: config.whisperThreads,
              processors: config.whisperProcessors,
              timeoutMs: config.whisperTimeoutMs,
              maxDurationSeconds: config.whisperMaxDurationSeconds,
            })
          : new MockTranscriptionProvider();
    const remoteRenderSettings: RemoteRenderSettings = {
      enabled: config.remoteRenderEnabled,
      host: config.remoteRenderHost,
      user: config.remoteRenderUser,
      port: config.remoteRenderPort,
      baseDir: config.remoteRenderBaseDir,
      concurrency: config.remoteRenderConcurrency,
      connectTimeoutSeconds: config.remoteRenderConnectTimeoutSeconds,
      commandTimeoutSeconds: config.remoteRenderCommandTimeoutSeconds,
      maxRetries: config.remoteRenderMaxRetries,
      fallbackToLocal: config.remoteRenderFallbackToLocal,
      keepFiles: config.remoteRenderKeepFiles,
      verifyHostKey: config.remoteRenderVerifyHostKey,
      ...(config.remoteRenderKnownHostsFile
        ? { knownHostsFile: config.remoteRenderKnownHostsFile }
        : {}),
      ...(config.remoteRenderSshPrivateKey
        ? { sshPrivateKey: config.remoteRenderSshPrivateKey }
        : {}),
      uploadMethod: config.remoteRenderUploadMethod,
      ...(config.localRenderConcurrency
        ? { localRenderConcurrency: config.localRenderConcurrency }
        : {}),
      cleanupMaxAgeHours: config.remoteRenderCleanupMaxAgeHours,
    };
    this.renderer = config.remoteRenderEnabled
      ? new HybridFFmpegVideoRenderer(remoteRenderSettings)
      : new FFmpegVideoRenderer();
  }

  private episodeLocale(): LocaleCode {
    return normalizeLocaleCode(this.environment.config.scriptLanguage ?? "en");
  }

  private episodeContext(
    episodeId: SharedEpisodeId,
    variant: "full" | "short" = "full"
  ) {
    return {
      episodeId,
      locale: this.episodeLocale(),
      variant,
    } as const;
  }

  public async createEpisode(
    options: CreateEpisodeOptions
  ): Promise<EpisodeManifest> {
    const sourceLabel =
      options.title ??
      path.basename(options.filePath ?? options.url ?? "episode");
    const slug = options.slug ?? slugify(sourceLabel);
    const episodeId = createEpisodeId(slug);
    const sharedEpisodeId = episodeId as unknown as SharedEpisodeId;
    const dir = this.paths.episodeRoot(sharedEpisodeId);
    await ensureEpisodeWorkspace(this.paths, sharedEpisodeId);
    await Promise.all([
      ensureDir(path.join(dir, "transcript")),
      ensureDir(path.join(dir, "script")),
      ensureDir(path.join(dir, "audio", "segments")),
      ensureDir(path.join(dir, "captions")),
      ensureDir(path.join(dir, "images", "prompt-batches")),
      ensureDir(path.join(dir, "images", "generated")),
      ensureDir(path.join(dir, "images", "inbox")),
      ensureDir(path.join(dir, "images", "rejected")),
      ensureDir(path.join(dir, "metadata")),
      ensureDir(path.join(dir, "output")),
    ]);
    let source: EpisodeManifest["source"];
    if (options.filePath) {
      const sourceMediaPath = await copySourceToWorkspace(
        options.filePath,
        this.paths.sourceMediaDir(sharedEpisodeId)
      );
      source = {
        platform: "local-file",
        filePath: path.relative(dir, sourceMediaPath),
      };
    } else if (options.url) {
      source = {
        platform: "youtube",
        url: options.url,
      };
    } else {
      throw new Error("Either filePath or url must be provided.");
    }
    const manifest = createEmptyManifest(episodeId, slug, source);
    if (options.transcriptPath) {
      const transcript = transcriptSchema.parse(
        JSON.parse(await fs.readFile(options.transcriptPath, "utf8")) as unknown
      );
      manifest.transcript = transcript;
      await writeJsonAtomic(
        path.join(dir, "original-transcript.json"),
        transcript
      );
      await writeTextAtomic(
        path.join(dir, "original-transcript.srt"),
        buildSrt(transcript.segments)
      );
    }
    await saveManifest(this.paths.manifestPath(sharedEpisodeId), manifest);
    this.environment.db.saveEpisodeManifest(manifest);
    return manifest;
  }

  public async runEpisode(
    episodeId: EpisodeId,
    options: RunPipelineOptions = {}
  ): Promise<PipelineSummary> {
    const manifestPath = await this.findManifestPath(episodeId);
    const manifest = await loadManifest(manifestPath);
    if (!manifest) {
      throw new Error(`Episode manifest not found for ${episodeId}`);
    }
    const episodeDirPath = path.dirname(manifestPath);
    const logger = this.environment.logger.child({
      episodeId,
      commandName: "run",
    });
    const warnings: string[] = [];
    const source = await this.inspectSource(manifest, episodeDirPath);
    const transcript = await this.acquireTranscript(
      manifest,
      episodeDirPath,
      source
    );
    const cleaned = await this.cleanTranscript(manifest, transcript, episodeDirPath);
    const rewritten = await this.rewriteScript(manifest, cleaned, episodeDirPath);
    const scenes = await this.planScenes(manifest, transcript, rewritten);
    const limitedScenes =
      Number.isFinite(options.sceneLimit) && (options.sceneLimit ?? 0) > 0
        ? {
            ...scenes,
            scenes: scenes.scenes.slice(0, options.sceneLimit),
          }
        : scenes;
    const audioSegments = await this.synthesizeSceneAudio(
      manifest,
      limitedScenes,
      episodeDirPath
    );
    const sceneDurationById = new Map(
      audioSegments.map(
        (segment) => [segment.sceneId, segment.durationSeconds] as const
      )
    );
    limitedScenes.scenes = limitedScenes.scenes.map((scene) => ({
      ...scene,
      actualAudioDurationSeconds:
        sceneDurationById.get(scene.id) ??
        scene.actualAudioDurationSeconds ??
        scene.estimatedDurationSeconds,
    }));
    await this.concatenateAudio(manifest, episodeDirPath, audioSegments);
    const captions = await this.createCaptions(
      manifest,
      limitedScenes,
      transcript
    );
    const prompts = this.createImagePrompts(manifest, limitedScenes);
    await this.exportWorkbooks(manifest, prompts, episodeDirPath);
    const imported = await this.importPlaceholderImages(
      manifest,
      limitedScenes,
      episodeDirPath,
      options.missingScenesOnly ?? false
    );
    const validation = validateImageAssets(limitedScenes, imported);
    if (!validation.valid) {
      warnings.push(...validation.issues);
    }
    if (options.untilStage === "concatenate-audio") {
      return {
        episodeId,
        slug: manifest.slug,
        manifestPath,
        outputPaths: [path.join(episodeDirPath, "audio", "narration.wav")],
        warnings,
      };
    }
    const renderResult = await this.render(
      manifest,
      episodeDirPath,
      limitedScenes,
      captions,
      options.outputProfile ?? "youtube"
    );
    const outputValidation = await validateRenderedVideo(
      renderResult.captionedPath ?? renderResult.cleanPath
    );
    if (!outputValidation.valid) {
      warnings.push(...outputValidation.issues);
    }
    const metadata = await this.generateMetadata(
      manifest,
      episodeDirPath,
      rewritten,
      limitedScenes
    );
    const finalManifest = await this.packageResults(
      manifest,
      episodeDirPath,
      source,
      transcript,
      cleaned,
      rewritten,
      limitedScenes,
      captions,
      imported,
      metadata,
      renderResult
    );
    await saveManifest(manifestPath, finalManifest);
    this.environment.db.saveEpisodeManifest(finalManifest);
    logger.info({ warnings }, "Pipeline completed");
    return {
      episodeId,
      slug: manifest.slug,
      manifestPath,
      outputPaths: [
        renderResult.cleanPath,
        ...(renderResult.captionedPath ? [renderResult.captionedPath] : []),
      ],
      warnings,
    };
  }

  private async findManifestPath(episodeId: EpisodeId): Promise<string> {
    const sharedEpisodeId = episodeId as unknown as SharedEpisodeId;
    const direct = this.paths.manifestPath(sharedEpisodeId);
    const directManifest = await loadManifest(direct);
    if (directManifest?.episodeId === episodeId) {
      return direct;
    }
    const workspace = this.environment.config.workspaceDir;
    const entries = await fs
      .readdir(workspace, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = path.join(workspace, entry.name, "manifest.json");
      const manifest = await loadManifest(candidate);
      if (manifest?.episodeId === episodeId) {
        return candidate;
      }
    }
    throw new Error(`Episode ${episodeId} does not exist in ${workspace}`);
  }

  private async inspectSource(
    manifest: EpisodeManifest,
    episodeDirPath: string
  ): Promise<SourceMetadata> {
    if (manifest.source.platform === "local-file" && manifest.source.filePath) {
      return createLocalSourceMetadata(
        resolveEpisodeRelativePath(episodeDirPath, manifest.source.filePath) ??
          manifest.source.filePath
      );
    }
    if (manifest.source.url) {
      return {
        platform: manifest.source.platform,
        sourceUrl: manifest.source.url,
        title: "Remote source",
        durationSeconds: 0,
        acquisitionStrategy: "manual-subtitle",
      };
    }
    throw new Error("Source metadata is incomplete.");
  }

  private async acquireTranscript(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    source: SourceMetadata
  ): Promise<Transcript> {
    const targetLanguage =
      this.environment.config.scriptLanguage ??
      manifest.transcript?.language ??
      "en";
    const episodeId = manifest.episodeId as unknown as SharedEpisodeId;
    const localeContext = this.episodeContext(episodeId, "full");
    const localizedTranscript = await loadLocalizedTranscriptArtifact(
      episodeDirPath,
      targetLanguage
    );
    if (localizedTranscript) {
      return localizedTranscript;
    }
    if (
      manifest.source.platform === "local-file" &&
      manifest.source.filePath &&
      this.environment.config.transcriptionProvider === "openai-compatible" &&
      this.environment.config.openAiCompatibleApiKey
    ) {
      const transcript = await this.transcription.transcribe(
        {
          sourceId: manifest.episodeId,
          audioPath:
            resolveEpisodeRelativePath(
              episodeDirPath,
              manifest.source.filePath
            ) ?? manifest.source.filePath,
          episodeDir: episodeDirPath,
          language: targetLanguage,
        },
        new AbortController().signal
      );
      const transcriptPath = path.join(
        this.paths.localeVariantRoot(localeContext),
        "transcript",
        "original-transcript.json"
      );
      await writeJsonAtomic(transcriptPath, transcript);
      await writeTextAtomic(
        path.join(
          this.paths.localeVariantRoot(localeContext),
          "transcript",
          "original-transcript.srt"
        ),
        buildSrt(transcript.segments)
      );
      return transcript;
    }
    if (targetLanguage.toLowerCase() !== "en") {
      throw new Error(
        `Localized Whisper transcript for ${targetLanguage} is required but was not found in ${episodeDirPath}.`
      );
    }
    if (
      manifest.transcript &&
      (manifest.transcript.words.length > 0 ||
        this.environment.config.transcriptionProvider !== "whisper.cpp")
    ) {
      return manifest.transcript;
    }
    if (manifest.source.platform === "local-file" && manifest.source.filePath) {
      const adapterResult = await this.sourceAdapter.acquireTranscript(
        source,
        new AbortController().signal
      );
      const transcriptPath = path.join(
        this.paths.localeVariantRoot(localeContext),
        "transcript",
        "original-transcript.json"
      );
      await writeJsonAtomic(transcriptPath, adapterResult.transcript);
      await writeTextAtomic(
        path.join(
          this.paths.localeVariantRoot(localeContext),
          "transcript",
          "original-transcript.srt"
        ),
        buildSrt(adapterResult.transcript.segments)
      );
      return adapterResult.transcript;
    }
    if (manifest.source.filePath) {
      const transcript = await this.transcription.transcribe(
        {
          sourceId: manifest.episodeId,
          audioPath:
            resolveEpisodeRelativePath(
              episodeDirPath,
              manifest.source.filePath
            ) ?? manifest.source.filePath,
          episodeDir: episodeDirPath,
        },
        new AbortController().signal
      );
      return transcript;
    }
    throw new Error(
      "Transcript acquisition is not available for this source in the initial slice."
    );
  }

  private async cleanTranscript(
    manifest: EpisodeManifest,
    transcript: Transcript,
    episodeDirPath: string
  ): Promise<CleanedTranscript> {
    const cleaned = await this.cleaner.clean(transcript);
    const transcriptDir = path.join(
      this.paths.localeVariantRoot(
        this.episodeContext(manifest.episodeId as unknown as SharedEpisodeId, "full")
      ),
      "transcript"
    );
    await writeJsonAtomic(
      path.join(transcriptDir, "cleaned-transcript.json"),
      cleaned
    );
    await writeTextAtomic(
      path.join(transcriptDir, "cleaned-transcript.md"),
      cleaned.cleanedText
    );
    await writeJsonAtomic(
      path.join(transcriptDir, "corrections.json"),
      cleaned.corrections
    );
    await writeJsonAtomic(
      path.join(transcriptDir, "uncertain-terms.json"),
      cleaned.uncertainTerms
    );
    return cleaned;
  }

  private async rewriteScript(
    manifest: EpisodeManifest,
    transcript: CleanedTranscript,
    episodeDirPath: string
  ): Promise<RewrittenScript> {
    const rewritten = await this.rewriter.rewrite(transcript);
    const scriptDir = path.join(
      this.paths.localeVariantRoot(
        this.episodeContext(manifest.episodeId as unknown as SharedEpisodeId, "full")
      ),
      "script"
    );
    await writeJsonAtomic(
      path.join(scriptDir, "rewritten-script.json"),
      rewritten
    );
    await writeTextAtomic(
      path.join(scriptDir, "rewritten-script.md"),
      rewritten.text
    );
    await writeJsonAtomic(
      path.join(scriptDir, "claims.json"),
      rewritten.claims
    );
    return rewritten;
  }

  private async planScenes(
    manifest: EpisodeManifest,
    transcript: Transcript,
    rewritten: RewrittenScript
  ): Promise<ScenePlan> {
    const plan = this.planner.plan(
      transcript,
      rewritten,
      [this.environment.config.defaultAspectRatio],
      {
        visualSceneTargetPer10Minutes:
          this.environment.config.visualSceneTargetPer10Minutes,
        visualSceneMinSeconds: this.environment.config.visualSceneMinSeconds,
        visualSceneMaxSeconds: this.environment.config.visualSceneMaxSeconds,
      }
    );
    const filePath = this.paths.canonicalScenesPath(
      manifest.episodeId as unknown as SharedEpisodeId
    );
    await writeJsonAtomic(filePath, plan);
    return plan;
  }

  private async synthesizeSceneAudio(
    manifest: EpisodeManifest,
    plan: ScenePlan,
    episodeDirPath: string
  ): Promise<
    Array<{ sceneId: string; filePath: string; durationSeconds: number }>
  > {
    const audioContext = this.episodeContext(
      manifest.episodeId as unknown as SharedEpisodeId,
      "full"
    );
    const output: Array<{
      sceneId: string;
      filePath: string;
      durationSeconds: number;
    }> = [];
    for (const scene of plan.scenes) {
      const outputPath = path.join(
        this.paths.audioSegmentsDir(audioContext),
        `${scene.id}.wav`
      );
      const manifestPath = sceneAudioManifestPath(outputPath);
      const currentSceneHash = buildSceneHash(scene);
      const currentPromptHash = buildScenePromptHash(
        scene,
        this.speechSettings.profile
      );
      const currentVoiceProfileHash = hashText(
        JSON.stringify(this.speechSettings.profile)
      );
      const existingManifest = await loadSceneAudioManifest(manifestPath);
      if (
        existingManifest &&
        existingManifest.sceneId === scene.id &&
        existingManifest.sceneHash === currentSceneHash &&
        existingManifest.promptHash === currentPromptHash &&
        existingManifest.voiceProfileHash === currentVoiceProfileHash &&
        (await fileExists(outputPath)) &&
        (await hashFile(outputPath).catch(() => Promise.resolve(""))) ===
          existingManifest.outputSha256
      ) {
        const durationSeconds = await runCommandJson(
          "ffprobe",
          [
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            outputPath,
          ],
          {},
          (value: unknown) => {
            const parsed = value as { format?: { duration?: string } };
            return Number.parseFloat(parsed.format?.duration ?? "0");
          }
        );
        output.push({
          sceneId: scene.id,
          filePath: outputPath,
          durationSeconds: Math.max(1, durationSeconds),
        });
        continue;
      }
      const result = await this.speech.synthesize(
        {
          sceneId: scene.id,
          text: scene.canonicalNarration,
          voiceProfile: this.speechSettings.profile,
          outputPath,
          targetDurationSeconds: scene.estimatedDurationSeconds,
        },
        new AbortController().signal
      );
      const outputSha256 = await hashFile(outputPath);
      const sceneAudioManifest: SceneAudioManifest = {
        schemaVersion: 1,
        sceneId: scene.id,
        sceneHash: currentSceneHash,
        promptHash: currentPromptHash,
        voiceProfileHash: currentVoiceProfileHash,
        outputPath,
        outputSha256,
        durationSeconds: result.durationSeconds,
        generatedAt: nowIso(),
      };
      await writeJsonAtomic(manifestPath, sceneAudioManifest);
      output.push(result);
    }
    return output;
  }

  private async concatenateAudio(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    segments: ReadonlyArray<{ filePath: string; durationSeconds: number }>
  ): Promise<string> {
    const audioContext = this.episodeContext(
      manifest.episodeId as unknown as SharedEpisodeId,
      "full"
    );
    const concatPath = path.join(this.paths.audioDir(audioContext), "segments.txt");
    await writeTextAtomic(
      concatPath,
      segments
        .map((segment) => `file '${segment.filePath.replace(/'/g, "'\\''")}'`)
        .join("\n")
    );
    const outputPath = this.paths.audioNarration(audioContext);
    const { runCommand } = await import("@mediaforge/process-runner");
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-c",
        "copy",
        outputPath,
      ],
      {
        timeoutMs: 120000,
      }
    );
    return outputPath;
  }

  private createCaptions(
    manifest: EpisodeManifest,
    plan: ScenePlan,
    transcript: Transcript
  ) {
    const captions = buildCaptionPack(transcript, plan);
    const captionsDir = path.dirname(
      this.paths.captionsFile(
        this.episodeContext(
          manifest.episodeId as unknown as SharedEpisodeId,
          "full"
        ),
        "srt"
      )
    );
    return Promise.all([
      writeTextAtomic(path.join(captionsDir, "captions.srt"), captions.srt),
      writeTextAtomic(path.join(captionsDir, "captions.vtt"), captions.vtt),
      writeTextAtomic(path.join(captionsDir, "captions.ass"), captions.ass),
    ]).then(() => captions);
  }

  private createImagePrompts(manifest: EpisodeManifest, scenePlan: ScenePlan) {
    const prompts = createPromptBatch(
      scenePlan,
      this.environment.config.defaultAspectRatio,
      localSceneStyle,
      localSceneNegativePrompt
    );
    return prompts;
  }

  private async exportWorkbooks(
    manifest: EpisodeManifest,
    prompts: ReturnType<typeof createPromptBatch>,
    episodeDirPath: string
  ): Promise<void> {
    await exportSceneWorkbook(path.join(episodeDirPath), prompts, {
      batchSize: this.environment.config.openArtBatchSize,
      aspectRatio: this.environment.config.defaultAspectRatio,
      globalStyle: localSceneStyle,
    });
  }

  private async importPlaceholderImages(
    manifest: EpisodeManifest,
    scenePlan: ScenePlan,
    episodeDirPath: string,
    missingOnly: boolean
  ): Promise<ImageAsset[]> {
    const generatedDir = path.dirname(
      this.paths.generatedImage(
        manifest.episodeId as unknown as SharedEpisodeId,
        "placeholder"
      )
    );
    await ensureDir(generatedDir);
    const assets: ImageAsset[] = [];
    for (const scene of scenePlan.scenes) {
      const outputPath = path.join(
        generatedDir,
        scene.expectedImageFilenames[0] ?? `${scene.id}.png`
      );
      const exists = await fileExists(outputPath);
      if (exists) {
        assets.push({
          sceneId: scene.id,
          sourcePath: outputPath,
          renderedPath: outputPath,
          width:
            this.environment.config.defaultAspectRatio === "16:9" ? 1920 : 1080,
          height:
            this.environment.config.defaultAspectRatio === "16:9" ? 1080 : 1920,
          mimeType: "image/png",
          checksumSha256: hashText(scene.id),
          validated: true,
        });
        continue;
      }
      if (missingOnly) {
        continue;
      }
      assets.push(
        await createPlaceholderImage(
          outputPath,
          scene,
          this.environment.config.defaultAspectRatio
        )
      );
    }
    return assets;
  }

  private async generateMetadata(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    rewritten: RewrittenScript,
    plan: ScenePlan
  ): Promise<PublishingMetadata> {
    const metadataDir = this.paths.metadataDir(
      this.episodeContext(
        manifest.episodeId as unknown as SharedEpisodeId,
        "full"
      )
    );
    const scenesFilePath = this.paths.canonicalScenesPath(
      manifest.episodeId as unknown as SharedEpisodeId
    );
    const sourceText = await fs
      .readFile(scenesFilePath, "utf8")
      .catch(() => JSON.stringify(plan));
    const generated = await generateYoutubeMetadataForTarget(
      {
        sourceFilePath: scenesFilePath,
        episodeDir: episodeDirPath,
        outputDir: metadataDir,
        episodeSlug: manifest.slug,
        sourceId: manifest.episodeId,
        language:
          this.environment.config.youtubeMetadataLanguage ??
          this.environment.config.scriptLanguage ??
          "en",
        scenePlan: plan,
        sourceSha256: hashText(sourceText),
        durationSeconds: Math.max(
          ...plan.scenes.map((scene) => scene.timing.endSeconds),
          0
        ),
      },
      {
        apiKey:
          this.environment.config.openAiCompatibleApiKey ??
          process.env["OPENAI_API_KEY"] ??
          "",
        model: this.environment.config.openAiMetadataModel ?? "gpt-4.1-mini",
        language:
          this.environment.config.youtubeMetadataLanguage ??
          this.environment.config.scriptLanguage ??
          "en",
        promptText: await fs.readFile(
          path.resolve("prompts", "youtube-metadata.prompt.md"),
          "utf8"
        ),
        promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
        maxRetries: this.environment.config.openAiMetadataMaxRetries ?? 3,
        timeoutMs: this.environment.config.openAiMetadataTimeoutMs ?? 120000,
        keepFile: this.environment.config.openAiMetadataKeepFile,
        logger: this.environment.logger,
      }
    );
    const youtube = generated.metadata;
    const tiktok = this.convertYoutubeMetadataForPlatform(
      youtube,
      plan,
      rewritten,
      "tiktok"
    );
    await Promise.all([
      writeJsonAtomic(path.join(metadataDir, "youtube.json"), youtube),
      writeJsonAtomic(path.join(metadataDir, "tiktok.json"), tiktok),
      writeTextAtomic(
        path.join(metadataDir, "titles.txt"),
        [youtube.title.recommended, ...youtube.title.alternatives].join("\n")
      ),
      writeTextAtomic(
        path.join(metadataDir, "description.txt"),
        youtube.description
      ),
      writeTextAtomic(
        path.join(metadataDir, "tags.txt"),
        youtube.tags.items.join("\n")
      ),
      writeTextAtomic(
        path.join(metadataDir, "chapters.txt"),
        youtube.chapters.items
          .map(
            (chapter) => `${chapter.startSeconds.toFixed(0)} ${chapter.title}`
          )
          .join("\n")
      ),
      writeTextAtomic(
        path.join(metadataDir, "publishing.md"),
        JSON.stringify(youtube, null, 2)
      ),
    ]);
    return this.convertYoutubeMetadataForPlatform(
      youtube,
      plan,
      rewritten,
      "youtube"
    );
  }

  private convertYoutubeMetadataForPlatform(
    youtube: YoutubeMetadata,
    plan: ScenePlan,
    rewritten: RewrittenScript,
    platform: "youtube" | "tiktok"
  ): PublishingMetadata {
    const coverTexts = [
      youtube.thumbnail.recommendedText,
      ...youtube.thumbnail.alternativeTexts,
    ];
    return {
      sourceId: (youtube.source.sourceId ?? rewritten.sourceId) as EpisodeId,
      platform,
      language: youtube.source.language,
      titleCandidates: [
        youtube.title.recommended,
        ...youtube.title.alternatives,
      ],
      recommendedTitle: youtube.title.recommended,
      description: youtube.description,
      caption:
        platform === "tiktok" ? youtube.description.slice(0, 220) : undefined,
      tags: youtube.tags.items,
      hashtags: youtube.hashtags,
      chapters:
        platform === "youtube"
          ? youtube.chapters.items.map((chapter) => ({
              timestampSeconds: chapter.startSeconds,
              title: chapter.title,
            }))
          : plan.scenes.map((scene) => ({
              timestampSeconds: scene.timing.startSeconds,
              title: scene.canonicalNarration.slice(0, 72),
            })),
      thumbnailTextCandidates: coverTexts,
      coverTextCandidates: coverTexts,
      pinnedComment: youtube.pinnedComment,
      summary: youtube.contentSummary,
      primaryKeyword: youtube.seo.primaryKeyword,
      secondaryKeywords: youtube.seo.secondaryKeywords,
      warnings: youtube.verificationWarnings.map(
        (warning) => `${warning.claim}: ${warning.reason}`
      ),
    };
  }

  private async render(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    plan: ScenePlan,
    captions: Awaited<ReturnType<typeof buildCaptionPack>>,
    profileName: "youtube" | "vertical"
  ) {
    const renderContext = this.episodeContext(
      manifest.episodeId as unknown as SharedEpisodeId,
      "full"
    );
    const renderProfile = {
      id: profileName,
      label: profileName,
      width: profileName === "youtube" ? 1920 : 1080,
      height: profileName === "youtube" ? 1080 : 1920,
      fps: 30,
      aspectRatio: profileName === "youtube" ? "16:9" : "9:16",
      burnCaptions: true,
    } as const;
    const renderer = this.renderer;
    return renderer.render(
      {
        episodeDir: episodeDirPath,
        scenePlan: plan,
        captionsPath: this.paths.captionsFile(renderContext, "ass"),
        outputDir: this.paths.renderDir(renderContext, renderProfile.id),
        renderProfile,
        captionBurnIn: true,
        trailingSilenceRatio: this.environment.config.trailingSilenceRatio,
        trailingSilenceBufferSeconds:
          this.environment.config.trailingSilenceBufferSeconds,
      },
      new AbortController().signal
    );
  }

  private async packageResults(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    source: SourceMetadata,
    transcript: Transcript,
    cleaned: CleanedTranscript,
    rewritten: RewrittenScript,
    plan: ScenePlan,
    captions: Awaited<ReturnType<typeof buildCaptionPack>>,
    images: ImageAsset[],
    metadata: PublishingMetadata,
    renderResult: Awaited<ReturnType<FFmpegVideoRenderer["render"]>>
  ): Promise<EpisodeManifest> {
    const context = this.episodeContext(
      manifest.episodeId as unknown as SharedEpisodeId,
      "full"
    );
    const nextManifest: EpisodeManifest = episodeManifestSchema.parse({
      ...manifest,
      sourceMetadata: source,
      sourceMedia: manifest.source.filePath
        ? {
            path: path.relative(episodeDirPath, manifest.source.filePath),
            mimeType: "video/mp4",
            sizeBytes: 0,
            durationSeconds: source.durationSeconds,
          }
        : undefined,
      transcript,
      cleanedTranscript: cleaned,
      rewrittenScript: rewritten,
      scenePlan: plan,
      alignment: captions.alignment,
      captions: {
        srtPath: path.relative(
          episodeDirPath,
          this.paths.captionsFile(context, "srt")
        ),
        vttPath: path.relative(
          episodeDirPath,
          this.paths.captionsFile(context, "vtt")
        ),
        assPath: path.relative(
          episodeDirPath,
          this.paths.captionsFile(context, "ass")
        ),
      },
      images,
      publishingMetadata: metadata,
      artifacts: [
        {
          id: `artifact-${slugify(path.basename(renderResult.cleanPath))}` as never,
          kind: "video",
          path: path.relative(episodeDirPath, renderResult.cleanPath),
          mimeType: "video/mp4",
          sizeBytes: 0,
          checksumSha256: await hashFile(renderResult.cleanPath),
          createdAt: nowIso(),
        },
      ],
      pipelineRuns: manifest.pipelineRuns,
      updatedAt: nowIso(),
    });
    await saveManifest(
      this.paths.manifestPath(manifest.episodeId as unknown as SharedEpisodeId),
      nextManifest
    );
    return nextManifest;
  }
}

export async function createEnvironment(
  configOverrides: RuntimeConfigOverrides = {},
  episodeOverrides: RuntimeConfigOverrides = {}
): Promise<MediaForgeEnvironment> {
  const config = await loadRuntimeConfig(configOverrides, episodeOverrides);
  const db = createPersistence(config.dbPath);
  db.migrate();
  const logger = createLogger(config.logLevel);
  return { config, db, logger };
}

export async function createPipeline(
  configOverrides: RuntimeConfigOverrides = {},
  episodeOverrides: RuntimeConfigOverrides = {}
): Promise<MediaForgePipeline> {
  return new MediaForgePipeline(
    await createEnvironment(configOverrides, episodeOverrides)
  );
}
