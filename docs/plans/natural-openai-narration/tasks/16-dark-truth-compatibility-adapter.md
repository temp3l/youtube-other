# Task 16: Dark Truth Compatibility Adapter

## Objective

Adapt `dark-truth` `SpeechPlan` artifacts into the new narration pipeline without breaking source-pack workflows.

## Rationale

`packages/dark-truth` contains duplicated narration generation and useful segment metadata that should be reused or delegated.

## Current Relevant Files and Symbols

- `packages/dark-truth/src/index.ts`: `SpeechPlan`, `SpeechSegment`, `generateNarrationAudio`, `generateMockNarrationAudio`, `buildSpeechPlanHash`.
- `packages/speech/src/index.ts`: `OpenAiCompatibleSpeechProvider`.
- `packages/speech/src/narration-schemas.ts`: new schemas.

## Exact Files Likely Modified or Created

- `packages/dark-truth/src/index.ts`
- `packages/dark-truth/src/index.unit.test.ts`
- `packages/speech/src/dark-truth-adapter.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 04, 08, 10, and 13.

## Implementation Steps

- Map `SpeechPlan.segments` to `NarrationChunkManifest`.
- Map pace/intensity/pauses to `NarrationDirectionSet`.
- Preserve existing `narration-manifest.json` compatibility output.
- Delegate generation to the new pipeline when feature flag is enabled.
- Keep old behavior available during rollout.

## Types or Interfaces

`DarkTruthNarrationAdapterInput`, `DarkTruthNarrationAdapterResult`.

## Runtime Validation Requirements

Validate segment IDs, order, hashes, language, and artifact type.

## Error-Handling Behavior

Fallback to existing dark-truth generation when adapter mode is disabled or blocked.

## Observability Requirements

Log adapter mode, source speech plan hash, output manifest hash, and fallback use.

## Performance Considerations

Reuse chunk cache based on speech plan hash and per-segment text fingerprints.

## Security Considerations

Do not log full source-pack narration.

## Test Requirements

`pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts`

## Acceptance Criteria

Existing dark-truth tests pass and adapter can produce equivalent compatibility outputs.

## Explicit Non-Goals

No source-pack parsing refactor.

## Rollback Considerations

Disable adapter flag and use current `generateMockNarrationAudio` path.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Task 17 after dependencies.
