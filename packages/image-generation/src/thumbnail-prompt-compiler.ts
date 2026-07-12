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

function viralHorrorComposition(format: GenerateThumbnailInput["format"]): string[] {
  if (format === "full") {
    return [
      "Canvas: native 16:9 YouTube thumbnail.",
      "Composition:",
      "- text will dominate the left 42% to 50% of the final image",
      "- reserve clean dark negative space on the left for huge post-rendered type",
      "- place one unmistakable horror subject, monster, cursed object, or location on the right",
      "- make the subject large, simple, and readable at 120px wide",
      "- use a strong diagonal or depth cue that pulls the eye from text to subject",
      "- avoid busy midground clutter behind the future text zone",
      "- keep faces, eyes, or the key horror object out of the text zone",
      "- design as a final YouTube thumbnail background, not generic cinematic art",
    ];
  }
  return [
    "Canvas: native 9:16 Shorts thumbnail.",
    "Composition:",
    "- create a fresh vertical composition; do not crop or reframe a landscape thumbnail",
    "- text will dominate the upper-left or upper third of the final image",
    "- place one unmistakable horror subject, monster, cursed object, or location in the lower-middle or lower-right",
    "- make the subject large and readable on a phone feed",
    "- preserve clear vertical depth from text area to subject",
    "- keep important faces and story objects away from the bottom-right Shorts UI area",
    "- avoid wide landscape framing, letterbox thinking, or tiny subjects",
    "- design specifically for 9:16 first-view impact",
  ];
}

function viralHorrorPrompt(args: {
  readonly input: GenerateThumbnailInput;
  readonly reference: ResolvedThumbnailReference;
}): string {
  const conceptDirection =
    args.input.concept === "reaction"
      ? "REACTION CONCEPT: use an extreme close emotional reaction, visible eyes, and the threat close enough to explain the fear."
      : args.input.concept === "threat-closeup"
        ? "THREAT CLOSE-UP CONCEPT: make the story-specific threat fill much of the image with one unforgettable face, silhouette, or shape."
        : args.input.concept === "mystery-object"
          ? "MYSTERY OBJECT CONCEPT: center one impossible or cursed story object and show a human hand, silhouette, or reaction only for scale."
          : "Choose the single strongest reaction, threat, or mystery-object concept for this story.";
  return [
    "1. PURPOSE",
    "Create one professional viral YouTube horror thumbnail background for deterministic post-rendered typography.",
    "The final thumbnail must feel like a high-performing horror-story YouTube thumbnail, not generic AI concept art.",
    "",
    "2. REFERENCE USAGE",
    "Use the supplied reference only for punchy thumbnail composition, contrast, lighting, subject scale, and visual hierarchy.",
    "Do not copy people, identity, text, logos, exact framing, clothing, location, monster design, or story details from the reference.",
    "",
    "3. VIRAL HORROR STYLE",
    "- high-contrast cinematic horror",
    "- dark blue and black grade",
    "- selective deep red, orange, or warm practical-light highlights",
    "- one simple readable horror hook: subject, monster, cursed object, or threatening location",
    "- dramatic rim light and hard separation from the background",
    "- bold foreground/background hierarchy",
    "- strong shape language readable at tiny YouTube sizes",
    "- no gore, no explicit injury, no graphic violence",
    "",
    "4. STORY-SPECIFIC SUBJECT",
    `Foreground subject: ${normalizeWhitespace(args.input.protagonistDescription)}.`,
    `Dominant threat or visual hook: ${normalizeWhitespace(args.input.threatDescription)}.`,
    `Setting: ${normalizeWhitespace(args.input.settingDescription)}.`,
    `Mood: ${normalizeWhitespace(args.input.moodDescription ?? args.input.storySummary)}.`,
    `Key visual moment: ${normalizeWhitespace(args.input.keyVisualMoment ?? args.input.storySummary)}.`,
    `Story title: ${normalizeWhitespace(args.input.storyTitle)}.`,
    `Story summary: ${normalizeWhitespace(args.input.storySummary)}.`,
    `Metadata visual direction: ${normalizeWhitespace(args.input.visualDirection ?? "none supplied")}.`,
    conceptDirection,
    "Use the story details to create a new, instantly readable image with exactly one primary horror idea.",
    "",
    "5. FORMAT-SPECIFIC COMPOSITION",
    ...viralHorrorComposition(args.input.format),
    "",
    "6. TEXT-SAFE AREA",
    "Leave natural dark negative space where huge white and red typography will be added afterward.",
    "Do not render any text, letters, numbers, subtitles, logos, UI, signs, watermark, title card, border, or decorative frame.",
    "",
    "7. QUALITY BAR",
    "- prioritize instant click appeal over subtle realism",
    "- avoid small background-only scares",
    "- avoid soft, low-contrast, or ambiguous imagery",
    "- avoid multiple competing subjects",
    "- keep all human subjects clearly adult",
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
      visualDirection: normalizeWhitespace(args.input.visualDirection ?? ""),
      concept: args.input.concept ?? null,
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
  const stylePrompt =
    style === "editorial-card"
      ? legacyEditorialPrompt(args)
      : style === "viral-horror-v1"
        ? viralHorrorPrompt(args)
        : null;
  if (stylePrompt) {
    const fingerprint = hashText(
      serializeFingerprint({
        promptVersion: THUMBNAIL_PROMPT_VERSION,
        sourceFingerprint,
        prompt: stylePrompt,
        model: args.config.model,
        quality: args.input.quality ?? args.config.quality,
        referenceSha256: args.reference.sha256,
      })
    );
    return {
      prompt: stylePrompt,
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
