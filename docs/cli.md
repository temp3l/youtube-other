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
- `render <episode-id> --profile <youtube|vertical> --no-captions`
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

Story artifact paths:

- Materialized canonical source: `episodes/<episode-slug>/source/<episode-number>-<episode-slug>-en-full.md`
- Canonical English full story: `episodes/<episode-slug>/script.md`
- Localized full story: `episodes/<episode-slug>/<language>/full/script.md`
- Short Markdown: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.md`
- Short JSON: `episodes/<episode-slug>/<language>/short/<episode-number>-<episode-slug>-<language>-short.json`
- Short compatibility script: `episodes/<episode-slug>/<language>/short/script.md`
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

`stories sync-characters`, `stories bootstrap-shared`, and `stories resume-images` are story-oriented aliases around the same character/image workflows.

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
- `images generate-openai <episode-id> --scene <scene-id>`

Canonical singular episode resume example:

```bash
npm run mediaforge -- episode resume-images --episode <episode-id> --concurrency 2
node apps/cli/dist/index.js episode resume-images --episode 011-the-black-eyed-children --concurrency 2
```

Do not use `episodes resume-images` in new docs or automation; it exists only through the compatibility alias.

## Audio, Metadata, Render, Upload

Audio generation is separate from story rewriting. The speech package reads finalized `script.md` files and voice settings from `docs/voice-settings.md`; it does not read `docs/templates/audio/system-prompt.md` or `docs/templates/audio/short-story-prompt.md`.

```bash
npm run mediaforge -- audio generate-localized 011-the-black-eyed-children --languages de,es,fr
```

Localized audio outputs are written below each language/artifact workspace, including `audio/segments`, `audio/narration.wav`, `audio/generation-report.json`, and `audio/script-source-<language>.md`.

Metadata, render, and upload commands are distinct stages:

- `metadata generate <episode-id>`
- `metadata youtube [source] --episode <episode-slug> --all --force`
- `render <episode-id> --profile youtube`
- `render <episode-id> --profile vertical --no-captions`
- `youtube upload --episode <episode-id> --generate-metadata --metadata-path <path> --video-path <path> --thumbnail-path <path> --playlist-id <id> --privacy-status <private|public|unlisted> --publish-at <timestamp> --notify-subscribers --force`

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

Workspace and script-language keys:

- `MEDIAFORGE_WORKSPACE`
- `MEDIAFORGE_DB_PATH`
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
- `YOUTUBE_REDIRECT_URI`
- `YOUTUBE_CHANNEL_ID`
- `YOUTUBE_CHANNEL_ID_GERMAN`
- `YOUTUBE_CHANNEL_ID_SPANISH`
- `YOUTUBE_CHANNEL_ID_FRENCH`

## Execution Reports

Telemetry-wrapped npm scripts write JSON execution reports to:

```text
.mediaforge/execution-reports/<executionId>.json
```

Reports include command argv, cwd, start/end timestamps, duration, success state, exit code, episode ID when available, API calls, process executions, generated images, retry counts, and estimated costs.
