# Task 10: Manifest Assembly and Continuity

## Objective

Assemble chunks from an explicit manifest with pause insertion, safe trimming, and optional crossfades.

## Rationale

Raw concat creates abrupt boundaries and depends on thin `segments.txt` state.

## Current Relevant Files and Symbols

- `apps/cli/src/index.ts`: FFmpeg concat in `commandAudioGenerate`.
- `packages/dark-truth/src/index.ts`: `generateMockNarrationAudio` concat.
- `packages/rendering/src/index.ts`: FFmpeg command style.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-assembly.ts`
- `packages/speech/src/narration-assembly.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 04, 08, and 09.

## Implementation Steps

- Build ordered assembly manifest from chunk manifest, directions, cache records, and validation reports.
- Reject missing, duplicate, invalid, or out-of-order chunks.
- Generate FFmpeg filter graph for trims, silence, and cautious equal-power crossfades.
- Write assembled clean narration to temp file.
- Validate final output before promotion.

## Types or Interfaces

`NarrationAssemblyManifest`, `NarrationAssemblyEntry`, `NarrationAssemblyResult`.

## Runtime Validation Requirements

Ensure manifest sequence is contiguous and every required chunk has acceptable validation.

## Error-Handling Behavior

Return blocked assembly report; do not overwrite previous valid narration.

## Observability Requirements

Log input chunk count, output duration, crossfade count, inserted silence, and validation status.

## Performance Considerations

One FFmpeg command per assembly; avoid re-encoding chunks unless filters require it.

## Security Considerations

Use argument arrays, not shell interpolation, for FFmpeg.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-assembly.unit.test.ts`

## Acceptance Criteria

Assembler consumes manifest ordering and never relies on filename sort order.

## Explicit Non-Goals

No mastering chain beyond clean assembly.

## Rollback Considerations

Fallback to legacy concat for compatibility mode.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 11 and 12 after dependencies.
