# Horror Authorized Candidate Generation

## Summary

Persisted an immutable authorization bound to the exact v3 manifest, preflight,
ledger, ordered cohort, validity window, and USD/call limits. The production
seam reloads authorization, uses ledger reservation, invokes injected contract
validation, and writes only immutable strategy candidates. Runtime manifest,
preflight, ledger, and authorization now exist under `horror-evaluations/`.

## Changed Paths

- `packages/story-localization/src/horror-evaluation-rollout{,.unit.test}.ts`
- Controlled-evaluation README and plan report
- `horror-evaluations/horror-strategy-production-evaluation-v3/`

## Tests

Focused rollout: 20 passed. Story-localization typecheck and targeted whitespace
checks passed. Ledger: eight planned, zero reserved. Calls/cost: 0 / USD 0.

## Commit

`b0286bd` (current base; task changes uncommitted).

## Unresolved Risks

Authorization begins `2026-07-26T14:00:00+02:00`. Credentials exposed in
diagnostic output must be rotated before use. No provider call, candidate, or
candidate set was created; rollout remains `shadow`.
