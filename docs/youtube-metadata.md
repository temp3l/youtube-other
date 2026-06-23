# YouTube Metadata Generation

This repository now includes a reusable command for generating SEO-focused YouTube upload metadata from an episode `scenes.json`.
The main episode pipeline now runs the OpenAI-backed metadata step last, after render and output validation.

## Prerequisites

- Node.js 22+
- A working OpenAI API key
- OpenAI API billing enabled for the project that owns the key
- `jq` and `curl` for the standalone shell helper

ChatGPT subscriptions and OpenAI API billing are separate. A ChatGPT plan does not automatically grant API access or API credits.

## Environment

Set these values in your shell or `.env` file:

```dotenv
OPENAI_API_KEY=
OPENAI_METADATA_MODEL=gpt-4.1-mini
OPENAI_METADATA_MAX_RETRIES=3
OPENAI_METADATA_KEEP_FILE=false
OPENAI_METADATA_TIMEOUT_MS=120000
YOUTUBE_METADATA_LANGUAGE=en
```

The model is configurable. The default in this repository is `gpt-4.1-mini`.

## Commands

Explicit file:

```bash
npm run metadata:youtube -- episodes/<episode-slug>/scenes.json
```

Episode mode:

```bash
npm run metadata:youtube -- --episode <episode-slug>
```

All episodes:

```bash
npm run metadata:youtube -- --all
```

Force regeneration:

```bash
npm run metadata:youtube -- episodes/<episode-slug>/scenes.json --force
```

Dry-run:

```bash
npm run metadata:youtube -- episodes/<episode-slug>/scenes.json --dry-run
```

The command writes outputs under `episodes/<episode-slug>/output/`:

- `youtube-metadata.json`
- `youtube-metadata.md`
- `youtube-description.txt`
- `youtube-chapters.txt`
- `youtube-tags.txt`
- `youtube-pinned-comment.txt`
- `youtube-metadata-generation.json`

## Caching

The command skips regeneration when the source `scenes.json`, model, language, prompt version, and prompt content hash match the previous successful run.

Use `--force` to bypass the cache.

## Validation

The command validates the source scenes locally before making any API request:

- `scenes` must be non-empty
- sequence numbers must be valid
- narration must exist
- timestamps must be finite
- scenes must be chronological
- scene ranges must not overlap unexpectedly

The model response is parsed and validated at runtime. If the response is invalid, the command performs one repair attempt and then fails clearly if it still cannot validate.

## Temporary OpenAI file cleanup

By default, the uploaded OpenAI file is deleted after processing.

Set this to keep the uploaded file:

```dotenv
OPENAI_METADATA_KEEP_FILE=true
```

## Curl debugging helper

The standalone shell helper follows the same basic flow using `curl` and `jq`:

```bash
OPENAI_API_KEY=... \
OPENAI_METADATA_MODEL=... \
./scripts/generate-youtube-metadata.sh \
  episodes/<episode-slug>/scenes.json
```

The helper:

- uploads the scenes file to the OpenAI Files API
- creates a Responses API request using `jq`
- extracts the assistant JSON output
- validates the output locally
- writes the final metadata to `episodes/<episode-slug>/output/youtube-metadata.json`

## Common failures

- `OPENAI_API_KEY` missing: export the key before running the command
- `insufficient_quota`: check API project billing, project selection, and key scope
- invalid source JSON: fix `scenes.json`
- malformed model output: rerun once after fixing the prompt or source scene data
- temporary file retention: set `OPENAI_METADATA_KEEP_FILE=true`

## Notes

- The command does not modify `scenes.json`
- The response is expected to be JSON only
- No secrets are written to the output artifacts
- The shell helper is for debugging and manual execution; the TypeScript command is the primary workflow
