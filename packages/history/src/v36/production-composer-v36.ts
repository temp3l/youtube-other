import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "@mediaforge/shared";

import type { HistoryVisualPlanV35 } from "../history-v35-contracts.js";
import {
  compileHistoryRenderDerivativeV35,
  syncHistoryProductionArtifactsV35,
  type HistoryRenderDerivativeV35,
} from "../history-render-adapter-v35.js";
import { validateHistoryVisualPlanV35 } from "../visual-planner-v35.js";
import { admitProofAwarePolicyResponseV36 } from "./proof-aware-policy-response-admission-v36.js";
import { canonicalGeographyByEntityIdV36 } from "./canonical-geography-sidecar-v36.js";
import {
  compileHistoryShadowArtifactV36,
} from "./compiler-shadow-v36.js";
import type {
  CompilerIntentV36,
  CompilerSourceProvenanceV36,
} from "./compiler-shadow-contract-v36.js";
import type { ExplanatoryRelationV36 } from "./explanatory-relation-v36.js";
import {
  representativeNativeEpisodeFragmentsV36,
} from "./native-structured-claim-fixtures-v36.js";
import {
  runRepresentativeNativeStructuredClaimExperimentV36,
} from "./native-structured-claim-experiment-v36.js";
import {
  resolveHistoryProductionRouteV36,
  type HistoryProductionRouteDecisionV36,
} from "./production-canary-route-v36.js";
import {
  runRepresentativeShadowExtractionV36,
  type RepresentativeShadowExtractionResultV36,
  type RepresentativeShadowSourceV36,
} from "./representative-shadow-extraction-v36.js";
import {
  adaptCompilerIntentToRenderSpecV36,
} from "./renderer-shadow-v36.js";
import {
  HISTORY_RENDERER_SHADOW_SCHEMA_V36,
  HISTORY_RENDERER_SHADOW_VERSION_V36,
  type RenderSpecV36,
  type ResolvedGeographyV36,
} from "./renderer-shadow-contract-v36.js";
import {
  buildHistoryVisualPlanShadowV36,
  validateHistoryVisualPlanShadowV36,
  type HistoryVisualPlanShadowV36,
} from "./visual-plan-shadow-v36.js";

export const HISTORY_PRODUCTION_COMPOSER_SCHEMA_V36 =
  "history-production-composer.v1" as const;
export const HISTORY_PRODUCTION_COMPOSER_VERSION_V36 =
  "history-production-composer.v3.6.0" as const;
export const HISTORY_PRODUCTION_PLAN_PATH_V36 =
  "source/history-v3.6/production-plan.json" as const;

export type HistoryProductionComposerErrorCodeV36 =
  | "TIMING_MEASUREMENT_REQUIRED"
  | "TIMING_OUTSIDE_ALLOWED_RANGE"
  | "V36_BASE_PLAN_INVALID"
  | "V36_INPUT_HASH_INCOMPATIBLE"
  | "V36_REQUIRED_ARTIFACT_INVALID"
  | "V36_COMPILER_ABSTENTION"
  | "V36_RENDERER_ABSTENTION"
  | "V36_VISUAL_PLAN_INVALID"
  | "V36_SAFE_PLACEMENT_REQUIRED";

export class HistoryProductionComposerErrorV36 extends Error {
  constructor(
    readonly code: HistoryProductionComposerErrorCodeV36,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "HistoryProductionComposerErrorV36";
  }
}

export interface HistoryProductionPlanV36 {
  readonly schemaVersion: typeof HISTORY_PRODUCTION_COMPOSER_SCHEMA_V36;
  readonly composerVersion: typeof HISTORY_PRODUCTION_COMPOSER_VERSION_V36;
  readonly episodeId: string;
  readonly route: "V3_6_PRODUCTION";
  readonly routing: HistoryProductionRouteDecisionV36;
  readonly inputVersions: {
    readonly basePlanSchemaVersion: HistoryVisualPlanV35["schemaVersion"];
    readonly basePlannerVersion: HistoryVisualPlanV35["plannerVersion"];
    readonly rendererSchemaVersion: typeof HISTORY_RENDERER_SHADOW_SCHEMA_V36;
    readonly rendererVersion: typeof HISTORY_RENDERER_SHADOW_VERSION_V36;
  };
  readonly inputHashes: {
    readonly basePlanHash: string;
    readonly trustSnapshotHash: string;
    readonly narrationHash: string;
    readonly measuredAudioHash: string;
  };
  readonly timing: {
    readonly source: "measured-tts" | "measured-final-audio";
    readonly totalDurationMs: number;
    readonly minimumDurationMs: 300000;
  };
  readonly baseDerivative: HistoryRenderDerivativeV35;
  readonly visualPlan: HistoryVisualPlanShadowV36;
  readonly invariants: {
    readonly semanticFallbacks: 0;
    readonly baseVisualReplacements: 0;
    readonly duplicatePlacements: 0;
    readonly orphanRenderSpecs: 0;
  };
  readonly productionPlanHash: string;
}

export type HistoryProductionCompositionV36 =
  | {
      readonly route: "V3_5_PRODUCTION";
      readonly routing: HistoryProductionRouteDecisionV36;
      readonly derivative: HistoryRenderDerivativeV35;
    }
  | {
      readonly route: "V3_6_PRODUCTION";
      readonly routing: HistoryProductionRouteDecisionV36;
      readonly plan: HistoryProductionPlanV36;
    };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function sourceFromPlan(
  plan: HistoryVisualPlanV35
): RepresentativeShadowSourceV36 {
  return {
    episodeId: plan.episodeId,
    claims: plan.claims,
    entities: plan.entities,
    places: plan.places,
  };
}

function isRepresentativeEpisode(episodeId: string): boolean {
  return representativeNativeEpisodeFragmentsV36.some((fragment) =>
    episodeId.includes(fragment)
  );
}

function acceptedExtraction(
  plan: HistoryVisualPlanV35
): RepresentativeShadowExtractionResultV36 {
  const shadow = sourceFromPlan(plan);
  if (!isRepresentativeEpisode(plan.episodeId))
    return runRepresentativeShadowExtractionV36(shadow);
  const experiment = runRepresentativeNativeStructuredClaimExperimentV36([
    {
      shadow,
      native: {
        episodeId: plan.episodeId,
        claims: plan.claims,
        entities: plan.entities,
      },
    },
  ]);
  const run = experiment.runs[0];
  if (!run)
    throw new HistoryProductionComposerErrorV36(
      "V36_REQUIRED_ARTIFACT_INVALID",
      `No accepted V3.6 extraction was produced for ${plan.episodeId}.`
    );
  return run.native;
}

function compilerSourceProvenance(
  extraction: RepresentativeShadowExtractionResultV36,
  relation: ExplanatoryRelationV36
): CompilerSourceProvenanceV36 {
  const candidates = extraction.candidates.filter(
    (candidate) => candidate.semanticRelationId === relation.id
  );
  const admission =
    relation.kind === "policy-response"
      ? admitProofAwarePolicyResponseV36(extraction)
      : undefined;
  const proof =
    admission?.status === "admitted" &&
    admission.value.relation.id === relation.id
      ? {
          proofEvidenceId: admission.value.proofEvidence.evidenceId,
          proofId: admission.value.proofEvidence.proofId,
          proofEvidenceFingerprint:
            admission.value.proofEvidence.proofEvidenceFingerprint,
          premises: admission.value.proofEvidence.premises.map((premise) => ({
            premiseId: premise.premiseId,
            claimId: premise.claimId,
            structuredPropositionId: premise.structuredPropositionId,
            atomicGroundingId: premise.atomicGroundingId,
            assertionStatus: premise.assertionStatus,
          })),
        }
      : undefined;
  return {
    structuredPropositionIds: candidates.flatMap(
      (candidate) => candidate.structuredPropositionIds ?? []
    ),
    atomicGroundingIds: candidates.flatMap(
      (candidate) => candidate.atomicGroundingIds ?? []
    ),
    ...(proof ? { proof } : {}),
  };
}

const normalized = (value: string): string =>
  value.trim().toLocaleLowerCase();

function geographyForIntent(
  intent: CompilerIntentV36,
  plan: HistoryVisualPlanV35
): readonly ResolvedGeographyV36[] {
  if (intent.disposition !== "MAP") return [];
  const refs =
    intent.relationKind === "movement"
      ? [intent.from, ...intent.via, intent.to]
      : intent.relationKind === "spatial-comparison"
        ? intent.places
        : intent.relationKind === "spatial-area"
          ? [intent.place]
          : [intent.location];
  return refs.flatMap<ResolvedGeographyV36>((ref) => {
    const sidecar = canonicalGeographyByEntityIdV36(ref.entityId);
    if (sidecar)
      return [
        {
          entityId: ref.entityId,
          canonicalLabel: ref.canonicalLabel,
          latitude: sidecar.renderAnchor.latitude,
          longitude: sidecar.renderAnchor.longitude,
          geometrySource: sidecar.provenance.source,
          placeKind: sidecar.placeKind,
          renderAnchorPresentationOnly: sidecar.renderAnchor.presentationOnly,
        },
      ];
    const matches = plan.places.filter(
      (place) =>
        [place.label, ...place.aliases].some(
          (label) => normalized(label) === normalized(ref.canonicalLabel)
        ) && place.coordinates
    );
    if (matches.length !== 1) return [];
    const place = matches[0]!;
    return [
      {
        entityId: ref.entityId,
        canonicalLabel: ref.canonicalLabel,
        latitude: place.coordinates!.latitude,
        longitude: place.coordinates!.longitude,
        geometrySource: place.geometrySource,
        placeKind: "point" as const,
        renderAnchorPresentationOnly: false,
      },
    ];
  });
}

export function buildHistoryProductionRenderSpecsV36(
  plan: HistoryVisualPlanV35
): readonly RenderSpecV36[] {
  const extraction = acceptedExtraction(plan);
  const compiled = compileHistoryShadowArtifactV36({
    episodeId: plan.episodeId,
    relations: extraction.extraction.relations.map((relation) => ({
      relation,
      provenance: compilerSourceProvenance(extraction, relation),
    })),
  });
  const compilerAbstentions = compiled.intents.filter(
    (intent) => intent.disposition === "NO_SAFE_COMPILATION"
  );
  if (compilerAbstentions.length > 0)
    throw new HistoryProductionComposerErrorV36(
      "V36_COMPILER_ABSTENTION",
      `${compilerAbstentions.length} accepted relation(s) could not compile.`
    );
  const rendered = compiled.intents.map((intent) =>
    adaptCompilerIntentToRenderSpecV36({
      intent,
      geography: geographyForIntent(intent, plan),
    })
  );
  const rendererAbstentions = rendered.filter(
    (result) => result.disposition === "NO_SAFE_RENDERING"
  );
  if (rendererAbstentions.length > 0)
    throw new HistoryProductionComposerErrorV36(
      "V36_RENDERER_ABSTENTION",
      `${rendererAbstentions.length} accepted compiler intent(s) could not render.`
    );
  const renderSpecs = rendered as readonly RenderSpecV36[];
  if (renderSpecs.length === 0)
    throw new HistoryProductionComposerErrorV36(
      "V36_REQUIRED_ARTIFACT_INVALID",
      "The accepted V3.6 pipeline produced no render specifications."
    );
  return renderSpecs;
}

function assertProductionPrerequisites(plan: HistoryVisualPlanV35): void {
  try {
    validateHistoryVisualPlanV35(plan);
  } catch (error) {
    throw new HistoryProductionComposerErrorV36(
      "V36_BASE_PLAN_INVALID",
      error instanceof Error ? error.message : "V3.5 base plan validation failed."
    );
  }
  if (plan.timing.timingSource === "provisional-text-estimate")
    throw new HistoryProductionComposerErrorV36(
      "TIMING_MEASUREMENT_REQUIRED",
      "V3.6 production requires measured TTS or measured final-audio timing."
    );
  if (!plan.timing.measuredAudioSha256)
    throw new HistoryProductionComposerErrorV36(
      "V36_INPUT_HASH_INCOMPATIBLE",
      "Measured timing is missing its audio SHA-256 binding."
    );
  if (
    plan.timing.totalDurationMs < 300_000 ||
    !plan.timing.withinAllowedRange ||
    plan.timing.aboveHardMaximum
  )
    throw new HistoryProductionComposerErrorV36(
      "TIMING_OUTSIDE_ALLOWED_RANGE",
      `Measured duration ${plan.timing.totalDurationMs}ms is outside the production range.`
    );
  const blockers = plan.approval.production.blockerCodes;
  if (blockers.length > 0)
    throw new HistoryProductionComposerErrorV36(
      blockers.includes("TIMING_MEASUREMENT_REQUIRED")
        ? "TIMING_MEASUREMENT_REQUIRED"
        : "V36_REQUIRED_ARTIFACT_INVALID",
      `V3.6 production prerequisites are blocked: ${blockers.join(", ")}.`
    );
}

export function composeHistoryProductionPlanV36(input: {
  readonly basePlan: HistoryVisualPlanV35;
  readonly routing: HistoryProductionRouteDecisionV36;
  readonly renderSpecs?: readonly RenderSpecV36[];
}): HistoryProductionPlanV36 {
  const { basePlan, routing } = input;
  if (
    routing.route !== "V3_6_PRODUCTION" ||
    routing.episodeId !== basePlan.episodeId
  )
    throw new HistoryProductionComposerErrorV36(
      "V36_INPUT_HASH_INCOMPATIBLE",
      "The V3.6 composer route and base-plan episode do not match."
    );
  assertProductionPrerequisites(basePlan);
  const renderSpecs = input.renderSpecs ?? buildHistoryProductionRenderSpecsV36(basePlan);
  if (
    renderSpecs.some(
      (spec) =>
        spec.episodeId !== basePlan.episodeId ||
        spec.schemaVersion !== HISTORY_RENDERER_SHADOW_SCHEMA_V36 ||
        spec.rendererVersion !== HISTORY_RENDERER_SHADOW_VERSION_V36
    )
  )
    throw new HistoryProductionComposerErrorV36(
      "V36_INPUT_HASH_INCOMPATIBLE",
      "A render specification has an incompatible episode or contract version."
    );
  const claimIds = new Set(basePlan.claims.map((claim) => claim.id));
  if (
    renderSpecs.some((spec) =>
      spec.provenance.supportClaimIds.some((claimId) => !claimIds.has(claimId))
    )
  )
    throw new HistoryProductionComposerErrorV36(
      "V36_INPUT_HASH_INCOMPATIBLE",
      "A render specification references a claim outside the hashed base plan."
    );
  const visualPlan = buildHistoryVisualPlanShadowV36({
    basePlan,
    renderSpecs,
  });
  const validation = validateHistoryVisualPlanShadowV36(visualPlan, basePlan);
  if (!validation.valid)
    throw new HistoryProductionComposerErrorV36(
      "V36_VISUAL_PLAN_INVALID",
      validation.errors.join(", ")
    );
  if (visualPlan.safePlacementAbstentions.length > 0)
    throw new HistoryProductionComposerErrorV36(
      "V36_SAFE_PLACEMENT_REQUIRED",
      `${visualPlan.safePlacementAbstentions.length} render specification(s) have no exact placement.`
    );
  const baseDerivative = compileHistoryRenderDerivativeV35(basePlan);
  const withoutHash: Omit<HistoryProductionPlanV36, "productionPlanHash"> = {
    schemaVersion: HISTORY_PRODUCTION_COMPOSER_SCHEMA_V36,
    composerVersion: HISTORY_PRODUCTION_COMPOSER_VERSION_V36,
    episodeId: basePlan.episodeId,
    route: "V3_6_PRODUCTION",
    routing,
    inputVersions: {
      basePlanSchemaVersion: basePlan.schemaVersion,
      basePlannerVersion: basePlan.plannerVersion,
      rendererSchemaVersion: HISTORY_RENDERER_SHADOW_SCHEMA_V36,
      rendererVersion: HISTORY_RENDERER_SHADOW_VERSION_V36,
    },
    inputHashes: {
      basePlanHash: basePlan.planHash,
      trustSnapshotHash: basePlan.trustSnapshotHash,
      narrationHash: basePlan.narration.normalizedTextSha256,
      measuredAudioHash: basePlan.timing.measuredAudioSha256!,
    },
    timing: {
      source: basePlan.timing.timingSource as
        | "measured-tts"
        | "measured-final-audio",
      totalDurationMs: basePlan.timing.totalDurationMs,
      minimumDurationMs: 300_000,
    },
    baseDerivative,
    visualPlan,
    invariants: {
      semanticFallbacks: 0,
      baseVisualReplacements: 0,
      duplicatePlacements: 0,
      orphanRenderSpecs: 0,
    },
  };
  return { ...withoutHash, productionPlanHash: hash(withoutHash) };
}

export function composeHistoryProductionArtifactsV36(input: {
  readonly basePlan: HistoryVisualPlanV35;
  readonly activationFlagValue?: string;
  readonly canaryEpisodesValue?: string;
  readonly renderSpecs?: readonly RenderSpecV36[];
}): HistoryProductionCompositionV36 {
  const routing = resolveHistoryProductionRouteV36({
    episodeId: input.basePlan.episodeId,
    ...(input.activationFlagValue
      ? { activationFlagValue: input.activationFlagValue }
      : {}),
    ...(input.canaryEpisodesValue
      ? { canaryEpisodesValue: input.canaryEpisodesValue }
      : {}),
  });
  if (routing.route === "V3_5_PRODUCTION")
    return {
      route: routing.route,
      routing,
      derivative: compileHistoryRenderDerivativeV35(input.basePlan),
    };
  return {
    route: routing.route,
    routing,
    plan: composeHistoryProductionPlanV36({
      basePlan: input.basePlan,
      routing,
      ...(input.renderSpecs ? { renderSpecs: input.renderSpecs } : {}),
    }),
  };
}

async function clearV36ManifestRoute(root: string): Promise<void> {
  const manifestPath = path.join(root, "manifest.json");
  try {
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8")
    ) as Record<string, unknown>;
    const {
      historyProductionComposerV36: _composer,
      historyProductionRouteV36: _route,
      ...withoutV36
    } = manifest;
    await writeJsonAtomic(manifestPath, withoutV36);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function syncHistoryProductionArtifactsRoutedV36(input: {
  readonly root: string;
  readonly plan: HistoryVisualPlanV35;
  readonly activationFlagValue?: string;
  readonly canaryEpisodesValue?: string;
  readonly renderSpecs?: readonly RenderSpecV36[];
}): Promise<HistoryProductionCompositionV36> {
  const composition = composeHistoryProductionArtifactsV36({
    basePlan: input.plan,
    ...(input.activationFlagValue
      ? { activationFlagValue: input.activationFlagValue }
      : {}),
    ...(input.canaryEpisodesValue
      ? { canaryEpisodesValue: input.canaryEpisodesValue }
      : {}),
    ...(input.renderSpecs ? { renderSpecs: input.renderSpecs } : {}),
  });
  await syncHistoryProductionArtifactsV35({ root: input.root, plan: input.plan });
  if (composition.route === "V3_5_PRODUCTION") {
    await clearV36ManifestRoute(input.root);
    return composition;
  }
  const productionPlanPath = path.join(
    input.root,
    HISTORY_PRODUCTION_PLAN_PATH_V36
  );
  await writeJsonAtomic(productionPlanPath, composition.plan);
  const manifestPath = path.join(input.root, "manifest.json");
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  ) as Record<string, unknown>;
  await writeJsonAtomic(manifestPath, {
    ...manifest,
    historyProductionRouteV36: composition.routing,
    historyProductionComposerV36: {
      productionPlanPath: HISTORY_PRODUCTION_PLAN_PATH_V36,
      productionPlanHash: composition.plan.productionPlanHash,
      basePlanHash: composition.plan.inputHashes.basePlanHash,
      visualPlanHash: composition.plan.visualPlan.planHash,
      renderSpecCount: composition.plan.visualPlan.renderSpecs.length,
    },
  });
  return composition;
}
