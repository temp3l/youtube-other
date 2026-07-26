# Horror Production Candidate Adapter

## Summary

Extended the existing seeded blind-review path for production candidates.
Candidate sets are hash-bound and must match the v2 evaluation ID/hash, exact
sample, format, locale, duration band, policy, baseline/strategy versions,
candidate text hashes, and accepted final lines. Full and Short packets remain
separate; reviewer packets omit source and lineage metadata.

## Changed Paths

- `packages/story-localization/src/horror-{editorial-calibration,evaluation-rollout}.ts`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`
- Evaluation contract, audit, and required plan/run reports

## Checks

New production binding filter: 2 passed. Full rollout file: 10 passed after one
blind-field projection repair. Calibration file: 6 passed.
`@mediaforge/story-localization` typecheck and targeted `git diff --check`:
passed.

## Risks / Follow-up

No production candidate set, provider call, rating, analytics import,
publication, or rollout change ran. The USD 8 / 8-call budget permits eight
first-pass strategy candidates and no repairs. Immutable candidate/packet
persistence was added later on 2026-07-26. Current decision remains `shadow`.

## Commit

`f29a43c` (changes uncommitted).
