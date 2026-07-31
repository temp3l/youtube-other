# CLI

The primary CLI is `mediaforge`, implemented in `apps/cli/src/index.ts` and built to `apps/cli/dist/index.js`. Root npm scripts wrap selected commands with `scripts/run-with-telemetry.mjs`.

Run commands from the repository root after building the CLI:

```bash
pnpm build
npm run mediaforge -- --help
node apps/cli/dist/index.js --help
```

Global options registered on the root command:

- `--json`
- `--quiet`
- `--verbose`
- `--dry-run`
- `--tts-provider <provider>`
- `--openai-base-url <url>`
- `--openai-api-key <key>`
- `--openai-speech-model <model>`
- `--openai-speech-voice <voice>`
- `--speech-voice-preset <preset>`
- `--language <code>`

## Registered Commands

Top-level command groups and commands:

- `doctor`
- `init`
- `create --file <path> --url <url> --transcript <path> --title <title> --slug <slug>`
- `run <episode-id> --from <stage> --until <stage> --scene-limit <n>`
- `status <episode-id>`
- `inspect <episode-id>`
- `retry <episode-id>`
- `clean <episode-id> --generated-only`
- `transcript generate --episode <episode-id>`
- `transcript normalize --episode <episode-id>`
- `transcript validate --episode <episode-id>`
- `transcript export <episode-id>`
- `scenes list <episode-id>`
- `scenes inspect <episode-id> --scene <scene-id>`
- `audio generate <episode-id>`
- `audio generate-localized <episode-id> --languages <comma-separated-languages> --dry-run`
- `clips generate <episode-id> --scene-limit <n>`
- `clips backfill-manifests <episode-id>`
- `align <episode-id>`
- `images ...`
- `images batch prepare --episode <episode-id> --languages <comma-separated-languages> --variants <comma-separated-variants>`
- `images batch submit --episode <episode-id> --batch <id>`
- `images batch status --episode <episode-id> --batch <id>`
- `images batch download --episode <episode-id> --batch <id>`
- `images batch resume --episode <episode-id> [--batch <id>]`
- `thumbnails generate --episode <slug> --locale <locale> --format <full|short> --hook-text <text> --story-file <path>`
- `render <episode-id> --profile <youtube|vertical> [--captions]`
- `render remote check`
- `render remote cleanup`
- `render remote test`
- `metadata generate <episode-id>`
- `metadata youtube [source] --episode <episode-slug> --all --force`
- `package <episode-id>`
- `db migrate`
- `youtube upload --episode <episode-id>`
- `episode ...`
- `stories ...`
- `stories:batches ...`

## Npm Scripts

Root scripts that directly wrap CLI commands:

- `npm run doctor`
- `npm run mediaforge -- <args>`
- `npm run episode:inspect -- --episode <id>`
- `npm run episode:dry-run -- --episode <id>`
- `npm run episode:analyze -- --episode <id>`
- `npm run episode:plan -- --episode <id>`
- `npm run episode:english -- --episode <id>`
- `npm run episode:localized -- --episode <id>`
- `npm run episode:short -- --episode <id>`
- `npm run episode:status -- --episode <id>`
- `npm run episode:validate -- --episode <id>`
- `npm run episode:bootstrap-characters -- --episode <id>`
- `npm run episode:review:prepare -- --episode <id>`
- `npm run episode:review:approve -- --episode <id>`
- `npm run episode:review:reject -- --episode <id>`
- `npm run episode:review:status -- --episode <id>`
- `npm run stories:localize -- <args>`
- `npm run stories:batches -- <args>`
- `npm run render -- <episode-id>`
- `npm run render:remote:check`
- `npm run render:remote:cleanup`
- `npm run render:remote:test`
- `npm run transcript:generate -- --episode <id>`
- `npm run transcript:normalize -- --episode <id>`
- `npm run transcript:validate -- --episode <id>`
- `npm run metadata:youtube -- <args>`
- `npm run youtube:upload -- --episode <id>`
- `npm run images:plan -- --episode <id>`
- `npm run images:generate -- --episode <id>`

## Image Batch Commands

`images batch` exposes the local-first image batch lifecycle. `prepare` writes manifests and JSONL locally and never creates remote files or batches. Only `submit` uploads the prepared input and creates the provider batch. `status` refreshes provider state, `download` imports finished results idempotently, and `resume` prepares a retry batch only for retryable items. `resume` accepts an optional `--batch`; when omitted it uses the latest retryable batch in the local index.

```bash
npm run mediaforge -- images batch prepare --episode 001-demo --languages en --variants full --json
npm run mediaforge -- images batch submit --episode 001-demo --batch imgb-abc123 --json
npm run mediaforge -- images batch status --episode 001-demo --batch imgb-abc123 --json
npm run mediaforge -- images batch download --episode 001-demo --batch imgb-abc123 --json
npm run mediaforge -- images batch resume --episode 001-demo --json
```

## Mathematics Renderer Fixtures

`math renderer fixture natural-chalk` writes eight deterministic SVG golden
fixture pairs and a hash manifest. Repository-local output is restricted to
the ignored `.cache/math-pipeline/` workspace.

```bash
pnpm mediaforge math renderer fixture natural-chalk \
  --output .cache/math-pipeline/natural-chalk-fixtures
```

The fixtures cover locale diacritics, repeated digits/operators, place value,
fractions, equations, coordinate graphs, geometry, and an upper-grade formula.
They use `math-semantic-chalk.v7`; a rectangular line wipe is not a supported
fallback.

## Thumbnail Commands

`thumbnails generate` creates exact localized full or short thumbnail artifacts and keeps them independent from render or upload steps.

`youtube upload` now reuses that generator automatically when `--thumbnail-path` is omitted. Pass `--variant full` or `--variant short` explicitly; the upload command uses the matching metadata variant, the metadata `thumbnail.recommendedText` hook, and `episodes/<episode-slug>/story-production/thumbnail-story.json`.

The generator also consumes `thumbnail.imagePrompt` as visual direction. For a long-form Studio Test & Compare set, add `--candidates`; this makes three paid image-generation calls with reaction, threat-closeup, and mystery-object concepts, ranks the five metadata hooks, writes `test-1` through `test-3` artifacts, and reports mobile-size contrast/detail checks as JSON. YouTube upload continues to select the normal unsuffixed artifact automatically.

```bash
npm run mediaforge -- thumbnails generate \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --locale en \
  --format full \
  --style viral-horror-v1 \
  --hook-text "SHE CALLED HER NAME" \
  --story-file episodes/014-hachishakusama-the-eight-foot-woman/story-production/thumbnail-story.json \
  --dry-run
```

Story input is JSON with:

- `title`
- `summary`
- `protagonistDescription` or `protagonist`
- `threatDescription` or `threat`
- `settingDescription` or `setting`
- optional `emphasisWord`
- optional `referenceImagePath`

Options:

- `--episode <slug>`
- `--locale <locale>`
- `--format <full|short>`
- `--style <cinematic-horror|editorial-card|viral-horror-v1>`
- `--hook-text <text>`
- `--story-file <path>`
- `--emphasis-word <word>`
- `--quality <low|medium|high|auto>`
- `--text-strategy <post-rendered|model-rendered>`
- `--reference-image <path>`
- `--force`
- `--dry-run`
- `--verbose`
- `--json`
- `--candidates` (long-form only; three paid generations)

Artifacts:

- Full thumbnail: `episodes/<episode-slug>/locales/<locale>/full/thumbnails/thumbnail.png`
- Short thumbnail: `episodes/<episode-slug>/locales/<locale>/short/thumbnails/thumbnail.png`
- Manifest: `episodes/<episode-slug>/locales/<locale>/<full|short>/thumbnails/thumbnail.manifest.json`

## Story Commands

`stories localize` is the older batch/sync localization workflow. It discovers canonical English full stories and can generate English short plus localized full/short outputs.

```bash
npm run stories:localize -- --episode 002 --languages de,es,fr,pt --mode sync
```

Options:

- `--all`
- `--file <path>`
- `--episode <number-or-slug>`
- `--source-dir <path>`
- `--output-dir <path>`
- `--languages <comma-separated-languages>`
- `--include-english-short`
- `--mode <batch|sync>`
- `--adaptation-mode <faithful|retention-optimized>`
- `--short-min-seconds <number>`
- `--short-max-seconds <number>`
- `--short-wpm <number>`
- `--concurrency <number>`
- `--model <model>`
- `--fallback-to-sync`
- `--force`
- `--submit`
- `--prepare-batch`
- `--wait`
- `--auto-import`
- `--poll-interval-seconds <number>`
- `--dry-run`
- `--validate-only`
- `--verbose`

`stories pipeline` plans the durable story workflow without running stages. The current implementation is a dry-run skeleton that emits a schema-validated planned manifest.

```bash
npm run mediaforge -- stories pipeline \
  --episode 009-the-christmas-doll \
  --locales en,es,fr \
  --formats full,short \
  --dry-run \
  --json
```

Options:

- `--episode <slug-or-number>`
- `--locales <comma-separated-locales>`
- `--formats <comma-separated-formats>`
- `--output-root <path>`
- `--resume [workflow-id]`
- `--dry-run`
- `--cost-estimate`
- `--batch-mode <sync|batch|hybrid>`
- `--json`
- `--verbose`

`stories pipeline status` reads a persisted workflow manifest and reports partial success by locale and stage state.

```bash
npm run mediaforge -- stories pipeline status \
  --episode 009-the-christmas-doll \
  --workflow wf_009-the-christmas-doll_20260701T000000Z_deadbeef \
  --json
```

`stories pipeline inspect` prints the persisted workflow manifest as JSON.

```bash
npm run mediaforge -- stories pipeline inspect \
  --episode 009-the-christmas-doll \
  --workflow wf_009-the-christmas-doll_20260701T000000Z_deadbeef
```

`stories production status` summarizes workflow state into ready, retryable, blocked, waiting, and completed stage buckets grouped by canonical English, localization, shorts, scene-plan, images, audio, and render. It also reports the local `horror-affect-plan.json` state (`missing`, `current`, `stale`, or `invalid`), rollout mode, plan hash, and first state reason without making a provider call. When no persisted workflow manifest exists for an episode, it falls back to the current workspace artifacts.

```bash
npm run mediaforge -- stories production status \
  --episode 009-the-christmas-doll \
  --json
```

`stories production next` lists the currently actionable ready or retryable stages from persisted workflow state, or from current workspace artifacts when no manifest exists.

```bash
npm run mediaforge -- stories production next \
  --episodes 009-the-christmas-doll,010-the-cleaner-of-death \
  --limit 10
```

`stories production resume` uses the same gate evaluation and returns only eligible stages in resume order; blocked and waiting stages are excluded. It also falls back to current workspace artifacts when no manifest exists.

```bash
npm run mediaforge -- stories production resume \
  --episode 009-the-christmas-doll \
  --json
```

`stories production batch` selects the next eligible stage family per episode, stops blocked episodes at the recovery view, and continues unaffected episodes without bypassing validation gates. Episodes without persisted workflow manifests are evaluated from current workspace artifacts instead of failing fast.

```bash
npm run mediaforge -- stories production batch \
  --episodes 009-the-christmas-doll,010-the-cleaner-of-death \
  --json
```

`stories batch todo` is the operator recovery view over workflow state. It lists retryable, blocked, and ready next actions and points blocked render targets back to the narrowest repair commands. It uses current workspace artifacts when persisted workflow state is absent.

```bash
npm run mediaforge -- stories batch todo \
  --episodes 009-the-christmas-doll,010-the-cleaner-of-death \
  --json
```

`stories production repair` assembles explicit upstream recovery commands for blocked render targets without silently regenerating missing assets. It can target legacy episodes that have render inputs on disk even when they do not yet have persisted workflow manifests.

```bash
npm run mediaforge -- stories production repair \
  --episode 009-the-christmas-doll \
  --languages de \
  --profiles full \
  --regenerate-audio \
  --render
```

`stories images generate` is the story-oriented image execution wrapper. It delegates to the existing image resume flow across one or more episodes and can skip episodes that are not image-ready yet.

```bash
npm run mediaforge -- stories images generate \
  --episodes 009-the-christmas-doll,010-the-cleaner-of-death \
  --only-ready \
  --json
```

`stories audio generate` is the story-oriented narration execution wrapper. It drives the staged narration pipeline through its validate surface for ready audio targets so generation and validation stay on the same lower-level path.

```bash
npm run mediaforge -- stories audio generate \
  --episode 009-the-christmas-doll \
  --languages en,de \
  --profiles full,short \
  --only-ready \
  --json
```

`stories audio validate` validates existing narration artifacts without mutation for the selected story targets.

```bash
npm run mediaforge -- stories audio validate \
  --episode 009-the-christmas-doll \
  --languages en,de \
  --profiles full,short \
  --only-ready \
  --json
```

`stories render` renders only targets whose localized inputs pass direct image and audio validation. Burned-in captions are off by default; pass `--captions` to require and render them. Use `--only-ready` to skip blocked outputs and continue the ready ones.

```bash
npm run mediaforge -- stories render \
  --episode 009-the-christmas-doll \
  --languages en,de \
  --profiles full,short \
  --only-ready
```

`stories render validate` validates existing render artifacts only. Burned-in captions are optional by default; pass `--captions` to require them. It writes per-output final-media validation reports, does not generate missing upstream assets, and can inspect current workspace render inputs when no workflow manifest exists.

```bash
npm run mediaforge -- stories render validate \
  --episode 009-the-christmas-doll \
  --languages en,de \
  --profiles full,short \
  --json
```

`stories rewrite-full` is the current focused full-story rewrite command. It requires either `--episode` or `--input`, not both.

```bash
npm run mediaforge -- stories rewrite-full \
  --input content-ideas/content/dark-truth-episodes-optimized/010-the-cleaner-of-death-en-full-optimized.md \
  --episode-slug 010-the-cleaner-of-death \
  --languages de,es,fr,pt \
  --dry-run \
  --verbose
```

Options:

- `--episode <id-or-slug>`
- `--input <path>`
- `--episode-slug <slug>`
- `--language <code>`
- `--languages <comma-separated-codes>`
- `--model <model>`
- `--output-root <path>`
- `--temperature <number>`
- `--reasoning-effort <value>`
- `--max-output-tokens <number>`
- `--retry-max-output-tokens <number>`
- `--max-concurrency <number>`
- `--timeout-ms <number>`
- `--max-retries <number>`
- `--overwrite`
- `--resume`
- `--dry-run`
- `--force`
- `--json`
- `--verbose`

`stories rewrite-short` generates short-story artifacts from a validated generated full story by default.

```bash
npm run mediaforge -- stories rewrite-short \
  --episode 009 \
  --duration 60 \
  --languages en,de,es,fr,pt \
  --resume
```

Options:

- `--episode <id-or-slug>`
- `--input <path>`
- `--episode-slug <slug>`
- `--language <code>`
- `--languages <comma-separated-codes>`
- `--model <model>`
- `--output-root <path>`
- `--duration <30|45|60|75>`
- `--temperature <number>`
- `--reasoning-effort <value>`
- `--max-output-tokens <number>`
- `--retry-max-output-tokens <number>`
- `--max-concurrency <number>`
- `--timeout-ms <number>`
- `--max-retries <number>`
- `--overwrite`
- `--resume`
- `--dry-run`
- `--compatibility-source`
- `--force`
- `--json`
- `--verbose`

Supported story language codes are `en`, `de`, `es`, `fr`, and `pt`. Full localization command defaults for non-English languages are `de,es,fr,pt`; short rewrite defaults to `en` when no language is provided.

`story-short-evaluate` inspects a persisted short artifact and reports the selected events, beat plan, duration alignment, and quality signals without regenerating the story.

```bash
npm run mediaforge -- story-short-evaluate \
  --episode 021-the-rake-at-the-bedroom-window \
  --language de \
  --duration 60 \
  --json
```

`stories analyze` evaluates a persisted full story artifact and persists `episodes/<episode-slug>/<language>/full/story-production-analysis.json`.

```bash
npm run mediaforge -- stories analyze \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --language en \
  --format full \
  --analysis-version v2 \
  --json
```

V1 remains the default. `--analysis-version v2` explicitly selects the
shadow/advisory evidence-bearing contract. Human and JSON output include V2
dimension scores, paragraph spans, affect-plan IDs, and evidence summaries;
production thresholds remain unchanged.

Options:

- `--episode <slug-or-number>`
- `--language <code>`
- `--format <full>`
- `--output-root <path>`
- `--force`
- `--refresh`
- `--model <model>`
- `--reasoning-effort <low|medium|high>`
- `--analysis-version <v1|v2>`
- `--json`
- `--verbose`

Related analysis state surfaces:

- `stories inspect --episode <slug-or-number> --language <code> --format full`
- `stories status --episode <slug-or-number> --language <code> --format full`

Story artifact paths:

- Materialized canonical source: `episodes/<episode-slug>/source/<episode-number>-<episode-slug>-en-full.md`
- Authored English full story: `episodes/<episode-slug>/languages/script-en.md`
- Authored localized full story: `episodes/<episode-slug>/languages/script-<language>.md`
- Authored Short story, when distinct from full: `episodes/<episode-slug>/languages/short/script-<language>.md`
- Short Markdown: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.md`
- Short JSON: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.json`
- Short manifest: `episodes/<episode-slug>/manifests/short-rewrite-manifest.json`
- Full localization cache: `episodes/<episode-slug>/.localization-cache/`
- Story production artifacts: `episodes/<episode-slug>/story-production/`

## Story Batch Commands

`stories:batches` commands operate on persisted localization batch state:

- `stories:batches list --output-dir <path> --verbose`
- `stories:batches latest --output-dir <path> --verbose`
- `stories:batches pending --output-dir <path> --verbose`
- `stories:batches ready --output-dir <path> --verbose`
- `stories:batches completed --output-dir <path> --verbose`
- `stories:batches failed --output-dir <path> --verbose`
- `stories:batches expired --output-dir <path> --verbose`
- `stories:batches find --episode <episode> --output-dir <path> --verbose`
- `stories:batches show --batch <id> --output-dir <path> --verbose`
- `stories:batches status --batch <id> --output-dir <path> --verbose`
- `stories:batches refresh --output-dir <path> --verbose`
- `stories:batches import --batch <id> --output-dir <path> --verbose`
- `stories:batches import-ready --output-dir <path> --verbose`
- `stories:batches retry-failed --batch <id> --output-dir <path> --verbose`
- `stories:batches cancel --batch <id> --output-dir <path> --verbose`
- `stories:batches verify-index --output-dir <path> --repair --verbose`
- `stories:batches rebuild-index --output-dir <path> --verbose`

## Episode Commands

The canonical namespace is singular `episode`. The `episodes` alias is registered for compatibility.

Common production/review commands:

- `episode inspect --episode <number-or-slug> --source <path> --output-root <path> --json --verbose`
- `episode dry-run --episode <number-or-slug> --language <code> --artifact <full|short>`
- `episode analyze --episode <number-or-slug>`
- `episode plan --episode <number-or-slug>`
- `episode english --episode <number-or-slug>`
- `episode localized --episode <number-or-slug> --languages <en|de|es|fr>`
- `episode short --episode <number-or-slug> --language <en|de|es|fr>`
- `episode status --episode <number-or-slug>`
- `episode validate --episode <number-or-slug>`
- `episode sync-characters --episode <number-or-slug> --force --json --verbose`
- `episode bootstrap-characters --episode <number-or-slug> --approve --force --json --verbose`
- `episode resume-images --episode <number-or-slug> --concurrency <number> --allow-unapproved-character-references --force --json --verbose`
- `episode review prepare --episode <number-or-slug>`
- `episode review approve --episode <number-or-slug> --language <code> --artifact <full|short> --reviewer <name> --notes <text>`
- `episode review reject --episode <number-or-slug> --language <code> --artifact <full|short> --reviewer <name> --reason <text> --notes <text>`
- `episode review status --episode <number-or-slug>`

`stories sync-characters`, `stories bootstrap-shared`, `stories resume-images`, `stories images generate`, and `stories audio generate|validate` are story-oriented wrappers around the same lower-level character, image, and narration workflows.

## Image Commands

Primary image workflow:

- `images plan --episode <episode-id> --scene <scene-id> --allow-unapproved-character-references --force`
- `images generate --episode <episode-id> --scene <scene-id> --allow-unapproved-character-references --force`
- `images resume --episode <episode-id> --source <path> --concurrency <number> --allow-unapproved-character-references --force --json --verbose`
- `images sync-shared --episode <episode-id> --source <path> --output-root <path> --force --json --verbose`
- `images generate-character-references --episode <episode-id> --character <character-id> --force`
- `images approve-character --episode <episode-id> --character <character-id>`
- `images regenerate-character --episode <episode-id> --character <character-id> --force`
- `images export-openart <episode-id>`
- `images open-openart <episode-id>`
- `images import <episode-id> --from <directory>`
- `images status <episode-id>`
- `images validate <episode-id>`
- `images missing <episode-id>`
- `images reject <episode-id> --scene <scene-id> --reason <reason>`
- `images regenerate-workbook <episode-id> --missing-only`
- `images assign <episode-id> --scene <scene-id> --file <path>`

Canonical singular episode resume example:

```bash
npm run mediaforge -- episode resume-images --episode <episode-id> --concurrency 2
node apps/cli/dist/index.js episode resume-images --episode 011-the-black-eyed-children --concurrency 2
```

Do not use `episodes resume-images` in new docs or automation; use the singular `episode` namespace.

## Audio, Metadata, Render, Upload

Audio generation is separate from story rewriting. The speech package reads finalized authored scripts through the shared episode resolver and voice settings from `docs/voice-settings.md`; it does not read `docs/templates/audio/system-prompt.md` or `docs/templates/audio/short-story-prompt.md`.

```bash
npm run mediaforge -- audio generate-localized 011-the-black-eyed-children --languages de,es,fr
```

Localized audio outputs are written below each language/artifact workspace, including `audio/segments`, `audio/narration.wav`, and `audio/generation-report.json`.

Metadata, render, and upload commands are distinct stages:

- `metadata generate <episode-id>`
- `metadata youtube [source] --episode <episode-slug> --all --force`
- `render <episode-id> --profile youtube`
- `render <episode-id> --profile vertical`
- `youtube upload --episode <episode-id> --variant full --generate-metadata --metadata-path <path> --video-path <path> --thumbnail-path <path> --playlist-id <id> --privacy-status <private|public|unlisted> --publish-at <timestamp> --notify-subscribers --force`
- `youtube upload --episode <episode-id> --variant short --metadata-path <path-to-short-youtube-json> --video-path <path-to-9x16-mp4> --thumbnail-path <path> --privacy-status <private|public|unlisted> --force`

For short uploads, `--variant short` selects short metadata and vertical render artifacts. Without an explicit `--metadata-path`, missing short metadata fails closed instead of falling back to legacy full-length root metadata.

YouTube upload reports are written to:

```text
episodes/<episode-id>/generated-assets/upload-reports/youtube-upload.json
episodes/<episode-id>/generated-assets/upload-reports/youtube-upload.md
```

## Configuration

Runtime config is loaded from `.env` in the current working directory and process environment, with CLI flags overriding where command code supports them. Do not hard-code model names in automation; configure the relevant keys.

Story generation keys:

- `MEDIAFORGE_OPENAI_STORY_MODEL` or `OPENAI_STORY_MODEL`
- `MEDIAFORGE_OPENAI_STORY_TEMPERATURE` or `OPENAI_STORY_TEMPERATURE`
- `MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT` or `OPENAI_STORY_REASONING_EFFORT`
- `MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS` or `OPENAI_STORY_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS` or `OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_HORROR_AFFECT_ROLLOUT_MODE` (`off`, `shadow`, or `enforce`; default `shadow`)
- `MEDIAFORGE_OPENAI_LOCALIZATION_MODEL` or `OPENAI_LOCALIZATION_MODEL`
- `MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT` or `OPENAI_LOCALIZATION_REASONING_EFFORT`
- `MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS` or `OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_OPENAI_SHORT_MODEL` or `OPENAI_SHORT_MODEL`
- `MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT` or `OPENAI_SHORT_REASONING_EFFORT`
- `MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS` or `OPENAI_SHORT_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS` or `OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS` or `OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS`
- `MEDIAFORGE_OPENAI_VALIDATOR_MODEL` or `OPENAI_VALIDATOR_MODEL`
- `MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT` or `OPENAI_VALIDATOR_REASONING_EFFORT`
- `MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS` or `OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS`

Shared OpenAI-compatible keys:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_ORGANIZATION`
- `OPENAI_PROJECT`
- `MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY`
- `MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL`
- `MEDIAFORGE_OPENAI_COMPATIBLE_ORGANIZATION`
- `MEDIAFORGE_OPENAI_COMPATIBLE_PROJECT`

Speech keys:

- `MEDIAFORGE_TTS_PROVIDER`
- `MEDIAFORGE_OPENAI_SPEECH_MODEL` or `OPENAI_SPEECH_MODEL`
- `MEDIAFORGE_OPENAI_SPEECH_VOICE` or `OPENAI_SPEECH_VOICE`
- `MEDIAFORGE_OPENAI_COMPATIBLE_TTS_VOICE`
- `MEDIAFORGE_SPEECH_VOICE_PRESET`
- `TTS_CONCURRENCY` or `OPENAI_TTS_CONCURRENCY`

Image keys:

- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `OPENAI_IMAGE_FULL_SIZE`
- `OPENAI_IMAGE_SHORT_SIZE`
- `YOUTUBE_FULL_IMAGE_SIZE`
- `YOUTUBE_SHORT_IMAGE_SIZE`
- `YOUTUBE_FULL_RENDER_SIZE`
- `YOUTUBE_SHORT_RENDER_SIZE`
- `OPENAI_IMAGE_QUALITY`
- `OPENAI_IMAGE_FORMAT`
- `OPENAI_IMAGE_CONCURRENCY`
- `OPENAI_IMAGE_MAX_RETRIES`
- `OPENAI_IMAGE_TIMEOUT_MS`
- `OPENAI_IMAGE_DEBUG`
- `OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES`
- `OPENAI_IMAGE_FORCE`
- `VISUAL_SCENE_TARGET_PER_10_MINUTES`
- `VISUAL_SCENE_MIN_SECONDS`
- `VISUAL_SCENE_MAX_SECONDS`

Image sizing notes:

- OpenAI image-generation size and final video render size are different settings.
- Recommended `.env` values:
  `OPENAI_IMAGE_MODEL=gpt-image-2`,
  `OPENAI_IMAGE_SIZE=1536x864`,
  `OPENAI_IMAGE_FULL_SIZE=1536x864`,
  `OPENAI_IMAGE_SHORT_SIZE=864x1536`,
  `YOUTUBE_FULL_RENDER_SIZE=1920x1080`,
  `YOUTUBE_SHORT_RENDER_SIZE=1080x1920`,
  `OPENAI_IMAGE_QUALITY=low`,
  `OPENAI_IMAGE_FORMAT=png`.
- Full-video precedence is `OPENAI_IMAGE_FULL_SIZE`, then `YOUTUBE_FULL_IMAGE_SIZE`, then `OPENAI_IMAGE_SIZE`, then the typed default `1536x864`.
- Short-video precedence is `OPENAI_IMAGE_SHORT_SIZE`, then `YOUTUBE_SHORT_IMAGE_SIZE`, then the typed default `864x1536`.
- `OPENAI_IMAGE_SIZE` is a backward-compatible full-video fallback only. Shorts ignore it unless a short-specific value is configured.
- `1920x1080` and `1080x1920` are render sizes. They are not the default OpenAI request sizes and should not be used as provider defaults unless you explicitly want that larger image-generation request.

Workspace and script-language keys:

- `MEDIAFORGE_WORKSPACE`
- `MEDIAFORGE_DB_PATH`
- `MEDIAFORGE_WORKFLOW_DATABASE_URL` (required for connected API/CLI workflow admission)
- `MEDIAFORGE_LOG_LEVEL`
- `MEDIAFORGE_SCRIPT_LANGUAGE`
- `EPISODES_SOURCE_ROOT`
- `EPISODES_OUTPUT_ROOT`

YouTube keys:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_REFRESH_TOKEN_GERMAN`
- `YOUTUBE_REFRESH_TOKEN_SPANISH`
- `YOUTUBE_REFRESH_TOKEN_FRENCH`
- `YOUTUBE_REFRESH_TOKEN_PORTUGUESE`
- `YOUTUBE_REDIRECT_URI`
- `YOUTUBE_CHANNEL_ID`
- `YOUTUBE_CHANNEL_ID_GERMAN`
- `YOUTUBE_CHANNEL_ID_SPANISH`
- `YOUTUBE_CHANNEL_ID_FRENCH`
- `YOUTUBE_CHANNEL_ID_PORTUGUESE`

Local OAuth helpers:

- `pnpm youtube:auth:english`
- `pnpm youtube:auth:german`
- `pnpm youtube:auth:spanish`
- `pnpm youtube:auth:french`
- `pnpm youtube:auth:portuguese`

Each helper starts a localhost callback server, opens the Google OAuth URL in your default browser when possible, and writes the resolved refresh token and channel ID back into your local `.env`.

## Execution Reports

Telemetry-wrapped npm scripts write JSON execution reports to:

```text
.mediaforge/execution-reports/<executionId>.json
```

Reports include command argv, cwd, start/end timestamps, duration, success state, exit code, episode ID when available, API calls, process executions, generated images, retry counts, and estimated costs.
