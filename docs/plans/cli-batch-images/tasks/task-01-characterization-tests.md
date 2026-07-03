# Task 01 - Characterization Tests

Recommended model: GPT-5.4 for test design and architecture reasoning; GPT-5.4-mini for fixture cleanup and mechanical assertions.

Commit after implementation: `test(image-batch): characterize current image workflows`

## Objective

Add focused tests that pin the current full image, short image, reference, and batch-library behavior before implementation changes.

## Background

Current image batch functions are tested in isolation, but there is no CLI-level characterization for a future `images batch` workflow and no test proving reference inputs are absent from current batch request lines.

## Scope

- Add tests for current image batch planner output.
- Add tests proving current batch custom IDs and manifests are English/full/scene-only.
- Add tests for current short strategy classification: regenerate, smart-crop, blurred-fill.
- Add tests documenting that reference-assisted synchronous generation uses image edit semantics.

## Out of scope

- No production behavior changes.
- No real OpenAI calls.
- No fixture regeneration outside narrow test fixtures.

## Dependencies

None.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`

## Required changes

- Add or extend unit tests in `packages/image-generation/src`.
- Mock provider clients and image generators.
- Assert current limitations explicitly so later tasks update tests intentionally.

## Data model or manifest changes

None.

## CLI behavior

No CLI behavior changes.

## Error handling and observability

Test current error classifications for missing result lines, invalid dimensions, and reference approval failures where existing helpers expose them.

## Security and cost controls

Use fake clients only. Do not read secrets or submit provider requests.

## Tests

- Current full batch JSONL shape.
- Current reference hash tracking without request image input.
- Current short strategy manifest reuse.
- Current service reconciliation by `custom_id`.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
```

## Acceptance criteria

- Tests pass before production changes.
- Tests document limitations without weakening existing assertions.
- No production files are changed.

## Rollback considerations

Revert this task commit only. It must not be coupled to implementation changes.
