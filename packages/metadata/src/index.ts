import {
  publishingMetadataSchema,
  type PublishingMetadata,
  type RewrittenScript,
  type ScenePlan
} from "@mediaforge/domain";
import { normalizeWhitespace, splitIntoWords } from "@mediaforge/shared";

export interface MetadataProvider {
  generate(script: RewrittenScript, scenePlan: ScenePlan, platform: "youtube" | "tiktok"): PublishingMetadata;
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

