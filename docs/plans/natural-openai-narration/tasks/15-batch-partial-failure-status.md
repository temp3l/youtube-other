# Task 15: Batch Partial Failure Status

## Objective

Make multi-language and multi-target narration generation tolerant of partial failures.

## Rationale

Currently `audio generate-localized` loops languages sequentially and throws on the first failed language.

## Current Relevant Files and Symbols

- `apps/cli/src/index.ts`: `commandAudioGenerateLocalized`.
- `packages/story-localization/src/story-localization-batch-service.ts`: status and partial-result patterns.
- `apps/cli/src/episode-status-output.ts`: status output patterns.

## Exact Files Likely Modified or Created

- `apps/cli/src/index.ts`
- `apps/cli/src/index.unit.test.ts`
- `packages/speech/src/narration-pipeline.ts`
- `packages/speech/src/narration-status.ts`

## Dependencies

Tasks 08, 12, and 13.

## Implementation Steps

- Add per-target job result records for episode/language/variant.
- Continue processing unrelated targets after failures.
- Summarize success, warning, failed, and blocked counts.
- Add `audio narration status`.
- Implement strict-mode exit code behavior.

## Types or Interfaces

`NarrationBatchStatus`, `NarrationTargetStatus`, `NarrationBatchSummary`.

## Runtime Validation Requirements

Validate requested languages and variants before starting generation.

## Error-Handling Behavior

Classify config, provider, validation, assembly, and unknown failures.

## Observability Requirements

Log target start/end, outcome, duration, and failure classification.

## Performance Considerations

Use bounded concurrency across chunks and conservative concurrency across languages.

## Security Considerations

Status output must not expose secrets or full narration text.

## Test Requirements

`pnpm test:focused -- apps/cli/src/index.unit.test.ts`

## Acceptance Criteria

A failed language does not block unrelated successful outputs.

## Explicit Non-Goals

No OpenAI Batch API for speech.

## Rollback Considerations

Return to sequential fail-fast generation.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 14 and 17 after Task 13.
