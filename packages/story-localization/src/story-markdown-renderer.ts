import { normalizeWhitespace } from "@mediaforge/shared";
import { type GeneratedStoryPackage, type LanguageCode, type LanguageProfile, type ParsedSourceStory } from "./story-localization.types.js";
import { estimateDurationSeconds, countWords } from "./story-localization.utils.js";
import { FULL_STORY_PROVENANCE_MARKER } from "./short-rewrite.constants.js";

const headingLabels: Record<LanguageCode, {
  readonly audio: string;
  readonly metadata: string;
  readonly narrationInstructions: string;
  readonly shortMetadata: string;
  readonly productionNote: string;
}> = {
  en: {
    audio: "Audio Generation Instructions",
    metadata: "Episode Metadata",
    narrationInstructions: "Narration Instructions",
    shortMetadata: "Short Metadata",
    productionNote: "Production directions only. Do not narrate headings, Markdown, metadata, or sound-effect labels.",
  },
  de: {
    audio: "Anweisungen zur Audiogenerierung",
    metadata: "Episoden-Metadaten",
    narrationInstructions: "Anweisungen zur Kurzfassung",
    shortMetadata: "Metadaten zur Kurzfassung",
    productionNote: "Nur Produktionshinweise. Überschriften, Markdown, Metadaten und Soundeffekt-Bezeichnungen nicht vorlesen.",
  },
  es: {
    audio: "Instrucciones para generar el audio",
    metadata: "Metadatos del episodio",
    narrationInstructions: "Instrucciones de narración",
    shortMetadata: "Metadatos del corto",
    productionNote: "Solo instrucciones de producción. No narrar encabezados, Markdown, metadatos ni etiquetas de efectos de sonido.",
  },
  fr: {
    audio: "Instructions de génération audio",
    metadata: "Métadonnées de l’épisode",
    narrationInstructions: "Instructions de narration",
    shortMetadata: "Métadonnées du Short",
    productionNote: "Instructions de production uniquement. Ne pas lire les titres, le Markdown, les métadonnées ni les noms d'effets sonores.",
  },
  pt: {
    audio: "Instruções de geração de áudio",
    metadata: "Metadados do episódio",
    narrationInstructions: "Instruções de narração",
    shortMetadata: "Metadados do Short",
    productionNote: "Apenas instruções de produção. Não narrar títulos, Markdown, metadados ou nomes de efeitos sonoros.",
  },
};

function joinBulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function joinParagraphs(paragraphs: readonly string[]): string {
  return paragraphs.map((paragraph) => normalizeWhitespace(paragraph)).filter(Boolean).join("\n\n");
}

export function renderEnglishSourceCopy(content: string): string {
  return content;
}

export function renderLocalizedFullStory(
  episodeNumber: string,
  packageValue: NonNullable<GeneratedStoryPackage["full"]>,
  language: LanguageCode,
  sourceSha256?: string
): string {
  const labels = headingLabels[language];
  const duration = estimateDurationSeconds(countWords(packageValue.narrationParagraphs.join(" ")), packageValue.targetNarrationWpm);
  return [
    `# Episode ${episodeNumber} — ${packageValue.title}`,
    "",
    `## ${labels.audio}`,
    "",
    `> ${labels.productionNote}`,
    "",
    joinBulletList(packageValue.audioInstructions),
    "",
    "### Episode-specific sound motif",
    "",
    packageValue.soundMotif ?? "",
    "",
    "# Narration Script",
    "",
    joinParagraphs(packageValue.narrationParagraphs),
    "",
    "---",
    "",
    `## ${labels.metadata}`,
    "",
    `**Episode number:** ${episodeNumber}`,
    "",
    `**Primary title:** ${packageValue.title}`,
    "",
    `**Source title:** ${packageValue.sourceTitle ?? packageValue.title}`,
    "",
    `**Suggested thumbnail text:** ${packageValue.thumbnailText}`,
    "",
    `**Content disclosure:** ${packageValue.contentDisclosure}`,
    "",
    `**SEO description:** ${packageValue.seoDescription}`,
    "",
    `**Suggested tags:** ${packageValue.tags.join(", ")}`,
    "",
    `**Hashtags:** ${packageValue.hashtags.join(" ")}`,
    "",
    `**Target narration pace:** ${packageValue.targetNarrationWpm} words per minute`,
    "",
    `**Target duration:** approximately ${Math.round(duration / 60)} minutes`,
    "",
    `**Visual direction:** ${packageValue.visualDirection}`,
    "",
    FULL_STORY_PROVENANCE_MARKER,
    sourceSha256 ? `<!-- source-sha256: ${sourceSha256} -->` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function renderLocalizedShort(
  episodeNumber: string,
  packageValue: GeneratedStoryPackage["short"],
  language: LanguageCode
): string {
  const labels = headingLabels[language];
  return [
    `# Short ${episodeNumber} — ${packageValue.title}`,
    "",
    `## ${labels.narrationInstructions}`,
    "",
    joinBulletList(packageValue.narrationInstructions),
    "",
    "# Narration Script",
    "",
    joinParagraphs(packageValue.narrationParagraphs),
    "",
    `## ${labels.shortMetadata}`,
    "",
    `**Primary title:** ${packageValue.title}`,
    "",
    `**Thumbnail text:** ${packageValue.thumbnailText}`,
    "",
    `**Description:** ${packageValue.description}`,
    "",
    `**Hashtags:** ${packageValue.hashtags.join(" ")}`,
    "",
    "**Format:** 1080 × 1920, 9:16 vertical",
    "",
    `**Recommended duration:** approximately ${packageValue.recommendedDurationSeconds.min}–${packageValue.recommendedDurationSeconds.max} seconds`,
    "",
    `**Visual guidance:** ${packageValue.visualGuidance}`,
    "",
  ].join("\n");
}
