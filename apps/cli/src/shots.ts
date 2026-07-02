import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  loadEpisodeConfig,
  loadRuntimeConfig,
  type RuntimeConfig,
} from "@mediaforge/config";
import {
  ArtifactNotFoundError,
  MediaValidationError,
  episodeFocalMetadataSchema,
  scenePlanSchema,
  shotPlanSchema,
  shotPlanValidationIssueSchema,
  type ScenePlan,
  type ShotPlan,
  type ShotPlanValidationIssue,
  type VisualBudget,
  type VisualPacingProfile,
  episodeIdSchema,
  visualPacingProfileIdSchema,
  visualSourceSceneSchema,
} from "@mediaforge/domain";
import { estimateImageCostMicros } from "@mediaforge/observability";
import { loadEpisodeSceneManifest } from "@mediaforge/image-generation";
import {
  createEpisodePathResolver,
  ensureWorkspacePath,
  fileExists,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  readJsonIfExists,
  writeBinaryAtomic,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import {
  deterministicShotPlanner,
  migrateLegacyEpisodeShots,
  serializeShotPlan,
  type ShotPlanValidationMetrics,
  type LegacyMigrationResult,
  validateShotPlan,
} from "@mediaforge/visual-planning";
import {
  shotTreatmentCatalog,
  shotTreatmentCatalogVersion,
} from "@mediaforge/domain/visual-retention/treatment-catalog.js";
import { z } from "zod";
import {
  buildShotInspectReport,
  formatShotInspectReport,
  type ShotInspectCacheSummary,
  type ShotInspectFormat,
} from "./shot-inspect-output.js";
import { buildShotPreviewArtifacts } from "./shot-preview-output.js";

const validationArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    valid: z.boolean(),
    issues: z.array(shotPlanValidationIssueSchema),
    metrics: z.object({
      totalShots: z.number().int().nonnegative(),
      uniqueSourceImages: z.number().int().nonnegative(),
      averageShotDurationMs: z.number().nonnegative(),
      medianShotDurationMs: z.number().nonnegative(),
      longestShotDurationMs: z.number().nonnegative(),
      longestStaticIntervalMs: z.number().nonnegative(),
      openingMeaningfulChanges: z.number().int().nonnegative(),
      climaxAverageShotDurationMs: z.number().nullable(),
      averageShotsPerSourceImage: z.number().nonnegative(),
      maximumConsecutiveSourceImageUses: z.number().int().nonnegative(),
      treatmentCounts: z.record(z.string(), z.number().int().nonnegative()),
      transitionCounts: z.record(z.string(), z.number().int().nonnegative()),
    }),
  })
  .strict();

export interface ShotsCommandOptions {
  readonly episode: string;
  readonly locale: string;
  readonly variant: string;
  readonly profile?: string;
  readonly format?: ShotInspectFormat;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly dryRun?: boolean;
}

export interface ShotsPlanResult {
  readonly status: "created" | "reused" | "replaced";
  readonly planPath: string;
  readonly shotCount: number;
  readonly sourceImageCount: number;
  readonly replacedMalformedExisting: boolean;
}

export interface ShotsInspectResult {
  readonly report: ReturnType<typeof buildShotInspectReport>;
  readonly text: string;
}

export interface ShotsValidateResult {
  readonly status: "created" | "reused" | "replaced";
  readonly reportPath: string;
  readonly valid: boolean;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly issues: readonly {
    readonly code: string;
    readonly severity: "warning" | "error";
    readonly shotId?: string;
    readonly sceneId?: string;
    readonly message: string;
    readonly repairSuggestion?: string;
    readonly metricValues?: Readonly<
      Record<string, string | number | boolean | null>
    >;
  }[];
}

export interface ShotsPreviewResult {
  readonly storyboard: {
    readonly path: string;
    readonly status: "created" | "reused" | "replaced";
  };
  readonly contactSheet: {
    readonly path: string;
    readonly status: "created" | "reused" | "replaced";
  };
  readonly shotCount: number;
  readonly limitation: string;
}

export type ShotsMigrateResult = LegacyMigrationResult;

export async function planShotsCommand(
  options: ShotsCommandOptions
): Promise<ShotsPlanResult> {
  const context = await resolveShotsContext(options);
  const sourceScenes = await loadRequiredSourceScenes(
    context.paths.sourceScenesPath
  );
  await loadOptionalFocalMetadata(context.paths.focalMetadataPath);
  await assertSourceSceneImagesExist(context.episodeDir, sourceScenes);
  const preset = selectVisualRetentionPreset(
    context.config,
    context.variant,
    sourceScenes,
    options.profile
  );
  const plan = deterministicShotPlanner.plan({
    sourceId: episodeIdSchema.parse(context.episodeId),
    locale: context.locale,
    platform: context.variant,
    aspectRatio: context.variant === "short" ? "9:16" : "16:9",
    sourceScenes,
    pacingProfile: preset.pacingProfile,
    visualBudget: preset.visualBudget,
    treatmentCatalogVersion: shotTreatmentCatalogVersion,
    seed: `${context.episodeId}:${context.variant}:${context.locale}:${preset.pacingProfile.id}`,
  });
  const serialized = `${serializeShotPlan(plan)}\n`;
  const currentContent = await fs
    .readFile(context.paths.planPath, "utf8")
    .catch(() => null);
  const currentParsedValid =
    currentContent === null ? true : parseShotPlanArtifact(currentContent);
  const status = resolveArtifactStatus({
    force: options.force ?? false,
    nextContent: serialized,
    currentContent,
    currentParsedValid,
  });
  if (status !== "reused") {
    await writeTextAtomic(context.paths.planPath, serialized);
  }
  return {
    status,
    planPath: context.paths.planPath,
    shotCount: plan.shots.length,
    sourceImageCount: plan.sourceScenes.length,
    replacedMalformedExisting: currentContent !== null && !currentParsedValid,
  };
}

export async function inspectShotsCommand(
  options: ShotsCommandOptions
): Promise<ShotsInspectResult> {
  const context = await resolveShotsContext(options);
  const shotPlan = await loadShotPlan(context.paths.planPath);
  const validation = await computeValidation(context, shotPlan);
  const estimatedCost = await estimateSavedImageCostMicros(
    context.episodeDir,
    shotPlan
  );
  const report = buildShotInspectReport({
    shotPlan,
    validationIssues: validation.issues,
    validationMetrics: validation.metrics,
    estimatedCostMicros: estimatedCost.costMicros,
    pricingVersion: estimatedCost.pricingVersion,
    derivedClipCache: await readDerivedClipCacheSummary(context, shotPlan),
  });
  return {
    report,
    text: formatShotInspectReport(report),
  };
}

export async function validateShotsCommand(
  options: ShotsCommandOptions
): Promise<ShotsValidateResult> {
  const context = await resolveShotsContext(options);
  const shotPlan = await loadShotPlan(context.paths.planPath);
  const validation = await computeValidation(context, shotPlan);
  const nextArtifact = validationArtifactSchema.parse({
    schemaVersion: 1,
    valid: validation.valid,
    issues: validation.issues,
    metrics: validation.metrics,
  });
  const nextContent = `${JSON.stringify(nextArtifact, null, 2)}\n`;
  const currentContent = await fs
    .readFile(context.paths.validationPath, "utf8")
    .catch(() => null);
  const currentParsedValid =
    currentContent === null ? true : parseValidationArtifact(currentContent);
  const status = resolveArtifactStatus({
    force: options.force ?? false,
    nextContent,
    currentContent,
    currentParsedValid,
  });
  if (status !== "reused") {
    await writeJsonAtomic(context.paths.validationPath, nextArtifact);
  }
  return {
    status,
    reportPath: context.paths.validationPath,
    valid: validation.valid,
    warningCount: validation.issues.filter(
      (issue) => issue.severity === "warning"
    ).length,
    errorCount: validation.issues.filter((issue) => issue.severity === "error")
      .length,
    issues: validation.issues.map((issue) => {
      const repairSuggestion = extractRepairSuggestion(issue.details);
      const metricValues = extractMetricValues(issue.details);
      return {
        code: issue.code,
        severity: issue.severity,
        ...(issue.shotId ? { shotId: issue.shotId } : {}),
        ...(issue.sceneId ? { sceneId: issue.sceneId } : {}),
        message: issue.message,
        ...(repairSuggestion ? { repairSuggestion } : {}),
        ...(metricValues ? { metricValues } : {}),
      };
    }),
  };
}

export async function previewShotsCommand(
  options: ShotsCommandOptions
): Promise<ShotsPreviewResult> {
  const context = await resolveShotsContext(options);
  const shotPlan = await loadShotPlan(context.paths.planPath);
  const scenePlan = await loadScenePlan(context.paths.scenePlanPath);
  const validation = await computeValidation(context, shotPlan);
  const artifacts = await buildShotPreviewArtifacts({
    shotPlan,
    scenePlan,
    episodeDir: context.episodeDir,
    validationIssues: validation.issues,
    storyboardPath: context.paths.storyboardPath,
  });
  const storyboardStatus = await writeTextArtifactWithReuse(
    context.paths.storyboardPath,
    artifacts.storyboardHtml,
    options.force ?? false
  );
  const contactSheetStatus = await writeBinaryArtifactWithReuse(
    context.paths.contactSheetPath,
    artifacts.contactSheetPng,
    options.force ?? false
  );
  return {
    storyboard: {
      path: context.paths.storyboardPath,
      status: storyboardStatus,
    },
    contactSheet: {
      path: context.paths.contactSheetPath,
      status: contactSheetStatus,
    },
    shotCount: artifacts.entries.length,
    limitation:
      "Preview video generation is deferred; this command currently writes deterministic storyboard HTML and contact-sheet PNG artifacts only.",
  };
}

export async function migrateShotsCommand(
  options: ShotsCommandOptions
): Promise<ShotsMigrateResult> {
  const context = await resolveShotsContext(options);
  const sourceScenes = await readJsonIfExists(
    context.paths.sourceScenesPath,
    (value) => z.array(visualSourceSceneSchema).parse(value)
  );
  const preset = selectVisualRetentionPreset(
    context.config,
    context.variant,
    sourceScenes ?? [],
    options.profile
  );
  return migrateLegacyEpisodeShots({
    episodeWorkspace: context.episodeDir,
    locale: context.locale,
    variant: context.variant,
    pacingProfile: preset.pacingProfile,
    visualBudget: preset.visualBudget,
    dryRun: options.dryRun ?? false,
  });
}

export function registerShotsCommands(program: Command): void {
  const shots = program
    .command("shots")
    .description("Shot planning and preview utilities");

  shots
    .command("plan")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--variant <variant>")
    .requiredOption("--locale <locale>")
    .option("--profile <pacing-profile>")
    .option("--force")
    .option("--format <text|json>", "output format", "text")
    .action(async (options: ShotsCommandOptions) => {
      const effective = withGlobalJson(
        options,
        program.opts<{ readonly json?: boolean }>().json
      );
      const result = await planShotsCommand(effective);
      printOutput(resolveFormat(effective), result, [
        `Shot plan ${result.status}`,
        `Plan: ${result.planPath}`,
        `Shots: ${result.shotCount}`,
        `Source images: ${result.sourceImageCount}`,
        result.replacedMalformedExisting
          ? "Existing malformed shot-plan artifact was replaced."
          : undefined,
      ]);
    });

  shots
    .command("inspect")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--variant <variant>")
    .requiredOption("--locale <locale>")
    .option("--format <text|json>", "output format", "text")
    .action(async (options: ShotsCommandOptions) => {
      const effective = withGlobalJson(
        options,
        program.opts<{ readonly json?: boolean }>().json
      );
      const result = await inspectShotsCommand(effective);
      if (resolveFormat(effective) === "json") {
        process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
        return;
      }
      process.stdout.write(`${result.text}\n`);
    });

  shots
    .command("validate")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--variant <variant>")
    .requiredOption("--locale <locale>")
    .option("--force")
    .option("--format <text|json>", "output format", "text")
    .action(async (options: ShotsCommandOptions) => {
      const effective = withGlobalJson(
        options,
        program.opts<{ readonly json?: boolean }>().json
      );
      const result = await validateShotsCommand(effective);
      if (resolveFormat(effective) === "json") {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(
          [
            `Shot validation ${result.valid ? "passed" : "failed"} (${result.status})`,
            `Report: ${result.reportPath}`,
            `Warnings: ${result.warningCount}`,
            `Errors: ${result.errorCount}`,
            ...result.issues.map(
              (issue) =>
                `${issue.severity.toUpperCase()} ${issue.code}${issue.shotId ? ` ${issue.shotId}` : issue.sceneId ? ` ${issue.sceneId}` : ""}: ${issue.message}`
            ),
          ].join("\n") + "\n"
        );
      }
      if (!result.valid) {
        process.exitCode = 1;
      }
    });

  shots
    .command("preview")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--variant <variant>")
    .requiredOption("--locale <locale>")
    .option("--force")
    .option("--format <text|json>", "output format", "text")
    .action(async (options: ShotsCommandOptions) => {
      const effective = withGlobalJson(
        options,
        program.opts<{ readonly json?: boolean }>().json
      );
      const result = await previewShotsCommand(effective);
      printOutput(resolveFormat(effective), result, [
        `Storyboard ${result.storyboard.status}: ${result.storyboard.path}`,
        `Contact sheet ${result.contactSheet.status}: ${result.contactSheet.path}`,
        `Shots: ${result.shotCount}`,
        result.limitation,
      ]);
    });

  shots
    .command("migrate")
    .requiredOption("--episode <episode-id>")
    .requiredOption("--variant <variant>")
    .requiredOption("--locale <locale>")
    .option("--profile <pacing-profile>")
    .option("--dry-run")
    .option("--format <text|json>", "output format", "text")
    .action(async (options: ShotsCommandOptions) => {
      const effective = withGlobalJson(
        options,
        program.opts<{ readonly json?: boolean }>().json
      );
      const result = await migrateShotsCommand(effective);
      if (resolveFormat(effective) === "json") {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(formatMigrationResult(result));
      }
      if (result.status === "blocked") {
        process.exitCode = 1;
      }
    });
}

interface ShotsResolvedContext {
  readonly config: RuntimeConfig;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly episodeDir: string;
  readonly paths: {
    readonly sourceScenesPath: string;
    readonly scenePlanPath: string;
    readonly planPath: string;
    readonly validationPath: string;
    readonly storyboardPath: string;
    readonly contactSheetPath: string;
    readonly focalMetadataPath: string;
  };
}

async function resolveShotsContext(
  options: ShotsCommandOptions
): Promise<ShotsResolvedContext> {
  const episodeId = normalizeEpisodeId(options.episode);
  const initialConfig = await loadRuntimeConfig();
  const resolver = createEpisodePathResolver(initialConfig.workspaceDir);
  const episodeDir = ensureWorkspacePath(
    initialConfig.workspaceDir,
    resolver.episodeRoot(episodeId)
  );
  if (!(await fileExists(episodeDir))) {
    throw new ArtifactNotFoundError(
      `Episode workspace not found: ${episodeId}`
    );
  }
  const episodeConfig = await loadEpisodeConfig(episodeDir);
  const config = await loadRuntimeConfig({}, episodeConfig ?? {});
  const locale = normalizeLocaleCode(options.locale);
  const variant = normalizeContentVariant(options.variant);
  return {
    config,
    episodeId,
    locale,
    variant,
    episodeDir,
    paths: {
      sourceScenesPath: resolver.visualSourceScenes(episodeId),
      scenePlanPath: resolver.canonicalScenesPath(episodeId),
      planPath: resolver.shotPlan({ episodeId, locale, variant }),
      validationPath: resolver.shotValidation({ episodeId, locale, variant }),
      storyboardPath: resolver.shotStoryboard({ episodeId, locale, variant }),
      contactSheetPath: resolver.shotContactSheet({
        episodeId,
        locale,
        variant,
      }),
      focalMetadataPath: resolver.focalMetadata(episodeId),
    },
  };
}

async function loadRequiredSourceScenes(
  filePath: string
): Promise<readonly z.infer<typeof visualSourceSceneSchema>[]> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    throw new ArtifactNotFoundError(
      `Missing source scene artifact: ${filePath}`
    );
  }
  return z.array(visualSourceSceneSchema).parse(JSON.parse(raw) as unknown);
}

async function loadOptionalFocalMetadata(filePath: string): Promise<void> {
  await readJsonIfExists(filePath, (value) =>
    episodeFocalMetadataSchema.parse(value)
  );
}

async function loadShotPlan(filePath: string): Promise<ShotPlan> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    throw new ArtifactNotFoundError(`Missing shot plan artifact: ${filePath}`);
  }
  return shotPlanSchema.parse(JSON.parse(raw) as unknown);
}

async function loadScenePlan(filePath: string): Promise<ScenePlan> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => null);
  if (raw === null) {
    throw new ArtifactNotFoundError(`Missing scene plan artifact: ${filePath}`);
  }
  return scenePlanSchema.parse(JSON.parse(raw) as unknown);
}

async function assertSourceSceneImagesExist(
  episodeDir: string,
  sourceScenes: readonly z.infer<typeof visualSourceSceneSchema>[]
): Promise<void> {
  for (const sourceScene of sourceScenes) {
    const sourceImagePath = path.isAbsolute(sourceScene.sourceImagePath)
      ? sourceScene.sourceImagePath
      : path.join(episodeDir, sourceScene.sourceImagePath);
    if (!(await fileExists(sourceImagePath))) {
      throw new ArtifactNotFoundError(
        `Missing source image for ${sourceScene.sourceImageId} in ${sourceScene.sceneId}.`
      );
    }
  }
}

async function computeValidation(
  context: ShotsResolvedContext,
  shotPlan: ShotPlan
): Promise<{
  readonly valid: boolean;
  readonly issues: readonly ShotPlanValidationIssue[];
  readonly metrics: ShotPlanValidationMetrics;
}> {
  const focalMetadata = await readJsonIfExists(
    context.paths.focalMetadataPath,
    (value) => episodeFocalMetadataSchema.parse(value)
  );
  const pacingProfile =
    shotPlan.pacingProfile.mode === "inline"
      ? shotPlan.pacingProfile.profile
      : selectVisualRetentionPacingProfile(
          context.config,
          visualPacingProfileIdSchema.parse(shotPlan.pacingProfile.profileId)
        );
  return validateShotPlan({
    shotPlan,
    pacingProfile,
    visualBudget: shotPlan.visualBudget,
    treatmentCatalog: shotTreatmentCatalog,
    ...(focalMetadata === null ? {} : { focalMetadata }),
  });
}

function selectVisualRetentionPreset(
  config: RuntimeConfig,
  variant: "full" | "short",
  sourceScenes: readonly z.infer<typeof visualSourceSceneSchema>[],
  requestedProfileId?: string
): {
  readonly pacingProfile: VisualPacingProfile;
  readonly visualBudget: VisualBudget;
} {
  const durationMs = sourceScenes.at(-1)?.narrationEndMs ?? 0;
  const presets = config.visualRetention.defaults[variant];
  const matching =
    presets.find(
      (preset) =>
        durationMs >= preset.narrationDurationMs.minMs &&
        durationMs <= preset.narrationDurationMs.maxMs
    ) ??
    [...presets].sort((left, right) => {
      const leftDistance = presetDistance(left.narrationDurationMs, durationMs);
      const rightDistance = presetDistance(
        right.narrationDurationMs,
        durationMs
      );
      return leftDistance - rightDistance;
    })[0];
  if (!matching) {
    throw new MediaValidationError(
      `No visual-retention defaults configured for ${variant}.`
    );
  }
  const profileId = requestedProfileId
    ? visualPacingProfileIdSchema.parse(requestedProfileId)
    : matching.pacingProfileId;
  return {
    pacingProfile: selectVisualRetentionPacingProfile(config, profileId),
    visualBudget: matching.budget,
  };
}

function selectVisualRetentionPacingProfile(
  config: RuntimeConfig,
  profileId: z.infer<typeof visualPacingProfileIdSchema>
): VisualPacingProfile {
  switch (profileId) {
    case "atmospheric":
      return config.visualRetention.pacingProfiles.atmospheric;
    case "balanced":
      return config.visualRetention.pacingProfiles.balanced;
    case "high-retention":
      return config.visualRetention.pacingProfiles["high-retention"];
    case "shorts-aggressive":
      return config.visualRetention.pacingProfiles["shorts-aggressive"];
    default:
      throw new MediaValidationError(`Unknown pacing profile: ${profileId}`);
  }
}

function presetDistance(
  range: { readonly minMs: number; readonly maxMs: number },
  durationMs: number
): number {
  if (durationMs < range.minMs) {
    return range.minMs - durationMs;
  }
  if (durationMs > range.maxMs) {
    return durationMs - range.maxMs;
  }
  return 0;
}

function resolveFormat(options: ShotsCommandOptions): ShotInspectFormat {
  if (options.json) {
    return "json";
  }
  return options.format === "json" ? "json" : "text";
}

function withGlobalJson(
  options: ShotsCommandOptions,
  json: boolean | undefined
): ShotsCommandOptions {
  return json === undefined ? options : { ...options, json };
}

function printOutput(
  format: ShotInspectFormat,
  jsonValue: unknown,
  textLines: readonly (string | undefined)[]
): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(jsonValue, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `${textLines.filter((line): line is string => Boolean(line)).join("\n")}\n`
  );
}

function formatMigrationResult(result: ShotsMigrateResult): string {
  return (
    [
      `Legacy shot migration: ${result.status}`,
      `Detected format: ${result.sourceFormat}`,
      `Scenes: ${result.scenesFound}`,
      `Images: ${result.imagesFound}`,
      `Focal metadata entries: ${result.focalMetadataGenerated}`,
      `Planned shots: ${result.plannedShotCount}`,
      `Validation: ${result.validation.valid ? "passed" : "failed"}`,
      `Artifacts: ${result.artifactsWritten.length === 0 ? "none" : result.artifactsWritten.join(", ")}`,
      `Image regeneration recommended: ${result.requiresImageRegeneration ? "yes" : "no"}`,
      ...result.warnings.map((warning) =>
        `WARNING ${warning.code}${warning.sceneId ? ` ${warning.sceneId}` : ""}: ${warning.message}`
      ),
    ].join("\n") + "\n"
  );
}

function parseShotPlanArtifact(raw: string): boolean {
  try {
    shotPlanSchema.parse(JSON.parse(raw) as unknown);
    return true;
  } catch {
    return false;
  }
}

function parseValidationArtifact(raw: string): boolean {
  try {
    validationArtifactSchema.parse(JSON.parse(raw) as unknown);
    return true;
  } catch {
    return false;
  }
}

function resolveArtifactStatus(args: {
  readonly force: boolean;
  readonly nextContent: string;
  readonly currentContent: string | null;
  readonly currentParsedValid: boolean;
}): "created" | "reused" | "replaced" {
  if (args.currentContent === null) {
    return "created";
  }
  if (
    !args.force &&
    args.currentParsedValid &&
    args.currentContent === args.nextContent
  ) {
    return "reused";
  }
  return "replaced";
}

function extractRepairSuggestion(
  details: Record<string, unknown> | undefined
): string | undefined {
  const suggestion = details?.["repairSuggestion"];
  if (
    suggestion &&
    typeof suggestion === "object" &&
    typeof (suggestion as Record<string, unknown>)["action"] === "string"
  ) {
    const action = String((suggestion as Record<string, unknown>)["action"]);
    const target = (suggestion as Record<string, unknown>)["target"];
    return typeof target === "string" ? `${action}:${target}` : action;
  }
  return undefined;
}

function extractMetricValues(
  details: Record<string, unknown> | undefined
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (!details) {
    return undefined;
  }
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "repairSuggestion") {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function estimateSavedImageCostMicros(
  episodeDir: string,
  shotPlan: ShotPlan
): Promise<{
  readonly pricingVersion: string;
  readonly costMicros: number | null;
}> {
  const avoidedCalls = Math.max(
    0,
    shotPlan.shots.length - shotPlan.sourceScenes.length
  );
  if (avoidedCalls === 0) {
    return { pricingVersion: "unconfigured", costMicros: 0 };
  }
  const manifests = await Promise.all(
    shotPlan.sourceScenes.map((sourceScene) =>
      loadEpisodeSceneManifest(episodeDir, sourceScene.sceneId)
    )
  );
  const manifest = manifests.find((value) => value !== null);
  if (!manifest) {
    return { pricingVersion: "unconfigured", costMicros: null };
  }
  const estimate = estimateImageCostMicros(undefined, {
    operation: manifest.referenceImages.length > 0 ? "edit" : "generate",
    size: manifest.size,
    quality: manifest.quality,
  });
  return {
    pricingVersion: estimate.pricingVersion,
    costMicros:
      estimate.costMicros === null ? null : estimate.costMicros * avoidedCalls,
  };
}

async function readDerivedClipCacheSummary(
  context: ShotsResolvedContext,
  shotPlan: ShotPlan
): Promise<ShotInspectCacheSummary> {
  void context;
  void shotPlan;
  return { available: false };
}

async function writeTextArtifactWithReuse(
  filePath: string,
  content: string,
  force: boolean
): Promise<"created" | "reused" | "replaced"> {
  const nextContent = content.endsWith("\n") ? content : `${content}\n`;
  const currentContent = await fs.readFile(filePath, "utf8").catch(() => null);
  const status = resolveArtifactStatus({
    force,
    nextContent,
    currentContent,
    currentParsedValid: true,
  });
  if (status !== "reused") {
    await writeTextAtomic(filePath, nextContent);
  }
  return status;
}

async function writeBinaryArtifactWithReuse(
  filePath: string,
  content: Buffer,
  force: boolean
): Promise<"created" | "reused" | "replaced"> {
  const currentContent = await fs.readFile(filePath).catch(() => null);
  if (!force && currentContent !== null && currentContent.equals(content)) {
    return "reused";
  }
  await writeBinaryAtomic(filePath, content);
  return currentContent === null ? "created" : "replaced";
}
