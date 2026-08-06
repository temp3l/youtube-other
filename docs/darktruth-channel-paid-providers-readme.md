# Dark Truth channel: paid-provider runbook

Run from the repository root. Replace `EPISODE` with the episode slug.

## Setup

```bash
pnpm install
cp .env.example .env
export OPENAI_API_KEY='…'
export DARK_TRUTH_ENABLE_PAID_PROVIDERS=true
export MEDIAFORGE_TTS_PROVIDER=openai-compatible
export YOUTUBE_CLIENT_ID='…'
export YOUTUBE_CLIENT_SECRET='…'
pnpm build
pnpm doctor
pnpm youtube:auth:english
```

Keep secrets in `.env` or the process environment; never commit them.

## Generate and review

```bash
EPISODE=your-dark-truth-slug

pnpm mediaforge -- episode analyze --episode "$EPISODE" --language en --artifact full
pnpm mediaforge -- episode english --episode "$EPISODE"
pnpm mediaforge -- episode review prepare --episode "$EPISODE" --language en --artifact full
pnpm mediaforge -- episode review approve --episode "$EPISODE" --language en --artifact full --reviewer <name>

# Optional localized full versions.
pnpm mediaforge -- episode localized --episode "$EPISODE" --languages de,es,fr

# Paid narration and images; render itself is local FFmpeg.
pnpm mediaforge -- --tts-provider openai-compatible audio generate "$EPISODE"
pnpm mediaforge -- images generate --episode "$EPISODE"
pnpm mediaforge -- images validate "$EPISODE"
pnpm mediaforge -- render "$EPISODE" --profile youtube --no-captions
pnpm mediaforge -- metadata youtube --episode "$EPISODE"
pnpm mediaforge -- thumbnails generate --episode-slug "$EPISODE" --locale en --format full
pnpm mediaforge -- episode validate --episode "$EPISODE" --language en --artifact full
```

Inspect the MP4, thumbnail, metadata, and validation output before upload.

## Publish

```bash
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" \
  --variant full \
  --privacy-status private \
  --generate-metadata
```

Use `--privacy-status public` or `--publish-at <RFC3339-timestamp>` only after
final human approval. Upload needs the English YouTube OAuth variables.
