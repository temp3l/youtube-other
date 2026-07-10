# Task 04: Production Gates And Status CLI

## Objective

Make downstream eligibility explicit so only ready outputs continue and blocked outputs are visible before audio or render work starts.

## Existing Functionality To Reuse

- `packages/story-localization/src/story-workflow-status.ts`
- `packages/story-localization/src/story-workflow-planner.ts`
- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/episode-commands.ts`

## Scope

- `stories production status`
- `stories production next`
- `stories production resume`
- stage-gate evaluation for text, image, audio, and render dependencies

## Files Likely To Inspect

`packages/story-localization/src/story-workflow-status.ts`, `packages/story-localization/src/story-workflow-planner.ts`, `apps/cli/src/story-pipeline-command.ts`, `apps/cli/src/episode-commands.ts`

## Files Likely To Edit

Workflow status helpers, orchestration CLI wrappers, blocked-output summarizers.

## Implementation Steps

1. Add gate evaluators for canonical English, localization, shorts, scene plans, images, audio, and render.
2. Surface blocked reasons at episode/language/profile granularity.
3. Add CLI summaries for ready, blocked, retryable, and waiting outputs.
4. Ensure `resume` advances only eligible stages.

## Tests To Add/Update

- gate evaluation per stage
- blocked reason propagation
- ready/blocked CLI summaries
- unaffected episode continuation

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow-media.unit.test.ts`
`pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts`

## Risks

If gates are duplicated in several wrappers, state can drift. Keep one evaluation layer and reuse it everywhere.

## Rollback Notes

Preserve existing status commands while the new production wrappers are introduced.

## Acceptance Criteria

Users can ask the CLI which outputs are ready, blocked, or retryable, and downstream stages stop only where prerequisites are missing or invalid.

## Parallelization Notes

Can follow task 03; do not overlap with image importer or audio gate edits.
