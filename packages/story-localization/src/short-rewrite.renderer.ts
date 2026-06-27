import { normalizeWhitespace } from "@mediaforge/shared";
import {
  SHORT_REWRITE_SUPPORTED_LANGUAGES,
  type ShortRewriteLanguage,
} from "./short-rewrite.constants.js";
import { type ShortRewriteGeneration } from "./short-rewrite.types.js";

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildShortRewriteMarkdown(args: {
  readonly episodeNumber: string;
  readonly generation: ShortRewriteGeneration;
  readonly language: ShortRewriteLanguage;
}): string {
  const languageName = SHORT_REWRITE_SUPPORTED_LANGUAGES[args.language].name;
  return [
    `# Episode ${args.episodeNumber} — ${args.generation.title}`,
    "",
    "## Audio Generation Instructions",
    "",
    "> Production directions only. Do not narrate headings, Markdown, metadata, or sound-effect labels.",
    "",
    bulletList([
      "Use one consistent adult male narrator.",
      `Speak in natural ${languageName} with a restrained dark-documentary tone.`,
      "Target approximately 175–180 words per minute.",
      "Keep short suspense pauses around the hook, realization, and final reveal.",
      "Do not narrate production instructions.",
    ]),
    "",
    "# Narration Script",
    "",
    normalizeWhitespace(args.generation.narration),
    "",
  ].join("\n");
}

