# Task 05: Pipeline Stage Contracts

## Objective

Turn the story workflow from dry-run planning into an executable, hash-backed stage contract model.

## Findings Addressed

CR-005, CR-007, CR-016, CR-020.

## Files Likely To Inspect

`apps/cli/src/story-pipeline-command.ts`, `packages/story-localization/src/story-workflow-planner.ts`, `packages/story-localization/src/story-workflow-store.ts`, `packages/story-localization/src/story-workflow.schemas.ts`, `apps/cli/src/index.ts`.

## Files Likely To Edit

Story workflow schemas/store/planner and focused CLI wrappers.

## Implementation Steps

Define stage inputs/outputs, real dependency fingerprints, result unions, retryability, and cache state. Introduce service-level command handlers behind CLI registration without moving unrelated behavior.

## Tests To Add/Update

Workflow tests for changed source hash invalidation, resumed manifest validation, failed stage recording, and CLI status output.

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow.schemas.unit.test.ts`
`pnpm test:focused -- packages/story-localization/src/story-workflow-store.unit.test.ts`
`pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts`

## Risks

Premature orchestration rewrites can regress current Dark Truth commands. Keep this incremental.

## Rollback Notes

Revert workflow schema and CLI contract changes together.

## Acceptance Criteria

Workflow manifests include real input hashes and typed outcomes for at least the first executable stage boundary.

## Parallelization Notes

Do not parallelize with task 10 or broad CLI rewrites.

