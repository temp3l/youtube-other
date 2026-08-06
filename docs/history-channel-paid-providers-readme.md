# History channel: paid-provider runbook

Run these commands from the repository root. Replace `EPISODE` with the
episode slug and `PACK` with the content-pack directory or file.

## One-time setup

```bash
pnpm install
cp .env.example .env
# Set secrets in .env or the process environment; never commit them.
export OPENAI_API_KEY='…'
export DARK_TRUTH_ENABLE_PAID_PROVIDERS=true
export MEDIAFORGE_TTS_PROVIDER=openai-compatible
export YOUTUBE_CLIENT_ID='…'
export YOUTUBE_CLIENT_SECRET='…'
pnpm build
pnpm doctor
pnpm youtube:auth:english
```

The YouTube auth command opens Google OAuth and stores the English refresh
token/channel ID in the local environment. Keep `.env` private.

## Generate the video

```bash
EPISODE=napoleons-invasion-of-russia
PACK=content-packs/youtube-history-10-video-story-pack

pnpm mediaforge -- content-pack validate "$PACK" --genre history --strict
pnpm mediaforge -- content-pack import "$PACK" --genre history --strict
pnpm mediaforge -- workflow history run-next --episode "$EPISODE" --continue

# Paid narration.
pnpm mediaforge -- --tts-provider openai-compatible audio generate "$EPISODE"
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.audio-generation
pnpm mediaforge -- workflow history run-next --episode "$EPISODE" --continue

# Plan, inspect, and explicitly approve the visual plan. Copy the plan hash
# printed by the first command into the second command.
pnpm mediaforge -- history visuals plan "$EPISODE"
pnpm mediaforge -- history visuals approve "$EPISODE" --plan-hash <PLAN_HASH>

# Paid images, local FFmpeg render, and paid thumbnail.
pnpm mediaforge -- images generate --episode "$EPISODE"
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.image-generation
pnpm mediaforge -- render "$EPISODE" --profile youtube --no-captions
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.video-rendering
pnpm mediaforge -- thumbnails generate --episode-slug "$EPISODE" --locale en --format full
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.thumbnail-rendering
pnpm mediaforge -- workflow history run-next --episode "$EPISODE" --continue

pnpm mediaforge -- metadata youtube --episode "$EPISODE"
pnpm mediaforge -- history workflow status "$EPISODE" --json
```

If a provider step is interrupted, rerun the same command with its supported
resume option or inspect `history workflow status` before retrying. Do not use
`--force` broadly for paid generation.

## Publish to YouTube

Review the generated MP4, thumbnail, metadata, and factuality report first.
Use `--privacy-status private` for the first upload; change it to `public` only
after final approval.

```bash
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" \
  --variant full \
  --privacy-status private \
  --generate-metadata
```

For a scheduled or public release, use `--publish-at <RFC3339-timestamp>` or
`--privacy-status public`. The upload requires `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, and `YOUTUBE_CHANNEL_ID`.

## Create an approval ZIP for ChatGPT review

The V3.3 approval pack is a compact, redacted review bundle. It contains the
canonical narration, research snapshot, claims/provenance, visual plan,
validation, approval gates, manifest, and checksums. It does not contain
generated media, audio, video, credentials, caches, or absolute local paths.

Create it after the episode has been imported and its V3.3 plan is available:

```bash
EPISODE=napoleons-invasion-of-russia
REVIEW_DIR="artifacts/chatgpt-review/${EPISODE}-v3.3"

pnpm mediaforge -- history visuals review-bundle "$EPISODE" \
  --planner-version v3.3 \
  --output "$REVIEW_DIR" \
  --output-root episodes \
  --json
```

The command returns the directory, ZIP path, plan hash, research-snapshot hash,
manifest hash, and ZIP SHA-256. The file to upload is:

```text
artifacts/chatgpt-review/<episode-slug>-v3.3.zip
```

Verify the archive before sending it:

```bash
unzip -l "$REVIEW_DIR.zip"
sha256sum "$REVIEW_DIR.zip"
```

If the plan must be regenerated from the offline research snapshot, add
`--regenerate`. This creates a new plan revision and a new approval ZIP:

```bash
pnpm mediaforge -- history visuals review-bundle "$EPISODE" \
  --planner-version v3.3 \
  --output "$REVIEW_DIR" \
  --output-root episodes \
  --regenerate \
  --json
```

Upload only the ZIP to ChatGPT and use this instruction:

```text
Review this History V3.3 approval ZIP as an independent editorial and visual
reviewer. Do not invent facts or approve blocked gates. Check the narration,
claims and provenance, chronology, visual beats, asset reuse, maps/diagrams,
16:9 and 9:16 adaptations, timing warnings, validation diagnostics, and the
approval states. Return: (1) blocking issues, (2) factual/provenance issues,
(3) visual/storyboard issues, (4) specific corrections, and (5) whether each
gate is ready for human approval. Cite the exact bundle filename and field for
every finding.
```
