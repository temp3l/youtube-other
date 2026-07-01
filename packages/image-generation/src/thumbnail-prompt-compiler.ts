import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import {
  type CompiledThumbnailPrompt,
  type GenerateThumbnailInput,
  type ResolvedThumbnailReference,
  type ThumbnailGenerationConfig,
  type ThumbnailStyle,
  THUMBNAIL_OUTPUTS,
  THUMBNAIL_PROMPT_VERSION,
  ThumbnailPromptCompilationError,
  normalizeHookText,
  serializeFingerprint,
} from "./thumbnail-contracts.js";

const THUMBNAIL_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
  "er",
  "es",
  "for",
  "her",
  "his",
  "ihr",
  "ihre",
  "ihren",
  "im",
  "in",
  "into",
  "is",
  "mein",
  "mit",
  "name",
  "names",
  "namen",
  "of",
  "on",
  "or",
  "she",
  "sie",
  "the",
  "their",
  "to",
  "und",
  "was",
]);

function formatSpecificComposition(format: GenerateThumbnailInput["format"]): string[] {
  if (format === "full") {
    return [
      "Aspect ratio: 16:9 landscape.",
      "Composition:",
      "- reserve natural dark negative space on the left 35% to 42%",
      "- do not add an artificial black rectangle",
      "- place the expressive foreground subject center-right",
      "- make the face large and readable",
      "- place the threat behind, above, or deeper in the right background",
      "- preserve clear depth between protagonist and threat",
      "- keep both faces outside the future text zone",
      "- preserve readability on desktop and mobile",
      "- avoid critical content near outer edges",
      "- design specifically for 16:9 rather than cropping another format",
    ];
  }
  return [
    "Aspect ratio: 9:16 portrait.",
    "Composition:",
    "- create a dedicated portrait composition",
    "- do not crop the landscape composition",
    "- reserve natural dark negative space in the upper-left or left vertical column",
    "- place the foreground subject prominently in the lower-middle or lower-right",
    "- make the face large and readable",
    "- place the threat in the upper-middle or upper-right",
    "- preserve strong vertical depth",
    "- keep faces away from likely Shorts interface overlays",
    "- keep important content away from the bottom-right interaction area",
    "- optimize for phone viewing",
  ];
}

function legacyEditorialPrompt(args: {
  readonly input: GenerateThumbnailInput;
  readonly reference: ResolvedThumbnailReference;
}): string {
  const output = THUMBNAIL_OUTPUTS[args.input.format];
  return [
    "Create one polished horror thumbnail background for a legacy editorial-card treatment.",
    `Target aspect ratio: ${output.aspectRatio}.`,
    "Leave a simple text-safe area on the left for deterministic post-rendered type.",
    `Foreground subject: ${normalizeWhitespace(args.input.protagonistDescription)}.`,
    `Dominant threat: ${normalizeWhitespace(args.input.threatDescription)}.`,
    `Setting: ${normalizeWhitespace(args.input.settingDescription)}.`,
    `Mood: ${normalizeWhitespace(args.input.moodDescription ?? args.input.storySummary)}.`,
    `Story summary: ${normalizeWhitespace(args.input.storySummary)}.`,
    "No text, logos, watermarks, borders, or interface elements.",
  ].join("\n");
}

export function selectThumbnailEmphasisWord(
  hookText: string,
  locale = "en"
): string {
  const upperHook = normalizeWhitespace(hookText).toLocaleUpperCase(locale);
  const tokens = upperHook
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const picked =
    tokens.find(
      (token) =>
        token.length > 2 && !THUMBNAIL_STOPWORDS.has(token.toLowerCase())
    ) ??
    tokens[1] ??
    tokens[0];
  if (!picked) {
    throw new ThumbnailPromptCompilationError(
      "Hook text must contain at least one word after normalization."
    );
  }
  return picked;
}

export function computeThumbnailSourceFingerprint(args: {
  readonly input: GenerateThumbnailInput;
  readonly style: ThumbnailStyle;
  readonly referenceSha256: string;
}): string {
  return hashText(
    serializeFingerprint({
      episodeSlug: normalizeWhitespace(args.input.episodeSlug),
      episodeNumber: args.input.episodeNumber ?? null,
      locale: args.input.locale.toLowerCase(),
      format: args.input.format,
      style: args.style,
      storyTitle: normalizeWhitespace(args.input.storyTitle),
      storySummary: normalizeWhitespace(args.input.storySummary),
      protagonistDescription: normalizeWhitespace(
        args.input.protagonistDescription
      ),
      threatDescription: normalizeWhitespace(args.input.threatDescription),
      settingDescription: normalizeWhitespace(args.input.settingDescription),
      moodDescription: normalizeWhitespace(args.input.moodDescription ?? ""),
      keyVisualMoment: normalizeWhitespace(args.input.keyVisualMoment ?? ""),
      referenceSha256: args.referenceSha256,
    })
  );
}

export function compileThumbnailPrompt(args: {
  readonly input: GenerateThumbnailInput;
  readonly config: Pick<ThumbnailGenerationConfig, "model" | "quality">;
  readonly reference: ResolvedThumbnailReference;
  readonly style: ThumbnailStyle;
}): CompiledThumbnailPrompt {
  const style = args.style;
  const sourceFingerprint = computeThumbnailSourceFingerprint({
    input: args.input,
    style,
    referenceSha256: args.reference.sha256,
  });
  if (style === "editorial-card") {
    const prompt = legacyEditorialPrompt(args);
    const fingerprint = hashText(
      serializeFingerprint({
        promptVersion: THUMBNAIL_PROMPT_VERSION,
        sourceFingerprint,
        prompt,
        model: args.config.model,
        quality: args.input.quality ?? args.config.quality,
        referenceSha256: args.reference.sha256,
      })
    );
    return {
      prompt,
      version: THUMBNAIL_PROMPT_VERSION,
      fingerprint,
      sourceFingerprint,
      format: args.input.format,
      style,
      referencePath: args.reference.repoRelativePath,
      referenceSha256: args.reference.sha256,
    };
  }

  const prompt = [
    "1. PURPOSE",
    "Create one polished, photorealistic cinematic horror thumbnail.",
    "",
    "2. REFERENCE USAGE",
    "Use the supplied image only as a visual style and composition reference.",
    "Use the supplied reference image only for visual style, lighting, contrast,",
    "subject scale, visual hierarchy, atmospheric depth, and composition quality.",
    "Preserve:",
    "- cinematic horror lighting",
    "- dark blue-black grading",
    "- cold moonlight",
    "- high contrast",
    "- dramatic rim lighting",
    "- atmospheric depth",
    "- subject scale",
    "- emotional intensity",
    "- strong foreground/background hierarchy",
    "- negative-space strategy",
    "- readability at thumbnail size",
    "Do not copy:",
    "- original people",
    "- face identity",
    "- clothing",
    "- monster",
    "- location",
    "- pose",
    "- story details",
    "- title text",
    "- episode number",
    "- logos",
    "- exact camera framing",
    "Style influence: high.",
    "Composition influence: medium.",
    "Character similarity: low.",
    "Story similarity: none.",
    "",
    "3. STORY-SPECIFIC SUBJECT",
    `Foreground subject: ${normalizeWhitespace(args.input.protagonistDescription)}.`,
    "Use exactly one primary foreground subject.",
    "The foreground subject must be clearly adult, large in frame, expressive, and frighteningly readable.",
    "",
    "4. STORY-SPECIFIC THREAT",
    `Dominant threat: ${normalizeWhitespace(args.input.threatDescription)}.`,
    "Use exactly one dominant threat.",
    "The threat must be immediately understandable at thumbnail size while remaining visually secondary to the foreground subject.",
    "",
    "5. LOCATION",
    `Setting: ${normalizeWhitespace(args.input.settingDescription)}.`,
    "",
    "6. KEY VISUAL MOMENT",
    `Mood: ${normalizeWhitespace(args.input.moodDescription ?? args.input.storySummary)}.`,
    `Key visual moment: ${normalizeWhitespace(args.input.keyVisualMoment ?? args.input.storySummary)}.`,
    `Story title: ${normalizeWhitespace(args.input.storyTitle)}.`,
    `Story summary: ${normalizeWhitespace(args.input.storySummary)}.`,
    "Create an entirely new story-specific scene based on the supplied protagonist, threat, setting, mood, and key visual moment.",
    "",
    "7. LIGHTING AND COLOR",
    "- photorealistic cinematic horror",
    "- dark blue-black grading",
    "- cold moonlight",
    "- high contrast",
    "- dramatic rim lighting",
    "- subtle fog and atmospheric depth",
    "- strong foreground/background separation",
    "- simple visual hierarchy",
    "- natural dark negative space for text",
    "",
    "8. FORMAT-SPECIFIC COMPOSITION",
    ...formatSpecificComposition(args.input.format),
    "",
    "9. NEGATIVE SPACE",
    "Leave the negative space natural and story-consistent so deterministic localized typography can be added afterward.",
    "Do not render any text, letters, numbers, logos, signs, subtitles, watermarks, borders, title cards, decorative frames, or interface elements.",
    "",
    "10. EXCLUSIONS",
    "- no collage",
    "- no split screen",
    "- no duplicated people",
    "- no unrelated background characters",
    "- no malformed hands",
    "- no distorted facial anatomy",
    "- no large rounded title card",
    "- no watermark",
    "- no contact sheet",
    "",
    "11. SAFETY",
    "- no gore unless explicitly enabled by existing policy",
    "- all human subjects must be clearly adults",
    "- the image must feel frightening before the viewer reads the title",
    "- do not generate text in the image",
  ].join("\n");

  const fingerprint = hashText(
    serializeFingerprint({
      promptVersion: THUMBNAIL_PROMPT_VERSION,
      prompt,
      sourceFingerprint,
      model: args.config.model,
      quality: args.input.quality ?? args.config.quality,
      generationSize: THUMBNAIL_OUTPUTS[args.input.format].generationSize,
      referenceSha256: args.reference.sha256,
    })
  );
  return {
    prompt,
    version: THUMBNAIL_PROMPT_VERSION,
    fingerprint,
    sourceFingerprint,
    format: args.input.format,
    style,
    referencePath: args.reference.repoRelativePath,
    referenceSha256: args.reference.sha256,
  };
}

export function computeBackgroundFingerprint(args: {
  readonly input: GenerateThumbnailInput;
  readonly style: ThumbnailStyle;
  readonly prompt: CompiledThumbnailPrompt;
  readonly config: Pick<ThumbnailGenerationConfig, "model" | "quality">;
}): string {
  return hashText(
    serializeFingerprint({
      episodeSlug: normalizeWhitespace(args.input.episodeSlug),
      locale: args.input.locale.toLowerCase(),
      format: args.input.format,
      style: args.style,
      sourceFingerprint: args.prompt.sourceFingerprint,
      promptVersion: args.prompt.version,
      promptFingerprint: args.prompt.fingerprint,
      referenceSha256: args.prompt.referenceSha256,
      model: args.config.model,
      quality: args.input.quality ?? args.config.quality,
      generationSize: THUMBNAIL_OUTPUTS[args.input.format].generationSize,
    })
  );
}

export function computeCompositionFingerprint(args: {
  readonly input: GenerateThumbnailInput;
  readonly style: ThumbnailStyle;
  readonly backgroundFingerprint: string;
  readonly emphasisWord: string;
  readonly fontFamily: string;
  readonly textLayoutVersion: string;
}): string {
  return hashText(
    serializeFingerprint({
      episodeSlug: normalizeWhitespace(args.input.episodeSlug),
      episodeNumber: args.input.episodeNumber ?? null,
      locale: args.input.locale.toLowerCase(),
      format: args.input.format,
      style: args.style,
      backgroundFingerprint: args.backgroundFingerprint,
      hookText: normalizeHookText(args.input.hookText, args.input.locale),
      emphasisWord: args.emphasisWord,
      fontFamily: args.fontFamily,
      textLayoutVersion: args.textLayoutVersion,
    })
  );
}
