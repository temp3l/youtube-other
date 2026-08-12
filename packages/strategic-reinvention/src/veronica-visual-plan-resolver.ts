import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  POSITIONING_PLANNER_VERSION,
  type PositioningVisualPlanV2,
} from "./positioning-visual-contracts.js";
import {
  finalizeSemanticPlanHash,
  hasValidSemanticPlanHash,
  stableHash,
} from "./positioning-visual-semantics.js";
import {
  buildVeronicaCanonicalVisualPlan,
} from "./positioning-visual-planner.js";
import {
  CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION,
  canonicalSourcePlannerInputSchema,
  type CanonicalSourcePlannerInput,
} from "./veronica-content-pack-2-ingestion.js";

const productionSceneSchema = z
  .object({
    sceneId: z.string().min(1),
    progressionStage: z.string().min(1),
    narrationAnchor: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    treatment: z
      .object({
        narrativeBeat: z.string().min(1),
        communicationIntent: z.string().min(1),
        subjectRequirement: z.string().min(1),
        environment: z.string().min(1),
        composition: z.string().min(1),
        camera: z.string().min(1),
        lighting: z.string().min(1),
        action: z.string().min(1),
        actionOwnerRole: z.enum(["expert", "buyer", "business-operator", "shared", "none"]).optional(),
        props: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

const productionAssetSchema = z
  .object({
    sceneId: z.string().min(1),
    prompt: z.string().min(1),
    nativeAspectRatio: z.enum(["16:9", "9:16"]),
    textFree: z.literal(true),
    textInGeneratedImage: z.literal(false),
  })
  .passthrough();

export const visualPlanDerivationSchema = z
  .object({
    schemaVersion: z.literal("veronica-visual-plan-derivation.v1"),
    artifactOwnership: z.literal("derived-compatibility-artifact"),
    visualPlanSource: z.literal("derived_from_planner_input"),
    plannerInputSchemaVersion: z.literal(CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION),
    plannerInputHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceRevisionHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceNarrationSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    plannerVersion: z.string().min(1),
    configurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    planRevisionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const positioningProductionPlanSchema = z
  .object({
    schemaVersion: z.literal("veronicabenini-positioning-visual-plan.v2"),
    plannerVersion: z.string().min(1).optional(),
    contentId: z.string().min(1),
    format: z.enum(["long", "short"]),
    aspectRatio: z.enum(["16:9", "9:16"]),
    scenes: z.array(productionSceneSchema).min(1),
    assets: z.array(productionAssetSchema).min(1),
    validation: z.object({ status: z.enum(["pass", "fail"]) }).passthrough(),
    derivation: visualPlanDerivationSchema.optional(),
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .passthrough();

export type PositioningProductionPlan = z.infer<typeof positioningProductionPlanSchema>;

export interface VeronicaCanonicalVisualPlanner {
  execute(input: {
    readonly plannerInput: CanonicalSourcePlannerInput;
    readonly outputDir: string;
  }): Promise<unknown>;
}

export class DeterministicVeronicaCanonicalVisualPlanner implements VeronicaCanonicalVisualPlanner {
  async execute(input: {
    readonly plannerInput: CanonicalSourcePlannerInput;
    readonly outputDir: string;
  }): Promise<PositioningVisualPlanV2> {
    return buildVeronicaCanonicalVisualPlan(input);
  }
}

export type VeronicaVisualPlanResolutionErrorCode =
  | "INVALID_PLANNER_INPUT"
  | "MISSING_PLANNING_INPUT"
  | "MISSING_EXPLICIT_VISUAL_PLAN"
  | "PLANNER_EPISODE_MISMATCH"
  | "PLANNER_SOURCE_REVISION_MISMATCH"
  | "PLANNER_NARRATION_HASH_MISMATCH"
  | "INVALID_VISUAL_PLAN"
  | "STALE_DERIVED_VISUAL_PLAN";

export class VeronicaVisualPlanResolutionError extends Error {
  constructor(
    readonly code: VeronicaVisualPlanResolutionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${code}:${message}`, options);
    this.name = "VeronicaVisualPlanResolutionError";
  }
}

export interface VeronicaVisualPlanResolutionEvidence {
  readonly visualPlanSource: "existing" | "derived_from_planner_input";
  readonly episodeId: string;
  readonly plannerInputHash: string | null;
  readonly plannerVersion: string | null;
  readonly generatedPlanRevisionHash: string;
  readonly reuseReason:
    | "legacy-or-human-authored-plan"
    | "matching-planner-input-hash"
    | "visual-plan-missing"
    | "planner-input-changed"
    | "planner-version-changed"
    | "planner-configuration-changed";
}

export interface ResolveVeronicaVisualPlanResult {
  readonly plan: PositioningProductionPlan;
  readonly planPath: string;
  readonly evidence: VeronicaVisualPlanResolutionEvidence;
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRevisionHash(input: CanonicalSourcePlannerInput): string {
  return sha256(JSON.stringify({
    authoredEpisodeKey: input.sourceEpisode.authoredEpisodeKey,
    sources: input.sourceEpisode.localeSources.map((source) => ({
      locale: source.locale,
      sourcePath: source.sourcePath,
      sourceSha256: source.sourceSha256,
    })),
  }));
}

function validatePlannerInput(input: CanonicalSourcePlannerInput, episodeId: string): void {
  if (input.sourceEpisode.episodeId !== episodeId) {
    throw new VeronicaVisualPlanResolutionError(
      "PLANNER_EPISODE_MISMATCH",
      `planner input ${input.sourceEpisode.episodeId} does not match workspace ${episodeId}`,
    );
  }
  const selectedSource = input.sourceEpisode.localeSources.find(
    (source) => source.locale === input.locale,
  );
  if (!selectedSource || selectedSource.sourceSha256 !== input.narration.sourceSha256) {
    throw new VeronicaVisualPlanResolutionError(
      "PLANNER_SOURCE_REVISION_MISMATCH",
      `locale ${input.locale} does not match the canonical source descriptor`,
    );
  }
  if (sourceRevisionHash(input) !== input.sourceEpisode.sourceRevisionHash) {
    throw new VeronicaVisualPlanResolutionError(
      "PLANNER_SOURCE_REVISION_MISMATCH",
      "canonical source revision hash is stale",
    );
  }
  if (sha256(input.narration.narration) !== input.narration.sourceSha256) {
    throw new VeronicaVisualPlanResolutionError(
      "PLANNER_NARRATION_HASH_MISMATCH",
      "narration bytes do not match source SHA-256",
    );
  }
}

async function readPlannerInput(plannerInputPath: string, episodeId: string): Promise<{
  readonly input: CanonicalSourcePlannerInput;
  readonly hash: string;
}> {
  try {
    const input = canonicalSourcePlannerInputSchema.parse(
      parseJson(await fs.readFile(plannerInputPath, "utf8")),
    );
    validatePlannerInput(input, episodeId);
    return { input, hash: stableHash(input) };
  } catch (error) {
    if (error instanceof VeronicaVisualPlanResolutionError) throw error;
    throw new VeronicaVisualPlanResolutionError(
      "INVALID_PLANNER_INPUT",
      `cannot consume ${plannerInputPath}`,
      { cause: error },
    );
  }
}

function parseVisualPlan(value: unknown, episodeId: string): PositioningProductionPlan {
  try {
    return positioningProductionPlanSchema.parse(value);
  } catch (error) {
    if (error instanceof VeronicaVisualPlanResolutionError) throw error;
    throw new VeronicaVisualPlanResolutionError(
      "INVALID_VISUAL_PLAN",
      `visual plan for ${episodeId} failed runtime validation`,
      { cause: error },
    );
  }
}

function hasValidDerivedPlanHash(plan: PositioningProductionPlan): boolean {
  return hasValidSemanticPlanHash(plan);
}

export async function resolveVeronicaVisualPlan(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly planPath?: string;
  readonly plannerInputPath?: string;
  readonly planner?: VeronicaCanonicalVisualPlanner;
}): Promise<ResolveVeronicaVisualPlanResult> {
  const episodeDir = path.resolve(input.episodeDir);
  const planPath = path.resolve(input.planPath ?? path.join(episodeDir, "source", "visual-plan.json"));
  const plannerInputPath = path.resolve(
    input.plannerInputPath ?? path.join(episodeDir, "source", "visual-planner-input.v1.json"),
  );
  const planExists = await fileExists(planPath);
  if (input.planPath && !planExists) {
    throw new VeronicaVisualPlanResolutionError(
      "MISSING_EXPLICIT_VISUAL_PLAN",
      `explicit visual plan does not exist: ${planPath}`,
    );
  }

  let existingPlan: PositioningProductionPlan | null = null;
  if (planExists) {
    existingPlan = parseVisualPlan(parseJson(await fs.readFile(planPath, "utf8")), input.episodeId);
    if (!existingPlan.derivation) {
      return {
        plan: existingPlan,
        planPath,
        evidence: {
          visualPlanSource: "existing",
          episodeId: input.episodeId,
          plannerInputHash: null,
          plannerVersion: existingPlan.plannerVersion ?? null,
          generatedPlanRevisionHash: existingPlan.planHash,
          reuseReason: "legacy-or-human-authored-plan",
        },
      };
    }
    if (existingPlan.contentId !== input.episodeId) {
      throw new VeronicaVisualPlanResolutionError(
        "PLANNER_EPISODE_MISMATCH",
        `derived visual plan ${existingPlan.contentId} does not match workspace ${input.episodeId}`,
      );
    }
  }

  if (!(await fileExists(plannerInputPath))) {
    throw new VeronicaVisualPlanResolutionError(
      existingPlan ? "STALE_DERIVED_VISUAL_PLAN" : "MISSING_PLANNING_INPUT",
      `no canonical planner input is available for ${input.episodeId}`,
    );
  }
  const plannerInput = await readPlannerInput(plannerInputPath, input.episodeId);
  const currentConfigurationHash = stableHash(plannerInput.input.planningConfiguration);
  if (
    existingPlan?.derivation &&
    existingPlan.derivation.plannerInputHash === plannerInput.hash &&
    existingPlan.derivation.sourceRevisionHash === plannerInput.input.sourceEpisode.sourceRevisionHash &&
    existingPlan.derivation.plannerVersion === POSITIONING_PLANNER_VERSION &&
    existingPlan.derivation.configurationHash === currentConfigurationHash &&
    hasValidDerivedPlanHash(existingPlan)
  ) {
    return {
      plan: existingPlan,
      planPath,
      evidence: {
        visualPlanSource: "existing",
        episodeId: input.episodeId,
        plannerInputHash: plannerInput.hash,
        plannerVersion: existingPlan.derivation.plannerVersion,
        generatedPlanRevisionHash: existingPlan.derivation.planRevisionHash,
        reuseReason: "matching-planner-input-hash",
      },
    };
  }

  const planner = input.planner ?? new DeterministicVeronicaCanonicalVisualPlanner();
  const generated = parseVisualPlan(
    await planner.execute({
      plannerInput: plannerInput.input,
      outputDir: path.join(episodeDir, "source", "visual-planning"),
    }),
    input.episodeId,
  );
  if (generated.contentId !== input.episodeId) {
    throw new VeronicaVisualPlanResolutionError(
      "PLANNER_EPISODE_MISMATCH",
      `generated visual plan ${generated.contentId} does not match workspace ${input.episodeId}`,
    );
  }
  const expectedAspectRatio = plannerInput.input.sourceEpisode.format === "short" ? "9:16" : "16:9";
  if (
    generated.format !== plannerInput.input.sourceEpisode.format ||
    generated.aspectRatio !== expectedAspectRatio
  ) {
    throw new VeronicaVisualPlanResolutionError(
      "INVALID_VISUAL_PLAN",
      `canonical source planner must produce a ${expectedAspectRatio} ${plannerInput.input.sourceEpisode.format} plan`,
    );
  }
  const configurationHash = currentConfigurationHash;
  const planRevisionHash = stableHash({
    plannerInputHash: plannerInput.hash,
    sourceRevisionHash: plannerInput.input.sourceEpisode.sourceRevisionHash,
    plannerVersion: POSITIONING_PLANNER_VERSION,
    configurationHash,
    plannerResultHash: generated.planHash,
  });
  const derivation = visualPlanDerivationSchema.parse({
    schemaVersion: "veronica-visual-plan-derivation.v1",
    artifactOwnership: "derived-compatibility-artifact",
    visualPlanSource: "derived_from_planner_input",
    plannerInputSchemaVersion: CANONICAL_SOURCE_PLANNER_INPUT_SCHEMA_VERSION,
    plannerInputHash: plannerInput.hash,
    sourceRevisionHash: plannerInput.input.sourceEpisode.sourceRevisionHash,
    sourceNarrationSha256: plannerInput.input.narration.sourceSha256,
    plannerVersion: POSITIONING_PLANNER_VERSION,
    configurationHash,
    planRevisionHash,
  });
  const { planHash: _plannerResultHash, ...generatedWithoutPlanHash } = generated;
  const derivedWithoutPlanHash = { ...generatedWithoutPlanHash, derivation };
  const derived = positioningProductionPlanSchema.parse(finalizeSemanticPlanHash({
    ...derivedWithoutPlanHash,
    planHash: generated.planHash,
  }));
  await writeJsonAtomic(planPath, derived);
  return {
    plan: derived,
    planPath,
    evidence: {
      visualPlanSource: "derived_from_planner_input",
      episodeId: input.episodeId,
      plannerInputHash: plannerInput.hash,
      plannerVersion: POSITIONING_PLANNER_VERSION,
      generatedPlanRevisionHash: planRevisionHash,
      reuseReason: existingPlan
        ? existingPlan.derivation?.plannerVersion !== POSITIONING_PLANNER_VERSION
          ? "planner-version-changed"
          : existingPlan.derivation?.configurationHash !== currentConfigurationHash
            ? "planner-configuration-changed"
            : "planner-input-changed"
        : "visual-plan-missing",
    },
  };
}
