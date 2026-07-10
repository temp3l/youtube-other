# Task 07: Output Blocking And Render Readiness

## Objective

Block only affected episode/language/profile outputs from downstream rendering and allow unaffected outputs to proceed.

## Existing Functionality To Reuse

- `packages/story-localization/src/story-workflow-media.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`
- `packages/rendering/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`

## Scope

- blocked-output summary storage
- render-readiness evaluation
- full-image reuse for localized full outputs
- short-image isolation

## Files Likely To Inspect

`packages/story-localization/src/story-workflow-media.ts`, `packages/rendering/src/index.ts`, `packages/shared/src/episode-filesystem.ts`, `packages/image-generation/src/shorts-image-strategy.ts`

## Files Likely To Edit

Readiness evaluators, render target selection helpers, CLI status/reporting adapters.

## Implementation Steps

1. Add a per-output readiness evaluator.
2. Reuse canonical English full images for localized full renders where valid.
3. Keep short renders dependent on short-scene image assets only.
4. Ensure missing or invalid assets block the narrowest affected output.

## Tests To Add/Update

- localized full image reuse
- short/full isolation
- one blocked output does not block unrelated episodes
- readiness summary generation

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow-media.unit.test.ts`
`pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts`

## Risks

Render readiness can accidentally become another hidden gate in the renderer. Keep evaluation visible and reusable from CLI status.

## Rollback Notes

Keep renderer behavior unchanged until readiness checks are proven.

## Acceptance Criteria

Blocked outputs are recorded at episode/language/profile scope and unrelated outputs remain renderable.

## Parallelization Notes

Do not parallelize with task 09.
