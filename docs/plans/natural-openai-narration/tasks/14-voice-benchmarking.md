# Task 14: Voice Benchmarking

## Objective

Add an OpenAI-only voice benchmark command with randomized or anonymous outputs and persisted evaluator scores.

## Rationale

The repo should choose a less generic default voice through controlled comparison, not hard-coded assumptions.

## Current Relevant Files and Symbols

- `packages/speech/src/voice-settings.ts`: default voice and presets.
- `apps/cli/src/index.ts`: audio command registration.
- `packages/speech/src/index.ts`: OpenAI TTS provider.

## Exact Files Likely Modified or Created

- `packages/speech/src/voice-benchmark.ts`
- `packages/speech/src/voice-benchmark.unit.test.ts`
- `apps/cli/src/index.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 07 and 09.

## Implementation Steps

- Define standard benchmark passage.
- Generate outputs for configured voices with same model/instructions/speed/language.
- Randomize labels by default.
- Persist metadata, output paths, source hash, duration, and score template.
- Add inspect/update-score support if practical.

## Types or Interfaces

`VoiceBenchmarkRun`, `VoiceBenchmarkSample`, `VoiceEvaluationScore`.

## Runtime Validation Requirements

Validate voice list, max sample count, output format, and benchmark source hash.

## Error-Handling Behavior

One failed voice records a failed sample and does not block other voices.

## Observability Requirements

Log voice alias, model, duration, cache hit/miss, and failure classification.

## Performance Considerations

Limit benchmark voice count by default; cache by passage/model/voice/instructions.

## Security Considerations

Do not log API keys; anonymous labels should be reversible only in metadata.

## Test Requirements

`pnpm test:focused -- packages/speech/src/voice-benchmark.unit.test.ts`

## Acceptance Criteria

Benchmark artifacts allow global, per-language, per-channel, per-variant voice decisions without rotating within a story.

## Explicit Non-Goals

No external voice providers or voice cloning.

## Rollback Considerations

Delete benchmark artifacts; keep configured default voice.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 15 and 17 after dependencies.
