import path from "node:path";
import { type LanguageCode } from "./story-localization.types.js";

export function resolveCanonicalStoryScriptPath(args: {
  readonly episodeDir: string;
  readonly language: LanguageCode;
  readonly variant: "full" | "short";
}): string {
  return args.variant === "short"
    ? path.join(
        args.episodeDir,
        "languages",
        "short",
        `script-${args.language}.md`
      )
    : path.join(args.episodeDir, "languages", `script-${args.language}.md`);
}
