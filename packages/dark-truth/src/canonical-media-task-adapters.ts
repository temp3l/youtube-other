import crypto from "node:crypto";
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
  WorkflowInterruptedError,
  type TaskExecutionContext,
  type TaskExecutionResult,
  type TaskImplementation,
  type WorkflowStore,
} from "@mediaforge/workflow-engine";
import { z } from "zod";

import {
  DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS,
  verifyCanonicalDarkTruthStoryArtifact,
  type DarkTruthProviderAuthorization,
  type DarkTruthStoryExecutableTaskId,
} from "./canonical-story-task-adapters.js";
import { DARK_TRUTH_TASK_REGISTRY_VERSION } from "./task-registry.js";

export const DARK_TRUTH_CANONICAL_MEDIA_ADAPTER_VERSION =
  "darktruth.canonical-media-adapters.v1" as const;
export const DARK_TRUTH_CANONICAL_MEDIA_ARTIFACT_VERSION =
  "darktruth.canonical-media-task-artifact.v1" as const;

export const DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS = [
  "darktruth.shot-plan",
  "darktruth.reference-plan",
  "darktruth.reference-prepare",
  "darktruth.reference-validate",
  "darktruth.scene-images",
  "darktruth.quality-visual-continuity",
  "darktruth.thumbnail-concept",
  "darktruth.thumbnail-generate",
  "darktruth.thumbnail-validate",
  "darktruth.narration-instructions",
  "darktruth.audio-generate",
  "darktruth.audio-validate",
  "darktruth.captions",
  "darktruth.render",
  "darktruth.quality-audiovisual",
  "darktruth.metadata",
  "darktruth.publish-dry-run",
] as const;

export type DarkTruthMediaExecutableTaskId =
  (typeof DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS)[number];

const externalEffectTaskIds = new Set<DarkTruthMediaExecutableTaskId>([
  "darktruth.reference-prepare",
  "darktruth.scene-images",
  "darktruth.thumbnail-concept",
  "darktruth.thumbnail-generate",
  "darktruth.audio-generate",
  "darktruth.metadata",
]);

const ownerByTask = {
  "darktruth.shot-plan": "@mediaforge/visual-planning",
  "darktruth.reference-plan": "@mediaforge/visual-planning",
  "darktruth.reference-prepare": "@mediaforge/image-generation",
  "darktruth.reference-validate": "@mediaforge/image-generation",
  "darktruth.scene-images": "@mediaforge/image-generation",
  "darktruth.quality-visual-continuity": "@mediaforge/visual-planning",
  "darktruth.thumbnail-concept": "@mediaforge/visual-planning",
  "darktruth.thumbnail-generate": "@mediaforge/image-generation",
  "darktruth.thumbnail-validate": "@mediaforge/image-generation",
  "darktruth.narration-instructions": "@mediaforge/speech",
  "darktruth.audio-generate": "@mediaforge/speech",
  "darktruth.audio-validate": "@mediaforge/speech",
  "darktruth.captions": "@mediaforge/alignment",
  "darktruth.render": "@mediaforge/rendering",
  "darktruth.quality-audiovisual": "@mediaforge/rendering",
  "darktruth.metadata": "@mediaforge/metadata",
  "darktruth.publish-dry-run": "@mediaforge/youtube-upload",
} as const satisfies Record<
  DarkTruthMediaExecutableTaskId,
  `@mediaforge/${string}`
>;

const outputKindByTask = {
  "darktruth.shot-plan": "shot-plan",
  "darktruth.reference-plan": "reference-manifest",
  "darktruth.reference-prepare": "reference-manifest",
  "darktruth.reference-validate": "quality-assessment",
  "darktruth.scene-images": "image",
  "darktruth.quality-visual-continuity": "quality-assessment",
  "darktruth.thumbnail-concept": "thumbnail",
  "darktruth.thumbnail-generate": "thumbnail",
  "darktruth.thumbnail-validate": "quality-assessment",
  "darktruth.narration-instructions": "narration",
  "darktruth.audio-generate": "narration",
  "darktruth.audio-validate": "quality-assessment",
  "darktruth.captions": "captions",
  "darktruth.render": "render",
  "darktruth.quality-audiovisual": "quality-assessment",
  "darktruth.metadata": "metadata",
  "darktruth.publish-dry-run": "publish-report",
} as const satisfies Record<DarkTruthMediaExecutableTaskId, ArtifactKind>;

const dependencyPayloadTaskIds = {
  "darktruth.shot-plan": [],
  "darktruth.reference-plan": ["darktruth.shot-plan"],
  "darktruth.reference-prepare": ["darktruth.reference-plan"],
  "darktruth.reference-validate": ["darktruth.reference-prepare"],
  "darktruth.scene-images": [
    "darktruth.shot-plan",
    "darktruth.reference-prepare",
    "darktruth.reference-validate",
  ],
  "darktruth.quality-visual-continuity": ["darktruth.scene-images"],
  "darktruth.thumbnail-concept": [
    "darktruth.reference-prepare",
    "darktruth.reference-validate",
  ],
  "darktruth.thumbnail-generate": ["darktruth.thumbnail-concept"],
  "darktruth.thumbnail-validate": ["darktruth.thumbnail-generate"],
  "darktruth.narration-instructions": [],
  "darktruth.audio-generate": ["darktruth.narration-instructions"],
  "darktruth.audio-validate": ["darktruth.audio-generate"],
  "darktruth.captions": [
    "darktruth.audio-generate",
    "darktruth.audio-validate",
  ],
  "darktruth.render": [
    "darktruth.scene-images",
    "darktruth.quality-visual-continuity",
    "darktruth.audio-generate",
    "darktruth.audio-validate",
    "darktruth.captions",
  ],
  "darktruth.quality-audiovisual": ["darktruth.render"],
  "darktruth.metadata": [
    "darktruth.quality-audiovisual",
    "darktruth.thumbnail-validate",
  ],
  "darktruth.publish-dry-run": [
    "darktruth.metadata",
    "darktruth.render",
    "darktruth.quality-audiovisual",
    "darktruth.thumbnail-generate",
    "darktruth.thumbnail-validate",
  ],
} as const satisfies Record<
  DarkTruthMediaExecutableTaskId,
  readonly DarkTruthMediaExecutableTaskId[]
>;

const storySourceTaskIds = {
  "darktruth.shot-plan": ["darktruth.rewrite-full"],
  "darktruth.reference-plan": ["darktruth.episode-bible"],
  "darktruth.reference-prepare": [],
  "darktruth.reference-validate": [],
  "darktruth.scene-images": [],
  "darktruth.quality-visual-continuity": [],
  "darktruth.thumbnail-concept": [
    "darktruth.episode-bible",
    "darktruth.rewrite-full",
  ],
  "darktruth.thumbnail-generate": [],
  "darktruth.thumbnail-validate": [],
  "darktruth.narration-instructions": [
    "darktruth.localize",
    "darktruth.quality-localization",
  ],
  "darktruth.audio-generate": [],
  "darktruth.audio-validate": [],
  "darktruth.captions": [],
  "darktruth.render": [],
  "darktruth.quality-audiovisual": [],
  "darktruth.metadata": [
    "darktruth.localize",
    "darktruth.quality-localization",
  ],
  "darktruth.publish-dry-run": [],
} as const satisfies Record<
  DarkTruthMediaExecutableTaskId,
  readonly DarkTruthStoryExecutableTaskId[]
>;

const approvalTaskIds = [
  "darktruth.story-approval",
  "darktruth.reference-approval",
] as const;
export type DarkTruthMediaApprovalTaskId = (typeof approvalTaskIds)[number];

export const canonicalDarkTruthMediaArtifactSchema = z
  .object({
    schemaVersion: z.literal(DARK_TRUTH_CANONICAL_MEDIA_ARTIFACT_VERSION),
    adapterVersion: z.literal(DARK_TRUTH_CANONICAL_MEDIA_ADAPTER_VERSION),
    taskId: z.enum(DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS),
    owner: z.string().regex(/^@mediaforge\/[a-z0-9-]+$/u),
    identity: z
      .object({
        unitId: z.string().min(1),
        locale: z.string().min(2),
        variant: z.string().min(1),
      })
      .strict(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    dependencyFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
    evidence: z
      .object({
        payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        dependencyTaskIds: z.array(
          z.enum(DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS)
        ),
        storySources: z.array(
          z
            .object({
              taskId: z.enum(DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS),
              fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
              payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            })
            .strict()
        ),
        approvalBindings: z.array(
          z
            .object({
              taskId: z.enum(approvalTaskIds),
              approvalId: z.string().min(1),
              boundRevision: z.string().min(1),
              evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
            })
            .strict()
        ),
      })
      .strict(),
    validation: z
      .object({
        validatorId: z.string().min(1).max(160),
        validatorVersion: z.string().min(1).max(80),
        status: z.literal("passed"),
      })
      .strict(),
    payload: z.json(),
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

export type CanonicalDarkTruthMediaArtifact = z.infer<
  typeof canonicalDarkTruthMediaArtifactSchema
>;

export interface DarkTruthCanonicalMediaServiceInput {
  readonly taskId: DarkTruthMediaExecutableTaskId;
  readonly unitId: string;
  readonly locale: string;
  readonly variant: string;
  readonly dependencies: Readonly<
    Partial<Record<DarkTruthMediaExecutableTaskId, unknown>>
  >;
  readonly storySources: Readonly<
    Partial<Record<DarkTruthStoryExecutableTaskId, unknown>>
  >;
  readonly approvalBindings: Readonly<
    Partial<
      Record<DarkTruthMediaApprovalTaskId, DarkTruthMediaApprovalEvidence>
    >
  >;
  readonly signal: AbortSignal;
}

export interface DarkTruthCanonicalStorySource {
  readonly taskId: DarkTruthStoryExecutableTaskId;
  readonly fingerprint: string;
  readonly payloadSha256: string;
  readonly payload: unknown;
}

export interface DarkTruthCanonicalStorySourcePort {
  load(input: {
    readonly taskId: DarkTruthStoryExecutableTaskId;
    readonly unitId: string;
    readonly locale: string;
    readonly variant: string;
    readonly signal: AbortSignal;
  }): Promise<DarkTruthCanonicalStorySource>;
}

export interface DarkTruthMediaApprovalEvidence {
  readonly taskId: DarkTruthMediaApprovalTaskId;
  readonly approvalId: string;
  readonly boundRevision: string;
  readonly evidenceFingerprint: string;
}

export interface DarkTruthApprovalBindingPort {
  load(input: {
    readonly taskId: DarkTruthMediaApprovalTaskId;
    readonly unitId: string;
    readonly signal: AbortSignal;
  }): Promise<DarkTruthMediaApprovalEvidence>;
}

export interface DarkTruthCanonicalMediaServiceResult {
  readonly payload: unknown;
  readonly validation: {
    readonly validatorId: string;
    readonly validatorVersion: string;
    readonly status: "passed";
  };
  readonly warnings?: readonly string[];
  readonly providerEvidence?: {
    readonly provider: string;
    readonly model?: string;
    readonly providerRequestId?: string;
  };
}

export interface DarkTruthCanonicalMediaService {
  readonly providerMode: "none" | "fake" | "external";
  execute(
    input: DarkTruthCanonicalMediaServiceInput
  ): Promise<DarkTruthCanonicalMediaServiceResult>;
}

export interface DarkTruthCanonicalMediaAdapterOptions {
  readonly workspaceRoot: string;
  readonly unitRoot: string;
  readonly unitId: string;
  readonly policyRevision: string;
  readonly store: WorkflowStore;
  readonly repository: ArtifactRepository;
  readonly services: Readonly<
    Record<DarkTruthMediaExecutableTaskId, DarkTruthCanonicalMediaService>
  >;
  readonly storySourcePort: DarkTruthCanonicalStorySourcePort;
  readonly approvalBindingPort: DarkTruthApprovalBindingPort;
  readonly providerAuthorization?: DarkTruthProviderAuthorization;
}

function payloadHash(payload: unknown): string {
  const parsed = z.json().parse(payload);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
}

function assertActive(context: TaskExecutionContext): void {
  if (context.control.signal.aborted) {
    throw new WorkflowInterruptedError(
      "Dark Truth media execution was cancelled."
    );
  }
  if (
    context.control.deadlineAt !== null &&
    Date.now() >= new Date(context.control.deadlineAt).getTime()
  ) {
    throw new WorkflowInterruptedError(
      "Dark Truth media execution exceeded its deadline."
    );
  }
}

async function verifiedTaskArtifact(
  options: DarkTruthCanonicalMediaAdapterOptions,
  taskId: DarkTruthMediaExecutableTaskId
): Promise<CanonicalDarkTruthMediaArtifact> {
  const state = await options.store.readState();
  const task = state.tasks.find((candidate) => candidate.taskId === taskId);
  if (task?.status !== "succeeded" || !task.attemptId) {
    throw new Error(
      `Canonical media dependency ${taskId} has no successful attempt.`
    );
  }
  const attempt = await options.store.readAttempt(task.attemptId);
  if (
    attempt.status !== "completed" ||
    attempt.result.status !== "succeeded" ||
    attempt.result.outputs.length !== 1
  ) {
    throw new Error(
      `Canonical media dependency ${taskId} has ambiguous evidence.`
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
    throw new Error(`Canonical media dependency ${taskId} has forged lineage.`);
  }
  const artifact = canonicalDarkTruthMediaArtifactSchema.parse(
    JSON.parse(
      await fs.readFile(verified.provenance.absolutePath, "utf8")
    ) as unknown
  );
  if (
    artifact.taskId !== taskId ||
    artifact.fingerprint !== attempt.fingerprint ||
    artifact.identity.unitId !== options.unitId
  ) {
    throw new Error(
      `Canonical media dependency ${taskId} is stale or mismatched.`
    );
  }
  return artifact;
}

export function createDarkTruthVerifiedStorySourcePort(options: {
  readonly unitId: string;
  readonly store: WorkflowStore;
  readonly repository: ArtifactRepository;
}): DarkTruthCanonicalStorySourcePort {
  return {
    load: async ({ taskId, unitId, locale, variant, signal }) => {
      if (signal.aborted) {
        throw new WorkflowInterruptedError(
          "Dark Truth story source loading was cancelled."
        );
      }
      if (unitId !== options.unitId) {
        throw new Error(`Story source ${taskId} belongs to another unit.`);
      }
      const state = await options.store.readState();
      const task = state.tasks.find((candidate) => candidate.taskId === taskId);
      if (task?.status !== "succeeded" || !task.attemptId) {
        throw new Error(
          `Canonical story source ${taskId} has no successful attempt.`
        );
      }
      const attempt = await options.store.readAttempt(task.attemptId);
      if (
        attempt.status !== "completed" ||
        attempt.result.status !== "succeeded" ||
        attempt.result.outputs.length !== 1
      ) {
        throw new Error(`Canonical story source ${taskId} is ambiguous.`);
      }
      const manifest = attempt.result.outputs[0]!;
      if (
        manifest.producerTaskId !== taskId ||
        manifest.producerAttemptId !== task.attemptId
      ) {
        throw new Error(`Canonical story source ${taskId} has forged lineage.`);
      }
      const artifact = await verifyCanonicalDarkTruthStoryArtifact(
        options.repository,
        manifest
      );
      if (
        artifact.taskId !== taskId ||
        artifact.identity.unitId !== unitId ||
        artifact.identity.locale !== locale ||
        artifact.identity.variant !== variant ||
        artifact.fingerprint !== attempt.fingerprint
      ) {
        throw new Error(
          `Canonical story source ${taskId} is stale or mismatched.`
        );
      }
      const sourcePayloadSha256 = payloadHash(artifact.payload);
      if (signal.aborted) {
        throw new WorkflowInterruptedError(
          "Dark Truth story source loading was cancelled."
        );
      }
      return {
        taskId,
        fingerprint: artifact.fingerprint,
        payloadSha256: sourcePayloadSha256,
        payload: artifact.payload,
      };
    },
  };
}

async function promote(
  options: DarkTruthCanonicalMediaAdapterOptions,
  context: TaskExecutionContext,
  taskId: DarkTruthMediaExecutableTaskId,
  dependencyTaskIds: readonly DarkTruthMediaExecutableTaskId[],
  storySources: readonly DarkTruthCanonicalStorySource[],
  approvalBindings: readonly DarkTruthMediaApprovalEvidence[],
  serviceResult: DarkTruthCanonicalMediaServiceResult
): Promise<TaskExecutionResult> {
  const artifact = canonicalDarkTruthMediaArtifactSchema.parse({
    schemaVersion: DARK_TRUTH_CANONICAL_MEDIA_ARTIFACT_VERSION,
    adapterVersion: DARK_TRUTH_CANONICAL_MEDIA_ADAPTER_VERSION,
    taskId,
    owner: ownerByTask[taskId],
    identity: {
      unitId: context.unitId,
      locale: context.locale,
      variant: context.variant,
    },
    fingerprint: context.fingerprint,
    dependencyFingerprints: context.dependencyFingerprints,
    evidence: {
      payloadSha256: payloadHash(serviceResult.payload),
      dependencyTaskIds,
      storySources: storySources.map((source) => ({
        taskId: source.taskId,
        fingerprint: source.fingerprint,
        payloadSha256: source.payloadSha256,
      })),
      approvalBindings,
    },
    validation: serviceResult.validation,
    payload: serviceResult.payload,
  });
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  const ref = artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: context.unitId,
    profileId: context.profileId,
    locale: context.locale,
    variant: context.variant,
    kind: outputKindByTask[taskId],
    artifactKey: `${taskId.slice("darktruth.".length)}-${context.fingerprint.slice(0, 16)}`,
    format: "json",
    artifactRevision: context.fingerprint,
    workflowRevision: DARK_TRUTH_TASK_REGISTRY_VERSION,
    policyRevision: options.policyRevision,
  });
  const result = await options.repository.promote({
    ref,
    content,
    mediaType: "application/json",
    producerTaskId: taskId,
    producerTaskVersion: DARK_TRUTH_TASK_REGISTRY_VERSION,
    producerAttemptId: context.attemptId,
    validatorId: serviceResult.validation.validatorId,
    validatorVersion: serviceResult.validation.validatorVersion,
    dependencyFingerprints: context.dependencyFingerprints,
    replaceInvalidDestination: true,
    refreshManifestOnReuse: true,
    validate: (buffer) => {
      const parsed = canonicalDarkTruthMediaArtifactSchema.parse(
        JSON.parse(buffer.toString("utf8")) as unknown
      );
      if (
        parsed.taskId !== taskId ||
        parsed.fingerprint !== context.fingerprint ||
        parsed.evidence.payloadSha256 !== payloadHash(parsed.payload)
      ) {
        throw new Error(
          `Canonical ${taskId} media artifact validation failed.`
        );
      }
    },
  });
  if (result.dryRun) {
    throw new Error(
      `Canonical ${taskId} unexpectedly planned a dry-run write.`
    );
  }
  return {
    outputArtifacts: [result.artifact.manifest],
    warnings: [...(serviceResult.warnings ?? [])],
    telemetry: {
      cacheStatus: "miss",
      ...(serviceResult.providerEvidence?.provider
        ? { provider: serviceResult.providerEvidence.provider }
        : {}),
      ...(serviceResult.providerEvidence?.model
        ? { model: serviceResult.providerEvidence.model }
        : {}),
      ...(serviceResult.providerEvidence?.providerRequestId
        ? {
            providerRequestId: serviceResult.providerEvidence.providerRequestId,
          }
        : {}),
      revisions: {
        adapter: DARK_TRUTH_CANONICAL_MEDIA_ADAPTER_VERSION,
        policy: options.policyRevision,
      },
    },
  };
}

export function createDarkTruthMediaTaskImplementations(
  options: DarkTruthCanonicalMediaAdapterOptions
): Readonly<Record<DarkTruthMediaExecutableTaskId, TaskImplementation>> {
  const expectedUnitRoot = path.resolve(options.workspaceRoot, options.unitId);
  if (path.resolve(options.unitRoot) !== expectedUnitRoot) {
    throw new Error(
      `Canonical Dark Truth unit root must be ${expectedUnitRoot}; received ${path.resolve(options.unitRoot)}.`
    );
  }
  if (!options.storySourcePort) {
    throw new Error(
      "Canonical Dark Truth media tasks require a story source port."
    );
  }
  if (!options.approvalBindingPort) {
    throw new Error(
      "Canonical Dark Truth media tasks require an approval binding port."
    );
  }
  const implementations = {} as Record<
    DarkTruthMediaExecutableTaskId,
    TaskImplementation
  >;
  for (const taskId of DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS) {
    const service = options.services[taskId];
    if (!service)
      throw new Error(`Missing source-authoritative service for ${taskId}.`);
    if (service.providerMode === "external") {
      if (!externalEffectTaskIds.has(taskId)) {
        throw new Error(
          `Deterministic task ${taskId} cannot bind an external provider.`
        );
      }
      if (
        options.providerAuthorization?.configured !== true ||
        options.providerAuthorization.operatorAuthorized !== true
      ) {
        throw new Error(
          `External provider execution for ${taskId} requires explicit operator authorization.`
        );
      }
    }
    implementations[taskId] = async (context) => {
      assertActive(context);
      const dependencyTaskIds = dependencyPayloadTaskIds[taskId];
      const dependencies: Partial<
        Record<DarkTruthMediaExecutableTaskId, unknown>
      > = {};
      for (const dependencyTaskId of dependencyTaskIds) {
        dependencies[dependencyTaskId] = (
          await verifiedTaskArtifact(options, dependencyTaskId)
        ).payload;
      }
      const sourceArtifacts: DarkTruthCanonicalStorySource[] = [];
      const storySources: Partial<
        Record<DarkTruthStoryExecutableTaskId, unknown>
      > = {};
      for (const sourceTaskId of storySourceTaskIds[taskId]) {
        const source = await options.storySourcePort.load({
          taskId: sourceTaskId,
          unitId: context.unitId,
          locale: context.locale,
          variant: context.variant,
          signal: context.control.signal,
        });
        if (
          source.taskId !== sourceTaskId ||
          !/^[a-f0-9]{64}$/u.test(source.fingerprint) ||
          source.payloadSha256 !== payloadHash(source.payload)
        ) {
          throw new Error(
            `Canonical story source ${sourceTaskId} failed integrity validation.`
          );
        }
        sourceArtifacts.push(source);
        storySources[sourceTaskId] = source.payload;
      }
      const approvalBindings: DarkTruthMediaApprovalEvidence[] = [];
      const approvalBindingByTask: Partial<
        Record<DarkTruthMediaApprovalTaskId, DarkTruthMediaApprovalEvidence>
      > = {};
      if (taskId === "darktruth.publish-dry-run") {
        for (const approvalTaskId of approvalTaskIds) {
          const binding = await options.approvalBindingPort.load({
            taskId: approvalTaskId,
            unitId: context.unitId,
            signal: context.control.signal,
          });
          if (
            binding.taskId !== approvalTaskId ||
            !binding.approvalId ||
            !binding.boundRevision ||
            !/^[a-f0-9]{64}$/u.test(binding.evidenceFingerprint)
          ) {
            throw new Error(
              `Approval binding ${approvalTaskId} failed integrity validation.`
            );
          }
          approvalBindings.push(binding);
          approvalBindingByTask[approvalTaskId] = binding;
        }
      }
      assertActive(context);
      const serviceResult = await service.execute({
        taskId,
        unitId: context.unitId,
        locale: context.locale,
        variant: context.variant,
        dependencies,
        storySources,
        approvalBindings: approvalBindingByTask,
        signal: context.control.signal,
      });
      assertActive(context);
      if (
        service.providerMode === "external" &&
        !serviceResult.providerEvidence?.provider
      ) {
        throw new Error(
          `External provider service ${taskId} omitted provider evidence.`
        );
      }
      return promote(
        options,
        context,
        taskId,
        dependencyTaskIds,
        sourceArtifacts,
        approvalBindings,
        serviceResult
      );
    };
  }
  return implementations;
}

export async function verifyCanonicalDarkTruthMediaArtifact(
  repository: ArtifactRepository,
  manifest: ArtifactManifest
): Promise<CanonicalDarkTruthMediaArtifact> {
  const verified = await repository.verify(manifest.ref, {
    dependencyFingerprints: manifest.dependencyFingerprints,
  });
  if (
    verified.manifest.id !== manifest.id ||
    verified.manifest.checksumSha256 !== manifest.checksumSha256
  ) {
    throw new Error("Canonical Dark Truth media artifact manifest is stale.");
  }
  const artifact = canonicalDarkTruthMediaArtifactSchema.parse(
    JSON.parse(
      await fs.readFile(verified.provenance.absolutePath, "utf8")
    ) as unknown
  );
  if (artifact.evidence.payloadSha256 !== payloadHash(artifact.payload)) {
    throw new Error(
      "Canonical Dark Truth media artifact payload hash is invalid."
    );
  }
  return artifact;
}
