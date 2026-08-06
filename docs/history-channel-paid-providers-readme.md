# History channel: plan, review, produce, and publish

Operator runbook for one History episode: plan visuals, review them, accept or
reject, generate paid media, render locally, build YouTube metadata, and upload.

Run every command from the repository root. Secrets stay in `.env` or the
process environment; never commit them.

```bash
EPISODE=history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
PACK=content-packs/youtube-history-10-video-story-pack
REVIEW_DIR="artifacts/chatgpt-review/${EPISODE}-v3.3"
```

Use the full imported episode ID under `episodes/`, not the short story title.

## What costs money

| Step | Paid? | Notes |
|---|---|---|
| Content-pack import | No | Structural only |
| Trusted-script authoring / V3.3 plan / review ZIP | No | Default History mode; no `OPENAI_API_KEY` |
| Explicit live research (`--live-research`) | Yes | Opt-in only; needs `--promote-to-research-backed` on trusted episodes |
| Narration (`audio generate`) | Yes | OpenAI-compatible TTS |
| Images (`images generate`) | Yes | Requires approved v1 visual plan |
| Thumbnail | Yes | OpenAI image generation |
| YouTube metadata (`metadata youtube`) | Yes | Uses OpenAI metadata generation |
| Local FFmpeg render | No | Local CPU/GPU only |
| YouTube upload | YouTube API | Needs OAuth; first upload should be `private` |

## 1. One-time setup

```bash
pnpm install
cp .env.example .env

# Paid media + YouTube (required for produce / metadata / publish)
export OPENAI_API_KEY='…'
export DARK_TRUTH_ENABLE_PAID_PROVIDERS=true
export MEDIAFORGE_TTS_PROVIDER=openai-compatible
export YOUTUBE_CLIENT_ID='…'
export YOUTUBE_CLIENT_SECRET='…'

pnpm build
pnpm doctor
pnpm youtube:auth:english
```

`pnpm youtube:auth:english` opens Google OAuth and stores
`YOUTUBE_REFRESH_TOKEN` / `YOUTUBE_CHANNEL_ID` locally.

Trusted-script planning and review-bundle export do **not** need
`OPENAI_API_KEY`. Keep the key unset until you intentionally start paid media.

## 2. Import the episode

```bash
pnpm mediaforge -- content-pack validate "$PACK" --genre history --strict --json
pnpm mediaforge -- content-pack import "$PACK" --genre history --strict --collect-errors --json
pnpm mediaforge -- history workflow status "$EPISODE" --json
pnpm mediaforge -- history workflow next "$EPISODE" --json
```

Imported History stories default to `sourceAuthorityMode: trusted-script`.
Canonical narration is treated as editorially trusted input. The pipeline does
not automatically call OpenAI research or web search.

## 3. Plan (trusted-script default)

Create the offline trusted attestation, claims, and V3.3 visual plan:

```bash
pnpm mediaforge -- history authoring trust-script "$EPISODE" --json
pnpm mediaforge -- history authoring status "$EPISODE" --json
pnpm mediaforge -- history v3.3 plan "$EPISODE" --reuse-frozen-snapshot --json
pnpm mediaforge -- history v3.3 validate "$EPISODE" --reuse-frozen-snapshot --json
```

Copy the printed `planHash`. Content can be `approved` under a valid trusted
attestation; production usually stays blocked on
`TIMING_MEASUREMENT_REQUIRED` until measured narration audio exists.

Also create the **v1 production visual plan**. Paid image generation checks this
approval file, not the V3.3 pack:

```bash
pnpm mediaforge -- history visuals plan "$EPISODE" --json
# Copy planHash from the response / approval pack.
```

Optional research-backed planning (paid, explicit):

```bash
pnpm mediaforge -- history authoring set-authority "$EPISODE" \
  --mode research-backed --reason "Need independently auditable sources" --json
pnpm mediaforge -- history v3.3 extract-claims "$EPISODE" \
  --live-research --promote-to-research-backed --json
# Then retrieve-sources / assess-evidence / freeze / plan as needed.
```

## 4. Review

Export a compact redacted V3.3 review ZIP (no media, no secrets, no caches):

```bash
pnpm mediaforge -- history visuals review-bundle "$EPISODE" \
  --planner-version v3.3 \
  --output "$REVIEW_DIR" \
  --json

unzip -l "$REVIEW_DIR.zip"
sha256sum "$REVIEW_DIR.zip"
```

Upload only `$REVIEW_DIR.zip` to ChatGPT or another reviewer. Suggested prompt:

```text
Review this History V3.3 approval ZIP. Do not invent facts. Check narration,
authority mode, trusted/research provenance, beats, maps/diagrams, 16:9 and
9:16 plans, timing, diagnostics, and gate states. Return blockers, factual
issues, visual issues, concrete corrections, and whether each gate is ready for
human approval. Cite exact filenames and fields.
```

Also inspect locally:

```bash
pnpm mediaforge -- history authoring status "$EPISODE" --json
pnpm mediaforge -- history factuality validate "$EPISODE" --json
sed -n '1,120p' "$REVIEW_DIR/approval.md"
```

For trusted-script packs, empty source/evidence arrays are expected. The review
must state that the pipeline did not independently verify the story.

## 5. Accept or reject

### Reject (regenerate planning)

```bash
pnpm mediaforge -- history visuals reject "$EPISODE" \
  --planner-version v3.3 \
  --reason "Maps invent routes not present in trusted narration" \
  --json

# Fix narration / claims / authority as needed, then replan:
pnpm mediaforge -- history authoring trust-script "$EPISODE" --json
pnpm mediaforge -- history visuals plan "$EPISODE" --json
pnpm mediaforge -- history visuals review-bundle "$EPISODE" \
  --planner-version v3.3 --output "$REVIEW_DIR" --regenerate --json
```

### Accept the production visual plan (required before images)

```bash
pnpm mediaforge -- history visuals approve "$EPISODE" \
  --plan-hash <V1_PLAN_HASH> \
  --json
```

Image generation refuses missing, rejected, stale, or mismatched approvals.

### Optional V3.3 editorial accept

```bash
pnpm mediaforge -- history visuals approve "$EPISODE" \
  --planner-version v3.3 \
  --plan-hash <V33_PLAN_HASH> \
  --json
```

V3.3 `APPROVED` requires the plan’s production gate to be `approved`. If
production is still blocked on measured timing, generate narration first, then
replan/validate before approving V3.3.

## 6. Produce (paid providers)

```bash
# Paid narration
pnpm mediaforge -- --tts-provider openai-compatible audio generate "$EPISODE"
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.audio-generation

# After audio exists, refresh planning/timing if V3.3 production was blocked
pnpm mediaforge -- history authoring regenerate-visuals "$EPISODE" --json
pnpm mediaforge -- history v3.3 validate "$EPISODE" --reuse-frozen-snapshot --json

# Paid images (requires APPROVED v1 visual plan)
pnpm mediaforge -- images generate --episode "$EPISODE"
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.image-generation

pnpm mediaforge -- workflow history run-next --episode "$EPISODE" --continue
pnpm mediaforge -- history workflow status "$EPISODE" --json
```

If a paid call is interrupted, rerun the same command or inspect workflow status
before retrying. Avoid broad `--force` on paid generation.

## 7. Render (local) and thumbnail (paid)

```bash
pnpm mediaforge -- render "$EPISODE" --profile youtube --no-captions
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.video-rendering

pnpm mediaforge -- thumbnails generate \
  --episode-slug "$EPISODE" --locale en --format full
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.thumbnail-rendering
```

Expected artifacts:

```text
episodes/$EPISODE/locales/en/full/audio/narration.wav
episodes/$EPISODE/shared/images/generated/
episodes/$EPISODE/locales/en/full/renders/youtube/youtube-16x9-clean.mp4
episodes/$EPISODE/locales/en/full/thumbnails/thumbnail.png
```

Optional vertical short:

```bash
pnpm mediaforge -- render "$EPISODE" --profile vertical --no-captions
```

## 8. YouTube metadata (paid)

```bash
pnpm mediaforge -- metadata youtube --episode "$EPISODE"
```

Review the generated title, description, chapters, tags, and pinned comment
under the episode metadata outputs before upload. Re-run with `--force` only
when you intentionally want a new metadata revision.

Publish validation checkpoint:

```bash
pnpm mediaforge -- workflow history run --episode "$EPISODE" --task history.publish-validation
pnpm mediaforge -- history factuality validate "$EPISODE" --json
pnpm mediaforge -- history workflow status "$EPISODE" --json
```

## 9. Publish to YouTube

Review the MP4, thumbnail, metadata, factuality/status output, and approval
hashes first. First upload must be private.

```bash
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" \
  --variant full \
  --privacy-status private \
  --generate-metadata
```

After final human approval:

```bash
# Public now
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" \
  --variant full \
  --privacy-status public

# Or schedule
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" \
  --variant full \
  --privacy-status private \
  --publish-at 2026-08-20T15:00:00Z
```

Requires `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`,
and `YOUTUBE_CHANNEL_ID`. Optional: `--playlist-id`, `--thumbnail-path`,
`--video-path`, `--metadata-path`, `--notify-subscribers`.

## Recommended end-to-end sequence

```bash
# Offline authoring + review
pnpm mediaforge -- content-pack import "$PACK" --genre history --strict --collect-errors --json
pnpm mediaforge -- history authoring trust-script "$EPISODE" --json
pnpm mediaforge -- history visuals plan "$EPISODE" --json
pnpm mediaforge -- history visuals review-bundle "$EPISODE" \
  --planner-version v3.3 --output "$REVIEW_DIR" --json
# human / ChatGPT review of $REVIEW_DIR.zip
pnpm mediaforge -- history visuals approve "$EPISODE" --plan-hash <V1_PLAN_HASH> --json

# Paid produce + local render
pnpm mediaforge -- --tts-provider openai-compatible audio generate "$EPISODE"
pnpm mediaforge -- images generate --episode "$EPISODE"
pnpm mediaforge -- render "$EPISODE" --profile youtube --no-captions
pnpm mediaforge -- thumbnails generate --episode-slug "$EPISODE" --locale en --format full
pnpm mediaforge -- metadata youtube --episode "$EPISODE"

# Publish privately first
pnpm mediaforge -- youtube upload \
  --episode "$EPISODE" --variant full --privacy-status private --generate-metadata
```

## Troubleshooting

- `promote-to-research-backed`: live research against a trusted-script episode
  was attempted without the explicit promote flag.
- Visual approval / image generation blocked: approve the **current** v1
  `planHash` from `history visuals plan`; regenerating the plan invalidates the
  previous approval.
- V3.3 approve blocked on production: generate measured narration audio, then
  regenerate/validate the V3.3 plan.
- Trusted review looks “empty” on sources: expected; claims should be
  `trusted_input`, not `supported`.
- Upload auth errors: rerun `pnpm youtube:auth:english` and confirm channel ID /
  refresh token for the English channel.
- Cost surprises: keep `OPENAI_API_KEY` unset until paid media steps; use
  `history v3.3 cost-status` / `research-status` only for research-backed work.

## Related docs

- [History overview](history/overview.md)
- [History content-pack inventory](history/content-pack-inventory.md)
- [Trusted-script implementation audit](reports/codex-runs/2026-08-06-history-trusted-script-default.md)
