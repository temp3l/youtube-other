# Veronica 01A stale-dist QA runtime repair

## State

`SAFE_FOR_SECOND_01A_PAID_QA_CANARY`

## Root cause and runtime contract

`pnpm mediaforge -- veronica-media source-grounded-qa …` ran `apps/cli/bin/mediaforge.js` → `apps/cli/dist/index.js` → workspace export `packages/strategic-reinvention/dist/index.js`. The latter contained the historic plan-writing adapter, so source tests missed `PACKAGE_EXPORTS_RESOLVE_STALE_DIST`. QA is now `VERIFIED_BUILT_MODE`: the wrapper verifies content fingerprints for both packages before loading either dist graph; a missing/stale fingerprint exits before dispatch.

## Recovery and admission

Stale code wrote only QA/readiness metadata and its stale hash after both new judgments. The current finalizer rehashed that immutable body: file `afbbb21f9ff45de21a9e4d3b4f7d0586e8692e2b24b6d414f28cf1bb42dd8779`; plan/body `18db5c91e5c034ae73c0883ba3b78cae17e44f2dacc6dcea35849af659df4312` (YES). Source/WAV/timing/beat/projection/revision stayed `4e82…7503`/`2dfc…0622`/`67e2…bb2`/`e410…7b92`/`bd29…0c1e`/`77fa…30e6`. Old admission `87b5…fcbe` was deleted; new admission is `7272f5c88d1bc37f5e903a3b36dbbc4211e3c0d9bd52b2f616a544168c0747b4`.

## Verification

Wrapper regression, source-grounded QA (47), semantic gate (55), and composition (5) passed. Strategic typecheck, targeted ESLint, and `git diff --check` passed. Real CLI cache-only dry run: planner/finalizer/deterministic writes/admission refresh/provider calls all 0; 23 safe cache hits. All old/new mini and Terra judgments are `SAFE_IDENTITY_MATCH`; sequence REVIEW is cached, human-review-required, and keeps QA BLOCKED. Short policy: 6 requests/$0.40/60k/20k; provider-request budget. External calls: all 0; cost $0.

`NEXT GATE: SECOND_01A_PAID_QA_CANARY` — authorization required; do not run automatically.
