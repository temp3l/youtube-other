import { normalizeWhitespace } from "@mediaforge/shared";
import { type GeneratedStoryPackage, type LanguageCode } from "./story-localization.types.js";
import { estimateDurationSeconds, countWords } from "./story-localization.utils.js";
import { FULL_STORY_PROVENANCE_MARKER } from "./short-rewrite.constants.js";
import { getLanguageProfile } from "./language-profiles.js";

const SOUND_DESIGN_PAUSE_ALLOWANCE_SECONDS = 5;

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

function fullAudioInstructions(language: LanguageCode, targetNarrationWpm: number): readonly string[] {
  const profile = getLanguageProfile(language);
  return [
    ...profile.fullProductionInstructions,
    `${targetNarrationWpm} WPM (${profile.narratorLanguageName}).`,
  ];
}

function shortNarrationInstructions(language: LanguageCode, targetNarrationWpm: number): readonly string[] {
  const profile = getLanguageProfile(language);
  return [
    ...profile.shortProductionInstructions,
    `${targetNarrationWpm} WPM (${profile.narratorLanguageName}).`,
  ];
}

function narrationMetrics(
  narrationParagraphs: readonly string[],
  wordsPerMinute: number
): {
  readonly wordCount: number;
  readonly estimatedSpeechSeconds: number;
  readonly estimatedTotalSeconds: number;
} {
  const wordCount = countWords(narrationParagraphs.join(" "));
  const estimatedSpeechSeconds = estimateDurationSeconds(wordCount, wordsPerMinute);
  return {
    wordCount,
    estimatedSpeechSeconds,
    estimatedTotalSeconds: estimatedSpeechSeconds + SOUND_DESIGN_PAUSE_ALLOWANCE_SECONDS,
  };
}

export function renderNarrationOnlyStoryMarkdown(args: {
  readonly episodeNumber: string;
  readonly title: string;
  readonly narrationParagraphs: readonly string[];
  readonly sourceSha256?: string;
}): string {
  return [
    `# Episode ${args.episodeNumber} — ${args.title}`,
    "",
    "# Narration Script",
    "",
    joinParagraphs(args.narrationParagraphs),
    "",
    FULL_STORY_PROVENANCE_MARKER,
    args.sourceSha256 ? `<!-- source-sha256: ${args.sourceSha256} -->` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
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
  const metrics = narrationMetrics(packageValue.narrationParagraphs, packageValue.targetNarrationWpm);
  return [
    `# Episode ${episodeNumber} — ${packageValue.title}`,
    "",
    `## ${labels.audio}`,
    "",
    `> ${labels.productionNote}`,
    "",
    joinBulletList(fullAudioInstructions(language, packageValue.targetNarrationWpm)),
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
    `**Word count:** ${metrics.wordCount}`,
    "",
    `**Estimated speech duration:** approximately ${Math.round(metrics.estimatedSpeechSeconds)} seconds`,
    "",
    `**Estimated total duration:** approximately ${Math.round(metrics.estimatedTotalSeconds)} seconds after sound-design allowance`,
    "",
    `**Visual direction:** ${packageValue.visualDirection}`,
    "",
    FULL_STORY_PROVENANCE_MARKER,
    sourceSha256 ? `<!-- source-sha256: ${sourceSha256} -->` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function renderCanonicalEnglishFullStory(
  episodeNumber: string,
  packageValue: NonNullable<GeneratedStoryPackage["full"]>,
  sourceSha256?: string
): string {
  return renderLocalizedFullStory(
    episodeNumber,
    packageValue,
    "en",
    sourceSha256
  );
}

export function renderLocalizedShort(
  episodeNumber: string,
  packageValue: GeneratedStoryPackage["short"],
  language: LanguageCode
): string {
  const labels = headingLabels[language];
  const metrics = narrationMetrics(
    packageValue.narrationParagraphs,
    packageValue.targetNarrationWpm
  );
  return [
    `# Short ${episodeNumber} — ${packageValue.title}`,
    "",
    `## ${labels.narrationInstructions}`,
    "",
    joinBulletList(shortNarrationInstructions(language, packageValue.targetNarrationWpm)),
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
    `**Word count:** ${metrics.wordCount}`,
    "",
    `**Estimated speech duration:** approximately ${Math.round(metrics.estimatedSpeechSeconds)} seconds`,
    "",
    `**Recommended duration:** approximately ${Math.round(metrics.estimatedTotalSeconds)} seconds after pause allowance`,
    "",
    `**Visual guidance:** ${packageValue.visualGuidance}`,
    "",
  ].join("\n");
}
