# Task 09: Remote Rendering Hardening

## Objective

Add reliable schemas, transport guards, result validation, and cleanup safety for remote rendering.

## Findings Addressed

CR-011, CR-014, CR-020.

## Files Likely To Inspect

`scripts/remote-render-worker.mjs`, `packages/rendering/src/index.ts`, `apps/cli/src/render-remote-shell.ts`, `apps/cli/src/render-remote-inspection.ts`, `packages/config/src/index.ts`.

## Files Likely To Edit

Remote render schemas, worker validation, remote client result parsing, shell helper tests.

## Implementation Steps

Validate job manifests, ready markers, metadata, and results. Add output hash/duration/dimension checks. Guard cleanup base directories and quote transport config. Improve missing log/result diagnostics.

## Tests To Add/Update

Remote worker invalid manifest tests, partial result tests, cleanup script tests, and remote client result schema tests.

## Verification Commands

`pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
`pnpm test:focused -- apps/cli/src/render-remote-shell.unit.test.ts`
`pnpm test:focused -- apps/cli/src/render-remote-inspection.unit.test.ts`

## Risks

Remote host behavior cannot be fully verified locally. Keep live remote checks manual.

## Rollback Notes

Revert remote schemas and client/worker parsing changes together.

## Acceptance Criteria

Malformed or partial remote outputs are rejected with typed diagnostics and cleanup remains base-dir contained.

## Parallelization Notes

Depends on task 08. Do not run concurrently with render contract edits.

