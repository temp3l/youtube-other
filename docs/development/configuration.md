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
- Whisper and transcription:
  `MEDIAFORGE_WHISPER_*`, `WHISPER_WORD_TIMESTAMPS`, and transcript segmentation settings such as `TRANSCRIPT_MIN_SEGMENT_SECONDS`
- Speech voices:
  `MEDIAFORGE_OPENAI_SPEECH_MODEL`, `MEDIAFORGE_OPENAI_SPEECH_VOICE`, `MEDIAFORGE_SPEECH_VOICE_PRESET`, `MEDIAFORGE_SCRIPT_LANGUAGE`
- YouTube credentials and per-language channels:
  `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, language-specific refresh-token and channel-id variants for German, Spanish, and French
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
  - story: `gpt-5.5`
  - localization: `gpt-5.5`
  - short rewrite: `gpt-5.5`
  - validator: `gpt-5.4-mini`
  - metadata: `gpt-5.4-mini`
- Metadata defaults worth noting:
  - max retries: `3`
  - timeout: `120000`
  - keep uploaded source file: `false`

## Episode-Level Config

- `loadEpisodeConfig()` reads `<episode-dir>/episode.config.json`.
- Because episode config uses the runtime schema as a partial, it can override many provider, model, and render settings for one episode.
- Do not use it for root runtime concerns such as relocating the workspace or primary database.
