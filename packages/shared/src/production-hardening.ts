import { createHash } from "node:crypto";
import { z } from "zod";

export const PRODUCTION_HARDENING_SCHEMA_VERSION =
  "production-hardening.v1" as const;
export const PRODUCTION_HARDENING_POLICY_VERSION =
  "cross-genre-production-policy.v1" as const;
export const PROVIDER_PROJECTION_VERSION =
  "semantic-actor-provider-projection.v1" as const;
export const DIVERSITY_NORMALIZATION_VERSION =
  "viewer-visible-families.v1" as const;
export const ASSET_REUSE_POLICY_VERSION =
  "semantic-asset-reuse.v1" as const;
export const PRODUCTION_HARDENING_FINGERPRINT_VERSION =
  "production-hardening-fingerprint.v1" as const;

export const productionGenreSchema = z.enum(["history", "dark-truth"]);
export const productionVariantSchema = z.enum(["full", "short"]);
export const stateComplexitySchema = z.enum([
  "SINGLE_STATE",
  "DECISIVE_TRANSITION_MOMENT",
  "MULTI_STATE_REQUIRED",
]);
export const continuityModeSchema = z.enum([
  "persistent-protagonist",
  "persistent-causal-chain",
  "persistent-location",
  "motif-continuity",
  "ensemble-independent",
  "chapter-local-continuity",
  "deliberately-fragmented",
  "hybrid",
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const semanticActorSchema = z
  .object({
    actorId: z.string().min(1),
    role: z.string().min(1),
    identityMode: z.enum(["resolved", "intentionally-unspecified"]),
    entityId: z.string().min(1).optional(),
    canonicalName: z.string().min(1).optional(),
    faction: z.string().min(1).optional(),
    periodKey: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((actor, context) => {
    if (
      actor.identityMode === "intentionally-unspecified" &&
      (actor.entityId || actor.canonicalName)
    ) {
      context.addIssue({
        code: "custom",
        message: "An intentionally unspecified actor cannot carry a resolved identity.",
      });
    }
  });

export const viewerVisibleFamiliesSchema = z
  .object({
    strategy: z.string().min(1),
    environment: z.string().min(1),
    composition: z.string().min(1),
    camera: z.string().min(1),
    interaction: z.string().min(1),
    dominantObject: z.string().min(1),
    motion: z.string().min(1),
    diagram: z.string().min(1),
    motif: z.string().min(1),
    continuityIdentity: z.string().min(1),
  })
  .strict();

const motifContractSchema = z
  .object({
    family: z.string().min(1),
    description: z.string().min(1),
    source: z.string().min(1),
    scope: z.string().min(1),
    intentionalCoverage: z.array(z.string().min(1)),
    reuseLimit: z.number().int().positive().nullable(),
  })
  .strict();

const continuityContractSchema = z
  .object({
    mode: continuityModeSchema,
    identity: z.string().min(1).optional(),
    relation: z.string().min(1),
    intentionalRepetition: z.boolean(),
  })
  .strict();

const diagramRequirementSchema = z
  .object({
    kind: z.enum(["none", "map", "diagram"]),
    stateIds: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "none" && value.stateIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["stateIds"],
        message: "A treatment without a map or diagram cannot retain derived states.",
      });
    }
    if (value.kind !== "none" && value.stateIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["stateIds"],
        message: "An active map or diagram requires at least one state.",
      });
    }
  });

const historyTreatmentExtensionSchema = z
  .object({
    periodKey: z.string().min(1).optional(),
    geographyIds: z.array(z.string().min(1)),
    entityIds: z.array(z.string().min(1)),
    factionIds: z.array(z.string().min(1)),
    materialCultureKey: z.string().min(1).optional(),
    evidenceIds: z.array(z.string().min(1)),
    trustedSemanticsHash: sha256Schema,
  })
  .strict();

const darkTruthTreatmentExtensionSchema = z
  .object({
    storyState: z.string().min(1),
    ambiguityIntentional: z.boolean(),
    atmospherePayoff: z.string().min(1),
    threatIdentity: z.string().min(1).optional(),
  })
  .strict();

export const semanticTreatmentSchema = z
  .object({
    sceneId: z.string().min(1),
    semanticPurpose: z.string().min(1),
    visibleThesis: z.string().min(1),
    requiredActors: z.array(semanticActorSchema),
    primaryAction: z.string().min(1),
    actionOwnerId: z.string().min(1),
    supportingActorIds: z.array(z.string().min(1)),
    environment: z.string().min(1),
    composition: z.string().min(1),
    evidenceRole: z.string().min(1).optional(),
    stateComplexity: stateComplexitySchema,
    continuity: continuityContractSchema,
    motif: motifContractSchema.optional(),
    diagramRequirement: diagramRequirementSchema,
    visualInformationGain: z.string().min(1),
    viewerVisibleFamilies: viewerVisibleFamiliesSchema,
    providerActorIds: z.array(z.string().min(1)),
    providerPrompt: z.string().min(1),
    treatmentVersion: z.string().min(1),
    history: historyTreatmentExtensionSchema.optional(),
    darkTruth: darkTruthTreatmentExtensionSchema.optional(),
  })
  .strict()
  .superRefine((treatment, context) => {
    const actors = new Set(treatment.requiredActors.map((actor) => actor.actorId));
    if (!actors.has(treatment.actionOwnerId)) {
      context.addIssue({
        code: "custom",
        path: ["actionOwnerId"],
        message: "The action owner must be one of the required actors.",
      });
    }
    for (const supportingActorId of treatment.supportingActorIds) {
      if (!actors.has(supportingActorId)) {
        context.addIssue({
          code: "custom",
          path: ["supportingActorIds"],
          message: `Unknown supporting actor ${supportingActorId}.`,
        });
      }
    }
  });

export type ProductionGenre = z.infer<typeof productionGenreSchema>;
export type ProductionVariant = z.infer<typeof productionVariantSchema>;
export type StateComplexity = z.infer<typeof stateComplexitySchema>;
export type SemanticActor = z.infer<typeof semanticActorSchema>;
export type SemanticTreatment = z.infer<typeof semanticTreatmentSchema>;
export type ViewerVisibleFamilies = z.infer<typeof viewerVisibleFamiliesSchema>;

const disabledPacingPolicySchema = z
  .object({
    mode: z.literal("preserve-current"),
    policyVersion: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

const staticPacingPolicySchema = z
  .object({
    mode: z.literal("static-guidance"),
    policyVersion: z.string().min(1),
    preferredWpmRange: z.tuple([z.number().positive(), z.number().positive()]),
    preferredDurationRangeSeconds: z
      .tuple([z.number().positive(), z.number().positive()])
      .optional(),
  })
  .strict();

export const adaptivePacingPolicySchema = z
  .object({
    mode: z.literal("adaptive-duration"),
    policyVersion: z.string().min(1),
    preferredDurationRangeSeconds: z.tuple([
      z.number().positive(),
      z.number().positive(),
    ]),
    targetDurationSeconds: z.number().positive(),
    durationAcceptanceToleranceSeconds: z.number().nonnegative(),
    preferredWpmRange: z
      .tuple([z.number().positive(), z.number().positive()])
      .optional(),
    minimumSpeed: z.number().positive(),
    maximumSpeed: z.number().positive(),
    maximumAdjustmentPerAttempt: z.number().positive(),
    maxCalibrationAttempts: z.number().int().positive(),
  })
  .strict();

export const productionPolicySchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_HARDENING_POLICY_VERSION),
    genre: productionGenreSchema,
    variant: productionVariantSchema,
    aspectRatio: z.enum(["16:9", "9:16"]),
    stateRepresentation: z.enum([
      "multi-state-first-class",
      "decisive-transition-preferred",
    ]),
    multiStateMapsAllowed: z.boolean(),
    visualDensityPolicy: z.string().min(1),
    diversityEnforcement: z.literal("diagnostic-no-factual-mutation"),
    repetitionSensitivity: z.enum(["standard", "atmosphere-aware"]),
    pacing: z.discriminatedUnion("mode", [
      disabledPacingPolicySchema,
      staticPacingPolicySchema,
      adaptivePacingPolicySchema,
    ]),
    providerProjectionVersion: z.literal(PROVIDER_PROJECTION_VERSION),
    diversityNormalizationVersion: z.literal(DIVERSITY_NORMALIZATION_VERSION),
    reusePolicyVersion: z.literal(ASSET_REUSE_POLICY_VERSION),
  })
  .strict();

export type ProductionPolicy = z.infer<typeof productionPolicySchema>;

export function resolveProductionPolicy(
  genre: ProductionGenre,
  variant: ProductionVariant,
): ProductionPolicy {
  if (genre === "history") {
    return productionPolicySchema.parse({
      schemaVersion: PRODUCTION_HARDENING_POLICY_VERSION,
      genre,
      variant,
      aspectRatio: variant === "short" ? "9:16" : "16:9",
      stateRepresentation:
        variant === "short"
          ? "decisive-transition-preferred"
          : "multi-state-first-class",
      multiStateMapsAllowed: true,
      visualDensityPolicy:
        variant === "short"
          ? "history-v3.5-vertical-derivative"
          : "history-v3.5-documentary-long",
      diversityEnforcement: "diagnostic-no-factual-mutation",
      repetitionSensitivity: "standard",
      pacing:
        variant === "short"
          ? {
              mode: "adaptive-duration" as const,
              policyVersion: "history-short-adaptive-pacing.v1",
              preferredDurationRangeSeconds: [55, 65],
              targetDurationSeconds: 60,
              durationAcceptanceToleranceSeconds: 3,
              preferredWpmRange: [135, 165],
              minimumSpeed: 0.9,
              maximumSpeed: 1.1,
              maximumAdjustmentPerAttempt: 0.05,
              maxCalibrationAttempts: 3,
            }
          : {
              mode: "preserve-current" as const,
              policyVersion: "history-full-existing-pacing.v1",
              reason:
                "No approved adaptive History full-form pacing policy exists; trusted narration configuration remains authoritative.",
            },
      providerProjectionVersion: PROVIDER_PROJECTION_VERSION,
      diversityNormalizationVersion: DIVERSITY_NORMALIZATION_VERSION,
      reusePolicyVersion: ASSET_REUSE_POLICY_VERSION,
    });
  }
  return productionPolicySchema.parse({
    schemaVersion: PRODUCTION_HARDENING_POLICY_VERSION,
    genre,
    variant,
    aspectRatio: variant === "short" ? "9:16" : "16:9",
    stateRepresentation:
      variant === "short"
        ? "decisive-transition-preferred"
        : "multi-state-first-class",
    multiStateMapsAllowed: false,
    visualDensityPolicy:
      variant === "short"
        ? "darktruth-visual-retention-short"
        : "darktruth-visual-retention-full",
    diversityEnforcement: "diagnostic-no-factual-mutation",
    repetitionSensitivity: "atmosphere-aware",
    pacing: {
      mode: "static-guidance",
      policyVersion: `darktruth-${variant}-existing-pacing.v1`,
      preferredWpmRange: [175, 185],
      ...(variant === "short"
        ? { preferredDurationRangeSeconds: [55, 65] }
        : {}),
    },
    providerProjectionVersion: PROVIDER_PROJECTION_VERSION,
    diversityNormalizationVersion: DIVERSITY_NORMALIZATION_VERSION,
    reusePolicyVersion: ASSET_REUSE_POLICY_VERSION,
  });
}

export type HardeningFindingCode =
  | "VISIBLE_THESIS_MISSING"
  | "ACTION_OWNER_MISSING"
  | "ACTOR_ROLE_MISMATCH"
  | "HISTORICAL_ENTITY_UNRESOLVED"
  | "DARKTRUTH_AMBIGUITY_LOST"
  | "ABSTRACTION_WITHOUT_SEMANTIC_PAYOFF"
  | "GENERIC_STOCK_HORROR_DRIFT"
  | "STATE_REPRESENTATION_INVALID"
  | "ORPHAN_MAP_EVENT"
  | "ORPHAN_DIAGRAM_EVENT"
  | "STALE_DERIVED_EVENT"
  | "TIMING_INVALID"
  | "HARMFUL_REPETITION";

export interface HardeningFinding {
  readonly code: HardeningFindingCode;
  readonly severity: "warning" | "blocking";
  readonly sceneId: string;
  readonly message: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function hashProductionValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

/**
 * Canonical, task-engine-ready hardening dependency identity.  The workflow
 * engine owns the final task hash; this deliberately supplies only stable
 * material to that existing mechanism.
 */
export interface ProductionHardeningFingerprintInput {
  readonly taskId: string;
  readonly genre: ProductionGenre;
  readonly variant: ProductionVariant;
  readonly policy?: ProductionPolicy;
  /** Bump only when a shared semantic primitive changes for every adopter. */
  readonly sharedPrimitiveRevision?: string;
}

export interface ProductionHardeningFingerprint {
  readonly schemaVersion: typeof PRODUCTION_HARDENING_FINGERPRINT_VERSION;
  readonly taskId: string;
  readonly genre: ProductionGenre;
  readonly variant: ProductionVariant;
  readonly policyFingerprint: string;
  readonly sharedPrimitiveFingerprint: string;
  readonly fingerprint: string;
}

export function buildProductionHardeningFingerprint(
  input: ProductionHardeningFingerprintInput,
): ProductionHardeningFingerprint {
  const policy = productionPolicySchema.parse(
    input.policy ?? resolveProductionPolicy(input.genre, input.variant),
  );
  if (policy.genre !== input.genre || policy.variant !== input.variant) {
    throw new Error("Hardening policy identity must match its task genre and variant.");
  }
  const policyFingerprint = hashProductionValue({
    schemaVersion: PRODUCTION_HARDENING_FINGERPRINT_VERSION,
    policy,
  });
  const sharedPrimitiveFingerprint = hashProductionValue({
    schemaVersion: PRODUCTION_HARDENING_FINGERPRINT_VERSION,
    sharedPrimitiveRevision:
      input.sharedPrimitiveRevision ?? PRODUCTION_HARDENING_SCHEMA_VERSION,
    providerProjectionVersion: PROVIDER_PROJECTION_VERSION,
    diversityNormalizationVersion: DIVERSITY_NORMALIZATION_VERSION,
    reusePolicyVersion: ASSET_REUSE_POLICY_VERSION,
  });
  const unsealed = {
    schemaVersion: PRODUCTION_HARDENING_FINGERPRINT_VERSION,
    taskId: input.taskId,
    genre: input.genre,
    variant: input.variant,
    policyFingerprint,
    sharedPrimitiveFingerprint,
  } as const;
  return {
    ...unsealed,
    fingerprint: hashProductionValue(unsealed),
  };
}

/** Structural shape intentionally matches TaskFingerprintMaterial without a
 * dependency from shared primitives back to the workflow engine. */
export function createProductionHardeningTaskMaterial(
  input: ProductionHardeningFingerprintInput,
): {
  readonly effectiveConfiguration: {
    readonly productionHardening: ProductionHardeningFingerprint;
  };
  readonly typedDependencies: readonly {
    readonly kind: "configuration";
    readonly id: string;
    readonly fingerprint: string;
  }[];
} {
  const hardening = buildProductionHardeningFingerprint(input);
  return {
    effectiveConfiguration: { productionHardening: hardening },
    typedDependencies: [
      {
        kind: "configuration",
        id: "production-hardening:shared",
        fingerprint: hardening.sharedPrimitiveFingerprint,
      },
      {
        kind: "configuration",
        id: `production-hardening:${hardening.genre}:${hardening.variant}`,
        fingerprint: hardening.policyFingerprint,
      },
    ],
  };
}

export function semanticTreatmentHash(treatment: SemanticTreatment): string {
  return hashProductionValue(semanticTreatmentSchema.parse(treatment));
}

const genericStockHorrorPattern =
  /\b(?:show|depict|use)\b[^.]{0,40}\bgeneric\s+(?:scary hallway|shadow person|red lighting|abandoned room)\b/iu;
const abstractPattern = /\b(?:abstract|symbolic|surreal|metaphor)\b/iu;

export function validateSemanticTreatments(input: {
  readonly genre: ProductionGenre;
  readonly policy: ProductionPolicy;
  readonly treatments: readonly SemanticTreatment[];
}): readonly HardeningFinding[] {
  const findings: HardeningFinding[] = [];
  for (const rawTreatment of input.treatments) {
    const treatment = semanticTreatmentSchema.parse(rawTreatment);
    const actorById = new Map(
      treatment.requiredActors.map((actor) => [actor.actorId, actor] as const),
    );
    const actionOwner = actorById.get(treatment.actionOwnerId);
    if (!treatment.visibleThesis.trim()) {
      findings.push({
        code: "VISIBLE_THESIS_MISSING",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message: "Every treatment requires a viewer-visible thesis.",
      });
    }
    if (!actionOwner) {
      findings.push({
        code: "ACTION_OWNER_MISSING",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message: "The primary action has no structurally resolved owner.",
      });
    } else if (!treatment.providerActorIds.includes(actionOwner.actorId)) {
      findings.push({
        code: "ACTOR_ROLE_MISMATCH",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message: `Provider projection lost action owner ${actionOwner.actorId}.`,
      });
    }
    if (
      input.genre === "history" &&
      treatment.requiredActors.some(
        (actor) =>
          actor.role === "historical-person" &&
          (actor.identityMode !== "resolved" || !actor.entityId),
      )
    ) {
      findings.push({
        code: "HISTORICAL_ENTITY_UNRESOLVED",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message:
          "A named historical person must preserve the trusted resolved entity.",
      });
    }
    if (
      input.genre === "dark-truth" &&
      treatment.darkTruth?.ambiguityIntentional === true &&
      treatment.requiredActors.some(
        (actor) =>
          actor.role === "unidentified-figure" &&
          actor.identityMode !== "intentionally-unspecified",
      )
    ) {
      findings.push({
        code: "DARKTRUTH_AMBIGUITY_LOST",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message:
          "Intentional DarkTruth ambiguity must remain explicitly unspecified.",
      });
    }
    if (
      input.genre === "dark-truth" &&
      abstractPattern.test(treatment.providerPrompt) &&
      !treatment.darkTruth?.atmospherePayoff.trim()
    ) {
      findings.push({
        code: "ABSTRACTION_WITHOUT_SEMANTIC_PAYOFF",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message: "Atmospheric abstraction requires a beat-specific payoff.",
      });
    }
    if (
      input.genre === "dark-truth" &&
      genericStockHorrorPattern.test(treatment.providerPrompt)
    ) {
      findings.push({
        code: "GENERIC_STOCK_HORROR_DRIFT",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message:
          "Generic stock-horror imagery does not express the narration beat.",
      });
    }
    if (
      treatment.stateComplexity === "MULTI_STATE_REQUIRED" &&
      input.policy.variant === "short" &&
      treatment.diagramRequirement.kind === "none" &&
      treatment.visualInformationGain.toLowerCase().includes("single still")
    ) {
      findings.push({
        code: "STATE_REPRESENTATION_INVALID",
        severity: "blocking",
        sceneId: treatment.sceneId,
        message:
          "A true multi-state process cannot be collapsed into one incoherent Short still.",
      });
    }
  }
  return findings;
}

export const canonicalTimingSchema = z
  .object({
    schemaVersion: z.literal("canonical-production-timing.v1"),
    timingPhase: z.literal("post-tts-reconciled"),
    timingSource: z.enum([
      "proportional-total-audio-reconciliation",
      "measured-scene-audio",
    ]),
    selectedAudioHash: sha256Schema,
    narrationDurationSeconds: z.number().positive(),
    scenes: z.array(
      z
        .object({
          sceneId: z.string().min(1),
          startSeconds: z.number().nonnegative(),
          endSeconds: z.number().positive(),
        })
        .strict(),
    ),
    timingHash: sha256Schema,
  })
  .strict();

export type CanonicalProductionTiming = z.infer<typeof canonicalTimingSchema>;

export function reconcileCanonicalPostTtsTiming(input: {
  readonly selectedAudioHash: string;
  readonly selectedAudioDurationSeconds: number;
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly plannedDurationSeconds: number;
  }[];
  readonly measuredSceneDurationsSeconds?: readonly number[];
}): CanonicalProductionTiming {
  if (!(input.selectedAudioDurationSeconds > 0) || input.scenes.length === 0) {
    throw new Error("Canonical timing requires selected final audio and scenes.");
  }
  const measured = input.measuredSceneDurationsSeconds;
  const timingSource = measured
    ? "measured-scene-audio"
    : "proportional-total-audio-reconciliation";
  if (measured && measured.length !== input.scenes.length) {
    throw new Error("Measured scene timing must cover every scene.");
  }
  const weights = measured ?? input.scenes.map((scene) => scene.plannedDurationSeconds);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) throw new Error("Canonical timing weights must be positive.");
  let cursor = 0;
  const scenes = input.scenes.map((scene, index) => {
    const startSeconds = cursor;
    const endSeconds =
      index === input.scenes.length - 1
        ? input.selectedAudioDurationSeconds
        : cursor +
          input.selectedAudioDurationSeconds * ((weights[index] ?? 0) / totalWeight);
    cursor = endSeconds;
    return { sceneId: scene.sceneId, startSeconds, endSeconds };
  });
  const unsealed = {
    schemaVersion: "canonical-production-timing.v1" as const,
    timingPhase: "post-tts-reconciled" as const,
    timingSource,
    selectedAudioHash: input.selectedAudioHash,
    narrationDurationSeconds: input.selectedAudioDurationSeconds,
    scenes,
  };
  return canonicalTimingSchema.parse({
    ...unsealed,
    timingHash: hashProductionValue(unsealed),
  });
}

export const visualEventSchema = z
  .object({
    eventId: z.string().min(1),
    sceneId: z.string().min(1),
    category: z.enum([
      "hold",
      "decisive-transition",
      "multi-state-progression",
      "map-progression",
      "diagram-build",
    ]),
    genreEventType: z.string().min(1),
    treatmentHash: sha256Schema,
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    stateIds: z.array(z.string().min(1)),
  })
  .strict();
export type ProductionVisualEvent = z.infer<typeof visualEventSchema>;

export function regenerateVisualEvents(input: {
  readonly genre: ProductionGenre;
  readonly treatments: readonly SemanticTreatment[];
  readonly timing: CanonicalProductionTiming;
}): readonly ProductionVisualEvent[] {
  const timingByScene = new Map(
    input.timing.scenes.map((scene) => [scene.sceneId, scene] as const),
  );
  return input.treatments.map((treatment) => {
    const timing = timingByScene.get(treatment.sceneId);
    if (!timing) throw new Error(`Missing canonical timing for ${treatment.sceneId}.`);
    const diagram = treatment.diagramRequirement;
    const category =
      diagram.kind === "map"
        ? "map-progression"
        : diagram.kind === "diagram"
          ? "diagram-build"
          : treatment.stateComplexity === "MULTI_STATE_REQUIRED"
            ? "multi-state-progression"
            : treatment.stateComplexity === "DECISIVE_TRANSITION_MOMENT"
              ? "decisive-transition"
              : "hold";
    const genreEventType =
      input.genre === "history"
        ? category === "decisive-transition"
          ? "evidence-reveal"
          : category
        : category === "decisive-transition"
          ? "threat-reveal"
          : category === "multi-state-progression"
            ? "setup-to-reveal"
            : category;
    return visualEventSchema.parse({
      eventId: `${treatment.sceneId}:${category}`,
      sceneId: treatment.sceneId,
      category,
      genreEventType,
      treatmentHash: semanticTreatmentHash(treatment),
      startSeconds: timing.startSeconds,
      endSeconds: timing.endSeconds,
      stateIds: diagram.stateIds,
    });
  });
}

export function validateVisualEventIntegrity(input: {
  readonly treatments: readonly SemanticTreatment[];
  readonly events: readonly ProductionVisualEvent[];
  readonly timing: CanonicalProductionTiming;
}): readonly HardeningFinding[] {
  const treatmentByScene = new Map(
    input.treatments.map((treatment) => [treatment.sceneId, treatment] as const),
  );
  const findings: HardeningFinding[] = [];
  for (const event of input.events) {
    const treatment = treatmentByScene.get(event.sceneId);
    if (!treatment) {
      findings.push({
        code: "STALE_DERIVED_EVENT",
        severity: "blocking",
        sceneId: event.sceneId,
        message: "Visual event has no final treatment owner.",
      });
      continue;
    }
    if (event.treatmentHash !== semanticTreatmentHash(treatment)) {
      findings.push({
        code: "STALE_DERIVED_EVENT",
        severity: "blocking",
        sceneId: event.sceneId,
        message: "Visual event was derived from a stale treatment.",
      });
    }
    if (
      event.category === "map-progression" &&
      treatment.diagramRequirement.kind !== "map"
    ) {
      findings.push({
        code: "ORPHAN_MAP_EVENT",
        severity: "blocking",
        sceneId: event.sceneId,
        message: "Map progression survived after the map was removed.",
      });
    }
    if (
      event.category === "diagram-build" &&
      treatment.diagramRequirement.kind !== "diagram"
    ) {
      findings.push({
        code: "ORPHAN_DIAGRAM_EVENT",
        severity: "blocking",
        sceneId: event.sceneId,
        message: "Diagram build survived after the diagram was removed.",
      });
    }
    if (
      event.endSeconds > input.timing.narrationDurationSeconds + 0.001 ||
      event.endSeconds <= event.startSeconds
    ) {
      findings.push({
        code: "TIMING_INVALID",
        severity: "blocking",
        sceneId: event.sceneId,
        message: "Visual event does not fit canonical final-audio timing.",
      });
    }
  }
  return findings;
}

export interface DiversityAssessment {
  readonly intentionalContinuityPairs: readonly string[];
  readonly harmfulRepetitionPairs: readonly string[];
  readonly normalizedFamilies: readonly ViewerVisibleFamilies[];
}

export function assessViewerVisibleDiversity(
  treatments: readonly SemanticTreatment[],
): DiversityAssessment {
  const intentionalContinuityPairs: string[] = [];
  const harmfulRepetitionPairs: string[] = [];
  for (let index = 1; index < treatments.length; index += 1) {
    const previous = treatments[index - 1]!;
    const current = treatments[index]!;
    const pair = `${previous.sceneId}->${current.sceneId}`;
    const continuityShared =
      previous.viewerVisibleFamilies.continuityIdentity ===
        current.viewerVisibleFamilies.continuityIdentity ||
      previous.viewerVisibleFamilies.motif === current.viewerVisibleFamilies.motif;
    const addsInformation =
      previous.visualInformationGain !== current.visualInformationGain;
    const changedState =
      previous.viewerVisibleFamilies.interaction !==
        current.viewerVisibleFamilies.interaction ||
      previous.viewerVisibleFamilies.motion !== current.viewerVisibleFamilies.motion ||
      previous.stateComplexity !== current.stateComplexity;
    if (continuityShared && addsInformation && changedState) {
      intentionalContinuityPairs.push(pair);
      continue;
    }
    const repeated = (
      ["environment", "composition", "camera", "interaction"] as const
    ).filter(
      (key) =>
        previous.viewerVisibleFamilies[key] === current.viewerVisibleFamilies[key],
    ).length;
    if (repeated === 4 && !addsInformation) harmfulRepetitionPairs.push(pair);
  }
  return {
    intentionalContinuityPairs,
    harmfulRepetitionPairs,
    normalizedFamilies: treatments.map(
      (treatment) => treatment.viewerVisibleFamilies,
    ),
  };
}

export const reuseSemanticContextSchema = z
  .object({
    semanticPurpose: z.string().min(1),
    actorEntityIds: z.array(z.string().min(1)),
    periodKey: z.string().min(1).optional(),
    factionIds: z.array(z.string().min(1)),
    geographyIds: z.array(z.string().min(1)),
    materialCultureKey: z.string().min(1).optional(),
    storyState: z.string().min(1).optional(),
    environmentKey: z.string().min(1),
    motifFamily: z.string().min(1).optional(),
    aspectRatios: z.array(z.enum(["16:9", "9:16"])).min(1),
    cropSafeAspectRatios: z.array(z.enum(["16:9", "9:16"])),
    generatedImageQa: z.enum(["passed", "not-run", "failed"]),
  })
  .strict();
export type ReuseSemanticContext = z.infer<typeof reuseSemanticContextSchema>;

export interface AssetReuseDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly decisionHash: string;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return hashProductionValue([...left].sort()) === hashProductionValue([...right].sort());
}

export function evaluateAssetReuse(input: {
  readonly genre: ProductionGenre;
  readonly targetAspectRatio: "16:9" | "9:16";
  readonly requested: ReuseSemanticContext;
  readonly candidate: ReuseSemanticContext;
}): AssetReuseDecision {
  const requested = reuseSemanticContextSchema.parse(input.requested);
  const candidate = reuseSemanticContextSchema.parse(input.candidate);
  const reasons: string[] = [];
  if (requested.semanticPurpose !== candidate.semanticPurpose)
    reasons.push("SEMANTIC_PURPOSE_MISMATCH");
  if (!sameSet(requested.actorEntityIds, candidate.actorEntityIds))
    reasons.push("ACTOR_ENTITY_MISMATCH");
  if (!candidate.cropSafeAspectRatios.includes(input.targetAspectRatio))
    reasons.push("ASPECT_RATIO_CROP_UNSAFE");
  if (candidate.generatedImageQa === "failed") reasons.push("IMAGE_QA_FAILED");
  if (input.genre === "history") {
    if (requested.periodKey !== candidate.periodKey) reasons.push("HISTORICAL_PERIOD_MISMATCH");
    if (!sameSet(requested.factionIds, candidate.factionIds))
      reasons.push("HISTORICAL_FACTION_MISMATCH");
    if (!sameSet(requested.geographyIds, candidate.geographyIds))
      reasons.push("HISTORICAL_GEOGRAPHY_MISMATCH");
    if (requested.materialCultureKey !== candidate.materialCultureKey)
      reasons.push("HISTORICAL_MATERIAL_CULTURE_MISMATCH");
  } else {
    if (requested.storyState !== candidate.storyState)
      reasons.push("DARKTRUTH_STORY_STATE_MISMATCH");
    if (requested.environmentKey !== candidate.environmentKey)
      reasons.push("DARKTRUTH_ENVIRONMENT_MISMATCH");
    if (requested.motifFamily !== candidate.motifFamily)
      reasons.push("DARKTRUTH_MOTIF_MISMATCH");
  }
  const unsealed = {
    genre: input.genre,
    targetAspectRatio: input.targetAspectRatio,
    reusePolicyVersion: ASSET_REUSE_POLICY_VERSION,
    requested,
    candidate,
    allowed: reasons.length === 0,
    reasons,
  };
  return {
    allowed: unsealed.allowed,
    reasons,
    decisionHash: hashProductionValue(unsealed),
  };
}

export type DerivedArtifactKind =
  | "provider-prompts"
  | "maps-diagrams"
  | "visual-events"
  | "reuse-decisions"
  | "diversity-fingerprints"
  | "timing-render-instructions"
  | "review-pack";

export function deriveHardeningInvalidation(input: {
  readonly previous: {
    readonly treatmentHash: string;
    readonly timingHash: string;
    readonly providerProjectionVersion: string;
    readonly diversityVersion: string;
    readonly reusePolicyVersion: string;
  };
  readonly current: {
    readonly treatmentHash: string;
    readonly timingHash: string;
    readonly providerProjectionVersion: string;
    readonly diversityVersion: string;
    readonly reusePolicyVersion: string;
  };
}): readonly DerivedArtifactKind[] {
  const invalidated = new Set<DerivedArtifactKind>();
  if (input.previous.treatmentHash !== input.current.treatmentHash) {
    for (const artifact of [
      "provider-prompts",
      "maps-diagrams",
      "visual-events",
      "reuse-decisions",
      "diversity-fingerprints",
      "timing-render-instructions",
      "review-pack",
    ] as const) invalidated.add(artifact);
  }
  if (
    input.previous.providerProjectionVersion !==
    input.current.providerProjectionVersion
  ) {
    invalidated.add("provider-prompts");
    invalidated.add("review-pack");
  }
  if (input.previous.diversityVersion !== input.current.diversityVersion)
    invalidated.add("diversity-fingerprints");
  if (input.previous.reusePolicyVersion !== input.current.reusePolicyVersion)
    invalidated.add("reuse-decisions");
  if (input.previous.timingHash !== input.current.timingHash) {
    invalidated.add("visual-events");
    invalidated.add("timing-render-instructions");
    invalidated.add("review-pack");
  }
  return [...invalidated];
}

export const qualityStateSchema = z.enum([
  "planning-complete",
  "semantic-review-complete",
  "pre-image-approved",
  "provider-request-allowed",
  "generated-image-qa",
  "final-production-approved",
]);

export interface ReviewIntegrityInput {
  readonly narrationHash: string;
  readonly timingHash: string;
  readonly semanticPlanHash: string;
  readonly mapDiagramHash: string;
  readonly semanticReviewHash: string;
  readonly providerPromptHash: string;
  readonly reuseDecisionHash: string;
  readonly pacingCalibrationHash: string | null;
}

export function createReviewIntegrityHash(input: ReviewIntegrityInput): string {
  return hashProductionValue({
    schemaVersion: "cross-genre-review-integrity.v1",
    ...input,
  });
}

export type ProviderBlocker =
  | "SEMANTIC_BLOCKER"
  | "ACTOR_MISMATCH"
  | "INVALID_TIMING"
  | "STALE_MAP_DIAGRAM_STATE"
  | "STALE_REVIEW_ARTIFACT"
  | "HUMAN_APPROVAL_MISSING";

export function evaluateProviderReadiness(input: {
  readonly findings: readonly HardeningFinding[];
  readonly timingCurrent: boolean;
  readonly mapDiagramCurrent: boolean;
  readonly expectedReviewHash: string;
  readonly persistedReviewHash: string;
  readonly humanApprovalState: "missing" | "approved" | "rejected";
}): { readonly allowed: boolean; readonly blockers: readonly ProviderBlocker[] } {
  const blockers = new Set<ProviderBlocker>();
  if (input.findings.some((finding) => finding.severity === "blocking"))
    blockers.add("SEMANTIC_BLOCKER");
  if (input.findings.some((finding) => finding.code === "ACTOR_ROLE_MISMATCH"))
    blockers.add("ACTOR_MISMATCH");
  if (!input.timingCurrent) blockers.add("INVALID_TIMING");
  if (!input.mapDiagramCurrent) blockers.add("STALE_MAP_DIAGRAM_STATE");
  if (input.expectedReviewHash !== input.persistedReviewHash)
    blockers.add("STALE_REVIEW_ARTIFACT");
  if (input.humanApprovalState !== "approved")
    blockers.add("HUMAN_APPROVAL_MISSING");
  return { allowed: blockers.size === 0, blockers: [...blockers] };
}

export interface ProductionHardeningDryRunInput {
  readonly fixtureId: string;
  readonly genre: ProductionGenre;
  readonly variant: ProductionVariant;
  readonly narrationHash: string;
  readonly selectedAudioHash: string;
  readonly selectedAudioDurationSeconds: number;
  readonly treatments: readonly SemanticTreatment[];
  readonly reusePairs: readonly {
    readonly requested: ReuseSemanticContext;
    readonly candidate: ReuseSemanticContext;
  }[];
  readonly humanApprovalState: "missing" | "approved" | "rejected";
}

export interface ProductionHardeningDryRunResult {
  readonly schemaVersion: typeof PRODUCTION_HARDENING_SCHEMA_VERSION;
  readonly fixtureId: string;
  readonly genre: ProductionGenre;
  readonly variant: ProductionVariant;
  readonly status: "passed" | "blocked";
  readonly policy: ProductionPolicy;
  readonly hardeningFingerprint: ProductionHardeningFingerprint;
  readonly timing: CanonicalProductionTiming;
  readonly treatmentHash: string;
  readonly events: readonly ProductionVisualEvent[];
  readonly diversity: DiversityAssessment;
  readonly reuseDecisions: readonly AssetReuseDecision[];
  readonly findings: readonly HardeningFinding[];
  readonly reviewIntegrityHash: string;
  readonly pacingCalibrationPlanHash: string | null;
  readonly providerReadiness: {
    readonly allowed: boolean;
    readonly blockers: readonly ProviderBlocker[];
  };
  readonly diagnostics: Readonly<Record<string, string | number | boolean>>;
  readonly liveTtsProviderCalls: 0;
  readonly imageProviderCalls: 0;
}

export function runProductionHardeningDryRun(
  input: ProductionHardeningDryRunInput,
): ProductionHardeningDryRunResult {
  const policy = resolveProductionPolicy(input.genre, input.variant);
  const hardeningFingerprint = buildProductionHardeningFingerprint({
    taskId: "offline-production-hardening-fixture",
    genre: input.genre,
    variant: input.variant,
    policy,
  });
  const treatments = input.treatments.map((treatment) =>
    semanticTreatmentSchema.parse(treatment),
  );
  const timing = reconcileCanonicalPostTtsTiming({
    selectedAudioHash: input.selectedAudioHash,
    selectedAudioDurationSeconds: input.selectedAudioDurationSeconds,
    scenes: treatments.map((treatment) => ({
      sceneId: treatment.sceneId,
      plannedDurationSeconds: 1,
    })),
  });
  const events = regenerateVisualEvents({
    genre: input.genre,
    treatments,
    timing,
  });
  const findings = [
    ...validateSemanticTreatments({ genre: input.genre, policy, treatments }),
    ...validateVisualEventIntegrity({ treatments, events, timing }),
  ];
  const diversity = assessViewerVisibleDiversity(treatments);
  for (const pair of diversity.harmfulRepetitionPairs) {
    findings.push({
      code: "HARMFUL_REPETITION",
      severity: "warning",
      sceneId: pair,
      message: "Repeated viewer-visible families add no narrative information.",
    });
  }
  const reuseDecisions = input.reusePairs.map((pair) =>
    evaluateAssetReuse({
      genre: input.genre,
      targetAspectRatio: policy.aspectRatio,
      requested: pair.requested,
      candidate: pair.candidate,
    }),
  );
  const treatmentHash = hashProductionValue(treatments);
  const pacingCalibrationPlanHash =
    policy.pacing.mode === "adaptive-duration"
      ? hashProductionValue({
          schemaVersion: "production-hardening-calibration-plan.v1",
          narrationHash: input.narrationHash,
          genre: input.genre,
          variant: input.variant,
          policy: policy.pacing,
        })
      : null;
  const reviewInput: ReviewIntegrityInput = {
    narrationHash: input.narrationHash,
    timingHash: timing.timingHash,
    semanticPlanHash: treatmentHash,
    mapDiagramHash: hashProductionValue(
      treatments.map((treatment) => treatment.diagramRequirement),
    ),
    semanticReviewHash: hashProductionValue(findings),
    providerPromptHash: hashProductionValue(
      treatments.map((treatment) => treatment.providerPrompt),
    ),
    reuseDecisionHash: hashProductionValue(reuseDecisions),
    pacingCalibrationHash: pacingCalibrationPlanHash,
  };
  const reviewIntegrityHash = createReviewIntegrityHash(reviewInput);
  const providerReadiness = evaluateProviderReadiness({
    findings,
    timingCurrent: true,
    mapDiagramCurrent: true,
    expectedReviewHash: reviewIntegrityHash,
    persistedReviewHash: reviewIntegrityHash,
    humanApprovalState: input.humanApprovalState,
  });
  const blockingFindings = findings.filter(
    (finding) => finding.severity === "blocking",
  );
  return {
    schemaVersion: PRODUCTION_HARDENING_SCHEMA_VERSION,
    fixtureId: input.fixtureId,
    genre: input.genre,
    variant: input.variant,
    status: blockingFindings.length === 0 ? "passed" : "blocked",
    policy,
    hardeningFingerprint,
    timing,
    treatmentHash,
    events,
    diversity,
    reuseDecisions,
    findings,
    reviewIntegrityHash,
    pacingCalibrationPlanHash,
    providerReadiness,
    diagnostics: {
      genreResolved: input.genre,
      variantResolved: input.variant,
      semanticPolicyResolved: PRODUCTION_HARDENING_POLICY_VERSION,
      hardeningFingerprint: hardeningFingerprint.fingerprint,
      actionOwnerResolved: treatments.every((treatment) =>
        treatment.requiredActors.some(
          (actor) => actor.actorId === treatment.actionOwnerId,
        ),
      ),
      statePolicyResolved: policy.stateRepresentation,
      motifContinuityPolicyResolved: policy.repetitionSensitivity,
      diversityPolicyResolved: policy.diversityNormalizationVersion,
      reusePolicyResolved: policy.reusePolicyVersion,
      pacingPolicyResolved: policy.pacing.policyVersion,
      calibrationPlanResolved: pacingCalibrationPlanHash !== null,
      toleranceResolved:
        policy.pacing.mode === "adaptive-duration"
          ? policy.pacing.durationAcceptanceToleranceSeconds
          : "not-enabled",
      canonicalTimingSource: timing.timingSource,
      reviewProviderReady: providerReadiness.allowed,
      fixtureDryRunResult: blockingFindings.length === 0 ? "passed" : "blocked",
    },
    liveTtsProviderCalls: 0,
    imageProviderCalls: 0,
  };
}
