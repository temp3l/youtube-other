import {
  publishingMetadataSchema,
  type PublishingMetadata,
  type RewrittenScript,
  type ScenePlan
} from "@mediaforge/domain";
import { formatTimestampLabel, normalizeWhitespace, splitIntoWords } from "@mediaforge/shared";
export {
  ConfigurationError,
  MetadataValidationError,
  OpenAIResponseError,
  OpenAIUploadError,
  type OpenAiMetadataClient,
  OutputWriteError,
  SourceFileError,
  SourceValidationError,
  YOUTUBE_METADATA_PROMPT_VERSION,
  YOUTUBE_METADATA_SCHEMA_VERSION,
  type YoutubeMetadata,
  type YoutubeMetadataGenerationInfo,
  type YoutubeMetadataGenerationOptions,
  type YoutubeMetadataOutputs,
  type YoutubeMetadataTarget,
  computeYoutubeMetadataCacheKey,
  extractResponseText,
  findEpisodeScenesFile,
  generateYoutubeMetadataForTarget,
  generateYoutubeMetadataFromScenesFile,
  listEpisodeSceneFiles,
  parseScenesFile,
  readAndValidateScenesFile,
  formatYoutubeMetadataMarkdown,
  youtubeMetadataSchema
} from "./youtube-metadata.js";

export interface MetadataProvider {
  generate(script: RewrittenScript, scenePlan: ScenePlan, platform: "youtube" | "tiktok"): PublishingMetadata;
}

export interface LocalizedMetadataInput {
  readonly sourceId: string;
  readonly language: string;
  readonly scriptText: string;
  readonly scenePlan: ScenePlan;
  readonly platform: "youtube" | "tiktok";
}

function titleFromScript(script: RewrittenScript): string {
  const firstSentence = normalizeWhitespace(script.text.split(/(?<=[.!?])\s+/u)[0] ?? script.text);
  return firstSentence.slice(0, 90);
}

function buildChapters(scenePlan: ScenePlan): PublishingMetadata["chapters"] {
  return scenePlan.scenes.map((scene) => ({
    timestampSeconds: scene.timing.startSeconds,
    title: normalizeWhitespace(scene.canonicalNarration).slice(0, 60)
  }));
}

function buildLocalizedChapters(scenePlan: ScenePlan, scriptText: string): PublishingMetadata["chapters"] {
  const chunks = scriptText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/u)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter((chunk) => chunk.length > 0);
  if (chunks.length !== scenePlan.scenes.length || chunks.length === 0) {
    return buildChapters(scenePlan);
  }
  return scenePlan.scenes.map((scene, index) => ({
    timestampSeconds: scene.timing.startSeconds,
    title: chunks[index]?.slice(0, 72) ?? normalizeWhitespace(scene.canonicalNarration).slice(0, 72)
  }));
}

function titleFromText(text: string): string {
  const firstSentence = normalizeWhitespace(text.split(/(?<=[.!?])\s+/u)[0] ?? text);
  return firstSentence.slice(0, 90);
}

function makeMarkdownChapterList(chapters: PublishingMetadata["chapters"]): string {
  return chapters.map((chapter) => `${formatTimestampLabel(chapter.timestampSeconds)} ${normalizeWhitespace(chapter.title).slice(0, 72)}`).join("\n");
}

export class HeuristicMetadataProvider implements MetadataProvider {
  public generate(script: RewrittenScript, scenePlan: ScenePlan, platform: "youtube" | "tiktok"): PublishingMetadata {
    const title = titleFromScript(script);
    const keywords = splitIntoWords(script.text).slice(0, 12);
    const metadata = publishingMetadataSchema.parse({
      sourceId: script.sourceId,
      platform,
      titleCandidates: [
        title,
        `${title} Explained`,
        `What Really Happens in ${title}`
      ],
      recommendedTitle: title,
      description: script.text,
      caption: platform === "tiktok" ? script.text.slice(0, 220) : undefined,
      tags: keywords,
      hashtags: keywords.slice(0, 5).map((keyword) => `#${keyword.replace(/[^a-z0-9]/giu, "")}`),
      chapters: buildChapters(scenePlan),
      thumbnailTextCandidates: [title.slice(0, 30), script.text.slice(0, 30)],
      coverTextCandidates: [title.slice(0, 24)],
      pinnedComment: "Use the timestamps and scene notes in the description.",
      summary: script.text.slice(0, 240),
      primaryKeyword: keywords[0] ?? "video",
      secondaryKeywords: keywords.slice(1, 5),
      warnings: []
    });
    return metadata;
  }
}

export function generateLocalizedPublishingMetadata(input: LocalizedMetadataInput): PublishingMetadata {
  const title = titleFromText(input.scriptText);
  const keywords = splitIntoWords(input.scriptText).slice(0, 12);
  const metadata = publishingMetadataSchema.parse({
    sourceId: input.sourceId,
    platform: input.platform,
    language: input.language,
    titleCandidates: [title, `${title} Explained`, `What Really Happens in ${title}`],
    recommendedTitle: title,
    description: normalizeWhitespace(input.scriptText),
    caption: input.platform === "tiktok" ? normalizeWhitespace(input.scriptText).slice(0, 220) : undefined,
    tags: keywords,
    hashtags: keywords.slice(0, 5).map((keyword) => `#${keyword.replace(/[^a-z0-9]/giu, "")}`),
    chapters: buildLocalizedChapters(input.scenePlan, input.scriptText),
    thumbnailTextCandidates: [title.slice(0, 30), normalizeWhitespace(input.scriptText).slice(0, 30)],
    coverTextCandidates: [title.slice(0, 24)],
    pinnedComment: "Use the timestamps and scene notes in the description.",
    summary: normalizeWhitespace(input.scriptText).slice(0, 240),
    primaryKeyword: keywords[0] ?? "video",
    secondaryKeywords: keywords.slice(1, 5),
    warnings: []
  });
  return {
    ...metadata,
    language: input.language
  };
}

export function formatPublishingMetadataMarkdown(metadata: PublishingMetadata): string {
  const lines = [
    `# ${metadata.recommendedTitle}`,
    "",
    metadata.description,
    "",
    "## Chapters",
    makeMarkdownChapterList(metadata.chapters),
    ""
  ];
  return lines.join("\n");
}
