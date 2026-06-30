import path from "node:path";
import {
  generateStoryThumbnail,
  readThumbnailStoryFile,
} from "@mediaforge/image-generation";

const DEFAULT_THUMBNAIL_STORY_FILE = path.join(
  "story-production",
  "thumbnail-story.json"
);

interface ResolvedUploadThumbnailInput {
  readonly metadata: {
    readonly thumbnail: {
      readonly recommendedText: string;
    };
  };
  readonly resolvedLanguage: string;
  readonly resolvedVariant: "full" | "short";
}

export async function resolveUploadThumbnailPath(args: {
  readonly workspaceRoot: string;
  readonly episodeDir: string;
  readonly resolvedUpload: ResolvedUploadThumbnailInput;
  readonly overrideThumbnailPath?: string;
  readonly force?: boolean;
}): Promise<string> {
  if (args.overrideThumbnailPath) {
    return args.overrideThumbnailPath;
  }
  const storyFilePath = path.join(
    args.episodeDir,
    DEFAULT_THUMBNAIL_STORY_FILE
  );
  const story = await readThumbnailStoryFile({
    workspaceRoot: args.workspaceRoot,
    storyFilePath,
  });
  const result = await generateStoryThumbnail({
    workspaceRoot: args.workspaceRoot,
    episodeSlug: path.basename(args.episodeDir),
    locale: args.resolvedUpload.resolvedLanguage,
    format: args.resolvedUpload.resolvedVariant,
    hookText: args.resolvedUpload.metadata.thumbnail.recommendedText,
    title: story.title,
    summary: story.summary,
    protagonistDescription: story.protagonistDescription,
    threatDescription: story.threatDescription,
    settingDescription: story.settingDescription,
    emphasisWord: story.emphasisWord,
    referenceImagePath: story.referenceImagePath,
    force: args.force ?? false,
  });
  return result.outputPath;
}
