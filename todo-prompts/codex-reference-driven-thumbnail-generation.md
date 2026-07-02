# Codex Prompt — Reference-Driven Cinematic Horror Thumbnails

Implement reference-driven thumbnail generation for the MediaForge story pipeline.

The repository already contains approved sample thumbnail references at:

```text
./reference-thumbnails/thumbnail-full.png
./reference-thumbnails/thumbnail-short.png
```

These files define the desired visual direction for future thumbnails.

Read and follow every applicable `AGENTS.md` before modifying code. Inspect the existing thumbnail generation, OpenAI client, prompt compilers, CLI conventions, story metadata, localization artifacts, persistence, fingerprinting, retries, telemetry, `sharp` usage, full/short handling, and tests. Reuse existing abstractions and do not create duplicate OpenAI clients, retry systems, configuration systems, persistence conventions, or telemetry infrastructure. Do not modify unrelated code. Commit the completed work with a concise conventional commit.

## Goal

Replace the current editorial-card thumbnail style with reference-driven cinematic horror thumbnails matching:

- `./reference-thumbnails/thumbnail-full.png`
- `./reference-thumbnails/thumbnail-short.png`

Support:

- 16:9 thumbnails for full videos
- 9:16 thumbnails for short videos
- English and German initially, with generic locale support
- exact localized hook text
- deterministic text rendering after image generation
- reference-guided OpenAI image generation
- resumable artifact generation
- independent invalidation by locale and format
- reuse of generated text-free backgrounds when only typography changes

## Required visual style

The new `cinematic-horror` style must use:

- photorealistic cinematic horror
- dark blue-black grading
- cold moonlight
- high contrast
- dramatic rim lighting
- subtle fog and atmospheric depth
- one large expressive foreground subject
- one obvious dominant threat
- strong foreground/background separation
- simple visual hierarchy
- natural dark negative space for text
- distressed white and blood-red typography
- no collage, contact sheet, border, watermark, or large rounded title card

The reference image must influence style and composition but must not force every episode to copy the same people, monster, setting, clothes, pose, or story details.

## Reference handling

Use:

```text
full:  ./reference-thumbnails/thumbnail-full.png
short: ./reference-thumbnails/thumbnail-short.png
```

Resolve paths relative to the repository root, never the current working directory.

Validate each reference:

- exists and is readable
- is a valid supported image
- stays below a configurable byte limit
- remains inside the repository root
- has the expected orientation

The full reference must be landscape. The short reference must be portrait.

Compute and persist SHA-256 fingerprints. Changing the full reference must invalidate only full thumbnails; changing the short reference must invalidate only short thumbnails.

The OpenAI prompt must explicitly state:

```text
Use the supplied image only as a visual style and composition reference.

Preserve:
- cinematic horror lighting
- dark blue-black grading
- cold moonlight
- high contrast
- dramatic rim lighting
- atmospheric depth
- subject scale
- emotional intensity
- strong foreground/background hierarchy
- negative-space strategy
- readability at thumbnail size

Do not copy:
- original people
- face identity
- clothing
- monster
- location
- pose
- story details
- title text
- episode number
- logos
- exact camera framing
```

Treat the reference as:

```text
style influence: high
composition influence: medium
character similarity: low
story similarity: none
```

If the API has no direct influence controls, express this through prompt instructions.

## Architecture

Implement or extend the repository equivalents of:

```ts
ThumbnailGenerationService
ThumbnailPromptCompiler
ThumbnailReferenceResolver
ThumbnailImageGenerator
ThumbnailTextCompositor
ThumbnailArtifactRepository
```

Keep responsibilities separate:

1. Resolve and validate reference image
2. Compile deterministic format-specific prompt
3. Generate text-free image through OpenAI
4. Validate OpenAI response
5. Normalize to exact dimensions
6. Add localized typography deterministically
7. Validate final output
8. Persist background, final image, and manifests atomically
9. Record telemetry
10. Reuse matching artifacts

Thumbnail generation must remain an explicit pipeline stage, not a hidden side effect of story rewriting, localization, audio, rendering, or publishing.

## Domain types

```ts
export type ThumbnailFormat = "full" | "short";

export type ThumbnailStyle =
  | "cinematic-horror"
  | "editorial-card";
```

Default to `cinematic-horror`. Retain `editorial-card` only as an explicit legacy/fallback style if compatibility requires it. Existing editorial thumbnails must not be regenerated automatically.

## Exact output dimensions

```ts
export const THUMBNAIL_OUTPUTS = {
  full: {
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    referencePath: "reference-thumbnails/thumbnail-full.png",
  },
  short: {
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    referencePath: "reference-thumbnails/thumbnail-short.png",
  },
} as const;
```

Persisted final output must always be exactly:

```text
full: 1920x1080
short: 1080x1920
```

OpenAI may generate only supported intermediate sizes. Use the nearest supported orientation-specific size, then normalize with `sharp`. Never label approximate dimensions as exact. Validate final dimensions after all processing.

## Input contract

Create or adapt a strict input contract equivalent to:

```ts
export interface GenerateThumbnailInput {
  readonly episodeSlug: string;
  readonly episodeNumber?: number;
  readonly locale: string;
  readonly format: ThumbnailFormat;
  readonly style?: ThumbnailStyle;

  readonly storyTitle: string;
  readonly storySummary: string;
  readonly hookText: string;

  readonly protagonistDescription: string;
  readonly threatDescription: string;
  readonly settingDescription: string;
  readonly moodDescription?: string;
  readonly keyVisualMoment?: string;

  readonly emphasisWord?: string;
  readonly referenceImagePath?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
}
```

Validate all external input at the boundary. Prefer structured upstream story-analysis or metadata artifacts for protagonist, threat, setting, key visual moment, dominant emotion, hook, locale, and episode number. Do not make a separate LLM call solely to derive these fields unless the current architecture already does so.

## Prompt compiler

Implement a deterministic, normalized, versioned prompt compiler:

```ts
export interface CompiledThumbnailPrompt {
  readonly prompt: string;
  readonly version: string;
  readonly fingerprint: string;
  readonly format: ThumbnailFormat;
  readonly referencePath: string;
  readonly referenceSha256: string;
}
```

Use a prompt version such as:

```text
cinematic-horror-reference-v2
```

Prompt sections:

```text
1. PURPOSE
2. REFERENCE USAGE
3. STORY-SPECIFIC SUBJECT
4. STORY-SPECIFIC THREAT
5. LOCATION
6. KEY VISUAL MOMENT
7. LIGHTING AND COLOR
8. FORMAT-SPECIFIC COMPOSITION
9. NEGATIVE SPACE
10. EXCLUSIONS
11. SAFETY
```

Normalize whitespace and structured inputs before hashing. Reuse the repository fingerprint utility.

## Canonical base prompt

```text
Create one polished, photorealistic cinematic horror thumbnail.

Use the supplied reference image only for visual style, lighting, contrast,
subject scale, visual hierarchy, atmospheric depth, and composition quality.

Preserve the reference image's:
- dark blue-black cinematic grading
- cold moonlight
- dramatic rim lighting
- high contrast
- subtle mist and environmental depth
- large expressive foreground subject
- clearly visible background threat
- natural negative space for title typography
- strong readability at small thumbnail size

Do not reproduce the reference image's:
- people
- face identity
- clothing
- monster
- location
- pose
- title text
- episode number
- exact camera framing
- story details

Create an entirely new story-specific scene based on the supplied protagonist,
threat, setting, mood, and key visual moment.

Use exactly one primary foreground subject and one dominant threat.
The foreground subject must have a strong, readable emotional expression and
occupy a significant part of the frame.
The threat must be immediately understandable at thumbnail size while remaining
visually secondary to the foreground subject.
The image must feel frightening before the viewer reads the title.

Do not generate any text, letters, numbers, logos, signs, subtitles,
watermarks, borders, title cards, decorative frames, or interface elements.

No collage.
No split screen.
No duplicated people.
No unrelated background characters.
No malformed hands.
No distorted facial anatomy.
No gore unless explicitly enabled by existing policy.
All human subjects must be clearly adults unless an existing safe story contract
explicitly permits otherwise.
```

Append current episode-specific visual data. Do not hardcode Hachishakusama, the Smiling Man, Japan, a white hat, or any episode-specific details into the base prompt.

## Full-video composition

For `full`:

```text
Aspect ratio: 16:9 landscape.

Composition:
- reserve natural dark negative space on the left 35% to 42%
- do not add an artificial black rectangle
- place the expressive foreground subject center-right
- make the face large and readable
- place the threat behind, above, or deeper in the right background
- preserve clear depth between protagonist and threat
- keep both faces outside the future text zone
- preserve readability on desktop and mobile
- avoid critical content near outer edges
- design specifically for 16:9 rather than cropping another format
```

Use `./reference-thumbnails/thumbnail-full.png`.

## Short-video composition

For `short`:

```text
Aspect ratio: 9:16 portrait.

Composition:
- create a dedicated portrait composition
- do not crop the landscape composition
- reserve natural dark negative space in the upper-left or left vertical column
- place the foreground subject prominently in the lower-middle or lower-right
- make the face large and readable
- place the threat in the upper-middle or upper-right
- preserve strong vertical depth
- keep faces away from likely Shorts interface overlays
- keep important content away from the bottom-right interaction area
- optimize for phone viewing
```

Use `./reference-thumbnails/thumbnail-short.png`.

## OpenAI integration

Use the existing OpenAI client and official Node SDK already installed in the repository. Do not create another client. Inspect the installed SDK and current official method shape before implementation.

Support a typed model override through existing configuration conventions, for example:

```text
OPENAI_THUMBNAIL_MODEL
```

Use the official image-reference/image-edit capability available in the installed SDK. Conceptually:

```ts
{
  model,
  prompt,
  image: referenceImage,
  size: orientationSpecificSupportedSize,
  quality: configuredQuality,
  output_format: "png",
}
```

Do not invent SDK methods. If SDK types lag behind the API, isolate the compatibility boundary in one small adapter, avoid broad `any`, document the narrow cast, and add a serialization test.

Use one generated image per request. Add timeout, abort support where available, bounded retries, and exponential backoff with jitter using existing retry infrastructure. Retry only transient failures. Do not retry authentication, validation, policy, or malformed-response failures.

Never log API keys, authorization headers, binary buffers, or base64 image payloads.

## Text-free generation

The image model must generate only the cinematic background scene. Do not ask OpenAI to render title text, hook text, episode number, labels, or logos. Localized text must be rendered afterward.

## Response handling

Validate:

- exactly one image exists
- payload is non-empty
- base64 is valid when applicable
- decoded size is below configured limits
- image is decodable
- MIME type is supported
- dimensions are valid
- malformed responses are not persisted

Map SDK/HTTP failures into typed domain errors.

## Exact normalization

Normalize with `sharp` to:

```text
full: 1920x1080
short: 1080x1920
```

Use a safe strategy equivalent to:

```ts
fit: "cover"
position: "attention"
```

Use attention- or entropy-based positioning if supported. Do not blindly crop away the subject or threat. Support format-specific focal hints where practical. Validate exact final dimensions.

## Typography

Render title text after image generation using `sharp` SVG composition or the existing compositor.

The cinematic style must use:

- uppercase condensed bold type
- distressed horror treatment only when legible
- white for most words
- one emphasized word in blood red
- subtle black stroke or shadow
- deterministic wrapping
- safe margins
- automatic font-size reduction
- overflow detection
- no clipping
- no large rounded rectangle
- no orange vertical bar
- no orange underline
- no editorial presentation-card appearance

Use exact localized hook text from upstream metadata or CLI input. Do not translate inside the thumbnail generator.

Examples:

```text
EN full:  HE FOLLOWED HER HOME
DE full:  ER FOLGTE IHR NACH HAUSE
EN short: HE KEPT SMILING
DE short: ER LÄCHELTE WEITER
```

### Full typography

- place text on the left
- use approximately 30% to 40% of image width
- use 2 to 4 lines
- align left
- keep generous margins
- never cover protagonist or threat faces
- highlight one word in red
- reject layouts below a configured readable minimum

A subtle left-to-right gradient is allowed:

```text
left: rgba(0,0,0,0.72)
middle: rgba(0,0,0,0.25)
right: rgba(0,0,0,0)
```

Do not draw a visible card.

### Short typography

- stack text in the upper-left or left-middle negative space
- use 2 to 5 lines
- keep text away from faces and bottom-right Shorts controls
- highlight one word in red
- preserve safe top/side margins
- optimize for phone readability

Use only a subtle shadow or gradient.

## Font handling

Reuse project fonts or licensed system fonts. Do not commit proprietary font files. Prefer an existing heavy condensed font. Suggested fallback order:

```text
existing project condensed font
Arial Narrow
DejaVu Sans Condensed
Liberation Sans Narrow
sans-serif
```

If distressed typography uses a texture/mask, make it deterministic and preserve legibility.

## Emphasis word

Support:

```ts
readonly emphasisWord?: string;
```

If provided, highlight that exact word in red. Otherwise choose deterministically from metadata, threat-related verb, strongest negative term, second word, or first non-stopword. Do not call an LLM solely for this. Persist the chosen word.

## Legacy renderer

Locate the current code that draws large rounded rectangles, orange accents, orange underline, `HORROR STORY 018`, and editorial title blocks. Make `cinematic-horror` the default. Keep `editorial-card` only as explicit legacy mode. Episode number display must default to disabled in cinematic mode.

## Configuration

Add typed configuration using existing conventions, conceptually:

```ts
interface ThumbnailGenerationConfig {
  readonly model: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly defaultStyle: ThumbnailStyle;
  readonly fullReferencePath: string;
  readonly shortReferencePath: string;
  readonly maxReferenceBytes: number;
  readonly maxGeneratedBytes: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}
```

Default reference paths must work without environment variables. Add `.env.example` values only if that file already exists:

```text
OPENAI_THUMBNAIL_MODEL=gpt-image-2
THUMBNAIL_DEFAULT_STYLE=cinematic-horror
THUMBNAIL_FULL_REFERENCE=reference-thumbnails/thumbnail-full.png
THUMBNAIL_SHORT_REFERENCE=reference-thumbnails/thumbnail-short.png
```

## Background cache

Store the generated text-free background separately from the final localized image where compatible with the existing architecture.

Conceptual layout:

```text
episodes/<episode-slug>/thumbnails/backgrounds/
  full-en.png
  full-de.png
  short-en.png
  short-de.png
```

The background fingerprint must include story visual inputs, format, style, reference hash, prompt version, model, quality, and generation size. It must exclude hook text, emphasis word, font, typography settings, and localized wrapping.

The final composition fingerprint must include typography inputs. Changing only text or emphasis must reuse the background and avoid another paid OpenAI request.

## Persistence

Follow existing artifact conventions. Prefer:

```text
episodes/<episode-slug>/thumbnails/
  backgrounds/
    full-en.png
    full-de.png
    short-en.png
    short-de.png
  full/
    en.png
    de.png
  short/
    en.png
    de.png
  manifests/
    background-full-en.json
    background-full-de.json
    background-short-en.json
    background-short-de.json
    full-en.json
    full-de.json
    short-en.json
    short-de.json
```

Persist atomically:

1. write OpenAI output to temp
2. validate
3. normalize
4. atomically persist background
5. compose typography into temp final
6. validate final image and dimensions
7. atomically persist final image
8. atomically write manifests
9. clean temporary files on failure

Do not silently overwrite conflicts.

## Manifests

Background manifest should include episode, locale, format, style, model, quality, generation/final dimensions, prompt version/fingerprint, source fingerprint, reference path/hash, generated time, output path/hash/bytes, request ID, retry count, estimated cost, and pricing version.

Final manifest should include episode, episode number, locale, format, style, dimensions, background hash, hook text, emphasis word, font, text layout version, composition fingerprint, generated time, and output path/hash/bytes.

Never store credentials, authorization headers, image base64, raw binary data, or full story text unless current conventions explicitly require it.

## Fingerprinting and invalidation

Reuse existing artifacts only when manifests, fingerprints, file hashes, and exact dimensions all match.

Requirements:

- German changes do not invalidate English
- full reference changes do not invalidate short
- short reference changes do not invalidate full
- typography changes do not trigger a new OpenAI request when background is valid
- story visual changes invalidate background
- conflicts are typed and never silently overwritten

## CLI

Extend the existing CLI using project conventions. Support functionality equivalent to:

```bash
mediaforge thumbnails generate \
  --episode-slug 018-the-smiling-man \
  --locale en \
  --format full \
  --style cinematic-horror
```

```bash
mediaforge thumbnails generate \
  --episode-slug 018-the-smiling-man \
  --locale de \
  --format short \
  --style cinematic-horror
```

Useful flags:

```text
--episode-slug <slug>
--locale <locale>
--format <full|short>
--style <cinematic-horror|editorial-card>
--hook-text <text>
--emphasis-word <word>
--reference-image <path>
--quality <low|medium|high|auto>
--force
--dry-run
--verbose
```

`--reference-image` overrides the format default for one invocation only.

`--dry-run` must validate configuration/reference, compile prompt, calculate fingerprints, show output paths and reuse decisions, make no API call, and write no artifacts.

## Error model

Use or extend typed errors equivalent to:

```text
ThumbnailInputError
ThumbnailReferenceNotFoundError
ThumbnailReferenceValidationError
ThumbnailPromptCompilationError
ThumbnailGenerationError
ThumbnailPolicyError
ThumbnailRateLimitError
ThumbnailAuthenticationError
ThumbnailResponseError
ThumbnailImageValidationError
ThumbnailCompositionError
ThumbnailArtifactConflictError
ThumbnailPersistenceError
```

Include safe context only: episode, locale, format, style, model, fingerprints, retryability, and remediation guidance. Never include credentials, authorization headers, binary payloads, base64, or full sensitive source text.

## Telemetry

Integrate with existing telemetry and record:

```text
thumbnail_reference_resolved
thumbnail_prompt_compiled
thumbnail_background_generation_started
thumbnail_background_generation_reused
thumbnail_background_generation_retry
thumbnail_background_generation_succeeded
thumbnail_background_generation_failed
thumbnail_composition_started
thumbnail_composition_reused
thumbnail_composition_succeeded
thumbnail_composition_failed
thumbnail_generation_conflict
thumbnail_generation_succeeded
```

Include safe structured fields such as execution ID, episode, locale, format, style, model, quality, dimensions, reference path/hash, prompt/source/composition fingerprints, duration, response bytes, retry count, output path, estimated cost, and pricing version. Never log image payloads or credentials.

## Tests

Add focused automated tests without real OpenAI calls.

### Reference resolver

- repository-root resolution
- full/short defaults
- missing/unsafe/invalid/oversized files
- expected orientation
- hash changes
- independent full/short invalidation

### Prompt compiler

- deterministic output
- distinct full/short composition
- style-only reference instructions
- no-copy instructions
- no-text instruction
- story-specific protagonist/threat/setting
- relevant fingerprint changes only

### OpenAI adapter

- configured model
- correct reference attachment
- correct reference per format
- text-free prompt
- valid/invalid response handling
- retry policy
- no secrets or image payloads in logs

### Image normalization

- exact `1920x1080` full
- exact `1080x1920` short
- valid PNG
- malformed/oversized rejection

### Typography compositor

- exact English/German full/short text
- red emphasis word and white remaining text
- no rounded panel, orange bar, or underline
- deterministic wrapping
- no clipping
- safe margins
- minimum font size
- exact output dimensions

### Cache and persistence

- background reuse
- text-only changes reuse background
- visual/reference changes invalidate background
- independent locale/full/short invalidation
- atomic writes
- conflict handling
- manifest hash verification

### CLI

- full and short parsing
- cinematic default
- explicit legacy style
- reference override
- dry-run without API call
- invalid input failures
- output path reporting
- non-zero exit on failure

## Documentation

Document:

- cinematic and legacy styles
- reference paths
- style-vs-story reference behavior
- exact dimensions
- text-free OpenAI generation
- deterministic localized typography
- background reuse
- fingerprint/invalidation behavior
- CLI examples
- reference override
- dry-run
- safe reference replacement
- recommendation that references contain no episode-specific text

Treat these as production inputs:

```text
./reference-thumbnails/thumbnail-full.png
./reference-thumbnails/thumbnail-short.png
```

Do not move or rename them unless architecture strongly requires it.

## Migration behavior

Do not rewrite existing thumbnails automatically. New generations default to `cinematic-horror`. Existing editorial thumbnails remain untouched until explicitly regenerated.

Example:

```bash
mediaforge thumbnails generate \
  --episode-slug 018-the-smiling-man \
  --locale en \
  --format full \
  --style cinematic-horror \
  --force
```

## Verification

Verify these four variants using mocks, fixtures, or dry-run unless explicitly enabled credentials are available:

```text
018-the-smiling-man / en / full
018-the-smiling-man / de / full
018-the-smiling-man / en / short
018-the-smiling-man / de / short
```

Fallback fixture hooks:

```text
EN full:  HE FOLLOWED HER HOME
DE full:  ER FOLGTE IHR NACH HAUSE
EN short: HE KEPT SMILING
DE short: ER LÄCHELTE WEITER
```

Do not make paid API calls during automated verification.

## Acceptance criteria

The task is complete only when:

1. Full uses `reference-thumbnails/thumbnail-full.png`.
2. Short uses `reference-thumbnails/thumbnail-short.png`.
3. OpenAI generates a text-free cinematic background.
4. Output follows reference style without copying story content.
5. Full output is exactly `1920x1080`.
6. Short output is exactly `1080x1920`.
7. Localized text is added afterward.
8. English and German text are exact and readable.
9. One word is highlighted in blood red.
10. Cinematic mode has no large rounded card, orange bar, or orange underline.
11. Matching backgrounds are reused after text-only changes.
12. Reference changes invalidate only the corresponding format.
13. Locale, full, and short invalidation remain independent.
14. Existing editorial thumbnails are untouched until explicitly regenerated.
15. Automated tests do not call the real API.
16. Relevant tests, type checking, linting, and build pass.
17. Applicable `AGENTS.md` instructions are followed.
18. Work is committed.

## Final response

After implementation, report:

- files changed
- existing architecture reused
- new components
- prompt version
- reference paths
- OpenAI API method
- intermediate generation sizes
- exact final dimensions
- typography implementation
- background-cache behavior
- fingerprint/invalidation behavior
- CLI examples
- tests and results
- lint/type-check/build results
- known limitations
- commit hash
