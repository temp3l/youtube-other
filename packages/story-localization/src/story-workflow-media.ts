import path from "node:path";
import {
  createEpisodePathResolver,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  stageFailureSchemaVersion,
  type StageFailure,
  type StoryFormat,
  type WorkflowLocale,
} from "./story-workflow.types.js";

export const outputReadinessSchemaVersion = "output-readiness-v1" as const;
export type RenderOutputProfile = "youtube" | "vertical";
export type OutputReadinessStatus = "planned" | "ready" | "blocked";

export interface MediaDependencyInput {
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly profile: RenderOutputProfile;
  readonly storyAccepted: boolean;
  readonly imagesReady?: boolean;
  readonly audioReady?: boolean;
  readonly captionsReady?: boolean;
  readonly metadataReady?: boolean;
  readonly thumbnailReady?: boolean;
  readonly renderReady?: boolean;
}

export interface MediaDependencyResult {
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly profile: RenderOutputProfile;
  readonly images: "planned" | "ready" | "blocked";
  readonly audio: "planned" | "ready" | "blocked";
  readonly captions: "planned" | "ready" | "blocked";
  readonly metadata: "planned" | "ready" | "blocked";
  readonly thumbnail: "planned" | "ready" | "blocked";
  readonly render: "planned" | "ready" | "blocked";
  readonly publish: "planned" | "ready" | "blocked";
  readonly failures: readonly StageFailure[];
}

export interface OutputReadinessBlocker {
  readonly dependency:
    | "story"
    | "images"
    | "audio"
    | "captions"
    | "metadata"
    | "thumbnail"
    | "render";
  readonly message: string;
}

export interface OutputReadinessRecord {
  readonly schemaVersion: typeof outputReadinessSchemaVersion;
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly profile: RenderOutputProfile;
  readonly imageSource: "canonical-full-reuse" | "short-only";
  readonly status: OutputReadinessStatus;
  readonly render: MediaDependencyResult["render"];
  readonly publish: MediaDependencyResult["publish"];
  readonly blockedBy: readonly OutputReadinessBlocker[];
  readonly failures: readonly StageFailure[];
  readonly updatedAt: string;
}

export interface OutputReadinessSummary {
  readonly schemaVersion: typeof outputReadinessSchemaVersion;
  readonly summary: Readonly<Record<OutputReadinessStatus, number>>;
  readonly outputs: readonly OutputReadinessRecord[];
  readonly updatedAt: string;
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

function stageFromReadyFlag(
  ready: boolean | undefined
): "planned" | "ready" | "blocked" {
  if (ready === true) {
    return "ready";
  }
  if (ready === false) {
    return "blocked";
  }
  return "planned";
}

export function resolveMediaDependencies(
  input: MediaDependencyInput
): MediaDependencyResult {
  const failures: StageFailure[] = [];
  if (!input.storyAccepted) {
    const failure = blocked("Media stages blocked because story artifact is not accepted.");
    return {
      episodeId: input.episodeId,
      locale: input.locale,
      format: input.format,
      profile: input.profile,
      images: "blocked",
      audio: "blocked",
      captions: "blocked",
      metadata: "blocked",
      thumbnail: "blocked",
      render: "blocked",
      publish: "blocked",
      failures: [failure],
    };
  }
  const images = stageFromReadyFlag(input.imagesReady);
  const audio = stageFromReadyFlag(input.audioReady);
  const captions = stageFromReadyFlag(input.captionsReady);
  const metadata = stageFromReadyFlag(input.metadataReady);
  const thumbnail = stageFromReadyFlag(input.thumbnailReady);
  const render =
    input.renderReady
      ? "ready"
      : input.imagesReady === false ||
          input.audioReady === false ||
          input.captionsReady === false
        ? "blocked"
        : "planned";
  if (input.imagesReady === false) {
    failures.push(blocked("Render blocked by missing or invalid images."));
  }
  if (input.audioReady === false) {
    failures.push(blocked("Render blocked by missing audio."));
  }
  if (input.captionsReady === false) {
    failures.push(blocked("Render blocked by missing captions."));
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
    episodeId: input.episodeId,
    locale: input.locale,
    format: input.format,
    profile: input.profile,
    images,
    audio,
    captions,
    metadata,
    thumbnail,
    render,
    publish,
    failures,
  };
}

export function evaluateOutputReadiness(
  input: MediaDependencyInput
): OutputReadinessRecord {
  const media = resolveMediaDependencies(input);
  const blockedBy: OutputReadinessBlocker[] = [];
  if (!input.storyAccepted) {
    blockedBy.push({
      dependency: "story",
      message: "Story artifact is not accepted.",
    });
  } else {
    if (input.imagesReady === false) {
      blockedBy.push({
        dependency: "images",
        message: "Missing or invalid render images.",
      });
    }
    if (input.audioReady === false) {
      blockedBy.push({
        dependency: "audio",
        message: "Narration audio is not ready.",
      });
    }
    if (input.captionsReady === false) {
      blockedBy.push({
        dependency: "captions",
        message: "Captions are not ready.",
      });
    }
    if (input.metadataReady === false) {
      blockedBy.push({
        dependency: "metadata",
        message: "Metadata is not ready.",
      });
    }
    if (input.thumbnailReady === false) {
      blockedBy.push({
        dependency: "thumbnail",
        message: "Thumbnail is not ready.",
      });
    }
    if (input.renderReady === false) {
      blockedBy.push({
        dependency: "render",
        message: "Render artifact is not ready.",
      });
    }
  }
  return {
    schemaVersion: outputReadinessSchemaVersion,
    episodeId: media.episodeId,
    locale: media.locale,
    format: media.format,
    profile: media.profile,
    imageSource: media.format === "full" ? "canonical-full-reuse" : "short-only",
    status:
      media.render === "ready"
        ? "ready"
        : media.render === "blocked"
          ? "blocked"
          : "planned",
    render: media.render,
    publish: media.publish,
    blockedBy,
    failures: media.failures,
    updatedAt: new Date().toISOString(),
  };
}

export function summarizeOutputReadiness(
  outputs: readonly OutputReadinessRecord[]
): OutputReadinessSummary {
  const summary: Record<OutputReadinessStatus, number> = {
    planned: 0,
    ready: 0,
    blocked: 0,
  };
  for (const output of outputs) {
    summary[output.status] += 1;
  }
  return {
    schemaVersion: outputReadinessSchemaVersion,
    summary,
    outputs,
    updatedAt: new Date().toISOString(),
  };
}

export async function persistOutputReadiness(
  workspaceRoot: string,
  readiness: OutputReadinessRecord
): Promise<string> {
  const resolver = createEpisodePathResolver(workspaceRoot);
  const context = {
    episodeId: normalizeEpisodeId(readiness.episodeId),
    locale: normalizeLocaleCode(readiness.locale),
    variant: normalizeContentVariant(readiness.format),
  };
  const filePath = path.join(
    resolver.renderDir(context, readiness.profile),
    "readiness.json"
  );
  await writeJsonAtomic(filePath, readiness);
  return filePath;
}
