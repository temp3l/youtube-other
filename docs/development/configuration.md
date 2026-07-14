# Configuration

## Sources

Configuration ownership lives in `@mediaforge/config`.

- `.env`
- Process environment
- Episode-level `episode.config.json`
- CLI and runtime overrides passed into config loaders

## Precedence

- CLI and runtime overrides are highest.
- Episode config overrides environment values for episode-scoped settings.
- Environment values and defaults fill the rest.
- `workspaceDir` and `dbPath` are runtime-level settings. They are not episode-scoped.

## Environment Groups By Owner

- Provider selection and OpenAI-compatible transport:
  `MEDIAFORGE_TTS_PROVIDER`, `MEDIAFORGE_TRANSCRIPTION_PROVIDER`, `MEDIAFORGE_TEXT_PROVIDER`, `MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL`, `MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY`, and related organization or project fields
- Story, localization, validator, and metadata models:
  `MEDIAFORGE_OPENAI_STORY_*`, `MEDIAFORGE_OPENAI_LOCALIZATION_*`, `MEDIAFORGE_OPENAI_SHORT_*`, `MEDIAFORGE_OPENAI_VALIDATOR_*`, `MEDIAFORGE_OPENAI_METADATA_*`, plus legacy `OPENAI_*` aliases supported in code
- Two-phase image models:
  `MEDIAFORGE_OPENAI_IMAGE_REFERENCE_*`, `MEDIAFORGE_OPENAI_IMAGE_SCENE_*`, `MEDIAFORGE_OPENAI_IMAGE_SHORT_*`, and `MEDIAFORGE_OPENAI_IMAGE_VALIDATOR_*`
- Whisper and transcription:
  `MEDIAFORGE_WHISPER_*`, `WHISPER_WORD_TIMESTAMPS`, and transcript segmentation settings such as `TRANSCRIPT_MIN_SEGMENT_SECONDS`
- Speech voices:
  `MEDIAFORGE_OPENAI_SPEECH_MODEL`, `MEDIAFORGE_OPENAI_SPEECH_VOICE`, `MEDIAFORGE_SPEECH_VOICE_PRESET`, `MEDIAFORGE_SCRIPT_LANGUAGE`
- Educational mathematics speech (non-secret):
  `MEDIAFORGE_MATH_SPEECH_PROFILE=education-natural-teacher`,
  `MEDIAFORGE_MATH_SPEECH_RATE_WPM=150`, and `MEDIAFORGE_MATH_SPEECH_CANDIDATES=1`.
  Command-level `--speech-profile`, `--speech-rate`, and `--speech-candidates` values take priority.
  Global OpenAI model/voice settings remain authoritative unless the educational command supplies
  its local voice override.
- YouTube credentials and per-language channels:
  `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, language-specific refresh-token and channel-id variants for German, Spanish, French, and Portuguese
  - Local OAuth helpers:
    `pnpm youtube:auth:english` writes `YOUTUBE_REFRESH_TOKEN` and `YOUTUBE_CHANNEL_ID`
    `pnpm youtube:auth:german` writes `YOUTUBE_REFRESH_TOKEN_GERMAN` and `YOUTUBE_CHANNEL_ID_GERMAN`
    `pnpm youtube:auth:spanish` writes `YOUTUBE_REFRESH_TOKEN_SPANISH` and `YOUTUBE_CHANNEL_ID_SPANISH`
    `pnpm youtube:auth:french` writes `YOUTUBE_REFRESH_TOKEN_FRENCH` and `YOUTUBE_CHANNEL_ID_FRENCH`
    `pnpm youtube:auth:portuguese` writes `YOUTUBE_REFRESH_TOKEN_PORTUGUESE` and `YOUTUBE_CHANNEL_ID_PORTUGUESE`
    These helpers also open the Google OAuth URL in the default browser when the local environment supports it.
- Remote rendering:
  `REMOTE_RENDER_*` and `LOCAL_RENDER_CONCURRENCY`

## Secrets Versus Non-Secrets

- Secrets: API keys, OAuth client secrets, refresh tokens, SSH private keys
- Non-secrets: workspace and database paths, provider selection, model names, language defaults, render concurrency, timeout and retry settings

## Operational Defaults

- Workspace defaults to `./episodes`
- SQLite defaults to `./.mediaforge.sqlite`
- Remote rendering is disabled by default
- Remote render fallback to local is enabled by default
- Default models visible in code today:
  - story: `gpt-5.6-sol`
  - localization: `gpt-5.6-terra`
  - short rewrite: `gpt-5.6-terra`
  - validator: `gpt-5.4-mini`
  - metadata: `gpt-5.4-mini`
- Default reasoning and token caps:
  - story: `medium`, `14000`
  - localization: `low`, `10000`
  - short rewrite: `low`, `4000`
  - validator: `low`, `5000`
  - metadata: `none`, `1800`
- Image defaults:
  - reference: `gpt-image-2`, `high`, `1536x1024`
  - full scene: `gpt-image-2`, `high`, `1920x1080`
  - short scene: `gpt-image-2`, `high`, `1024x1536`
- Known model/reasoning combinations are validated at runtime. Invalid combinations fail configuration loading; models are never silently downgraded.
- Educational math defaults are profile `education-natural-teacher`, 150 WPM, one candidate, WAV
  provider output, and conservative 48 kHz mono assembly. These settings affect only `math speech`.
- Maximum output tokens are ceilings. A higher ceiling does not request or bill unused output tokens.

## Batch And Cache Operation

Story batches use the Responses API. Stable system contracts precede episode text;
eligible repeated prefixes receive privacy-preserving `prompt_cache_key` values.
A prompt-cache hit still calls the provider. A valid local content-addressed cache
hit avoids the provider call entirely.

Image production is two phase. Prepare, submit, download, and ingest reference
images first. Validate and approve them before preparing dependent scene batches.
Scene requests are grouped by model, operation, format, size/aspect, prompt family,
ordered reference bundle, and cache shard. Batch execution order is not a dependency
mechanism; manifests and readiness checks enforce dependencies before submission.

Safe inspection workflow:

```bash
pnpm mediaforge -- images batch prepare --episode 034-example --languages en,de --variants full --phase references --json
pnpm mediaforge -- images batch submit --episode 034-example --batch <reference-batch-id> --json
pnpm mediaforge -- images batch status --episode 034-example --batch <batch-id> --json
pnpm mediaforge -- images batch download --episode 034-example --batch <batch-id> --json
pnpm mediaforge -- images batch prepare --episode 034-example --languages en,de --variants full --phase scenes --revalidate --json
pnpm mediaforge -- images batch resume --episode 034-example --batch <batch-id> --json
pnpm mediaforge -- stories batch plan --episode 034 --languages de,es
pnpm mediaforge -- stories batch import --run <story-batch-id>
pnpm mediaforge -- stories batch retry-failed --run <story-batch-id>
```

Preparation writes inspectable JSONL and manifests without submitting paid work.
Partial successes are imported and retained; retry manifests contain unresolved
items only. `--force` bypasses local result reuse. Revalidation checks a cached
artifact against the current validator without blind regeneration. Malformed,
truncated, empty, or incomplete provider responses are failures and never replace
the last valid artifact.

Cache effectiveness must be measured from input, cached-input, output, and
reasoning usage. Grouping by an identical ordered reference bundle is the correct
scene strategy; merely submitting references before randomly grouped scenes does
not maximize reuse.
- CLI warning-only guardrails:
  - short max-output-tokens above `2000`
  - validator max-output-tokens above `3000`
  - localization model equal to story model
  - story max-output-tokens above `7000` when targeting below `2000` words
- Metadata defaults worth noting:
  - max retries: `3`
  - timeout: `120000`
  - keep uploaded source file: `false`

## Episode-Level Config

- `loadEpisodeConfig()` reads `<episode-dir>/episode.config.json`.
- Because episode config uses the runtime schema as a partial, it can override many provider, model, and render settings for one episode.
- Do not use it for root runtime concerns such as relocating the workspace or primary database.
