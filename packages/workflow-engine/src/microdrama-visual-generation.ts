import { createHash } from "node:crypto";

import {
  buildArtifactSemanticIdentity,
  planTypedDependencyInvalidation,
  type ArtifactDependencyChange,
  type ArtifactSemanticIdentity,
} from "./cache.js";

export const MICRODRAMA_VISUAL_GENERATION_TASK_ID =
  "microdrama.generate-shared-visual" as const;
export const MICRODRAMA_VISUAL_GENERATION_TASK_VERSION =
  "mediaforge.microdrama.visual-generation-task.v1" as const;

function dependencyFingerprint(value: string): string {
  if (/^[a-f0-9]{64}$/u.test(value)) {
    return value;
  }
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type MicrodramaSharedVisualArtifactIdentityInput = {
  readonly episodeId: string;
  readonly shotSemanticId: string;
  readonly sourcePlateSemanticId: string;
  readonly sceneShotPlanRevisionId: string;
  readonly registryDependencies: readonly {
    readonly revisionId: string;
    readonly contentHash: string;
  }[];
  readonly cacheKey: string;
};

export function buildMicrodramaSharedVisualArtifactIdentity(
  input: MicrodramaSharedVisualArtifactIdentityInput
): ArtifactSemanticIdentity {
  return buildArtifactSemanticIdentity({
    artifactId: `shared-visual:${input.sourcePlateSemanticId}:${input.shotSemanticId}`,
    artifactKind: "microdrama-shared-visual",
    unitId: input.episodeId,
    revision: input.sceneShotPlanRevisionId,
    profileId: "dark-truth",
    variant: "source-plate",
    locale: "language-independent",
    localeScope: "language-independent",
    effectiveConfiguration: {
      shotSemanticId: input.shotSemanticId,
      sourcePlateSemanticId: input.sourcePlateSemanticId,
      cacheKey: input.cacheKey,
    },
    dependencies: [
      {
        kind: "configuration",
        id: `scene-shot-plan:${input.sceneShotPlanRevisionId}`,
        fingerprint: dependencyFingerprint(input.sceneShotPlanRevisionId),
      },
      ...input.registryDependencies.map((dependency) => ({
        kind: "source" as const,
        id: `registry:${dependency.revisionId}`,
        fingerprint: dependencyFingerprint(dependency.contentHash),
      })),
    ],
  });
}

export function planMicrodramaSharedVisualInvalidation(input: {
  readonly artifacts: readonly Pick<
    ArtifactSemanticIdentity,
    "artifactId" | "dependencies"
  >[];
  readonly changes: readonly ArtifactDependencyChange[];
}) {
  return planTypedDependencyInvalidation(input);
}

export type MicrodramaVisualGenerationWorkflowJournalEntry = {
  readonly task: typeof MICRODRAMA_VISUAL_GENERATION_TASK_ID;
  readonly requestId: string;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly status: "SUCCEEDED" | "BLOCKED";
  readonly artifactHash?: string;
  readonly storageUri?: string;
  readonly errorCode?: string;
  readonly nextAction: string;
};

export type MicrodramaVisualGenerationWorkflowPort = {
  generate(input: {
    readonly requestId: string;
    readonly cacheKey: string;
  }): Promise<{
    readonly cacheHit: boolean;
    readonly artifactHash: string;
    readonly storageUri: string;
    readonly errorCode?: string;
  }>;
};

export async function runMicrodramaVisualGenerationWorkflow(input: {
  readonly port: MicrodramaVisualGenerationWorkflowPort;
  readonly requestId: string;
  readonly cacheKey: string;
}): Promise<MicrodramaVisualGenerationWorkflowJournalEntry> {
  try {
    const result = await input.port.generate({
      requestId: input.requestId,
      cacheKey: input.cacheKey,
    });
    if (result.errorCode) {
      return {
        task: MICRODRAMA_VISUAL_GENERATION_TASK_ID,
        requestId: input.requestId,
        cacheKey: input.cacheKey,
        cacheHit: false,
        status: "BLOCKED",
        errorCode: result.errorCode,
        nextAction: "Resolve dispatch or continuity issues before retrying.",
      };
    }
    return {
      task: MICRODRAMA_VISUAL_GENERATION_TASK_ID,
      requestId: input.requestId,
      cacheKey: input.cacheKey,
      cacheHit: result.cacheHit,
      status: "SUCCEEDED",
      artifactHash: result.artifactHash,
      storageUri: result.storageUri,
      nextAction: result.cacheHit
        ? "Reuse the cached shared visual artifact."
        : "Continue with locale composition using the new shared visual.",
    };
  } catch (error: unknown) {
    return {
      task: MICRODRAMA_VISUAL_GENERATION_TASK_ID,
      requestId: input.requestId,
      cacheKey: input.cacheKey,
      cacheHit: false,
      status: "BLOCKED",
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      nextAction: "Inspect the blocked visual generation request.",
    };
  }
}
