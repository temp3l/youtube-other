# Task 06 - Reconciliation, Validation, And Resume

Recommended model: GPT-5.4 for failure semantics and idempotency; GPT-5.4-mini for test expansion and small refactors.

Commit after implementation: `fix(image-batch): harden reconciliation and resume`

## Objective

Make imported image batch results safe, idempotent, and resumable after partial failures.

## Background

`importImageBatch` already reconciles by `custom_id`, decodes base64 payloads, validates MIME/dimensions, writes files atomically, and marks missing outputs retryable. This must be expanded to the generalized identity and CLI workflow.

## Scope

- Reconcile output and error lines only by stable identity.
- Detect unknown and duplicate `custom_id` lines.
- Support partial success and retry only failed/missing/invalid assets.
- Validate MIME type, dimensions, file integrity, destination path, and dependency hashes.
- Preserve successful result mappings across retries.
- Avoid treating interrupted downloads or partial files as complete.

## Out of scope

- No provider submission changes.
- No new short strategy policy.

## Dependencies

Tasks 02-05.

## Repository evidence

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/shared/src/index.ts`
- `packages/rendering/src/index.ts`

## Required changes

- Extend import validation to generalized asset roles.
- Store result state per item with retry count and error details.
- Refuse manifest/filesystem disagreement unless resume can repair safely.
- Make retry preparation preserve root/parent batch lineage.

## Data model or manifest changes

Add per-item result details: output hash, width, height, MIME type, byte size, output file ID, error category/code/message, retry count, and imported timestamp.

## CLI behavior

`images batch download` must import completed batches and return `imported`, `imported_with_failures`, or a clear non-terminal status. `images batch resume` must prepare a new batch only for retryable items.

## Error handling and observability

Classify failures as API failure, policy rejection, expired batch, decode failure, validation failure, missing result, unknown result, duplicate result, stale dependency, or destination conflict.

## Security and cost controls

Resume must not resubmit successful items. It must print exactly how many retryable paid requests will be prepared.

## Tests

- Out-of-order output reconciliation.
- Duplicate and unknown custom IDs.
- Error file processing.
- Invalid base64 and invalid image dimensions.
- Partial success followed by retry batch for failures only.
- Existing valid asset skip on resume.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
```

## Acceptance criteria

- Import is order-independent and idempotent.
- Partial failures never overwrite successful assets.
- Resume creates no duplicate successful paid requests.

## Rollback considerations

Keep schema normalization for earlier manifests. Rollback should not delete generated images or batch result files.
