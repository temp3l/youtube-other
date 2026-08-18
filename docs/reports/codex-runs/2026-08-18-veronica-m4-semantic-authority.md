# Veronica M4 semantic authority run

## Summary

Implemented a bounded, strict-schema OpenAI Responses adapter; versioned semantic contract; fingerprint/cache; authority precedence; deterministic validator; cost admission/ledger; 18-case diagnostic corpus; experiment runner; ADR; and review-pack generator. No canonical plan integration occurred.

The live run made 16 admitted requests, returned no structured outputs or usage, and used no retries. Its ledger recorded $0.781405, but final audit found that estimator underconservative; the corrected one-attempt maximum is $0.959170 and the full two-attempt envelope $1.918340, below budget. Duplicate source/package module instances also lost provider error metadata and prevented first-error fail-fast. Both defects are repaired and tested; no second paid run was made. Final status: `BLOCKED_IMPLEMENTATION_REGRESSION`; hypothesis inconclusive.

## Changed paths

M4 files under `apps/cli/src`, `packages/strategic-reinvention/src`, `experiments/veronica-m4`, `scripts`, `docs/architecture`, `docs/decisions`, `docs/reports/codex-runs`, and `artifacts/veronica-m4-semantic-authority`.

## Tests/checks

Focused Vitest: PASS (38, then 13 after repair). Strategic build: PASS. Strategic/CLI typecheck: PASS. Scoped ESLint: PASS. Dry preflight: PASS. Live semantic evaluation: BLOCKED before output. Retained/Tier-1: NOT_RUN because integration gate failed.

## Commit and risks

No commit created; HEAD `492543be534da6bf004d6089e174fbb2d21b86cc`. Provider rejection cause and semantic efficacy remain unknown; live cache replay is unmeasured.
