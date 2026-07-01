import {
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type FailureCategory,
  type StageFailure,
  type WorkflowLocale,
} from "./story-workflow.types.js";

export type LocaleWorkflowStatus = "accepted" | "fallback-accepted" | "blocked";

export interface LocaleFallbackCandidate {
  readonly artifact: ArtifactLineage;
  readonly canonicalFingerprint: string;
  readonly qualityPassed: boolean;
}

export interface LocaleWorkflowInput {
  readonly locale: WorkflowLocale;
  readonly canonicalFingerprint: string;
  readonly generatedArtifact?: ArtifactLineage;
  readonly generationFailure?: StageFailure;
  readonly fallbackCandidates?: readonly LocaleFallbackCandidate[];
}

export interface LocaleWorkflowResult {
  readonly locale: WorkflowLocale;
  readonly status: LocaleWorkflowStatus;
  readonly artifact?: ArtifactLineage;
  readonly fallbackUsed: boolean;
  readonly provenance: "generated" | "localized-fallback" | "none";
  readonly failure?: StageFailure;
}

function workflowFailure(
  category: FailureCategory,
  message: string,
  sourceFailure?: StageFailure
): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category,
    retryability: "retry-after-change",
    message,
    occurredAt: new Date().toISOString(),
    ...(sourceFailure ? { causeStageId: sourceFailure.causeStageId } : {}),
  };
}

export function resolveLocaleWorkflowBranch(
  input: LocaleWorkflowInput
): LocaleWorkflowResult {
  if (input.generatedArtifact) {
    return {
      locale: input.locale,
      status: "accepted",
      artifact: input.generatedArtifact,
      fallbackUsed: false,
      provenance: "generated",
    };
  }

  const fallback = input.fallbackCandidates?.find(
    (candidate) =>
      candidate.canonicalFingerprint === input.canonicalFingerprint &&
      candidate.qualityPassed &&
      candidate.artifact.locale === input.locale
  );
  if (fallback) {
    return {
      locale: input.locale,
      status: "fallback-accepted",
      artifact: {
        ...fallback.artifact,
        provenance: "localized-fallback",
      },
      fallbackUsed: true,
      provenance: "localized-fallback",
      ...(input.generationFailure ? { failure: input.generationFailure } : {}),
    };
  }

  return {
    locale: input.locale,
    status: "blocked",
    fallbackUsed: false,
    provenance: "none",
    failure:
      input.generationFailure ??
      workflowFailure(
        "locale-fallback-rejected",
        `No accepted same-locale fallback was available for ${input.locale}.`
      ),
  };
}

export function localeFailureBlocksOnlyLocale(
  results: readonly LocaleWorkflowResult[],
  locale: WorkflowLocale
): boolean {
  return results
    .filter((result) => result.locale !== locale)
    .every((result) => result.status !== "blocked");
}
