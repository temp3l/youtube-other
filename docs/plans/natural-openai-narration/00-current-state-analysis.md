# Current State Analysis

## Scope

This analysis covers the current OpenAI TTS narration paths, related CLI orchestration, schemas, configuration, artifact paths, audio tools, retry behavior, batch behavior, and validation surfaces.

## Primary Entry Points

- `apps/cli/src/index.ts`
  - `audio generate <episode-id>` calls `commandAudioGenerate`.
  - `audio generate-localized <episode-id>` calls `commandAudioGenerateLocalized`, then loops languages and calls `commandAudioGenerate` with `scriptLanguage`.
  - Global options include `--tts-provider`, `--openai-speech-model`, `--openai-speech-voice`, `--speech-voice-preset`, and `--language`.
- `packages/pipeline/src/index.ts`
  - `MediaForgePipeline.synthesizeSceneAudio` is used by the older `run` stage flow.
  - It caches per-scene audio with sidecar manifests, then `concatenateAudio` assembles scene audio.
- `packages/dark-truth/src/index.ts`
  - `buildSpeechPlan`, `generateNarrationAudio`, and `generateMockNarrationAudio` form a separate production-pack narration path.
  - `generateNarrationAudio` requires `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true`, but delegates to `generateMockNarrationAudio`, which creates the configured speech provider and can call OpenAI.

## OpenAI Speech Calls

The canonical speech provider is `OpenAiCompatibleSpeechProvider` in `packages/speech/src/index.ts`.

- SDK-style call: `this.client.audio.speech.create(speechOptions, { signal })`.
- Curl fallback: `POST /v1/audio/speech` through `runCurl`.
- Request body currently includes:
  - `input: request.text`
  - `model`
  - `voice`
  - `instructions`
  - `response_format`
  - optional `speed`
- There is no SSML usage.
- There is no separate provider abstraction for non-OpenAI TTS in the production OpenAI path.

Current OpenAI API constraints to preserve in implementation:

- `/audio/speech` generates audio from `input`.
- `input` has a 4096 character maximum.
- `instructions` has a 4096 character maximum and does not work with `tts-1` or `tts-1-hd`.
- Built-in voices include `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`, `verse`, `marin`, and `cedar`.
- Supported output formats are `mp3`, `opus`, `aac`, `flac`, `wav`, and `pcm`.
- `speed` ranges from `0.25` to `4.0`.

## Current Chunking

There are three active chunking strategies:

- `packages/speech/src/script-markdown.ts`
  - `splitEpisodeScriptMarkdown` strips Markdown, splits by blank-line blocks, then splits oversized blocks by sentence or whitespace.
  - `maxSpeechChunkCharacters` is `3200`.
  - This is paragraph/character-based, not beat-aware.
- `apps/cli/src/index.ts`
  - English full narration prefers `manifest.scenePlan.scenes[].canonicalNarration`.
  - It falls back to `manifest.rewrittenScript.sections`, then localized script chunks.
  - Localized narration uses `splitEpisodeScriptMarkdown`, then `balanceScriptChunksForScenes`.
  - `balanceScriptChunksForScenes` may rebalance into the scene count by merging or splitting sentences.
- `packages/dark-truth/src/index.ts`
  - `SpeechPlan.segments` already include `pace`, `intensity`, `pauseBeforeMs`, and `pauseAfterMs`.
  - Audio generation uses those segments directly, but does not send rich per-segment delivery instructions to TTS.

## Current Voice and Tempo Configuration

- `packages/speech/src/voice-settings.ts`
  - Loads language/type-specific instruction files from `config/voices/dark-truth-documentary/<language>-v1.txt` or `<language>-short-v1.txt`.
  - Falls back to `docs/voice-settings.md`, then hard-coded presets.
  - Presets: `slow`, `fast`, `very-fast`.
  - Default model: `gpt-4o-mini-tts`.
  - Default voice: `onyx`.
  - `very-fast` default speed is `1.5`; other presets usually omit `speed`.
- `apps/cli/src/index.ts`
  - `resolveNarrationTempoSettings` derives language-specific WPM and speed from `getLanguageProfile`.
  - OpenAI model resolves from `openAiSpeechModel`, then `openAiCompatibleModel`, then `gpt-4o-mini-tts`.
  - Voice resolves from `openAiSpeechVoice`, then `openAiCompatibleTtsVoice`, then `onyx`.
- `packages/config/src/index.ts`
  - Env/config keys include `MEDIAFORGE_OPENAI_SPEECH_MODEL`, `OPENAI_SPEECH_MODEL`, `MEDIAFORGE_OPENAI_SPEECH_VOICE`, `OPENAI_SPEECH_VOICE`, `MEDIAFORGE_SPEECH_VOICE_PRESET`, and `MEDIAFORGE_SCRIPT_LANGUAGE`.

## Current Artifacts

`apps/cli/src/index.ts` writes localized audio under the episode locale/variant root from `createEpisodePathResolver`:

- `audio/audio-instructions.json`
- `audio/tts-generation.json`
- `audio/generation-report.json`
- `audio/prompts/index.json`
- `audio/prompts/chunk-NNN.json`
- `audio/segments/segment-NNN.wav`
- `audio/segments.txt`
- `audio/narration.wav`
- `audio/script-source-<language>.md`

`packages/dark-truth/src/index.ts` writes:

- `speech-plan.json`
- `pronunciation-guide.json`
- `audio/segments-speech/<segment-id>.wav`
- `audio/segments.txt`
- `audio/narration.wav`
- `audio/narration-manifest.json`

## Current Validation

- `packages/speech/src/index.ts`
  - Parses WAV RIFF metadata.
  - Validates sample rate, channels, 16-bit PCM, non-zero duration, expected duration range, peak/RMS quietness, noise-like zero-crossing rate, entropy, and clipping ratio.
  - Validation is hard-fail, not warning/error/info classified.
- `apps/cli/src/index.ts`
  - Uses `ffprobe` only for duration inspection in other audio workflows.
  - Does not validate each generated localized chunk beyond provider-level WAV validation.
- `packages/rendering/src/index.ts`
  - Contains FFmpeg-based rendering and output validation, but not narration-specific chunk quality gates.

## Current Assembly and Mastering

- `apps/cli/src/index.ts`
  - Writes `segments.txt`.
  - Runs `ffmpeg -f concat -safe 0 -i segments.txt -c copy narration.wav`.
  - No trimming, pause insertion, crossfade, loudness normalization, or final narration mastering.
- `packages/dark-truth/src/index.ts`
  - Uses the same FFmpeg concat pattern with `-c copy`.
- `packages/pipeline/src/index.ts`
  - Concatenates scene audio in the older pipeline path.

## Retry, Timeout, Concurrency, and Batch

- `OpenAiCompatibleSpeechProvider`
  - Retries by moving through configured fallback models only.
  - `isRetryableSpeechError` classifies quota, capacity, rate limit, temporary availability, and quality validation messages.
  - It does not implement exponential backoff or per-model attempt retry.
  - It accepts `AbortSignal`, but the CLI uses a fresh `AbortController` without timeout.
- `commandAudioGenerate`
  - Reads concurrency from `TTS_CONCURRENCY` or `OPENAI_TTS_CONCURRENCY`, default `3`.
  - If parallel generation fails, it deletes generated artifacts and retries all chunks serially.
  - A failed chunk can cause completed chunks to be removed.
- `commandAudioGenerateLocalized`
  - Processes selected languages sequentially.
  - A failed language throws and stops later languages.
- There is no OpenAI Batch API usage for TTS. Batch conventions exist for story localization and image generation, not audio speech.

## Weaknesses

- Narration preparation is broad and documentary-like, not optimized for horror performance.
- Current chunking is scene/paragraph/character-oriented, not narrative-beat-oriented.
- TTS instructions are mostly global, causing repetitive cadence and emotional sameness.
- Context is not provided to chunk synthesis.
- Existing localized audio generation is destructive and not chunk-resumable.
- Chunk validation is embedded in the provider and lacks structured reports.
- Assembly is raw concat, so pauses, loudness, timbre discontinuities, and boundary artifacts are unmanaged.
- No voice evaluation command exists.
- `dark-truth` has useful speech-plan ideas but is duplicated from the CLI/pipeline speech flow.

## Reusable Strengths

- `@mediaforge/speech` already owns the OpenAI TTS provider and voice settings.
- Zod is already the repository runtime schema convention.
- `writeJsonAtomic`, `writeTextAtomic`, `hashText`, `hashFile`, and `createEpisodePathResolver` provide artifact and fingerprint primitives.
- Existing language profiles provide WPM and localization guidance for `en`, `de`, `es`, `fr`, and `pt`.
- `SpeechPlan` in `dark-truth` shows a compatible direction model that can be migrated rather than discarded.
