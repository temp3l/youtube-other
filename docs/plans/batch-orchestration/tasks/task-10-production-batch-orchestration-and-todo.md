# Task 10: Production Batch Orchestration And Todo

## Objective

Assemble the stage-gated operator workflow so daily production can be driven from a small set of commands without bypassing validation or retry semantics.

## Existing Functionality To Reuse

- all prior task outputs
- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/index.ts`

## Scope

- `stories production batch`
- `stories batch todo`
- end-to-end ready/blocked/retryable summaries
- final documentation updates for operators

## Files Likely To Inspect

`apps/cli/src/story-pipeline-command.ts`, `apps/cli/src/story-localization-commands.ts`, `apps/cli/src/images-batch-commands.ts`, `apps/cli/src/index.ts`, all prior batch orchestration helpers

## Files Likely To Edit

High-level orchestration CLI wrappers and summary/reporting helpers.

## Implementation Steps

1. Add `stories production batch` as a gated dispatcher, not a blind linear runner.
2. Add `stories batch todo` as the recovery-oriented operator view.
3. Stop orchestration on failed validation while continuing unaffected episodes.
4. Ensure retry suggestions point at the narrowest valid recovery command.

## Tests To Add/Update

- orchestration stops at failed gate
- unaffected episodes continue
- todo view lists blocked and retryable outputs
- repair flow suggestions are correct

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts`

## Risks

This task touches the most operator-facing surface. Keep it last so lower-level state/import/gate behavior is already stable.

## Rollback Notes

If orchestration wrappers are unstable, disable only the wrapper commands and retain the lower-level task commands.

## Acceptance Criteria

Operators can run one orchestrator command for daily production and one todo command for recovery, without bypassing import, validation, or blocked-output semantics.

## Parallelization Notes

Run last.
