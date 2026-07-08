# Task 10: Legacy Cleanup After Tests

## Objective

Isolate or remove legacy layout behavior only after current behavior is characterized and replacements are live.

## Findings Addressed

CR-001, CR-015, CR-016, CR-023.

## Files Likely To Inspect

`packages/shared/src/episode-filesystem.ts`, `packages/story-localization/src/short-rewrite.resolution.ts`, `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-localization-commands.ts`, `apps/cli/src/episode-layout-migration-command.ts`.

## Files Likely To Edit

Legacy adapters, command compatibility output, and tests explicitly marked legacy.

## Implementation Steps

Move stale layout reads/writes behind `legacyCompat` APIs. Remove compatibility paths only when no current command depends on them. Keep migration command support until episodes are reconciled.

## Tests To Add/Update

Legacy adapter tests proving stale paths are opt-in and current paths are preferred.

## Verification Commands

`pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`
`pnpm test:focused -- apps/cli/src/episode-layout-migration-command.unit.test.ts`

## Risks

Removing compatibility too early can break existing episode artifacts.

## Rollback Notes

Restore legacy adapter behavior and tests if an episode still depends on it.

## Acceptance Criteria

Current Dark Truth flows do not rely on unlabelled legacy `script.md` discovery.

## Parallelization Notes

Must not run in parallel with path, manifest, pipeline, or render contract changes.

