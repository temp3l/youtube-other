import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import {
  canonicalVisualManifestSchema,
  localizedAlignmentManifestSchema,
  localizedVisualValidationReportSchema,
  scenePlanSchema,
  type RenderProfile,
  type ScenePlan,
} from "@mediaforge/domain";
import { assertGeneratedImageFileMatchesSpec } from "@mediaforge/image-generation";
import {
  FFmpegVideoRenderer,
  finalRenderedMediaValidationReportPath,
  renderManifestSchema,
  validateFinalRenderedMedia,
  validateSceneClipArtifacts,
  resolveSharedVisualRenderTimeline,
  type FinalRenderedMediaValidationReport,
} from "@mediaforge/rendering";
import {
  createEpisodePathResolver,
  fileExists,
  hashFile,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  sceneFilename,
  writeJsonAtomic,
  type ContentVariant,
  type LocaleCode,
} from "@mediaforge/shared";
import {
  createNarrationArtifactPaths,
  narrationQualityGateReportSchema,
  probeAudioWithFfprobe,
} from "@mediaforge/speech";
import {
  loadProductionStatuses,
  resolveEpisodesRoot,
  splitCsv,
  workspaceRootFromOutputRoot,
  type LoadedProductionStatus,
  type StoryWorkflowSelectionOptions,
} from "./story-workflow-command-helpers.js";
import { mergeCommandOptions } from "./command-option-helpers.js";

export interface StoryRenderCliOptions extends StoryWorkflowSelectionOptions {
  readonly languages?: string;
  readonly profiles?: string;
  readonly onlyReady?: boolean;
  readonly captions?: boolean;
  readonly json?: boolean;
}

export interface StoryProductionRepairCliOptions
  extends StoryWorkflowSelectionOptions {
  readonly languages?: string;
  readonly profiles?: string;
  readonly regenerateImages?: boolean;
  readonly regenerateAudio?: boolean;
  readonly render?: boolean;
  readonly json?: boolean;
}

interface StoryRenderIo {
  readonly stdout: Pick<typeof process.stdout, "write">;
}

type RenderProfileId = "youtube" | "vertical";

type RenderIssueCode =
  | "CANONICAL_MANIFEST_MISSING"
  | "ALIGNMENT_MISSING"
  | "VISUAL_VALIDATION_MISSING"
  | "IMAGE_INVALID"
  | "AUDIO_MISSING"
  | "AUDIO_INVALID"
  | "AUDIO_BLOCKED"
  | "CLIP_ARTIFACTS_INVALID"
  | "RENDER_MANIFEST_MISSING"
  | "FINAL_VIDEO_MISSING"
  | "FINAL_MEDIA_INVALID";

interface RenderIssue {
  readonly code: RenderIssueCode;
  readonly message: string;
}

export interface StoryProductionRepairSuggestion {
  readonly episodeId: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
  readonly issues: readonly RenderIssue[];
  readonly commands: readonly string[];
}

interface RenderTarget {
  readonly episodeId: string;
  readonly locale: LocaleCode;
  readonly variant: ContentVariant;
  readonly profile: RenderProfileId;
}

interface PreparedRenderTarget extends RenderTarget {
  readonly episodeDir: string;
  readonly outputDir: string;
  readonly clipsDir: string;
  readonly renderProfile: RenderProfile;
  readonly scenePlan: ScenePlan;
  readonly sourceNarrationPath: string;
  readonly captionsPath?: string;
  readonly canonicalManifestPath: string;
  readonly alignmentPath: string;
  readonly visualValidationPath: string;
  readonly qualityGatePath: string;
  readonly imageMappings: readonly {
    readonly sourcePath: string;
    readonly expectedFilename: string;
  }[];
}

interface BlockedRenderTarget extends RenderTarget {
  readonly issues: readonly RenderIssue[];
}

interface RenderExecutionResult extends RenderTarget {
  readonly cleanPath?: string;
  readonly captionedPath?: string;
  readonly skipped: boolean;
  readonly issues: readonly RenderIssue[];
}

function parseLanguages(value: string | undefined): readonly LocaleCode[] | undefined {
  const entries = splitCsv(value);
  if (entries.length === 0) {
    return undefined;
  }
  return [...new Set(entries.map((entry) => normalizeLocaleCode(entry)))];
}

function parseProfiles(value: string | undefined): readonly ContentVariant[] | undefined {
  const entries = splitCsv(value);
  if (entries.length === 0) {
    return undefined;
  }
  return [...new Set(entries.map((entry) => normalizeContentVariant(entry)))];
}

function renderProfileForVariant(variant: ContentVariant): RenderProfile {
  return variant === "short"
    ? {
        id: "vertical",
        label: "vertical",
        width: 1080,
        height: 1920,
        fps: 30,
        aspectRatio: "9:16",
        burnCaptions: false,
      }
    : {
        id: "youtube",
        label: "youtube",
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: "16:9",
        burnCaptions: false,
      };
}

function clipsDirName(locale: LocaleCode): string {
  return locale === "en" ? "clips" : `clips-${locale}`;
}

function targetLabel(target: RenderTarget): string {
  return `${target.episodeId} / ${target.locale} / ${target.variant}`;
}

function issue(code: RenderIssueCode, message: string): RenderIssue {
  return { code, message };
}

function selectRenderTargets(
  statuses: readonly LoadedProductionStatus[],
  options: { readonly languages?: readonly LocaleCode[]; readonly profiles?: readonly ContentVariant[] }
): readonly RenderTarget[] {
  const languageFilter = new Set(options.languages ?? []);
  const profileFilter = new Set(options.profiles ?? []);
  const targets = statuses.flatMap((entry) =>
    entry.report.entries
      .filter(
        (candidate) =>
          candidate.stageType === "render" &&
          candidate.locale !== undefined &&
          candidate.format !== undefined
      )
      .map((candidate) => ({
        episodeId: candidate.episodeId,
        locale: normalizeLocaleCode(candidate.locale ?? "en"),
        variant: normalizeContentVariant(candidate.format ?? "full"),
      }))
      .filter(
        (candidate) =>
          (languageFilter.size === 0 || languageFilter.has(candidate.locale)) &&
          (profileFilter.size === 0 || profileFilter.has(candidate.variant))
      )
      .map((candidate) => ({
        ...candidate,
        profile: renderProfileForVariant(candidate.variant).id as RenderProfileId,
      }))
  );
  const deduped = new Map<string, RenderTarget>();
  for (const target of targets) {
    deduped.set(`${target.episodeId}:${target.locale}:${target.variant}`, target);
  }
  return [...deduped.values()].sort((left, right) =>
    [
      left.episodeId.localeCompare(right.episodeId),
      left.locale.localeCompare(right.locale),
      left.variant.localeCompare(right.variant),
    ].find((value) => value !== 0) ?? 0
  );
}

async function readJsonOrIssue<T>(
  filePath: string,
  parser: (value: unknown) => T,
  missingCode: RenderIssueCode
): Promise<{ readonly value?: T; readonly issues: readonly RenderIssue[] }> {
  if (!(await fileExists(filePath))) {
    return {
      issues: [issue(missingCode, `Missing required file: ${filePath}`)],
    };
  }
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return { value: parser(raw), issues: [] };
  } catch (error) {
    return {
      issues: [
        issue(
          missingCode,
          `Invalid required file ${filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
      ],
    };
  }
}

function scenePlanFromSegments(
  target: RenderTarget,
  mappings: readonly { readonly sourcePath: string; readonly expectedFilename: string }[],
  segments: readonly Awaited<ReturnType<typeof resolveSharedVisualRenderTimeline>>[number][]
): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: target.episodeId,
    scenes: segments.map((segment, index) => ({
      id: segment.sceneId,
      sequenceNumber: index + 1,
      canonicalNarration: segment.narrationText,
      sourceSegmentIds: [segment.sceneId],
      estimatedDurationSeconds: segment.durationSeconds,
      timing: {
        startSeconds: segment.audioStartSeconds,
        endSeconds: segment.audioEndSeconds,
      },
      visualPurpose: "shared visual render",
      textRequirement: { required: false },
      subject: "shared visual",
      action: "shown",
      setting: "localized shared visual render",
      composition: "centered",
      cameraFraming: "medium shot",
      mood: "neutral",
      continuityReferences: [],
      onScreenText: "",
      negativeConstraints: [],
      aspectRatios: [target.variant === "short" ? "9:16" : "16:9"],
      imagePrompt: "shared visual",
      expectedImageFilenames: [mappings[index]?.expectedFilename ?? `${segment.sceneId}.png`],
      qualityStatus: "approved",
    })),
  });
}

async function prepareRenderTarget(
  episodesRoot: string,
  target: RenderTarget,
  options: { readonly captions: boolean }
): Promise<PreparedRenderTarget | BlockedRenderTarget> {
  const episodeDir = path.join(episodesRoot, target.episodeId);
  const resolver = createEpisodePathResolver(
    workspaceRootFromOutputRoot(episodesRoot)
  );
  const context = {
    episodeId: normalizeEpisodeId(target.episodeId),
    locale: normalizeLocaleCode(target.locale),
    variant: normalizeContentVariant(target.variant),
  };
  const outputDir = resolver.renderDir(context, target.profile);
  const clipsDir = path.join(
    resolver.localeVariantRoot(context),
    "renders",
    clipsDirName(target.locale)
  );
  const canonicalManifestPath = resolver.canonicalVisualManifest(
    context.episodeId,
    context.variant
  );
  const alignmentPath = resolver.localizedAlignment(
    context.episodeId,
    context.locale,
    context.variant
  );
  const visualValidationPath = resolver.localizedVisualValidation(
    context.episodeId,
    context.locale,
    context.variant
  );
  const canonicalManifestResult = await readJsonOrIssue(
    canonicalManifestPath,
    (value) => canonicalVisualManifestSchema.parse(value),
    "CANONICAL_MANIFEST_MISSING"
  );
  const alignmentResult = await readJsonOrIssue(
    alignmentPath,
    (value) => localizedAlignmentManifestSchema.parse(value),
    "ALIGNMENT_MISSING"
  );
  const visualValidationResult = await readJsonOrIssue(
    visualValidationPath,
    (value) => localizedVisualValidationReportSchema.parse(value),
    "VISUAL_VALIDATION_MISSING"
  );
  const issues = [
    ...canonicalManifestResult.issues,
    ...alignmentResult.issues,
    ...visualValidationResult.issues,
  ];
  if (
    canonicalManifestResult.value === undefined ||
    alignmentResult.value === undefined ||
    visualValidationResult.value === undefined
  ) {
    return { ...target, issues };
  }
  const canonicalManifest = canonicalManifestResult.value;
  const alignmentManifest = alignmentResult.value;
  const validationReport = visualValidationResult.value;

  try {
    const segments = await resolveSharedVisualRenderTimeline({
      episodeDir,
      canonicalManifest,
      alignmentManifest,
      validationReport,
    });
    const mappings = await Promise.all(
      segments.map(async (segment, index) => {
        await assertGeneratedImageFileMatchesSpec({
          episodeId: target.episodeId,
          language: target.locale,
          videoKind: target.variant,
          imagePath: segment.imagePath,
        });
        return {
          sourcePath: segment.imagePath,
          expectedFilename: sceneFilename(
            index + 1,
            segment.audioStartSeconds,
            segment.audioEndSeconds,
            target.variant === "short" ? "9:16" : "16:9"
          ),
        };
      })
    ).catch((error) => {
      throw issue(
        "IMAGE_INVALID",
        error instanceof Error ? error.message : String(error)
      );
    });

    const narrationPaths = createNarrationArtifactPaths({
      episodeId: target.episodeId,
      locale: target.locale,
      variant: target.variant,
      episodeRoot: episodeDir,
    });
    const qualityGatePath = narrationPaths.qualityGateJson;
    const qualityGateResult = await readJsonOrIssue(
      qualityGatePath,
      (value) => narrationQualityGateReportSchema.parse(value),
      "AUDIO_MISSING"
    );
    if (qualityGateResult.value === undefined) {
      return {
        ...target,
        issues: [...issues, ...qualityGateResult.issues],
      };
    }
    if (
      qualityGateResult.value.outcome === "BLOCKED" ||
      qualityGateResult.value.outcome === "REGENERATION_RECOMMENDED"
    ) {
      return {
        ...target,
        issues: [
          ...issues,
          issue(
            "AUDIO_BLOCKED",
            `Narration quality gate is ${qualityGateResult.value.outcome} for ${targetLabel(target)}.`
          ),
        ],
      };
    }

    const sourceNarrationPath = resolver.audioNarration(context);
    if (!(await fileExists(sourceNarrationPath))) {
      return {
        ...target,
        issues: [
          ...issues,
          issue("AUDIO_MISSING", `Missing narration audio: ${sourceNarrationPath}`),
        ],
      };
    }
    const audioMetadata = await probeAudioWithFfprobe(sourceNarrationPath).catch(
      (error) => {
        throw issue(
          "AUDIO_INVALID",
          error instanceof Error ? error.message : String(error)
        );
      }
    );
    const scenePlan = scenePlanFromSegments(target, mappings, segments);
    const expectedDurationSeconds = scenePlan.scenes.reduce(
      (maxDuration, scene) => Math.max(maxDuration, scene.timing.endSeconds),
      0
    );
    if (audioMetadata.durationSeconds + 0.25 < expectedDurationSeconds) {
      return {
        ...target,
        issues: [
          ...issues,
          issue(
            "AUDIO_INVALID",
            `Narration audio is shorter than the render timeline for ${targetLabel(target)}.`
          ),
        ],
      };
    }

    const clipEntries = await fs.readdir(clipsDir).catch(() => []);
    if (clipEntries.some((entry) => entry.endsWith(".mp4") || entry.endsWith(".json"))) {
      const clipValidation = await validateSceneClipArtifacts({
        clipsDir,
        scenePlan,
        renderProfile: renderProfileForVariant(target.variant),
      });
      if (!clipValidation.valid) {
        return {
          ...target,
          issues: [
            ...issues,
            ...clipValidation.issues.map((message) =>
              issue("CLIP_ARTIFACTS_INVALID", message)
            ),
          ],
        };
      }
    }

    const captionsPath = resolver.captionsFile(context, "ass");
    return {
      ...target,
      episodeDir,
      outputDir,
      clipsDir,
      renderProfile: renderProfileForVariant(target.variant),
      scenePlan,
      sourceNarrationPath,
      ...(options.captions && (await fileExists(captionsPath))
        ? { captionsPath }
        : {}),
      canonicalManifestPath,
      alignmentPath,
      visualValidationPath,
      qualityGatePath,
      imageMappings: mappings,
    };
  } catch (error) {
    const renderIssue =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error
        ? (error as RenderIssue)
        : issue(
            "IMAGE_INVALID",
            error instanceof Error ? error.message : String(error)
          );
    return {
      ...target,
      issues: [...issues, renderIssue],
    };
  }
}

async function stageRenderInputs(target: PreparedRenderTarget): Promise<{
  readonly rootDir: string;
  readonly imageDir: string;
  readonly sceneAudioDir: string;
}> {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-story-render-")
  );
  const imageDir = path.join(rootDir, "images");
  const audioDir = path.join(rootDir, "audio");
  const sceneAudioDir = path.join(audioDir, "segments");
  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(sceneAudioDir, { recursive: true });
  await fs.copyFile(target.sourceNarrationPath, path.join(audioDir, "narration.wav"));
  await Promise.all(
    target.imageMappings.map((mapping) =>
      fs.copyFile(mapping.sourcePath, path.join(imageDir, mapping.expectedFilename))
    )
  );
  return { rootDir, imageDir, sceneAudioDir };
}

function renderResultSummary(results: readonly RenderExecutionResult[]): string {
  const rendered = results.filter((entry) => !entry.skipped && entry.issues.length === 0);
  const skipped = results.filter((entry) => entry.skipped);
  const blocked = results.filter((entry) => !entry.skipped && entry.issues.length > 0);
  return [
    `Succeeded: ${rendered.length}`,
    `Blocked: ${blocked.length}`,
    `Skipped: ${skipped.length}`,
    ...(blocked.length > 0
      ? [
          "Blocked targets:",
          ...blocked.map(
            (entry) =>
              `- ${targetLabel(entry)} | ${entry.issues
                .map((candidate) => candidate.message)
                .join("; ")}`
          ),
        ]
      : []),
    ...(skipped.length > 0
      ? [
          "Skipped targets:",
          ...skipped.map((entry) => `- ${targetLabel(entry)}`),
        ]
      : []),
  ].join("\n");
}

async function validateExistingRenderTarget(
  target: PreparedRenderTarget
): Promise<FinalRenderedMediaValidationReport> {
  const context = {
    episodeId: normalizeEpisodeId(target.episodeId),
    locale: normalizeLocaleCode(target.locale),
    variant: normalizeContentVariant(target.variant),
  };
  const resolver = createEpisodePathResolver(
    workspaceRootFromOutputRoot(path.dirname(target.episodeDir))
  );
  const manifestPath = resolver.renderManifest(context, target.profile);
  const manifestResult = await readJsonOrIssue(
    manifestPath,
    (value) => renderManifestSchema.parse(value),
    "RENDER_MANIFEST_MISSING"
  );
  if (manifestResult.value === undefined) {
    const clipValidation = await validateSceneClipArtifacts({
      clipsDir: target.clipsDir,
      scenePlan: target.scenePlan,
      renderProfile: target.renderProfile,
    });
    const report: FinalRenderedMediaValidationReport = {
      schemaVersion: 1,
      valid: false,
      finalVideoPath: path.join(target.outputDir, `${target.profile}-final.mp4`),
      clipsDir: target.clipsDir,
      expectedDurationSeconds: target.scenePlan.scenes.reduce(
        (maxDuration, scene) => Math.max(maxDuration, scene.timing.endSeconds),
        0
      ),
      actualDurationSeconds: 0,
      issues: manifestResult.issues.map((entry) => entry.message),
      finalValidation: {
        valid: false,
        width: 0,
        height: 0,
        durationSeconds: 0,
        videoCodec: "",
        audioCodec: "",
        pixelFormat: "",
        issues: manifestResult.issues.map((entry) => entry.message),
      },
      clipValidation,
      createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(
      finalRenderedMediaValidationReportPath(target.outputDir),
      report
    );
    return report;
  }

  const finalVideoPath =
    manifestResult.value.captionedPath ?? manifestResult.value.cleanPath;
  if (!(await fileExists(finalVideoPath))) {
    const report: FinalRenderedMediaValidationReport = {
      schemaVersion: 1,
      valid: false,
      finalVideoPath,
      clipsDir: target.clipsDir,
      expectedDurationSeconds: target.scenePlan.scenes.reduce(
        (maxDuration, scene) => Math.max(maxDuration, scene.timing.endSeconds),
        0
      ),
      actualDurationSeconds: 0,
      issues: [`Missing rendered video: ${finalVideoPath}`],
      finalValidation: {
        valid: false,
        width: 0,
        height: 0,
        durationSeconds: 0,
        videoCodec: "",
        audioCodec: "",
        pixelFormat: "",
        issues: [`Missing rendered video: ${finalVideoPath}`],
      },
      clipValidation: await validateSceneClipArtifacts({
        clipsDir: target.clipsDir,
        scenePlan: target.scenePlan,
        renderProfile: target.renderProfile,
      }),
      createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(
      finalRenderedMediaValidationReportPath(target.outputDir),
      report
    );
    return report;
  }

  const report = await validateFinalRenderedMedia({
    finalVideoPath,
    clipsDir: target.clipsDir,
    scenePlan: target.scenePlan,
    renderProfile: target.renderProfile,
  });
  await writeJsonAtomic(
    finalRenderedMediaValidationReportPath(target.outputDir),
    report
  );
  return report;
}

export async function commandStoriesRender(
  options: StoryRenderCliOptions,
  io: StoryRenderIo = { stdout: process.stdout }
): Promise<void> {
  const episodesRoot = await resolveEpisodesRoot(options.outputRoot);
  const statuses = await loadProductionStatuses(options);
  const languages = parseLanguages(options.languages);
  const profiles = parseProfiles(options.profiles);
  const targets = selectRenderTargets(statuses, {
    ...(languages ? { languages } : {}),
    ...(profiles ? { profiles } : {}),
  });
  if (targets.length === 0) {
    throw new Error("No render targets matched the requested filters.");
  }
  const prepared = await Promise.all(
    targets.map((target) =>
      prepareRenderTarget(episodesRoot, target, {
        captions: options.captions === true,
      })
    )
  );
  const blocked = prepared.filter(
    (entry): entry is BlockedRenderTarget => "issues" in entry
  );
  if (blocked.length > 0 && !options.onlyReady) {
    throw new Error(
      [
        "Render prerequisites failed.",
        ...blocked.map(
          (entry) =>
            `- ${targetLabel(entry)} | ${entry.issues
              .map((candidate) => candidate.message)
              .join("; ")}`
        ),
      ].join("\n")
    );
  }

  const renderer = new FFmpegVideoRenderer();
  const results: RenderExecutionResult[] = [];
  for (const entry of prepared) {
    if ("issues" in entry) {
      results.push({ ...entry, skipped: true });
      continue;
    }
    const staged = await stageRenderInputs(entry);
    try {
      const narrationFingerprint = await hashFile(entry.sourceNarrationPath);
      const result = await renderer.render(
        {
          episodeDir: entry.episodeDir,
          scenePlan: entry.scenePlan,
          outputDir: entry.outputDir,
          clipsOutputDir: path.dirname(entry.outputDir),
          renderProfile: entry.renderProfile,
          captionBurnIn: Boolean(entry.captionsPath),
          clipsDirName: clipsDirName(entry.locale),
          sceneAudioDir: staged.sceneAudioDir,
          imageDir: staged.imageDir,
          ...(entry.captionsPath ? { captionsPath: entry.captionsPath } : {}),
          mediaContext: {
            identity: {
              episodeId: entry.episodeId,
              language: entry.locale,
              locale: entry.locale,
              variant: entry.variant,
              owner: "render",
            },
            narration: {
              owner: "narration",
              episodeId: entry.episodeId,
              language: entry.locale,
              locale: entry.locale,
              variant: entry.variant,
              fingerprint: narrationFingerprint,
              path: entry.sourceNarrationPath,
              status: "ready",
            },
          },
        },
        new AbortController().signal
      );
      results.push({
        ...entry,
        cleanPath: result.cleanPath,
        ...(result.captionedPath ? { captionedPath: result.captionedPath } : {}),
        skipped: false,
        issues: [],
      });
    } catch (error) {
      results.push({
        ...entry,
        skipped: false,
        issues: [
          issue(
            "FINAL_MEDIA_INVALID",
            error instanceof Error ? error.message : String(error)
          ),
        ],
      });
    } finally {
      await fs.rm(staged.rootDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (options.json) {
    io.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
    return;
  }
  io.stdout.write(`${renderResultSummary(results)}\n`);
}

export async function commandStoriesRenderValidate(
  options: StoryRenderCliOptions,
  io: StoryRenderIo = { stdout: process.stdout }
): Promise<void> {
  const episodesRoot = await resolveEpisodesRoot(options.outputRoot);
  const statuses = await loadProductionStatuses(options);
  const languages = parseLanguages(options.languages);
  const profiles = parseProfiles(options.profiles);
  const targets = selectRenderTargets(statuses, {
    ...(languages ? { languages } : {}),
    ...(profiles ? { profiles } : {}),
  });
  if (targets.length === 0) {
    throw new Error("No render targets matched the requested filters.");
  }
  const prepared = await Promise.all(
    targets.map((target) =>
      prepareRenderTarget(episodesRoot, target, {
        captions: options.captions === true,
      })
    )
  );
  const reports: Array<
    RenderTarget & {
      readonly valid: boolean;
      readonly issues: readonly string[];
    }
  > = [];
  for (const entry of prepared) {
    if ("issues" in entry) {
      reports.push({
        episodeId: entry.episodeId,
        locale: entry.locale,
        variant: entry.variant,
        profile: entry.profile,
        valid: false,
        issues: entry.issues.map((candidate) => candidate.message),
      });
      continue;
    }
    const report = await validateExistingRenderTarget(entry);
    reports.push({
      episodeId: entry.episodeId,
      locale: entry.locale,
      variant: entry.variant,
      profile: entry.profile,
      valid: report.valid,
      issues: report.issues,
    });
  }

  if (options.json) {
    io.stdout.write(`${JSON.stringify({ reports }, null, 2)}\n`);
    return;
  }
  io.stdout.write(
    [
      `Validated: ${reports.length}`,
      `Failed: ${reports.filter((report) => !report.valid).length}`,
      ...reports
        .filter((report) => !report.valid)
        .map(
          (report) =>
            `- ${targetLabel(report)} | ${report.issues.join("; ")}`
        ),
    ].join("\n") + "\n"
  );
}

function repairCommandList(
  target: BlockedRenderTarget,
  options: StoryProductionRepairCliOptions
): string[] {
  const commands: string[] = [];
  const hasImageBlocker = target.issues.some((entry) =>
    entry.code === "CANONICAL_MANIFEST_MISSING" ||
    entry.code === "ALIGNMENT_MISSING" ||
    entry.code === "VISUAL_VALIDATION_MISSING" ||
    entry.code === "IMAGE_INVALID"
  );
  const hasAudioBlocker = target.issues.some((entry) =>
    entry.code === "AUDIO_MISSING" ||
    entry.code === "AUDIO_INVALID" ||
    entry.code === "AUDIO_BLOCKED"
  );

  if (options.regenerateImages && hasImageBlocker) {
    commands.push(
      `npm run mediaforge -- stories images generate --episode ${target.episodeId} --only-ready`
    );
  }
  if (options.regenerateAudio && hasAudioBlocker) {
    commands.push(
      `npm run mediaforge -- stories audio generate --episode ${target.episodeId} --languages ${target.locale} --profiles ${target.variant} --only-ready`
    );
  }
  if (
    options.render &&
    (!hasImageBlocker || options.regenerateImages) &&
    (!hasAudioBlocker || options.regenerateAudio)
  ) {
    commands.push(
      `npm run mediaforge -- stories render --episode ${target.episodeId} --languages ${target.locale} --profiles ${target.variant} --only-ready`
    );
  }
  return commands;
}

function automaticRepairCommandList(target: BlockedRenderTarget): string[] {
  const commands: string[] = [];
  const hasImageBlocker = target.issues.some((entry) =>
    entry.code === "CANONICAL_MANIFEST_MISSING" ||
    entry.code === "ALIGNMENT_MISSING" ||
    entry.code === "VISUAL_VALIDATION_MISSING" ||
    entry.code === "IMAGE_INVALID"
  );
  const hasAudioBlocker = target.issues.some((entry) =>
    entry.code === "AUDIO_MISSING" ||
    entry.code === "AUDIO_INVALID" ||
    entry.code === "AUDIO_BLOCKED"
  );

  if (hasImageBlocker) {
    commands.push(
      `npm run mediaforge -- stories images generate --episode ${target.episodeId} --only-ready`
    );
  }
  if (hasAudioBlocker) {
    commands.push(
      `npm run mediaforge -- stories audio generate --episode ${target.episodeId} --languages ${target.locale} --profiles ${target.variant} --only-ready`
    );
  }
  commands.push(
    `npm run mediaforge -- stories render --episode ${target.episodeId} --languages ${target.locale} --profiles ${target.variant} --only-ready`
  );
  return commands;
}

export async function collectStoryProductionRepairSuggestions(
  options: StoryWorkflowSelectionOptions & {
    readonly languages?: string;
    readonly profiles?: string;
  }
): Promise<readonly StoryProductionRepairSuggestion[]> {
  const episodesRoot = await resolveEpisodesRoot(options.outputRoot);
  const statuses = await loadProductionStatuses(options);
  const languages = parseLanguages(options.languages);
  const profiles = parseProfiles(options.profiles);
  const targets = selectRenderTargets(statuses, {
    ...(languages ? { languages } : {}),
    ...(profiles ? { profiles } : {}),
  });
  const prepared = await Promise.all(
    targets.map((target) =>
      prepareRenderTarget(episodesRoot, target, { captions: false })
    )
  );
  return prepared
    .filter((entry): entry is BlockedRenderTarget => "issues" in entry)
    .map((target) => ({
      episodeId: target.episodeId,
      locale: target.locale,
      variant: target.variant,
      issues: target.issues,
      commands: automaticRepairCommandList(target),
    }));
}

export async function commandStoriesProductionRepair(
  options: StoryProductionRepairCliOptions,
  io: StoryRenderIo = { stdout: process.stdout }
): Promise<void> {
  if (!options.regenerateImages && !options.regenerateAudio && !options.render) {
    throw new Error(
      "Select at least one repair action: --regenerate-images, --regenerate-audio, or --render."
    );
  }
  const episodesRoot = await resolveEpisodesRoot(options.outputRoot);
  const statuses = await loadProductionStatuses(options);
  const languages = parseLanguages(options.languages);
  const profiles = parseProfiles(options.profiles);
  const targets = selectRenderTargets(statuses, {
    ...(languages ? { languages } : {}),
    ...(profiles ? { profiles } : {}),
  });
  const prepared = await Promise.all(
    targets.map((target) =>
      prepareRenderTarget(episodesRoot, target, { captions: false })
    )
  );
  const blocked = prepared.filter(
    (entry): entry is BlockedRenderTarget => "issues" in entry
  );
  const repairs = blocked.map((target) => ({
    target,
    commands: repairCommandList(target, options),
  }));
  if (options.json) {
    io.stdout.write(
      `${JSON.stringify(
        {
          repairs: repairs.map((entry) => ({
            episodeId: entry.target.episodeId,
            locale: entry.target.locale,
            variant: entry.target.variant,
            issues: entry.target.issues,
            commands: entry.commands,
          })),
        },
        null,
        2
      )}\n`
    );
    return;
  }
  io.stdout.write(
    [
      `Repair targets: ${repairs.length}`,
      ...repairs.flatMap((entry) => [
        `- ${targetLabel(entry.target)}`,
        ...entry.target.issues.map((candidate) => `  issue: ${candidate.message}`),
        ...(entry.commands.length > 0
          ? entry.commands.map((command) => `  cmd: ${command}`)
          : ["  cmd: none for the selected repair flags"]),
      ]),
    ].join("\n") + "\n"
  );
}

export function registerStoryRenderCommand(storiesCommand: Command): void {
  const render = storiesCommand.command("render").description("Render validated story outputs");
  render
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--languages <comma-separated-languages>", "target locales")
    .option("--profiles <comma-separated-profiles>", "target profiles")
    .option("--only-ready", "skip blocked outputs instead of failing")
    .option("--captions", "render with burned-in captions")
    .option("--json", "print machine-readable output")
    .action((opts: StoryRenderCliOptions, command: Command) =>
      commandStoriesRender(mergeCommandOptions(command, opts))
    );
  render
    .command("validate")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--languages <comma-separated-languages>", "target locales")
    .option("--profiles <comma-separated-profiles>", "target profiles")
    .option("--captions", "validate while requiring burned-in captions")
    .option("--json", "print machine-readable output")
    .action((opts: StoryRenderCliOptions, command: Command) => {
      const parentOpts = mergeCommandOptions(command.parent, {});
      return commandStoriesRenderValidate({
        ...parentOpts,
        ...opts,
      });
    });
}

export function registerStoryProductionRepairCommand(
  productionCommand: Command
): void {
  productionCommand
    .command("repair")
    .option("--episode <slug-or-number>", "episode slug or number")
    .option("--episodes <comma-separated-episodes>", "episode slugs or numbers")
    .option("--workflow <workflow-id>", "workflow id for single-episode reads")
    .option("--output-root <path>", "episode workspace root")
    .option("--languages <comma-separated-languages>", "target locales")
    .option("--profiles <comma-separated-profiles>", "target profiles")
    .option("--regenerate-images", "rebuild missing or invalid images explicitly")
    .option("--regenerate-audio", "rerun narration validation and assembly explicitly")
    .option("--render", "append a follow-up render command when blockers are covered")
    .option("--json", "print machine-readable output")
    .action((opts: StoryProductionRepairCliOptions, command: Command) =>
      commandStoriesProductionRepair(mergeCommandOptions(command, opts))
    );
}
