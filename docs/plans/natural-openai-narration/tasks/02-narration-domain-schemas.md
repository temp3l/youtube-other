# Task 02: Narration Domain Schemas

## Objective

Add typed Zod schemas for all new narration artifacts.

## Rationale

The pipeline needs strict, versioned artifacts for reproducibility, cache invalidation, validation, and inspection.

## Current Relevant Files and Symbols

- `packages/speech/src/audio-instructions.ts`: `AudioInstructionArtifact`, `TtsGenerationRecord`.
- `packages/domain/src/index.ts`: ID and artifact schema style.
- `packages/shared/src/index.ts`: `hashText`, atomic writes.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/narration-schemas.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 01.

## Implementation Steps

- Define enums for roles, moods, pace, flow intent, quality outcomes, and validation severity.
- Add schemas for spoken text, chunk manifest, directions, pronunciation transforms, chunk validation, assembly manifest, mastering metadata, quality gate, config snapshot, and generation metadata.
- Reuse SHA-256 regex conventions from existing schema code.
- Export inferred TypeScript types.

## Types or Interfaces

`SpokenNarrationArtifact`, `NarrationChunkManifest`, `NarrationDirectionSet`, `PronunciationTransformReport`, `ChunkValidationReport`, `NarrationAssemblyManifest`, `NarrationQualityGateReport`.

## Runtime Validation Requirements

Schemas must be strict and reject unknown enum values, invalid hashes, invalid sequence ordering where feasible, and negative durations.

## Error-Handling Behavior

Use Zod parse errors at boundaries; do not silently coerce invalid artifacts.

## Observability Requirements

None in schemas.

## Performance Considerations

Schema validation should be linear in chunk count.

## Security Considerations

Do not store secrets in config snapshot schemas.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-schemas.unit.test.ts`

## Acceptance Criteria

All artifact schemas parse valid fixtures and reject malformed fixtures.

## Explicit Non-Goals

Do not implement pipeline behavior.

## Rollback Considerations

Remove additive schema file and exports.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Task 03 and Task 06 after Task 01.
