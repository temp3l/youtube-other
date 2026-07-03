# Task 08 - Paths And Renderer Integration

Recommended model: GPT-5.4-mini for path/resolver implementation; GPT-5.4 for integration review across manifests and renderers.

Commit after implementation: `fix(image-batch): normalize asset paths for rendering`

## Objective

Ensure batch-generated and transformed assets are placed in canonical episode paths and consumed correctly by full and short renderers.

## Background

Full rendering consumes shared generated images. Short rendering consumes `shared/short/images/generated` and `shorts-image-manifest.json`. Batch service currently writes to `expectedOutputPath` from scene manifests and derives scene manifest paths from output paths.

## Scope

- Centralize canonical paths for full scene images, short scene images, reference images, batch inputs/results/errors/reports, and manifests.
- Ensure import writes batch outputs only to canonical paths.
- Ensure renderer lookup resolves batch-generated full and short assets.
- Mark deprecated path layouts in docs and avoid using them in new code.

## Out of scope

- No broad filesystem migration.
- No generated episode asset mutation outside tests.

## Dependencies

Tasks 04, 06, and 07.

## Repository evidence

- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/shorts-image-strategy.ts`

## Required changes

- Add or reuse resolver helpers for all batch image asset categories.
- Update batch planner/importer to use resolvers instead of ad hoc path derivation where needed.
- Verify renderer image lookup prefers canonical filenames and fails clearly on ambiguity.

## Data model or manifest changes

Manifest item paths must be resolver-derived and include a repo/workspace-relative display path where useful for logs.

## CLI behavior

CLI status should report canonical image directories and manifest paths.

## Error handling and observability

Report duplicate destination paths, missing renderer asset, ambiguous renderer matches, and stale manifest/output disagreements.

## Security and cost controls

Path normalization must prevent traversal outside the episode workspace.

## Tests

- Full batch output path resolves to renderer-consumable image.
- Short batch/transform output path resolves to renderer-consumable portrait image.
- Reference paths stay under shared reference directories.
- Ambiguous image matches fail deterministically.

## Verification commands

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Batch import and renderer consumption agree on canonical paths.
- Deprecated layouts are not used for new batch artifacts.
- Path traversal and ambiguity are rejected.

## Rollback considerations

Keep path changes behind resolver helpers so rollback is local and does not require deleting assets.
