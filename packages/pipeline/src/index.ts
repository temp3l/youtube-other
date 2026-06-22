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
  transcriptSchema
} from "@mediaforge/domain";
import { loadRuntimeConfig, type RuntimeConfig, type RuntimeConfigOverrides } from "@mediaforge/config";
import { createLogger } from "@mediaforge/observability";
import { createPersistence, type SQLitePersistence } from "@mediaforge/persistence";
import { LocalFileSourceAdapter, createLocalSourceMetadata } from "@mediaforge/source-ingestion";
import { ConservativeScriptRewriter, OpenAiCompatibleScriptRewriter } from "@mediaforge/rewriting";
import { ConservativeTranscriptCleaner, OpenAiCompatibleTranscriptCleaner } from "@mediaforge/transcript-cleaning";
import { OneToOneScenePlanner } from "@mediaforge/scene-planning";
import { MockSpeechProvider, OpenAiCompatibleSpeechProvider, loadSpeechVoiceSettings } from "@mediaforge/speech";
import { buildCaptionPack } from "@mediaforge/alignment";
import {
  createPlaceholderImage,
  createPromptBatch,
  exportSceneWorkbook,
  localSceneNegativePrompt,
  localSceneStyle,
  missingScenes,
  validateImageAssets
} from "@mediaforge/image-generation";
import { HeuristicMetadataProvider } from "@mediaforge/metadata";
import { FFmpegVideoRenderer, validateRenderedVideo } from "@mediaforge/rendering";
import { buildSrt, ensureDir, fileExists, hashText, slugify, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import {
  MockTranscriptionProvider,
  OpenAiCompatibleTranscriptionProvider,
  WhisperCppTranscriptionProvider
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
  "generate-publishing-metadata",
  "render-video",
  "validate-output",
  "package-results"
];

function nowIso(): string {
  return new Date().toISOString();
}

async function loadManifest(manifestPath: string): Promise<EpisodeManifest | null> {
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  return episodeManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown);
}

async function saveManifest(manifestPath: string, manifest: EpisodeManifest): Promise<void> {
  await writeJsonAtomic(manifestPath, manifest);
}

function createEmptyManifest(episodeId: EpisodeId, slug: string, source: EpisodeManifest["source"]): EpisodeManifest {
  const timestamp = nowIso();
  return episodeManifestSchema.parse({
    episodeId,
    slug,
    source,
    images: [],
    artifacts: [],
    pipelineRuns: [],
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function episodeDir(workspaceDir: string, slug: string): string {
  return path.join(workspaceDir, slug);
}

function localizedTranscriptArtifactPaths(episodeDirPath: string, language: string): string[] {
  const safeLanguage = slugify(language);
  return [
    path.join(episodeDirPath, "audio", `whisper-transcript-${safeLanguage}.json`),
    path.join(episodeDirPath, "transcript", `transcript-${safeLanguage}.json`)
  ];
}

async function loadLocalizedTranscriptArtifact(episodeDirPath: string, language: string): Promise<Transcript | null> {
  for (const candidate of localizedTranscriptArtifactPaths(episodeDirPath, language)) {
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
        words: normalized.data.words
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

function copySourceToWorkspace(sourcePath: string, targetDir: string): Promise<string> {
  return fs.copyFile(sourcePath, path.join(targetDir, `source-media${path.extname(sourcePath)}`)).then(
    () => path.join(targetDir, `source-media${path.extname(sourcePath)}`)
  );
}

export class MediaForgePipeline {
  public readonly cleaner;
  public readonly rewriter;
  public readonly planner = new OneToOneScenePlanner();
  public readonly speech;
  public readonly transcription;
  public readonly metadata = new HeuristicMetadataProvider();
  public readonly renderer = new FFmpegVideoRenderer();
  public readonly sourceAdapter = new LocalFileSourceAdapter();
  private readonly speechSettings;

  public constructor(public readonly environment: MediaForgeEnvironment) {
    const config = environment.config;
    this.speechSettings = loadSpeechVoiceSettings({
      ...(config.speechVoicePreset ? { preset: config.speechVoicePreset } : {}),
      ...(config.scriptLanguage ? { language: config.scriptLanguage } : {})
    });
    this.cleaner =
      config.textProvider === "openai-compatible" && config.openAiCompatibleBaseUrl && config.openAiCompatibleApiKey && config.openAiCompatibleModel
        ? new OpenAiCompatibleTranscriptCleaner({
            baseUrl: config.openAiCompatibleBaseUrl,
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization ? { organization: config.openAiCompatibleOrganization } : {}),
            ...(config.openAiCompatibleProject ? { project: config.openAiCompatibleProject } : {}),
            model: config.openAiCompatibleModel
          })
        : new ConservativeTranscriptCleaner();
    this.rewriter =
      config.textProvider === "openai-compatible" && config.openAiCompatibleBaseUrl && config.openAiCompatibleApiKey && config.openAiCompatibleModel
        ? new OpenAiCompatibleScriptRewriter({
            baseUrl: config.openAiCompatibleBaseUrl,
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization ? { organization: config.openAiCompatibleOrganization } : {}),
            ...(config.openAiCompatibleProject ? { project: config.openAiCompatibleProject } : {}),
            model: config.openAiCompatibleModel
          })
        : new ConservativeScriptRewriter();
    this.speech =
      config.ttsProvider === "openai-compatible" && config.openAiCompatibleApiKey
        ? new OpenAiCompatibleSpeechProvider({
            apiKey: config.openAiCompatibleApiKey,
            ...(config.openAiCompatibleOrganization ? { organization: config.openAiCompatibleOrganization } : {}),
            ...(config.openAiCompatibleProject ? { project: config.openAiCompatibleProject } : {}),
            model: config.openAiSpeechModel ?? config.openAiCompatibleModel ?? "gpt-4o-mini-tts",
            voice: config.openAiSpeechVoice ?? config.openAiCompatibleTtsVoice ?? "onyx",
            ...(this.speechSettings.preset ? { preset: this.speechSettings.preset } : {}),
            ...(this.speechSettings.language ? { language: this.speechSettings.language } : {}),
            ...(config.openAiCompatibleBaseUrl ? { baseUrl: config.openAiCompatibleBaseUrl } : {})
          })
        : new MockSpeechProvider();
    this.transcription =
      config.transcriptionProvider === "openai-compatible" && config.openAiCompatibleApiKey
        ? (() => {
            const transcriptionOptions: {
              apiKey: string;
              baseUrl?: string;
              model?: string;
              language?: string;
              prompt?: string;
            } = {
              apiKey: config.openAiCompatibleApiKey
            };
            if (config.openAiCompatibleBaseUrl) {
              transcriptionOptions.baseUrl = config.openAiCompatibleBaseUrl;
            }
            transcriptionOptions.model = config.openAiTranscriptionModel ?? "whisper-1";
            const transcriptionLanguage = config.openAiTranscriptionLanguage ?? config.scriptLanguage;
            if (transcriptionLanguage) {
              transcriptionOptions.language = transcriptionLanguage;
            }
            if (config.openAiTranscriptionPrompt) {
              transcriptionOptions.prompt = config.openAiTranscriptionPrompt;
            }
            return new OpenAiCompatibleTranscriptionProvider(transcriptionOptions);
          })()
        : config.transcriptionProvider === "whisper.cpp" && config.whisperModel
        ? new WhisperCppTranscriptionProvider({
            whisperBin: config.whisperBin,
            whisperModel: config.whisperModel,
            language: config.whisperLanguage,
            threads: config.whisperThreads,
            processors: config.whisperProcessors,
            timeoutMs: config.whisperTimeoutMs,
            maxDurationSeconds: config.whisperMaxDurationSeconds
          })
        : new MockTranscriptionProvider();
  }

  public async createEpisode(options: CreateEpisodeOptions): Promise<EpisodeManifest> {
    const sourceLabel = options.title ?? path.basename(options.filePath ?? options.url ?? "episode");
    const slug = options.slug ?? slugify(sourceLabel);
    const episodeId = createEpisodeId(slug);
    const dir = episodeDir(this.environment.config.workspaceDir, slug);
    await ensureDir(dir);
    await Promise.all([
      ensureDir(path.join(dir, "source")),
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
      ensureDir(path.join(dir, "logs"))
    ]);
    let source: EpisodeManifest["source"];
    if (options.filePath) {
      const sourceMediaPath = await copySourceToWorkspace(options.filePath, path.join(dir, "source"));
      source = {
        platform: "local-file",
        filePath: sourceMediaPath
      };
    } else if (options.url) {
      source = {
        platform: "youtube",
        url: options.url
      };
    } else {
      throw new Error("Either filePath or url must be provided.");
    }
    const manifest = createEmptyManifest(episodeId, slug, source);
    if (options.transcriptPath) {
      const transcript = transcriptSchema.parse(JSON.parse(await fs.readFile(options.transcriptPath, "utf8")) as unknown);
      manifest.transcript = transcript;
      await writeJsonAtomic(path.join(dir, "original-transcript.json"), transcript);
      await writeTextAtomic(path.join(dir, "original-transcript.srt"), buildSrt(transcript.segments));
    }
    await saveManifest(path.join(dir, "manifest.json"), manifest);
    this.environment.db.saveEpisodeManifest(manifest);
    return manifest;
  }

  public async runEpisode(episodeId: EpisodeId, options: RunPipelineOptions = {}): Promise<PipelineSummary> {
    const manifestPath = await this.findManifestPath(episodeId);
    const manifest = await loadManifest(manifestPath);
    if (!manifest) {
      throw new Error(`Episode manifest not found for ${episodeId}`);
    }
    const episodeDirPath = path.dirname(manifestPath);
    const logger = this.environment.logger.child({ episodeId, commandName: "run" });
    const warnings: string[] = [];
    const source = await this.inspectSource(manifest, episodeDirPath);
    const transcript = await this.acquireTranscript(manifest, episodeDirPath, source);
    const cleaned = await this.cleanTranscript(manifest, transcript);
    const rewritten = await this.rewriteScript(manifest, cleaned);
    const scenes = await this.planScenes(manifest, transcript, rewritten);
    const limitedScenes = Number.isFinite(options.sceneLimit) && (options.sceneLimit ?? 0) > 0 ? {
      ...scenes,
      scenes: scenes.scenes.slice(0, options.sceneLimit)
    } : scenes;
    const audioSegments = await this.synthesizeSceneAudio(manifest, limitedScenes, episodeDirPath);
    const sceneDurationById = new Map(audioSegments.map((segment) => [segment.sceneId, segment.durationSeconds] as const));
    limitedScenes.scenes = limitedScenes.scenes.map((scene) => ({
      ...scene,
      actualAudioDurationSeconds: sceneDurationById.get(scene.id) ?? scene.actualAudioDurationSeconds ?? scene.estimatedDurationSeconds
    }));
    await this.concatenateAudio(manifest, episodeDirPath, audioSegments);
    const captions = await this.createCaptions(manifest, limitedScenes, transcript);
    const prompts = this.createImagePrompts(manifest, limitedScenes);
    await this.exportWorkbooks(manifest, prompts, episodeDirPath);
    const imported = await this.importPlaceholderImages(manifest, limitedScenes, episodeDirPath, options.missingScenesOnly ?? false);
    const validation = validateImageAssets(limitedScenes, imported);
    if (!validation.valid) {
      warnings.push(...validation.issues);
    }
    const metadata = this.generateMetadata(manifest, rewritten, limitedScenes);
    if (options.untilStage === "concatenate-audio") {
      return {
        episodeId,
        slug: manifest.slug,
        manifestPath,
        outputPaths: [path.join(episodeDirPath, "audio", "narration.wav")],
        warnings
      };
    }
    const renderResult = await this.render(manifest, episodeDirPath, limitedScenes, captions, options.outputProfile ?? "youtube");
    const outputValidation = await validateRenderedVideo(renderResult.captionedPath ?? renderResult.cleanPath);
    if (!outputValidation.valid) {
      warnings.push(...outputValidation.issues);
    }
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
        ...(renderResult.captionedPath ? [renderResult.captionedPath] : [])
      ],
      warnings
    };
  }

  private async findManifestPath(episodeId: EpisodeId): Promise<string> {
    const workspace = this.environment.config.workspaceDir;
    const entries = await fs.readdir(workspace, { withFileTypes: true }).catch(() => []);
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

  private async inspectSource(manifest: EpisodeManifest, episodeDirPath: string): Promise<SourceMetadata> {
    if (manifest.source.platform === "local-file" && manifest.source.filePath) {
      return createLocalSourceMetadata(manifest.source.filePath);
    }
    if (manifest.source.url) {
      return {
        platform: manifest.source.platform,
        sourceUrl: manifest.source.url,
        title: "Remote source",
        durationSeconds: 0,
        acquisitionStrategy: "manual-subtitle"
      };
    }
    throw new Error("Source metadata is incomplete.");
  }

  private async acquireTranscript(manifest: EpisodeManifest, episodeDirPath: string, source: SourceMetadata): Promise<Transcript> {
    const targetLanguage = this.environment.config.scriptLanguage ?? manifest.transcript?.language ?? "en";
    const localizedTranscript = await loadLocalizedTranscriptArtifact(episodeDirPath, targetLanguage);
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
          audioPath: manifest.source.filePath,
          episodeDir: episodeDirPath,
          language: targetLanguage
        },
        new AbortController().signal
      );
      const transcriptPath = path.join(episodeDirPath, "original-transcript.json");
      await writeJsonAtomic(transcriptPath, transcript);
      await writeTextAtomic(path.join(episodeDirPath, "original-transcript.srt"), buildSrt(transcript.segments));
      return transcript;
    }
    if (targetLanguage.toLowerCase() !== "en") {
      throw new Error(`Localized Whisper transcript for ${targetLanguage} is required but was not found in ${episodeDirPath}.`);
    }
    if (manifest.transcript && (manifest.transcript.words.length > 0 || this.environment.config.transcriptionProvider !== "whisper.cpp")) {
      return manifest.transcript;
    }
    if (manifest.source.platform === "local-file" && manifest.source.filePath) {
      const adapterResult = await this.sourceAdapter.acquireTranscript(source, new AbortController().signal);
      const transcriptPath = path.join(episodeDirPath, "original-transcript.json");
      await writeJsonAtomic(transcriptPath, adapterResult.transcript);
      await writeTextAtomic(path.join(episodeDirPath, "original-transcript.srt"), buildSrt(adapterResult.transcript.segments));
      return adapterResult.transcript;
    }
    if (manifest.source.filePath) {
      const transcript = await this.transcription.transcribe(
        {
          sourceId: manifest.episodeId,
          audioPath: manifest.source.filePath,
          episodeDir: episodeDirPath
        },
        new AbortController().signal
      );
      return transcript;
    }
    throw new Error("Transcript acquisition is not available for this source in the initial slice.");
  }

  private async cleanTranscript(manifest: EpisodeManifest, transcript: Transcript): Promise<CleanedTranscript> {
    const cleaned = await this.cleaner.clean(transcript);
    const transcriptDir = path.join(this.environment.config.workspaceDir, manifest.slug, "transcript");
    await writeJsonAtomic(path.join(transcriptDir, "cleaned-transcript.json"), cleaned);
    await writeTextAtomic(path.join(transcriptDir, "cleaned-transcript.md"), cleaned.cleanedText);
    await writeJsonAtomic(path.join(transcriptDir, "corrections.json"), cleaned.corrections);
    await writeJsonAtomic(path.join(transcriptDir, "uncertain-terms.json"), cleaned.uncertainTerms);
    return cleaned;
  }

  private async rewriteScript(manifest: EpisodeManifest, transcript: CleanedTranscript): Promise<RewrittenScript> {
    const rewritten = await this.rewriter.rewrite(transcript);
    const scriptDir = path.join(this.environment.config.workspaceDir, manifest.slug, "script");
    await writeJsonAtomic(path.join(scriptDir, "rewritten-script.json"), rewritten);
    await writeTextAtomic(path.join(scriptDir, "rewritten-script.md"), rewritten.text);
    await writeJsonAtomic(path.join(scriptDir, "claims.json"), rewritten.claims);
    return rewritten;
  }

  private async planScenes(manifest: EpisodeManifest, transcript: Transcript, rewritten: RewrittenScript): Promise<ScenePlan> {
    const plan = this.planner.plan(transcript, rewritten, [this.environment.config.defaultAspectRatio], {
      visualSceneMinSeconds: this.environment.config.visualSceneMinSeconds,
      visualSceneMaxSeconds: this.environment.config.visualSceneMaxSeconds
    });
    const filePath = path.join(this.environment.config.workspaceDir, manifest.slug, "scenes.json");
    await writeJsonAtomic(filePath, plan);
    return plan;
  }

  private async synthesizeSceneAudio(
    manifest: EpisodeManifest,
    plan: ScenePlan,
    episodeDirPath: string
  ): Promise<Array<{ sceneId: string; filePath: string; durationSeconds: number }>> {
    const output: Array<{ sceneId: string; filePath: string; durationSeconds: number }> = [];
    for (const scene of plan.scenes) {
      const outputPath = path.join(episodeDirPath, "audio", "segments", `${scene.id}.wav`);
      if (await fileExists(outputPath)) {
        const durationSeconds = await runCommandJson(
          "ffprobe",
          ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", outputPath],
          {},
          (value: unknown) => {
            const parsed = value as { format?: { duration?: string } };
            return Number.parseFloat(parsed.format?.duration ?? "0");
          }
        );
        output.push({
          sceneId: scene.id,
          filePath: outputPath,
          durationSeconds: Math.max(1, durationSeconds)
        });
        continue;
      }
      const result = await this.speech.synthesize(
        {
          sceneId: scene.id,
          text: scene.canonicalNarration,
          voiceProfile: this.speechSettings.profile,
          outputPath,
          targetDurationSeconds: scene.estimatedDurationSeconds
        },
        new AbortController().signal
      );
      output.push(result);
    }
    return output;
  }

  private async concatenateAudio(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    segments: ReadonlyArray<{ filePath: string; durationSeconds: number }>
  ): Promise<string> {
    const concatPath = path.join(episodeDirPath, "audio", "segments.txt");
    await writeTextAtomic(
      concatPath,
      segments.map((segment) => `file '${segment.filePath.replace(/'/g, "'\\''")}'`).join("\n")
    );
    const outputPath = path.join(episodeDirPath, "audio", "narration.wav");
    const { runCommand } = await import("@mediaforge/process-runner");
    await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", outputPath], {
      timeoutMs: 120000
    });
    return outputPath;
  }

  private createCaptions(manifest: EpisodeManifest, plan: ScenePlan, transcript: Transcript) {
    const captions = buildCaptionPack(transcript, plan);
    const captionsDir = path.join(this.environment.config.workspaceDir, manifest.slug, "captions");
    return Promise.all([
      writeTextAtomic(path.join(captionsDir, "captions.srt"), captions.srt),
      writeTextAtomic(path.join(captionsDir, "captions.vtt"), captions.vtt),
      writeTextAtomic(path.join(captionsDir, "captions.ass"), captions.ass)
    ]).then(() => captions);
  }

  private createImagePrompts(manifest: EpisodeManifest, scenePlan: ScenePlan) {
    const prompts = createPromptBatch(scenePlan, this.environment.config.defaultAspectRatio, localSceneStyle, localSceneNegativePrompt);
    return prompts;
  }

  private async exportWorkbooks(manifest: EpisodeManifest, prompts: ReturnType<typeof createPromptBatch>, episodeDirPath: string): Promise<void> {
    await exportSceneWorkbook(path.join(episodeDirPath), prompts, {
      batchSize: this.environment.config.openArtBatchSize,
      aspectRatio: this.environment.config.defaultAspectRatio,
      globalStyle: localSceneStyle
    });
  }

  private async importPlaceholderImages(
    manifest: EpisodeManifest,
    scenePlan: ScenePlan,
    episodeDirPath: string,
    missingOnly: boolean
  ): Promise<ImageAsset[]> {
    const generatedDir = path.join(episodeDirPath, "images", "generated");
    await ensureDir(generatedDir);
    const assets: ImageAsset[] = [];
    for (const scene of scenePlan.scenes) {
      const outputPath = path.join(generatedDir, scene.expectedImageFilenames[0] ?? `${scene.id}.png`);
      const exists = await fileExists(outputPath);
      if (exists) {
        assets.push({
          sceneId: scene.id,
          sourcePath: outputPath,
          renderedPath: outputPath,
          width: this.environment.config.defaultAspectRatio === "16:9" ? 1920 : 1080,
          height: this.environment.config.defaultAspectRatio === "16:9" ? 1080 : 1920,
          mimeType: "image/png",
          checksumSha256: hashText(scene.id),
          validated: true
        });
        continue;
      }
      if (missingOnly) {
        continue;
      }
      assets.push(await createPlaceholderImage(outputPath, scene, this.environment.config.defaultAspectRatio));
    }
    return assets;
  }

  private generateMetadata(manifest: EpisodeManifest, rewritten: RewrittenScript, plan: ScenePlan): PublishingMetadata {
    const youtube = this.metadata.generate(rewritten, plan, "youtube");
    const tiktok = this.metadata.generate(rewritten, plan, "tiktok");
    const metadataDir = path.join(this.environment.config.workspaceDir, manifest.slug, "metadata");
    void writeJsonAtomic(path.join(metadataDir, "youtube.json"), youtube);
    void writeJsonAtomic(path.join(metadataDir, "tiktok.json"), tiktok);
    void writeTextAtomic(path.join(metadataDir, "titles.txt"), youtube.titleCandidates.join("\n"));
    void writeTextAtomic(path.join(metadataDir, "description.txt"), youtube.description);
    void writeTextAtomic(path.join(metadataDir, "tags.txt"), youtube.tags.join("\n"));
    void writeTextAtomic(
      path.join(metadataDir, "chapters.txt"),
      youtube.chapters.map((chapter) => `${chapter.timestampSeconds.toFixed(0)} ${chapter.title}`).join("\n")
    );
    void writeTextAtomic(path.join(metadataDir, "publishing.md"), JSON.stringify(youtube, null, 2));
    return youtube;
  }

  private async render(
    manifest: EpisodeManifest,
    episodeDirPath: string,
    plan: ScenePlan,
    captions: Awaited<ReturnType<typeof buildCaptionPack>>,
    profileName: "youtube" | "vertical"
  ) {
    const renderProfile = {
      id: profileName,
      label: profileName,
      width: profileName === "youtube" ? 1920 : 1080,
      height: profileName === "youtube" ? 1080 : 1920,
      fps: 30,
      aspectRatio: profileName === "youtube" ? "16:9" : "9:16",
      burnCaptions: true
    } as const;
    const renderer = this.renderer;
    return renderer.render(
      {
        episodeDir: episodeDirPath,
        scenePlan: plan,
        captionsPath: path.join(episodeDirPath, "captions", "captions.ass"),
        outputDir: path.join(episodeDirPath, "output"),
        renderProfile,
        captionBurnIn: true,
        trailingSilenceRatio: this.environment.config.trailingSilenceRatio
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
    const nextManifest: EpisodeManifest = episodeManifestSchema.parse({
      ...manifest,
      sourceMetadata: source,
      sourceMedia: manifest.source.filePath
        ? {
            path: manifest.source.filePath,
            mimeType: "video/mp4",
            sizeBytes: 0,
            durationSeconds: source.durationSeconds
          }
        : undefined,
      transcript,
      cleanedTranscript: cleaned,
      rewrittenScript: rewritten,
      scenePlan: plan,
      alignment: captions.alignment,
      captions: {
        srtPath: path.join(episodeDirPath, "captions", "captions.srt"),
        vttPath: path.join(episodeDirPath, "captions", "captions.vtt"),
        assPath: path.join(episodeDirPath, "captions", "captions.ass")
      },
      images,
      publishingMetadata: metadata,
      artifacts: [
        {
          id: `artifact-${slugify(path.basename(renderResult.cleanPath))}` as never,
          kind: "video",
          path: renderResult.cleanPath,
          mimeType: "video/mp4",
          sizeBytes: 0,
          checksumSha256: hashText(renderResult.cleanPath),
          createdAt: nowIso()
        }
      ],
      pipelineRuns: manifest.pipelineRuns,
      updatedAt: nowIso()
    });
    await saveManifest(path.join(episodeDirPath, "manifest.json"), nextManifest);
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
  return new MediaForgePipeline(await createEnvironment(configOverrides, episodeOverrides));
}
