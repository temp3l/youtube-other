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
  assertCanonicalVeronicaProductionSource,
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
  | "MALFORMED_UNTRUSTED_LEGACY_PLAN"
  | "PROVENANCE_MISMATCH"
  | "STALE_DERIVED_VISUAL_PLAN";

export class VeronicaVisualPlanResolutionError extends Error {
  readonly outcome = "BLOCK" as const;

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
  readonly artifactClassification:
    | "MISSING"
    | "VALID_REUSABLE"
    | "ACCEPTED_IMMUTABLE"
    | "INVALID_NULL_LEGACY"
    | "INVALID_DERIVED_COMPATIBILITY"
    | "STALE_DERIVED"
    | "PROVENANCE_MISMATCH";
  readonly archivedArtifactSha256?: string;
  readonly archivedArtifactPath?: string;
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

type ExistingVisualPlanClassification =
  | { readonly kind: "MISSING" }
  | { readonly kind: "VALID_DERIVED"; readonly plan: PositioningProductionPlan; readonly raw: string }
  | { readonly kind: "ACCEPTED_IMMUTABLE"; readonly plan: PositioningProductionPlan; readonly raw: string }
  | { readonly kind: "INVALID_NULL_LEGACY"; readonly raw: string }
  | { readonly kind: "INVALID_DERIVED_COMPATIBILITY"; readonly raw: string }
  | { readonly kind: "MALFORMED_UNTRUSTED_LEGACY"; readonly raw: string };

function classifyExistingVisualPlan(raw: string | null): ExistingVisualPlanClassification {
  if (raw === null) return { kind: "MISSING" };
  let value: unknown;
  try {
    value = parseJson(raw);
  } catch {
    return { kind: "MALFORMED_UNTRUSTED_LEGACY", raw };
  }
  if (value === null) return { kind: "INVALID_NULL_LEGACY", raw };
  const parsed = positioningProductionPlanSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data.derivation
      ? { kind: "VALID_DERIVED", plan: parsed.data, raw }
      : { kind: "ACCEPTED_IMMUTABLE", plan: parsed.data, raw };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "derivation" in value &&
    typeof value.derivation === "object" &&
    value.derivation !== null &&
    "artifactOwnership" in value.derivation &&
    value.derivation.artifactOwnership === "derived-compatibility-artifact"
  ) {
    return { kind: "INVALID_DERIVED_COMPATIBILITY", raw };
  }
  return { kind: "MALFORMED_UNTRUSTED_LEGACY", raw };
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
  assertCanonicalVeronicaProductionSource(input.sourceEpisode);
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

async function preserveInvalidVisualPlan(input: {
  readonly planPath: string;
  readonly raw: string;
  readonly classification: "INVALID_NULL_LEGACY" | "INVALID_DERIVED_COMPATIBILITY" | "STALE_DERIVED" | "PROVENANCE_MISMATCH";
  readonly replacementIdentity: string;
}): Promise<{ readonly sha256: string; readonly path: string }> {
  const digest = sha256(input.raw);
  const archiveDirectory = path.join(path.dirname(input.planPath), "visual-plan.invalid");
  const archivePath = path.join(archiveDirectory, `${digest}.json`);
  const metadataPath = path.join(archiveDirectory, `${digest}.metadata.json`);
  await fs.mkdir(archiveDirectory, { recursive: true });
  try {
    await fs.writeFile(archivePath, input.raw, { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  if (!(await fileExists(metadataPath))) {
    const metadata = {
      schemaVersion: "veronica-invalid-visual-plan-evidence.v1",
      preservedAt: new Date().toISOString(),
      classification: input.classification,
      originalPath: input.planPath,
      originalSha256: digest,
      replacementIdentity: input.replacementIdentity,
    } as const;
    try {
      await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  return { sha256: digest, path: archivePath };
}

export async function resolveVeronicaVisualPlan(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly planPath?: string;
  readonly plannerInputPath?: string;
  readonly planner?: VeronicaCanonicalVisualPlanner;
  readonly writePlanAtomic?: typeof writeJsonAtomic;
}): Promise<ResolveVeronicaVisualPlanResult> {
  const episodeDir = path.resolve(input.episodeDir);
  const planPath = path.resolve(input.planPath ?? path.join(episodeDir, "source", "visual-plan.json"));
  const plannerInputPath = path.resolve(
    input.plannerInputPath ?? path.join(episodeDir, "source", "visual-planner-input.v1.json"),
  );
  if (!(await fileExists(plannerInputPath))) {
    throw new VeronicaVisualPlanResolutionError(
      "MISSING_PLANNING_INPUT",
      `no canonical planner input is available for ${input.episodeId}`,
    );
  }
  const plannerInput = await readPlannerInput(plannerInputPath, input.episodeId);
  const planExists = await fileExists(planPath);
  if (input.planPath && !planExists) {
    throw new VeronicaVisualPlanResolutionError(
      "MISSING_EXPLICIT_VISUAL_PLAN",
      `explicit visual plan does not exist: ${planPath}`,
    );
  }

  const existingArtifact = classifyExistingVisualPlan(
    planExists ? await fs.readFile(planPath, "utf8") : null,
  );
  if (existingArtifact.kind === "MALFORMED_UNTRUSTED_LEGACY") {
    throw new VeronicaVisualPlanResolutionError(
      "MALFORMED_UNTRUSTED_LEGACY_PLAN",
      `visual plan for ${input.episodeId} is malformed and has no safe derived-artifact authority`,
    );
  }
  let existingPlan: PositioningProductionPlan | null = null;
  if (existingArtifact.kind === "ACCEPTED_IMMUTABLE") {
      existingPlan = existingArtifact.plan;
      return {
        plan: existingPlan,
        planPath,
        evidence: {
          visualPlanSource: "existing",
          episodeId: input.episodeId,
          plannerInputHash: null,
          plannerVersion: existingPlan.plannerVersion ?? null,
          generatedPlanRevisionHash: existingPlan.planHash,
          artifactClassification: "ACCEPTED_IMMUTABLE",
          reuseReason: "legacy-or-human-authored-plan",
        },
      };
  }
  if (existingArtifact.kind === "VALID_DERIVED") {
    existingPlan = existingArtifact.plan;
    if (existingPlan.contentId !== input.episodeId) {
      throw new VeronicaVisualPlanResolutionError(
        "PLANNER_EPISODE_MISMATCH",
        `derived visual plan ${existingPlan.contentId} does not match workspace ${input.episodeId}`,
      );
    }
  }

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
        artifactClassification: "VALID_REUSABLE",
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
  const artifactClassification = existingArtifact.kind === "INVALID_NULL_LEGACY"
    ? "INVALID_NULL_LEGACY"
    : existingArtifact.kind === "INVALID_DERIVED_COMPATIBILITY"
      ? "INVALID_DERIVED_COMPATIBILITY"
      : existingPlan
        ? existingPlan.derivation?.sourceRevisionHash !== plannerInput.input.sourceEpisode.sourceRevisionHash ||
          existingPlan.derivation?.plannerInputHash !== plannerInput.hash
          ? "PROVENANCE_MISMATCH"
          : "STALE_DERIVED"
        : "MISSING";
  const archived = existingArtifact.kind === "INVALID_NULL_LEGACY" ||
    existingArtifact.kind === "INVALID_DERIVED_COMPATIBILITY" ||
    existingArtifact.kind === "VALID_DERIVED"
    ? await preserveInvalidVisualPlan({
        planPath,
        raw: existingArtifact.raw,
        classification: artifactClassification === "MISSING" ? "STALE_DERIVED" : artifactClassification,
        replacementIdentity: planRevisionHash,
      })
    : null;
  await (input.writePlanAtomic ?? writeJsonAtomic)(planPath, derived);
  return {
    plan: derived,
    planPath,
    evidence: {
      visualPlanSource: "derived_from_planner_input",
      episodeId: input.episodeId,
      plannerInputHash: plannerInput.hash,
      plannerVersion: POSITIONING_PLANNER_VERSION,
      generatedPlanRevisionHash: planRevisionHash,
      artifactClassification,
      ...(archived ? {
        archivedArtifactSha256: archived.sha256,
        archivedArtifactPath: archived.path,
      } : {}),
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
