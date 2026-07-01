import {
  stageFailureSchemaVersion,
  type StageFailure,
  type StoryFormat,
  type WorkflowLocale,
} from "./story-workflow.types.js";

export interface MediaDependencyInput {
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly storyAccepted: boolean;
  readonly audioReady?: boolean;
  readonly metadataReady?: boolean;
  readonly thumbnailReady?: boolean;
  readonly renderReady?: boolean;
}

export interface MediaDependencyResult {
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly audio: "planned" | "ready" | "blocked";
  readonly metadata: "planned" | "ready" | "blocked";
  readonly thumbnail: "planned" | "ready" | "blocked";
  readonly render: "planned" | "ready" | "blocked";
  readonly publish: "planned" | "ready" | "blocked";
  readonly failures: readonly StageFailure[];
}

function blocked(message: string): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category: "dependency-blocked",
    retryability: "retry-after-change",
    message,
    occurredAt: new Date().toISOString(),
  };
}

export function resolveMediaDependencies(
  input: MediaDependencyInput
): MediaDependencyResult {
  const failures: StageFailure[] = [];
  if (!input.storyAccepted) {
    const failure = blocked("Media stages blocked because story artifact is not accepted.");
    return {
      locale: input.locale,
      format: input.format,
      audio: "blocked",
      metadata: "blocked",
      thumbnail: "blocked",
      render: "blocked",
      publish: "blocked",
      failures: [failure],
    };
  }
  const audio = input.audioReady ? "ready" : "planned";
  const metadata = input.metadataReady ? "ready" : "planned";
  const thumbnail = input.thumbnailReady ? "ready" : "planned";
  const render =
    input.renderReady
      ? "ready"
      : input.audioReady === false
        ? "blocked"
        : "planned";
  if (render === "blocked") {
    failures.push(blocked("Render blocked by missing audio."));
  }
  const publish =
    input.renderReady && input.metadataReady && input.thumbnailReady
      ? "ready"
      : input.metadataReady === false || input.thumbnailReady === false || input.renderReady === false
        ? "blocked"
        : "planned";
  if (publish === "blocked") {
    failures.push(blocked("Publish blocked by missing render, metadata, or thumbnail."));
  }
  return {
    locale: input.locale,
    format: input.format,
    audio,
    metadata,
    thumbnail,
    render,
    publish,
    failures,
  };
}
