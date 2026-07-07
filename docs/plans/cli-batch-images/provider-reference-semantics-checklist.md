# Provider Reference Semantics Checklist

Use this checklist before enabling batch reference-assisted image edits. Current
source behavior intentionally blocks them with `unsupported-edit-batch-request`.

## Preconditions

- Use a disposable episode workspace and test assets only.
- Keep the normal `images batch` CLI path local-only unless the operator
  explicitly opts into a manual provider check.
- Do not reuse production reference files or signed URLs in notes or logs.

## What Must Be Proven

1. `/v1/images/edits` accepts batch JSONL lines that reference uploaded image
   inputs in the expected `body.image` shape.
2. The returned output lines reconcile cleanly by `custom_id`.
3. Failed or partial edit-batch results can be classified without silently
   degrading to text-only generation.
4. The provider does not require a request shape that differs from the current
   planner model.

## Manual Verification Steps

1. Inspect the installed SDK typings and current planner/service code.
2. Prepare a minimal reference-assisted scene with one uploaded image input and
   one dependent scene.
3. Capture the exact JSONL line that would be submitted, without editing it by
   hand after export.
4. Upload only the required test image files explicitly.
5. Submit one opt-in batch to `/v1/images/edits`.
6. Record:
   - provider request payload shape
   - accepted or rejected response
   - returned output and error line schema
   - whether `body.image` accepts file ids, arrays, or another structure
7. Import the result with a disposable workspace and confirm:
   - no silent fallback to `/v1/images/generations`
   - no dropped reference dependency
   - retry behavior stays scoped to failed owner items only

## Stop Conditions

Stop and leave batch edit support blocked if any of the following occur:

- the provider rejects the JSONL line shape
- the provider requires undocumented image input encoding
- output or error files cannot be reconciled by `custom_id`
- result payloads do not match the current import assumptions
- any step would require using production assets or secrets unsafely

## Required Follow-Up Before Enabling Support

- Add characterization tests for the proven provider shape.
- Update planner validation to match the proven contract exactly.
- Update `docs/cli-batch-images.md` and
  `docs/plans/cli-batch-images/batch-image-audit.md`.
- Remove the manual-only gate only in the same change that adds the new tests.
