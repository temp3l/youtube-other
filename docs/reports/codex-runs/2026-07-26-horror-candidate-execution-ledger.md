# Horror Candidate Execution Ledger

## Summary

Added a versioned atomic execution ledger and mock-only adapter bound to the
exact v3 manifest, preflight, ordered cohort, strategies, and budget.
Reservations persist before fake invocation; completed units are reused;
failed or uncertain Full units block paired Shorts; uncertain calls never retry
automatically. Only candidate/final-line hashes and cost lineage persist.

## Changed Paths

- `packages/story-localization/src/horror-evaluation-rollout.ts`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`
- Controlled-evaluation README and required plan report

## Checks

Focused rollout: 16 passed after one test-seam correction. Story-localization
typecheck passed after one literal-type repair. Targeted `git diff --check`:
passed.

## Risks / Follow-up

No paid/provider call, production candidate, rating, analytics import,
publication, decision, or rollout promotion ran; mode remains `shadow`.
Provider exactly-once is not claimed. Next requires explicit human paid-dispatch
authorization; uncertain state needs separate reconciliation.

## Commit

`f29a43c` (uncommitted).
