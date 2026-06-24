# Dark Truth Multilingual Production

This repository contains a Dark Truth workflow for multilingual full episodes and Shorts.
The current implementation is local-first and mock-safe: it parses the episode source files, writes manifests and sidecar subtitles, and uses local FFmpeg/mock media generation during the initial implementation.
An explicit opt-in flag, `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true`, enables the paid OpenAI-backed speech and image branches when credentials are present.
No burned-in subtitles are produced by default.

## Prerequisites

- Node.js 22+
- FFmpeg
- ffprobe
- TypeScript toolchain from the workspace
- pnpm workspace dependencies already installed
- Optional: OpenAI credentials for future provider wiring

Verify the binaries:

```bash
ffmpeg -version
ffprobe -version
```

## Environment

Required roots:

```dotenv
EPISODES_SOURCE_ROOT=content-ideas/content/dark-truth-episodes-multilingual-production-pack
EPISODES_OUTPUT_ROOT=./episodes
```

Recommended defaults:

```dotenv
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=
OPENAI_TTS_MODEL=
OPENAI_TTS_VOICE_EN=
OPENAI_TTS_VOICE_DE=
OPENAI_TTS_VOICE_ES=
OPENAI_TTS_VOICE_FR=
OPENAI_TTS_FORMAT=wav
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_IMAGE_MODEL=
OPENAI_REQUEST_TIMEOUT_MS=180000
OPENAI_MAX_RETRIES=3
DARK_TRUTH_ENABLE_PAID_PROVIDERS=false
TTS_CONCURRENCY=1
IMAGE_CONCURRENCY=1
SUBTITLE_FORMATS=srt,vtt
BURNED_IN_SUBTITLES=false
ENABLE_TRANSCRIPTION_QA=true
QA_SIMILARITY_THRESHOLD=0.98
FULL_VIDEO_WIDTH=1920
FULL_VIDEO_HEIGHT=1080
SHORT_VIDEO_WIDTH=1080
SHORT_VIDEO_HEIGHT=1920
```

`BURNED_IN_SUBTITLES` must stay `false`. Setting it to `true` is rejected.
`DARK_TRUTH_ENABLE_PAID_PROVIDERS` must remain `false` during initial implementation and dry-run work. Set it to `true` only when you intentionally want the paid OpenAI branches and have valid credentials configured.

## Source Conventions

Source files live under:

`content-ideas/content/dark-truth-episodes-multilingual-production-pack/`

Episode directories follow:

`NNN-kebab-slug/<language>/<episode-slug>-<language>-full.md`

`NNN-kebab-slug/<language>/<episode-slug>-<language>-short.md`

Supported canonical languages:

- `en`
- `de`
- `es`
- `fr`

Episode 001 uses:

`content-ideas/content/dark-truth-episodes-multilingual-production-pack/001-the-forbidden-village-where-japan-s-laws-do-not-apply/`

The workflow treats English full as canonical for visuals.

## Supported Markdown Markers

Full episode markers:

- English narration: `Narration Script`
- German narration: `Sprechtext`
- Spanish narration: `Guion de narración`
- French narration: `Texte de narration`
- English audio instructions: `Audio Generation Instructions`
- German audio instructions: `Anweisungen zur Audiogenerierung`
- Spanish audio instructions: `Instrucciones para generar el audio`
- French audio instructions: `Instructions de génération audio`
- English metadata: `Episode Metadata`
- German metadata: `Episoden-Metadaten`
- Spanish metadata: `Metadatos del episodio`
- French metadata: `Métadonnées de l’épisode`

Short episode markers follow the same language-specific conventions.

## Output Structure

All generated output is written under:

`./episodes/<episode-id>/`

For episode 001 the slug remains:

`episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/`

Important paths:

```text
episodes/<episode-id>/shared/images/
episodes/<episode-id>/shared/image-manifest.json
episodes/<episode-id>/shared/visual-plan.json
episodes/<episode-id>/en/full/
episodes/<episode-id>/de/full/
episodes/<episode-id>/es/full/
episodes/<episode-id>/fr/full/
episodes/<episode-id>/shorts/de/
episodes/<episode-id>/shorts/es/
episodes/<episode-id>/shorts/fr/
episodes/<episode-id>/manifests/
episodes/<episode-id>/reviews/
```

Each language/artifact folder contains:

- `analysis.json`
- `narration.txt`
- `metadata.json`
- `production-instructions.json`
- `speech-plan.json`
- `pronunciation-guide.json`
- `sound-cues.json`
- `scenes.json`
- `subtitles/narration.<lang>.srt` or `subtitles/short.<lang>.srt`
- `subtitles/narration.<lang>.vtt` or `subtitles/short.<lang>.vtt`
- `generation-manifest.json`
- `qa-report.json`

## Subtitle Policy

Subtitles are sidecar files only.

Generated subtitle paths include:

```text
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/en/full/subtitles/narration.en.srt
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/en/full/subtitles/narration.en.vtt
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/de/full/subtitles/narration.de.srt
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/es/full/subtitles/narration.es.srt
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/fr/full/subtitles/narration.fr.srt
episodes/001-the-forbidden-village-where-japan-s-laws-do-not-apply/shorts/de/subtitles/short.de.srt
```

The MP4 files do not contain burned-in subtitles.

Do not use FFmpeg subtitle filters, drawtext captions, canvas text overlays, or SVG subtitle rendering for this workflow.

## Review and Approval

Each review package lives at:

```text
episodes/<episode-id>/reviews/<language>/<artifact>/
```

Each package stores:

- `review-package.json`
- `checklist.md`
- `approval.json`
- `regeneration-instructions.json`

Human approval becomes stale if the approved generation manifest changes.

## Command Reference

All commands are exposed as npm scripts that call the CLI:

```bash
npm run episode:inspect -- --episode 001
npm run episode:dry-run -- --episode 001 --language en
npm run episode:analyze -- --episode 001 --language en
npm run episode:plan -- --episode 001 --language en
npm run episode:english -- --episode 001
npm run episode:localized -- --episode 001 --languages de,es,fr --reuse-images
npm run episode:short -- --episode 001 --language de --reuse-images
npm run episode:status -- --episode 001
npm run episode:validate -- --episode 001 --language en
npm run episode:review:prepare -- --episode 001 --language en --artifact full
npm run episode:review:approve -- --episode 001 --language en --artifact full --reviewer "steph"
npm run episode:review:reject -- --episode 001 --language en --artifact full --reviewer "steph" --reason "Narrator pronunciation needs correction"
npm run episode:review:status -- --episode 001 --language en --artifact full
```

### `episode:inspect`

- Purpose: discover source files and classify them by language and artifact type.
- Syntax: `npm run episode:inspect -- --episode <number-or-slug>`
- Prerequisites: source tree available.
- Required options: none.
- Optional options: `--episode`, `--source`, `--output-root`, `--json`.
- Default values: source root from `EPISODES_SOURCE_ROOT`, output root `./episodes`.
- Paid API behavior: none.
- Generated artifacts: JSON discovery summary only.
- Common errors: missing source root, malformed episode directory, duplicate source files.
- Example: `npm run episode:inspect -- --episode 001`

### `episode:dry-run`

- Purpose: parse one episode/language/artifact and write analysis, narration, metadata, speech plan, subtitles, and manifests without media generation.
- Syntax: `npm run episode:dry-run -- --episode <number-or-slug> --language <en|de|es|fr>`
- Prerequisites: episode source file present.
- Required options: `--language` for non-default cases.
- Optional options: `--episode`, `--source`, `--artifact`, `--output-root`, `--json`.
- Default values: language `en`, artifact `full`.
- Paid API behavior: local/mock by default; when `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true` and `OPENAI_API_KEY` is set, the workflow can use the paid speech/image branches.
- Generated artifacts: `analysis.json`, `narration.txt`, `metadata.json`, `production-instructions.json`, `speech-plan.json`, `sound-cues.json`, `subtitles/*`, `generation-manifest.json`, `qa-report.json`.
- Common errors: missing source, unsupported language, empty narration.
- Example: `npm run episode:dry-run -- --episode 001 --language en`

### `episode:analyze`

- Purpose: alias for dry-run analysis output.
- Syntax: `npm run episode:analyze -- --episode <number-or-slug> --language <en|de|es|fr>`
- Prerequisites: source file present.
- Required options: none beyond episode selection.
- Optional options: same as dry-run.
- Default values: same as dry-run.
- Paid API behavior: none.
- Generated artifacts: same as dry-run.
- Common errors: same as dry-run.
- Example: `npm run episode:analyze -- --episode 001 --language en`

### `episode:plan`

- Purpose: alias for dry-run planning output.
- Syntax: `npm run episode:plan -- --episode <number-or-slug> --language <en|de|es|fr>`
- Prerequisites: source file present.
- Required options: none beyond episode selection.
- Optional options: same as dry-run.
- Default values: same as dry-run.
- Paid API behavior: none.
- Generated artifacts: same as dry-run.
- Common errors: same as dry-run.
- Example: `npm run episode:plan -- --episode 001 --language en`

### `episode:english`

- Purpose: generate the canonical English full workflow.
- Syntax: `npm run episode:english -- --episode <number-or-slug>`
- Prerequisites: English full source file present.
- Required options: none.
- Optional options: `--episode`, `--source`, `--output-root`, `--dry-run`.
- Default values: canonical language `en`, artifact `full`.
- Paid API behavior: local/mock by default; when `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true` and `OPENAI_API_KEY` is set, the workflow can use the paid speech/image branches.
- Generated artifacts: canonical English scene plan, review package, manifests, local mock media when `--dry-run` is not set.
- Common errors: missing English source, malformed narration section.
- Example: `npm run episode:english -- --episode 001`

### `episode:localized`

- Purpose: generate localized full episodes for German, Spanish, and French after English approval.
- Syntax: `npm run episode:localized -- --episode <number-or-slug> --languages de,es,fr --reuse-images`
- Prerequisites: approved English full generation manifest and current English hash.
- Required options: `--reuse-images` must remain enabled.
- Optional options: `--episode`, `--source`, `--languages`, `--output-root`, `--dry-run`.
- Default values: languages `de,es,fr`.
- Paid API behavior: local/mock by default; when `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true` and `OPENAI_API_KEY` is set, the workflow can use the paid speech/image branches.
- Generated artifacts: localized scene mappings, review packages, subtitles, manifests, mock media when not in dry-run.
- Common errors: missing English approval, stale English approval, unsupported language code, `--reuse-images=false`.
- Example: `npm run episode:localized -- --episode 001 --languages de,es,fr --reuse-images`

### `episode:short`

- Purpose: generate a localized Short artifact.
- Syntax: `npm run episode:short -- --episode <number-or-slug> --language <de|es|fr|en>`
- Prerequisites: German short additionally requires German full approval.
- Required options: `--language`.
- Optional options: `--episode`, `--source`, `--output-root`, `--reuse-images`, `--dry-run`.
- Default values: language `de`.
- Paid API behavior: none in the current implementation.
- Generated artifacts: Short scene plan, Short subtitles, Short review package, mock media when not in dry-run.
- Common errors: unsupported language code, missing German approval, `--reuse-images=false`.
- Example: `npm run episode:short -- --episode 001 --language de --reuse-images`

### `episode:status`

- Purpose: summarize approval state and detect stale approvals.
- Syntax: `npm run episode:status -- --episode <number-or-slug>`
- Prerequisites: source tree available.
- Required options: none.
- Optional options: `--episode`, `--source`, `--output-root`.
- Default values: source root and output root defaults.
- Paid API behavior: none.
- Generated artifacts: status JSON only.
- Common errors: missing source, missing approval files.
- Example: `npm run episode:status -- --episode 001`

### `episode:validate`

- Purpose: validate the episode workflow without running paid providers.
- Syntax: `npm run episode:validate -- --episode <number-or-slug> --language <en|de|es|fr>`
- Prerequisites: source file present.
- Required options: none beyond episode selection.
- Optional options: same as dry-run.
- Default values: language `en`, artifact `full`.
- Paid API behavior: none.
- Generated artifacts: same as dry-run.
- Common errors: same as dry-run.
- Example: `npm run episode:validate -- --episode 001 --language en`

### `episode:review:prepare`

- Purpose: generate the review package scaffold.
- Syntax: `npm run episode:review:prepare -- --episode <number-or-slug> --language <en|de|es|fr> --artifact <full|short>`
- Prerequisites: source file present.
- Required options: `--language`, `--artifact`.
- Optional options: `--episode`, `--source`, `--output-root`, `--dry-run`.
- Default values: language `en`, artifact `full`.
- Paid API behavior: none.
- Generated artifacts: review checklist, regeneration instructions, package metadata.
- Common errors: missing source, invalid artifact type.
- Example: `npm run episode:review:prepare -- --episode 001 --language en --artifact full`

### `episode:review:approve`

- Purpose: persist a human approval record for the current artifact hash.
- Syntax: `npm run episode:review:approve -- --episode <number-or-slug> --language <en|de|es|fr> --artifact <full|short> --reviewer <name>`
- Prerequisites: current generation manifest must exist.
- Required options: `--reviewer`.
- Optional options: `--episode`, `--source`, `--output-root`, `--artifact`, `--notes`.
- Default values: reviewer `reviewer`, language `en`, artifact `full`.
- Paid API behavior: none.
- Generated artifacts: `approval.json`.
- Common errors: missing generation manifest, stale approval target, malformed review record.
- Example: `npm run episode:review:approve -- --episode 001 --language en --artifact full --reviewer "steph"`

### `episode:review:reject`

- Purpose: persist a human rejection record for the current artifact hash.
- Syntax: `npm run episode:review:reject -- --episode <number-or-slug> --language <en|de|es|fr> --artifact <full|short> --reviewer <name> --reason <text>`
- Prerequisites: current generation manifest must exist.
- Required options: `--reviewer`, `--reason`.
- Optional options: `--episode`, `--source`, `--output-root`, `--artifact`, `--notes`.
- Default values: reviewer `reviewer`, language `en`, artifact `full`.
- Paid API behavior: none.
- Generated artifacts: `approval.json`.
- Common errors: missing generation manifest, missing rejection reason.
- Example: `npm run episode:review:reject -- --episode 001 --language en --artifact full --reviewer "steph" --reason "Narrator pronunciation needs correction"`

### `episode:review:status`

- Purpose: inspect the current review record and stale state.
- Syntax: `npm run episode:review:status -- --episode <number-or-slug> --language <en|de|es|fr> --artifact <full|short>`
- Prerequisites: review directory present.
- Required options: none beyond episode selection.
- Optional options: `--episode`, `--source`, `--output-root`, `--language`, `--artifact`.
- Default values: language `en`, artifact `full`.
- Paid API behavior: none.
- Generated artifacts: JSON status output only.
- Common errors: missing approval record, stale approval.
- Example: `npm run episode:review:status -- --episode 001 --language en --artifact full`

## Approval Rules

- English full must be approved before localized full videos can be prepared.
- German full must be approved before German Short generation.
- Approval becomes stale when the approved generation manifest changes.
- Command success does not imply human approval.

## How to Upload Subtitles

Upload the generated `.srt` and `.vtt` files separately in YouTube Studio as subtitle sidecars.
Do not mux subtitles into the default MP4 workflow.

## How Caching Works

- Source hash changes invalidate analysis and downstream artifacts.
- Narration changes invalidate speech and subtitle outputs.
- Subtitle-only changes do not require video regeneration because subtitles are sidecars.
- Approved artifacts become stale when the generation manifest hash changes.

## Worked Example: Episode 001

```bash
npm run episode:inspect -- --episode 001

npm run episode:dry-run -- --episode 001 --language en

npm run episode:english -- --episode 001

npm run episode:review:prepare -- \
  --episode 001 \
  --language en \
  --artifact full

npm run episode:review:approve -- \
  --episode 001 \
  --language en \
  --artifact full \
  --reviewer "steph"

npm run episode:localized -- \
  --episode 001 \
  --languages de,es,fr \
  --reuse-images

npm run episode:review:prepare -- \
  --episode 001 \
  --language de \
  --artifact full

npm run episode:review:approve -- \
  --episode 001 \
  --language de \
  --artifact full \
  --reviewer "steph"

npm run episode:short -- \
  --episode 001 \
  --language de \
  --reuse-images

npm run episode:review:prepare -- \
  --episode 001 \
  --language de \
  --artifact short

npm run episode:review:reject -- \
  --episode 001 \
  --language en \
  --artifact full \
  --reviewer "steph" \
  --reason "Narrator pronunciation needs correction"
```

## Troubleshooting

- If discovery reports `duplicate`, stop and resolve the source tree before generating output.
- If approval is stale, regenerate the affected artifact and re-approve.
- If a localized run fails because English approval is missing, approve the English full artifact first.
- If `--reuse-images=false` is passed to localized or Short commands, the command rejects the request.
- If `BURNED_IN_SUBTITLES=true` is set, configuration validation should fail before rendering.
