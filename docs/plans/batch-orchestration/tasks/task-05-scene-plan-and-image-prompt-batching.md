# Task 05: Scene Plan And Image Prompt Batching

## Objective

Batch-produce scene plans and image prompts after approved full stories exist, while preserving canonical-English full-image lineage and short-image separation.

## Existing Functionality To Reuse

- `packages/story-localization/src/story-workflow-visual.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`

## Scope

- stage-gated scene-plan generation
- image-prompt planning for full and short outputs
- reuse rules for canonical full images vs short images

## Files Likely To Inspect

`packages/story-localization/src/story-workflow-visual.ts`, `packages/image-generation/src/episode-image-pipeline.ts`, `packages/image-generation/src/image-batch-planner.ts`, `packages/image-generation/src/shorts-image-strategy.ts`

## Files Likely To Edit

Visual stage wrappers, scene-plan persistence adapters, prompt-planning command glue.

## Implementation Steps

1. Gate scene-plan work on approved source scripts.
2. Persist scene plans as imported-and-validated artifacts before image generation.
3. Plan full-image prompts from canonical English full scene plans.
4. Plan short-image prompts separately for `short` outputs.

## Tests To Add/Update

- scene-plan gating
- full-image reuse mapping
- short-image isolation
- prompt-plan persistence

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow-visual.unit.test.ts`
`pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts`

## Risks

Scene-plan ownership currently spans workflow and image packages. Keep ownership boundaries explicit.

## Rollback Notes

Do not delete existing scene/image planning entry points in this task.

## Acceptance Criteria

Approved full stories can produce scene plans and image prompts in batch without confusing full-video and short-video visual contracts.

## Parallelization Notes

Do not parallelize with task 06.
