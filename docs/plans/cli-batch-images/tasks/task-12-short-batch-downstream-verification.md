# Task 12 - Short Batch Downstream Verification

Recommended model: GPT-5.4-mini for focused batch-flow tests; GPT-5.4 for cross-package consistency review.

Commit after implementation: `fix(image-batch): verify short batch import and resume`

## Objective

Verify that short-image batch support is correct across CLI prepare output,
provider submission boundaries, import/download, resume, manifest updates, and
renderer consumption.

## Background

Short-scene batch preparation already splits work into native generation,
deterministic transforms, reuse, and blocked items. The remaining risk is not
the strategy selection itself; it is whether downstream batch flows only submit
native items, keep transform-only work local, and preserve canonical short
render inputs after import and resume.

## Scope

- Verify CLI routing for `--variants short`.
- Verify prepare JSON/summary output for paid versus local work.
- Verify import/download behavior for native short items.
- Verify transform-only items never enter provider submission or provider-result
  decoding.
- Verify resume only retries failed native short generation items.
- Verify renderer compatibility with the resulting short manifest and portrait
  paths.
- Run narrow TypeScript checks for affected packages.

## Out of scope

- No new short generation strategy design.
- No broad repo typecheck or build unless required by package boundaries.

## Dependencies

Task 11.

## Repository evidence

- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/images-batch-commands.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/rendering/src/index.ts`

## Required changes

- Confirm `images batch prepare --variants short` routes through the short
  planner.
- Keep prepare summaries explicit about:
  - paid native generations
  - free deterministic transforms
  - cache reuse
  - blocked items
- Ensure transform-only items are stored only in the short local work plan and
  never become provider requests.
- Ensure native short imports write canonical portrait outputs and update the
  short manifest.
- Ensure download/import does not try to decode transform-only items as provider
  outputs.
- Ensure resume only retries failed native items and ignores local-only
  transform/reuse entries.
- Confirm existing valid portrait assets are reused.
- Confirm missing landscape dependencies fail before submission.

## Data model or manifest changes

- Preserve current manifest shape unless an explicit discriminator is needed to
  distinguish provider-owned short items from local-only short work.
- Keep CLI JSON output stable unless the task intentionally adds fields already
  required by the short workflow.

## CLI behavior

- `images batch prepare --variants short --json` must expose short-specific
  preview counts and the local work-plan path.
- `images batch download` and `images batch resume` must continue to work with
  short native generation batches without treating local-only items as remote
  results.

## Error handling and observability

- Report missing landscape input, stale short source hashes, invalid portrait
  dimensions, and unsupported short endpoint errors clearly.
- If TypeScript checks fail because of unrelated local state, record the exact
  unrelated files rather than modifying them.

## Security and cost controls

- Keep local deterministic transforms free and local.
- Resume must avoid duplicate paid requests for items already satisfied by reuse
  or local transforms.

## Tests

- CLI prepare routes `short` through the short planner.
- Prepare summary separates paid native generation from local deterministic
  transforms.
- Transform-only items never enter provider JSONL.
- Import writes native short results to canonical portrait paths.
- Download/import ignores transform-only items as provider results.
- Resume retries only failed native short generation items.
- Existing valid short portraits are reused.
- Missing full landscape source fails before submission.
- Renderer consumes the resulting short manifest and portrait paths.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- apps/cli/src/images-batch-commands.unit.test.ts
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm --filter @mediaforge/shared --filter @mediaforge/image-generation --filter @mediaforge/rendering --filter @mediaforge/cli typecheck
```

## Acceptance criteria

- Short prepare/import/download/resume behavior is verified across CLI and
  library layers.
- Local-only short work never becomes a provider request.
- Renderer-facing short outputs remain canonical and stable.
- Narrow package TypeScript checks pass or are documented as blocked by unrelated
  local state.

## Rollback considerations

- Keep short verification changes scoped to tests, summaries, and retry/import
  guards so rollback does not disturb the underlying short strategy implementation.
