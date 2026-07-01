import {
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type StageFailure,
  type WorkflowLocale,
} from "./story-workflow.types.js";

export type ShortWorkflowStatus = "accepted" | "blocked" | "failed" | "skipped";

export interface ShortWorkflowInput {
  readonly locale: WorkflowLocale;
  readonly parentFull?: ArtifactLineage;
  readonly shortArtifact?: ArtifactLineage;
  readonly generationFailure?: StageFailure;
  readonly qualityPassed?: boolean;
  readonly qualityFailure?: StageFailure;
}

export interface ShortWorkflowResult {
  readonly locale: WorkflowLocale;
  readonly status: ShortWorkflowStatus;
  readonly parentArtifactId?: ArtifactLineage["artifactId"];
  readonly artifact?: ArtifactLineage;
  readonly failure?: StageFailure;
}

export function resolveShortWorkflow(
  input: ShortWorkflowInput
): ShortWorkflowResult {
  if (!input.parentFull) {
    return {
      locale: input.locale,
      status: "skipped",
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "dependency-blocked",
        retryability: "retry-after-change",
        message: "Short generation skipped because the parent full story is not accepted.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  if (input.generationFailure) {
    return {
      locale: input.locale,
      status: "failed",
      parentArtifactId: input.parentFull.artifactId,
      failure: input.generationFailure,
    };
  }
  if (input.qualityPassed === false || input.qualityFailure) {
    return {
      locale: input.locale,
      status: "blocked",
      parentArtifactId: input.parentFull.artifactId,
      failure:
        input.qualityFailure ??
        {
          schemaVersion: stageFailureSchemaVersion,
          category: "short-quality-gate-failed",
          retryability: "retry-after-change",
          message: "Short story quality gate blocked downstream media.",
          occurredAt: new Date().toISOString(),
        },
    };
  }
  if (!input.shortArtifact) {
    return {
      locale: input.locale,
      status: "failed",
      parentArtifactId: input.parentFull.artifactId,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "short-generation-failed",
        retryability: "retryable",
        message: "Short generation did not produce an artifact.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {
    locale: input.locale,
    status: "accepted",
    parentArtifactId: input.parentFull.artifactId,
    artifact: input.shortArtifact,
  };
}
