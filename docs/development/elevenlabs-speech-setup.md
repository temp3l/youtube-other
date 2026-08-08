# ElevenLabs speech setup and secrets

ElevenLabs is **not** enabled by the presence of credentials alone. Select it
explicitly for legacy episode audio generation:

```text
MEDIAFORGE_TTS_PROVIDER=elevenlabs
```

The provider-neutral speech API uses a separate explicit gate:

```text
ELEVENLABS_FEATURE_ENABLED=false
```

## Required backend environment

```text
ELEVENLABS_API_KEY=<secret reference at deployment>
ELEVENLABS_REQUEST_TIMEOUT_MS=60000
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
HISTORY_CHANNEL_VOICE_ID=9Ft9sm9dzvprPILZmLJl
```

`ELEVENLABS_FEATURE_ENABLED` defaults off. `MEDIAFORGE_TTS_PROVIDER` defaults to
`openai-compatible` when an OpenAI key is present, otherwise `mock`. Setting only
`ELEVENLABS_API_KEY` changes nothing until ElevenLabs is explicitly selected.

Secrets belong in the deployment secret store (Azure Key Vault in Azure
deployments), injected as environment secrets; never place them in episode
config, profile JSON, CLI arguments, frontend configuration, logs, fixtures, or
reports. Diagnostics must report only `configured: true|false`, never the key
value. A custom base URL requires an explicit deployment hostname allowlist and
HTTPS origin validation.

## Per-genre ElevenLabs voice resolution

Voice selection is centralized in `@mediaforge/speech` (`resolveTtsConfig`). For
history episodes with `MEDIAFORGE_TTS_PROVIDER=elevenlabs`, precedence is:

1. explicit override: `MEDIAFORGE_TTS_VOICE_ID` or `--tts-voice-id`
2. `HISTORY_CHANNEL_VOICE_ID`
3. built-in history default `9Ft9sm9dzvprPILZmLJl`

History defaults do not apply to other genres. Future genres add defaults in
`GENRE_ELEVENLABS_DEFAULTS` and optional env mappings in
`GENRE_VOICE_ENVIRONMENT_VARIABLES` without changing the ElevenLabs provider
adapter.

Model selection uses `ELEVENLABS_MODEL_ID` (default `eleven_flash_v2_5`) and is
not coupled to genre policy.

## Provider-neutral API profiles

Import the example profile as DRAFT, replace the backend-managed voice ID and
consent reference, validate it, run listening tests, then activate the version.
Activation does not change any genre. Set the pilot genre policy separately
after approval.

Pricing records are versioned data. Configure provider and genre monthly
character hard limits. At 80% the API/UI warns; at 100% reservation fails before
provider dispatch. Actual usage reconciles the reservation. Cached generations
record zero new usage.

## Legacy CLI example

```bash
MEDIAFORGE_TTS_PROVIDER=elevenlabs \
ELEVENLABS_API_KEY=<secret> \
pnpm mediaforge -- audio generate <episode-id>
```

Completed runs record non-secret TTS metadata (`provider`, `voiceId`, `modelId`)
in `audio/tts-generation.json`.
