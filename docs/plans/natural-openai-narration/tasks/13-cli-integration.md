# Task 13: CLI Integration

## Objective

Expose staged narration commands and route `audio generate` through the new orchestrator behind a rollout mode.

## Rationale

The normal production command must stay simple while advanced stages remain inspectable.

## Current Relevant Files and Symbols

- `apps/cli/src/index.ts`: Commander setup, `audioCommand`, `commandAudioGenerate`.
- `apps/cli/src/story-pipeline-command.ts`: workflow command style.
- `packages/config/src/index.ts`: runtime config overrides.

## Exact Files Likely Modified or Created

- `apps/cli/src/index.ts`
- `apps/cli/src/index.unit.test.ts`
- `packages/speech/src/narration-pipeline.ts`
- `packages/speech/src/index.ts`
- `packages/config/src/index.ts`

## Dependencies

Tasks 03-12.

## Implementation Steps

- Add `NarrationPipeline` orchestrator.
- Add `audio narration prepare|plan|generate|assemble|validate|status|inspect`.
- Add `--variant`, `--resume`, `--force`, `--validation-only`, and `--concurrency`.
- Keep `audio generate` legacy by default.
- Enable new flow only when `narrationPipelineMode=new`.

## Types or Interfaces

`NarrationPipelineRequest`, `NarrationPipelineResult`, `NarrationCliOptions`.

## Runtime Validation Requirements

Validate episode, language, variant, and requested mode before mutation.

## Error-Handling Behavior

Return structured partial results; use documented exit codes.

## Observability Requirements

Log stage transitions and per-stage status.

## Performance Considerations

Do not rerun completed stages unless `--force`.

## Security Considerations

Do not expose API key values through `--json`.

## Test Requirements

`pnpm test:focused -- apps/cli/src/index.unit.test.ts`

## Acceptance Criteria

Existing `audio generate` tests keep passing and new dry-run/status outputs are machine-readable.

## Explicit Non-Goals

No broad repo-wide CLI refactor.

## Rollback Considerations

Set `narrationPipelineMode=legacy`.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 14 and 15 after core dependencies.
