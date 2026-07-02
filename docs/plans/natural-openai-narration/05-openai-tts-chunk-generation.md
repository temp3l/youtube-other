# OpenAI TTS Chunk Generation

## Objective

Improve TTS request construction while keeping `OpenAiCompatibleSpeechProvider` as the only speech synthesis provider.

## Current Evidence

- `packages/speech/src/index.ts` supports SDK and curl paths for `/v1/audio/speech`.
- `SpeechSynthesisRequest` includes `text`, `voiceProfile`, `outputPath`, optional `targetDurationSeconds`, and optional `instructions`.
- `apps/cli/src/index.ts` currently passes only chunk text and identical instructions to every chunk.

## Request Construction

Only the current chunk is synthesized:

```ts
{
  input: transformedCurrentChunkText,
  model,
  voice,
  instructions: buildChunkInstructions({
    baseVoiceInstructions,
    language,
    locale,
    variant,
    role,
    direction,
    previousContextExcerpt,
    nextContextExcerpt,
    negativeConstraints,
    continuityGuidance,
  }),
  response_format,
  speed
}
```

Previous and next context must only appear in `instructions`, never in `input`. The instruction text must say that context is for performance continuity and must not be spoken. This is the safest available approach because the Speech API does not provide a separate non-spoken context channel.

## Instruction Budget

Respect the 4096 character instruction limit:

- base style: capped;
- chunk direction: capped;
- previous context: one sentence or configured max chars;
- next context: one sentence or configured max chars;
- pronunciation hints: capped;
- negative constraints: compact bullet-like prose.

If the budget is exceeded, trim context first, then delivery note, never the current chunk input.

## Fingerprint Inputs

Chunk fingerprints must include:

- spoken chunk text;
- pronunciation-transformed TTS text;
- model;
- voice;
- speed;
- language and locale;
- output format;
- instructions;
- direction;
- previous and next context excerpts;
- prompt/schema versions;
- response format;
- provider base URL identity without secrets.

## Retry and Timeout

Add retry policy around provider calls:

- classify retryable API/network/rate-limit/capacity/quality errors;
- exponential backoff with jitter;
- configurable max attempts;
- per-attempt timeout with `AbortController`;
- fallback model or fallback instruction profile only when configured and recorded.

## Configuration

Add narration config keys:

- `openAiSpeechModel`
- `openAiSpeechFallbackModels`
- `openAiSpeechVoice`
- `openAiSpeechVoiceByLanguage`
- `openAiSpeechVoiceByVariant`
- `openAiSpeechResponseFormat`
- `openAiSpeechSpeed`
- `openAiSpeechTimeoutMs`
- `openAiSpeechMaxRetries`
- `openAiSpeechConcurrency`
- `narrationProfile`
- `narrationPipelineMode`

Keep existing env names working.

## Cost Impact

Low. Context in instructions slightly increases TTS prompt size but chunk caching and selective regeneration should reduce repeated audio generation.
