# Horror Production Evaluation Preregistration

## Summary

Created hash-bound v2 manifest and `remain-shadow` decision records. The
manifest freezes Episodes 025/034/041/051, separate Full/Short tracks,
`endingRetention`, a `0.05` threshold, pre-outcome exclusions, an 8-call/USD 8
ceiling, and `workspace-user` authority scopes.

## Changed Paths

- `docs/development/horror-controlled-evaluation/`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`
- Final audit and required run/plan reports

## Checks

Exact manifest/decision schema and hash test: 1 passed.
`@mediaforge/story-localization` typecheck and targeted `git diff --check`:
passed.

## Risks / Follow-up

No strategy candidates, blind production ratings, authorized audience
aggregate, observed production failure behavior, or promotion approval exists.
Production packet support was added on 2026-07-26 with exact manifest binding.
No provider, analytics, publication, or rollout action ran; v2 remains
`shadow`.

## Commit

`f29a43c` (changes uncommitted).
