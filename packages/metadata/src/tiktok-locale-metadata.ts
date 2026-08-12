import {
  type TikTokLocaleEditorialMetadata,
  type TikTokMetadataLocale,
  tikTokLocaleEditorialMetadataSchema,
} from "@mediaforge/domain";
import { normalizeWhitespace } from "@mediaforge/shared";

const LOCALE_CTA_LABELS: Record<TikTokMetadataLocale, string> = {
  "en-US": "Watch the next episode",
  "de-DE": "Nächste Folge ansehen",
  "es-ES": "Ver el próximo episodio",
  "pt-BR": "Assistir ao próximo episódio",
};

export interface ProjectTikTokLocaleEditorialInput {
  readonly locale: TikTokMetadataLocale;
  readonly captionBody: string;
  readonly hashtags: readonly string[];
  readonly ctaUrl?: string | undefined;
  readonly coverText?: string | undefined;
}

function normalizeHashtags(hashtags: readonly string[]): string[] {
  return hashtags.map((tag) => {
    const trimmed = normalizeWhitespace(tag);
    if (!trimmed.startsWith("#")) {
      return `#${trimmed.replace(/^#+/u, "")}`;
    }
    return trimmed;
  });
}

export function projectTikTokLocaleEditorialMetadata(
  input: ProjectTikTokLocaleEditorialInput
): TikTokLocaleEditorialMetadata {
  const caption = normalizeWhitespace(input.captionBody).slice(0, 2200);
  const hashtags = normalizeHashtags(input.hashtags);
  const ctaLabel = LOCALE_CTA_LABELS[input.locale];

  return tikTokLocaleEditorialMetadataSchema.parse({
    caption,
    hashtags,
    ctaLabel,
    ...(input.ctaUrl !== undefined ? { ctaUrl: input.ctaUrl } : {}),
    ...(input.coverText !== undefined
      ? { coverText: normalizeWhitespace(input.coverText).slice(0, 100) }
      : {}),
  });
}
