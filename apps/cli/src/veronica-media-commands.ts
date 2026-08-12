import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadRuntimeConfig } from "@mediaforge/config";
import { supportedLanguageCodeSchema } from "@mediaforge/domain";
import { YOUTUBE_METADATA_PROMPT_VERSION, type YoutubeMetadataGenerationOptions } from "@mediaforge/metadata";
import { runCommand } from "@mediaforge/process-runner";
import { inspectSemanticImagePromptCache, requireOpenAiResponsesPolicy } from "@mediaforge/shared";
import {
  createVeronicaPilotFixtures,
  executeVeronicaRender,
  loadVeronicaPipelineResult,
  runVeronicaSupplementalMediaPipeline,
  veronicaEpisodeStateDir,
  veronicaMediaPlanSchema,
  veronicaRenderManifestSchema,
  generateVeronicaYoutubeMetadata,
} from "@mediaforge/veronica-media";
import {
  generatePositioningVisualPlans,
  generatePositioningVisualPlanCalibration,
  generateVeronicaBeniniReviewPacks,
  preparePositioningProductionEpisode,
  planExistingVeronicaVisualDensity,
  remediateExistingVeronicaPreImagePlan,
  establishVeronicaSourceGroundedQaAdmission,
  runExistingVeronicaSourceGroundedPreImageQa,
  positioningProductionPlanSchema,
  resolveVeronicaSemanticImagePromptPaths,
  runStrategicSupplementalMediaBridge,
  discoverVeronicaContentPack2Shorts,
  discoverFullTranscriptedPackEpisodes,
  prepareCanonicalSourceEpisodeWorkspace,
  type PositioningVisualPlanV2,
} from "@mediaforge/strategic-reinvention";
import { createVeronicaImagePromptCompilerComposition } from "./veronica-image-prompt-compiler-composition.js";
import { createVeronicaPreImageReviewPack, createVeronicaPromptCompilationReviewPack, reviewPackModeSchema } from "./veronica-pre-image-review-pack.js";
import {
  createVeronicaSourceGroundedVisualQaComposition,
  VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS,
  type VeronicaPaidOpenAiQaAuthorization,
} from "./veronica-source-grounded-visual-qa-composition.js";

const mediaforgeBinPath = fileURLToPath(new URL("../bin/mediaforge.js", import.meta.url));

type VeronicaLanguage = "en" | "de" | "es" | "fr" | "pt" | "it";
type VeronicaVariant = "full" | "short";

function parseVeronicaVariant(value: string): VeronicaVariant {
  if (value === "full" || value === "short") return value;
  throw new Error(`Unsupported Veronica metadata variant: ${value}. Expected full or short.`);
}

function parseSourceGroundedQaProfile(value: string): "INTERACTIVE" | "COST_OPTIMIZED" | "BULK" {
  if (value === "interactive") return "INTERACTIVE";
  if (value === "cost-optimized") return "COST_OPTIMIZED";
  if (value === "bulk") return "BULK";
  throw new Error(`Unsupported source-grounded QA profile: ${value}. Expected interactive, cost-optimized, or bulk.`);
}

async function veronicaMetadataOptions(input: { readonly workspace: string; readonly force: boolean; readonly dryRun: boolean }): Promise<YoutubeMetadataGenerationOptions> {
  const runtime = await loadRuntimeConfig({
    workspaceDir: path.resolve(input.workspace),
  });
  const metadataPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["youtube-metadata"]);
  const repairPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["metadata-repair"]);
  const baseUrl = runtime.openAiCompatibleBaseUrl ?? process.env["OPENAI_BASE_URL"];
  return {
    apiKey: runtime.openAiCompatibleApiKey ?? process.env["OPENAI_API_KEY"] ?? "",
    model: metadataPolicy.model,
    maxOutputTokens: runtime.openAiMetadataMaxOutputTokens,
    repairModel: repairPolicy.model,
    repairReasoningEffort: repairPolicy.reasoning,
    repairMaxOutputTokens: runtime.openAiValidatorMaxOutputTokens ?? runtime.openAiMetadataMaxOutputTokens,
    language: "en",
    promptText: await fs.readFile(path.resolve("prompts", "youtube-metadata.prompt.md"), "utf8"),
    promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
    maxRetries: runtime.openAiMetadataMaxRetries ?? 3,
    timeoutMs: runtime.openAiMetadataTimeoutMs ?? 120000,
    keepFile: runtime.openAiMetadataKeepFile,
    force: input.force,
    dryRun: input.dryRun,
    reasoningEffort: metadataPolicy.reasoning,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };
}

async function resolveCanonicalNarrationFromManifest(input: { readonly workspace: string; readonly episodeDir: string; readonly canonicalNarrationSource: string }): Promise<string | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(input.episodeDir, "manifest.json"), "utf8")) as { readonly source?: { readonly filePath?: unknown } };
    const sourcePath = manifest.source?.filePath;
    if (typeof sourcePath !== "string" || path.isAbsolute(sourcePath)) return null;
    const normalized = sourcePath.replaceAll("\\", "/");
    const packageBoundary = normalized.indexOf("/shorts/");
    const packageRoot = packageBoundary >= 0 ? normalized.slice(0, packageBoundary) : normalized.slice(0, Math.max(normalized.lastIndexOf("/"), 0));
    if (!packageRoot) return null;
    return path.resolve(path.dirname(path.resolve(input.workspace)), packageRoot, input.canonicalNarrationSource);
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

interface PaidQaCliOptions {
  readonly allowPaidOpenaiQa?: boolean;
  readonly maxProviderCalls?: number;
  readonly maxEstimatedCostUsd?: number;
  readonly maxFlagshipCallsPerPack?: number;
  readonly maxEstimatedInputTokens?: number;
  readonly maxEstimatedOutputTokens?: number;
  readonly maxAutomaticRemediationRounds?: number;
}

export function resolveVeronicaPaidQaAuthorization(
  options: PaidQaCliOptions,
  variant: VeronicaVariant
): VeronicaPaidOpenAiQaAuthorization | undefined {
  if (!options.allowPaidOpenaiQa) return undefined;
  const defaults = VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS[variant];
  return {
    maxProviderCalls: options.maxProviderCalls ?? defaults.maxProviderCalls,
    maxEstimatedCostUsd:
      options.maxEstimatedCostUsd ?? defaults.maxEstimatedCostUsd,
    maxFlagshipCallsPerPack:
      options.maxFlagshipCallsPerPack ?? defaults.maxFlagshipCallsPerPack,
    maxEstimatedInputTokens:
      options.maxEstimatedInputTokens ?? defaults.maxEstimatedInputTokens,
    maxEstimatedOutputTokens:
      options.maxEstimatedOutputTokens ?? defaults.maxEstimatedOutputTokens,
  };
}

function remediationRounds(value: number | undefined): 1 | 2 | undefined {
  if (value === undefined) return undefined;
  if (value === 1 || value === 2) return value;
  throw new Error("--max-automatic-remediation-rounds must be 1 or 2.");
}

function addSourceGroundedQaCostControls(command: Command): Command {
  return command
    .option(
      "--allow-paid-openai-qa",
      "Explicitly authorize live paid source-grounded OpenAI QA",
      false
    )
    .option("--max-provider-calls <number>", `Hard provider-request ceiling; 0 enforces exact-cache-only execution (Short ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.short.maxProviderCalls}; full ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.full.maxProviderCalls})`, (value) =>
      parseNonNegativeInteger(value, "--max-provider-calls")
    )
    .option("--max-estimated-cost-usd <number>", "Hard estimated-spend ceiling (Short $0.40; full $0.60)", (value) =>
      parsePositiveNumber(value, "--max-estimated-cost-usd")
    )
    .option("--max-flagship-calls-per-pack <number>", "Hard flagship-request ceiling per pack (default 1)", (value) =>
      parsePositiveInteger(value, "--max-flagship-calls-per-pack")
    )
    .option("--max-estimated-input-tokens <number>", `Estimated input-token ceiling (Short ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.short.maxEstimatedInputTokens}; full ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.full.maxEstimatedInputTokens})`, (value) =>
      parsePositiveInteger(value, "--max-estimated-input-tokens")
    )
    .option("--max-estimated-output-tokens <number>", `Estimated output-token ceiling (Short ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.short.maxEstimatedOutputTokens}; full ${VERONICA_SOURCE_GROUNDED_QA_DEFAULT_CEILINGS.full.maxEstimatedOutputTokens})`, (value) =>
      parsePositiveInteger(value, "--max-estimated-output-tokens")
    )
    .option("--max-automatic-remediation-rounds <number>", "Automatic rounds (default 1; 2 must be explicit)", (value) =>
      parsePositiveInteger(value, "--max-automatic-remediation-rounds")
    );
}

async function loadVeronicaSemanticInputs(input: {
  readonly workspace: string;
  readonly episodeId: string;
  readonly variant: VeronicaVariant;
  readonly planPath?: string;
  readonly narrationPath?: string;
}): Promise<{
  readonly episodeDir: string;
  readonly plan: PositioningVisualPlanV2;
  readonly canonicalNarration: string;
}> {
  const episodeDir = path.join(path.resolve(input.workspace), input.episodeId);
  const generatedPreImagePlan = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const defaultPlanPath = await fs
    .access(generatedPreImagePlan)
    .then(() => generatedPreImagePlan)
    .catch(() => path.join(episodeDir, "source", "visual-plan.json"));
  const planPath = path.resolve(input.planPath ?? defaultPlanPath);
  const plan = positioningProductionPlanSchema.parse(JSON.parse(await fs.readFile(planPath, "utf8")) as unknown) as unknown as PositioningVisualPlanV2;
  const manifestCanonicalNarration = await resolveCanonicalNarrationFromManifest({
    workspace: input.workspace,
    episodeDir,
    canonicalNarrationSource: plan.canonicalNarrationSource,
  });
  const candidates = input.narrationPath
    ? [path.resolve(input.narrationPath)]
    : input.variant === "short"
      ? [
          ...(manifestCanonicalNarration ? [manifestCanonicalNarration] : []),
          path.join(episodeDir, "source", "canonical-narration.md"),
          path.join(episodeDir, "languages", "short", "script-en.md"),
          path.join(episodeDir, "locales", "en", "short", "script.md"),
        ]
      : [
          ...(manifestCanonicalNarration ? [manifestCanonicalNarration] : []),
          path.join(episodeDir, "source", "canonical-narration.md"),
          path.join(episodeDir, "languages", "script-en.md"),
          path.join(episodeDir, "locales", "en", "full", "script.md"),
        ];
  for (const candidate of candidates) {
    try {
      return {
        episodeDir,
        plan,
        canonicalNarration: await fs.readFile(candidate, "utf8"),
      };
    } catch {
      // Try the next canonical-only location.
    }
  }
  throw new Error(`Canonical Veronica narration not found: ${candidates.join(", ")}.`);
}

export function registerVeronicaMediaCommands(program: Command): void {
  const veronica = program.command("veronica-media").description("Veronica Benini supplemental media planning and rendering");
  const sourcePack = veronica
    .command("source-pack")
    .description("Discover and prepare canonical Veronica source-pack episodes without media production");

  sourcePack
    .command("prepare")
    .description("Prepare one Veronica Content Pack 2 source episode and canonical planner input")
    .requiredOption("--pack <path>", "Veronica Content Pack 2 root")
    .requiredOption("--workspace <path>", "Canonical episode workspace root")
    .requiredOption("--episode-id <id>", "Stable authored Pack 2 episode key")
    .option("--language <code>", "Locale to materialize", "en")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { pack: string; workspace: string; episodeId: string; language: string; json: boolean }) => {
      const language = supportedLanguageCodeSchema.parse(options.language);
      const episodes = await discoverVeronicaContentPack2Shorts({
        packDir: path.resolve(options.pack),
      });
      const sourceEpisode = episodes.find((episode) => episode.episodeId === options.episodeId);
      if (!sourceEpisode) {
        throw new Error(`Veronica Content Pack 2 episode not found: ${options.episodeId}`);
      }
      const result = await prepareCanonicalSourceEpisodeWorkspace({
        workspaceRoot: path.resolve(options.workspace),
        sourceEpisode,
        locale: language,
      });
      const payload = {
        ...result,
        sourcePackId: sourceEpisode.sourcePackId,
        sourceRevisionHash: sourceEpisode.sourceRevisionHash,
        sourceLocales: sourceEpisode.localeSources.map((source) => source.locale),
        providerCalls: 0,
      };
      process.stdout.write(`${JSON.stringify(payload, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
    });

  sourcePack
    .command("prepare-full-transcripted")
    .description("Prepare one QA-approved Wave 01 narration from the full-transcripted Veronica pack")
    .requiredOption("--pack <path>", "Full-transcripted content pack root")
    .requiredOption("--workspace <path>", "Canonical episode workspace root")
    .requiredOption("--episode-id <id>", "Wave story ID (for example S001) or canonical episode ID")
    .option("--format <short|long>", "Limit discovery to one video format")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { pack: string; workspace: string; episodeId: string; format?: "short" | "long"; json: boolean }) => {
      if (options.format !== undefined && options.format !== "short" && options.format !== "long") {
        throw new Error("--format must be short or long.");
      }
      const episodes = await discoverFullTranscriptedPackEpisodes({
        packDir: path.resolve(options.pack),
        ...(options.format ? { format: options.format } : {}),
      });
      const requestedId = options.episodeId.trim();
      const sourceEpisode = episodes.find((episode) =>
        episode.episodeId === requestedId.toLowerCase() ||
        episode.sourceGrounding?.storyId === requestedId.toUpperCase(),
      );
      if (!sourceEpisode) {
        throw new Error(`QA-approved full-transcripted Pack Wave 01 episode not found: ${options.episodeId}`);
      }
      const result = await prepareCanonicalSourceEpisodeWorkspace({
        workspaceRoot: path.resolve(options.workspace),
        sourceEpisode,
        locale: "en",
      });
      const payload = {
        ...result,
        sourcePackId: sourceEpisode.sourcePackId,
        sourceRevisionHash: sourceEpisode.sourceRevisionHash,
        format: sourceEpisode.format,
        sourceGrounding: sourceEpisode.sourceGrounding,
        providerCalls: 0,
      };
      process.stdout.write(`${JSON.stringify(payload, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
    });

  veronica
    .command("metadata")
    .description("Generate or plan variant-aware YouTube metadata from the selected narration")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--locale <code>", "Metadata locale", "en")
    .option("--variant <full|short>", "Narration variant", "full")
    .option("--force", "Bypass a valid metadata cache", false)
    .option("--dry-run", "Resolve narration and metadata cache without provider calls", false)
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; locale: string; variant: string; force: boolean; dryRun: boolean; json: boolean }) => {
      const dryRun = options.dryRun || program.opts<{ readonly dryRun?: boolean }>().dryRun === true;
      const result = await generateVeronicaYoutubeMetadata({
        workspaceRoot: options.workspace,
        episodeId: options.episodeId,
        locale: options.locale,
        variant: parseVeronicaVariant(options.variant),
        generationOptions: await veronicaMetadataOptions({
          workspace: options.workspace,
          force: options.force,
          dryRun,
        }),
      });
      process.stdout.write(`${JSON.stringify(result, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
    });

  addSourceGroundedQaCostControls(
    veronica
    .command("prepare-production")
    .description("Adapt an approved Veronica positioning plan to canonical image and speech episode artifacts")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .requiredOption("-L, --language <code>", "Narration language")
    .requiredOption("--variant <full|short>", "Production variant")
    .option("--plan <path>", "Positioning visual plan (defaults to source/visual-plan.json)")
    .option("--script <path>", "Narration script override")
    .option("--source-grounded-fixture <path>", "Offline strict source-grounded QA fixture")
    .option("--source-grounded-qa-profile <profile>", "interactive, cost-optimized, or bulk", "interactive")
    .option("--json", "Emit machine-readable output", false)
  )
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        language: VeronicaLanguage;
        variant: VeronicaVariant;
        plan?: string;
        script?: string;
        sourceGroundedFixture?: string;
        sourceGroundedQaProfile: string;
        allowPaidOpenaiQa?: boolean;
        maxProviderCalls?: number;
        maxEstimatedCostUsd?: number;
        maxFlagshipCallsPerPack?: number;
        maxEstimatedInputTokens?: number;
        maxEstimatedOutputTokens?: number;
        maxAutomaticRemediationRounds?: number;
        json: boolean;
      }) => {
        const workspaceRoot = path.resolve(options.workspace);
        const episodeDir = path.join(workspaceRoot, options.episodeId);
        const paidOpenAiQa = resolveVeronicaPaidQaAuthorization(
          options,
          options.variant
        );
        const maxAutomaticRemediationRounds = remediationRounds(
          options.maxAutomaticRemediationRounds
        );
        const result = await preparePositioningProductionEpisode({
          workspaceRoot,
          episodeId: options.episodeId,
          language: options.language,
          variant: options.variant,
          imagePromptCompiler: await createVeronicaImagePromptCompilerComposition({
            workspaceRoot,
            episodeDir,
          }),
          sourceGroundedVisualQa: await createVeronicaSourceGroundedVisualQaComposition({
            workspaceRoot,
            episodeDir,
            ...(options.sourceGroundedFixture ? { fixturePath: options.sourceGroundedFixture } : {}),
            executionProfile: parseSourceGroundedQaProfile(options.sourceGroundedQaProfile),
            ...(paidOpenAiQa ? { paidOpenAiQa } : {}),
            ...(maxAutomaticRemediationRounds
              ? { maxAutomaticRemediationRounds }
              : {}),
          }),
          ...(options.plan ? { planPath: path.resolve(options.plan) } : {}),
          ...(options.script ? { scriptPath: path.resolve(options.script) } : {}),
        });
        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }
        process.stdout.write(`Prepared ${result.episodeId} (${result.language}/${result.variant}) with ${result.sceneCount} canonical scenes.\nManifest: ${result.manifestPath}\n`);
      },
    );

  addSourceGroundedQaCostControls(
    veronica
      .command("source-grounded-qa")
      .description("Run source-grounded QA for an existing Veronica plan without replanning or producing media")
      .requiredOption("--workspace <path>", "Episode workspace root")
      .requiredOption("--episode-id <id>", "Episode identifier")
      .option("-L, --language <code>", "Canonical narration language", "en")
      .option("--variant <full|short>", "Narration variant", "short")
      .option("--source-grounded-fixture <path>", "Offline strict source-grounded QA fixture")
      .option("--source-grounded-qa-profile <profile>", "interactive, cost-optimized, or bulk", "interactive")
      .option("--admission-only", "Validate deterministic artifacts and establish a fresh QA admission without dispatching judges", false)
      .option("--json", "Emit machine-readable output", false)
  ).action(
    async (options: {
      workspace: string;
      episodeId: string;
      language: VeronicaLanguage;
      variant: VeronicaVariant;
      sourceGroundedFixture?: string;
      sourceGroundedQaProfile: string;
      admissionOnly: boolean;
      allowPaidOpenaiQa?: boolean;
      maxProviderCalls?: number;
      maxEstimatedCostUsd?: number;
      maxFlagshipCallsPerPack?: number;
      maxEstimatedInputTokens?: number;
      maxEstimatedOutputTokens?: number;
      maxAutomaticRemediationRounds?: number;
      json: boolean;
    }) => {
      const workspaceRoot = path.resolve(options.workspace);
      const episodeDir = path.join(workspaceRoot, options.episodeId);
      const paidOpenAiQa = resolveVeronicaPaidQaAuthorization(
        options,
        options.variant
      );
      const maxAutomaticRemediationRounds = remediationRounds(
        options.maxAutomaticRemediationRounds
      );
      const sourceGroundedVisualQa =
        await createVeronicaSourceGroundedVisualQaComposition({
          workspaceRoot,
          episodeDir,
          ...(options.sourceGroundedFixture
            ? { fixturePath: options.sourceGroundedFixture }
            : {}),
          executionProfile: parseSourceGroundedQaProfile(
            options.sourceGroundedQaProfile
          ),
          ...(paidOpenAiQa ? { paidOpenAiQa } : {}),
          ...(maxAutomaticRemediationRounds
            ? { maxAutomaticRemediationRounds }
            : {}),
        });
      const qaInput = {
        workspaceRoot,
        episodeId: options.episodeId,
        language: options.language,
        variant: options.variant,
        sourceGroundedVisualQa,
      } as const;
      const result = options.admissionOnly
        ? await establishVeronicaSourceGroundedQaAdmission(qaInput)
        : await runExistingVeronicaSourceGroundedPreImageQa(qaInput);
      process.stdout.write(
        `${JSON.stringify(result, options.json ? null : undefined, options.json ? 2 : undefined)}\n`
      );
    }
  );

  veronica
    .command("remediate-pre-image")
    .description("Apply reviewed episode VisualTreatment overrides and recompile deterministic prompts without narration, QA, or images")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .requiredOption("--overrides <path>", "Reviewed visual-treatment override artifact")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; overrides: string; json: boolean }) => {
      const workspaceRoot = path.resolve(options.workspace);
      const episodeDir = path.join(workspaceRoot, options.episodeId);
      const result = await remediateExistingVeronicaPreImagePlan({
        workspaceRoot,
        episodeId: options.episodeId,
        overridePath: path.resolve(options.overrides),
        imagePromptCompiler: await createVeronicaImagePromptCompilerComposition({ workspaceRoot, episodeDir }),
      });
      process.stdout.write(`${JSON.stringify(result, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
    });

  veronica
    .command("plan-visual-density")
    .description("Materialize visual beats for an approved Veronica Short without changing semantic scenes or producing images")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--overrides <path>", "Optional reviewed visual-beat override artifact; otherwise use deterministic treatment diversification")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; overrides?: string; json: boolean }) => {
      const workspaceRoot = path.resolve(options.workspace);
      const episodeDir = path.join(workspaceRoot, options.episodeId);
      const result = await planExistingVeronicaVisualDensity({
        workspaceRoot,
        episodeId: options.episodeId,
        ...(options.overrides ? { overridePath: path.resolve(options.overrides) } : {}),
        imagePromptCompiler: await createVeronicaImagePromptCompilerComposition({ workspaceRoot, episodeDir }),
      });
      process.stdout.write(`${JSON.stringify(result, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
    });

  const images = veronica.command("images").description("Generate Veronica positioning images through the canonical image pipeline");
  images
    .command("derive-image-prompts")
    .description("Verify the atomically compiled Veronica provider prompts")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--variant <full|short>", "Canonical narration variant", "full")
    .option("--plan <path>", "Approved positioning visual plan")
    .option("--canonical-narration <path>", "Canonical English narration override")
    .option("--refresh-image-prompt-brief", "refresh only the semantic prompt brief")
    .option("--fixture-response <path>", "offline strict structured-output fixture")
    .option("--dry-run", "show cache identity without calling OpenAI or writing artifacts")
    .option("--json", "Emit machine-readable output", false)
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        variant: VeronicaVariant;
        plan?: string;
        canonicalNarration?: string;
        refreshImagePromptBrief?: boolean;
        fixtureResponse?: string;
        dryRun?: boolean;
        json: boolean;
      }) => {
        const source = await loadVeronicaSemanticInputs({
          workspace: options.workspace,
          episodeId: options.episodeId,
          variant: options.variant,
          ...(options.plan ? { planPath: options.plan } : {}),
          ...(options.canonicalNarration ? { narrationPath: options.canonicalNarration } : {}),
        });
        const dryRun = options.dryRun || program.opts<{ readonly dryRun?: boolean }>().dryRun;
        if (source.plan.imagePromptGenerationStrategy !== "deterministic-v1" || !source.plan.imagePromptCompilation) {
          throw new Error("VERONICA_DETERMINISTIC_IMAGE_PROMPTS_NOT_COMPILED: run prepare-production to compile canonical provider prompts before image generation.");
        }
        const incoherent = source.plan.assets.filter((asset) =>
          !asset.promptCompilation
          || asset.promptCompilation.result.imagePrompt !== asset.prompt
          || asset.promptCompilation.input.provenance.materializationRevisionId
            !== source.plan.scenes.find((scene) => scene.sceneId === asset.sceneId)?.materializationRevision?.revisionId
        );
        if (incoherent.length > 0) throw new Error(`VERONICA_COMPILED_PROMPT_SNAPSHOT_MISMATCH:${incoherent.map((asset) => asset.assetId).join(",")}`);
        if (dryRun) {
          process.stdout.write(`${JSON.stringify({ dryRun: true, contentId: source.plan.contentId, ...source.plan.imagePromptCompilation }, null, 2)}\n`);
          return;
        }
        const reviewPack = await createVeronicaPromptCompilationReviewPack({
          episodeDir: source.episodeDir,
          language: "en",
          variant: options.variant,
        });
        const payload = {
          contentId: source.plan.contentId,
          strategy: source.plan.imagePromptGenerationStrategy,
          compilation: source.plan.imagePromptCompilation,
          finalPromptSetHash: source.plan.canonicalImagePlanHash,
          staleAssetIds: [],
          preImageReviewPack: reviewPack.packDir,
          imageGenerationCalls: 0,
        };
        process.stdout.write(`${JSON.stringify(payload, options.json ? null : undefined, options.json ? 2 : undefined)}\n`);
      },
    );

  images
    .command("inspect-image-prompts")
    .description("Inspect cached Veronica semantic prompt previews without provider calls")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; json: boolean }) => {
      const episodeDir = path.join(path.resolve(options.workspace), options.episodeId);
      const paths = resolveVeronicaSemanticImagePromptPaths(episodeDir);
      const artifact = await inspectSemanticImagePromptCache(paths.cachePath);
      const review = JSON.parse(await fs.readFile(paths.reviewPath, "utf8")) as unknown;
      process.stdout.write(`${JSON.stringify({ cachePath: paths.cachePath, reviewPath: paths.reviewPath, artifact, review }, null, options.json ? 2 : undefined)}\n`);
    });
  addSourceGroundedQaCostControls(
    images
    .command("review-pack")
    .description("Create a local review pack before Veronica image-provider requests")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--language <code>", "Narration language", "en")
    .option("--variant <full|short>", "Narration variant", "short")
    .option("--review-pack-mode <compact|listening|forensic>", "compact: metadata-only audio integrity; listening: review-only compressed narration; forensic: canonical production WAV", "compact")
    .option("--source-grounded-fixture <path>", "Offline strict source-grounded QA fixture")
    .option("--source-grounded-qa-profile <profile>", "interactive, cost-optimized, or bulk", "interactive")
    .option("--json", "Emit machine-readable output", false)
  )
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        language: VeronicaLanguage;
        variant: VeronicaVariant;
        reviewPackMode: string;
        sourceGroundedFixture?: string;
        sourceGroundedQaProfile: string;
        allowPaidOpenaiQa?: boolean;
        maxProviderCalls?: number;
        maxEstimatedCostUsd?: number;
        maxFlagshipCallsPerPack?: number;
        maxEstimatedInputTokens?: number;
        maxEstimatedOutputTokens?: number;
        maxAutomaticRemediationRounds?: number;
        json: boolean;
      }) => {
        const workspaceRoot = path.resolve(options.workspace);
        const episodeDir = path.join(workspaceRoot, options.episodeId);
        const paidOpenAiQa = resolveVeronicaPaidQaAuthorization(
          options,
          options.variant
        );
        const maxAutomaticRemediationRounds = remediationRounds(
          options.maxAutomaticRemediationRounds
        );
        const result = await createVeronicaPreImageReviewPack({
          episodeDir,
          language: options.language,
          variant: options.variant,
          reviewPackMode: reviewPackModeSchema.parse(options.reviewPackMode),
          imagePromptCompiler: await createVeronicaImagePromptCompilerComposition({
            workspaceRoot,
            episodeDir,
          }),
          sourceGroundedVisualQa: await createVeronicaSourceGroundedVisualQaComposition({
            workspaceRoot,
            episodeDir,
            ...(options.sourceGroundedFixture ? { fixturePath: options.sourceGroundedFixture } : {}),
            executionProfile: parseSourceGroundedQaProfile(options.sourceGroundedQaProfile),
            ...(paidOpenAiQa ? { paidOpenAiQa } : {}),
            ...(maxAutomaticRemediationRounds
              ? { maxAutomaticRemediationRounds }
              : {}),
          }),
        });
        process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `Created pre-image review pack: ${result.packDir}\nZIP: ${result.zipPath}\n`);
      },
    );
  images
    .command("generate")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--mode <sync|batch>", "Synchronous or provider-batch execution", "sync")
    .option("--language <code>", "Batch localization coordinate", "it")
    .option("--variant <full|short>", "Image production variant", "full")
    .option("--concurrency <number>", "Bounded synchronous scene concurrency", (value) => parsePositiveInteger(value, "--concurrency"))
    .option("--max-batch-size <number>", "Maximum provider requests per image batch", (value) => parsePositiveInteger(value, "--max-batch-size"))
    .option("--phase <auto|references|scenes>", "Image batch planning phase", "auto")
    .option("--dry-run", "Plan work without provider submission", false)
    .option("--force", "Regenerate existing canonical images", false)
    .option("--refresh-image-prompt-brief", "refresh semantic prompts before image execution", false)
    .option("--json", "Emit machine-readable output", false)
    .action(
      async (options: {
        workspace: string;
        episodeId: string;
        mode: "sync" | "batch";
        language: VeronicaLanguage;
        variant: VeronicaVariant;
        concurrency?: number;
        maxBatchSize?: number;
        phase: "auto" | "references" | "scenes";
        dryRun: boolean;
        force: boolean;
        refreshImagePromptBrief: boolean;
        json: boolean;
      }) => {
        if (!options.dryRun) {
          const preflight = await runCommand(
            process.execPath,
            [
              mediaforgeBinPath,
              "veronica-media",
              "images",
              "derive-image-prompts",
              "--workspace",
              path.resolve(options.workspace),
              "--episode-id",
              options.episodeId,
              "--variant",
              options.variant,
              ...(options.refreshImagePromptBrief ? ["--refresh-image-prompt-brief"] : []),
              "--json",
            ],
            { allowNonZeroExit: true },
          );
          if (preflight.exitCode !== 0) {
            if (preflight.stdout) process.stdout.write(preflight.stdout);
            if (preflight.stderr) process.stderr.write(preflight.stderr);
            process.exitCode = preflight.exitCode;
            return;
          }
        }
        const args = [mediaforgeBinPath, ...(options.json ? ["--json"] : []), "images"];
        if (options.mode === "batch") {
          args.push("batch", "prepare", "--episode", options.episodeId, "--languages", options.language, "--variants", options.variant, "--phase", options.phase);
          if (options.maxBatchSize !== undefined) {
            args.push("--max-batch-size", String(options.maxBatchSize));
          }
          if (options.dryRun) args.push("--dry-run");
        } else {
          args.push("resume", "--episode", options.episodeId, "--variant", options.variant);
          if (options.json) args.push("--json");
          if (options.force) args.push("--force");
          if (options.concurrency !== undefined) {
            args.push("--concurrency", String(options.concurrency));
          }
        }
        const result = await runCommand(process.execPath, args, {
          allowNonZeroExit: true,
        });
        process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      },
    );

  const speech = veronica.command("speech").description("Run the canonical staged narration pipeline for Veronica episodes");
  for (const entry of [
    { name: "plan", stage: "plan", validationOnly: false },
    { name: "generate", stage: "validate", validationOnly: false },
    { name: "validate", stage: "validate", validationOnly: true },
    { name: "status", stage: "status", validationOnly: false },
  ] as const) {
    speech
      .command(entry.name)
      .requiredOption("--workspace <path>", "Episode workspace root")
      .requiredOption("--episode-id <id>", "Episode identifier")
      .option("--language <code>", "Narration language", "it")
      .option("--languages <codes>", "Comma-separated narration languages")
      .option("--variant <full|short>", "Narration variant", "full")
      .option("--all-languages", "Process all available script languages", false)
      .option("--all-variants", "Process full and short variants", false)
      .option("--concurrency <number>", "Bounded narration chunk concurrency", (value) => parsePositiveInteger(value, "--concurrency"))
      .option("--resume", "Reuse valid narration artifacts", false)
      .option("--dry-run", "Plan speech work without provider dispatch", false)
      .option("--strict", "Treat warnings as a non-zero result", false)
      .option("--json", "Emit machine-readable output", false)
      .action(
        async (options: {
          workspace: string;
          episodeId: string;
          language: VeronicaLanguage;
          languages?: string;
          variant: VeronicaVariant;
          allLanguages: boolean;
          allVariants: boolean;
          concurrency?: number;
          resume: boolean;
          dryRun: boolean;
          strict: boolean;
          json: boolean;
        }) => {
          const args = [
            mediaforgeBinPath,
            "--workspace",
            path.resolve(options.workspace),
            ...(options.json ? ["--json"] : []),
            "audio",
            "narration",
            entry.stage,
            "--episode",
            options.episodeId,
            "--language",
            options.language,
            "--variant",
            options.variant,
            ...(options.languages ? ["--languages", options.languages] : []),
            ...(options.allLanguages ? ["--all-languages"] : []),
            ...(options.allVariants ? ["--all-variants"] : []),
            ...(options.concurrency !== undefined ? ["--concurrency", String(options.concurrency)] : []),
            ...(options.resume ? ["--resume"] : []),
            ...(options.dryRun ? ["--dry-run"] : []),
            ...(options.strict ? ["--strict"] : []),
            ...(entry.validationOnly ? ["--validation-only"] : []),
          ];
          const result = await runCommand(process.execPath, args, {
            allowNonZeroExit: true,
          });
          process.stdout.write(result.stdout);
          if (result.stderr) process.stderr.write(result.stderr);
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
        },
      );
  }

  veronica
    .command("pilot")
    .description("Run the deterministic Veronica supplemental-media pilot fixture")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .option("--episode-id <id>", "Episode identifier", "episode-pilot")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; json: boolean }) => {
      const fixtures = createVeronicaPilotFixtures();
      const result = await runVeronicaSupplementalMediaPipeline({
        workspaceRoot: path.resolve(options.workspace),
        episodeId: options.episodeId,
        originalNarration: fixtures.narration.original,
        revisedNarration: fixtures.narration.revised,
        targetLanguage: "it",
        sourceLanguage: "it",
        supplementalFiles: fixtures.files,
        alignedSegments: fixtures.alignedSegments,
      });
      emitResult(options, result);
    });

  veronica
    .command("run")
    .description("Run supplemental media planning for a strategic-reinvention episode")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--narration <path>", "Optional narration script path override")
    .option("--supplemental-dir <path>", "Optional supplemental media directory override")
    .option("--no-resume", "Disable resume from cached pipeline state")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; narration?: string; supplementalDir?: string; resume: boolean; json: boolean }) => {
      const result = await runStrategicSupplementalMediaBridge({
        workspaceRoot: path.resolve(options.workspace),
        episodeId: options.episodeId,
        resume: options.resume,
        ...(options.narration ? { narrationPath: options.narration } : {}),
        ...(options.supplementalDir ? { supplementalDir: options.supplementalDir } : {}),
      });
      emitResult(
        {
          workspace: options.workspace,
          episodeId: options.episodeId,
          json: options.json,
        },
        result,
      );
    });

  veronica
    .command("plan-positioning-series")
    .description("Create canonical locale-independent visual plans for a Veronica positioning narration pack")
    .requiredOption("--pack <path>", "Extracted optimized positioning-series content pack")
    .requiredOption("--output <path>", "Visual-plan review output directory")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { pack: string; output: string; json: boolean }) => {
      const result = await generatePositioningVisualPlans({
        packDir: path.resolve(options.pack),
        outputDir: path.resolve(options.output),
      });
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(`Generated ${result.contentIds.length} canonical positioning visual plans.\nBulk review: ${result.reviewPackPath}\n`);
    });

  veronica
    .command("plan-positioning-calibration")
    .description("Create provider-free plan and prompt previews for selected Veronica content IDs")
    .requiredOption("--pack <path>", "Extracted optimized positioning-series content pack")
    .requiredOption("--output <path>", "Calibration output directory")
    .requiredOption("--content-id <id...>", "Long-form parent and/or Short content IDs to refresh")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { pack: string; output: string; contentId: string[]; json: boolean }) => {
      const result = await generatePositioningVisualPlanCalibration({
        packDir: path.resolve(options.pack),
        outputDir: path.resolve(options.output),
        contentIds: options.contentId,
      });
      process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `Generated ${result.contentIds.length} provider-free calibration plans.\nPrompt previews: ${result.previewPath}\n`);
    });

  veronica
    .command("review-pack")
    .description("Generate per-episode and bulk Veronica approval review packs")
    .requiredOption("--workspace <path>", "Episode workspace root containing veronica-benini episodes")
    .option("--bulk-dir <path>", "Bulk aggregate output directory")
    .option("--content-matrix <path>", "Discovery content-matrix.csv used to scaffold missing episodes")
    .option("--scaffold-missing", "Scaffold episodes from the content matrix when absent", false)
    .option("--no-resume", "Disable resume from cached pipeline state")
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; bulkDir?: string; contentMatrix?: string; scaffoldMissing: boolean; resume: boolean; json: boolean }) => {
      const workspaceRoot = path.resolve(options.workspace);
      const bulkOutputDir = options.bulkDir ?? path.join(workspaceRoot, "approval-packs");
      const result = await generateVeronicaBeniniReviewPacks({
        workspaceRoot,
        bulkOutputDir,
        scaffoldMissing: options.scaffoldMissing,
        resume: options.resume,
        ...(options.contentMatrix ? { contentMatrixPath: path.resolve(options.contentMatrix) } : {}),
      });
      const payload = {
        episodeCount: result.episodes.length,
        workspaceRoot: result.workspaceRoot,
        bulkOutputDir: result.bulk.outputDir,
        aggregateReviewPath: result.bulk.aggregateReviewPath,
        findingsPath: result.bulk.findingsPath,
        episodes: result.episodes,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        [`Generated ${payload.episodeCount} Veronica review packs.`, `Workspace: ${payload.workspaceRoot}`, `Bulk review: ${payload.aggregateReviewPath}`, `Findings: ${payload.findingsPath}`].join(
          "\n",
        ) + "\n",
      );
    });

  veronica
    .command("validate")
    .description("Validate an existing Veronica media plan artifact")
    .requiredOption("--plan <path>", "Path to veronica-media-plan.json")
    .action(async (options: { plan: string }) => {
      const raw = JSON.parse(await fs.readFile(path.resolve(options.plan), "utf8")) as unknown;
      veronicaMediaPlanSchema.parse(raw);
      process.stdout.write(`Valid plan: ${options.plan}\n`);
    });

  veronica
    .command("render")
    .description("Compile or execute FFmpeg renders for cached Veronica manifests")
    .requiredOption("--workspace <path>", "Episode workspace root")
    .requiredOption("--episode-id <id>", "Episode identifier")
    .option("--aspect <16:9|9:16>", "Aspect ratio to render", "16:9")
    .option("--execute", "Execute FFmpeg on the host (default is compile-only)", false)
    .option("--json", "Emit machine-readable output", false)
    .action(async (options: { workspace: string; episodeId: string; aspect: "16:9" | "9:16"; execute: boolean; json: boolean }) => {
      const stateDir = veronicaEpisodeStateDir(path.resolve(options.workspace), options.episodeId);
      const cached = await loadVeronicaPipelineResult({
        stateDir,
        episodeId: options.episodeId,
        targetLanguage: "it",
      });
      if (!cached) {
        throw new Error(`No cached Veronica pipeline state found under ${stateDir}. Run veronica-media run first.`);
      }
      const manifestPath = path.join(stateDir, "renders", options.aspect === "16:9" ? "landscape-manifest.json" : "portrait-manifest.json");
      const manifest = veronicaRenderManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown);
      const result = executeVeronicaRender({
        manifest,
        execute: options.execute,
      });
      const payload = {
        episodeId: options.episodeId,
        aspect: options.aspect,
        executed: result.executed,
        outputPath: result.outputPath,
        commandCount: result.commands.length,
        skippedReason: result.skippedReason ?? null,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        [
          `Veronica render ${result.executed ? "executed" : "compiled"} for ${options.episodeId}.`,
          `Aspect: ${options.aspect}`,
          `Output: ${result.outputPath}`,
          `Commands: ${result.commands.length}`,
          result.skippedReason ? `Note: ${result.skippedReason}` : "",
        ]
          .filter(Boolean)
          .join("\n") + "\n",
      );
    });
}

function emitResult(options: { workspace: string; episodeId: string; json: boolean }, result: Awaited<ReturnType<typeof runVeronicaSupplementalMediaPipeline>>): void {
  const payload = {
    episodeId: options.episodeId,
    stateDir: veronicaEpisodeStateDir(path.resolve(options.workspace), options.episodeId),
    planPath: path.join(veronicaEpisodeStateDir(path.resolve(options.workspace), options.episodeId), "veronica-media-plan.json"),
    approvalPackDir: result.approvalPackDir,
    renderEligible: result.plan.approvalEligibility.renderEligible,
    landscapeClips: result.landscapeManifest.clips.length,
    portraitClips: result.portraitManifest.clips.length,
    contentHash: result.plan.contentHash,
    resumed: result.resumed ?? false,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Veronica supplemental media completed for ${options.episodeId}.`,
      `Plan: ${payload.planPath}`,
      `Approval pack: ${payload.approvalPackDir}`,
      `Render eligible: ${payload.renderEligible}`,
      `Resumed: ${payload.resumed}`,
      `Landscape clips: ${payload.landscapeClips}`,
      `Portrait clips: ${payload.portraitClips}`,
    ].join("\n") + "\n",
  );
}
