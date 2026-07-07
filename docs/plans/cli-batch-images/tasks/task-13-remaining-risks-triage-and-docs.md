# Task 13 - Remaining Risks Triage And Docs

Recommended model: GPT-5.4-mini for final documentation edits; GPT-5.4 for release-note style audit consistency review.

Commit after implementation: `docs(image-batch): record remaining risk triage`

## Objective

Record the final state of the remaining batch-image risks, including provider
verification status, multilingual shared-output behavior, short-batch downstream
status, and the handling of unrelated stale artifacts in the workspace.

## Background

The original operator docs describe the implemented batch workflow, but they do
not yet capture the remaining-risk triage pass, the real status of reference
edit batch semantics, or the distinction between unrelated workspace artifacts
and actual in-scope implementation gaps.

## Scope

- Update `docs/cli-batch-images.md`.
- Update `docs/plans/cli-batch-images/batch-image-audit.md`.
- Finalize `docs/plans/cli-batch-images/remaining-risks-triage.md`.
- Cross-link the provider manual verification checklist.
- Document stale diagram render and stale CLI runtime handling as unrelated
  workspace concerns.

## Out of scope

- No new product behavior unless documentation review exposes a small mismatch
  that must be fixed in already-touched batch-image code.
- No artifact cleanup by default.

## Dependencies

Tasks 10-12.

## Repository evidence

- `docs/cli-batch-images.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`
- `docs/plans/cli-batch-images/remaining-risks-triage.md`
- `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
- `apps/cli/bin/mediaforge.js`
- `docs/diagrams/rendered/*`

## Required changes

- Document current provider verification status for image-edit batch semantics.
- State clearly whether reference-assisted batch edits are implemented, blocked,
  or manual-only.
- Document the final multilingual full-scene shared-output policy.
- Document alias behavior if implemented.
- Document short-batch support status across prepare, submit, download/import,
  resume, and rendering.
- Record known limitations and safe verification commands.
- Record which stale artifacts are unrelated and how to handle them safely.
- Record any remaining risks left after Tasks 10-12.

## Data model or manifest changes

No new schema changes required. If manifest alias fields or provider-safeguard
fields were added earlier, document them with sanitized examples.

## CLI behavior

- Do not document any verification command as implemented unless it exists in
  source.
- Keep command examples aligned with the actual merged `images batch` CLI.

## Error handling and observability

- Document current planner/import errors relevant to remaining risks.
- Document when operators should stop and use the manual checklist instead of
  attempting a paid provider verification.

## Security and cost controls

- Reiterate that prepare and resume are local-only.
- Reiterate that any manual provider verification must be explicit, dry-run
  gated, and secret-safe.

## Tests

- Markdown formatting check.
- Focused docs-related CLI tests if command/help text changes.
- Diagram freshness check only as a reporting tool; do not clean stale diagram
  artifacts unless the task is explicitly expanded.

## Verification commands

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm exec prettier --check docs/cli-batch-images.md docs/plans/cli-batch-images
pnpm docs:diagrams:check
```

## Acceptance criteria

- The docs distinguish unrelated workspace noise from real implementation gaps.
- Operators can tell exactly what is verified, blocked, manual-only, and still
  risky.
- Cleanup guidance is explicit and non-destructive.

## Rollback considerations

- These doc updates can be reverted independently.
- Do not roll back artifact notes in a way that suggests stale tracked outputs
  were cleaned or rebuilt when they were not.
