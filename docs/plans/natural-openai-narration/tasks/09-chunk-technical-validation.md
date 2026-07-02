# Task 09: Chunk Technical Validation

## Objective

Add persisted chunk-level audio validation reports with error, warning, and info findings.

## Rationale

Provider validation is useful but too coarse and not auditable per chunk.

## Current Relevant Files and Symbols

- `packages/speech/src/index.ts`: `parseWavMetadata`, `analyzeWavQuality`, `validateSpeechAudioPayload`.
- `apps/cli/src/index.ts`: `inspectAudioDurationSeconds`.
- `packages/process-runner/src/index.ts`: `runCommand`, `runCommandJson`.

## Exact Files Likely Modified or Created

- `packages/speech/src/audio-validation.ts`
- `packages/speech/src/audio-validation.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 02.

## Implementation Steps

- Wrap FFprobe metadata extraction.
- Reuse or extract WAV analysis helpers.
- Add language-aware WPM duration checks.
- Classify findings.
- Persist validation reports next to chunks.

## Types or Interfaces

`AudioValidationFinding`, `AudioValidationMetrics`, `ChunkValidationReport`.

## Runtime Validation Requirements

Validate files exist, decode, and meet configured hard bounds.

## Error-Handling Behavior

Malformed or missing files produce failed reports rather than uncaught low-level errors where possible.

## Observability Requirements

Log chunk ID, validation status, duration, warning/error counts.

## Performance Considerations

Run FFprobe once per chunk; avoid full waveform scans unless needed.

## Security Considerations

Validate paths are within expected artifact root before probing.

## Test Requirements

`pnpm test:focused -- packages/speech/src/audio-validation.unit.test.ts`

## Acceptance Criteria

Validation produces structured reports and does not reject useful audio for minor duration drift.

## Explicit Non-Goals

No assembly.

## Rollback Considerations

Use provider-level validation only.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 04, 05, 06, 07, and 08 after Task 02.
