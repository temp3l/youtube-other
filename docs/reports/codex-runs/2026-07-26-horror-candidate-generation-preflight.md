# Horror Candidate Generation Preflight

## Summary

Added a v3 manifest-bound generation preflight for the corrected 025/028/041/051
cohort. It verifies accepted cleaned-source and canonical lineage, hashes current
Full/Short baselines, makes Short depend on paired strategy Full, fixes enforce
mode at zero retries, and caps each of eight planned calls at USD 1. The immutable
record is ready and confirms zero provider calls dispatched.

## Changed Paths

- `packages/story-localization/src/horror-evaluation-rollout.ts`
- `packages/story-localization/src/horror-evaluation-rollout.unit.test.ts`
- `docs/development/horror-controlled-evaluation/*v3*`
- Controlled-evaluation README, audit, and plan report

## Checks

Focused rollout test: 12 passed. Story-localization typecheck and targeted
whitespace check: passed.

## Risks / Follow-up

No execution adapter, provider call, candidate, rating, analytics import,
publication, or rollout change ran. Next add a mock-tested atomic call/cost
ledger before seeking explicit paid-dispatch authorization.

## Commit

`f29a43c` (changes uncommitted).
