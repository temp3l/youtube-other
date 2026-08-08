# Task 09 Project Episode Workflow UI Implementation Report

## Source Plan File

`docs/plans/saas-api-execution/tasks/task-09-project-episode-workflow-ui.md`

## Date Of Execution

2026-08-08

## Summary Of Implemented Changes

Added a modern, server-rendered core journey through a typed BFF gateway. Users
can discover and create entitled projects, create or revise profile-specific
briefs, start provider-free workflow admission, and inspect safe workflow/job/
step status. Mutations require same-origin requests and carry strong revisions.

## Files Changed

- `apps/web/src/{saas-runtime.ts,saas-api-bff.ts,oidc-bff.ts,index.ts}`
- `apps/web/{package.json,src/saas-runtime.unit.test.ts}`
- `pnpm-lock.yaml`
- This report and its Codex run report

## Tasks Completed

Server-side project/episode/workflow UI, typed profile forms, 412 conflict
feedback, BFF replay protection, and status rendering.

## Tasks Partially Completed

Replay protection is process-local for project/episode creation because those
API endpoints do not yet support durable idempotency keys.

## Tasks Not Completed

None within the web runtime scope.

## Deviations From The Original Plan

Used a typed injected SDK gateway rather than browser API calls, preserving the
BFF token boundary.

## Tests/Checks Run

- `pnpm --filter @mediaforge/web typecheck`
- `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts`

## Test Results

Typecheck passed. Focused test passed: 4 tests.

## Known Risks Or Follow-Up Work

Add durable API idempotency for project and episode creation before horizontal
web scaling; retain BFF replay as defense in depth.

## Recommended Next Steps

Implement asset, validation, and approval decision views through the same BFF.
