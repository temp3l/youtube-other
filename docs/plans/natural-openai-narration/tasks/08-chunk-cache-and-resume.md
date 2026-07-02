# Task 08: Chunk Cache and Resume

## Objective

Implement fingerprinted chunk-level cache, resume, partial completion, and atomic writes.

## Rationale

Current CLI cleanup deletes valid chunks and retries all work after failures.

## Current Relevant Files and Symbols

- `apps/cli/src/index.ts`: `cleanupAudioGenerationArtifacts`, `synthesizeSpeechChunks`.
- `packages/pipeline/src/index.ts`: `loadSceneAudioManifest`, scene audio cache pattern.
- `packages/shared/src/index.ts`: `hashFile`, `writeJsonAtomic`.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-cache.ts`
- `packages/speech/src/narration-cache.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 07.

## Implementation Steps

- Compute complete chunk fingerprint.
- Reuse existing chunk only when audio file, metadata, validation, and fingerprint match.
- Write chunk audio to temp path and rename atomically.
- Preserve valid completed chunks when another chunk fails.
- Add stale artifact reporting and optional cleanup.

## Types or Interfaces

`NarrationChunkCacheRecord`, `NarrationChunkCacheDecision`, `NarrationGenerationManifest`.

## Runtime Validation Requirements

Validate cache records against schema and verify output file hash.

## Error-Handling Behavior

Classify cache misses, stale records, invalid records, and provider failures separately.

## Observability Requirements

Log cache hit/miss/stale, fingerprint, chunk ID, and output hash.

## Performance Considerations

Avoid hashing large audio repeatedly when metadata already proves mismatch; hash before reuse.

## Security Considerations

Cache records must exclude secrets and raw authorization data.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-cache.unit.test.ts`

## Acceptance Criteria

A single failed chunk does not delete or overwrite prior valid chunks.

## Explicit Non-Goals

No CLI migration in this task.

## Rollback Considerations

Disable cache and generate to fresh temp directory.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 09 and 17 after Task 07.
