# CLI

This repo’s command line surface is the `mediaforge` CLI plus a small set of npm scripts that wrap it with telemetry.

The `episode` command group also accepts the `episodes` alias for compatibility with the newer namespace naming.

## Sample Commands

Use these as the starting point for the common workflow slices.

Rewrite an optimized English source story into the canonical episode workspace:

```bash
node apps/cli/dist/index.js stories rewrite-full \
  --input content-ideas/content/dark-truth-episodes-optimized/010-the-cleaner-of-death-en-full-optimized.md \
  --episode-slug 010-the-cleaner-of-death \
  --dry-run \
  --verbose
```

Run the same command without `--dry-run` to write the canonical English full story and any requested localized full outputs under:

```text
episodes/010-the-cleaner-of-death/
```

Generate localized short stories from the canonical English source:

```bash
node apps/cli/dist/index.js stories rewrite-short \
  --episode 009 \
  --languages de,es,fr,pt \
  --resume
```

Create or sync the shared character map for an episode:

```bash
node apps/cli/dist/index.js stories sync-characters \
  --episode 011-the-black-eyed-children
```

Bootstrap the shared character map and generate reference images:

```bash
node apps/cli/dist/index.js stories bootstrap-shared \
  --episode 011-the-black-eyed-children \
  --approve
```

Resume image generation with the episode namespace alias:

```bash
node apps/cli/dist/index.js episodes resume-images \
  --episode 011-the-black-eyed-children \
  --concurrency 2
```

Generate localized narration audio for every script in the episode workspace:

```bash
node apps/cli/dist/index.js audio generate-localized \
  011-the-black-eyed-children \
  --languages de,es,fr
```

Upload the final rendered video:

```bash
node apps/cli/dist/index.js youtube upload \
  --episode 011-the-black-eyed-children \
  --generate-metadata
```

## Quick Matrix

| Task | Preferred command |
| --- | --- |
| Inspect an episode | `npm run doctor` |
| Plan image prompts | `npm run images:plan -- --episode <episode-id>` |
| Generate images | `npm run images:generate -- --episode <episode-id>` |
| Resume image generation and bootstrap a missing manifest | `npm run mediaforge -- images resume --episode <episode-id> --concurrency 2` |
| Resume image generation via episode alias | `npm run mediaforge -- episodes resume-images --episode <episode-id> --concurrency 2` |
| Generate one scene | `npm run images:generate -- --episode <episode-id> --scene scene-007` |
| Regenerate one scene | `npm run images:generate -- --episode <episode-id> --scene scene-007 --force` |
| Create character references | `npm run mediaforge -- images generate-character-references --episode <episode-id> --character <character-id>` |
| Approve a character reference | `npm run mediaforge -- images approve-character --episode <episode-id> --character <character-id>` |
| Sync shared character map | `npm run mediaforge -- episode sync-characters --episode <episode-id>` |
| Sync shared character map from `stories` | `npm run mediaforge -- stories sync-characters --episode <episode-id>` |
| Bootstrap shared character refs | `npm run episode:bootstrap-characters -- --episode <episode-id> --approve` |
| Bootstrap shared story assets | `npm run mediaforge -- stories bootstrap-shared --episode <episode-id> --approve` |
| Generate localized audio for all available scripts | `npm run mediaforge -- audio generate-localized <episode-id>` |
| Upload a rendered episode | `npm run youtube:upload -- --episode <episode-id>` |
| Validate generated images | `npm run mediaforge -- images validate <episode-id>` |

## Running It

Use the root scripts for the common flows:

```bash
npm run doctor
npm run images:plan -- --episode 001-calhoun-experiment
npm run images:generate -- --episode 001-calhoun-experiment
npm run youtube:upload -- --episode 001-calhoun-experiment
```

If you already have a built CLI, you can also call it directly:

```bash
node apps/cli/dist/index.js images generate --episode 001-calhoun-experiment
```

## Telemetry Wrapper

`scripts/run-with-telemetry.mjs` wraps selected npm scripts and forwards the actual command after `--`.

It does three things:

1. emits JSON start/end events to stderr;
2. generates or reuses a `MEDIAFORGE_EXECUTION_ID`;
3. passes execution metadata into the child process.

The wrapper sets these environment variables for the child:

- `MEDIAFORGE_EXECUTION_ID`
- `MEDIAFORGE_EXECUTION_STARTED_AT`
- `MEDIAFORGE_NPM_SCRIPT`
- `MEDIAFORGE_NPM_SCRIPT_COMMAND`
- `MEDIAFORGE_NPM_SCRIPT_ARGS`

If you want to correlate multiple commands, set `MEDIAFORGE_EXECUTION_ID` yourself before running them.

## Image Commands

The image workflow is grouped under `images`:

- `images plan` - build prompts and scene workbook without making a paid image call.
- `images generate` - generate episode images, optionally for one `--scene`.
- `images resume` - resume partial image generation and create `manifest.json` first when the episode folder does not have one yet.
- `episode resume-images` - episode-scoped alias for `images resume`; it uses the same resumable image state and bootstraps `manifest.json` when missing.
- `images generate-character-references` - create reference images for a character.
- `images approve-character` - mark a generated character reference as approved.
- `images regenerate-character` - regenerate a specific character reference.
- `episode sync-characters` - copy the canonical source-pack `characters.json` into the shared episode workspace.
- `stories sync-characters` - story-oriented alias for `episode sync-characters`; it copies only `shared/characters.json` and does not generate reference images.
- `episode bootstrap-characters` - sync the shared character map, or synthesize `shared/characters.json` from the episode source when the source pack omits one, then generate all reference images and optionally approve them.
- `stories bootstrap-shared` - story-oriented alias for `episode bootstrap-characters`; it syncs `shared/characters.json` and generates the shared character reference images for the selected episode.
- `audio generate-localized` - generate narration audio for every localized `script-<lang>.md` file in the episode workspace; use `--languages` to restrict the run.
- `images export-openart` - export prompts for OpenArt.
- `images open-openart` - open the OpenArt handoff.
- `images import --from <dir>` - import generated images from a directory.
- `images validate` - validate generated image assets against the scene plan.
- `images missing` - print missing scenes as JSON.
- `images reject --scene <id> --reason <text>` - record a rejection note.
- `images regenerate-workbook [--missing-only]` - rebuild the workbook, optionally only for missing scenes.
- `images assign --scene <id> --file <path>` - assign a local file to a scene.
- `images generate-openai [--scene <id>]` - call the OpenAI image pipeline directly.

Useful flags:

- `--allow-unapproved-character-references` to override reference gating.
- `--force` to regenerate instead of reusing existing outputs.
- `--scene <scene-id>` to scope a command to one scene.

## Story Rewrite Commands

The story localization workflow now exposes two focused commands under `stories`:

- `stories rewrite-full` - rewrite an English full-length horror story into an optimized English full story plus localized full/short outputs.
- `stories rewrite-short` - rewrite an English full story into localized YouTube Short narration.

Useful flags:

- `--episode <id-or-slug>` to select an existing episode.
- `--input <path>` to bootstrap from an external English Markdown file.
- `--episode-slug <slug>` to pin the output episode slug when bootstrapping a new episode from an external input file.
- `--languages <comma-separated-codes>` to select target languages.
- `--overwrite` to replace existing generated outputs.
- `--resume` to reuse already validated outputs when available.
- `--dry-run` to plan the rewrite without writing files or calling OpenAI.
- `--json` to emit machine-readable output.

The generated files live under the episode workspace:

- `episodes/<episode-slug>/source/<episode-number>-<episode-slug>-en-full.md`
- `episodes/<episode-slug>/script.md`
- `episodes/<episode-slug>/<lang>/full/script.md`
- `episodes/<episode-slug>/<lang>/short/script.md`
- `episodes/<episode-slug>/shared/characters.json`

## YouTube Upload

`npm run youtube:upload -- --episode <episode-id>` uploads the rendered episode video and thumbnail using the metadata already written by the pipeline.

The command is resumable:

- it records a planned upload report before the API call;
- it skips already uploaded episodes when the video, thumbnail, and source metadata hashes still match;
- it writes a final report after the upload, thumbnail update, and playlist step complete.

Useful flags:

- `--generate-metadata` to regenerate YouTube metadata from the episode scenes before upload.
- `--metadata-path <path>` to use a specific metadata JSON file.
- `--video-path <path>` to override the rendered video file.
- `--thumbnail-path <path>` to override the thumbnail file.
- `--playlist-id <id>` to add the video to a playlist.
- `--privacy-status <private|public|unlisted>` to set the upload visibility.
- `--publish-at <iso-timestamp>` to schedule a future release.
- `--notify-subscribers` to toggle subscriber notifications.
- `--force` to ignore an existing successful upload report and re-run the upload.

The uploader writes reports to:

```text
episodes/<episode-id>/generated-assets/upload-reports/youtube-upload.json
episodes/<episode-id>/generated-assets/upload-reports/youtube-upload.md
```

## Common Environment Variables

The CLI reads standard workspace and runtime settings from `.env` or the process environment.

General runtime:

- `MEDIAFORGE_WORKSPACE`
- `MEDIAFORGE_DB_PATH`
- `MEDIAFORGE_LOG_LEVEL`
- `MEDIAFORGE_OPENART_BATCH_SIZE`
- `MEDIAFORGE_TTS_PROVIDER`
- `MEDIAFORGE_TRANSCRIPTION_PROVIDER`
- `MEDIAFORGE_IMAGE_PROVIDER`
- `MEDIAFORGE_TEXT_PROVIDER`
- `MEDIAFORGE_SCRIPT_LANGUAGE`
- `MEDIAFORGE_SPEECH_VOICE_PRESET`
- `MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL`
- `MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY`
- `MEDIAFORGE_OPENAI_SPEECH_MODEL`
- `MEDIAFORGE_OPENAI_SPEECH_VOICE`

OpenAI image settings used by the image workflow:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_ORGANIZATION` or `OPENAI_ORG_ID`
- `OPENAI_PROJECT`
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

YouTube upload settings:

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

Defaults worth knowing:

- `OPENAI_IMAGE_SIZE` defaults to `1024x1024`.
- `OPENAI_IMAGE_MODEL` defaults to `gpt-image-1-mini` for direct OpenAI image calls.
- `OPENAI_IMAGE_QUALITY` defaults to `low`.
- `OPENAI_IMAGE_CONCURRENCY` defaults to `2`.
- `OPENAI_IMAGE_MAX_RETRIES` defaults to `2`.
- `OPENAI_IMAGE_TIMEOUT_MS` defaults to `180000`.
- `VISUAL_SCENE_TARGET_PER_10_MINUTES` defaults to `100`.
- `VISUAL_SCENE_MIN_SECONDS` defaults to `5`.
- `VISUAL_SCENE_MAX_SECONDS` defaults to `6`.
- The target setting is the primary density knob. The seconds-based values remain available as fallback bounds.

## Examples

Plan and generate all images for one episode:

```bash
npm run images:plan -- --episode 001-calhoun-experiment
npm run images:generate -- --episode 001-calhoun-experiment
npm run mediaforge -- images resume --episode 011-the-black-eyed-children --concurrency 2
npm run mediaforge -- episode resume-images --episode 011-the-black-eyed-children --concurrency 2
```

Regenerate one scene only:

```bash
npm run images:generate -- --episode 001-calhoun-experiment --scene scene-008 --force
```

Generate a character reference:

```bash
npm run mediaforge -- images generate-character-references --episode 001-calhoun-experiment --character daniel-mercer
```

Bootstrap the shared character registry and reference images for a new episode:

```bash
npm run episode:bootstrap-characters -- --episode 002-even-killers-can-lick --approve
```

Validate the generated assets:

```bash
npm run mediaforge -- images validate 001-calhoun-experiment
```

Upload a rendered episode:

```bash
npm run youtube:upload -- --episode 001-calhoun-experiment
```

## Execution Reports

Every CLI run writes a JSON report to:

```text
.mediaforge/execution-reports/<executionId>.json
```

The report includes:

- the command, argv, cwd, start/end timestamps, and duration;
- success, exit code, signal, and episode ID when available;
- API calls, process executions, and generated images;
- totals for calls, retries, image count, and estimated costs;
- aggregates by provider, model, and operation.

The wrapper also emits `npm_script_start` and `npm_script_end` events, and the CLI writes a per-run JSON execution report for resumability and cost tracking.
