# Task 02: Path Resolution Hardening

## Objective

Make authored scripts, generated scripts, runtime locale roots, shared assets, and legacy compatibility paths explicit and contained.

## Findings Addressed

CR-001, CR-004, CR-015, CR-016, CR-023.

## Files Likely To Inspect

`packages/shared/src/episode-filesystem.ts`, `packages/story-localization/src/canonical-full-story.persistence.ts`, `packages/story-localization/src/story-localization.service.ts`, `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-localization-commands.ts`, `packages/story-localization/src/short-rewrite.resolution.ts`.

## Files Likely To Edit

Shared resolver and focused command/service call sites only.

## Implementation Steps

Add named resolver methods for authored scripts, generated narration scripts, locale runtime roots, shared images, and legacy compatibility. Validate generated image filenames with basename/portable-relative checks. Replace manual path joins where behavior is already covered by tests.

## Tests To Add/Update

Path resolver tests for canonical authored paths, generated script paths, stale legacy paths, and filename traversal rejection.

## Verification Commands

`pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`

## Risks

Changing path names can break existing episode artifacts. Keep legacy compatibility opt-in until task 10.

## Rollback Notes

Revert resolver changes and call-site replacements as one unit.

## Acceptance Criteria

No new manual `script.md` path construction outside named generated or legacy helpers; generated image helpers cannot escape their directories.

## Parallelization Notes

Do not run with legacy cleanup. Can run beside telemetry-only cleanup if files are disjoint.

