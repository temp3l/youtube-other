# Task 12: Quality Gate and Reports

## Objective

Add final narration quality gate JSON and Markdown reports.

## Rationale

Production should know whether narration is ready, warning-only, regeneration-recommended, or blocked.

## Current Relevant Files and Symbols

- `packages/speech/src/audio-instructions.ts`: `TtsGenerationRecord`.
- `packages/rendering/src/index.ts`: validation report style.
- `apps/cli/src/episode-status-output.ts`: status reporting patterns.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-quality-gate.ts`
- `packages/speech/src/narration-quality-gate.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 09, 10, and 11.

## Implementation Steps

- Aggregate chunk validations, assembly manifest, mastering metadata, and generation metadata.
- Compute outcome.
- Persist JSON and Markdown report.
- Include fallback usage and compatibility output status.

## Types or Interfaces

`NarrationQualityGateReport`, `NarrationQualityOutcome`.

## Runtime Validation Requirements

Reject reports with missing required chunks or inconsistent config fingerprints.

## Error-Handling Behavior

Quality gate should produce `BLOCKED` instead of throwing for expected validation failures.

## Observability Requirements

Log outcome, warning count, error count, and output paths.

## Performance Considerations

Local metadata aggregation only.

## Security Considerations

Reports should not contain secrets or full story text.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-quality-gate.unit.test.ts`

## Acceptance Criteria

Gate returns all four expected outcome classes in tests.

## Explicit Non-Goals

No mandatory AI subjective review.

## Rollback Considerations

Ignore quality-gate artifacts and rely on existing generation success.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 11 and 17 after dependencies.
