# Task 04: Deterministic Beat Segmentation

## Objective

Segment spoken narration into stable narrative chunks targeted at roughly 15-40 seconds.

## Rationale

The current paragraph/character and scene balancing can produce monotonous or emotionally incoherent TTS chunks.

## Current Relevant Files and Symbols

- `packages/speech/src/script-markdown.ts`: `splitEpisodeScriptMarkdown`.
- `apps/cli/src/index.ts`: `balanceScriptChunksForScenes`, `splitSpeechSentences`.
- `packages/story-localization/src/language-profiles.ts`: WPM profiles.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-segmentation.ts`
- `packages/speech/src/narration-segmentation.unit.test.ts`
- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 02.

## Implementation Steps

- Parse spoken text into paragraphs and sentences.
- Estimate duration with language-aware WPM.
- Prefer paragraph and role boundaries.
- Assign roles from position and transition heuristics.
- Enforce configurable min/max words and estimated duration.
- Generate stable ordered chunk IDs and context excerpts.
- Persist chunk manifest.

## Types or Interfaces

`NarrationSegmentationConfig`, `NarrationChunk`, `NarrationChunkManifest`.

## Runtime Validation Requirements

Reject empty manifests, duplicate IDs, non-contiguous sequences, and chunks beyond configured hard limits.

## Error-Handling Behavior

Fallback to paragraph chunks, then sentence packing, and fail only when no non-empty text remains.

## Observability Requirements

Log chunk count, min/max/avg estimated duration, fallback use, and manifest fingerprint.

## Performance Considerations

No model calls; linear in sentence count.

## Security Considerations

Do not log chunk text by default.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-segmentation.unit.test.ts`

## Acceptance Criteria

Segmentation is deterministic, stable, ordered, resumable, and avoids sentence-by-sentence output under normal input.

## Explicit Non-Goals

No TTS generation.

## Rollback Considerations

Compatibility adapter can continue using existing scene/paragraph chunks.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 03, 06, and 09 after Task 02.
