# Horror Production Candidate Persistence

## Summary

Added immutable runtime paths and persistence for manifest-bound production
candidate sets plus separate Full/Short reviewer packets and answer keys.
Persistence requires the matching manifest, requires candidates before packets,
reuses identical artifacts, and rejects changed seeds, changed candidates, or
partial packet sets.

## Changed Paths

- `packages/story-localization/src/horror-evaluation-rollout.ts`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`
- Evaluation contract, audit, and required plan/run reports

## Checks

Exact persistence regression: 1 passed. Full rollout file: 11 passed.
`@mediaforge/story-localization` typecheck and targeted untracked-file
whitespace check: passed.

## Risks / Follow-up

No real candidate set, provider call, reviewer rating, analytics import,
publication, or rollout change ran. The frozen budget supports eight first-pass
strategy candidates and no repairs. Current decision remains `shadow`.

## Commit

`f29a43c` (changes uncommitted).
