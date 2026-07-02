# Task 07: OpenAI TTS Request Builder

## Objective

Build per-chunk OpenAI speech request payloads with current text only in `input` and context only in `instructions`.

## Rationale

The Speech API has no separate non-spoken context channel; safe instruction construction is required.

## Current Relevant Files and Symbols

- `packages/speech/src/index.ts`: `OpenAiCompatibleSpeechProvider`, `SpeechSynthesisRequest`.
- `apps/cli/src/index.ts`: `buildSpeechRequestPayload`, `writeAudioPromptLogs`.
- `packages/speech/src/audio-instructions.ts`: instruction fingerprints.

## Exact Files Likely Modified or Created

- `packages/speech/src/openai-tts-request.ts`
- `packages/speech/src/openai-tts-request.unit.test.ts`
- `packages/speech/src/index.ts`
- Potentially extend `packages/speech/src/index.ts` request types.

## Dependencies

Tasks 05 and 06.

## Implementation Steps

- Add request builder that composes base voice settings, direction, contexts, pronunciation hints, and constraints.
- Enforce input and instruction character budgets.
- Hash all material request inputs.
- Produce prompt log records without secrets.
- Extend provider request if needed to pass chunk-specific instruction and fingerprint metadata.

## Types or Interfaces

`OpenAiTtsChunkRequest`, `OpenAiTtsRequestBuildResult`, `NarrationTtsFingerprintInput`.

## Runtime Validation Requirements

Reject empty TTS input and unsupported output formats; trim context to instruction budget.

## Error-Handling Behavior

Return structured build errors before any API call.

## Observability Requirements

Log chunk ID, model, voice, input chars, instruction chars, request fingerprint.

## Performance Considerations

No API call in builder; cache string assembly outputs by chunk fingerprint if useful.

## Security Considerations

Never log API keys or authorization headers.

## Test Requirements

`pnpm test:focused -- packages/speech/src/openai-tts-request.unit.test.ts`

## Acceptance Criteria

Tests prove previous/next context never appears in `input`.

## Explicit Non-Goals

No cache or retry orchestration.

## Rollback Considerations

Fall back to existing `SpeechSynthesisRequest.instructions`.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Task 09 after Tasks 05 and 06.
