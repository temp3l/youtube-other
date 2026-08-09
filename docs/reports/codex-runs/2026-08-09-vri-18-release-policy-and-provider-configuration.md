# VRI-18 release policy and provider configuration

- Date: 2026-08-09

## Changed files

- `packages/config/src/execution-policy.ts` and exports add strict versioned execution/run-policy contracts, canonical profile normalization, stable policy fingerprints, secret-redaction, budget reservation requirements, and a hard Veronica provider-dispatch prohibition.
- `packages/application/src/release-gates.ts` records revision-bound run-policy artifacts and fails closed on missing preflight, approvals, invalid provenance, budget overrun, or missing/insufficient reservations.
- `packages/strategic-reinvention/src/release-policy.ts` supplies the canonical disabled-provider Veronica adapter.

## Tests/checks run

- `pnpm test:focused -- packages/config/src/execution-policy.unit.test.ts` — passed (2 tests).
- `pnpm --filter @mediaforge/config build` — passed.
- `pnpm test:focused -- packages/application/src/release-gates.unit.test.ts` — passed (3 tests).

## Risks remaining

No external provider was activated or dispatched. Runtime callers still need to persist the returned artifact through the durable workflow path (owned by later orchestration/API tasks).

## Follow-up tasks

VRI-19 should expose this same shared release-policy service through the API/CLI seam.
