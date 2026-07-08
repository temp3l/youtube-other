# Task 06: Localization Asset Identity

## Objective

Make localized/full/short shared visual reuse identity stable and explicit.

## Findings Addressed

CR-006, CR-010, CR-015.

## Files Likely To Inspect

`packages/image-generation/src/image-batch-planner.ts`, `packages/image-generation/src/image-batch-identity.ts`, `packages/domain/src/shared-visuals.unit.test.ts`, `packages/shared/src/episode-filesystem.ts`, `packages/dark-truth/src/index.ts`.

## Files Likely To Edit

Image identity helpers, batch planner alias logic, locale validation boundaries.

## Implementation Steps

Add visual intent hash fields for short/shared aliases. Include language, variant, aspect ratio, prompt hash, dependency hash, asset purpose, source language, and target language. Centralize `pt` support or return explicit unsupported-locale errors.

## Tests To Add/Update

Alias collision tests with same subject/output and different prompt intent; locale compatibility tests for `pt`.

## Verification Commands

`pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts`
`pnpm test:focused -- packages/domain/src/shared-visuals.unit.test.ts`

## Risks

Changing identity changes cache keys. Preserve old cache reads only through explicit compatibility code.

## Rollback Notes

Revert identity field additions and planner updates together.

## Acceptance Criteria

Short/shared visual aliasing cannot collapse distinct localized visual intent.

## Parallelization Notes

Coordinate with task 07 on image batch schemas and custom ID fields.

