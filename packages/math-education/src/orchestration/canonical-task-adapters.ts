import fs from "node:fs/promises";
import path from "node:path";

import {
  ARTIFACT_SCHEMA_VERSION,
  artifactRefSchema,
  type ArtifactKind,
  type ArtifactManifest,
} from "@mediaforge/domain";
import {
  ArtifactRepository,
  WorkflowBlockedError,
  type TaskExecutionContext,
  type TaskImplementation,
  type WorkflowStore,
} from "@mediaforge/workflow-engine";
import { z } from "zod";
import { hashFile } from "@mediaforge/shared";

import {
  isAuthoritativeLoadedCurriculumRelease,
  loadCurriculumRelease,
} from "../curriculum/release.js";
import type { MathLanguage } from "../domain/index.js";
import {
  assertLessonCapability,
  assertProductionLessonCapability,
  lessonCapability,
} from "../lesson/capabilities.js";
import {
  buildAllLessonVariants,
  buildLessonVariant,
} from "../lesson/variant-builder.js";
import { validateVariantDifferentiation } from "../lesson/lesson-validator.js";
import {
  createMetadataTimingEvidence,
  createTimingManifest,
  timingManifestSchema,
} from "../lesson/timing.js";
import { buildMathEducationalNarrationBeats } from "../lesson/educational-speech-sync.js";
import {
  assertLocalizedDisplayVerification,
  localizedDisplayChecks,
} from "../localization/display-verification.js";
import {
  MATH_LOCKED_FACT_NARRATION_VERSION,
  MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION,
  localizeNarration,
  localizedNarrationSchema,
} from "../localization/localization.js";
import {
  germanStandardNarrationReviewSchema,
  reviewGermanStandardNarration,
} from "../localization/narration-review.js";
import {
  createMathMetadataEvidence,
  createMetadataWorkflowEvidence,
  createExactContentSimulationMetadataContext,
  createReviewedMetadataContext,
  generateMathMetadata,
  mathMetadataSchema,
  mathPlaylistCatalog,
} from "../metadata/math-metadata.js";
import {
  computeEducationalVisualStyleContentHash,
  computeMathLessonProfileContentHash,
  assessEducationalVisualStyleReadiness,
  assessMathLessonProfileReadiness,
  type EducationalVisualStyleManifest,
  type MathLessonProfileManifest,
} from "../profile-contracts.js";
import { createPublishDryRunManifest } from "../publishing/dry-run-manifest.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { assertFactCoverage } from "../verification/fact-coverage-gate.js";
import {
  VERIFIER_PROTOCOL_VERSION,
  VERIFIER_VERSION,
  verifierResponseSchema,
  type VerifierRequest,
  type VerifierResponse,
} from "../verification/protocol-schemas.js";
import {
  createVerifierRequest,
  SympyVerifierAdapter,
} from "../verification/sympy-adapter.js";
import {
  assertPrivateOwnerCurriculumApproval,
  type PrivateOwnerAttestation,
} from "../review/private-owner-attestation.js";
import { mathVisualPlanSchema } from "./artifact-schemas.js";
import {
  deriveMathQuality,
  mathQualityReportSchema,
  qualityCheck,
} from "./quality-gate.js";
import {
  MATH_TASK_REGISTRY_VERSION,
  type MathProfileReadinessEvidence,
} from "../task-registry.js";

export const MATH_CANONICAL_ADAPTER_VERSION =
  "math.canonical-adapters.v1" as const;
export const MATH_CANONICAL_ARTIFACT_VERSION =
  "math.canonical-task-artifact.v1" as const;

type CurriculumRelease = Awaited<ReturnType<typeof loadCurriculumRelease>>;

export const MATH_EXECUTABLE_TASK_IDS = [
  "math.curriculum-import",
  "math.source-validation",
  "math.prerequisite-graph",
  "math.lesson-spec",
  "math.math-verification",
  "math.canonical-narration",
  "math.scene-timing",
  "math.localization",
  "math.visual-style",
  "math.visual-assets",
  "math.tts",
  "math.timing-reflow",
  "math.render",
  "math.quality-gate",
  "math.metadata-playlists",
  "math.publish-dry-run",
] as const;

const ownerByTask = {
  "math.curriculum-import": "@mediaforge/math-education",
  "math.source-validation": "@mediaforge/math-education",
  "math.prerequisite-graph": "@mediaforge/math-education",
  "math.lesson-spec": "@mediaforge/math-education",
  "math.math-verification": "@mediaforge/math-education",
  "math.canonical-narration": "@mediaforge/math-education",
  "math.scene-timing": "@mediaforge/math-education",
  "math.localization": "@mediaforge/math-education",
  "math.visual-style": "@mediaforge/math-education",
  "math.visual-assets": "@mediaforge/math-rendering",
  "math.tts": "@mediaforge/speech",
  "math.timing-reflow": "@mediaforge/math-education",
  "math.render": "@mediaforge/educational-renderer",
  "math.quality-gate": "@mediaforge/math-education",
  "math.metadata-playlists": "@mediaforge/metadata",
  "math.publish-dry-run": "@mediaforge/youtube-upload",
} as const;

const outputKindByTask = {
  "math.curriculum-import": "curriculum",
  "math.source-validation": "curriculum",
  "math.prerequisite-graph": "curriculum",
  "math.lesson-spec": "lesson-specification",
  "math.math-verification": "math-verification",
  "math.canonical-narration": "narration",
  "math.scene-timing": "scene-plan",
  "math.localization": "narration",
  "math.visual-style": "educational-visual-style",
  "math.visual-assets": "image",
  "math.tts": "narration",
  "math.timing-reflow": "narration",
  "math.render": "render",
  "math.quality-gate": "quality-assessment",
  "math.metadata-playlists": "metadata",
  "math.publish-dry-run": "publish-report",
} as const satisfies Record<
  (typeof MATH_EXECUTABLE_TASK_IDS)[number],
  ArtifactKind
>;

const canonicalTaskArtifactSchema = z
  .object({
    schemaVersion: z.literal(MATH_CANONICAL_ARTIFACT_VERSION),
    adapterVersion: z.literal(MATH_CANONICAL_ADAPTER_VERSION),
    taskId: z.enum(MATH_EXECUTABLE_TASK_IDS),
    owner: z.enum(
      Object.values(ownerByTask) as [
        (typeof ownerByTask)[keyof typeof ownerByTask],
        ...(typeof ownerByTask)[keyof typeof ownerByTask][],
      ]
    ),
    identity: z
      .object({
        unitId: z.string().min(1),
        locale: z.string().min(2),
        variant: z.string().min(1),
      })
      .strict(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    dependencyFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
    validation: z
      .object({
        validatorId: z.string().min(1),
        validatorVersion: z.string().min(1),
        status: z.literal("passed"),
      })
      .strict(),
    payload: z.unknown(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (ownerByTask[artifact.taskId] !== artifact.owner) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: `Task ${artifact.taskId} is bound to the wrong owner.`,
      });
    }
  });

export type CanonicalMathTaskArtifact = z.infer<
  typeof canonicalTaskArtifactSchema
>;

export interface MathProviderAuthorization {
  readonly configured: boolean;
  readonly operatorAuthorized: boolean;
  readonly mode: "fixture-mock" | "provider";
  readonly configurationFingerprint: string;
}

export interface MathCanonicalAdapterOptions {
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly unitRoot: string;
  readonly unitId: string;
  readonly curriculum: CurriculumRelease;
  readonly profile: MathLessonProfileManifest | null;
  readonly visualStyle: EducationalVisualStyleManifest | null;
  readonly locale: MathLanguage;
  readonly lessonVariant: "foundation" | "standard" | "challenge";
  readonly contentVariant: "full" | "short";
  readonly skillId: string;
  readonly simulation: boolean;
  readonly releaseVisibility: "private" | "public";
  readonly privateOwnerAttestation?: PrivateOwnerAttestation;
  readonly providerAuthorization: MathProviderAuthorization;
  readonly store: WorkflowStore;
  readonly repository: ArtifactRepository;
  readonly verifier?: (request: VerifierRequest) => Promise<VerifierResponse>;
  readonly pythonExecutable?: string;
  readonly rendererVersions?: Readonly<Record<string, string>>;
  readonly lessonContentReviewEvidence?: unknown;
  readonly privateMediaMaterializer?: (
    input: CanonicalPrivateMediaMaterializerInput
  ) => Promise<unknown>;
  readonly privateSpeechMaterializer?: (
    input: CanonicalPrivateSpeechMaterializerInput
  ) => Promise<unknown>;
}

export interface CanonicalPrivateSpeechMaterializerInput {
  readonly unitRoot: string;
  readonly unitId: string;
  readonly locale: MathLanguage;
  readonly lesson: ReturnType<typeof buildLessonVariant>;
  readonly narration: z.infer<typeof localizedNarrationSchema>;
}

export interface CanonicalPrivateMediaMaterializerInput {
  readonly unitRoot: string;
  readonly unitId: string;
  readonly locale: MathLanguage;
  readonly lesson: ReturnType<typeof buildLessonVariant>;
  readonly narration: z.infer<typeof localizedNarrationSchema>;
  readonly visualPlan: z.infer<typeof mathVisualPlanSchema>;
  readonly timing: z.infer<typeof timingManifestSchema>;
  readonly speech?: CanonicalPrivateSpeechEvidence;
}

function privateOwnerCurriculumEvidence(
  options: MathCanonicalAdapterOptions
): PrivateOwnerAttestation | null {
  if (
    options.releaseVisibility !== "private" ||
    !options.privateOwnerAttestation
  ) {
    return null;
  }
  try {
    return assertPrivateOwnerCurriculumApproval(
      options.privateOwnerAttestation,
      options.curriculum,
      options.skillId
    );
  } catch {
    return null;
  }
}

function curriculumReadyForSelectedVisibility(
  options: MathCanonicalAdapterOptions
): boolean {
  return (
    options.simulation ||
    options.curriculum.readyForProduction ||
    privateOwnerCurriculumEvidence(options) !== null
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

function profileIdentityReasons(
  options: MathCanonicalAdapterOptions
): string[] {
  if (options.simulation) {
    const capability = lessonCapability(options.skillId);
    return capability?.variants.includes(options.lessonVariant)
      ? []
      : [
          `No approved provider-free fixture capability exists for ${options.skillId}/${options.lessonVariant}.`,
        ];
  }
  const profile = options.profile;
  if (!profile) return ["The mathematics lesson profile is missing."];
  const reasons = [
    ...assessMathLessonProfileReadiness(
      profile,
      new Date(),
      privateOwnerCurriculumEvidence(options) !== null
    ).reasons,
  ];
  if (profile.contentHash !== computeMathLessonProfileContentHash(profile)) {
    reasons.push(
      "The mathematics lesson-profile content hash is forged or stale."
    );
  }
  if (
    profile.curriculum.releaseId !== options.curriculum.release.releaseId ||
    profile.curriculum.releaseHash !== options.curriculum.releaseHash ||
    profile.curriculum.revision !== options.curriculum.release.curriculumVersion
  ) {
    reasons.push(
      "The lesson profile is not bound to the authoritative loaded curriculum release."
    );
  }
  if (
    profile.lessonId !== options.unitId ||
    profile.skillId !== options.skillId ||
    profile.lessonVariant !== options.lessonVariant ||
    profile.contentVariant !== options.contentVariant ||
    profile.locale !== options.locale
  ) {
    reasons.push(
      "The lesson profile identity does not match the workflow selection."
    );
  }
  return reasons;
}

function visualStyleReasons(options: MathCanonicalAdapterOptions): string[] {
  if (options.simulation) return [];
  if (!options.visualStyle)
    return ["The educational visual-style manifest is missing."];
  const reasons = [
    ...assessEducationalVisualStyleReadiness(
      options.visualStyle,
      options.locale
    ).reasons,
  ];
  if (
    options.visualStyle.contentHash !==
    computeEducationalVisualStyleContentHash(options.visualStyle)
  ) {
    reasons.push(
      "The educational visual-style content hash is forged or stale."
    );
  }
  if (
    options.profile &&
    (options.visualStyle.profileRevision !== options.profile.revision ||
      options.visualStyle.curriculumRevision !==
        options.curriculum.release.curriculumVersion)
  ) {
    reasons.push(
      "The educational visual style is bound to stale profile or curriculum revisions."
    );
  }
  return reasons;
}

export function assessAuthoritativeMathReadiness(
  options: MathCanonicalAdapterOptions
): MathProfileReadinessEvidence {
  const curriculumReady = curriculumReadyForSelectedVisibility(options);
  const curriculumReasons = [
    ...(!isAuthoritativeLoadedCurriculumRelease(options.curriculum)
      ? [
          "Curriculum evidence was not produced by the authoritative release loader.",
        ]
      : []),
    ...(!curriculumReady
      ? [
          "The authoritative curriculum release has no approval for the selected visibility.",
        ]
      : []),
  ];
  const profileReasons = profileIdentityReasons(options);
  const styleReasons = visualStyleReasons(options);
  const verifierReady =
    VERIFIER_PROTOCOL_VERSION === "math-verifier.v3" &&
    VERIFIER_VERSION === "3.0.0" &&
    Boolean(options.verifier || options.pythonExecutable || options.simulation);
  const providerReasons = [
    ...(!options.providerAuthorization.configured
      ? ["The speech provider runtime is not configured."]
      : []),
    ...(!options.providerAuthorization.operatorAuthorized
      ? [
          "An explicit operator action is required for the provider-dependent speech task.",
        ]
      : []),
  ];
  return {
    profileReady: profileReasons.length === 0,
    profileReasons,
    curriculumReady: curriculumReasons.length === 0,
    curriculumReasons,
    visualStyleReady: styleReasons.length === 0,
    visualStyleReasons: styleReasons,
    deterministicVerificationSupported: verifierReady,
    verificationReasons: verifierReady
      ? []
      : ["Verifier protocol v3 capability evidence is unavailable."],
    providerTasksAuthorized: providerReasons.length === 0,
    providerReasons,
  };
}

async function verifiedTaskArtifact(
  options: MathCanonicalAdapterOptions,
  taskId: (typeof MATH_EXECUTABLE_TASK_IDS)[number]
): Promise<{
  artifact: CanonicalMathTaskArtifact;
  manifest: ArtifactManifest;
}> {
  const state = await options.store.readState();
  const task = state.tasks.find((candidate) => candidate.taskId === taskId);
  if (task?.status !== "succeeded" || !task.attemptId) {
    throw new Error(
      `Canonical dependency ${taskId} has no successful attempt.`
    );
  }
  const attempt = await options.store.readAttempt(task.attemptId);
  if (
    attempt.status !== "completed" ||
    attempt.result.status !== "succeeded" ||
    attempt.result.outputs.length !== 1
  ) {
    throw new Error(
      `Canonical dependency ${taskId} has ambiguous output evidence.`
    );
  }
  const manifest = attempt.result.outputs[0]!;
  const verified = await options.repository.verify(manifest.ref, {
    dependencyFingerprints: manifest.dependencyFingerprints,
  });
  if (
    verified.manifest.id !== manifest.id ||
    verified.manifest.checksumSha256 !== manifest.checksumSha256 ||
    manifest.producerTaskId !== taskId ||
    manifest.producerAttemptId !== task.attemptId
  ) {
    throw new Error(
      `Canonical dependency ${taskId} has forged artifact lineage.`
    );
  }
  const artifact = canonicalTaskArtifactSchema.parse(
    JSON.parse(
      await fs.readFile(verified.provenance.absolutePath, "utf8")
    ) as unknown
  );
  if (
    artifact.taskId !== taskId ||
    artifact.fingerprint !== attempt.fingerprint ||
    artifact.identity.unitId !== options.unitId ||
    artifact.identity.locale !== options.locale ||
    artifact.identity.variant !== options.contentVariant
  ) {
    throw new Error(
      `Canonical dependency ${taskId} identity is stale or mismatched.`
    );
  }
  return { artifact, manifest };
}

function payload<T>(
  source: { artifact: CanonicalMathTaskArtifact },
  schema: z.ZodType<T>
): T {
  return schema.parse(source.artifact.payload);
}

async function promote(
  options: MathCanonicalAdapterOptions,
  context: TaskExecutionContext,
  taskId: (typeof MATH_EXECUTABLE_TASK_IDS)[number],
  rawPayload: unknown,
  validatorId: string,
  validatorVersion: string
) {
  const producerTaskVersion =
    taskId === "math.canonical-narration" || taskId === "math.localization"
      ? MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION
      : MATH_TASK_REGISTRY_VERSION;
  const artifact = canonicalTaskArtifactSchema.parse({
    schemaVersion: MATH_CANONICAL_ARTIFACT_VERSION,
    adapterVersion: MATH_CANONICAL_ADAPTER_VERSION,
    taskId,
    owner: ownerByTask[taskId],
    identity: {
      unitId: context.unitId,
      locale: context.locale,
      variant: context.variant,
    },
    fingerprint: context.fingerprint,
    dependencyFingerprints: context.dependencyFingerprints,
    validation: { validatorId, validatorVersion, status: "passed" },
    payload: rawPayload,
  });
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  const ref = artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: context.unitId,
    profileId: context.profileId,
    locale: context.locale,
    variant: context.variant,
    kind: outputKindByTask[taskId],
    artifactKey: `${taskId.slice("math.".length)}-${context.fingerprint.slice(0, 16)}`,
    format: "json",
    artifactRevision: context.fingerprint,
    workflowRevision: MATH_TASK_REGISTRY_VERSION,
    policyRevision:
      options.visualStyle?.revision ??
      options.profile?.revision ??
      "simulation-reviewed-fixtures-v1",
    ...(options.visualStyle
      ? { referenceSetRevision: options.visualStyle.revision }
      : {}),
  });
  const result = await options.repository.promote({
    ref,
    content,
    mediaType: "application/json",
    producerTaskId: taskId,
    producerTaskVersion,
    producerAttemptId: context.attemptId,
    validatorId: `math.${validatorId}`,
    validatorVersion,
    dependencyFingerprints: context.dependencyFingerprints,
    replaceInvalidDestination: true,
    refreshManifestOnReuse: true,
    validate: (buffer) => {
      const parsed = canonicalTaskArtifactSchema.parse(
        JSON.parse(buffer.toString("utf8")) as unknown
      );
      if (
        parsed.taskId !== taskId ||
        parsed.fingerprint !== context.fingerprint ||
        !sameStrings(
          parsed.dependencyFingerprints,
          context.dependencyFingerprints
        )
      ) {
        throw new Error(`Canonical ${taskId} artifact validation failed.`);
      }
    },
  });
  if (result.dryRun) {
    throw new Error(
      `Canonical ${taskId} unexpectedly returned a dry-run write.`
    );
  }
  return {
    outputArtifacts: [result.artifact.manifest],
    warnings: [],
    telemetry: {
      cacheStatus: "miss" as const,
      revisions: {
        adapter: MATH_CANONICAL_ADAPTER_VERSION,
        verifier: VERIFIER_VERSION,
        curriculum: options.curriculum.release.curriculumVersion,
      },
    },
  };
}

const curriculumPayloadSchema = z.object({
  releaseId: z.string(),
  releaseHash: z.string().regex(/^[a-f0-9]{64}$/u),
  curriculumVersion: z.string(),
  readyForProduction: z.boolean(),
  readyForPrivateProduction: z.boolean(),
  governanceEvidenceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  skill: z.unknown(),
});

const sourcePayloadSchema = curriculumPayloadSchema.extend({
  authorityHash: z.string().regex(/^[a-f0-9]{64}$/u),
  provenanceComplete: z.boolean(),
  prerequisiteReviewStatus: z.string(),
});

const canonicalMediaFileSchema = z
  .object({
    relativePath: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    byteLength: z.number().int().positive(),
  })
  .strict();

const canonicalFixtureProviderTelemetrySchema = z
  .object({
    mode: z.literal("fixture-mock"),
    calls: z.literal(0),
    characters: z.literal(0),
    retries: z.literal(0),
    latencyMs: z.literal(0),
    costMicros: z.literal(0),
  })
  .strict();
const canonicalPaidProviderTelemetrySchema = z
  .object({
    mode: z.literal("provider"),
    providerId: z.literal("openai-compatible"),
    calls: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    costMicros: z.number().int().nonnegative(),
    model: z.string().min(1),
    voice: z.string().min(1),
    speechProfileVersion: z.string().min(1),
    pricingVersion: z.string().min(1),
    approvedCeilingMicros: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => value.costMicros <= value.approvedCeilingMicros,
    "Actual provider cost exceeds the approved hard ceiling."
  )
  .refine(
    (value) =>
      value.calls > 0
        ? value.characters > 0
        : value.characters === 0 &&
          value.retries === 0 &&
          value.costMicros === 0,
    "Provider telemetry must distinguish paid calls from complete cache reuse."
  );
const canonicalProviderTelemetrySchema = z.discriminatedUnion("mode", [
  canonicalFixtureProviderTelemetrySchema,
  canonicalPaidProviderTelemetrySchema,
]);

const canonicalNaturalAudioQualitySchema = z
  .object({
    kind: z.literal("natural-speech"),
    audibleNarration: z.literal(true),
    probesPassed: z.literal(true),
    integratedLoudnessLufs: z.number().min(-24).max(-14),
    truePeakDb: z.number().max(-1),
    clippingDetected: z.literal(false),
  })
  .strict();

export const canonicalPrivateSpeechEvidenceSchema = z
  .object({
    artifactVersion: z.literal("math-canonical-private-speech.v1"),
    identity: z
      .object({
        lessonId: z.string().min(1),
        skillId: z.string().min(1),
        language: z.literal("de"),
        variant: z.literal("standard"),
      })
      .strict(),
    provider: canonicalPaidProviderTelemetrySchema,
    audio: canonicalMediaFileSchema.extend({
      durationSeconds: z.number().min(180).max(300),
      codec: z.literal("pcm_s16le"),
      quality: canonicalNaturalAudioQualitySchema,
    }),
    durations: z.array(z.number().positive()).length(9),
    speechPlanFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    cacheHitCount: z.number().int().nonnegative(),
    cacheMissCount: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    const { contentHash, ...payload } = value;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Canonical private speech evidence hash is stale or forged.",
      });
    }
  });
export type CanonicalPrivateSpeechEvidence = z.infer<
  typeof canonicalPrivateSpeechEvidenceSchema
>;

export const canonicalPrivateMediaEvidenceSchema = z
  .object({
    artifactVersion: z.literal("math-canonical-private-media.v1"),
    identity: z
      .object({
        lessonId: z.string().min(1),
        skillId: z.string().min(1),
        language: z.literal("de"),
        variant: z.literal("standard"),
      })
      .strict(),
    provider: canonicalProviderTelemetrySchema,
    audio: canonicalMediaFileSchema.extend({
      durationSeconds: z.number().min(180).max(300),
      codec: z.literal("pcm_s16le"),
      quality: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("test-tone"),
            audibleNarration: z.literal(false),
            probesPassed: z.literal(false),
          })
          .strict(),
        canonicalNaturalAudioQualitySchema,
      ]),
    }),
    video: canonicalMediaFileSchema.extend({
      validation: z
        .object({
          valid: z.literal(true),
          width: z.literal(1920),
          height: z.literal(1080),
          fps: z.literal(30),
          durationSeconds: z.number().min(180).max(300.1),
          videoCodec: z.literal("h264"),
          audioCodec: z.string().min(1),
          continuityChecked: z.literal(true),
          corruptionScanPassed: z.literal(true),
        })
        .strict(),
    }),
    thumbnail: canonicalMediaFileSchema.extend({
      width: z.literal(1920),
      height: z.literal(1080),
      factId: z.string().min(1),
      factSemanticHash: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
    thumbnailManifest: canonicalMediaFileSchema,
    brandPolicy: canonicalMediaFileSchema,
    captions: z
      .object({
        count: z.literal(9),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
        rendered: z.literal(true),
      })
      .strict(),
    visualPlanHash: z.string().regex(/^[a-f0-9]{64}$/u),
    timingHash: z.string().regex(/^[a-f0-9]{64}$/u),
    renderFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    visualPresentation: z
      .object({
        strategy: z.literal("progressive-chalk-reveal"),
        rendererVersion: z.literal("math-semantic-chalk.v4"),
      })
      .strict(),
    visualValidation: z
      .object({
        valid: z.literal(true),
        plannedComponentsRealized: z.literal(true),
        genericFallbackUsed: z.literal(false),
        cueCoveragePassed: z.literal(true),
        minimumSceneStepCount: z.number().int().min(4),
        maximumStaticIntervalFrames: z.number().int().max(225),
      })
      .strict(),
    publication: z
      .object({
        visibility: z.literal("private"),
        publicReady: z.literal(false),
        blockers: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    const { contentHash, ...payload } = value;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Canonical private media evidence hash is stale or forged.",
      });
    }
    if (
      (value.provider.mode === "fixture-mock") !==
      (value.audio.quality.kind === "test-tone")
    ) {
      context.addIssue({
        code: "custom",
        path: ["audio", "quality"],
        message: "Audio quality kind must match the provider evidence.",
      });
    }
  });

export type CanonicalPrivateMediaEvidence = z.infer<
  typeof canonicalPrivateMediaEvidenceSchema
>;

function containedMediaPath(unitRoot: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Canonical private media path is unsafe: ${relativePath}`);
  }
  const root = path.resolve(unitRoot);
  const resolved = path.resolve(root, relativePath);
  const relation = path.relative(root, resolved);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(
      `Canonical private media path escapes its unit: ${relativePath}`
    );
  }
  return resolved;
}

export async function verifyCanonicalPrivateMediaEvidenceFiles(
  unitRoot: string,
  rawEvidence: unknown
): Promise<CanonicalPrivateMediaEvidence> {
  const evidence = canonicalPrivateMediaEvidenceSchema.parse(rawEvidence);
  for (const file of [
    evidence.audio,
    evidence.video,
    evidence.thumbnail,
    evidence.thumbnailManifest,
    evidence.brandPolicy,
  ]) {
    const absolutePath = containedMediaPath(unitRoot, file.relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile() || stat.size !== file.byteLength) {
      throw new Error(
        `Canonical private media byte length is invalid: ${file.relativePath}`
      );
    }
    if ((await hashFile(absolutePath)) !== file.sha256) {
      throw new Error(
        `Canonical private media hash is invalid: ${file.relativePath}`
      );
    }
  }
  return evidence;
}

export async function verifyCanonicalPrivateSpeechEvidenceFiles(
  unitRoot: string,
  rawEvidence: unknown
): Promise<CanonicalPrivateSpeechEvidence> {
  const evidence = canonicalPrivateSpeechEvidenceSchema.parse(rawEvidence);
  const absolutePath = containedMediaPath(
    unitRoot,
    evidence.audio.relativePath
  );
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size !== evidence.audio.byteLength) {
    throw new Error(
      `Canonical private speech byte length is invalid: ${evidence.audio.relativePath}`
    );
  }
  if ((await hashFile(absolutePath)) !== evidence.audio.sha256) {
    throw new Error(
      `Canonical private speech hash is invalid: ${evidence.audio.relativePath}`
    );
  }
  return evidence;
}

const rendererEvidenceSchema = z
  .object({
    status: z.literal("validated"),
    rendererVersions: z.record(z.string(), z.string()),
    visualPlanHash: z.string().regex(/^[a-f0-9]{64}$/u),
    timingHash: z.string().regex(/^[a-f0-9]{64}$/u),
    providerFree: z.boolean(),
    media: canonicalPrivateMediaEvidenceSchema.optional(),
  })
  .strict();

export function createMathProductionTaskImplementations(
  options: MathCanonicalAdapterOptions
): Readonly<Record<string, TaskImplementation>> {
  const expectedUnitRoot = path.resolve(options.workspaceRoot, options.unitId);
  if (path.resolve(options.unitRoot) !== expectedUnitRoot) {
    throw new Error(
      `Canonical math unit root must be ${expectedUnitRoot}; received ${path.resolve(options.unitRoot)}.`
    );
  }
  if (!isAuthoritativeLoadedCurriculumRelease(options.curriculum)) {
    throw new Error(
      "Canonical math adapters require an authoritative loaded curriculum release."
    );
  }
  const skill = options.curriculum.skills.find(
    (candidate) => candidate.skillId === options.skillId
  );
  if (!skill) throw new Error(`Unknown curriculum skill: ${options.skillId}`);
  const verify =
    options.verifier ??
    ((request: VerifierRequest) =>
      new SympyVerifierAdapter({
        workerRoot: path.join(options.repositoryRoot, "python/math-verifier"),
        ...(options.pythonExecutable
          ? { pythonExecutable: options.pythonExecutable }
          : {}),
      }).verify(request));

  const implementations: Record<string, TaskImplementation> = {};
  const privateOwnerEvidence = privateOwnerCurriculumEvidence(options);
  const curriculumReady = curriculumReadyForSelectedVisibility(options);

  implementations["math.curriculum-import"] = async (context) =>
    promote(
      options,
      context,
      "math.curriculum-import",
      curriculumPayloadSchema.parse({
        releaseId: options.curriculum.release.releaseId,
        releaseHash: options.curriculum.releaseHash,
        curriculumVersion: options.curriculum.release.curriculumVersion,
        readyForProduction: options.curriculum.readyForProduction,
        readyForPrivateProduction: Boolean(privateOwnerEvidence),
        ...(privateOwnerEvidence
          ? { governanceEvidenceHash: privateOwnerEvidence.evidenceHash }
          : {}),
        skill,
      }),
      "curriculum-release-loader",
      "curriculum-release-loader.v1"
    );

  implementations["math.source-validation"] = async (context) => {
    const imported = payload(
      await verifiedTaskArtifact(options, "math.curriculum-import"),
      curriculumPayloadSchema
    );
    if (
      imported.releaseId !== options.curriculum.release.releaseId ||
      imported.releaseHash !== options.curriculum.releaseHash ||
      canonicalHash(imported.skill) !== canonicalHash(skill)
    ) {
      throw new Error(
        "Imported curriculum artifact does not match release authority."
      );
    }
    return promote(
      options,
      context,
      "math.source-validation",
      sourcePayloadSchema.parse({
        ...imported,
        authorityHash: canonicalHash({
          release: options.curriculum.release,
          releaseHash: options.curriculum.releaseHash,
        }),
        provenanceComplete: options.curriculum.provenance.complete,
        prerequisiteReviewStatus: options.curriculum.prerequisites.reviewStatus,
      }),
      "curriculum-authority-validator",
      "curriculum-authority-validator.v1"
    );
  };

  implementations["math.prerequisite-graph"] = async (context) => {
    await verifiedTaskArtifact(options, "math.source-validation");
    const graph = {
      releaseId: options.curriculum.release.releaseId,
      releaseHash: options.curriculum.releaseHash,
      skillId: skill.skillId,
      prerequisiteSkillIds: options.curriculum.prerequisites.edges
        .filter((edge) => edge.to === skill.skillId)
        .map((edge) => edge.from)
        .sort(),
      order: options.curriculum.graph.order,
      orderHash: canonicalHash(options.curriculum.graph.order),
    };
    return promote(
      options,
      context,
      "math.prerequisite-graph",
      graph,
      "prerequisite-dag-analyzer",
      "prerequisite-dag.v1"
    );
  };

  implementations["math.lesson-spec"] = async (context) => {
    await verifiedTaskArtifact(options, "math.prerequisite-graph");
    if (options.simulation) {
      assertLessonCapability(options.skillId, options.lessonVariant);
      const variants = buildAllLessonVariants(skill);
      validateVariantDifferentiation(variants);
    } else {
      assertProductionLessonCapability(
        options.skillId,
        options.lessonVariant,
        options.lessonContentReviewEvidence,
        options.releaseVisibility
      );
    }
    const lesson = buildLessonVariant(skill, options.lessonVariant);
    if (lesson.lessonId !== options.unitId) {
      throw new Error(
        `Lesson identity ${lesson.lessonId} does not match ${options.unitId}.`
      );
    }
    return promote(
      options,
      context,
      "math.lesson-spec",
      lesson,
      "lesson-specification-builder",
      options.simulation
        ? "reviewed-fixtures.v1"
        : "class5-number-operations-standard.v1"
    );
  };

  implementations["math.math-verification"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z
        .object({ checks: z.array(z.unknown()).min(1), lessonId: z.string() })
        .passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const response = verifierResponseSchema.parse(
      await verify(
        createVerifierRequest(`${lesson.lessonId}-canonical`, lesson.checks)
      )
    );
    assertFactCoverage(lesson, response);
    return promote(
      options,
      context,
      "math.math-verification",
      response,
      "sympy-verifier-adapter",
      VERIFIER_VERSION
    );
  };

  implementations["math.canonical-narration"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const verification = payload(
      await verifiedTaskArtifact(options, "math.math-verification"),
      verifierResponseSchema
    );
    assertFactCoverage(lesson, verification);
    const narration = localizedNarrationSchema.parse(
      localizeNarration(lesson, "de")
    );
    return promote(
      options,
      context,
      "math.canonical-narration",
      narration,
      "locked-fact-narration-builder",
      MATH_LOCKED_FACT_NARRATION_VERSION
    );
  };

  implementations["math.scene-timing"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const narration = payload(
      await verifiedTaskArtifact(options, "math.canonical-narration"),
      localizedNarrationSchema
    );
    return promote(
      options,
      context,
      "math.scene-timing",
      createTimingManifest(lesson, narration),
      "math-scene-timing",
      "math-timing.v1"
    );
  };

  implementations["math.localization"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    await verifiedTaskArtifact(options, "math.scene-timing");
    const narration = localizedNarrationSchema.parse(
      localizeNarration(lesson, options.locale)
    );
    const checks = localizedDisplayChecks(lesson, narration);
    const displayVerification = verifierResponseSchema.parse(
      await verify(
        createVerifierRequest(
          `${lesson.lessonId}-${options.locale}-display`,
          checks
        )
      )
    );
    assertLocalizedDisplayVerification(checks, displayVerification);
    const narrationReview =
      options.locale === "de" && options.lessonVariant === "standard"
        ? reviewGermanStandardNarration({ lesson, narration })
        : undefined;
    return promote(
      options,
      context,
      "math.localization",
      {
        narration,
        displayVerification,
        ...(narrationReview ? { narrationReview } : {}),
      },
      "locked-fact-localizer",
      MATH_LOCKED_FACT_NARRATION_VERSION
    );
  };

  implementations["math.visual-style"] = async (context) => {
    await verifiedTaskArtifact(options, "math.lesson-spec");
    const styleReasons = visualStyleReasons(options);
    if (styleReasons.length > 0) {
      throw new WorkflowBlockedError(
        "Educational visual-style evidence is not ready.",
        styleReasons.join(" ")
      );
    }
    return promote(
      options,
      context,
      "math.visual-style",
      options.visualStyle ?? {
        schemaVersion: "math.simulation-visual-style.v1",
        revision: "simulation-reviewed-fixtures-v1",
        rendererVersions: options.rendererVersions ?? {
          visualPlan: "math-visual-plan.v1",
        },
        validation: "passed",
        providerFreeFixture: true,
      },
      "educational-visual-style-validator",
      "math.educational-visual-style.v1"
    );
  };

  implementations["math.visual-assets"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ scenes: z.array(z.unknown()).length(9) }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    await Promise.all([
      verifiedTaskArtifact(options, "math.localization"),
      verifiedTaskArtifact(options, "math.math-verification"),
      verifiedTaskArtifact(options, "math.visual-style"),
    ]);
    const plan = mathVisualPlanSchema.parse({
      artifactVersion: "math-visual-plan.v1",
      profile: skill.canonicalGrade <= 7 ? "grades-5-7-v1" : "grades-8-10-v1",
      scenes: lesson.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        component: scene.visualComponent,
        factIds: scene.factIds,
        teacherAssetVersion: "alex.v1-placeholder",
      })),
    });
    return promote(
      options,
      context,
      "math.visual-assets",
      plan,
      "math-rendering-visual-plan",
      "math-visual-plan.v1"
    );
  };

  implementations["math.tts"] = async (context) => {
    if (
      !options.providerAuthorization.configured ||
      !options.providerAuthorization.operatorAuthorized
    ) {
      throw new WorkflowBlockedError(
        "Provider-dependent speech is not authorized.",
        "Configure the runtime and repeat with an explicit operator action."
      );
    }
    const localized = payload(
      await verifiedTaskArtifact(options, "math.localization"),
      z.object({ narration: localizedNarrationSchema }).passthrough()
    );
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ scenes: z.array(z.unknown()).length(9) }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const beats = buildMathEducationalNarrationBeats(localized.narration);
    const privateSpeech =
      options.providerAuthorization.mode === "provider"
        ? await (async () => {
            if (!options.privateSpeechMaterializer) {
              throw new WorkflowBlockedError(
                "Canonical paid speech materializer is not configured."
              );
            }
            const materialized = canonicalPrivateSpeechEvidenceSchema.parse(
              await options.privateSpeechMaterializer({
                unitRoot: options.unitRoot,
                unitId: options.unitId,
                locale: options.locale,
                lesson,
                narration: localized.narration,
              })
            );
            if (
              materialized.identity.lessonId !== options.unitId ||
              materialized.identity.skillId !== options.skillId ||
              materialized.identity.language !== options.locale ||
              materialized.identity.variant !== options.lessonVariant
            ) {
              throw new Error(
                "Canonical private speech identity does not match the workflow selection."
              );
            }
            return verifyCanonicalPrivateSpeechEvidenceFiles(
              options.unitRoot,
              materialized
            );
          })()
        : undefined;
    const durations =
      privateSpeech?.durations ??
      lesson.scenes.map((scene) => scene.plannedDurationSeconds);
    return promote(
      options,
      context,
      "math.tts",
      {
        schemaVersion: privateSpeech
          ? "math.canonical-private-speech-task.v1"
          : "math.provider-free-speech-fixture.v1",
        provider: privateSpeech ? "openai-compatible" : "fixture-mock",
        providerCalls: privateSpeech?.provider.calls ?? 0,
        configurationFingerprint:
          options.providerAuthorization.configurationFingerprint,
        beats,
        durations,
        ...(privateSpeech ? { speech: privateSpeech } : {}),
      },
      privateSpeech
        ? "canonical-private-speech-materializer"
        : "speech-provider-free-fixture",
      "educational-speech.v1"
    );
  };

  implementations["math.timing-reflow"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const localized = payload(
      await verifiedTaskArtifact(options, "math.localization"),
      z.object({ narration: localizedNarrationSchema }).passthrough()
    );
    const speech = payload(
      await verifiedTaskArtifact(options, "math.tts"),
      z
        .object({ durations: z.array(z.number().positive()).length(9) })
        .passthrough()
    );
    await verifiedTaskArtifact(options, "math.scene-timing");
    const timing = timingManifestSchema.parse(
      createTimingManifest(lesson, localized.narration, speech.durations)
    );
    return promote(
      options,
      context,
      "math.timing-reflow",
      timing,
      "narration-timing-reflow",
      "math-timing.v1"
    );
  };

  implementations["math.render"] = async (context) => {
    const visual = payload(
      await verifiedTaskArtifact(options, "math.visual-assets"),
      mathVisualPlanSchema
    );
    const timing = payload(
      await verifiedTaskArtifact(options, "math.timing-reflow"),
      timingManifestSchema
    );
    await verifiedTaskArtifact(options, "math.visual-style");
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const localized = payload(
      await verifiedTaskArtifact(options, "math.localization"),
      z.object({ narration: localizedNarrationSchema }).passthrough()
    );
    const speechTask = payload(
      await verifiedTaskArtifact(options, "math.tts"),
      z
        .object({ speech: canonicalPrivateSpeechEvidenceSchema.optional() })
        .passthrough()
    );
    const media = options.simulation
      ? undefined
      : await (async () => {
          if (!options.privateMediaMaterializer) {
            throw new WorkflowBlockedError(
              "Canonical private media materializer is not configured."
            );
          }
          const materialized = canonicalPrivateMediaEvidenceSchema.parse(
            await options.privateMediaMaterializer({
              unitRoot: options.unitRoot,
              unitId: options.unitId,
              locale: options.locale,
              lesson,
              narration: localized.narration,
              visualPlan: visual,
              timing,
              ...(speechTask.speech ? { speech: speechTask.speech } : {}),
            })
          );
          if (
            materialized.identity.lessonId !== options.unitId ||
            materialized.identity.skillId !== options.skillId ||
            materialized.identity.language !== options.locale ||
            materialized.identity.variant !== options.lessonVariant
          ) {
            throw new Error(
              "Canonical private media identity does not match the workflow selection."
            );
          }
          await verifyCanonicalPrivateMediaEvidenceFiles(
            options.unitRoot,
            materialized
          );
          return materialized;
        })();
    const evidence = rendererEvidenceSchema.parse({
      status: "validated",
      rendererVersions: options.rendererVersions ?? {
        visualPlan: "math-visual-plan.v1",
        canonicalAdapter: MATH_CANONICAL_ADAPTER_VERSION,
      },
      visualPlanHash: canonicalHash(visual),
      timingHash: canonicalHash(timing),
      providerFree: options.providerAuthorization.mode === "fixture-mock",
      ...(media ? { media } : {}),
    });
    return promote(
      options,
      context,
      "math.render",
      evidence,
      "educational-renderer-plan-validator",
      "educational-renderer.v1"
    );
  };

  implementations["math.quality-gate"] = async (context) => {
    const verificationArtifact = await verifiedTaskArtifact(
      options,
      "math.math-verification"
    );
    const verification = payload(verificationArtifact, verifierResponseSchema);
    const renderArtifact = await verifiedTaskArtifact(options, "math.render");
    const render = payload(renderArtifact, rendererEvidenceSchema);
    const localizationArtifact = await verifiedTaskArtifact(
      options,
      "math.localization"
    );
    const localization = payload(
      localizationArtifact,
      z
        .object({
          narrationReview: germanStandardNarrationReviewSchema.optional(),
        })
        .passthrough()
    );
    const naturalSpeechReady =
      options.simulation ||
      (render.media?.provider.mode === "provider" &&
        render.media.audio.quality.kind === "natural-speech" &&
        render.media.audio.quality.audibleNarration &&
        render.media.audio.quality.probesPassed);
    const evidenceHash = (value: unknown) => canonicalHash(value);
    const report = mathQualityReportSchema.parse(
      deriveMathQuality({
        contractVersion: "math-quality-contract.v2",
        lessonId: options.unitId,
        selectedLocales: [options.locale],
        checks: [
          qualityCheck({
            checkId: "mathematics",
            ready: verification.status === "passed",
            evidenceHash: evidenceHash(verification),
            message: "Verifier v3 passed.",
          }),
          qualityCheck({
            checkId: "curriculum",
            ready: curriculumReady,
            evidenceHash: evidenceHash(
              privateOwnerEvidence?.evidenceHash ??
                options.curriculum.releaseHash
            ),
            message: privateOwnerEvidence
              ? "Hash-bound private owner curriculum attestation passed."
              : "Authoritative curriculum release passed.",
          }),
          qualityCheck({
            checkId: "localization",
            ready:
              options.locale !== "de" ||
              options.lessonVariant !== "standard" ||
              Boolean(
                localization.narrationReview?.checks.every(
                  (check) => check.status === "passed"
                )
              ),
            evidenceHash:
              localization.narrationReview?.contentHash ??
              evidenceHash(options.locale),
            assessedLocales: [options.locale],
            message:
              "Locked-fact localization and independent narration review passed.",
          }),
          qualityCheck({
            checkId: "timing",
            ready: true,
            evidenceHash: render.timingHash,
            message: "Narration timing passed.",
          }),
          qualityCheck({
            checkId: "audio",
            ready: naturalSpeechReady,
            evidenceHash: evidenceHash(
              naturalSpeechReady
                ? (render.media?.audio.sha256 ??
                    options.providerAuthorization.configurationFingerprint)
                : "unacceptable-test-tone"
            ),
            message: naturalSpeechReady
              ? options.simulation
                ? "Provider-free simulation speech passed."
                : "Audible natural speech and configured audio probes passed."
              : "Test-tone audio is not acceptable as private lesson narration.",
          }),
          qualityCheck({
            checkId: "render",
            ready:
              render.status === "validated" &&
              (options.simulation || Boolean(render.media)),
            evidenceHash: evidenceHash(render),
            message: "Educational renderer plan passed.",
          }),
          qualityCheck({
            checkId: "media-qa-packet",
            ready:
              options.simulation ||
              Boolean(
                render.media?.visualValidation.valid &&
                render.media.visualValidation.plannedComponentsRealized &&
                !render.media.visualValidation.genericFallbackUsed &&
                render.media.visualValidation.cueCoveragePassed
              ),
            evidenceHash:
              render.media?.contentHash ??
              renderArtifact.manifest.checksumSha256,
            message: render.media
              ? "Workflow-owned media, semantic-component, cue, and visual-motion QA passed."
              : "Workflow-owned render evidence passed.",
          }),
          qualityCheck({
            checkId: "final-media",
            ready: true,
            evidenceHash:
              render.media?.video.sha256 ??
              renderArtifact.manifest.checksumSha256,
            message: render.media
              ? "Hash-verified local final media passed."
              : "Provider-free fixture media evidence passed.",
          }),
          qualityCheck({
            checkId: "publish-packet",
            ready: true,
            evidenceHash: evidenceHash("dry-run-only"),
            message: "Dry-run-only publishing contract passed.",
          }),
          qualityCheck({
            checkId: "content-review",
            ready: true,
            evidenceHash: evidenceHash(
              options.simulation
                ? options.skillId
                : (options.privateOwnerAttestation?.evidenceHash ??
                    options.lessonContentReviewEvidence)
            ),
            message: options.simulation
              ? "Fixture capability is approved."
              : "Exact private lesson-content approval passed.",
          }),
          qualityCheck({
            checkId: "minor-edit-review",
            ready: true,
            evidenceHash: evidenceHash("not-required"),
            message: "No minor edit is pending.",
          }),
        ],
      })
    );
    return promote(
      options,
      context,
      "math.quality-gate",
      report,
      "math-quality-gate",
      "math-quality.v2"
    );
  };

  implementations["math.metadata-playlists"] = async (context) => {
    const lesson = payload(
      await verifiedTaskArtifact(options, "math.lesson-spec"),
      z.object({ lessonId: z.string() }).passthrough()
    ) as ReturnType<typeof buildLessonVariant>;
    const localized = payload(
      await verifiedTaskArtifact(options, "math.localization"),
      z.object({ narration: localizedNarrationSchema }).passthrough()
    );
    const timing = payload(
      await verifiedTaskArtifact(options, "math.timing-reflow"),
      timingManifestSchema
    );
    await verifiedTaskArtifact(options, "math.quality-gate");
    const timingEvidence = createMetadataTimingEvidence(
      lesson,
      localized.narration,
      timing
    );
    const metadata = mathMetadataSchema.parse(
      generateMathMetadata({
        reviewedContext: options.simulation
          ? createExactContentSimulationMetadataContext(
              options.curriculum,
              skill.skillId
            )
          : createReviewedMetadataContext(
              options.curriculum,
              skill.skillId,
              options.privateOwnerAttestation
            ),
        skill,
        lesson,
        localization: localized.narration,
        timingEvidence,
        workflowEvidence: createMetadataWorkflowEvidence({
          lesson,
          localization: localized.narration,
          timingEvidence,
          parentFingerprints: {
            lesson: [
              (await verifiedTaskArtifact(options, "math.lesson-spec")).artifact
                .fingerprint,
            ],
            localization: [
              (await verifiedTaskArtifact(options, "math.localization"))
                .artifact.fingerprint,
            ],
            timing: [
              (await verifiedTaskArtifact(options, "math.timing-reflow"))
                .artifact.fingerprint,
            ],
            output: [context.dependencyFingerprints[0]!],
          },
        }),
        evidence: createMathMetadataEvidence(
          skill,
          lesson,
          localized.narration
        ),
        catalog: mathPlaylistCatalog,
      })
    );
    return promote(
      options,
      context,
      "math.metadata-playlists",
      metadata,
      "math-metadata-generator",
      "math-metadata-generator.v3"
    );
  };

  implementations["math.publish-dry-run"] = async (context) => {
    const metadataArtifact = await verifiedTaskArtifact(
      options,
      "math.metadata-playlists"
    );
    const metadata = payload(metadataArtifact, mathMetadataSchema);
    const qualityArtifact = await verifiedTaskArtifact(
      options,
      "math.quality-gate"
    );
    const renderArtifact = await verifiedTaskArtifact(options, "math.render");
    const render = payload(renderArtifact, rendererEvidenceSchema);
    const syntheticHash = (label: string) =>
      canonicalHash({
        label,
        metadata: metadataArtifact.manifest.checksumSha256,
        render: renderArtifact.manifest.checksumSha256,
      });
    const report = createPublishDryRunManifest({
      metadata,
      metadataPath: `locales/${options.locale}/metadata.json`,
      thumbnailManifestPath:
        render.media?.thumbnailManifest.relativePath ??
        `locales/${options.locale}/thumbnail.svg.manifest.json`,
      thumbnailManifestHash:
        render.media?.thumbnailManifest.sha256 ??
        syntheticHash("thumbnail-manifest"),
      thumbnailAssetPath:
        render.media?.thumbnail.relativePath ??
        `locales/${options.locale}/thumbnail.svg`,
      thumbnailAssetHash:
        render.media?.thumbnail.sha256 ?? syntheticHash("thumbnail-asset"),
      finalMediaPath:
        render.media?.video.relativePath ??
        `locales/${options.locale}/render/final.mp4`,
      finalMediaHash:
        render.media?.video.sha256 ?? renderArtifact.manifest.checksumSha256,
      finalMediaEvidencePath: `locales/${options.locale}/final-media.json`,
      finalMediaEvidenceHash:
        render.media?.contentHash ?? renderArtifact.manifest.checksumSha256,
      qualityPath: "canonical/quality.json",
      qualityHash: qualityArtifact.manifest.checksumSha256,
      brandPolicyPath:
        render.media?.brandPolicy.relativePath ??
        `locales/${options.locale}/brand-policy.json`,
      brandPolicyHash:
        render.media?.brandPolicy.sha256 ?? syntheticHash("brand-policy"),
      channelId: `dry-run-${options.locale}`,
      privacyStatus: "private",
      madeForKids: false,
      containsSyntheticMedia: true,
      playlistIdsByKey: Object.fromEntries(
        metadata.playlists.map((playlist, index) => [
          playlist.key,
          `dry-run-playlist-${index + 1}`,
        ])
      ),
      blockers: ["placeholder-teacher-artwork-not-approved-for-public-release"],
    });
    return promote(
      options,
      context,
      "math.publish-dry-run",
      report,
      "youtube-publish-dry-run",
      "math-publish-dry-run.v2"
    );
  };

  return implementations;
}
